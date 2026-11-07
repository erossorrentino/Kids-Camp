import * as THREE from 'three';
import { Noise, mulberry32, clamp, smoothstep, lerp } from './noise.js';
import { SEA_Y } from './world.js';
import { colored, merge, flatMat, treeGeometry, grassGeometry, rockGeometry, chestGeometry, barrelGeometry } from './geom.js';

export const BIOMES = [
  { name: 'Verdant', grass: [0x6cbf45, 0x4f9e38, 0x8fd35a], dirt: 0x8a6a45, rock: [0x8b8178, 0x6a625a, 0x9a8d80], leaf: [0x4aa640, 0x3c8d3a, 0x7cc650], trunk: 0x6b4a2f, tree: 'round', crystal: null, husks: 1, wisps: 0 },
  { name: 'Amberwild', grass: [0xc9ae4a, 0xa98c38, 0xd8c060], dirt: 0x8a5a35, rock: [0x9a7a5a, 0x7a5a42, 0xa98a6a], leaf: [0xe0782a, 0xd04a28, 0xf2b440], trunk: 0x5a3a24, tree: 'round', crystal: null, husks: 2, wisps: 1 },
  { name: 'Glasswood', grass: [0x48b5a6, 0x358f98, 0x6ad0c0], dirt: 0x4a5a6a, rock: [0x6a7a92, 0x4a5872, 0x8a9ab0], leaf: [0x8a6ae0, 0x5a8ae8, 0xb08af0], trunk: 0x3a3050, tree: 'pine', crystal: 0x9a6aff, husks: 2, wisps: 2 },
  { name: 'Emberfell', grass: [0x4e3a36, 0x3a2c2a, 0x5e4440], dirt: 0x2a2020, rock: [0x3a3030, 0x2a2222, 0x4a3a36], leaf: [0x3a2a26, 0x2a201e, 0x4a302a], trunk: 0x1e1614, tree: 'dead', crystal: 0xff5a1a, husks: 3, wisps: 3 },
  { name: 'Stormshard', grass: [0x3a2a4a, 0x2a1e3a, 0x4a3a5e], dirt: 0x1e1428, rock: [0x2e2440, 0x221a30, 0x3a2e50], leaf: [0x7a3aa0, 0x5a2a80, 0x9a4ac0], trunk: 0x1a1020, tree: 'dead', crystal: 0xff40d0, husks: 0, wisps: 0 },
];
export const TIER_RINGS = [[90, 290], [290, 500], [500, 740], [740, 1000]];

const geoCache = {};
function cached(key, fn) { return geoCache[key] || (geoCache[key] = fn()); }

const crystalMats = {};
function crystalMat(c) {
  return crystalMats[c] || (crystalMats[c] = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.1, flatShading: true }));
}
export const shardMat = new THREE.MeshStandardMaterial({ color: 0x7ff5ff, emissive: 0x38d8ff, emissiveIntensity: 2.2, roughness: 0.15, flatShading: true });
export const featherMat = new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xffd36a, emissiveIntensity: 1.4, roughness: 0.4, side: THREE.DoubleSide });
const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
const stoneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
const chestGeo = cached('chest', chestGeometry);
const chestGlowMat = new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
const ventMat = new THREE.MeshBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

let ISLAND_ID = 1;

export class Island {
  constructor(G, o) {
    this.G = G;
    this.id = ISLAND_ID++;
    this.seed = o.seed;
    this.rng = mulberry32(o.seed);
    this.noise = new Noise(o.seed);
    this.R = o.R;
    this.tier = o.tier;
    this.small = !!o.small;
    this.storm = !!o.storm;
    this.biome = BIOMES[this.storm ? 4 : o.tier];
    this.home = !!o.home;
    this.baseY = o.y;
    this.pos = new THREE.Vector3(o.x, o.y, o.z);
    this.dy = 0;
    this.bobPhase = this.rng() * 10;
    this.sinking = false; this.sinkSpeed = 0;
    this.rising = !!o.rising; this.riseTarget = o.y;
    this.age = 0;
    this.name = o.name || this.makeName();
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.detail = new THREE.Group();   // small props, culled by distance
    this.group.add(this.detail);
    this.boxes = [];        // local AABBs {min, max}
    this.fuel = [];         // flammable nodes
    this.chests = [];
    this.pickups = [];      // shards & feathers
    this.barrels = [];
    this.vents = [];
    this.enemySpawns = [];
    this.survivor = null;
    this.enemiesSpawned = false;
    this.raycastMeshes = [];
    this.hillAmp = this.small ? 1.2 : this.R * (0.14 + this.rng() * 0.12);
    this.depth = this.R * (this.small ? 1.4 : 0.9 + this.rng() * 0.6);
    this.ox = this.rng() * 100; this.oz = this.rng() * 100;
    this.buildEdge();
    this.buildTerrain();
    if (!this.small) this.buildProps(o);
    else this.buildIslet();
    G.islandRoot.add(this.group);
  }

  makeName() {
    const a = ['Thistle', 'Gull', 'Copper', 'Mossy', 'Lantern', 'Hollow', 'Whisper', 'Breeze', 'Cinder', 'Glimmer', 'Rook', 'Wander', 'Saffron', 'Drift', 'Echo', 'Marrow', 'Vesper', 'Kestrel'];
    const b = ['Rest', 'Reach', 'Spire', 'Isle', 'Crag', 'Hollow', 'Perch', 'Knoll', 'Haven', 'Shelf', 'Rock', 'Bluff'];
    return `${a[Math.floor(this.rng() * a.length)]} ${b[Math.floor(this.rng() * b.length)]}`;
  }

  buildEdge() {
    this.edgeN = 72;
    this.edge = new Float32Array(this.edgeN + 1);
    for (let i = 0; i <= this.edgeN; i++) {
      const t = (i / this.edgeN) * Math.PI * 2;
      const c = Math.cos(t), s = Math.sin(t);
      this.edge[i] = this.R * (1 + 0.2 * this.noise.noise2(c * 1.2 + 7, s * 1.2 + 3) + 0.07 * this.noise.noise2(c * 3.5 + 1, s * 3.5 + 9));
    }
    this.edge[this.edgeN] = this.edge[0];
  }
  edgeR(theta) {
    let t = theta / (Math.PI * 2); t -= Math.floor(t);
    const f = t * this.edgeN; const i = Math.floor(f);
    return lerp(this.edge[i], this.edge[i + 1], f - i);
  }
  // local radial coordinate: 0 at centre, 1 at edge
  uAt(lx, lz) { return Math.hypot(lx, lz) / this.edgeR(Math.atan2(lz, lx)); }
  topH(lx, lz) {
    const u = this.uAt(lx, lz);
    return this.topHu(lx, lz, u);
  }
  topHu(lx, lz, u) {
    const n = this.noise.fbm2(lx * 0.03 + this.ox, lz * 0.03 + this.oz, 4) * 0.5 + 0.5;
    const hills = n * n * this.hillAmp * 1.6 * (1 - Math.pow(Math.min(u, 1), 2.4));
    return hills + 1.6 * (1 - Math.pow(Math.min(u, 1), 4)) - 0.4;
  }
  // underside surface (approximate) at radial u
  undersideAt(u) {
    const t = 1 - Math.pow(clamp(u, 0, 1), 1 / 1.25);
    return -1.4 - this.depth * Math.pow(t, 0.85);
  }

  buildTerrain() {
    const NR = this.small ? 6 : 13, NS = this.small ? 30 : 64, NK = this.small ? 6 : 10;
    const verts = [];
    const vInfo = [];  // 0 top, 1 skirt
    const idx = [];
    const ring = (r) => 1 + r * NS; // index start for ring r (r>=0 after centre)
    verts.push(0, this.topHu(0, 0, 0), 0); vInfo.push(0);
    for (let r = 1; r <= NR; r++) {
      const rr = Math.pow(r / NR, 0.85);
      for (let j = 0; j < NS; j++) {
        const th = (j / NS) * Math.PI * 2 + (r % 2) * (Math.PI / NS);
        const er = this.edgeR(th) * rr;
        const lx = Math.cos(th) * er, lz = Math.sin(th) * er;
        verts.push(lx, this.topHu(lx, lz, rr), lz); vInfo.push(0);
      }
    }
    // skirt rings
    for (let k = 1; k <= NK; k++) {
      const t = k / NK;
      for (let j = 0; j < NS; j++) {
        const th = (j / NS) * Math.PI * 2 + ((NR + k) % 2) * (Math.PI / NS);
        const er = this.edgeR(th);
        const jag = 1 + 0.18 * this.noise.noise2(th * 3 + k * 0.7, k * 0.5) * (k > 1 ? 1 : 0.3);
        const f = (k === 1 ? 1.02 : Math.pow(1 - t, 1.25)) * jag;
        const lx = Math.cos(th) * er * f, lz = Math.sin(th) * er * f;
        const y = k === 1 ? this.topHu(lx, lz, 1) - 1.4 : -1.4 - this.depth * Math.pow(t, 0.85) + this.noise.noise2(th * 5, k) * this.R * 0.06;
        verts.push(lx, y, lz); vInfo.push(1);
      }
    }
    const bottomIdx = verts.length / 3;
    verts.push(0, -1.4 - this.depth * 1.08, 0); vInfo.push(1);
    // faces: centre fan
    for (let j = 0; j < NS; j++) idx.push(0, ring(0) + ((j + 1) % NS), ring(0) + j);
    const totalRings = NR + NK;
    for (let r = 0; r < totalRings - 1; r++) {
      const a = ring(r), b = ring(r + 1);
      for (let j = 0; j < NS; j++) {
        const j1 = (j + 1) % NS;
        if ((r + 1) % 2 === 1) {
          idx.push(a + j, a + j1, b + j); idx.push(a + j1, b + j1, b + j);
        } else {
          idx.push(a + j, b + j1, b + j); idx.push(a + j, a + j1, b + j1);
        }
      }
    }
    const last = ring(totalRings - 1);
    for (let j = 0; j < NS; j++) idx.push(last + j, last + ((j + 1) % NS), bottomIdx);

    // Build non-indexed with flat per-face colors
    const B = this.biome;
    const grass = B.grass.map((c) => new THREE.Color(c)), rock = B.rock.map((c) => new THREE.Color(c)), dirt = new THREE.Color(B.dirt);
    const pos = new Float32Array(idx.length * 3), colr = new Float32Array(idx.length * 3);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), tmp = new THREE.Color();
    for (let f = 0; f < idx.length; f += 3) {
      const ia = idx[f], ib = idx[f + 1], ic = idx[f + 2];
      a.fromArray(verts, ia * 3); b.fromArray(verts, ib * 3); c.fromArray(verts, ic * 3);
      n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
      const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3;
      const isTop = vInfo[ia] === 0 && vInfo[ib] === 0 && vInfo[ic] === 0;
      if (isTop) {
        const u = this.uAt(cx, cz);
        const nn = this.noise.noise2(cx * 0.08 + 50, cz * 0.08) * 0.5 + 0.5;
        tmp.copy(grass[0]).lerp(grass[1], nn);
        if (this.noise.noise2(cx * 0.2, cz * 0.2 + 30) > 0.55) tmp.lerp(grass[2], 0.6);
        const slope = Math.abs(n.y);
        if (slope < 0.78) tmp.lerp(rock[0], smoothstep(0.78, 0.6, slope));
        if (u > 0.9) tmp.lerp(dirt, smoothstep(0.9, 1.0, u) * 0.7);
      } else {
        const band = Math.sin(cy * 0.55 + this.noise.noise2(cx * 0.05, cz * 0.05) * 2.0) * 0.5 + 0.5;
        tmp.copy(rock[1]).lerp(rock[2], band);
        if (band > 0.85) tmp.lerp(dirt, 0.4);
        const dark = smoothstep(0, -this.depth, cy);
        tmp.multiplyScalar(1 - dark * 0.55);
        if (cy > -2.2) tmp.copy(dirt).lerp(rock[1], 0.3);
      }
      const j = 1 + (Math.random() - 0.5) * 0.06;
      for (let k = 0; k < 3; k++) {
        const vi = idx[f + k];
        pos[(f + k) * 3] = verts[vi * 3]; pos[(f + k) * 3 + 1] = verts[vi * 3 + 1]; pos[(f + k) * 3 + 2] = verts[vi * 3 + 2];
        colr[(f + k) * 3] = tmp.r * j; colr[(f + k) * 3 + 1] = tmp.g * j; colr[(f + k) * 3 + 2] = tmp.b * j;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    this.terrain = new THREE.Mesh(g, flatMat);
    this.terrain.castShadow = true; this.terrain.receiveShadow = true;
    this.terrain.userData.island = this;
    this.group.add(this.terrain);
    this.raycastMeshes.push(this.terrain);
    // ember / storm islands get glowing veins under the rock
    if (this.biome.crystal && !this.small) {
      const vg = [];
      for (let i = 0; i < 14; i++) {
        const th = this.rng() * Math.PI * 2, t = 0.15 + this.rng() * 0.6;
        const er = this.edgeR(th) * Math.pow(1 - t, 1.25) * 0.98;
        vg.push(colored(new THREE.OctahedronGeometry(1, 0), 0xffffff, {
          pos: [Math.cos(th) * er, -1.4 - this.depth * Math.pow(t, 0.85), Math.sin(th) * er],
          rot: [this.rng() * 3, this.rng() * 3, this.rng() * 3], scale: [0.6 + this.rng(), 2 + this.rng() * 3, 0.6 + this.rng()],
        }));
      }
      const veins = new THREE.Mesh(merge(vg), crystalMat(this.biome.crystal));
      this.group.add(veins);
    }
  }

  samplePoint(maxU = 0.82, minU = 0) {
    for (let tries = 0; tries < 30; tries++) {
      const th = this.rng() * Math.PI * 2;
      const u = Math.sqrt(minU * minU + this.rng() * (maxU * maxU - minU * minU));
      const r = this.edgeR(th) * u;
      const lx = Math.cos(th) * r, lz = Math.sin(th) * r;
      const h = this.topHu(lx, lz, u);
      const hx = this.topH(lx + 0.8, lz) - h, hz = this.topH(lx, lz + 0.8) - h;
      const slope = Math.hypot(hx, hz) / 0.8;
      if (slope < 0.7) return { x: lx, y: h, z: lz, u };
    }
    return null;
  }

  addBox(cx, cz, w, h, d, baseY, color, parts) {
    const min = new THREE.Vector3(cx - w / 2, baseY, cz - d / 2), max = new THREE.Vector3(cx + w / 2, baseY + h, cz + d / 2);
    this.boxes.push({ min, max });
    parts.push(colored(new THREE.BoxGeometry(w, h, d), color, { pos: [cx, baseY + h / 2, cz], jitter: 0.08 }));
    return max.y;
  }

  buildProps(o) {
    const G = this.G, B = this.biome, rng = this.rng;
    const area = this.R * this.R;
    // ---- ruins (walls/pillars/towers - wall-run & grapple targets)
    const stone = [];
    const stoneCol = this.storm ? 0x4a3a5a : this.tier === 3 ? 0x5a4a44 : 0xb8ab98;
    const ruinChance = this.home ? 1 : this.storm ? 0.5 : 0.65;
    const towers = [];
    if (rng() < ruinChance) {
      const c = this.samplePoint(0.5);
      if (c) {
        const nWalls = 2 + Math.floor(rng() * 3);
        for (let i = 0; i < nWalls; i++) {
          const along = rng() < 0.5;
          const len = 6 + rng() * 8, h = 3.5 + rng() * 4;
          const wx = c.x + (rng() - 0.5) * 16, wz = c.z + (rng() - 0.5) * 16;
          if (this.uAt(wx, wz) > 0.8) continue;
          const by = Math.min(this.topH(wx - len / 2, wz), this.topH(wx + len / 2, wz), this.topH(wx, wz - len / 2), this.topH(wx, wz + len / 2), this.topH(wx, wz)) - 1;
          this.addBox(wx, wz, along ? len : 1.1, h + 1, along ? 1.1 : len, by, stoneCol, stone);
        }
        for (let i = 0; i < 3 + Math.floor(rng() * 4); i++) {
          const px = c.x + (rng() - 0.5) * 22, pz = c.z + (rng() - 0.5) * 22;
          if (this.uAt(px, pz) > 0.85) continue;
          const by = this.topH(px, pz) - 1;
          const top = this.addBox(px, pz, 1.4, 5 + rng() * 8, 1.4, by, stoneCol, stone);
          if (rng() < 0.4) this.addPickup('shard', px, top + 1.2, pz);
        }
        if (rng() < 0.6 || this.home) {
          const tx = c.x + (rng() - 0.5) * 10, tz = c.z + (rng() - 0.5) * 10;
          const by = this.topH(tx, tz) - 1;
          const top = this.addBox(tx, tz, 4, 14 + rng() * 8, 4, by, stoneCol, stone);
          this.addBox(tx, tz, 5, 0.6, 5, top, 0x8a7a6a, stone);
          towers.push({ x: tx, y: top + 0.6, z: tz });
          this.addPickup('shard', tx, top + 1.8, tz);
          this.addPickup('shard', tx + 1.2, top + 1.8, tz);
          if (rng() < 0.6) this.addPickup('feather', tx - 1.2, top + 2, tz);
        }
      }
    }
    if (stone.length) {
      const m = new THREE.Mesh(merge(stone), stoneMat);
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
      this.raycastMeshes.push(m);
      this.ruins = m;
    }

    // ---- trees (instanced, flammable)
    const nTrees = Math.floor(area * (this.storm ? 0.004 : 0.012) * (0.6 + rng() * 0.8));
    const treeGeo = cached('tree' + (this.storm ? 4 : this.tier), () => treeGeometry(B.tree, B.leaf, B.trunk));
    if (nTrees > 0) {
      this.trees = new THREE.InstancedMesh(treeGeo, flatMat, nTrees);
      this.trees.castShadow = true; this.trees.receiveShadow = true;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      let count = 0;
      for (let i = 0; i < nTrees; i++) {
        const pt = this.samplePoint(0.85);
        if (!pt) continue;
        if (this.boxes.some((bx) => pt.x > bx.min.x - 1.5 && pt.x < bx.max.x + 1.5 && pt.z > bx.min.z - 1.5 && pt.z < bx.max.z + 1.5)) continue;
        const sc = 0.8 + rng() * 0.9;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6.28);
        m.compose(p.set(pt.x, pt.y - 0.2, pt.z), q, s.set(sc, sc * (0.9 + rng() * 0.4), sc));
        this.trees.setMatrixAt(count, m);
        const tint = 0.85 + rng() * 0.3;
        this.trees.setColorAt(count, new THREE.Color(tint, tint, tint));
        this.fuel.push({ kind: 'tree', idx: count, x: pt.x, y: pt.y, z: pt.z, h: 4 * sc, state: 0, t: 0, regrow: 0, tint, matrix: m.clone() });
        count++;
      }
      this.trees.count = count;
      this.trees.instanceMatrix.needsUpdate = true;
      if (this.trees.instanceColor) this.trees.instanceColor.needsUpdate = true;
      this.group.add(this.trees);
    }

    // ---- grass tufts (instanced, flammable)
    if (!this.storm) {
      const nGrass = Math.min(650, Math.floor(area * 0.22));
      const gGeo = cached('grass' + this.tier, () => grassGeometry(B.grass[1], B.grass[2]));
      this.grass = new THREE.InstancedMesh(gGeo, grassMat, nGrass);
      this.grass.receiveShadow = true;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      let count = 0;
      for (let i = 0; i < nGrass; i++) {
        const pt = this.samplePoint(0.9);
        if (!pt) continue;
        const sc = 0.8 + rng() * 0.8;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6.28);
        m.compose(p.set(pt.x, pt.y - 0.05, pt.z), q, s.set(sc, sc, sc));
        this.grass.setMatrixAt(count, m);
        this.grass.setColorAt(count, new THREE.Color(1, 1, 1));
        this.fuel.push({ kind: 'grass', idx: count, x: pt.x, y: pt.y, z: pt.z, h: 0.8, state: 0, t: 0, regrow: 0, tint: 1 });
        count++;
      }
      this.grass.count = count;
      this.grass.instanceMatrix.needsUpdate = true;
      if (this.grass.instanceColor) this.grass.instanceColor.needsUpdate = true;
      this.detail.add(this.grass);
    }
    this.buildFuelGraph();

    // ---- rocks
    const nRocks = Math.floor(area * 0.004) + 2;
    const rGeo = cached('rock' + (this.storm ? 4 : this.tier), () => rockGeometry(B.rock[0]));
    const rocks = new THREE.InstancedMesh(rGeo, flatMat, nRocks);
    rocks.castShadow = true; rocks.receiveShadow = true;
    {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      for (let i = 0; i < nRocks; i++) {
        const pt = this.samplePoint(0.95) || { x: 0, y: 0, z: 0 };
        const sc = 0.4 + rng() * 1.4;
        q.setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, rng() * 3));
        m.compose(p.set(pt.x, pt.y, pt.z), q, s.set(sc * (1 + rng()), sc, sc * (1 + rng())));
        rocks.setMatrixAt(i, m);
      }
    }
    this.detail.add(rocks);

    // ---- crystals
    if (B.crystal) {
      const nC = Math.floor(area * 0.004) + 4;
      const cGeo = cached('crystalGeo', () => { const g = new THREE.OctahedronGeometry(1, 0); g.scale(0.5, 1.8, 0.5); g.translate(0, 1.2, 0); return g; });
      const cm = new THREE.InstancedMesh(cGeo, crystalMat(B.crystal), nC);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      for (let i = 0; i < nC; i++) {
        const pt = this.samplePoint(0.9) || { x: 0, y: 0, z: 0 };
        const sc = 0.5 + rng() * 1.2;
        q.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.6, rng() * 3, (rng() - 0.5) * 0.6));
        m.compose(p.set(pt.x, pt.y - 0.3, pt.z), q, s.set(sc, sc, sc));
        cm.setMatrixAt(i, m);
      }
      this.group.add(cm);
    }

    // ---- chests
    const nChests = this.home ? 1 : this.storm ? 0 : 1 + Math.floor(rng() * (this.R > 40 ? 3 : 2));
    for (let i = 0; i < nChests; i++) {
      let pt = null;
      if (towers.length && i === 0 && rng() < 0.5) { const t = towers[0]; pt = { x: t.x, y: t.y, z: t.z }; }
      else pt = this.samplePoint(0.75);
      if (!pt) continue;
      this.addChest(pt.x, pt.y, pt.z, rng() * 6.28);
    }

    // ---- floating shards & feathers in tricky spots
    const nShards = this.storm ? 0 : 3 + Math.floor(rng() * 4);
    for (let i = 0; i < nShards; i++) {
      const pt = this.samplePoint(0.9);
      if (pt) this.addPickup('shard', pt.x, pt.y + 1.2 + rng() * 2, pt.z);
    }
    if (!this.storm) {
      // under the island tip — grapple underneath!
      this.addPickup('shard', 0, -1.4 - this.depth * 1.08 - 1.5, 0);
      this.addPickup('shard', 0.8, -1.4 - this.depth * 1.08 - 2.2, 0.4);
      // floating high above the island
      if (rng() < 0.7) {
        const pt = this.samplePoint(0.5);
        if (pt) for (let k = 0; k < 5; k++) this.addPickup(k === 4 && rng() < 0.6 ? 'feather' : 'shard', pt.x + k * 1.5, pt.y + 10 + k * 1.2, pt.z);
      }
    }

    // ---- oil barrels
    if (this.tier >= 1 && !this.storm) {
      const nB = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < nB; i++) {
        const pt = this.samplePoint(0.7);
        if (!pt) continue;
        for (let k = 0; k < 1 + Math.floor(rng() * 2); k++) this.addBarrel(pt.x + k * 1.2, pt.y, pt.z + (k % 2) * 1.1);
      }
    }

    // ---- updraft vent
    if (!this.storm && (this.home || rng() < 0.45)) {
      const pt = this.samplePoint(0.8, 0.55);
      if (pt) this.addVent(pt.x, pt.y, pt.z);
    }

    // ---- enemy spawns
    if (!this.home) {
      const scale = this.R / 40;
      const nh = Math.round(B.husks * scale * (0.5 + rng()));
      const nw = Math.round(B.wisps * scale * (0.5 + rng()));
      for (let i = 0; i < nh; i++) { const pt = this.samplePoint(0.7); if (pt) this.enemySpawns.push({ type: 'husk', x: pt.x, y: pt.y, z: pt.z }); }
      for (let i = 0; i < nw; i++) { const pt = this.samplePoint(0.8); if (pt) this.enemySpawns.push({ type: 'wisp', x: pt.x, y: pt.y + 6 + rng() * 8, z: pt.z }); }
    }
  }

  buildIslet() {
    const rng = this.rng;
    const top = this.topH(0, 0);
    this.addPickup('shard', 0, top + 1.3, 0);
    if (rng() < 0.4) this.addPickup('shard', 0.9, top + 1.6, 0.5);
    if (rng() < 0.35) this.addPickup('feather', -0.8, top + 1.8, 0);
    const B = this.biome;
    const treeGeo = cached('tree' + (this.storm ? 4 : this.tier), () => treeGeometry(B.tree, B.leaf, B.trunk));
    if (rng() < 0.7) {
      this.trees = new THREE.InstancedMesh(treeGeo, flatMat, 1);
      const pt = this.samplePoint(0.6) || { x: 0, y: top, z: 0 };
      const m = new THREE.Matrix4().makeTranslation(pt.x, pt.y - 0.2, pt.z);
      this.trees.setMatrixAt(0, m);
      this.trees.setColorAt(0, new THREE.Color(1, 1, 1));
      this.trees.castShadow = true;
      this.fuel.push({ kind: 'tree', idx: 0, x: pt.x, y: pt.y, z: pt.z, h: 4, state: 0, t: 0, regrow: 0, tint: 1, matrix: m.clone() });
      this.group.add(this.trees);
      this.buildFuelGraph();
    }
  }

  buildFuelGraph() {
    const cell = 5, map = new Map();
    const key = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
    this.fuel.forEach((f, i) => { const k = key(f.x, f.z); if (!map.has(k)) map.set(k, []); map.get(k).push(i); });
    this.fuel.forEach((f) => {
      f.nb = [];
      const cx = Math.floor(f.x / cell), cz = Math.floor(f.z / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const l = map.get(`${cx + dx},${cz + dz}`);
        if (!l) continue;
        for (const j of l) {
          const g = this.fuel[j];
          if (g !== f && (g.x - f.x) ** 2 + (g.z - f.z) ** 2 < (f.kind === 'tree' || g.kind === 'tree' ? 36 : 20)) f.nb.push(j);
        }
      }
    });
  }

  addChest(x, y, z, rot) {
    const g = new THREE.Group();
    g.position.set(x, y - 0.05, z); g.rotation.y = rot;
    const base = new THREE.Mesh(chestGeo.base, flatMat); base.castShadow = true;
    const lidPivot = new THREE.Group(); lidPivot.position.set(0, 0.8, -0.45);
    const lid = new THREE.Mesh(chestGeo.lid, flatMat); lid.castShadow = true;
    lidPivot.add(lid);
    const glow = new THREE.Mesh(cached('chestGlow', () => new THREE.SphereGeometry(1.2, 12, 8)), chestGlowMat);
    glow.position.y = 0.6; glow.scale.set(1, 0.6, 0.8);
    g.add(base, lidPivot, glow);
    this.detail.add(g);
    this.chests.push({ group: g, lid: lidPivot, glow, opened: false, x, y, z, t: 0 });
    this.boxes.push({ min: new THREE.Vector3(x - 0.7, y - 1, z - 0.7), max: new THREE.Vector3(x + 0.7, y + 0.8, z + 0.7), chest: true });
  }

  addPickup(kind, x, y, z) {
    const geo = kind === 'shard'
      ? cached('shardGeo', () => { const g = new THREE.OctahedronGeometry(0.35, 0); g.scale(1, 1.6, 1); return g; })
      : cached('featherGeo', () => { const g = new THREE.PlaneGeometry(0.35, 1.1, 1, 3); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getY(i) * 2) * 0.12); g.computeVertexNormals(); return g; });
    const m = new THREE.Mesh(geo, kind === 'shard' ? shardMat : featherMat);
    m.position.set(x, y, z);
    this.detail.add(m);
    this.pickups.push({ kind, mesh: m, x, y, z, taken: false, phase: Math.random() * 6 });
  }

  addBarrel(x, y, z) {
    const m = new THREE.Mesh(cached('barrel', barrelGeometry), flatMat);
    m.position.set(x, y - 0.05, z); m.castShadow = true;
    this.detail.add(m);
    this.barrels.push({ mesh: m, x, y, z, alive: true, island: this });
  }

  addVent(x, y, z) {
    const ring = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ring.push(colored(new THREE.DodecahedronGeometry(0.6, 0), 0x9a9aa8, { pos: [x + Math.cos(a) * 2.2, y + 0.1, z + Math.sin(a) * 2.2], jitter: 0.2 }));
    }
    const rm = new THREE.Mesh(merge(ring), flatMat); rm.castShadow = true;
    const col = new THREE.Mesh(cached('ventCol', () => { const g = new THREE.CylinderGeometry(2.4, 2.0, 36, 16, 1, true); g.translate(0, 18, 0); return g; }), ventMat);
    col.position.set(x, y, z);
    this.detail.add(rm, col);
    this.vents.push({ x, y, z, radius: 3, height: 40, mesh: col });
  }

  // World-space helpers
  worldTop(x, z) {
    const lx = x - this.pos.x, lz = z - this.pos.z;
    if (Math.abs(lx) > this.R * 1.35 || Math.abs(lz) > this.R * 1.35) return null;
    const u = this.uAt(lx, lz);
    if (u >= 1) return null;
    return this.pos.y + this.topHu(lx, lz, u);
  }

  update(dt) {
    const G = this.G;
    this.age += dt;
    const oldY = this.pos.y;
    if (this.rising) {
      this.pos.y = Math.min(this.riseTarget, this.pos.y + dt * 6);
      if (this.pos.y >= this.riseTarget) this.rising = false;
      if (Math.random() < 0.5 && G.particles) this.edgeDust(0.8);
    } else if (this.sinking) {
      this.sinkSpeed = Math.min(2.2, Math.max(0.4, this.sinkSpeed + dt * 0.05));
      this.pos.y -= this.sinkSpeed * dt;
      if (Math.random() < 0.35 && G.particles) this.edgeDust(1);
    } else {
      this.pos.y = this.baseY + Math.sin(G.time * 0.35 + this.bobPhase) * 0.35;
    }
    this.dy = this.pos.y - oldY;
    this.group.position.y = this.pos.y;
    // animate near pickups/chests/vents
    const d2 = this.pos.distanceToSquared(G.camera.position);
    if (d2 < 260 * 260) {
      for (const p of this.pickups) {
        if (p.taken) continue;
        p.mesh.rotation.y += dt * 2;
        p.mesh.position.y = p.y + Math.sin(G.time * 2 + p.phase) * 0.2;
      }
      for (const c of this.chests) {
        if (c.opened && c.t < 1) { c.t = Math.min(1, c.t + dt * 2.5); c.lid.rotation.x = -c.t * 1.9; c.glow.material = chestGlowMat; c.glow.visible = c.t < 0.95; }
        else if (!c.opened) c.glow.scale.setScalar(0.9 + Math.sin(G.time * 3) * 0.08);
      }
      for (const v of this.vents) v.mesh.material.opacity = 0.1 + Math.sin(G.time * 4) * 0.03;
    }
    // shadow casting only near the focus
    const near = d2 < 180 * 180;
    this.terrain.castShadow = near;
    if (this.trees) this.trees.castShadow = near;
    this.group.visible = d2 < 1250 * 1250;
    this.detail.visible = d2 < 240 * 240 + this.R * this.R;
  }

  edgeDust(scale) {
    const G = this.G;
    const th = Math.random() * Math.PI * 2;
    const er = this.edgeR(th);
    const x = this.pos.x + Math.cos(th) * er, z = this.pos.z + Math.sin(th) * er;
    G.particles.norm.emit({ x, y: this.pos.y - 2 - Math.random() * this.depth * 0.5, z, vx: Math.cos(th) * 2, vy: -2 - Math.random() * 3, vz: Math.sin(th) * 2, color: [0.55, 0.48, 0.4], color2: [0.7, 0.68, 0.65], size: 3 * scale, size1: 9 * scale, alpha: 0.4, life: 3.5, drag: 0.3 });
  }

  dispose() {
    this.G.islandRoot.remove(this.group);
    this.group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      if (o === this.terrain || o === this.ruins) o.geometry.dispose();
    });
  }
}

export class IslandManager {
  constructor(G) {
    this.G = G;
    this.list = [];
    this.sinkTimer = 90;
    this.seed = 1;
  }
  clear() { this.list.forEach((i) => i.dispose()); this.list = []; }

  generate(seed) {
    this.clear();
    this.seed = seed;
    const rng = mulberry32(seed);
    this.rng = rng;
    // home island
    this.home = new Island(this.G, { x: 0, y: 0, z: 0, R: 36, tier: 0, seed: seed + 1, home: true, name: 'Hearthrock' });
    this.list.push(this.home);
    const counts = [7, 8, 8, 7];
    for (let t = 0; t < 4; t++) {
      for (let i = 0; i < counts[t]; i++) this.spawnIsland(t, false);
    }
    // stepping-stone islets between neighbours
    const big = this.list.slice();
    for (const a of big) {
      let best = null, bd = 1e9;
      for (const b of big) {
        if (a === b) continue;
        const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
        if (d < bd) { bd = d; best = b; }
      }
      if (!best || rng() < 0.35) continue;
      const n = 1 + Math.floor(rng() * 3);
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1);
        const x = lerp(a.pos.x, best.pos.x, t) + (rng() - 0.5) * 20;
        const z = lerp(a.pos.z, best.pos.z, t) + (rng() - 0.5) * 20;
        const y = lerp(a.pos.y, best.pos.y, t) + (rng() - 0.5) * 8 + 3;
        if (this.tooClose(x, z, 7, 6)) continue;
        this.list.push(new Island(this.G, { x, y, z, R: 5 + rng() * 5, tier: a.tier, seed: Math.floor(rng() * 1e9), small: true }));
      }
    }
  }

  tooClose(x, z, R, margin) {
    return this.list.some((o) => Math.hypot(o.pos.x - x, o.pos.z - z) < o.R + R + margin);
  }

  spawnIsland(tier, rising) {
    const rng = this.rng || Math.random;
    const [r0, r1] = TIER_RINGS[tier];
    for (let tries = 0; tries < 60; tries++) {
      const a = rng() * Math.PI * 2;
      const r = r0 + rng() * (r1 - r0);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const R = 22 + rng() * 30;
      if (this.tooClose(x, z, R, 34)) continue;
      const G = this.G;
      if (rising && G.player && Math.hypot(G.player.pos.x - x, G.player.pos.z - z) < R + 40) continue;
      const y = -6 + rng() * 40 + tier * 4;
      const isl = new Island(G, { x, y: rising ? SEA_Y - 30 - R : y, z, R, tier, seed: Math.floor(rng() * 1e9), rising });
      isl.riseTarget = y;
      this.list.push(isl);
      return isl;
    }
    return null;
  }

  update(dt) {
    const G = this.G;
    for (const isl of this.list) isl.update(dt);
    if (G.storm && G.storm.active) return;
    // The world changes: old islands sink into the Storm and new ones rise.
    this.sinkTimer -= dt;
    if (this.sinkTimer <= 0) {
      this.sinkTimer = 75 + Math.random() * 60;
      const cands = this.list.filter((i) => !i.small && !i.home && !i.sinking && !i.rising && i.age > 60);
      if (cands.length) {
        const isl = cands[Math.floor(Math.random() * cands.length)];
        isl.sinking = true;
        const d = Math.hypot(G.player.pos.x - isl.pos.x, G.player.pos.z - isl.pos.z);
        G.ui.toast(`⚠ ${isl.name} is breaking apart and sinking into the Storm! ${d < 200 ? 'Get clear!' : `(${Math.round(d)}m ${G.ui.dirName(isl.pos)})`}`, 5, 'warn');
        G.audio.play('rumble', d < 200 ? 1 : 0.3);
        if (d < 150) G.cameraShake = Math.max(G.cameraShake, 0.6);
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const isl = this.list[i];
      if (isl.sinking && isl.pos.y < SEA_Y - isl.depth - 25) {
        const tier = isl.tier;
        const surv = isl.survivor && !isl.survivor.rescued ? isl.survivor.data : null;
        if (G.combat) G.combat.removeIslandEnemies(isl);
        if (isl.survivor && G.survivors) G.survivors.detach(isl);
        isl.dispose();
        this.list.splice(i, 1);
        const fresh = this.spawnIsland(tier, true);
        if (fresh) {
          G.ui.toast(`✦ A new island, ${fresh.name}, is rising from the Storm to the ${G.ui.dirName(fresh.pos)}!`, 5);
          if (surv && G.survivors) { G.survivors.place(surv, fresh); G.ui.toast(`${surv.name} clung to the rising rock of ${fresh.name}!`, 4); }
          if (G.combat) G.combat.onIslandAdded(fresh);
        }
      }
    }
  }

  near(pos, radius) {
    const out = [];
    for (const isl of this.list) {
      const r = radius + isl.R * 1.3 + isl.depth;
      if ((isl.pos.x - pos.x) ** 2 + (isl.pos.z - pos.z) ** 2 < r * r && Math.abs(isl.pos.y - pos.y) < r) out.push(isl);
    }
    return out;
  }
  meshesNear(pos, radius) {
    const out = [];
    for (const isl of this.near(pos, radius)) for (const m of isl.raycastMeshes) out.push(m);
    return out;
  }
  islandUnder(x, z) {
    for (const isl of this.list) if (isl.worldTop(x, z) !== null) return isl;
    return null;
  }
}
