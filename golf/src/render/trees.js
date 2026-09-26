// Detailed low-poly trees. Each species has three variants built from a
// seeded random generator (so every course looks the same each visit), with
// foliage shaded darker underneath and brighter on top, and a vertex-shader
// sway that follows the wind. Drawn with InstancedMesh: a few draw calls for
// hundreds of trees.
import * as THREE from '../../vendor/three.module.min.js';
import { RNG } from '../util/rng.js';

const UP = new THREE.Vector3(0, 1, 0);

// Paint a geometry with a color, shaded by height between y0 and y1
function paint(geo, hex, { y0 = null, y1 = null, lo = 0.72, hi = 1.12, jitter = 0.06, rng = null } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const pos = g.attributes.position;
  const n = pos.count;
  const arr = new Float32Array(n * 3);
  let minY = Infinity, maxY = -Infinity;
  if (y0 === null) {
    for (let i = 0; i < n; i++) { minY = Math.min(minY, pos.getY(i)); maxY = Math.max(maxY, pos.getY(i)); }
  } else { minY = y0; maxY = y1; }
  const r = rng || new RNG(n);
  for (let i = 0; i < n; i += 3) {
    // one jitter per triangle keeps the faceted low-poly look
    const j = 1 + (r.next() - 0.5) * 2 * jitter;
    for (let k = 0; k < 3 && i + k < n; k++) {
      const y = pos.getY(i + k);
      const t = maxY > minY ? Math.min(1, Math.max(0, (y - minY) / (maxY - minY))) : 1;
      const v = (lo + (hi - lo) * t) * j;
      arr[(i + k) * 3] = c.r * v; arr[(i + k) * 3 + 1] = c.g * v; arr[(i + k) * 3 + 2] = c.b * v;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

export function mergeGeos(geos) {
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    if (!g.attributes.normal) g.computeVertexNormals();
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.color) col.set(g.attributes.color.array, o * 3);
    o += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

// A tapered cylinder from point a to point b
function cylBetween(a, b, r0, r1, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a);
  const L = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, L, seg, 1);
  g.translate(0, L / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}

function blob(r, x, y, z, sx = 1, sy = 1, sz = 1, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ species
function oak(rng) {
  const bark = '#5a4331';
  const leaf = rng.pick(['#3f6f2e', '#46772f', '#3a6a2c']);
  const parts = [];
  const trunkTop = V(rng.float(-0.3, 0.3), 4.2, rng.float(-0.3, 0.3));
  parts.push(paint(cylBetween(V(0, -0.3, 0), trunkTop, 0.55, 0.36, 8), bark, { lo: 0.75, hi: 1.05, rng }));
  // flared roots
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rng.float(0, 1);
    parts.push(paint(cylBetween(V(0, 0.6, 0), V(Math.cos(a) * 0.9, -0.1, Math.sin(a) * 0.9), 0.22, 0.08, 5), bark, { rng }));
  }
  const blobs = [];
  const n = rng.int(7, 10);
  for (let i = 0; i < n; i++) {
    const a = rng.float(0, Math.PI * 2);
    const rr = rng.float(0.5, 3.8);
    const y = rng.float(6.2, 10.2);
    blobs.push([Math.cos(a) * rr, y, Math.sin(a) * rr, rng.float(2.0, 3.3)]);
  }
  blobs.push([0, 8.4, 0, 3.6]);
  for (const [x, y, z, r] of blobs) {
    // visible limbs reaching into the canopy
    if (r < 3.5 && rng.chance(0.7)) parts.push(paint(cylBetween(trunkTop, V(x * 0.7, y - r * 0.6, z * 0.7), 0.2, 0.07, 5), bark, { rng }));
  }
  for (const [x, y, z, r] of blobs) {
    parts.push(paint(blob(r, x, y, z, 1, rng.float(0.8, 0.95), 1), leaf, { y0: 4.8, y1: 12, lo: 0.6, hi: 1.18, jitter: 0.08, rng }));
  }
  return mergeGeos(parts);
}

function pine(rng) {
  const bark = '#5b4330';
  const needle = rng.pick(['#2f5a2c', '#2b5429', '#34612f']);
  const parts = [paint(cylBetween(V(0, -0.3, 0), V(0, 13.5, 0), 0.34, 0.08, 7), bark, { rng })];
  const tiers = rng.int(6, 8);
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const r = 3.9 * (1 - t * 0.78) * rng.float(0.9, 1.08);
    const y = 3.2 + t * 10.6;
    const h = 2.6 - t * 0.8;
    const g = new THREE.ConeGeometry(r, h, rng.int(7, 9), 1);
    g.rotateY(rng.float(0, 1));
    g.translate(rng.float(-0.15, 0.15), y + h / 2, rng.float(-0.15, 0.15));
    parts.push(paint(g, needle, { y0: 2.5, y1: 16, lo: 0.62, hi: 1.12, jitter: 0.07, rng }));
  }
  const tip = new THREE.ConeGeometry(0.5, 1.6, 6);
  tip.translate(0, 15.2, 0);
  parts.push(paint(tip, needle, { lo: 1.05, hi: 1.15, rng }));
  return mergeGeos(parts);
}

function birch(rng) {
  const parts = [];
  const lean = V(rng.float(-0.5, 0.5), 7.5, rng.float(-0.5, 0.5));
  // white bark with dark marks: alternate short segments
  const segs = 7;
  for (let i = 0; i < segs; i++) {
    const a = new THREE.Vector3().lerpVectors(V(0, -0.2, 0), lean, i / segs);
    const b = new THREE.Vector3().lerpVectors(V(0, -0.2, 0), lean, (i + 1) / segs);
    const r0 = 0.2 * (1 - i / segs) + 0.06, r1 = 0.2 * (1 - (i + 1) / segs) + 0.06;
    parts.push(paint(cylBetween(a, b, r0, r1, 6), i % 2 ? '#e9e5da' : '#d8d3c6', { rng, jitter: 0.12 }));
  }
  const leaf = rng.pick(['#6f9a3c', '#7aa543', '#86ad4a']);
  for (let i = 0; i < 5; i++) {
    parts.push(paint(blob(rng.float(1.2, 1.9), lean.x * 0.8 + rng.float(-1.2, 1.2), rng.float(6.2, 10), lean.z * 0.8 + rng.float(-1.2, 1.2), 1, 1.35, 1), leaf, { y0: 5, y1: 11.5, lo: 0.65, hi: 1.15, jitter: 0.09, rng }));
  }
  return mergeGeos(parts);
}

function cypress(rng) {
  const bark = '#4d3a2a';
  const leaf = '#2d4f2a';
  const parts = [];
  const top = V(rng.float(1, 2.5), 5.5, rng.float(-0.8, 0.8));
  parts.push(paint(cylBetween(V(0, -0.3, 0), top, 0.42, 0.22, 7), bark, { rng }));
  parts.push(paint(cylBetween(top, V(top.x + 2.5, 7.2, top.z + 1), 0.2, 0.08, 5), bark, { rng }));
  parts.push(paint(cylBetween(top, V(top.x - 2.2, 7.6, top.z - 0.6), 0.2, 0.08, 5), bark, { rng }));
  // flat, wind-sculpted pads
  for (let i = 0; i < 7; i++) {
    const g = blob(rng.float(1.8, 2.8), top.x + rng.float(-3.2, 3.6), rng.float(6.2, 9), top.z + rng.float(-2, 2), 1.4, 0.55, 1.1);
    parts.push(paint(g, leaf, { y0: 5.5, y1: 10, lo: 0.6, hi: 1.15, jitter: 0.08, rng }));
  }
  return mergeGeos(parts);
}

function palm(rng) {
  const parts = [];
  const H = 9.5;
  const bend = rng.float(0.6, 2.0);
  const segs = 10;
  let prev = V(0, -0.2, 0);
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const p = V(bend * t * t, H * t, 0);
    parts.push(paint(cylBetween(prev, p, 0.24 - 0.08 * (i / segs), 0.22 - 0.08 * (i / segs), 7), i % 2 ? '#8a7456' : '#7a654a', { rng, jitter: 0.05 }));
    prev = p;
  }
  const crown = prev;
  // drooping fronds: tapered strips with a V-fold
  const nf = rng.int(10, 13);
  for (let f = 0; f < nf; f++) {
    const ang = (f / nf) * Math.PI * 2 + rng.float(-0.2, 0.2);
    const L = rng.float(3.6, 4.6);
    const droop = rng.float(1.4, 2.6);
    const rise = rng.float(0.2, 0.9);
    const pos = [];
    const N = 8;
    const pt = (t, side) => {
      const w = 0.62 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - t * 0.35);
      const x = L * t;
      const y = rise * t - droop * t * t;
      return [x, y - Math.abs(side) * 0.12, side * w];
    };
    for (let k = 0; k < N; k++) {
      const t0 = k / N, t1 = (k + 1) / N;
      const c0 = pt(t0, 0), c1 = pt(t1, 0);
      for (const side of [-1, 1]) {
        const e0 = pt(t0, side), e1 = pt(t1, side);
        pos.push(...c0, ...e0, ...c1, ...c1, ...e0, ...e1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    // make both sides light the same (fronds are seen from below and above)
    const nr = g.attributes.normal.array;
    for (let i = 0; i < nr.length; i += 3) { if (nr[i + 1] < 0) { nr[i] = -nr[i]; nr[i + 1] = -nr[i + 1]; nr[i + 2] = -nr[i + 2]; } }
    g.rotateY(ang);
    g.translate(crown.x, crown.y, crown.z);
    parts.push(paint(g, rng.pick(['#4f8a33', '#3f7a2a', '#5a9438']), { y0: crown.y - 3, y1: crown.y + 1, lo: 0.7, hi: 1.12, jitter: 0.1, rng }));
  }
  for (let i = 0; i < 4; i++) {
    const a = rng.float(0, 6.28);
    parts.push(paint(blob(0.2, crown.x + Math.cos(a) * 0.3, crown.y - 0.35, crown.z + Math.sin(a) * 0.3, 1, 1, 1, 0), '#6b5a2e', { rng }));
  }
  return mergeGeos(parts);
}

function cactus(rng) {
  const green = rng.pick(['#4f7a3a', '#557f3d', '#4a7336']);
  const parts = [];
  const H = rng.float(4.2, 5.5);
  const ribbed = (r, h) => {
    const g = new THREE.CylinderGeometry(r, r * 1.08, h, 12, 1);
    // pinch alternate vertices for ribs
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + 0.08 * Math.cos(a * 12);
      p.setX(i, x * k); p.setZ(i, z * k);
    }
    g.computeVertexNormals();
    return g;
  };
  const body = ribbed(0.32, H);
  body.translate(0, H / 2, 0);
  parts.push(paint(body, green, { lo: 0.8, hi: 1.05, rng }));
  parts.push(paint(T(new THREE.SphereGeometry(0.33, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0, H, 0), green, { rng }));
  const arms = rng.int(1, 3);
  for (let i = 0; i < arms; i++) {
    const side = i % 2 ? -1 : 1;
    const a = rng.float(-0.4, 0.4) + (side > 0 ? 0 : Math.PI);
    const y = rng.float(1.8, 3.2);
    const out = rng.float(0.8, 1.1);
    const up = rng.float(1.2, 2.0);
    const dx = Math.cos(a), dz = Math.sin(a);
    parts.push(paint(cylBetween(V(0, y, 0), V(dx * out, y + 0.15, dz * out), 0.2, 0.2, 10), green, { rng }));
    const up1 = ribbed(0.2, up);
    up1.translate(dx * out, y + 0.1 + up / 2, dz * out);
    parts.push(paint(up1, green, { lo: 0.8, hi: 1.05, rng }));
    parts.push(paint(T(new THREE.SphereGeometry(0.2, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), dx * out, y + 0.1 + up, dz * out), green, { rng }));
  }
  return mergeGeos(parts);
}

function bush(rng) {
  const leaf = rng.pick(['#4b6f33', '#56793a', '#44672f']);
  const parts = [];
  for (let i = 0; i < rng.int(3, 5); i++) {
    parts.push(paint(blob(rng.float(0.8, 1.3), rng.float(-0.9, 0.9), rng.float(0.7, 1.4), rng.float(-0.9, 0.9), 1, 0.8, 1), leaf, { y0: 0, y1: 2.4, lo: 0.62, hi: 1.12, jitter: 0.09, rng }));
  }
  return mergeGeos(parts);
}

function T(g, x, y, z) { g.translate(x, y, z); return g; }

const BUILDERS = { oak, pine, birch, cypress, palm, cactus, bush };
const GEO_CACHE = {};
export function kindGeo(kind, variant = 0) {
  const k = `${kind}:${variant}`;
  if (!GEO_CACHE[k]) {
    const b = BUILDERS[kind] || bush;
    GEO_CACHE[k] = b(new RNG(1000 + variant * 7919 + kind.length * 31));
  }
  return GEO_CACHE[k];
}

// Wind sway shared by every tree material
export const TREE_UNIFORMS = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(0.3, 0) } };

function treeMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = TREE_UNIFORMS.uTime;
    sh.uniforms.uWind = TREE_UNIFORMS.uWind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec2 uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
          vec2 ip = instanceMatrix[3].xz;
          #else
          vec2 ip = vec2(0.0);
          #endif
          float h = max(transformed.y, 0.0) / 12.0;
          float k = h * h;
          float ph = ip.x * 0.37 + ip.y * 0.21;
          float s = sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.9 + ph * 1.7) * 0.25;
          float str = 0.06 + length(uWind) * 0.035;
          transformed.xz += (normalize(uWind + vec2(0.0001)) * (0.5 + 0.5 * s) + vec2(s, -s) * 0.3) * str * k * 1.2;
        }`);
  };
  m.customProgramCacheKey = () => 'tree-sway-v1';
  return m;
}

// trees: [{x,y,z,kind,sc,lean,leanDir}] -> Group of InstancedMeshes (3 variants per species)
export function buildTrees(trees, { shadows = true } = {}) {
  const group = new THREE.Group();
  const byKey = {};
  for (const t of trees) {
    const v = Math.abs(Math.floor(t.x * 7.13 + t.z * 3.71)) % 3;
    (byKey[`${t.kind}:${v}`] ||= { kind: t.kind, v, list: [] }).list.push(t);
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  const mat = treeMaterial();
  for (const { kind, v, list } of Object.values(byKey)) {
    const mesh = new THREE.InstancedMesh(kindGeo(kind, v), mat, list.length);
    list.forEach((t, i) => {
      const k = t.sc || 1;
      const yaw = (((t.x * 13.7 + t.z * 7.3) % 6.28) + 6.28) % 6.28;
      e.set(t.lean ? Math.cos(t.leanDir) * t.lean * 0.3 : 0, yaw, t.lean ? Math.sin(t.leanDir) * t.lean * 0.3 : 0);
      q.setFromEuler(e);
      s.set(k, k * (0.93 + (((t.x * 3.1) % 0.14) + 0.14) % 0.14), k);
      p.set(t.x, t.y - 0.1, t.z);
      m4.compose(p, q, s);
      mesh.setMatrixAt(i, m4);
      const vv = 0.86 + ((((t.x * 0.37 + t.z * 0.61) % 1) + 1) % 1) * 0.26;
      c.setRGB(vv, vv * (0.97 + 0.06 * ((((t.z * 0.13) % 1) + 1) % 1)), vv * 0.95);
      mesh.setColorAt(i, c);
    });
    mesh.castShadow = shadows;
    mesh.receiveShadow = false;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return group;
}
