import * as THREE from 'three';
import { G } from '../core/G.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Procedural humanoid rig. Poses are flat Float32Arrays of joint eulers so
// they blend cheaply; animations are functions that write poses.
// Character faces +Z. Left side is +X. Limb swing forward = negative X.
// ---------------------------------------------------------------------------
export const J = ['hips', 'spine', 'chest', 'neck', 'head', 'shL', 'armL', 'foreL', 'handL', 'shR', 'armR', 'foreR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
export const JI = Object.fromEntries(J.map((n, i) => [n, i]));
export const POSE_LEN = J.length * 3 + 3; // + hips offset xyz
const OFF = J.length * 3;

export function newPose() {
  return new Float32Array(POSE_LEN);
}
export function setJ(p, name, x, y, z) {
  const i = JI[name] * 3;
  p[i] = x; p[i + 1] = y; p[i + 2] = z;
}
export function addJ(p, name, x, y, z) {
  const i = JI[name] * 3;
  p[i] += x; p[i + 1] += y; p[i + 2] += z;
}
export function setOff(p, x, y, z) {
  p[OFF] = x; p[OFF + 1] = y; p[OFF + 2] = z;
}
export function blendPose(out, a, b, t) {
  for (let i = 0; i < POSE_LEN; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}
const UPPER = ['spine', 'chest', 'neck', 'head', 'shL', 'armL', 'foreL', 'handL', 'shR', 'armR', 'foreR', 'handR'].map((n) => JI[n]);
const ARMS_R = ['shR', 'armR', 'foreR', 'handR'].map((n) => JI[n]);
export function blendUpper(out, b, t, armsOnly) {
  const list = armsOnly ? ARMS_R : UPPER;
  for (const j of list) {
    const i = j * 3;
    out[i] += (b[i] - out[i]) * t;
    out[i + 1] += (b[i + 1] - out[i + 1]) * t;
    out[i + 2] += (b[i + 2] - out[i + 2]) * t;
  }
  return out;
}

// Keyframed clip from sparse pose dictionaries.
export function makeClip(base, keys) {
  // keys: [{t, pose:{joint:[x,y,z]}, off:[x,y,z]}]
  const frames = keys.map((k) => {
    const p = new Float32Array(base);
    for (const n in k.pose) {
      const i = JI[n] * 3;
      p[i] = k.pose[n][0]; p[i + 1] = k.pose[n][1]; p[i + 2] = k.pose[n][2];
    }
    if (k.off) { p[OFF] = k.off[0]; p[OFF + 1] = k.off[1]; p[OFF + 2] = k.off[2]; }
    return { t: k.t, p, ease: k.ease || 'smooth' };
  });
  return {
    duration: frames[frames.length - 1].t,
    sample(t, out) {
      if (t <= frames[0].t) return out.set(frames[0].p), out;
      for (let i = 0; i < frames.length - 1; i++) {
        const a = frames[i], b = frames[i + 1];
        if (t <= b.t) {
          let u = (t - a.t) / (b.t - a.t);
          if (b.ease === 'smooth') u = u * u * (3 - 2 * u);
          else if (b.ease === 'out') u = 1 - (1 - u) * (1 - u) * (1 - u);
          else if (b.ease === 'in') u = u * u * u;
          return blendPose(out, a.p, b.p, u);
        }
      }
      out.set(frames[frames.length - 1].p);
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// Materials (cached by key so crowds share programs)
// ---------------------------------------------------------------------------
const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!opts.unique && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: opts.rough ?? 0.75,
    metalness: opts.metal ?? 0,
    emissive: new THREE.Color(opts.emissive || 0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    map: opts.map || null,
    normalMap: opts.normalMap || null,
    side: opts.side || THREE.FrontSide,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    depthWrite: opts.depthWrite ?? true,
    envMapIntensity: opts.env ?? 1,
  });
  if (opts.normalMap) m.normalScale = new THREE.Vector2(0.6, 0.6);
  if (!opts.unique) matCache.set(key, m);
  return m;
}

function capsule(r, len, seg = 8) {
  const g = new THREE.CapsuleGeometry(r, len, 4, seg);
  return g;
}
function limb(r0, r1, len, seg = 8) {
  // tapered limb hanging along -Y from origin
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 3);
  g.translate(0, -len / 2, 0);
  const top = new THREE.SphereGeometry(r0, seg, 6);
  const bot = new THREE.SphereGeometry(r1, seg, 6);
  bot.translate(0, -len, 0);
  for (const x of [g, top, bot]) {
    x.deleteAttribute('uv');
  }
  return mergeGeometries([g.toNonIndexed(), top.toNonIndexed(), bot.toNonIndexed()]);
}

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------
export function makeSword(opts = {}) {
  const g = new THREE.Group();
  const len = opts.length || 1.0;
  const w = opts.width || 0.07;
  // blade: flattened diamond cross-section, tapering to a point
  const shape = new THREE.BufferGeometry();
  const verts = [];
  const segs = 6;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const ww = (i === segs ? 0 : w * (1 - t * 0.35)) * (opts.curve ? 1 - t * 0.2 : 1);
    const y = t * len + (i === segs ? w * 1.4 : 0);
    const off = opts.curve ? Math.sin(t * 1.4) * 0.06 : 0;
    verts.push([ww + off, y, 0], [off, y, ww * 0.18], [-ww + off, y, 0], [off, y, -ww * 0.18]);
  }
  const pos = [];
  for (let i = 0; i < segs; i++) {
    const a = verts.slice(i * 4, i * 4 + 4), b = verts.slice(i * 4 + 4, i * 4 + 8);
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      pos.push(...a[k], ...b[k], ...a[k2], ...a[k2], ...b[k], ...b[k2]);
    }
  }
  shape.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  shape.computeVertexNormals();
  const bladeMat = new THREE.MeshStandardMaterial({ color: opts.bladeColor || 0xd9dee6, metalness: 1, roughness: 0.22, emissive: new THREE.Color(0), envMapIntensity: 1.6 });
  const blade = new THREE.Mesh(shape, bladeMat);
  blade.position.y = 0.12;
  g.add(blade);
  // fuller glow strip
  const glowGeo = new THREE.PlaneGeometry(w * 0.35, len * 0.82);
  glowGeo.translate(0, len * 0.42 + 0.12, 0);
  const glowMat = new THREE.MeshBasicMaterial({ color: opts.glow || 0x66ccff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  g.add(glow);
  const guardMat = new THREE.MeshStandardMaterial({ color: opts.guardColor || 0xc9a24a, metalness: 1, roughness: 0.35 });
  const guard = new THREE.Mesh(new THREE.BoxGeometry(w * 4.2, 0.035, 0.05), guardMat);
  guard.position.y = 0.11;
  g.add(guard);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.9 }));
  g.add(grip);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), guardMat);
  pommel.position.y = -0.11;
  g.add(pommel);
  g.userData = { blade, bladeMat, glowMat, length: len + 0.12, tipLocal: new THREE.Vector3(0, len + 0.2, 0), baseLocal: new THREE.Vector3(0, 0.15, 0) };
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function makeStaff(color = 0x6b4a2a, gem = 0x66ddff) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 1.6, 7), mat(color, { rough: 0.8 }));
  shaft.position.y = 0.4;
  g.add(shaft);
  const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), mat(gem, { emissive: gem, emissiveIntensity: 2.5, rough: 0.2 }));
  head.position.y = 1.28;
  g.add(head);
  g.userData = { tipLocal: new THREE.Vector3(0, 1.28, 0), baseLocal: new THREE.Vector3(0, 0, 0), length: 1.3 };
  return g;
}

function makeClub(color = 0x5a4030) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.03, 0.9, 7), mat(color, { rough: 0.9 }));
  m.position.y = 0.4;
  g.add(m);
  g.userData = { tipLocal: new THREE.Vector3(0, 0.85, 0), baseLocal: new THREE.Vector3(0, 0.1, 0), length: 0.9 };
  return g;
}

function makeGreatsword(color = 0xd8c48a, glow = 0xffcc66) {
  const s = makeSword({ length: 2.0, width: 0.16, bladeColor: color, guardColor: 0xb8902a, glow });
  return s;
}

// ---------------------------------------------------------------------------
// Cloth cape (verlet)
// ---------------------------------------------------------------------------
class Cape {
  constructor(rig, color, opts = {}) {
    this.rig = rig;
    this.W = 5;
    this.H = 8;
    this.width = opts.width || 0.42;
    this.length = opts.length || 0.95;
    const n = this.W * this.H;
    this.p = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.geo = new THREE.PlaneGeometry(1, 1, this.W - 1, this.H - 1);
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide, map: G.tex ? G.tex.cloth.map : null, normalMap: G.tex ? G.tex.cloth.normalMap : null });
    if (opts.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = 0.4; }
    this.mesh = new THREE.Mesh(this.geo, m);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.anchorsLocal = [];
    for (let i = 0; i < this.W; i++) {
      const t = i / (this.W - 1);
      this.anchorsLocal.push(new THREE.Vector3((t - 0.5) * this.width, 0.2, -0.13 * rig.s));
    }
    this.inited = false;
    this.tmp = new THREE.Vector3();
    this.segLen = this.length / (this.H - 1);
    this.colW = this.width / (this.W - 1);
  }
  reset() {
    const chest = this.rig.j.chest;
    chest.updateWorldMatrix(true, false);
    for (let r = 0; r < this.H; r++)
      for (let c = 0; c < this.W; c++) {
        const i = (r * this.W + c) * 3;
        this.tmp.copy(this.anchorsLocal[c]);
        this.tmp.y -= r * this.segLen;
        this.tmp.z -= 0.02 * r;
        chest.localToWorld(this.tmp);
        this.p[i] = this.prev[i] = this.tmp.x;
        this.p[i + 1] = this.prev[i + 1] = this.tmp.y;
        this.p[i + 2] = this.prev[i + 2] = this.tmp.z;
      }
    this.inited = true;
  }
  update(dt, wind, extraLift = 0) {
    if (!this.inited) this.reset();
    dt = Math.min(dt, 1 / 30);
    const chest = this.rig.j.chest;
    const hips = this.rig.j.hips;
    chest.updateWorldMatrix(true, false);
    const P = this.p, Q = this.prev, W = this.W, H = this.H;
    const g = -9.8 * dt * dt;
    const damp = 0.97;
    const wx = wind.x * dt * dt * 4, wz = wind.y * dt * dt * 4;
    const lift = extraLift * dt * dt;
    for (let r = 1; r < H; r++)
      for (let c = 0; c < W; c++) {
        const i = (r * W + c) * 3;
        const x = P[i], y = P[i + 1], z = P[i + 2];
        const flutter = Math.sin(G.time * 9 + r * 0.9 + c * 1.3) * 0.0006 * (1 + extraLift * 0.05);
        P[i] += (x - Q[i]) * damp + wx + flutter;
        P[i + 1] += (y - Q[i + 1]) * damp + g + lift;
        P[i + 2] += (z - Q[i + 2]) * damp + wz + flutter;
        Q[i] = x; Q[i + 1] = y; Q[i + 2] = z;
      }
    // pin top row
    for (let c = 0; c < W; c++) {
      this.tmp.copy(this.anchorsLocal[c]);
      chest.localToWorld(this.tmp);
      const i = c * 3;
      P[i] = Q[i] = this.tmp.x; P[i + 1] = Q[i + 1] = this.tmp.y; P[i + 2] = Q[i + 2] = this.tmp.z;
    }
    // body collider: sphere around torso + hips, in world
    const cs = this.tmp.set(0, 0.05, 0.02);
    chest.localToWorld(cs);
    const bx = cs.x, by = cs.y, bz = cs.z;
    const hp = new THREE.Vector3(0, -0.05, 0);
    hips.localToWorld(hp);
    const rad = 0.21 * this.rig.s;
    const ground = this.rig.groundY !== undefined ? this.rig.groundY + 0.03 : -1e9;
    for (let it = 0; it < 3; it++) {
      // structural constraints
      for (let r = 0; r < H; r++)
        for (let c = 0; c < W; c++) {
          const i = (r * W + c) * 3;
          if (r > 0) this._con(i, ((r - 1) * W + c) * 3, this.segLen, r - 1 === 0);
          if (c > 0) this._con(i, (r * W + c - 1) * 3, this.colW, r === 0);
          if (r > 1) this._con(i, ((r - 2) * W + c) * 3, this.segLen * 2, false);
        }
      for (let r = 1; r < H; r++)
        for (let c = 0; c < W; c++) {
          const i = (r * W + c) * 3;
          for (const [sx, sy, sz, rr] of [[bx, by, bz, rad], [hp.x, hp.y, hp.z, rad * 0.95]]) {
            const dx = P[i] - sx, dy = P[i + 1] - sy, dz = P[i + 2] - sz;
            const d = Math.hypot(dx, dy, dz);
            if (d < rr && d > 1e-5) {
              const k = rr / d;
              P[i] = sx + dx * k; P[i + 1] = sy + dy * k; P[i + 2] = sz + dz * k;
            }
          }
          if (P[i + 1] < ground) P[i + 1] = ground;
        }
    }
    const pos = this.geo.attributes.position;
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
        const i = (r * W + c) * 3;
        pos.setXYZ(r * W + c, P[i], P[i + 1], P[i + 2]);
      }
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }
  _con(i, j, len, pinnedJ) {
    const P = this.p;
    const dx = P[i] - P[j], dy = P[i + 1] - P[j + 1], dz = P[i + 2] - P[j + 2];
    const d = Math.hypot(dx, dy, dz) || 1e-6;
    const diff = (d - len) / d;
    if (pinnedJ) {
      P[i] -= dx * diff; P[i + 1] -= dy * diff; P[i + 2] -= dz * diff;
    } else {
      const h = diff * 0.5;
      P[i] -= dx * h; P[i + 1] -= dy * h; P[i + 2] -= dz * h;
      P[j] += dx * h; P[j + 1] += dy * h; P[j + 2] += dz * h;
    }
  }
}

// ---------------------------------------------------------------------------
// Rig builder
// ---------------------------------------------------------------------------
export const PRESETS = {
  hero: { skin: 0xe2b393, cloth: 0x2c3b6e, cloth2: 0x8a6a3c, leather: 0x4a3324, metal: 0xc8b07a, hair: 0x3b2516, cape: 0x7a1f2b, eyes: 0x1a1410 },
};

export class Rig {
  constructor(opts = {}) {
    this.opts = opts;
    const s = (this.s = opts.scale || 1);
    const c = { ...PRESETS.hero, ...(opts.colors || {}) };
    this.colors = c;
    const build = opts.build || 'hero';
    this.build = build;
    const bulk = opts.bulk || (build === 'golem' ? 1.7 : build === 'knight' ? 1.25 : build === 'husk' ? 0.9 : 1);
    const unique = !!opts.uniqueMats;
    this.root = new THREE.Group();
    this.root.name = opts.name || 'rig';
    this.body = new THREE.Group(); // pitch/roll for rolls, climbing
    this.root.add(this.body);
    const j = (this.j = {});
    const mk = (name, parent, x, y, z) => {
      const g = new THREE.Group();
      g.name = name;
      g.position.set(x * s, y * s, z * s);
      parent.add(g);
      j[name] = g;
      return g;
    };
    const hipY = 0.95;
    mk('hips', this.body, 0, hipY, 0);
    mk('spine', j.hips, 0, 0.08, 0);
    mk('chest', j.spine, 0, 0.22, 0);
    mk('neck', j.chest, 0, 0.27, 0);
    mk('head', j.neck, 0, 0.08, 0);
    mk('shL', j.chest, 0.17 * bulk, 0.2, 0);
    mk('armL', j.shL, 0.04, 0, 0);
    mk('foreL', j.armL, 0, -0.29, 0);
    mk('handL', j.foreL, 0, -0.26, 0);
    mk('shR', j.chest, -0.17 * bulk, 0.2, 0);
    mk('armR', j.shR, -0.04, 0, 0);
    mk('foreR', j.armR, 0, -0.29, 0);
    mk('handR', j.foreR, 0, -0.26, 0);
    mk('thighL', j.hips, 0.1, -0.04, 0);
    mk('shinL', j.thighL, 0, -0.45, 0);
    mk('footL', j.shinL, 0, -0.44, 0);
    mk('thighR', j.hips, -0.1, -0.04, 0);
    mk('shinR', j.thighR, 0, -0.45, 0);
    mk('footR', j.shinR, 0, -0.44, 0);

    const M = (col, o = {}) => mat(col, { ...o, unique });
    const skin = M(c.skin, { rough: 0.6 });
    const cloth = M(c.cloth, { rough: 0.85, map: G.tex?.cloth.map });
    const cloth2 = M(c.cloth2, { rough: 0.85, map: G.tex?.cloth.map });
    const leather = M(c.leather, { rough: 0.7 });
    const metal = M(c.metal, { rough: 0.35, metal: 1, map: G.tex?.metal.map });
    const hair = M(c.hair, { rough: 0.9 });
    this.materials = [skin, cloth, cloth2, leather, metal, hair];
    const add = (parent, geo, m, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x * s, y * s, z * s);
      mesh.scale.set(sx * s, sy * s, sz * s);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      parent.add(mesh);
      return mesh;
    };
    const B = bulk;
    // torso
    add(j.hips, capsule(0.14, 0.08), cloth2, 0, 0.0, 0, 1.15 * B, 0.9, 0.85 * B);
    add(j.spine, capsule(0.13, 0.12), cloth, 0, 0.1, 0, 1.05 * B, 1, 0.8 * B);
    const chestMesh = add(j.chest, capsule(0.16, 0.14), cloth, 0, 0.12, 0, 1.15 * B, 1, 0.82 * B);
    void chestMesh;
    // belt
    add(j.hips, new THREE.TorusGeometry(0.135, 0.025, 6, 16), leather, 0, 0.06, 0, 1.15 * B, 0.85 * B, 1).rotation.x = Math.PI / 2;
    add(j.neck, capsule(0.05, 0.06), skin, 0, 0.02, 0);
    // head
    const headGeo = new THREE.SphereGeometry(0.115, 16, 12);
    const head = add(j.head, headGeo, skin, 0, 0.1, 0.0, 0.92, 1.05, 1);
    this.headMesh = head;
    if (build !== 'golem' && build !== 'wraith') {
      const eyeM = opts.glowEyes ? M(opts.glowEyes, { emissive: opts.glowEyes, emissiveIntensity: 4 }) : M(c.eyes, { rough: 0.3 });
      add(j.head, new THREE.SphereGeometry(0.018, 8, 6), eyeM, 0.042, 0.115, 0.098);
      add(j.head, new THREE.SphereGeometry(0.018, 8, 6), eyeM, -0.042, 0.115, 0.098);
      add(j.head, new THREE.ConeGeometry(0.018, 0.04, 6), skin, 0, 0.085, 0.112).rotation.x = Math.PI / 2;
    } else {
      const eyeM = M(opts.glowEyes || 0xff6622, { emissive: opts.glowEyes || 0xff6622, emissiveIntensity: 5 });
      add(j.head, new THREE.BoxGeometry(0.16, 0.025, 0.02), eyeM, 0, 0.11, 0.1);
    }
    // hair / hood / helm
    if (opts.helm) {
      add(j.head, new THREE.SphereGeometry(0.135, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), metal, 0, 0.12, 0, 1, 1.05, 1.05);
      add(j.head, new THREE.BoxGeometry(0.2, 0.025, 0.04), metal, 0, 0.12, 0.11);
      if (opts.plume) add(j.head, new THREE.ConeGeometry(0.03, 0.25, 6), M(opts.plume), 0, 0.3, -0.02).rotation.x = -0.4;
    } else if (opts.hood) {
      add(j.head, new THREE.SphereGeometry(0.15, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.7), M(opts.hood, { side: THREE.DoubleSide, rough: 0.9 }), 0, 0.11, -0.015, 1, 1.08, 1.08);
    } else if (opts.hairStyle !== 'none') {
      const hs = opts.hairStyle || 'short';
      add(j.head, new THREE.SphereGeometry(0.125, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.115, -0.01, 1, 1.05, 1.08);
      if (hs === 'long' || hs === 'tail') {
        const tail = add(j.head, capsule(0.05, hs === 'long' ? 0.22 : 0.18), hair, 0, -0.0, -0.11, hs === 'long' ? 1.8 : 1, 1, 0.8);
        tail.rotation.x = 0.25;
      }
      if (hs === 'bun') add(j.head, new THREE.SphereGeometry(0.06, 10, 8), hair, 0, 0.2, -0.08);
      if (hs === 'beard') add(j.head, new THREE.SphereGeometry(0.08, 10, 8), hair, 0, 0.03, 0.06, 1.1, 0.9, 0.8);
    }
    if (opts.hat) {
      add(j.head, new THREE.CylinderGeometry(0.22, 0.22, 0.02, 16), M(opts.hat), 0, 0.17, 0);
      add(j.head, new THREE.CylinderGeometry(0.1, 0.12, 0.12, 12), M(opts.hat), 0, 0.23, 0);
    }
    // arms
    const armGeo = limb(0.052 * B, 0.044 * B, 0.27);
    const foreGeo = limb(0.044 * B, 0.036 * B, 0.24);
    for (const side of ['L', 'R']) {
      add(j['arm' + side], armGeo, opts.bareArms ? skin : cloth);
      add(j['fore' + side], foreGeo, opts.bareArms ? skin : leather);
      add(j['hand' + side], new THREE.SphereGeometry(0.045 * B, 8, 6), opts.gloves === false ? skin : leather, 0, -0.04, 0.01, 1, 1.2, 0.8);
      if (opts.pauldrons !== false && (build === 'hero' || build === 'knight')) {
        add(j['sh' + side], new THREE.SphereGeometry(0.085 * B, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), metal, side === 'L' ? 0.03 : -0.03, 0.02, 0, 1.1, 0.8, 1.1);
      }
      const thighGeo = limb(0.075 * B, 0.058 * B, 0.43);
      const shinGeo = limb(0.056 * B, 0.042 * B, 0.42);
      add(j['thigh' + side], thighGeo, cloth2);
      add(j['shin' + side], shinGeo, opts.robe ? cloth2 : leather);
      const foot = add(j['foot' + side], new THREE.BoxGeometry(0.09 * B, 0.07, 0.2), leather, 0, -0.025, 0.04);
      void foot;
    }
    if (opts.robe) {
      const robe = add(j.hips, new THREE.CylinderGeometry(0.17 * B, 0.3 * B, 0.85, 12, 1, true), M(opts.robe, { side: THREE.DoubleSide, rough: 0.9 }), 0, -0.42, 0);
      this.robe = robe;
    }
    if (build === 'hero' || build === 'knight') {
      // chest strap + plate
      add(j.chest, new THREE.BoxGeometry(0.05, 0.36, 0.25), leather, 0, 0.12, 0, 1, 1, 1).rotation.z = 0.55;
      if (build === 'knight') add(j.chest, capsule(0.17, 0.1), metal, 0, 0.12, 0.02, 1.15 * B, 1, 0.85 * B);
    }
    if (build === 'golem') {
      for (const [p, x, y, z, r] of [['chest', 0.1, 0.2, 0.08, 0.12], ['chest', -0.12, 0.05, 0.1, 0.1], ['hips', 0, 0, 0.1, 0.12], ['shL', 0.05, 0.05, 0, 0.12], ['shR', -0.05, 0.05, 0, 0.12]]) {
        add(j[p], new THREE.DodecahedronGeometry(r, 0), metal, x, y, z);
      }
    }
    // weapon
    this.weaponSocket = new THREE.Group();
    this.weaponSocket.position.set(0, -0.06 * s, 0.01 * s);
    this.weaponSocket.rotation.set(Math.PI / 2, 0, 0);
    j.handR.add(this.weaponSocket);
    this.backSocket = new THREE.Group();
    this.backSocket.position.set(0, 0.15 * s, -0.17 * s * B);
    this.backSocket.rotation.set(0, 0, Math.PI * 0.8);
    j.chest.add(this.backSocket);
    this.weapon = null;
    if (opts.weapon) this.setWeapon(opts.weapon, opts.weaponOpts);
    // cape
    this.cape = null;
    if (opts.cape) {
      this.cape = new Cape(this, opts.cape, { width: 0.42 * B * s, length: (opts.capeLength || 0.95) * s, emissive: opts.capeEmissive });
    }
    this.pose = newPose();
    this.groundY = 0;
    this.flash = 0;
    this.tint = null;
  }

  setWeapon(type, wo = {}) {
    if (this.weapon) this.weapon.parent.remove(this.weapon);
    let w = null;
    if (type === 'sword') w = makeSword(wo);
    else if (type === 'staff') w = makeStaff(wo.color, wo.gem);
    else if (type === 'club') w = makeClub(wo.color);
    else if (type === 'greatsword') w = makeGreatsword(wo.color, wo.glow);
    if (w) {
      w.scale.setScalar(this.s * (wo.scale || 1));
      this.weaponSocket.add(w);
    }
    this.weapon = w;
    this.weaponType = type;
    return w;
  }
  sheathe(on) {
    if (!this.weapon) return;
    const target = on ? this.backSocket : this.weaponSocket;
    if (this.weapon.parent !== target) target.add(this.weapon);
    this.sheathed = on;
  }

  addTo(scene) {
    scene.add(this.root);
    if (this.cape) scene.add(this.cape.mesh);
  }
  removeFrom(scene) {
    scene.remove(this.root);
    if (this.cape) scene.remove(this.cape.mesh);
  }
  setVisible(v) {
    this.root.visible = v;
    if (this.cape) this.cape.mesh.visible = v;
  }

  apply(p) {
    const j = this.j;
    for (let i = 0; i < J.length; i++) {
      const g = j[J[i]];
      g.rotation.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    }
    j.hips.position.set(p[OFF] * this.s, (0.95 + p[OFF + 1]) * this.s, p[OFF + 2] * this.s);
  }

  setFlash(v, color = 0xffffff) {
    this.flash = v;
    for (const m of this.materials) {
      m.emissive.setHex(color);
      m.emissiveIntensity = v * 2.5;
    }
  }

  // world position of weapon tip/base
  weaponPoints(tip, base) {
    if (!this.weapon) return false;
    this.weapon.updateWorldMatrix(true, false);
    tip.copy(this.weapon.userData.tipLocal).applyMatrix4(this.weapon.matrixWorld);
    base.copy(this.weapon.userData.baseLocal).applyMatrix4(this.weapon.matrixWorld);
    return true;
  }

  updateCape(dt, wind, lift) {
    if (this.cape && this.root.visible) this.cape.update(dt, wind, lift);
  }
}

// ---------------------------------------------------------------------------
// Procedural animation library
// ---------------------------------------------------------------------------
export const Anim = {
  idle(p, t, combat) {
    p.fill(0);
    const b = Math.sin(t * 1.8);
    setOff(p, 0, -0.01 + b * 0.006, 0);
    setJ(p, 'spine', 0.03 + b * 0.01, 0, 0);
    setJ(p, 'chest', 0.02 + b * 0.012, 0, 0);
    setJ(p, 'head', -0.03, Math.sin(t * 0.37) * 0.15, 0);
    setJ(p, 'armL', 0.05, 0, 0.12 + b * 0.01);
    setJ(p, 'foreL', -0.15, 0, 0);
    setJ(p, 'armR', 0.05, 0, -0.12 - b * 0.01);
    setJ(p, 'foreR', -0.15, 0, 0);
    setJ(p, 'thighL', 0.0, 0, 0.04);
    setJ(p, 'thighR', 0.0, 0, -0.04);
    if (combat) {
      setOff(p, 0, -0.06 + b * 0.006, 0);
      setJ(p, 'spine', 0.12, -0.25, 0);
      setJ(p, 'chest', 0.05, -0.15, 0);
      setJ(p, 'head', -0.08, 0.35, 0);
      setJ(p, 'armR', -0.55, 0.0, -0.35);
      setJ(p, 'foreR', -1.0, 0, 0);
      setJ(p, 'handR', 0.2, 0, 0.3);
      setJ(p, 'armL', -0.3, 0, 0.35);
      setJ(p, 'foreL', -0.9, 0, 0);
      setJ(p, 'thighL', -0.35, 0.2, 0.08);
      setJ(p, 'shinL', 0.35, 0, 0);
      setJ(p, 'thighR', 0.25, 0.2, -0.08);
      setJ(p, 'shinR', 0.35, 0, 0);
      setJ(p, 'footL', 0, 0, 0);
    }
  },
  // phase in radians, speed 0..1 (walk->sprint)
  locomote(p, phase, speed, t, opts = {}) {
    p.fill(0);
    const s = Math.min(1, speed);
    const run = Math.max(0, Math.min(1, (speed - 0.35) / 0.4));
    const sprint = Math.max(0, Math.min(1, (speed - 0.8) / 0.2));
    const sin = Math.sin(phase), cos = Math.cos(phase);
    const legA = 0.45 + run * 0.45 + sprint * 0.15;
    const bob = Math.abs(Math.cos(phase)) * (0.025 + run * 0.05);
    setOff(p, 0, -0.02 - run * 0.05 + bob - 0.02, 0);
    const lean = 0.05 + run * 0.18 + sprint * 0.12 + (opts.lean || 0);
    setJ(p, 'hips', 0, sin * 0.12 * s, 0);
    setJ(p, 'spine', lean, -sin * 0.1 * s, cos * 0.03);
    setJ(p, 'chest', 0.02 + run * 0.04, -sin * 0.12 * s, 0);
    setJ(p, 'head', -lean * 0.6, sin * 0.06, 0);
    // legs
    const kneeL = Math.max(0, -Math.sin(phase + 0.6)) * (0.6 + run * 0.9) + 0.08;
    const kneeR = Math.max(0, Math.sin(phase + 0.6)) * (0.6 + run * 0.9) + 0.08;
    setJ(p, 'thighL', -sin * legA - run * 0.12, 0, 0.03);
    setJ(p, 'shinL', kneeL, 0, 0);
    setJ(p, 'footL', -0.1 + Math.max(0, sin) * 0.3, 0, 0);
    setJ(p, 'thighR', sin * legA - run * 0.12, 0, -0.03);
    setJ(p, 'shinR', kneeR, 0, 0);
    setJ(p, 'footR', -0.1 + Math.max(0, -sin) * 0.3, 0, 0);
    // arms counter-swing
    const armA = 0.35 + run * 0.6 + sprint * 0.2;
    setJ(p, 'armL', sin * armA, 0, 0.1 + run * 0.05);
    setJ(p, 'foreL', -0.3 - run * 0.9 - Math.max(0, sin) * 0.3, 0, 0);
    setJ(p, 'armR', -sin * armA, 0, -0.1 - run * 0.05);
    setJ(p, 'foreR', -0.3 - run * 0.9 - Math.max(0, -sin) * 0.3, 0, 0);
    if (opts.armed) {
      setJ(p, 'armR', -sin * armA * 0.5 - 0.2, 0, -0.25);
      setJ(p, 'foreR', -0.9, 0, 0);
      setJ(p, 'handR', 0.3, 0, 0.2);
    }
  },
  crouch(p, phase, speed, t) {
    Anim.locomote(p, phase, speed * 0.6, t);
    p[OFF + 1] -= 0.3;
    addJ(p, 'spine', 0.35, 0, 0);
    addJ(p, 'head', -0.3, 0, 0);
    addJ(p, 'thighL', -0.7, 0, 0);
    addJ(p, 'thighR', -0.7, 0, 0);
    addJ(p, 'shinL', 1.0, 0, 0);
    addJ(p, 'shinR', 1.0, 0, 0);
    addJ(p, 'footL', -0.3, 0, 0);
    addJ(p, 'footR', -0.3, 0, 0);
  },
  air(p, vy, t) {
    p.fill(0);
    const up = Math.max(-1, Math.min(1, vy / 8));
    setOff(p, 0, 0, 0);
    setJ(p, 'spine', 0.1 - up * 0.1, 0, 0);
    setJ(p, 'thighL', -0.6 - up * 0.3, 0, 0.1);
    setJ(p, 'shinL', 0.9 + up * 0.2, 0, 0);
    setJ(p, 'thighR', -0.1 + up * 0.2, 0, -0.1);
    setJ(p, 'shinR', 0.5, 0, 0);
    setJ(p, 'armL', -0.4 + up * 0.3, 0, 0.6 - up * 0.2);
    setJ(p, 'foreL', -0.5, 0, 0);
    setJ(p, 'armR', -0.3 + up * 0.3, 0, -0.6 + up * 0.2);
    setJ(p, 'foreR', -0.5, 0, 0);
    setJ(p, 'head', -0.1, 0, 0);
    // flail when falling fast
    if (vy < -12) {
      const f = Math.sin(t * 14) * 0.3;
      addJ(p, 'armL', f, 0, 0.5);
      addJ(p, 'armR', -f, 0, -0.5);
    }
  },
  glide(p, t, turn) {
    p.fill(0);
    setOff(p, 0, 0.05, 0);
    setJ(p, 'spine', 0.55, 0, -turn * 0.3);
    setJ(p, 'chest', 0.15, 0, 0);
    setJ(p, 'head', -0.6, 0, turn * 0.2);
    setJ(p, 'armL', -1.2, 0, 1.45 + Math.sin(t * 2) * 0.05);
    setJ(p, 'foreL', -0.2, 0, 0);
    setJ(p, 'armR', -1.2, 0, -1.45 - Math.sin(t * 2) * 0.05);
    setJ(p, 'foreR', -0.2, 0, 0);
    setJ(p, 'thighL', 0.35, 0, 0.08);
    setJ(p, 'shinL', 0.3 + Math.sin(t * 3) * 0.1, 0, 0);
    setJ(p, 'thighR', 0.3, 0, -0.08);
    setJ(p, 'shinR', 0.35 + Math.cos(t * 3) * 0.1, 0, 0);
  },
  climb(p, phase, moving) {
    p.fill(0);
    const s = Math.sin(phase), c = Math.cos(phase);
    const a = moving ? 1 : 0.2;
    setOff(p, 0, -0.05, -0.12);
    setJ(p, 'spine', -0.1, 0, 0);
    setJ(p, 'head', -0.5, 0, 0);
    setJ(p, 'armL', -2.6 + s * 0.45 * a, 0, 0.35);
    setJ(p, 'foreL', -0.6 - Math.max(0, s) * 0.8 * a, 0, 0);
    setJ(p, 'armR', -2.6 - s * 0.45 * a, 0, -0.35);
    setJ(p, 'foreR', -0.6 - Math.max(0, -s) * 0.8 * a, 0, 0);
    setJ(p, 'thighL', -0.6 - s * 0.4 * a, 0, 0.2);
    setJ(p, 'shinL', 1.1 + c * 0.3 * a, 0, 0);
    setJ(p, 'thighR', -0.6 + s * 0.4 * a, 0, -0.2);
    setJ(p, 'shinR', 1.1 - c * 0.3 * a, 0, 0);
    setJ(p, 'footL', -0.4, 0, 0);
    setJ(p, 'footR', -0.4, 0, 0);
  },
  swim(p, phase, moving) {
    p.fill(0);
    const s = Math.sin(phase), c = Math.cos(phase);
    setOff(p, 0, 0, 0);
    setJ(p, 'spine', moving ? 0.9 : 0.2, 0, s * 0.1);
    setJ(p, 'head', moving ? -1.0 : -0.2, 0, 0);
    if (moving) {
      setJ(p, 'armL', -2.4 + s * 1.6, 0, 0.3 + c * 0.3);
      setJ(p, 'armR', -2.4 - s * 1.6, 0, -0.3 - c * 0.3);
      setJ(p, 'foreL', -0.3, 0, 0);
      setJ(p, 'foreR', -0.3, 0, 0);
      setJ(p, 'thighL', s * 0.4, 0, 0.05);
      setJ(p, 'thighR', -s * 0.4, 0, -0.05);
      setJ(p, 'shinL', 0.3, 0, 0);
      setJ(p, 'shinR', 0.3, 0, 0);
    } else {
      setJ(p, 'armL', -0.4 + s * 0.3, 0, 0.9);
      setJ(p, 'armR', -0.4 - s * 0.3, 0, -0.9);
      setJ(p, 'thighL', -0.3 + s * 0.3, 0, 0.1);
      setJ(p, 'thighR', -0.3 - s * 0.3, 0, -0.1);
      setJ(p, 'shinL', 0.6, 0, 0);
      setJ(p, 'shinR', 0.6, 0, 0);
    }
  },
  roll(p, u) {
    // u 0..1
    p.fill(0);
    const tuck = Math.sin(Math.min(1, u * 1.2) * Math.PI);
    setOff(p, 0, -0.45 * tuck, 0);
    setJ(p, 'spine', 0.9 * tuck, 0, 0);
    setJ(p, 'head', 0.5 * tuck, 0, 0);
    setJ(p, 'thighL', -1.6 * tuck, 0, 0.1);
    setJ(p, 'shinL', 2.0 * tuck, 0, 0);
    setJ(p, 'thighR', -1.4 * tuck, 0, -0.1);
    setJ(p, 'shinR', 2.1 * tuck, 0, 0);
    setJ(p, 'armL', -1.2 * tuck, 0, 0.3);
    setJ(p, 'foreL', -1.4 * tuck, 0, 0);
    setJ(p, 'armR', -1.2 * tuck, 0, -0.3);
    setJ(p, 'foreR', -1.4 * tuck, 0, 0);
  },
  stagger(p, u, dir = 1) {
    p.fill(0);
    const k = Math.sin(Math.min(1, u) * Math.PI);
    setOff(p, 0, -0.06 * k, -0.05 * k * dir);
    setJ(p, 'spine', -0.35 * k * dir, 0.1 * k, 0);
    setJ(p, 'chest', -0.2 * k * dir, 0, 0);
    setJ(p, 'head', -0.3 * k * dir, 0, 0);
    setJ(p, 'armL', 0.3 * k, 0, 0.6 * k);
    setJ(p, 'armR', 0.3 * k, 0, -0.6 * k);
    setJ(p, 'thighL', -0.3 * k, 0, 0);
    setJ(p, 'shinL', 0.4 * k, 0, 0);
    setJ(p, 'thighR', 0.2 * k, 0, 0);
  },
  dead(p, u) {
    p.fill(0);
    const k = Math.min(1, u);
    setOff(p, 0, -0.85 * k, -0.2 * k);
    setJ(p, 'spine', -0.2 * k, 0, 0);
    setJ(p, 'armL', -0.2, 0, 1.2 * k);
    setJ(p, 'armR', -0.2, 0, -1.2 * k);
    setJ(p, 'thighL', -1.2 * k, 0, 0.2);
    setJ(p, 'shinL', 1.6 * k, 0, 0);
    setJ(p, 'thighR', -1.0 * k, 0, -0.2);
    setJ(p, 'shinR', 1.4 * k, 0, 0);
  },
  talk(p, t) {
    Anim.idle(p, t, false);
    const g = Math.sin(t * 2.3);
    addJ(p, 'armR', -0.5 - g * 0.2, 0, -0.1);
    addJ(p, 'foreR', -0.8 + g * 0.3, 0, 0);
    addJ(p, 'armL', -0.2 + g * 0.1, 0, 0);
    addJ(p, 'head', Math.sin(t * 1.7) * 0.05, 0, Math.sin(t * 1.1) * 0.05);
  },
  wave(p, t) {
    Anim.idle(p, t, false);
    setJ(p, 'armR', -0.3, 0, -2.6);
    setJ(p, 'foreR', -0.4 + Math.sin(t * 8) * 0.35, 0, 0);
  },
  work(p, t, kind = 'hammer') {
    Anim.idle(p, t, false);
    if (kind === 'hammer') {
      const u = (t * 1.4) % 1;
      const swing = u < 0.6 ? u / 0.6 : 1 - (u - 0.6) / 0.4;
      setJ(p, 'spine', 0.25, 0, 0);
      setJ(p, 'armR', -1.4 - swing * 1.4, 0, -0.2);
      setJ(p, 'foreR', -0.6, 0, 0);
      setJ(p, 'armL', -0.6, 0, 0.2);
      setJ(p, 'foreL', -0.8, 0, 0);
    } else if (kind === 'hoe') {
      const s = Math.sin(t * 2.2);
      setJ(p, 'spine', 0.35 + s * 0.15, 0, 0);
      setJ(p, 'armR', -0.9 - s * 0.6, 0, -0.1);
      setJ(p, 'armL', -0.9 - s * 0.6, 0, 0.1);
      setJ(p, 'foreR', -0.4, 0, 0);
      setJ(p, 'foreL', -0.4, 0, 0);
    } else if (kind === 'sit') {
      setOff(p, 0, -0.5, -0.1);
      setJ(p, 'thighL', -1.5, 0, 0.1);
      setJ(p, 'thighR', -1.5, 0, -0.1);
      setJ(p, 'shinL', 1.5, 0, 0);
      setJ(p, 'shinR', 1.5, 0, 0);
      setJ(p, 'spine', 0.1, 0, 0);
      setJ(p, 'armL', -0.5, 0, 0.1);
      setJ(p, 'armR', -0.5, 0, -0.1);
      setJ(p, 'foreL', -0.8, 0, 0);
      setJ(p, 'foreR', -0.8, 0, 0);
    } else if (kind === 'sweep') {
      const s = Math.sin(t * 2.6);
      setJ(p, 'spine', 0.3, s * 0.3, 0);
      setJ(p, 'armR', -0.8, 0, -0.3);
      setJ(p, 'armL', -0.9, 0, 0.3);
      setJ(p, 'foreR', -0.5, 0, 0);
      setJ(p, 'foreL', -0.4, 0, 0);
    } else if (kind === 'pray') {
      setOff(p, 0, -0.45, 0);
      setJ(p, 'thighL', -1.4, 0, 0.1);
      setJ(p, 'shinL', 2.2, 0, 0);
      setJ(p, 'thighR', -0.2, 0, -0.1);
      setJ(p, 'shinR', 2.0, 0, 0);
      setJ(p, 'armL', -0.9, -0.4, 0);
      setJ(p, 'armR', -0.9, 0.4, 0);
      setJ(p, 'foreL', -1.4, 0, 0);
      setJ(p, 'foreR', -1.4, 0, 0);
      setJ(p, 'head', 0.4, 0, 0);
    }
  },
};

// Combat clips (player and humanoid enemies). Built once from the combat idle.
export function buildCombatClips() {
  const base = newPose();
  Anim.idle(base, 0, true);
  const C = {};
  C.slash1 = makeClip(base, [
    { t: 0, pose: {} },
    { t: 0.12, pose: { spine: [0.1, 0.55, 0], chest: [0.05, 0.35, 0], armR: [-1.6, 0.4, -1.4], foreR: [-1.2, 0, 0], handR: [0.2, 0, 0.9] }, ease: 'out' },
    { t: 0.26, pose: { spine: [0.15, -0.6, 0], chest: [0.05, -0.45, 0], armR: [-1.4, -0.5, -0.4], foreR: [-0.3, 0, 0], handR: [-0.2, 0, -0.6] }, ease: 'out' },
    { t: 0.5, pose: {} },
  ]);
  C.slash2 = makeClip(base, [
    { t: 0, pose: { spine: [0.15, -0.6, 0], armR: [-1.4, -0.5, -0.4], foreR: [-0.3, 0, 0] } },
    { t: 0.1, pose: { spine: [0.1, -0.7, 0], chest: [0.0, -0.4, 0], armR: [-1.2, -0.9, 0.3], foreR: [-1.5, 0, 0], handR: [0, 0, -1.2] }, ease: 'out' },
    { t: 0.24, pose: { spine: [0.15, 0.55, 0], chest: [0.05, 0.4, 0], armR: [-1.5, 0.6, -1.5], foreR: [-0.4, 0, 0], handR: [0, 0, 1.0] }, ease: 'out' },
    { t: 0.48, pose: {} },
  ]);
  C.slash3 = makeClip(base, [
    { t: 0, pose: {} },
    { t: 0.16, pose: { spine: [-0.25, 0.1, 0], chest: [-0.2, 0, 0], armR: [-3.0, 0, -0.3], foreR: [-0.9, 0, 0], handR: [0.6, 0, 0], armL: [-2.6, 0, 0.3], foreL: [-1.0, 0, 0] }, off: [0, 0.02, 0], ease: 'out' },
    { t: 0.3, pose: { spine: [0.55, 0, 0], chest: [0.25, 0, 0], armR: [-0.9, 0, -0.2], foreR: [-0.3, 0, 0], handR: [-0.4, 0, 0], armL: [-0.8, 0, 0.2], foreL: [-0.6, 0, 0], thighL: [-0.8, 0, 0.1], shinL: [0.6, 0, 0] }, off: [0, -0.18, 0.1], ease: 'out' },
    { t: 0.62, pose: {} },
  ]);
  C.heavy = makeClip(base, [
    { t: 0, pose: {} },
    { t: 0.25, pose: { spine: [-0.1, 1.2, 0], chest: [0, 0.5, 0], armR: [-2.2, 0.5, -1.0], foreR: [-0.8, 0, 0], handR: [0.4, 0, 0.8] }, off: [0, -0.1, 0] },
    { t: 0.45, pose: { spine: [0.2, -1.4, 0], chest: [0.1, -0.6, 0], armR: [-1.5, -0.8, -0.4], foreR: [-0.2, 0, 0], handR: [0, 0, -0.8] }, off: [0, -0.15, 0.15], ease: 'out' },
    { t: 0.85, pose: {} },
  ]);
  C.spin = makeClip(base, [
    { t: 0, pose: {} },
    { t: 0.6, pose: { armR: [-1.5, 0, -1.5], foreR: [-0.2, 0, 0], armL: [-1.4, 0, 1.4] } },
    { t: 0.9, pose: {} },
  ]);
  C.thrust = makeClip(base, [
    { t: 0, pose: {} },
    { t: 0.14, pose: { spine: [0.0, 0.5, 0], armR: [-0.9, 0.3, -0.6], foreR: [-2.0, 0, 0], handR: [1.2, 0, 0] }, off: [0, -0.05, -0.1] },
    { t: 0.26, pose: { spine: [0.3, -0.2, 0], armR: [-1.55, 0, -0.1], foreR: [-0.05, 0, 0], handR: [1.45, 0, 0], thighL: [-0.9, 0, 0.1], shinL: [0.7, 0, 0] }, off: [0, -0.15, 0.25], ease: 'out' },
    { t: 0.55, pose: {} },
  ]);
  C.plunge = makeClip(base, [
    { t: 0, pose: { armR: [-3.0, 0, -0.2], foreR: [-0.4, 0, 0], handR: [1.4, 0, 0], armL: [-3.0, 0, 0.2] } },
    { t: 0.5, pose: { spine: [0.6, 0, 0], armR: [-1.2, 0, -0.1], foreR: [-0.2, 0, 0], handR: [1.6, 0, 0], armL: [-1.2, 0, 0.1], thighL: [-1.2, 0, 0], shinL: [1.5, 0, 0], thighR: [-0.3, 0, 0], shinR: [1.6, 0, 0] }, off: [0, -0.35, 0] },
  ]);
  C.cast = makeClip(base, [
    { t: 0, pose: {} },
    { t: 0.14, pose: { spine: [0.05, 0.4, 0], armL: [-1.3, 0.3, 0.6], foreL: [-1.6, 0, 0], handL: [0, 0, 0] } },
    { t: 0.24, pose: { spine: [0.1, -0.15, 0], armL: [-1.55, -0.2, 0.05], foreL: [-0.05, 0, 0], handL: [0.4, 0, 0] }, ease: 'out' },
    { t: 0.5, pose: {} },
  ]);
  C.castBig = makeClip(base, [
    { t: 0, pose: {} },
    { t: 0.3, pose: { spine: [-0.25, 0, 0], armL: [-2.9, 0, 0.5], armR: [-2.9, 0, -0.5], foreL: [-0.3, 0, 0], foreR: [-0.3, 0, 0], head: [-0.4, 0, 0] }, off: [0, 0.05, 0] },
    { t: 0.5, pose: { spine: [0.45, 0, 0], armL: [-1.0, 0, 1.2], armR: [-1.0, 0, -1.2], foreL: [-0.1, 0, 0], foreR: [-0.1, 0, 0] }, off: [0, -0.2, 0], ease: 'out' },
    { t: 0.85, pose: {} },
  ]);
  C.block = makeClip(base, [
    { t: 0, pose: { spine: [0.15, -0.2, 0], armR: [-1.4, 0.6, -0.4], foreR: [-1.5, 0, 0], handR: [0.6, 0, 1.2], armL: [-1.1, 0, 0.3], foreL: [-1.4, 0, 0] }, off: [0, -0.1, 0] },
    { t: 1, pose: { spine: [0.15, -0.2, 0], armR: [-1.4, 0.6, -0.4], foreR: [-1.5, 0, 0], handR: [0.6, 0, 1.2], armL: [-1.1, 0, 0.3], foreL: [-1.4, 0, 0] }, off: [0, -0.1, 0] },
  ]);
  C.parry = makeClip(base, [
    { t: 0, pose: {} },
    { t: 0.06, pose: { spine: [0.0, 0.5, 0], armR: [-1.9, 0.9, -0.9], foreR: [-1.0, 0, 0], handR: [0.4, 0, 1.4] }, ease: 'out' },
    { t: 0.3, pose: { spine: [0.1, -0.3, 0], armR: [-1.2, -0.4, -0.6], foreR: [-0.6, 0, 0], handR: [0, 0, -0.5] } },
    { t: 0.45, pose: {} },
  ]);
  C.finisher = makeClip(base, [
    { t: 0, pose: {} },
    { t: 0.3, pose: { spine: [-0.3, 0, 0], armR: [-3.1, 0, -0.1], foreR: [-0.3, 0, 0], handR: [1.6, 0, 0], armL: [-3.1, 0, 0.1] }, off: [0, 0.1, -0.1] },
    { t: 0.5, pose: { spine: [0.8, 0, 0], armR: [-1.4, 0, -0.1], foreR: [-0.1, 0, 0], handR: [1.6, 0, 0], armL: [-1.4, 0, 0.1], thighL: [-1.0, 0, 0], shinL: [0.9, 0, 0], thighR: [0.3, 0, 0], shinR: [1.2, 0, 0] }, off: [0, -0.4, 0.3], ease: 'out' },
    { t: 1.1, pose: {} },
  ]);
  C.harvest = makeClip(base, [
    { t: 0, pose: {} },
    { t: 0.2, pose: { spine: [0, 0.7, 0], armR: [-1.6, 0.5, -1.5], foreR: [-0.9, 0, 0] } },
    { t: 0.32, pose: { spine: [0.1, -0.5, 0], armR: [-1.4, -0.6, -0.4], foreR: [-0.3, 0, 0] }, ease: 'out' },
    { t: 0.55, pose: {} },
  ]);
  C.pickup = makeClip(base, [
    { t: 0, pose: {} },
    { t: 0.25, pose: { spine: [0.9, 0, 0], head: [0.2, 0, 0], armR: [-1.0, 0, -0.1], foreR: [-0.3, 0, 0], thighL: [-0.9, 0, 0], shinL: [1.3, 0, 0], thighR: [-0.4, 0, 0], shinR: [1.0, 0, 0] }, off: [0, -0.35, 0] },
    { t: 0.55, pose: {} },
  ]);
  C.mantle = makeClip(base, [
    { t: 0, pose: { armL: [-2.8, 0, 0.3], armR: [-2.8, 0, -0.3], thighL: [-0.6, 0, 0], shinL: [1.2, 0, 0], thighR: [-0.4, 0, 0], shinR: [1.0, 0, 0] }, off: [0, -0.6, -0.2] },
    { t: 0.25, pose: { spine: [0.6, 0, 0], armL: [-0.8, 0, 0.3], armR: [-0.8, 0, -0.3], thighL: [-1.4, 0, 0], shinL: [1.8, 0, 0], thighR: [-0.2, 0, 0], shinR: [0.8, 0, 0] }, off: [0, -0.3, 0] },
    { t: 0.45, pose: {} },
  ]);
  return C;
}
