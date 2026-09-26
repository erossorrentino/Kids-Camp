// Surroundings: ground cover (grass tufts, wildflowers, fescue, heather,
// desert shrubs, rocks, reeds by the water), the cart path, tee furniture
// (hole sign with a map, ball washer, bench), clubhouse, homes behind the
// out-of-bounds stakes, a tournament grandstand with scoreboard, and birds.
import * as THREE from '../../vendor/three.module.min.js';
import { RNG, mixSeed, clamp } from '../util/rng.js';
import { mergeGeos, TREE_UNIFORMS } from './trees.js';
import { buildPeople } from './people.js';

const UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------ geometries
function colorize(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = fn(p.getX(i), p.getY(i), p.getZ(i), i);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

// A clump of grass blades: thin triangles leaning outwards
function bladeClump(rng, { blades = 6, h = 0.45, w = 0.05, base = '#3f7428', tip = '#7fae4a', spread = 0.12 }) {
  const pos = [];
  for (let i = 0; i < blades; i++) {
    const a = rng.float(0, Math.PI * 2);
    const lean = rng.float(0.15, 0.5);
    const hh = h * rng.float(0.7, 1.2);
    const ox = Math.cos(a) * rng.float(0, spread), oz = Math.sin(a) * rng.float(0, spread);
    const px = Math.cos(a + Math.PI / 2) * w, pz = Math.sin(a + Math.PI / 2) * w;
    const tx = ox + Math.cos(a) * hh * lean, tz = oz + Math.sin(a) * hh * lean;
    pos.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, tx, hh, tz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // light from above regardless of blade facing
  const n = g.attributes.normal.array;
  for (let i = 0; i < n.length; i += 3) { n[i] *= 0.3; n[i + 1] = 1; n[i + 2] *= 0.3; }
  const cb = new THREE.Color(base), ct = new THREE.Color(tip);
  return colorize(g, (x, y) => cb.clone().lerp(ct, clamp(y / h, 0, 1)));
}

function flowerGeo(rng, petal) {
  const stem = bladeClump(rng, { blades: 4, h: 0.32, w: 0.025, base: '#3f7428', tip: '#5e8f38', spread: 0.08 });
  const parts = [stem];
  const pc = new THREE.Color(petal);
  for (let i = 0; i < 4; i++) {
    const g = new THREE.OctahedronGeometry(0.045, 0);
    g.translate(rng.float(-0.1, 0.1), rng.float(0.26, 0.36), rng.float(-0.1, 0.1));
    parts.push(colorize(g, () => pc));
  }
  return mergeGeos(parts);
}

function rockGeo(rng, color) {
  const g = new THREE.DodecahedronGeometry(1, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * rng.float(0.8, 1.2), p.getY(i) * rng.float(0.5, 0.8), p.getZ(i) * rng.float(0.8, 1.2));
  g.computeVertexNormals();
  const c = new THREE.Color(color);
  return colorize(g, (x, y) => c.clone().multiplyScalar(0.8 + 0.25 * (y + 1) / 2));
}

function domeGeo(color, jitter = 0.1) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  g.scale(1, 0.6, 1);
  g.translate(0, 0.25, 0);
  const c = new THREE.Color(color);
  const r = new RNG(9);
  return colorize(g, (x, y) => c.clone().multiplyScalar(0.7 + 0.45 * clamp(y, 0, 1) + (r.next() - 0.5) * jitter));
}

function reedGeo(rng) {
  const g = bladeClump(rng, { blades: 9, h: 1.3, w: 0.03, base: '#4b5e2a', tip: '#9ea664', spread: 0.25 });
  const parts = [g];
  const brown = new THREE.Color('#5b3b22');
  for (let i = 0; i < 3; i++) {
    const c = new THREE.CylinderGeometry(0.04, 0.04, 0.22, 6);
    c.translate(rng.float(-0.2, 0.2), rng.float(1.05, 1.35), rng.float(-0.2, 0.2));
    parts.push(colorize(c, () => brown));
  }
  return mergeGeos(parts);
}

function swayMat(double = true, amp = 1) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: double ? THREE.DoubleSide : THREE.FrontSide });
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
          float k = max(transformed.y, 0.0);
          float s = sin(uTime * 2.2 + ip.x * 0.8 + ip.y * 0.6);
          transformed.xz += (normalize(uWind + vec2(0.0001)) * (0.6 + 0.4 * s)) * k * (0.05 + length(uWind) * 0.02) * ${amp.toFixed(2)};
        }`);
  };
  m.customProgramCacheKey = () => `grass-sway-${amp}`;
  return m;
}

function instanced(geo, mat, items, { shadow = false } = {}) {
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  items.forEach((it, i) => {
    q.setFromAxisAngle(UP, it.rot || 0);
    s.set(it.sx || it.s, it.sy || it.s, it.sz || it.s);
    p.set(it.x, it.y, it.z);
    m4.compose(p, q, s);
    mesh.setMatrixAt(i, m4);
    c.set(it.color || '#ffffff');
    mesh.setColorAt(i, c);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = shadow;
  mesh.frustumCulled = false;
  return mesh;
}

// ------------------------------------------------------------ ground cover
export function buildGroundCover(hole, quality) {
  const group = new THREE.Group();
  if (quality === 'low') return group;
  const q = quality === 'high' ? 1 : 0.5;
  const rng = new RNG(mixSeed(hole.seed, 'cover'));
  const st = hole.styleName;
  const style = hole.style;
  const L = hole.length;
  const tufts = [], flowers = { white: [], yellow: [], purple: [], pink: [] }, fescue = [], heather = [], rocks = [], shrubs = [], reeds = [], gorse = [];
  const inTree = (x, z) => hole.treesNear(x, z).some((t) => Math.hypot(t.x - x, t.z - z) < t.trunkR + 0.4);
  const place = (x, z) => ({ x, z, y: hole.heightAt(x, z) - 0.02, rot: rng.float(0, Math.PI * 2) });
  const N = Math.round(9000 * q);
  for (let i = 0; i < N; i++) {
    const s = rng.float(-15, L + 25);
    const pt = hole.pointAtS(s);
    const r = { x: Math.cos(pt.heading), z: Math.sin(pt.heading) };
    // before the fairway starts the whole corridor is rough, so fill it too
    const inner = s < hole.fwStart - 4 && s > 14 ? 0 : hole.fwHalf + 2;
    const lat = rng.sign() * rng.float(inner, hole.fwHalf + hole.roughW + 45);
    const x = pt.x + r.x * lat + rng.float(-3, 3), z = pt.z + r.z * lat + rng.float(-3, 3);
    if (!hole.inBounds(x, z)) continue;
    const f = hole.fields(x, z);
    if (f.dF < 2.4 || f.dG < 2.5 || f.dB < 0.4 || f.dT < 1 || f.dW < 0.3 || f.dO < 0.5 || f.dC < 0.3) continue;
    if (inTree(x, z)) continue;
    const deep = f.dR > 0;
    const it = place(x, z);
    if (st === 'Links' && deep) {
      it.s = rng.float(0.9, 1.5);
      it.color = rng.pick(['#fff4d8', '#f2e2b0', '#e8d9a8']);
      fescue.push(it);
    } else if (st === 'Heathland' && deep) {
      if (rng.chance(0.55)) { it.s = rng.float(0.35, 0.7); it.sy = it.s * 0.8; it.color = rng.pick(['#a47fb0', '#8e6aa0', '#b48cc0', '#7b6a58']); heather.push(it); }
      else if (rng.chance(0.08)) { it.s = rng.float(0.5, 0.9); it.color = '#ffffff'; gorse.push(it); }
      else { it.s = rng.float(0.8, 1.3); tufts.push(it); }
    } else if (st === 'Desert' && deep) {
      const k = rng.next();
      if (k < 0.35) { it.s = rng.float(0.35, 0.8); it.color = rng.pick(['#8e9a78', '#7f8c6a', '#a4a88a']); shrubs.push(it); }
      else if (k < 0.5) { it.s = rng.float(0.15, 0.6); it.color = rng.pick(['#a5673f', '#8c5a3c', '#b8865a']); rocks.push(it); }
    } else {
      it.s = rng.float(0.6, 1.1) * (deep ? 1.2 : 0.85);
      tufts.push(it);
      const flowerP = { Parkland: 0.05, Mountain: 0.12, Heathland: 0.04, Forest: 0.04, Tropical: 0.05, Coastal: 0.06 }[st] || 0.03;
      if (deep && rng.chance(flowerP)) {
        const f2 = place(x + rng.float(-1, 1), z + rng.float(-1, 1));
        f2.s = rng.float(0.9, 1.4);
        const col = st === 'Tropical' ? rng.pick(['pink', 'yellow', 'white']) : st === 'Mountain' ? rng.pick(['purple', 'yellow', 'white', 'white']) : rng.pick(['white', 'yellow', 'yellow', 'purple']);
        flowers[col].push(f2);
      }
      if (deep && (st === 'Mountain' || st === 'Coastal') && rng.chance(0.04)) {
        const rk = place(x, z);
        rk.s = rng.float(0.3, 1.4);
        rk.color = rng.pick(['#8a8a86', '#9a968f', '#7b7a75']);
        rocks.push(rk);
      }
    }
  }
  // Reeds and stones around the water
  for (const w of hole.waters) {
    const pts = [];
    if (w.type === 'creek') {
      for (let i = 0; i < w.points.length - 1; i++) {
        for (let t = 0; t < 1; t += 0.12) pts.push({ x: w.points[i].x + (w.points[i + 1].x - w.points[i].x) * t, z: w.points[i].z + (w.points[i + 1].z - w.points[i].z) * t });
      }
    } else {
      const n = Math.round((Math.PI * (w.rx + w.rz)) / 1.3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = 1 + w.w1 * Math.sin(3 * a + w.p1) + w.w2 * Math.sin(5 * a + w.p2);
        const u = Math.cos(a) * w.rx * rr, v = Math.sin(a) * w.rz * rr;
        const c = Math.cos(w.rot), s = Math.sin(w.rot);
        pts.push({ x: w.x + u * c + v * s, z: w.z + u * s - v * c });
      }
    }
    for (const p of pts) {
      if (!rng.chance(0.55 * q + 0.2)) continue;
      const x = p.x + rng.float(-2.5, 2.5), z = p.z + rng.float(-2.5, 2.5);
      const f = hole.fields(x, z);
      if (f.dW < -0.6 || f.dW > 3 || f.dG < 3 || f.dF < 1 || f.dB < 1) continue;
      const it = place(x, z);
      it.s = rng.float(0.7, 1.3);
      reeds.push(it);
      if (rng.chance(0.15)) { const rk = place(x + 0.8, z); rk.s = rng.float(0.2, 0.5); rk.color = '#8f8a80'; rocks.push(rk); }
    }
  }
  const baseTuft = style.colors.rough;
  const tuftGeo = mergeGeos([bladeClump(new RNG(3), { h: 0.34, base: new THREE.Color(baseTuft).getStyle(), tip: new THREE.Color(style.colors.fairway).lerp(new THREE.Color('#d6e08c'), 0.45).getStyle() })]);
  const add = (m) => { if (m) group.add(m); };
  add(instanced(tuftGeo, swayMat(true, 1), tufts));
  const fescueGeo = mergeGeos([bladeClump(new RNG(5), { blades: 9, h: 0.75, w: 0.03, base: '#8a8a52', tip: '#e2d49a', spread: 0.2 })]);
  add(instanced(fescueGeo, swayMat(true, 1.6), fescue));
  const petals = { white: '#f6f4ee', yellow: '#f2c230', purple: '#9b6bd1', pink: '#e8568f' };
  for (const [k, list] of Object.entries(flowers)) add(instanced(flowerGeo(new RNG(k.length * 13), petals[k]), swayMat(true, 1), list));
  add(instanced(domeGeo('#ffffff', 0.15), new THREE.MeshLambertMaterial({ vertexColors: true }), heather));
  if (gorse.length) {
    const gg = mergeGeos([domeGeo('#4f6b2c', 0.1), ...[0, 1, 2, 3, 4, 5].map((i) => { const o = new THREE.OctahedronGeometry(0.12, 0); o.translate(Math.cos(i) * 0.6, 0.55 + (i % 2) * 0.1, Math.sin(i) * 0.6); return colorize(o, () => new THREE.Color('#f5cf2c')); })]);
    add(instanced(gg, new THREE.MeshLambertMaterial({ vertexColors: true }), gorse));
  }
  const shrubGeo = mergeGeos([domeGeo('#ffffff', 0.2)].map((g) => { g.scale(1, 1.3, 1); return g; }));
  add(instanced(shrubGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), shrubs));
  add(instanced(rockGeo(new RNG(11), '#ffffff'), new THREE.MeshLambertMaterial({ vertexColors: true }), rocks, { shadow: true }));
  add(instanced(reedGeo(new RNG(17)), swayMat(true, 1.3), reeds));
  return group;
}

// ------------------------------------------------------------ cart path
export function buildCartPath(hole) {
  const cp = hole.cartPath;
  if (!cp) return null;
  const color = { Desert: '#c9ab80', Links: '#cbbf9a', Heathland: '#b9ab8a' }[hole.styleName] || '#b7b3a7';
  const pos = [];
  const col = [];
  const c = new THREE.Color(color);
  const edge = c.clone().multiplyScalar(0.82);
  let prev = null;
  for (let s = cp.s0; s <= cp.s1; s += 2) {
    const pt = hole.pointAtS(s);
    const r = { x: Math.cos(pt.heading), z: Math.sin(pt.heading) };
    const cx = pt.x + r.x * cp.side * cp.lat, cz = pt.z + r.z * cp.side * cp.lat;
    const f = hole.fields(cx, cz);
    const ok = hole.inBounds(cx, cz) && f.dW > 0.5 && f.dB > 0.5 && f.dG > 1 && f.dO > 1;
    const L = { x: cx - r.x * cp.half, z: cz - r.z * cp.half };
    const R = { x: cx + r.x * cp.half, z: cz + r.z * cp.half };
    const cur = ok ? { L, R, yl: hole.heightAt(L.x, L.z) + 0.035, yr: hole.heightAt(R.x, R.z) + 0.035 } : null;
    if (prev && cur) {
      pos.push(prev.L.x, prev.yl, prev.L.z, cur.L.x, cur.yl, cur.L.z, prev.R.x, prev.yr, prev.R.z);
      pos.push(prev.R.x, prev.yr, prev.R.z, cur.L.x, cur.yl, cur.L.z, cur.R.x, cur.yr, cur.R.z);
      for (let k = 0; k < 6; k++) { const e = k === 0 || k === 1 || k === 4 ? edge : c; col.push(e.r, e.g, e.b); }
    }
    prev = cur;
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const n = g.attributes.normal.array;
  for (let i = 0; i < n.length; i += 3) if (n[i + 1] < 0) { n[i] = -n[i]; n[i + 1] = -n[i + 1]; n[i + 2] = -n[i + 2]; }
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }));
  m.receiveShadow = true;
  return m;
}

// ------------------------------------------------------------ tee furniture
function holeSignTexture(hole, course) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 360;
  const g = cv.getContext('2d');
  g.fillStyle = '#123524';
  g.fillRect(0, 0, 256, 360);
  g.strokeStyle = '#d9c27a';
  g.lineWidth = 6;
  g.strokeRect(8, 8, 240, 344);
  g.fillStyle = '#f2e7c4';
  g.textAlign = 'center';
  g.font = 'bold 64px "Barlow Condensed", Arial, sans-serif';
  g.fillText(String(hole.index + 1), 128, 72);
  g.font = 'bold 24px "Barlow Condensed", Arial, sans-serif';
  g.fillText(`PAR ${hole.par}  ·  ${hole.yards} YDS`, 128, 104);
  // mini map of the hole
  const th = Math.atan2(hole.gdir.x, -hole.gdir.z);
  const cos = Math.cos(th), sin = Math.sin(th);
  let umin = Infinity, umax = -Infinity;
  for (const p of hole.path) { const u = p.x * cos + p.z * sin; umin = Math.min(umin, u); umax = Math.max(umax, u); }
  const vmax = hole.straightLen + 20;
  const sc = 220 / (vmax + 20);
  const uc = (umin + umax) / 2;
  const toC = (x, z) => { const u = x * cos + z * sin, v = x * sin - z * cos; return [128 + (u - uc) * sc, 340 - (v + 10) * sc]; };
  g.save();
  g.beginPath();
  g.rect(20, 118, 216, 226);
  g.clip();
  g.strokeStyle = '#6fae45';
  g.lineCap = 'round';
  g.lineWidth = Math.max(4, hole.fwHalf * 2 * sc);
  g.beginPath();
  let first = true;
  for (const p of hole.path) {
    if (p.s < hole.fwStart - 5) continue;
    const [x, y] = toC(p.x, p.z);
    if (first) { g.moveTo(x, y); first = false; } else g.lineTo(x, y);
  }
  g.stroke();
  const blobDraw = (b, color) => { const [x, y] = toC(b.x, b.z); g.fillStyle = color; g.beginPath(); g.ellipse(x, y, Math.max(2, b.rx * sc), Math.max(2, b.rz * sc), -b.rot + th, 0, Math.PI * 2); g.fill(); };
  for (const w of hole.waters) if (w.type !== 'creek') blobDraw(w, '#3d7fa6');
  for (const w of hole.waters) if (w.type === 'creek') { g.strokeStyle = '#3d7fa6'; g.lineWidth = 4; g.beginPath(); w.points.forEach((p, i) => { const [x, y] = toC(p.x, p.z); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); }
  blobDraw(hole.green, '#9fd66a');
  for (const b of hole.bunkers) blobDraw(b, '#efe3bd');
  const [tx, ty] = toC(0, 0);
  g.fillStyle = '#9fd66a';
  g.fillRect(tx - 4, ty - 4, 8, 8);
  g.restore();
  g.fillStyle = '#d9c27a';
  g.font = '600 15px "Barlow Condensed", Arial, sans-serif';
  const nm = course.name.length > 26 ? course.name.slice(0, 25) + '…' : course.name;
  g.fillText(nm.toUpperCase(), 128, 136);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildTeeFurniture(hole) {
  const grp = new THREE.Group();
  const h = hole.tee.heading;
  const f = { x: Math.sin(h), z: -Math.cos(h) }, r = { x: Math.cos(h), z: Math.sin(h) };
  const side = hole.cartPath ? hole.cartPath.side : -1;
  const at = (fw, lat) => ({ x: f.x * fw + r.x * lat * side, z: f.z * fw + r.z * lat * side });
  const wood = new THREE.MeshLambertMaterial({ color: '#5a3f2a' });
  const dark = new THREE.MeshLambertMaterial({ color: '#1f3a2b' });
  // sign
  const sp = at(-3, 7.5);
  const y = hole.heightAt(sp.x, sp.z);
  const sign = new THREE.Group();
  sign.position.set(sp.x, y, sp.z);
  sign.rotation.y = -h + Math.PI + side * 0.5;
  for (const dx of [-0.42, 0.42]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.7, 0.08), wood);
    post.position.set(dx, 0.85, 0);
    post.castShadow = true;
    sign.add(post);
  }
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.33, 0.05), [dark, dark, dark, dark, new THREE.MeshLambertMaterial({ map: holeSignTexture(hole, hole.course) }), dark]);
  board.position.set(0, 1.25, 0.05);
  board.castShadow = true;
  sign.add(board);
  grp.add(sign);
  // ball washer
  const bw = at(-1, 6);
  const by = hole.heightAt(bw.x, bw.z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), new THREE.MeshLambertMaterial({ color: '#2d2d2d' }));
  pole.position.set(bw.x, by + 0.45, bw.z);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.12), new THREE.MeshLambertMaterial({ color: '#2f5ea8' }));
  box.position.set(bw.x, by + 0.95, bw.z);
  pole.castShadow = box.castShadow = true;
  grp.add(pole, box);
  // bench
  const bp = at(-6, 7);
  const bench = new THREE.Group();
  bench.position.set(bp.x, hole.heightAt(bp.x, bp.z), bp.z);
  bench.rotation.y = -h + side * Math.PI / 2;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.42), wood);
  seat.position.y = 0.45;
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.05), wood);
  back.position.set(0, 0.72, -0.2);
  for (const dx of [-0.7, 0.7]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4), new THREE.MeshLambertMaterial({ color: '#2d2d2d' }));
    leg.position.set(dx, 0.22, 0);
    bench.add(leg);
  }
  seat.castShadow = back.castShadow = true;
  bench.add(seat, back);
  grp.add(bench);
  return grp;
}

// ------------------------------------------------------------ buildings
function windowTexture(wall, win, rows = 2, cols = 8) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = wall;
  g.fillRect(0, 0, 256, 128);
  const w = 256 / cols, hgt = 128 / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    g.fillStyle = win;
    g.fillRect(c * w + w * 0.25, r * hgt + hgt * 0.22, w * 0.5, hgt * 0.56);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(c * w + w * 0.25, r * hgt + hgt * 0.22, w * 0.5, 3);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function house(rng, style) {
  const grp = new THREE.Group();
  const palette = style === 'Desert' ? ['#d9b48f', '#c89f78', '#e2c7a4'] : style === 'Tropical' ? ['#f2e6d0', '#e8d2b0', '#f7f3ea'] : ['#f1ede4', '#d9dfe3', '#e8dcc6', '#c9d6c8', '#eee2cf'];
  const W = rng.float(9, 14), D = rng.float(8, 11), H = rng.float(3.2, 6.4);
  const wallTex = windowTexture(rng.pick(palette), '#3a4a58', H > 5 ? 2 : 1, 5);
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), new THREE.MeshLambertMaterial({ map: wallTex }));
  body.position.y = H / 2;
  body.castShadow = true;
  grp.add(body);
  const roofColor = style === 'Desert' || style === 'Tropical' ? rng.pick(['#b5553a', '#a9573d']) : rng.pick(['#4a4f57', '#5b4a44', '#3d4a3f', '#6b3a2e']);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(W, D) * 0.74, rng.float(2.2, 3.4), 4), new THREE.MeshLambertMaterial({ color: roofColor }));
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(W / Math.max(W, D), 1, D / Math.max(W, D));
  roof.position.y = H + roof.geometry.parameters.height / 2;
  roof.castShadow = true;
  grp.add(roof);
  return grp;
}

export function buildHouses(hole) {
  const grp = new THREE.Group();
  const st = hole.styleName;
  if (!['Parkland', 'Desert', 'Coastal', 'Tropical', 'Heathland'].includes(st)) return grp;
  const rng = new RNG(mixSeed(hole.seed, 'houses'));
  for (const [flag, sign] of [[hole.ob.left, -1], [hole.ob.right, 1]]) {
    if (!flag) continue;
    for (let s = 60; s < hole.length - 20; s += rng.float(38, 60)) {
      const pt = hole.pointAtS(s);
      const r = { x: Math.cos(pt.heading), z: Math.sin(pt.heading) };
      const lat = sign * (hole.ob.dist + rng.float(22, 34));
      const x = pt.x + r.x * lat, z = pt.z + r.z * lat;
      const f = hole.fields(x, z);
      if (f.dW < 6 || f.dO < 6) continue;
      const hs = house(rng, st);
      hs.position.set(x, hole.heightAt(x, z) - 0.3, z);
      hs.rotation.y = -pt.heading + (sign > 0 ? Math.PI / 2 : -Math.PI / 2);
      grp.add(hs);
    }
  }
  return grp;
}

export function buildClubhouse(hole, where) {
  const grp = new THREE.Group();
  const rng = new RNG(mixSeed(hole.course.seed, 'clubhouse'));
  const wall = { Desert: '#dcbf98', Tropical: '#f3ead8', Links: '#d8d3c7', Mountain: '#8a6a4f' }[hole.styleName] || '#efe9dc';
  const roofC = { Desert: '#b5553a', Tropical: '#7a4a32', Links: '#44484f', Mountain: '#3f3a36' }[hole.styleName] || '#3d4a43';
  const tex = windowTexture(wall, '#2e3b46', 2, 10);
  const main = new THREE.Mesh(new THREE.BoxGeometry(34, 8, 14), new THREE.MeshLambertMaterial({ map: tex }));
  main.position.y = 4;
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 10.5, 5, 4, 1), new THREE.MeshLambertMaterial({ color: roofC }));
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(2.3, 1, 1);
  roof.position.y = 10.5;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(14, 5.5, 20), new THREE.MeshLambertMaterial({ map: windowTexture(wall, '#2e3b46', 1, 6) }));
  wing.position.set(-14, 2.75, 12);
  const porch = new THREE.Mesh(new THREE.BoxGeometry(34, 0.4, 5), new THREE.MeshLambertMaterial({ color: '#9b8e7c' }));
  porch.position.set(0, 3.8, 9.5);
  for (let i = -3; i <= 3; i++) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3.8, 8), new THREE.MeshLambertMaterial({ color: '#f5f2ea' }));
    col.position.set(i * 5, 1.9, 11.6);
    grp.add(col);
  }
  for (const m of [main, roof, wing, porch]) { m.castShadow = true; grp.add(m); }
  // flag poles
  const flags = ['#c8322c', '#1d3557', '#f2c230'];
  flags.forEach((c, i) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 11, 6), new THREE.MeshLambertMaterial({ color: '#dcdcdc' }));
    pole.position.set(12 + i * 3, 5.5, 17);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.2), new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }));
    fl.position.set(13 + i * 3, 10.2, 17);
    grp.add(pole, fl);
  });
  // placement: behind the 1st tee (to the side) or behind the 18th green
  let x, z, face;
  if (where === 'tee') {
    const h = hole.tee.heading;
    const side = hole.cartPath ? hole.cartPath.side : -1;
    x = -Math.sin(h) * 70 + Math.cos(h) * 45 * side;
    z = Math.cos(h) * 70 + Math.sin(h) * 45 * side;
    face = -h + Math.PI;
  } else {
    const g = hole.green;
    const d = Math.max(g.rx, g.rz) + 85;
    x = g.x + Math.sin(hole.finalHeading) * d;
    z = g.z - Math.cos(hole.finalHeading) * d;
    face = -hole.finalHeading;
  }
  grp.position.set(x, hole.heightAt(x, z) - 0.5, z);
  grp.rotation.y = face;
  void rng;
  return grp;
}

// ------------------------------------------------------------ grandstand
function scoreboardTexture(rows, title) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 280;
  const g = cv.getContext('2d');
  g.fillStyle = '#0f3d27';
  g.fillRect(0, 0, 512, 280);
  g.fillStyle = '#f5f3ea';
  g.fillRect(10, 10, 492, 44);
  g.fillStyle = '#0f3d27';
  g.font = 'bold 30px "Barlow Condensed", Arial, sans-serif';
  g.textAlign = 'center';
  g.fillText('LEADERS', 256, 43);
  g.textAlign = 'left';
  rows.slice(0, 6).forEach((r, i) => {
    const y = 90 + i * 32;
    g.fillStyle = '#f5f3ea';
    g.fillRect(14, y - 24, 330, 28);
    g.fillStyle = '#16211b';
    g.font = 'bold 22px "Barlow Condensed", Arial, sans-serif';
    g.fillText(r.name.toUpperCase().slice(0, 18), 22, y - 3);
    g.fillStyle = r.toPar < 0 ? '#c8322c' : '#16211b';
    g.fillStyle = '#f5f3ea';
    g.fillRect(352, y - 24, 146, 28);
    g.fillStyle = r.toPar < 0 ? '#c8322c' : '#16211b';
    g.textAlign = 'center';
    g.fillText(r.toPar === 0 ? 'E' : r.toPar > 0 ? `+${r.toPar}` : String(r.toPar), 425, y - 3);
    g.textAlign = 'left';
  });
  g.fillStyle = '#d9c27a';
  g.font = '600 16px "Barlow Condensed", Arial, sans-serif';
  g.fillText(title.toUpperCase().slice(0, 48), 16, 272);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildGrandstand(hole, board) {
  const grp = new THREE.Group();
  const rng = new RNG(mixSeed(hole.seed, 'stand'));
  const g = hole.green;
  const back = Math.max(g.rx, g.rz) + 20;
  const x = g.x + Math.sin(hole.finalHeading) * back, z = g.z - Math.cos(hole.finalHeading) * back;
  const f = hole.fields(x, z);
  if (f.dW < 6 || f.dO < 8) return grp;
  const base = hole.heightAt(x, z);
  grp.position.set(x, base - 0.2, z);
  grp.rotation.y = -hole.finalHeading; // seats face back down the fairway
  const rows = 8, W = 34;
  const steel = new THREE.MeshLambertMaterial({ color: '#6d7780' });
  const seatM = new THREE.MeshLambertMaterial({ color: '#1f5c3a' });
  const people = [];
  for (let r = 0; r < rows; r++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, 0.9), seatM);
    step.position.set(0, 0.6 + r * 0.55, -r * 0.9);
    step.castShadow = true;
    grp.add(step);
    for (let k = -W / 2 + 0.6; k < W / 2; k += 0.62) {
      if (rng.chance(0.18)) continue;
      people.push({ x: k + rng.float(-0.05, 0.05), y: 0.66 + r * 0.55, z: -r * 0.9 });
    }
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W, 0.3, 0.3), steel);
  frame.position.set(0, 0.3, 0.4);
  grp.add(frame);
  for (const sx of [-W / 2, W / 2]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.25, rows * 0.55 + 1, rows * 0.9), steel);
    side.position.set(sx, (rows * 0.55 + 1) / 2, -rows * 0.45 + 0.45);
    grp.add(side);
  }
  // spectators standing on the rows
  const ppl = buildPeople(people.map((p) => ({ x: p.x, y: p.y - 0.05, z: p.z, face: 0 })), mixSeed(hole.seed, 'standppl'), { umbrellas: 0.02 });
  grp.add(ppl.group);
  grp.userData.people = ppl;
  // scoreboard beside the stand
  if (board && board.rows.length) {
    const sb = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.9), new THREE.MeshBasicMaterial({ map: scoreboardTexture(board.rows, board.title) }));
    face.position.set(0, 4.2, 0.08);
    const boxm = new THREE.Mesh(new THREE.BoxGeometry(9.4, 5.3, 0.3), new THREE.MeshLambertMaterial({ color: '#123524' }));
    boxm.position.set(0, 4.2, -0.1);
    const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2, 0.3), steel);
    leg1.position.set(-3.5, 1, -0.1);
    const leg2 = leg1.clone();
    leg2.position.x = 3.5;
    boxm.castShadow = true;
    sb.add(face, boxm, leg1, leg2);
    sb.position.set(W / 2 + 7, 0, 2);
    sb.rotation.y = -0.35;
    grp.add(sb);
  }
  return grp;
}

// ------------------------------------------------------------ birds
export class Birds {
  constructor(center, count = 7) {
    this.group = new THREE.Group();
    this.birds = [];
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.18, 0.75, 0.02, 0.05, 0, 0, 0.16], 3));
    wing.computeVertexNormals();
    const body = new THREE.ConeGeometry(0.07, 0.5, 5).rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: '#262626', side: THREE.DoubleSide });
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const l = new THREE.Mesh(wing, mat);
      const r = new THREE.Mesh(wing, mat);
      r.scale.x = -1;
      g.add(new THREE.Mesh(body, mat), l, r);
      g.scale.setScalar(1.6);
      this.group.add(g);
      this.birds.push({ g, l, r, ph: Math.random() * 6.28, off: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 14) });
    }
    this.center = center.clone();
    this.t = Math.random() * 100;
    this.radius = 110 + Math.random() * 80;
    this.height = 40 + Math.random() * 25;
    this.dir = Math.random() < 0.5 ? 1 : -1;
  }
  update(dt) {
    this.t += dt;
    const a = this.t * 0.05 * this.dir;
    const cx = this.center.x + Math.cos(a) * this.radius, cz = this.center.z + Math.sin(a) * this.radius;
    // direction of travel along the circle
    const vx = -Math.sin(a) * this.dir, vz = Math.cos(a) * this.dir;
    const yaw = Math.atan2(vx, vz);
    for (const b of this.birds) {
      b.g.position.set(cx + b.off.x, this.center.y + this.height + b.off.y + Math.sin(this.t * 0.7 + b.ph) * 1.2, cz + b.off.z);
      b.g.rotation.set(0, yaw, 0);
      // flap in bursts, then glide
      const burst = Math.sin(this.t * 0.6 + b.ph) > 0.2 ? 1 : 0.15;
      const flap = Math.sin(this.t * 11 + b.ph) * 0.7 * burst + 0.12;
      b.l.rotation.z = flap;
      b.r.rotation.z = -flap;
    }
  }
}

// ------------------------------------------------------------ bunker rakes
export function buildRakes(hole) {
  const list = [];
  const rng = new RNG(mixSeed(hole.seed, 'rakes'));
  for (const b of hole.bunkers) {
    if (b.kind === 'pot') continue;
    const a = rng.float(0, Math.PI * 2);
    const edge = 1 + b.w1 * Math.sin(3 * a + b.p1) + b.w2 * Math.sin(5 * a + b.p2);
    const u = Math.cos(a) * (b.rx * edge + 0.9), v = Math.sin(a) * (b.rz * edge + 0.9);
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    const x = b.x + u * c + v * s, z = b.z + u * s - v * c;
    const f = hole.fields(x, z);
    if (f.dB < 0.2 || f.dW < 1 || f.dG < 0.5) continue;
    list.push({ x, z, y: hole.heightAt(x, z) + 0.03, rot: Math.atan2(u * c + v * s, u * s - v * c) + Math.PI / 2 });
  }
  if (!list.length) return new THREE.Group();
  const parts = [];
  const handle = new THREE.CylinderGeometry(0.014, 0.014, 1.7, 5).rotateZ(Math.PI / 2).translate(0, 0.02, 0);
  const head = new THREE.BoxGeometry(0.05, 0.03, 0.55).translate(0.87, 0.03, 0);
  const col = (g, c) => colorize(g, () => new THREE.Color(c));
  parts.push(col(handle, '#f2c230'), col(head, '#2b2b2b'));
  for (let i = -5; i <= 5; i++) parts.push(col(new THREE.BoxGeometry(0.02, 0.05, 0.012).translate(0.9, 0.005, i * 0.05), '#2b2b2b'));
  const geo = mergeGeos(parts);
  return instanced(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), list.map((r) => ({ ...r, s: 1 })), { shadow: true });
}

// ------------------------------------------------------------ fountains
export class Fountain {
  constructor(x, y, z, h = 4) {
    this.group = new THREE.Group();
    this.group.position.set(x, y, z);
    this.h = h;
    const jetMat = new THREE.MeshLambertMaterial({ color: '#eef7ff', transparent: true, opacity: 0.75, emissive: '#223344' });
    this.jet = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.24, 1, 10, 1, true), jetMat);
    this.jet.position.y = h / 2;
    this.jet.scale.y = h;
    this.foam = new THREE.Mesh(new THREE.CircleGeometry(1.1, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#e8f4f8', transparent: true, opacity: 0.55, depthWrite: false }));
    this.foam.position.y = 0.04;
    this.N = 160;
    this.drops = [];
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.N * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#f4fbff', size: 0.2, transparent: true, opacity: 0.85, depthWrite: false }));
    this.points.frustumCulled = false;
    for (let i = 0; i < this.N; i++) this.drops.push(this.spawn(Math.random() * 2));
    this.group.add(this.jet, this.foam, this.points);
    this.t = 0;
  }
  spawn(age = 0) {
    const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 1.4;
    return { x: 0, y: this.h, z: 0, vx: Math.cos(a) * sp, vy: Math.random() * 1.5, vz: Math.sin(a) * sp, age };
  }
  update(dt) {
    this.t += dt;
    this.jet.scale.y = this.h * (0.94 + 0.06 * Math.sin(this.t * 7));
    for (let i = 0; i < this.N; i++) {
      const d = this.drops[i];
      d.vy -= 9.8 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      if (d.y < 0) this.drops[i] = this.spawn();
      this.pos[i * 3] = d.x; this.pos[i * 3 + 1] = Math.max(0, d.y); this.pos[i * 3 + 2] = d.z;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

export function buildFountains(hole) {
  const out = [];
  if (!['Parkland', 'Tropical', 'Desert', 'Coastal', 'Heathland'].includes(hole.styleName)) return out;
  for (const w of hole.waters) {
    if (w.type !== 'pond' || Math.min(w.rx, w.rz) < 10) continue;
    out.push(new Fountain(w.x, w.level, w.z, 3 + Math.min(4, w.rx * 0.18)));
  }
  return out;
}

// ------------------------------------------------------------ bridges
function bridgeMesh(len, width) {
  const grp = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: '#8a6440' });
  const dark = new THREE.MeshLambertMaterial({ color: '#5b412a' });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(width, 0.14, len), wood);
  deck.position.y = 0.07;
  grp.add(deck);
  for (let k = -len / 2 + 0.3; k < len / 2; k += 0.5) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.02, 0.06), dark);
    plank.position.set(0, 0.15, k);
    grp.add(plank);
  }
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, len), wood);
    rail.position.set(side * (width / 2 - 0.05), 0.95, 0);
    grp.add(rail);
    for (let k = -len / 2 + 0.1; k <= len / 2; k += len / Math.max(2, Math.round(len / 1.8))) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.9, 0.09), dark);
      post.position.set(side * (width / 2 - 0.05), 0.5, k);
      grp.add(post);
    }
  }
  grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return grp;
}

export function buildBridges(hole) {
  const grp = new THREE.Group();
  const creeks = hole.waters.filter((w) => w.type === 'creek');
  if (!creeks.length) return grp;
  // along any line (centerline, cart path), find where it runs over water
  const cross = (latFn, width) => {
    let inS = null;
    for (let s = 0; s <= hole.length; s += 0.5) {
      const pt = hole.pointAtS(s);
      const r = { x: Math.cos(pt.heading), z: Math.sin(pt.heading) };
      const lat = latFn(s);
      const x = pt.x + r.x * lat, z = pt.z + r.z * lat;
      const f = hole.fields(x, z);
      const wet = f.dW < 1.2;
      if (wet && inS === null) inS = s;
      if (!wet && inS !== null) {
        const s0 = inS - 1.5, s1 = s + 1.5;
        const a = hole.pointAtS(s0), b = hole.pointAtS(s1);
        const la = latFn(s0), lb = latFn(s1);
        const ra = { x: Math.cos(a.heading), z: Math.sin(a.heading) }, rb = { x: Math.cos(b.heading), z: Math.sin(b.heading) };
        const A = { x: a.x + ra.x * la, z: a.z + ra.z * la }, B = { x: b.x + rb.x * lb, z: b.z + rb.z * lb };
        const len = Math.hypot(B.x - A.x, B.z - A.z);
        const y = Math.max(hole.heightAt(A.x, A.z), hole.heightAt(B.x, B.z)) + 0.05;
        const br = bridgeMesh(len, width);
        br.position.set((A.x + B.x) / 2, y, (A.z + B.z) / 2);
        br.rotation.y = Math.atan2(B.x - A.x, B.z - A.z);
        grp.add(br);
        inS = null;
      }
    }
  };
  cross(() => 0, 2.4);
  if (hole.cartPath) cross(() => hole.cartPath.side * hole.cartPath.lat, 2.8);
  return grp;
}

// ------------------------------------------------------------ lighthouse
export function buildLighthouse(x, y, z) {
  const grp = new THREE.Group();
  const H = 24, segs = 6;
  for (let i = 0; i < segs; i++) {
    const r0 = 2.6 - (i / segs) * 1.0, r1 = 2.6 - ((i + 1) / segs) * 1.0;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, H / segs, 16), new THREE.MeshLambertMaterial({ color: i % 2 ? '#c8322c' : '#f5f3ee' }));
    m.position.y = (H / segs) * (i + 0.5);
    grp.add(m);
  }
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.3, 16), new THREE.MeshLambertMaterial({ color: '#2b2b2b' }));
  gallery.position.y = H + 0.15;
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.2, 12), new THREE.MeshLambertMaterial({ color: '#fff6c2', emissive: '#8a7a20' }));
  lamp.position.y = H + 1.4;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.8, 12), new THREE.MeshLambertMaterial({ color: '#c8322c' }));
  roof.position.y = H + 3.4;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, 4, 10), new THREE.MeshLambertMaterial({ color: '#7d7a72' }));
  base.position.y = -1.5;
  const house = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 5), new THREE.MeshLambertMaterial({ color: '#f5f3ee' }));
  house.position.set(4.5, 1.6, 0);
  const hroof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 1.8, 4), new THREE.MeshLambertMaterial({ color: '#c8322c' }));
  hroof.rotation.y = Math.PI / 4;
  hroof.scale.set(1, 1, 0.8);
  hroof.position.set(4.5, 4.1, 0);
  grp.add(gallery, lamp, roof, base, house, hroof);
  grp.position.set(x, y, z);
  grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return grp;
}

// ------------------------------------------------------------ tee extras
export function buildTeeExtras(hole) {
  const grp = new THREE.Group();
  const h = hole.tee.heading;
  const f = { x: Math.sin(h), z: -Math.cos(h) }, r = { x: Math.cos(h), z: Math.sin(h) };
  const side = hole.cartPath ? hole.cartPath.side : -1;
  const at = (fw, lat) => { const x = f.x * fw + r.x * lat * side, z = f.z * fw + r.z * lat * side; return { x, z, y: hole.heightAt(x, z) }; };
  // bin and water cooler
  const bin = at(-2.5, 6.3);
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.7, 12), new THREE.MeshLambertMaterial({ color: '#1f4a33' }));
  can.position.set(bin.x, bin.y + 0.35, bin.z);
  const cool = at(-4.2, 6.2);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.4), new THREE.MeshLambertMaterial({ color: '#6b5a44' }));
  stand.position.set(cool.x, cool.y + 0.4, cool.z);
  const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.4, 12), new THREE.MeshLambertMaterial({ color: '#e76f2c' }));
  jug.position.set(cool.x, cool.y + 1.0, cool.z);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 12), new THREE.MeshLambertMaterial({ color: '#f4f4f0' }));
  lid.position.set(cool.x, cool.y + 1.23, cool.z);
  for (const m of [can, stand, jug, lid]) { m.castShadow = true; grp.add(m); }
  // flower bed around the sign
  if (['Parkland', 'Tropical', 'Desert', 'Coastal', 'Heathland', 'Mountain'].includes(hole.styleName)) {
    const c = at(-3, 7.5);
    const bed = new THREE.Mesh(new THREE.CircleGeometry(1.9, 24).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#5a3d28' }));
    bed.position.set(c.x, c.y + 0.03, c.z);
    bed.receiveShadow = true;
    grp.add(bed);
    const rng = new RNG(mixSeed(hole.seed, 'bed'));
    const palette = hole.styleName === 'Tropical' ? ['#ff006e', '#ffbe0b', '#fb5607', '#ff4d6d'] : hole.styleName === 'Desert' ? ['#f2c230', '#e76f51', '#a4c639'] : ['#e63946', '#ffffff', '#f2c230', '#9b5de5', '#ff85a1'];
    const items = [];
    for (let i = 0; i < 70; i++) {
      const a = rng.float(0, Math.PI * 2), rr = Math.sqrt(rng.next()) * 1.7;
      const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr;
      items.push({ x, z, y: c.y + 0.02, s: rng.float(0.9, 1.4), rot: rng.float(0, 6.28), color: rng.pick(palette) });
    }
    const flower = mergeGeos([
      colorize(new THREE.CylinderGeometry(0.012, 0.012, 0.25, 4).translate(0, 0.125, 0), () => new THREE.Color('#3f7428')),
      colorize(new THREE.IcosahedronGeometry(0.07, 0).translate(0, 0.28, 0), () => new THREE.Color('#ffffff')),
      colorize(new THREE.IcosahedronGeometry(0.09, 0).scale(1, 0.6, 1).translate(0, 0.09, 0), () => new THREE.Color('#2f5a22')),
    ]);
    const m = instanced(flower, new THREE.MeshLambertMaterial({ vertexColors: true }), items);
    if (m) grp.add(m);
  }
  return grp;
}
