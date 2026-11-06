import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { G } from '../core/G.js';
import { mulberry32 } from '../core/noise.js';
import { NIGHT_UNIFORM, TIME_UNIFORM, addCompileHook } from '../core/shaderlib.js';

// ---------------------------------------------------------------------------
// Shared architectural materials
// ---------------------------------------------------------------------------
export let MATS = null;
export function initMaterials() {
  const T = G.tex;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const tinted = (tex, color, rough = 0.85, extra = {}) => std({ map: tex.map, normalMap: tex.normalMap, color, roughness: rough, ...extra });
  MATS = {
    stone: tinted(T.stone, 0xffffff, 0.9),
    stoneDark: tinted(T.darkStone, 0xffffff, 0.92),
    charred: tinted(T.stone, 0x3a3230, 0.95),
    marble: tinted(T.marble, 0xffffff, 0.35),
    marbleDark: tinted(T.marble, 0x4a4450, 0.5),
    marbleStar: tinted(T.marble, 0xb8c0ff, 0.3),
    brick: tinted(T.brick, 0xffffff, 0.9),
    plaster: tinted(T.plaster, 0xf2e8d8, 0.95),
    plasterBlue: tinted(T.plaster, 0xc8d4e0, 0.95),
    wood: tinted(T.wood, 0xffffff, 0.8),
    woodDark: tinted(T.wood, 0x5a4a40, 0.85),
    woodBurnt: tinted(T.wood, 0x2a2220, 0.95),
    roof: tinted(T.roof, 0xffffff, 0.75),
    roofBlue: tinted(T.slate, 0x9fb4d8, 0.6),
    slate: tinted(T.slate, 0xffffff, 0.65),
    thatch: tinted(T.thatch, 0xffffff, 0.95),
    cobble: tinted(T.cobble, 0xffffff, 0.85),
    rock: tinted(T.rock, 0xa09a92, 0.9),
    rockStar: tinted(T.rock, 0x8a88b0, 0.7),
    gold: std({ color: 0xe8c068, metalness: 1, roughness: 0.28, map: T.metal.map }),
    bronze: std({ color: 0xb07840, metalness: 1, roughness: 0.4, map: T.metal.map }),
    iron: std({ color: 0x6a707a, metalness: 0.9, roughness: 0.5, map: T.metal.map }),
    cloth: std({ color: 0xc0392b, roughness: 0.95, map: T.cloth.map, side: THREE.DoubleSide }),
    clothBlue: std({ color: 0x2c4a8a, roughness: 0.95, map: T.cloth.map, side: THREE.DoubleSide }),
    clothGreen: std({ color: 0x3a7a3a, roughness: 0.95, map: T.cloth.map, side: THREE.DoubleSide }),
    clothCream: std({ color: 0xe8dcc0, roughness: 0.95, map: T.cloth.map, side: THREE.DoubleSide }),
    clothWhite: std({ color: 0xeef0ff, roughness: 0.9, map: T.cloth.map, side: THREE.DoubleSide, emissive: 0x223355, emissiveIntensity: 0.3 }),
    clothCovenant: std({ color: 0x1e2a4a, roughness: 0.95, map: T.cloth.map, side: THREE.DoubleSide }),
    window: std({ color: 0x221a10, emissive: 0xffb050, emissiveIntensity: 0.2, roughness: 0.3 }),
    rune: std({ color: 0x0a1a2a, emissive: 0x5ad8ff, emissiveIntensity: 2.2, roughness: 0.4 }),
    runeGold: std({ color: 0x2a1a0a, emissive: 0xffc860, emissiveIntensity: 2.0, roughness: 0.4 }),
    runeEmber: std({ color: 0x2a0a0a, emissive: 0xff6a2a, emissiveIntensity: 2.4, roughness: 0.4 }),
    lava: std({ color: 0x200500, emissive: 0xff5a10, emissiveIntensity: 3, roughness: 0.6 }),
    crystal: std({ color: 0x6ab8ff, emissive: 0x3a8aff, emissiveIntensity: 1.4, roughness: 0.12, metalness: 0.1 }),
    crystalPink: std({ color: 0xd08aff, emissive: 0x9a4aff, emissiveIntensity: 1.3, roughness: 0.12 }),
    obsidian: std({ color: 0x12101a, roughness: 0.15, metalness: 0.3 }),
    heart: std({ color: 0xfff0c0, emissive: 0xffd070, emissiveIntensity: 6, roughness: 0.2 }),
    heartAsh: std({ color: 0x401010, emissive: 0xff3a10, emissiveIntensity: 3, roughness: 0.4 }),
    heartStar: std({ color: 0x101040, emissive: 0x7a8aff, emissiveIntensity: 5, roughness: 0.2 }),
    hay: std({ color: 0xd8b860, roughness: 1, map: T.thatch.map }),
    leafy: std({ color: 0x3a6a2a, roughness: 0.9, map: T.leaf.map }),
    moss: std({ color: 0x1a4a5a, emissive: 0x0a3a4a, emissiveIntensity: 0.6, roughness: 0.9, map: T.leaf.map }),
    lamp: std({ color: 0xffe0a0, emissive: 0xffc070, emissiveIntensity: 3 }),
    sand: tinted(T.cobble, 0xd8c8a0, 0.95),
  };
  // windows & lamps brighten at night
  for (const k of ['window', 'lamp']) {
    const m = MATS[k];
    addCompileHook(m, (shader) => {
      shader.uniforms.uNightS = NIGHT_UNIFORM;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uNightS;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= (0.15 + uNightS * 1.6);');
    }, 'night' + k);
  }
  for (const k of ['rune', 'runeGold', 'runeEmber', 'lava']) {
    const m = MATS[k];
    addCompileHook(m, (shader) => {
      shader.uniforms.uTimeS = TIME_UNIFORM;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTimeS;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= (0.75 + 0.25 * sin(uTimeS * 2.0 + vViewPosition.x * 0.3));');
    }, 'pulse' + k);
  }
  return MATS;
}

// ---------------------------------------------------------------------------
// Geometry builder: accumulates primitives per material, merges on build.
// ---------------------------------------------------------------------------
const TEX_SCALE = 2.6;
function scaleBoxUV(g, w, h, d, ts = TEX_SCALE) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const f = Math.floor(i / 4);
    let su = 1, sv = 1;
    if (f < 2) { su = d / ts; sv = h / ts; }
    else if (f < 4) { su = w / ts; sv = d / ts; }
    else { su = w / ts; sv = h / ts; }
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
}

export class Builder {
  constructor(name = 'structure') {
    this.name = name;
    this.parts = new Map();
    this.cols = [];
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.anims = [];
    this.extras = [];
  }
  _add(mat, g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    this.e.set(rx, ry, rz);
    this.q.setFromEuler(this.e);
    this.m.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(sx, sy, sz));
    g.applyMatrix4(this.m);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const ng = g.index ? g.toNonIndexed() : g;
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(ng);
    return ng;
  }
  box(mat, w, h, d, x, y, z, ry = 0, o = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    scaleBoxUV(g, w, h, d, o.ts);
    this._add(mat, g, x, y + h / 2, z, o.rx || 0, ry, o.rz || 0);
    if (o.collide !== false && !o.rx && !o.rz) this.cols.push({ type: 'box', x, y: y + h / 2, z, hx: w / 2, hy: h / 2, hz: d / 2, ry, climbable: o.climbable !== false, tag: o.tag || 'stone' });
    return this;
  }
  cyl(mat, rt, rb, h, x, y, z, seg = 12, o = {}) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!o.open);
    const uv = g.attributes.uv;
    const circ = Math.PI * 2 * Math.max(rt, rb);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ / TEX_SCALE, uv.getY(i) * h / TEX_SCALE);
    this._add(mat, g, x, y + h / 2, z, o.rx || 0, o.ry || 0, o.rz || 0);
    if (o.collide !== false) this.cols.push({ type: 'cyl', x, z, y0: y, y1: y + h, r: Math.max(rt, rb) * 0.95, climbable: o.climbable !== false, tag: o.tag || 'stone' });
    return this;
  }
  cone(mat, r, h, x, y, z, seg = 12, o = {}) {
    const g = new THREE.ConeGeometry(r, h, seg, 1);
    this._add(mat, g, x, y + h / 2, z, o.rx || 0, o.ry || 0, o.rz || 0);
    return this;
  }
  sphere(mat, r, x, y, z, o = {}) {
    const g = new THREE.SphereGeometry(r, o.seg || 12, o.seg ? o.seg * 0.7 : 8, 0, Math.PI * 2, 0, o.half ? Math.PI / 2 : Math.PI);
    this._add(mat, g, x, y, z, 0, 0, 0, o.sx || 1, o.sy || 1, o.sz || 1);
    return this;
  }
  // gable roof: ridge along local X
  roof(mat, w, d, h, x, y, z, ry = 0, over = 0.35) {
    const W = w / 2 + over, D = d / 2 + over;
    const pos = [
      // two slopes
      -W, 0, -D, W, 0, -D, W, h, 0, -W, 0, -D, W, h, 0, -W, h, 0,
      -W, 0, D, -W, h, 0, W, h, 0, -W, 0, D, W, h, 0, W, 0, D,
      // underside
      -W, 0, -D, W, 0, D, W, 0, -D, -W, 0, -D, -W, 0, D, W, 0, D,
    ];
    const slope = Math.hypot(h, D);
    const uvs = [
      0, 0, w / TEX_SCALE, 0, w / TEX_SCALE, slope / TEX_SCALE, 0, 0, w / TEX_SCALE, slope / TEX_SCALE, 0, slope / TEX_SCALE,
      0, 0, 0, slope / TEX_SCALE, w / TEX_SCALE, slope / TEX_SCALE, 0, 0, w / TEX_SCALE, slope / TEX_SCALE, w / TEX_SCALE, 0,
      0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1,
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    this._add(mat, g, x, y, z, 0, ry);
    // gable triangles (wall material handled by caller)
    this.cols.push({ type: 'box', x, y: y + h * 0.35, z, hx: (w / 2) * 0.95, hy: h * 0.35, hz: (d / 2) * 0.6, ry, climbable: true, tag: 'wood' });
    return this;
  }
  gable(mat, w, h, x, y, z, ry) {
    const g = new THREE.BufferGeometry();
    const pos = [-w / 2, 0, 0, w / 2, 0, 0, 0, h, 0];
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, w / TEX_SCALE, 0, w / 2 / TEX_SCALE, h / TEX_SCALE], 2));
    g.computeVertexNormals();
    const g2 = g.clone();
    this._add(mat, g, x, y, z, 0, ry);
    this._add(mat, g2, x, y, z, 0, ry + Math.PI);
    return this;
  }
  geo(mat, g, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) {
    this._add(mat, g, x, y, z, rx, ry, rz, s, s, s);
    return this;
  }
  collider(c) {
    this.cols.push(c);
    return this;
  }
  build(opts = {}) {
    const group = new THREE.Group();
    group.name = this.name;
    for (const [mat, list] of this.parts) {
      const g = mergeGeometries(list);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = opts.shadows !== false;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    const cols = [];
    for (const c of this.cols) {
      let col;
      if (c.type === 'box') col = G.collision.addBox(c.x, c.y, c.z, c.hx, c.hy, c.hz, c.ry, { climbable: c.climbable, tag: c.tag, ramp: c.ramp });
      else col = G.collision.addCyl(c.x, c.z, c.y0, c.y1, c.r, { climbable: c.climbable, tag: c.tag });
      if (c.bounce) col.bounce = true;
      cols.push(col);
    }
    return { group, cols, anims: this.anims, extras: this.extras };
  }
}

// ---------------------------------------------------------------------------
// Epoch-aware site: up to three variants; toggles meshes & colliders.
// ---------------------------------------------------------------------------
export class Site {
  constructor(name, x, z) {
    this.name = name;
    this.x = x;
    this.z = z;
    this.variants = [null, null, null];
    this.always = null;
  }
  set(epochs, built) {
    for (const e of epochs) this.variants[e] = built;
    built.epochs = epochs;
    G.scene.add(built.group);
    built.group.visible = false;
    for (const c of built.cols) c.active = false;
    return built;
  }
  setAlways(built) {
    this.always = built;
    G.scene.add(built.group);
    return built;
  }
  apply(e) {
    const seen = new Set();
    for (let i = 0; i < 3; i++) {
      const v = this.variants[i];
      if (!v || seen.has(v)) continue;
      seen.add(v);
      const on = v.epochs.includes(e);
      v.group.visible = on;
      for (const c of v.cols) c.active = on;
      if (on && v.onShow) v.onShow();
    }
    this.epoch = e;
  }
  register() {
    G.epochs.register(this);
    return this;
  }
  current() {
    return this.variants[this.epoch] || null;
  }
}

// ---------------------------------------------------------------------------
// Building blocks of the world
// ---------------------------------------------------------------------------
export function house(b, x, y, z, ry, o = {}) {
  const rng = mulberry32(o.seed || 1);
  const w = o.w || 6 + rng() * 3, d = o.d || 5 + rng() * 2, h = o.h || 3.2 + rng() * 0.8;
  const state = o.state || 'intact';
  const wallMat = o.wall || MATS.plaster;
  const c = Math.cos(ry), s = Math.sin(ry);
  const L = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  // foundation
  b.box(MATS.stone, w + 0.4, 0.6, d + 0.4, x, y - 0.2, z, ry, { tag: 'stone' });
  if (state === 'intact') {
    b.box(wallMat, w, h, d, x, y + 0.4, z, ry, { tag: 'stone' });
    // timber frame beams
    const beam = MATS.woodDark;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const [px, pz] = L((sx * w) / 2, (sz * d) / 2);
      b.box(beam, 0.24, h, 0.24, px, y + 0.4, pz, ry, { collide: false });
    }
    for (const sz of [-1, 1]) {
      const [px, pz] = L(0, (sz * d) / 2 + sz * 0.02);
      b.box(beam, w, 0.2, 0.08, px, y + 0.4 + h - 0.2, pz, ry, { collide: false });
      b.box(beam, w, 0.16, 0.08, px, y + 0.4 + h * 0.48, pz, ry, { collide: false });
    }
    // door + windows on the front (+z local)
    {
      const [px, pz] = L(0, d / 2 + 0.04);
      b.box(MATS.woodDark, 1.1, 2.0, 0.1, px, y + 0.4, pz, ry, { collide: false });
      const [qx, qz] = L(0, d / 2 + 0.09);
      b.box(MATS.iron, 0.08, 0.08, 0.06, qx + c * 0.35, y + 1.4, qz - s * 0.35, ry, { collide: false });
    }
    for (const sx of [-1, 1]) {
      const [px, pz] = L(sx * w * 0.3, d / 2 + 0.05);
      b.box(MATS.window, 0.8, 0.9, 0.08, px, y + 1.6, pz, ry, { collide: false });
      b.box(MATS.woodDark, 1.0, 0.1, 0.18, px, y + 1.5, pz, ry, { collide: false });
      // flower box
      if (rng() < 0.7) {
        const [fx, fz] = L(sx * w * 0.3, d / 2 + 0.22);
        b.box(MATS.wood, 0.9, 0.22, 0.25, fx, y + 1.25, fz, ry, { collide: false });
        for (let k = 0; k < 4; k++) b.sphere(rng() < 0.5 ? MATS.cloth : MATS.leafy, 0.1, fx + c * (k - 1.5) * 0.2, y + 1.52, fz - s * (k - 1.5) * 0.2);
      }
      const [bx, bz] = L(sx * w * 0.3, -d / 2 - 0.05);
      b.box(MATS.window, 0.8, 0.9, 0.08, bx, y + 1.6, bz, ry, { collide: false });
    }
    // side windows
    for (const sx of [-1, 1]) {
      const [px, pz] = L(sx * (w / 2 + 0.05), 0);
      b.box(MATS.window, 0.08, 0.9, 0.8, px, y + 1.6, pz, ry, { collide: false });
    }
    // roof
    const rh = 1.8 + d * 0.15;
    b.roof(o.roof || MATS.roof, w, d, rh, x, y + 0.4 + h, z, ry + Math.PI / 2 * 0, 0.45);
    b.gable(wallMat, d, rh, ...L(w / 2, 0), y + 0.4 + h, ry + Math.PI / 2);
    b.gable(wallMat, d, rh, ...L(-w / 2, 0), y + 0.4 + h, ry - Math.PI / 2);
    // chimney
    if (o.chimney !== false) {
      const [cx, cz] = L(w * 0.28, -d * 0.15);
      b.box(MATS.brick, 0.7, rh + 1.4, 0.7, cx, y + 0.4 + h, cz, ry, { collide: false });
      b.extras.push({ type: 'chimney', x: cx, y: y + 0.4 + h + rh + 1.4, z: cz });
    }
  } else if (state === 'ruined') {
    // broken walls with jagged tops, charred beams, rubble
    const segs = 6;
    for (const [lx0, lz0, lx1, lz1] of [[-w / 2, d / 2, w / 2, d / 2], [w / 2, d / 2, w / 2, -d / 2], [w / 2, -d / 2, -w / 2, -d / 2], [-w / 2, -d / 2, -w / 2, d / 2]]) {
      const len = Math.hypot(lx1 - lx0, lz1 - lz0);
      for (let i = 0; i < segs; i++) {
        if (rng() < 0.18) continue;
        const t = (i + 0.5) / segs;
        const lx = lx0 + (lx1 - lx0) * t, lz = lz0 + (lz1 - lz0) * t;
        const sh = h * (0.25 + rng() * 0.8);
        const [px, pz] = L(lx, lz);
        const along = Math.atan2(lx1 - lx0, lz1 - lz0);
        b.box(o.ruinWall || MATS.charred, len / segs + 0.05, sh, 0.35, px, y + 0.4, pz, ry + along + Math.PI / 2, { tag: 'stone' });
      }
    }
    for (let i = 0; i < 3; i++) {
      const [px, pz] = L((rng() - 0.5) * w * 0.8, (rng() - 0.5) * d * 0.8);
      b.box(MATS.woodBurnt, 0.2, 0.2, w * 0.9, px, y + 0.5 + rng() * 1.5, pz, ry + rng(), { rx: (rng() - 0.5) * 0.8, collide: false });
    }
    for (let i = 0; i < 4; i++) {
      const [px, pz] = L((rng() - 0.5) * w * 1.3, (rng() - 0.5) * d * 1.3);
      b.box(MATS.charred, 0.5 + rng() * 0.6, 0.3 + rng() * 0.4, 0.5 + rng() * 0.5, px, y + 0.3, pz, rng() * 3, { collide: false });
    }
  } else {
    // ancient: low mossy foundations with glowing moss
    for (const [lx0, lz0, lx1, lz1] of [[-w / 2, d / 2, w / 2, d / 2], [w / 2, d / 2, w / 2, -d / 2], [w / 2, -d / 2, -w / 2, -d / 2], [-w / 2, -d / 2, -w / 2, d / 2]]) {
      const len = Math.hypot(lx1 - lx0, lz1 - lz0);
      const [px, pz] = L((lx0 + lx1) / 2, (lz0 + lz1) / 2);
      const along = Math.atan2(lx1 - lx0, lz1 - lz0);
      const hh = 0.5 + rng() * 0.9;
      b.box(MATS.stone, len, hh, 0.35, px, y + 0.4, pz, ry + along + Math.PI / 2, { tag: 'stone' });
      b.box(MATS.moss, len * 0.9, 0.08, 0.4, px, y + 0.4 + hh, pz, ry + along + Math.PI / 2, { collide: false });
    }
  }
  return { w, d, h };
}

export function tent(b, x, y, z, ry, mat, size = 1) {
  const w = 2.6 * size, d = 3.2 * size, h = 2.2 * size;
  const c = Math.cos(ry), s = Math.sin(ry);
  const g = new THREE.BufferGeometry();
  const W = w / 2, D = d / 2;
  const pos = [-W, 0, -D, 0, h, -D, 0, h, D, -W, 0, -D, 0, h, D, -W, 0, D, W, 0, -D, W, 0, D, 0, h, D, W, 0, -D, 0, h, D, 0, h, -D,
    -W, 0, -D, W, 0, -D, 0, h, -D];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(pos.map((v, i) => (i % 3 === 0 ? v * 0.4 : v * 0.4)).filter((_, i) => i % 3 !== 2), 2));
  g.computeVertexNormals();
  b.geo(mat, g, x, y, z, 0, ry);
  b.cyl(MATS.wood, 0.05, 0.05, h + 0.3, x + s * (D + 0.05), y, z + c * (D + 0.05), 6, { collide: false });
  b.collider({ type: 'box', x, y: y + h * 0.4, z, hx: W * 0.8, hy: h * 0.4, hz: D * 0.95, ry, climbable: false, tag: 'wood' });
}

export function campfire(b, x, y, z, o = {}) {
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    b.geo(MATS.stone, new THREE.DodecahedronGeometry(0.22, 0), x + Math.cos(a) * 0.75, y + 0.12, z + Math.sin(a) * 0.75, i, i * 2, 0);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    b.cyl(MATS.woodBurnt, 0.08, 0.1, 1.1, x + Math.cos(a) * 0.2, y + 0.05, z + Math.sin(a) * 0.2, 6, { rx: Math.PI / 2 - 0.5, ry: a, collide: false });
  }
  if (o.seats !== false) {
    for (const a of [0.6, 2.4, 4.3]) b.cyl(MATS.wood, 0.25, 0.25, 1.6, x + Math.cos(a) * 2.1, y + 0.25, z + Math.sin(a) * 2.1, 8, { rz: Math.PI / 2, ry: a + Math.PI / 2, collide: false });
  }
  b.extras.push({ type: 'fire', x, y: y + 0.2, z, size: o.size || 1 });
}

export function well(b, x, y, z) {
  b.cyl(MATS.stone, 1.2, 1.25, 0.9, x, y, z, 16, { tag: 'stone' });
  b.cyl(MATS.woodDark, 1.0, 1.0, 0.05, x, y + 0.88, z, 16, { collide: false });
  for (const sx of [-1, 1]) b.box(MATS.wood, 0.15, 2.0, 0.15, x + sx * 1.0, y + 0.9, z, 0, { collide: false });
  b.box(MATS.wood, 2.3, 0.15, 0.15, x, y + 2.8, z, 0, { collide: false });
  b.roof(MATS.roof, 2.6, 1.6, 0.8, x, y + 2.9, z, 0, 0.1);
}

export function stall(b, x, y, z, ry, cloth) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const L = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  b.box(MATS.wood, 2.6, 0.9, 1.2, x, y, z, ry, { tag: 'wood' });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const [px, pz] = L(sx * 1.3, sz * 0.6);
    b.box(MATS.woodDark, 0.1, sz > 0 ? 2.2 : 2.6, 0.1, px, y, pz, ry, { collide: false });
  }
  const g = new THREE.PlaneGeometry(3.0, 1.8, 6, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / 3 + 0.5) * Math.PI * 6) * 0.06);
  g.computeVertexNormals();
  b.geo(cloth, g, ...[L(0, 0)[0]], y + 2.45, L(0, 0)[1], -Math.PI / 2 + 0.2, ry, 0);
  // goods
  for (let i = 0; i < 5; i++) {
    const [px, pz] = L(-1 + i * 0.5, 0);
    const kind = i % 3;
    if (kind === 0) b.sphere(MATS.cloth, 0.14, px, y + 1.05, pz);
    else if (kind === 1) b.box(MATS.hay, 0.3, 0.2, 0.3, px, y + 0.9, pz, 0, { collide: false });
    else b.sphere(MATS.leafy, 0.15, px, y + 1.05, pz);
  }
}

export function fence(b, x0, z0, x1, z1, y0fn, mat = MATS.wood) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 2.2));
  const ang = Math.atan2(x1 - x0, z1 - z0);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
    b.box(mat, 0.16, 1.2, 0.16, px, y0fn(px, pz) - 0.1, pz, ang, { collide: false });
  }
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
    const y = y0fn(px, pz);
    b.box(mat, 0.08, 0.12, len / n + 0.1, px, y + 0.75, pz, ang, { collide: false });
    b.box(mat, 0.08, 0.12, len / n + 0.1, px, y + 0.35, pz, ang, { collide: false });
  }
  b.collider({ type: 'box', x: (x0 + x1) / 2, y: y0fn((x0 + x1) / 2, (z0 + z1) / 2) + 0.55, z: (z0 + z1) / 2, hx: 0.12, hy: 0.55, hz: len / 2, ry: ang, climbable: true, tag: 'wood' });
}

export function lamppost(b, x, y, z) {
  b.cyl(MATS.iron, 0.06, 0.09, 3.2, x, y, z, 6, { collide: false });
  b.box(MATS.iron, 0.5, 0.06, 0.06, x + 0.2, y + 3.1, z, 0, { collide: false });
  b.box(MATS.lamp, 0.24, 0.32, 0.24, x + 0.42, y + 2.75, z, 0, { collide: false });
  b.collider({ type: 'cyl', x, z, y0: y, y1: y + 3, r: 0.12, climbable: false });
  b.extras.push({ type: 'lamp', x: x + 0.42, y: y + 2.9, z });
}

export function barrelsCrates(b, x, y, z, rng, n = 3) {
  for (let i = 0; i < n; i++) {
    const px = x + (rng() - 0.5) * 2, pz = z + (rng() - 0.5) * 2;
    if (rng() < 0.5) b.cyl(MATS.wood, 0.35, 0.38, 0.9, px, y, pz, 10, { tag: 'wood' });
    else b.box(MATS.wood, 0.8, 0.8, 0.8, px, y, pz, rng() * 3, { tag: 'wood' });
  }
}

export function banner(b, x, y, z, ry, mat, h = 4) {
  b.cyl(MATS.woodDark, 0.06, 0.06, h, x, y, z, 6, { collide: false });
  const g = new THREE.PlaneGeometry(0.9, 1.8, 1, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getY(i) * 2) * 0.08);
  g.computeVertexNormals();
  const c = Math.cos(ry), s = Math.sin(ry);
  b.geo(mat, g, x + c * 0.5, y + h - 1.0, z - s * 0.5, 0, ry, 0);
}

export function rubble(b, x, y, z, rng, n = 6, mat = MATS.stone) {
  for (let i = 0; i < n; i++) {
    const g = new THREE.DodecahedronGeometry(0.25 + rng() * 0.5, 0);
    b.geo(mat, g, x + (rng() - 0.5) * 3, y + 0.1, z + (rng() - 0.5) * 3, rng() * 3, rng() * 3, 0);
  }
}

// Obelisk tower climbed for the view (BotW-style).
export function pillar(b, x, y, z, style) {
  const mat = style === 'ash' ? MATS.charred : style === 'stars' ? MATS.marbleStar : MATS.marble;
  const rune = style === 'ash' ? MATS.runeEmber : style === 'stars' ? MATS.rune : MATS.runeGold;
  b.box(MATS.stone, 9, 1.5, 9, x, y - 0.5, z, 0);
  b.box(mat, 5, 38, 5, x, y + 1, z, 0, { tag: 'stone' });
  for (let i = 1; i <= 4; i++) {
    b.box(mat, 6.6, 0.6, 6.6, x, y + 1 + i * 8.5, z, 0, { tag: 'stone' });
    for (const [sx, sz] of [[0, 2.55], [0, -2.55], [2.55, 0], [-2.55, 0]]) b.box(rune, sx ? 0.06 : 1.2, 3, sz ? 0.06 : 1.2, x + sx, y + 3 + (i - 1) * 8.5, z + sz, 0, { collide: false });
  }
  b.box(mat, 8, 1, 8, x, y + 39, z, 0, { tag: 'stone' });
  b.cyl(MATS.gold, 0.8, 1.0, 1.2, x, y + 40, z, 10);
  if (style === 'stars') b.geo(MATS.crystal, new THREE.OctahedronGeometry(1.2, 0), x, y + 43, z, 0, 0, 0, 1);
  else if (style === 'ash') b.geo(MATS.lava, new THREE.IcosahedronGeometry(0.7, 0), x, y + 42, z);
  else b.geo(MATS.heart, new THREE.IcosahedronGeometry(0.6, 1), x, y + 42, z);
  b.extras.push({ type: 'beacon', x, y: y + 42, z, style });
}
