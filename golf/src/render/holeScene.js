// Builds all 3D objects for one hole from a HoleModel.
import * as THREE from '../../vendor/three.module.min.js';
import { makeTerrainMaterial } from './terrainMaterial.js';
import { buildTrees, TREE_UNIFORMS } from './trees.js';
import { buildGroundCover, buildCartPath, buildTeeFurniture, buildHouses, buildClubhouse, buildGrandstand, Birds, buildRakes, buildFountains, buildBridges, buildLighthouse, buildTeeExtras } from './decor.js';
import { buildPeople, buildMarshals, buildCameraTower, Cart } from './people.js';
import { RNG, mixSeed, smoothstep, clamp, Noise2D } from '../util/rng.js';

const CL = (v) => clamp(v, -60, 60);

function gridGeometry(hole, x0, z0, x1, z1, step, heightFn, skipCell = null) {
  const nx = Math.max(2, Math.ceil((x1 - x0) / step) + 1);
  const nz = Math.max(2, Math.ceil((z1 - z0) / step) + 1);
  const dx = (x1 - x0) / (nx - 1), dz = (z1 - z0) / (nz - 1);
  const n = nx * nz;
  const pos = new Float32Array(n * 3);
  const aF = new Float32Array(n * 4);
  const aR = new Float32Array(n * 2);
  const pr = {};
  for (let j = 0; j < nz; j++) {
    const z = z0 + j * dz;
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * dx;
      const k = j * nx + i;
      hole.project(x, z, pr);
      const f = hole.fields(x, z, pr);
      const h = heightFn ? heightFn(x, z, f) : hole.heightFromFields(x, z, f);
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      aF[k * 4] = CL(f.dF); aF[k * 4 + 1] = CL(f.dG); aF[k * 4 + 2] = CL(f.dB); aF[k * 4 + 3] = CL(f.dT);
      aR[k * 2] = CL(f.dR); aR[k * 2 + 1] = CL(f.dO);
    }
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let o = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      if (skipCell && skipCell(x0 + (i + 0.5) * dx, z0 + (j + 0.5) * dz)) continue;
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx[o++] = a; idx[o++] = c; idx[o++] = b;
      idx[o++] = b; idx[o++] = c; idx[o++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aF', new THREE.BufferAttribute(aF, 4));
  g.setAttribute('aR', new THREE.BufferAttribute(aR, 2));
  g.setIndex(new THREE.BufferAttribute(o < idx.length ? idx.slice(0, o) : idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

function waterMaterial(color, uniforms) {
  const m = new THREE.MeshPhongMaterial({ color, specular: 0x9fc4d8, shininess: 120, transparent: true, opacity: 0.9 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWP;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        vec2 p = vWP.xz;
        float w1 = sin(p.x * 0.9 + uTime * 1.3) * cos(p.y * 0.7 - uTime * 1.1);
        float w2 = sin(p.x * 2.3 - uTime * 2.1 + p.y * 1.7) * 0.5;
        vec3 pert = vec3(w1 + w2, 0.0, cos(p.y * 1.1 + uTime) * 0.8 + w2) * 0.07;
        normal = normalize(normal + (viewMatrix * vec4(pert, 0.0)).xyz);
      }`);
  };
  m.customProgramCacheKey = () => 'water-v1';
  return m;
}

function blobOutline(b, k = 1.25, n = 48) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 1 + b.w1 * Math.sin(3 * a + b.p1) + b.w2 * Math.sin(5 * a + b.p2);
    const u = Math.cos(a) * b.rx * r * k, v = Math.sin(a) * b.rz * r * k;
    // local (u right, v forward) -> world
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    const x = b.x + u * c + v * s;
    const z = b.z + u * s - v * c;
    if (i === 0) shape.moveTo(x, -z); else shape.lineTo(x, -z);
  }
  return shape;
}

function flagTexture(n) {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 88;
  const g = cv.getContext('2d');
  g.fillStyle = '#f2c230';
  g.fillRect(0, 0, 128, 88);
  g.fillStyle = '#1b2a22';
  g.font = 'bold 56px "Barlow Condensed", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 64, 47);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class HoleScene {
  constructor(hole, opts = {}) {
    this.hole = hole;
    this.opts = opts;
    this.group = new THREE.Group();
    this.uniforms = { uTime: { value: 0 } };
    this.quality = opts.quality || 'high';
    const q = this.quality;
    this.step = q === 'low' ? 2.4 : q === 'medium' ? 1.8 : 1.4;
    this.build();
  }

  build() {
    const hole = this.hole;
    const style = hole.style;
    const b = hole.bounds;
    const heading = hole.teeHeading;
    const shadows = this.quality !== 'low';

    // --- detail patches ---
    const patches = [];
    const g = hole.green;
    const gR = Math.max(g.rx, g.rz) + 16;
    patches.push({ cx: g.x, cz: g.z, R: gR, step: this.quality === 'low' ? 0.6 : 0.35 });
    for (const bk of hole.bunkers) {
      const r = Math.max(bk.rx, bk.rz) * 1.25 + 3;
      if (Math.hypot(bk.x - g.x, bk.z - g.z) + r < gR - 1) continue;
      if (patches.some((p) => Math.abs(p.cx - bk.x) < p.R + r && Math.abs(p.cz - bk.z) < p.R + r)) continue;
      patches.push({ cx: bk.x, cz: bk.z, R: r, step: 0.45 });
    }
    patches.push({ cx: 0, cz: -2, R: 12, step: 0.5 });
    this.patches = patches;
    const patchMask = (x, z) => {
      let m = 0;
      for (const p of patches) {
        const inside = p.R - Math.max(Math.abs(x - p.cx), Math.abs(z - p.cz));
        if (inside > 0) m = Math.max(m, smoothstep(2.5, 5, inside));
      }
      return m;
    };

    // --- main terrain ---
    const mat = makeTerrainMaterial(style, heading, { ocean: hole.ocean });
    this.terrainMat = mat;
    const tg = gridGeometry(hole, b.minX, b.minZ, b.maxX, b.maxZ, this.step, (x, z, f) => hole.heightFromFields(x, z, f) - 0.35 * patchMask(x, z));
    const terrain = new THREE.Mesh(tg, mat);
    terrain.receiveShadow = shadows;
    this.group.add(terrain);

    const pmat = makeTerrainMaterial(style, heading, { ocean: hole.ocean, polygonOffset: true });
    for (const p of patches) {
      const pg = gridGeometry(hole, p.cx - p.R, p.cz - p.R, p.cx + p.R, p.cz + p.R, p.step);
      const m = new THREE.Mesh(pg, pmat);
      m.receiveShadow = shadows;
      this.group.add(m);
    }

    // --- far ground (to the horizon) ---
    this.buildFarGround(mat, shadows);

    // --- water ---
    const wcol = new THREE.Color(style.colors.water);
    const wmat = waterMaterial(wcol, this.uniforms);
    for (const w of hole.waters) {
      let geo;
      if (w.type === 'creek') {
        const pts = w.points;
        const posArr = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[Math.max(0, i - 1)], c = pts[Math.min(pts.length - 1, i + 1)];
          let dx = c.x - a.x, dz = c.z - a.z;
          const l = Math.hypot(dx, dz) || 1;
          dx /= l; dz /= l;
          const hw = w.half + 3;
          const lv = w.levels ? w.levels[i] : w.level;
          posArr.push(pts[i].x - dz * hw, lv, pts[i].z + dx * hw, pts[i].x + dz * hw, lv, pts[i].z - dx * hw);
        }
        const idx = [];
        for (let i = 0; i < pts.length - 1; i++) {
          const a = i * 2;
          idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
        geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        // make sure normals face up
        const nArr = geo.attributes.normal.array;
        for (let i = 0; i < nArr.length; i += 3) { nArr[i] = 0; nArr[i + 1] = 1; nArr[i + 2] = 0; }
      } else {
        geo = new THREE.ShapeGeometry(blobOutline(w, 1.3), 1);
        geo.rotateX(-Math.PI / 2);
        geo.translate(0, w.level, 0);
      }
      const m = new THREE.Mesh(geo, wmat);
      m.receiveShadow = shadows;
      this.group.add(m);
    }
    if (this.seaLevel !== undefined) {
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000, 1, 1).rotateX(-Math.PI / 2), waterMaterial(new THREE.Color(style.colors.water).lerp(new THREE.Color('#1c5f7a'), 0.4), this.uniforms));
      sea.position.set((b.minX + b.maxX) / 2, this.seaLevel, (b.minZ + b.maxZ) / 2);
      this.group.add(sea);
    }

    // --- trees ---
    this.group.add(buildTrees(hole.trees, { shadows }));
    this.buildBackgroundTrees();

    // --- scenery ring ---
    this.buildScenery();

    // --- flag & cup ---
    this.buildPin();

    // --- markers ---
    this.buildMarkers();

    if (this.opts.crowd) this.buildCrowd();

    // --- surroundings ---
    this.group.add(buildGroundCover(hole, this.quality));
    const path = buildCartPath(hole);
    if (path) this.group.add(path);
    this.group.add(buildTeeFurniture(hole));
    if (this.quality !== 'low') this.group.add(buildHouses(hole));
    if (hole.index === 0) this.group.add(buildClubhouse(hole, 'tee'));
    if (hole.index === hole.course.holes.length - 1) this.group.add(buildClubhouse(hole, 'green'));
    if (this.opts.crowd && (hole.index === 17 || hole.index === hole.course.signature - 1)) {
      const stand = buildGrandstand(hole, this.opts.board);
      this.standPeople = stand.userData.people || null;
      this.group.add(stand);
    }
    this.group.add(buildRakes(hole));
    this.group.add(buildBridges(hole));
    this.group.add(buildTeeExtras(hole));
    this.fountains = buildFountains(hole);
    for (const f of this.fountains) this.group.add(f.group);
    if (this.seaSide) {
      // a lighthouse on the far shore
      const b = hole.bounds;
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
      const r = { x: Math.cos(hole.teeHeading) * this.seaSide, z: Math.sin(hole.teeHeading) * this.seaSide };
      const f = { x: Math.sin(hole.teeHeading), z: -Math.cos(hole.teeHeading) };
      const d = (b.maxX - b.minX) / 2 + 520;
      const lx = cx + r.x * d + f.x * 240, lz = cz + r.z * d + f.z * 240;
      const ly = Math.max(this.seaLevel + 2, this.farH(lx, lz, hole.fields(lx, lz)));
      this.group.add(buildLighthouse(lx, ly, lz));
    }
    this.carts = [];
    if (hole.cartPath && this.quality !== 'low') {
      const cart = new Cart(hole, mixSeed(hole.seed, 'cart'));
      this.carts.push(cart);
      this.group.add(cart.group);
    }
    this.birds = [];
    if (this.quality !== 'low') {
      const mid = hole.pointAtS(hole.length / 2);
      const flocks = hole.style.scenery === 'ocean' ? 2 : 1;
      for (let i = 0; i < flocks; i++) {
        const b = new Birds(new THREE.Vector3(mid.x, hole.heightAt(mid.x, mid.z), mid.z), 5 + i * 3);
        this.birds.push(b);
        this.group.add(b.group);
      }
    }
  }

  buildFarGround(mat, shadows) {
    const hole = this.hole;
    const b = hole.bounds;
    const style = hole.style;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const S = 2600;
    const rng = new RNG(mixSeed(hole.seed, 'far'));
    const nz = new Noise2D(mixSeed(hole.seed, 'farnoise'));
    // Seaside scenery: the land drops into the sea on one side
    let seaSide = 0;
    if (hole.ocean) { seaSide = hole.ocean.side; this.seaLevel = hole.ocean.level; }
    else if (style.scenery === 'ocean') { seaSide = rng.sign(); }
    const rx = Math.cos(hole.teeHeading), rz = Math.sin(hole.teeHeading);
    let base = Infinity;
    for (let s = 0; s <= hole.length; s += 25) { const p = hole.pointAtS(s); base = Math.min(base, hole.heightAt(p.x, p.z)); }
    if (seaSide && this.seaLevel === undefined) this.seaLevel = base - 6;
    const farH = (x, z, f) => {
      const out = Math.max(0, Math.max(b.minX - x, x - b.maxX, b.minZ - z, z - b.maxZ));
      const inside = Math.max(0, Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z));
      let h = hole.heightFromFields(x, z, f) - 0.7 * smoothstep(0, 18, inside);
      if (out > 0) {
        const hills = 25 * smoothstep(0, 900, out) * (0.5 + 0.5 * nz.fbm(x / 500, z / 500, 3));
        h = h + hills;
      }
      if (seaSide) {
        const lat = ((x - cx) * rx + (z - cz) * rz) * seaSide;
        const shore = hole.ocean ? -1e9 : (b.maxX - b.minX) / 2 + 180;
        if (!hole.ocean && lat > shore) h = Math.min(h, this.seaLevel + 2 - (lat - shore) * 0.12);
      }
      return h;
    };
    // Only a ring around the playable area: inside it the detailed terrain rules
    const skip = (x, z) => Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z) > 70;
    const geo = gridGeometry(hole, cx - S, cz - S, cx + S, cz + S, this.quality === 'low' ? 60 : 40, farH, skip);
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = false;
    this.group.add(m);
    this.farH = farH;
    this.seaSide = seaSide;
  }

  buildBackgroundTrees() {
    const hole = this.hole;
    const dens = hole.style.trees.density;
    if (dens < 0.2 || this.quality === 'low') return;
    const b = hole.bounds;
    const rng = new RNG(mixSeed(hole.seed, 'bgtrees'));
    const kinds = hole.style.trees.kinds;
    const out = [];
    const n = Math.round(900 * Math.min(1.4, dens));
    for (let i = 0; i < n; i++) {
      const edge = rng.int(0, 3);
      const d = rng.float(-5, 380) * (rng.next() < 0.6 ? 0.35 : 1);
      let x, z;
      if (edge === 0) { x = b.minX - d; z = rng.float(b.minZ - 300, b.maxZ + 300); }
      else if (edge === 1) { x = b.maxX + d; z = rng.float(b.minZ - 300, b.maxZ + 300); }
      else if (edge === 2) { z = b.minZ - d; x = rng.float(b.minX - 300, b.maxX + 300); }
      else { z = b.maxZ + d; x = rng.float(b.minX - 300, b.maxX + 300); }
      const f = hole.fields(x, z);
      if (f.dR < 8 || f.dO < 6 || f.dW < 4) continue;
      const y = this.farH(x, z, f);
      if (this.seaLevel !== undefined && y < this.seaLevel + 1.5) continue;
      out.push({ x, y, z, kind: rng.pick(kinds), sc: rng.float(0.8, 1.3) });
    }
    this.group.add(buildTrees(out, { shadows: false }));
  }

  buildScenery() {
    const hole = this.hole;
    const kind = hole.style.scenery;
    const b = hole.bounds;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const rng = new RNG(mixSeed(hole.course.seed, 'scenery'));
    const nz = new Noise2D(mixSeed(hole.course.seed, 'sc'));
    const N = 160;
    const pos = [];
    const col = [];
    const idx = [];
    const baseY = this.seaLevel !== undefined ? this.seaLevel : 0;
    const colors = {
      hills: ['#4d6b52', '#6f8a78'],
      alps: ['#5a6670', '#f4f6f8'],
      mesas: ['#a55a35', '#d08a5a'],
      ocean: ['#6d8a6a', '#8fa38f'],
    }[kind] || ['#4d6b52', '#6f8a78'];
    const c0 = new THREE.Color(colors[0]), c1 = new THREE.Color(colors[1]);
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const n = nz.fbm(Math.cos(a) * 3, Math.sin(a) * 3, 4) * 0.5 + 0.5;
      let hgt;
      if (kind === 'alps') hgt = 350 + 1100 * Math.pow(n, 1.4);
      else if (kind === 'mesas') hgt = n > 0.45 ? 140 + 120 * Math.round(n * 3) / 3 : 20;
      else if (kind === 'ocean') hgt = this.seaSide && Math.cos(a - (Math.atan2(Math.sin(hole.teeHeading) * this.seaSide, Math.cos(hole.teeHeading) * this.seaSide))) > 0.2 ? -30 : 60 + 160 * n;
      else hgt = 70 + 220 * n;
      const rIn = 2400, rOut = 3900 + 600 * n;
      const ca = Math.cos(a), sa = Math.sin(a);
      pos.push(cx + ca * rIn, baseY - 20, cz + sa * rIn);
      pos.push(cx + ca * (rIn + (rOut - rIn) * 0.55), baseY + hgt, cz + sa * (rIn + (rOut - rIn) * 0.55));
      pos.push(cx + ca * rOut, baseY + hgt * 0.35, cz + sa * rOut);
      const snow = kind === 'alps' ? c0.clone().lerp(c1, Math.min(1, Math.max(0, (hgt - 520) / 380))) : kind === 'mesas' ? c0.clone().lerp(c1, n) : c0;
      col.push(c0.r, c0.g, c0.b, snow.r, snow.g, snow.b, c0.r, c0.g, c0.b);
      if (i < N) {
        const k = i * 3;
        idx.push(k, k + 3, k + 1, k + 1, k + 3, k + 4, k + 1, k + 4, k + 2, k + 2, k + 4, k + 5);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.group.add(m);
  }

  buildPin() {
    const hole = this.hole;
    const pin = hole.pin;
    const grp = new THREE.Group();
    grp.position.set(pin.x, pin.y, pin.z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 2.13, 8), new THREE.MeshLambertMaterial({ color: 0xf5f5f0 }));
    pole.position.y = 1.065;
    pole.castShadow = true;
    grp.add(pole);
    const flagGeo = new THREE.PlaneGeometry(0.56, 0.38, 12, 4);
    flagGeo.translate(0.28, 0, 0);
    this.flagBase = flagGeo.attributes.position.array.slice();
    const flag = new THREE.Mesh(flagGeo, new THREE.MeshLambertMaterial({ map: flagTexture(hole.index + 1), side: THREE.DoubleSide }));
    flag.position.y = 1.93;
    flag.castShadow = true;
    grp.add(flag);
    this.flag = flag;
    // cup: dark hole with a white liner lip
    const cup = new THREE.Mesh(new THREE.CircleGeometry(0.054, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0b0d0b }));
    cup.position.y = 0.006;
    grp.add(cup);
    const lip = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.056, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe8e8e0 }));
    lip.position.y = 0.007;
    grp.add(lip);
    this.pinGroup = grp;
    this.group.add(grp);
  }

  setFlagVisible(v) {
    if (this.flag) this.flag.visible = v;
    if (this.pinGroup) this.pinGroup.children[0].visible = v;
  }

  buildMarkers() {
    const hole = this.hole;
    const white = 'white', red = 'red';
    const stakes = { white: [], red: [] };
    const addStake = (x, z, kind) => stakes[kind].push({ x, z, y: hole.heightAt(x, z) });
    // Tee markers
    const tf = { x: Math.sin(hole.tee.heading), z: -Math.cos(hole.tee.heading) };
    const tr = { x: Math.cos(hole.tee.heading), z: Math.sin(hole.tee.heading) };
    const tm = new THREE.MeshLambertMaterial({ color: 0xd4a72c });
    for (const side of [-1, 1]) {
      const x = tf.x * 2.2 + tr.x * side * 3.4, z = tf.z * 2.2 + tr.z * side * 3.4;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 0.12, 12), tm);
      s.position.set(x, hole.heightAt(x, z) + 0.06, z);
      s.castShadow = true;
      this.group.add(s);
    }
    // OB stakes
    for (const [flag, sign] of [[hole.ob.left, -1], [hole.ob.right, 1]]) {
      if (!flag) continue;
      for (let s = 10; s < hole.length + 20; s += 24) {
        const p = hole.pointAtS(s);
        const r = { x: Math.cos(p.heading), z: Math.sin(p.heading) };
        const x = p.x + r.x * hole.ob.dist * sign, z = p.z + r.z * hole.ob.dist * sign;
        if (hole.inBounds(x, z)) addStake(x, z, white);
      }
    }
    // Red penalty-area stakes around ponds
    for (const w of hole.waters) {
      if (w.type === 'creek') {
        for (let i = 0; i < w.points.length; i += 1) {
          const p = w.points[i];
          const a = w.points[Math.max(0, i - 1)], c = w.points[Math.min(w.points.length - 1, i + 1)];
          let dx = c.x - a.x, dz = c.z - a.z;
          const l = Math.hypot(dx, dz) || 1;
          dx /= l; dz /= l;
          for (const sd of [-1, 1]) {
            const x = p.x - dz * (w.half + 1.4) * sd, z = p.z + dx * (w.half + 1.4) * sd;
            if (hole.inBounds(x, z)) addStake(x, z, red);
          }
        }
      } else {
        const n = Math.round((Math.PI * (w.rx + w.rz)) / 8);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const r = 1 + w.w1 * Math.sin(3 * a + w.p1) + w.w2 * Math.sin(5 * a + w.p2);
          const u = Math.cos(a) * (w.rx * r + 1.6), v = Math.sin(a) * (w.rz * r + 1.6);
          const c = Math.cos(w.rot), s = Math.sin(w.rot);
          const x = w.x + u * c + v * s, z = w.z + u * s - v * c;
          if (hole.inBounds(x, z)) addStake(x, z, red);
        }
      }
    }
    // stakes as two instanced meshes (white = out of bounds, red = penalty area)
    const stakeGeo = new THREE.BoxGeometry(0.05, 0.9, 0.05).translate(0, 0.45, 0);
    for (const [kind, color] of [['white', 0xf3f3ee], ['red', 0xc8322c]]) {
      const list = stakes[kind];
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(stakeGeo, new THREE.MeshLambertMaterial({ color }), list.length);
      const m4 = new THREE.Matrix4();
      list.forEach((st, i) => { m4.makeTranslation(st.x, st.y, st.z); im.setMatrixAt(i, m4); });
      im.frustumCulled = false;
      this.group.add(im);
    }
    // Yardage plates (100 red, 150 white, 200 blue) on par 4s and 5s
    if (hole.par > 3) {
      const plate = new THREE.CylinderGeometry(0.28, 0.28, 0.03, 16);
      for (const [yd, color] of [[100, 0xc8322c], [150, 0xf3f3ee], [200, 0x2f5ea8]]) {
        const s = hole.length - yd * 0.9144;
        if (s < hole.fwStart) continue;
        const p = hole.pointAtS(s);
        const m = new THREE.Mesh(plate, new THREE.MeshLambertMaterial({ color }));
        m.position.set(p.x, hole.heightAt(p.x, p.z) + 0.01, p.z);
        this.group.add(m);
      }
    }
  }

  buildCrowd() {
    const hole = this.hole;
    const rng = new RNG(mixSeed(hole.seed, 'crowd'));
    const g = hole.green;
    const spots = [];
    const approach = hole.finalHeading + Math.PI;
    for (let i = 0; i < 700 && spots.length < 260; i++) {
      const a = rng.float(0, Math.PI * 2);
      const rel = Math.atan2(Math.sin(a - approach), Math.cos(a - approach));
      if (Math.abs(rel) < 0.8) continue;
      const rr = Math.max(g.rx, g.rz) + rng.float(9, 17);
      const x = g.x + Math.sin(a) * rr, z = g.z - Math.cos(a) * rr;
      const f = hole.fields(x, z);
      if (f.dB < 2 || f.dW < 3 || f.dF < 3 || f.dG < 7 || f.dO < 4) continue;
      if (hole.treesNear(x, z).some((t) => Math.hypot(t.x - x, t.z - z) < t.trunkR + 1.2)) continue;
      spots.push({ x, z, face: Math.atan2(g.x - x, g.z - z) });
    }
    // along the last 70 m of fairway
    for (let s = hole.length - 75; s < hole.length - 20; s += 2.2) {
      const p = hole.pointAtS(s);
      const r = { x: Math.cos(p.heading), z: Math.sin(p.heading) };
      for (const side of [-1, 1]) {
        if (rng.next() < 0.35) continue;
        const lat = side * (hole.fairwayHalfWidth(s, side) + rng.float(9, 14));
        const x = p.x + r.x * lat, z = p.z + r.z * lat;
        const f = hole.fields(x, z);
        if (f.dB < 2 || f.dW < 3 || f.dO < 4) continue;
        spots.push({ x, z, face: Math.atan2(p.x - x, p.z - z) });
      }
    }
    if (!spots.length) return;
    for (const sp of spots) sp.y = hole.heightAt(sp.x, sp.z);
    this.crowd = buildPeople(spots, mixSeed(hole.seed, 'people'));
    this.group.add(this.crowd.group);
    // Marshals with "Quiet please" paddles either side of the green front
    const g2 = hole.green;
    const ms = [];
    for (const side of [-1, 1]) {
      const a = hole.finalHeading + Math.PI + side * 1.0;
      const rr = Math.max(g2.rx, g2.rz) + 7;
      const x = g2.x + Math.sin(a) * rr, z = g2.z - Math.cos(a) * rr;
      const f = hole.fields(x, z);
      if (f.dB > 1 && f.dW > 2) ms.push({ x, z, y: hole.heightAt(x, z), face: Math.atan2(g2.x - x, g2.z - z) });
    }
    // and one at the tee
    const tr = { x: Math.cos(hole.tee.heading), z: Math.sin(hole.tee.heading) };
    const side = hole.cartPath ? -hole.cartPath.side : 1;
    ms.push({ x: tr.x * 9 * side, z: tr.z * 9 * side, y: hole.heightAt(tr.x * 9 * side, tr.z * 9 * side), face: Math.atan2(-tr.x * side, -tr.z * side) });
    this.marshals = buildMarshals(ms, mixSeed(hole.seed, 'marshal'));
    this.group.add(this.marshals.group);
    // TV camera tower off the back corner of the green
    if (this.quality !== 'low') {
      const a = hole.finalHeading + rng.sign() * 2.2;
      const rr = Math.max(g2.rx, g2.rz) + 24;
      const x = g2.x + Math.sin(a) * rr, z = g2.z - Math.cos(a) * rr;
      const f = hole.fields(x, z);
      if (f.dW > 4 && f.dB > 3 && f.dO > 4 && hole.inBounds(x, z)) {
        this.group.add(buildCameraTower(x, hole.heightAt(x, z), z, Math.atan2(g2.x - x, g2.z - z)));
      }
    }
  }

  cheer(strength = 1) {
    if (this.crowd) this.crowd.cheer(strength);
    if (this.standPeople) this.standPeople.cheer(strength);
  }

  update(dt, wind) {
    this.uniforms.uTime.value += dt;
    TREE_UNIFORMS.uTime.value += dt;
    TREE_UNIFORMS.uWind.value.set(wind.x, wind.z);
    for (const b of this.birds || []) b.update(dt);
    if (this.crowd) this.crowd.update(dt);
    if (this.standPeople) this.standPeople.update(dt);
    for (const c of this.carts || []) c.update(dt);
    for (const f of this.fountains || []) f.update(dt);
    if (this.flag) {
      // Point the flag downwind and ripple it
      const speed = Math.hypot(wind.x, wind.z);
      const dir = Math.atan2(wind.x, -wind.z);
      this.flag.rotation.y = -dir - Math.PI / 2 + (speed < 0.5 ? 0.6 : 0);
      const arr = this.flag.geometry.attributes.position.array;
      const base = this.flagBase;
      const t = this.uniforms.uTime.value;
      const amp = 0.02 + Math.min(0.09, speed * 0.012);
      const droop = Math.max(0, 1 - speed / 5) * 0.25;
      for (let i = 0; i < arr.length; i += 3) {
        const u = base[i] / 0.56;
        arr[i + 2] = Math.sin(u * 7 - t * (4 + speed)) * amp * u;
        arr[i + 1] = base[i + 1] - droop * u * u;
      }
      this.flag.geometry.attributes.position.needsUpdate = true;
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) { if (m.map) m.map.dispose(); m.dispose(); }
      }
    });
  }
}
