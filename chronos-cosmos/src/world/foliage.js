import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { G, WORLD_SIZE, HALF_WORLD } from '../core/G.js';
import { mulberry32, Simplex2, smoothstep } from '../core/noise.js';
import { GLSL_NOISE, GLSL_EPOCH, EPOCH_UNIFORMS, TIME_UNIFORM, WIND_UNIFORM, PLAYER_UNIFORM, NIGHT_UNIFORM, SHARED, addCompileHook } from '../core/shaderlib.js';
import { N as HN } from './terrain.js';
import { POIS, LAKE, lakeRadius, forestMask, canyonMask, roadDist, VOLCANO } from './worldmap.js';

const sn = new Simplex2(991);

// ---------------------------------------------------------------------------
// Grass: an infinite, wrapping field of GPU-placed blades around the camera.
// ---------------------------------------------------------------------------
const GRASS_VERT_PARS = /* glsl */ `
attribute vec2 aOffset; attribute vec4 aRand;
uniform sampler2D uHeight; uniform sampler2D uMask; uniform float uHN; uniform vec4 uWorld;
uniform vec3 uCenter; uniform float uSize; uniform float uTime; uniform vec2 uWind; uniform vec3 uPlayer;
uniform float uBladeH; uniform float uBladeW; uniform float uInner; uniform float uInnerSoft; uniform float uIsFlower; uniform float uWaterLevel;
varying float vY; varying vec3 vGCol; varying vec3 vGEmis; varying vec3 vGWorld;
${GLSL_NOISE}
${GLSL_EPOCH}
float gH(vec2 xz){
  vec2 g = (xz - uWorld.xy) / uWorld.z * (uHN - 1.0);
  g = clamp(g, vec2(0.0), vec2(uHN - 1.001));
  ivec2 i = ivec2(floor(g)); vec2 f = fract(g);
  float a = texelFetch(uHeight, i, 0).r, b = texelFetch(uHeight, i + ivec2(1,0), 0).r;
  float c = texelFetch(uHeight, i + ivec2(0,1), 0).r, d = texelFetch(uHeight, i + ivec2(1,1), 0).r;
  if (f.x + f.y <= 1.0) return a + (b - a) * f.x + (c - a) * f.y;
  return d + (c - d) * (1.0 - f.x) + (b - d) * (1.0 - f.y);
}
void grassStyle(int ep, float r, out vec3 base, out vec3 tip, out vec3 emis, out float hs){
  emis = vec3(0.0);
  if (ep == 0) {
    base = vec3(0.02, 0.04, 0.012);
    tip = mix(vec3(0.10, 0.19, 0.04), vec3(0.19, 0.23, 0.06), r);
    if (r > 0.88) tip = vec3(0.26, 0.24, 0.09);
    hs = 1.0;
  } else if (ep == 1) {
    base = vec3(0.02, 0.018, 0.015);
    tip = mix(vec3(0.16, 0.13, 0.09), vec3(0.26, 0.2, 0.12), r);
    hs = 0.42;
    if (r > 0.965) emis = vec3(2.0, 0.5, 0.08);
  } else {
    base = vec3(0.01, 0.015, 0.05);
    tip = mix(vec3(0.05, 0.22, 0.32), vec3(0.18, 0.12, 0.38), r);
    emis = tip * 0.35;
    if (r > 0.93) emis = vec3(0.2, 0.9, 1.2);
    hs = 0.75;
  }
}
`;

const GRASS_VERT_MAIN = /* glsl */ `
  vec2 cxz = uCenter.xz;
  vec2 wxz = cxz + mod(aOffset - cxz + 0.5 * uSize, uSize) - 0.5 * uSize;
  float d = distance(wxz, cxz);
  float fade = 1.0 - smoothstep(uSize * 0.36, uSize * 0.49, d);
  fade *= smoothstep(uInner * 0.8, uInner, d);
  vec2 muv = (wxz - uWorld.xy) / uWorld.z;
  vec4 m = texture2D(uMask, muv);
  float h = gH(wxz);
  float dens = m.r;
  dens *= smoothstep(uWaterLevel + 0.6, uWaterLevel + 1.6, h);
  float patchN = vnoise(wxz * 0.07);
  if (uIsFlower > 0.5) dens *= smoothstep(0.55, 0.75, patchN) * (1.0 - m.a);
  else dens *= 0.55 + 0.45 * smoothstep(0.2, 0.6, patchN);
  float keep = step(aRand.w, dens);
  vec3 wp0 = vec3(wxz.x, h, wxz.y);
  float k = epochOldMix(wp0);
  vec3 bN, tN, eN, bO, tO, eO; float hN, hO;
  grassStyle(uEpochNew, aRand.z, bN, tN, eN, hN);
  grassStyle(uEpochOld, aRand.z, bO, tO, eO, hO);
  if (uIsFlower > 0.5) {
    hN = uEpochNew == 1 ? 0.0 : 1.0; hO = uEpochOld == 1 ? 0.0 : 1.0;
  }
  float hs = mix(hN, hO, k);
  float bh = uBladeH * (0.55 + aRand.y * 0.9) * hs * keep * fade;
  float y = position.y;
  vY = y;
  float ang = aRand.x * 6.2831;
  vec2 fdir = vec2(cos(ang), sin(ang));
  vec2 side = vec2(-fdir.y, fdir.x);
  // wind: large slow gusts + small flutter
  float gust = fbm3(wxz * 0.035 + uWind * uTime * 0.12);
  float sway = sin(uTime * 1.9 + dot(wxz, vec2(0.21, 0.17)) + aRand.x * 2.0) * 0.25 + (gust - 0.4) * 1.2;
  vec2 bend = uWind * sway * 0.45 + fdir * (0.15 + aRand.y * 0.25);
  // player pushes blades aside
  vec2 away = wxz - uPlayer.xz;
  float pd = length(away);
  float push = (1.0 - smoothstep(0.3, 1.6, pd)) * step(abs(uPlayer.y - h), 1.5);
  bend += normalize(away + 1e-4) * push * 1.6;
  float bl = min(length(bend), 1.4);
  bend = normalize(bend + 1e-5) * bl;
  float y2 = y * y;
  vec3 p = wp0;
  float w = uBladeW * (1.0 - y * 0.82) * (0.7 + aRand.y * 0.6);
  p.xz += side * position.x * w;
  p.y += y * bh * (1.0 - 0.35 * bl * y);
  p.xz += bend * y2 * bh;
  vGWorld = p;
  vec3 bc = mix(bN, bO, k), tc = mix(tN, tO, k);
  vGCol = mix(mix(bc, tc, 0.55 * uInnerSoft), tc, smoothstep(0.0, 1.0, y));
  vGCol *= 0.8 + 0.4 * vnoise(wxz * 0.15);
  vGEmis = mix(eN, eO, k) * smoothstep(0.6, 1.0, y);
  float ring = epochRing(wp0);
  vGEmis += vec3(0.6, 0.9, 1.0) * ring * 2.0 * y;
  if (uIsFlower > 0.5) {
    vec3 fc;
    float fr = aRand.z;
    if (fr < 0.25) fc = vec3(0.9, 0.85, 0.75); else if (fr < 0.5) fc = vec3(0.95, 0.7, 0.05);
    else if (fr < 0.7) fc = vec3(0.45, 0.15, 0.75); else if (fr < 0.85) fc = vec3(0.85, 0.15, 0.25); else fc = vec3(0.15, 0.35, 0.95);
    float head = step(0.82, y);
    vec3 starF = vec3(0.25, 0.8, 1.2);
    vec3 flN = uEpochNew == 2 ? starF : fc, flO = uEpochOld == 2 ? starF : fc;
    vGCol = mix(vec3(0.04, 0.1, 0.02), mix(flN, flO, k), head);
    vGEmis = mix(uEpochNew == 2 ? starF * 0.8 : vec3(0.0), uEpochOld == 2 ? starF * 0.8 : vec3(0.0), k) * head;
  }
  vec3 bladeN = normalize(vec3(fdir.x, 0.0, fdir.y));
  objectNormal = normalize(mix(bladeN, vec3(0.0, 1.0, 0.0), 0.65 + y * 0.2));
`;

function makeBladeGeometry(segments, flower) {
  const pos = [];
  const idx = [];
  if (!flower) {
    for (let s = 0; s < segments; s++) {
      const y = s / segments;
      pos.push(-0.5, y, 0, 0.5, y, 0);
    }
    pos.push(0, 1, 0);
    for (let s = 0; s < segments - 1; s++) {
      const a = s * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const t = segments * 2;
    idx.push(t - 2, t - 1, t);
  } else {
    // stem (2 segs) + crossed petal quads at top
    pos.push(-0.12, 0, 0, 0.12, 0, 0, -0.1, 0.8, 0, 0.1, 0.8, 0);
    idx.push(0, 1, 2, 1, 3, 2);
    const base = 4;
    pos.push(-1.4, 0.84, 0, 1.4, 0.84, 0, -1.4, 1.0, 0, 1.4, 1.0, 0);
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export class GrassField {
  constructor(terrain, opts) {
    const count = Math.floor(opts.count);
    const geo = makeBladeGeometry(opts.segments || 4, opts.flower);
    const rng = mulberry32(opts.seed || 5);
    const off = new Float32Array(count * 2);
    const rnd = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      off[i * 2] = rng() * opts.size;
      off[i * 2 + 1] = rng() * opts.size;
      rnd[i * 4] = rng();
      rnd[i * 4 + 1] = rng();
      rnd[i * 4 + 2] = rng();
      rnd[i * 4 + 3] = rng();
    }
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 2));
    geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rnd, 4));
    geo.instanceCount = count;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.uniforms = {
      uHeight: { value: terrain.heightTex },
      uMask: { value: terrain.maskTex },
      uHN: { value: HN },
      uWorld: { value: new THREE.Vector4(-HALF_WORLD, -HALF_WORLD, WORLD_SIZE, 1 / WORLD_SIZE) },
      uCenter: { value: new THREE.Vector3() },
      uSize: { value: opts.size },
      uTime: TIME_UNIFORM,
      uWind: WIND_UNIFORM,
      uPlayer: PLAYER_UNIFORM,
      uBladeH: { value: opts.height },
      uBladeW: { value: opts.width },
      uInner: { value: opts.inner || 0 },
      uInnerSoft: { value: opts.inner ? 1 : 0 },
      uIsFlower: { value: opts.flower ? 1 : 0 },
      uWaterLevel: { value: 0 },
      uNightG: NIGHT_UNIFORM,
      uSunDirG: { value: SHARED.sunDir },
      ...EPOCH_UNIFORMS,
    };
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    addCompileHook(mat, (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + GRASS_VERT_PARS)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal; vec3 grassPos;\n{' + GRASS_VERT_MAIN + '\n grassPos = p; }')
        .replace('#include <begin_vertex>', 'vec3 transformed = grassPos;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vY; varying vec3 vGCol; varying vec3 vGEmis; varying vec3 vGWorld; uniform vec3 uSunDirG; uniform float uNightG;')
        .replace('#include <color_fragment>', 'diffuseColor.rgb = vGCol;')
        .replace('#include <normal_fragment_begin>', 'float faceDirection = gl_FrontFacing ? 1.0 : -1.0; vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          vec3 gv = normalize(vGWorld - cameraPosition);
          float back = pow(max(dot(gv, uSunDirG), 0.0), 3.0) * (1.0 - uNightG);
          totalEmissiveRadiance += vGEmis + vGCol * back * vY * 1.6 * max(uSunDirG.y, 0.0);
          totalEmissiveRadiance += vGCol * 0.06;`);
    }, opts.flower ? 'flower' : 'grass');
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
  }
  update(center, waterLevel) {
    this.uniforms.uCenter.value.copy(center);
    this.uniforms.uWaterLevel.value = waterLevel;
  }
}

// ---------------------------------------------------------------------------
// Trees, rocks, crystals: instanced in spatial cells with LOD + epoch morph.
// ---------------------------------------------------------------------------
function displace(geo, amp, freq, seed) {
  const p = geo.attributes.position;
  const n = new Simplex2(seed);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const len = Math.hypot(x, y, z) || 1;
    const d = 1 + n.fbm(x * freq + y * 0.7, z * freq - y * 0.3, 3) * amp;
    p.setXYZ(i, (x / len) * len * d, (y / len) * len * d, (z / len) * len * d);
  }
  geo.computeVertexNormals();
  return geo;
}
function colorGeo(geo, fn) {
  const p = geo.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = fn(p.getX(i), p.getY(i), p.getZ(i), i);
    c[i * 3] = v[0]; c[i * 3 + 1] = v[1]; c[i * 3 + 2] = v[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}
function centerAttr(geo, cx, cy, cz) {
  const p = geo.attributes.position;
  const a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { a[i * 3] = cx; a[i * 3 + 1] = cy; a[i * 3 + 2] = cz; }
  geo.setAttribute('aCenter', new THREE.BufferAttribute(a, 3));
  return geo;
}
function clean(geo) {
  // keep only attributes we merge
  const keep = ['position', 'normal', 'uv', 'color', 'aCenter'];
  for (const k of Object.keys(geo.attributes)) if (!keep.includes(k)) geo.deleteAttribute(k);
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  if (!geo.attributes.aCenter) centerAttr(geo, 0, 0, 0);
  return geo.index ? geo.toNonIndexed() : geo;
}

function trunkGeo(h, r0, r1, bend, radial, segs, rng) {
  const g = new THREE.CylinderGeometry(r1, r0, h, radial, segs, true);
  g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  const bx = (rng() - 0.5) * bend, bz = (rng() - 0.5) * bend;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = y / h;
    p.setX(i, p.getX(i) + bx * t * t + Math.sin(y * 3.1) * 0.03);
    p.setZ(i, p.getZ(i) + bz * t * t + Math.cos(y * 2.7) * 0.03);
    // flare at base
    const flare = 1 + Math.max(0, 0.35 - t) * 1.6;
    p.setX(i, p.getX(i) * flare);
    p.setZ(i, p.getZ(i) * flare);
  }
  g.computeVertexNormals();
  colorGeo(g, (x, y) => {
    const ao = 0.55 + Math.min(1, y / (h * 0.5)) * 0.45;
    return [ao, ao, ao];
  });
  return { geo: g, top: [bx, h, bz] };
}

function branch(from, dir, len, r, radial) {
  const g = new THREE.CylinderGeometry(r * 0.5, r, len, radial, 1, true);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  g.applyQuaternion(q);
  g.translate(from[0], from[1], from[2]);
  colorGeo(g, () => [0.85, 0.85, 0.85]);
  return g;
}

function blob(cx, cy, cz, r, detail, seed, sy = 0.85) {
  let g = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  displace(g, 0.3, 1.4 / r, seed);
  g.scale(1, sy, 1);
  g.translate(cx, cy, cz);
  // spherical normals around the crown for soft stylised shading
  const p = g.attributes.position;
  const nrm = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const dx = p.getX(i) - cx, dy = (p.getY(i) - cy) / sy, dz = p.getZ(i) - cz;
    const l = Math.hypot(dx, dy, dz) || 1;
    const fx = nrm.getX(i) * 0.5 + (dx / l) * 0.5, fy = nrm.getY(i) * 0.5 + (dy / l) * 0.5, fz = nrm.getZ(i) * 0.5 + (dz / l) * 0.5;
    const fl = Math.hypot(fx, fy, fz);
    nrm.setXYZ(i, fx / fl, fy / fl, fz / fl);
  }
  {
    const pp = g.attributes.position;
    const uv = new Float32Array(pp.count * 2);
    for (let i = 0; i < pp.count; i++) { uv[i * 2] = (pp.getX(i) + pp.getZ(i) * 0.7) * 0.45; uv[i * 2 + 1] = (pp.getY(i) - pp.getZ(i) * 0.3) * 0.45; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  colorGeo(g, (x, y, z) => {
    const ny = (y - cy) / (r * sy);
    const ao = 0.45 + (ny * 0.5 + 0.5) * 0.55;
    return [ao, ao, ao];
  });
  centerAttr(g, cx, cy, cz);
  return g;
}

function makeOak(seed, lod) {
  const rng = mulberry32(seed);
  const h = 4.2 + rng() * 1.5;
  const tr = trunkGeo(h, 0.34, 0.2, 0.8, lod ? 5 : 8, lod ? 1 : 4, rng);
  const trunks = [tr.geo];
  const leaves = [];
  const top = tr.top;
  const nb = lod ? 0 : 3;
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + rng();
    const dir = new THREE.Vector3(Math.cos(a), 0.9 + rng() * 0.5, Math.sin(a));
    const from = [top[0] * 0.6, h * (0.55 + rng() * 0.25), top[2] * 0.6];
    trunks.push(branch(from, dir, 1.8 + rng(), 0.12, 5));
  }
  const nl = lod ? 2 : 8;
  for (let i = 0; i < nl; i++) {
    const a = rng() * Math.PI * 2;
    const rr = i === 0 ? 0 : 1.2 + rng() * 1.3;
    const r = (i === 0 ? 2.2 : 1.1 + rng() * 0.7) * (lod ? 1.35 : 1);
    leaves.push(blob(top[0] + Math.cos(a) * rr, h + 0.6 + rng() * 1.2 - (i === 0 ? -0.5 : 0.3), top[2] + Math.sin(a) * rr, r, lod ? 0 : 1, seed + i * 7));
  }
  return { trunk: mergeGeometries(trunks.map(clean)), leaves: mergeGeometries(leaves.map(clean)), height: h + 3, trunkR: 0.34 };
}

function makePine(seed, lod) {
  const rng = mulberry32(seed);
  const h = 8 + rng() * 3;
  const tr = trunkGeo(h, 0.3, 0.08, 0.3, lod ? 5 : 7, lod ? 1 : 3, rng);
  const leaves = [];
  const layers = lod ? 3 : 5;
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    const r = (2.6 - t * 1.9) * (0.9 + rng() * 0.2);
    const ch = 2.6 - t * 0.8;
    const y = 2.2 + t * (h - 2.2);
    const g = new THREE.ConeGeometry(r, ch, lod ? 6 : 9, 1, false);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      if (p.getY(k) < 0) {
        const j = 0.75 + rng() * 0.45;
        p.setX(k, p.getX(k) * j);
        p.setZ(k, p.getZ(k) * j);
        p.setY(k, p.getY(k) - rng() * 0.4);
      }
    }
    g.rotateY(rng() * 3);
    g.translate(0, y + ch / 2, 0);
    g.computeVertexNormals();
    // bias normals outward/upwards for softer look
    const nrm = g.attributes.normal;
    for (let k = 0; k < nrm.count; k++) {
      const nx = nrm.getX(k), ny = nrm.getY(k) + 0.4, nz = nrm.getZ(k);
      const l = Math.hypot(nx, ny, nz);
      nrm.setXYZ(k, nx / l, ny / l, nz / l);
    }
    colorGeo(g, (x, yy) => {
      const local = (yy - y) / ch;
      const ao = 0.45 + local * 0.45 + t * 0.15;
      return [ao, ao, ao];
    });
    centerAttr(g, 0, y + ch * 0.4, 0);
    leaves.push(g);
  }
  return { trunk: mergeGeometries([clean(tr.geo)]), leaves: mergeGeometries(leaves.map(clean)), height: h + 2, trunkR: 0.3 };
}

function makePoplar(seed, lod) {
  const rng = mulberry32(seed);
  const h = 5 + rng() * 2;
  const tr = trunkGeo(h, 0.22, 0.12, 0.3, lod ? 5 : 7, 2, rng);
  const leaves = [];
  const n = lod ? 1 : 4;
  for (let i = 0; i < n; i++) {
    leaves.push(blob((rng() - 0.5) * 0.6, h - 0.5 + i * (lod ? 1.5 : 1.4), (rng() - 0.5) * 0.6, lod ? 2.0 : 1.35 - i * 0.12, lod ? 0 : 1, seed + i * 13, 1.5));
  }
  return { trunk: mergeGeometries([clean(tr.geo)]), leaves: mergeGeometries(leaves.map(clean)), height: h + 5, trunkR: 0.22 };
}

function makeRock(seed, lod) {
  let g = new THREE.IcosahedronGeometry(1, lod ? 1 : 3);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  const n = new Simplex2(seed);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let d = 1 + n.fbm(x * 1.3, z * 1.3 + y, 4) * 0.35 + n.noise(x * 4 + y, z * 4) * 0.06;
    // facets
    d *= 1 - Math.abs(n.noise(x * 2.5, y * 2.5 + z)) * 0.12;
    p.setXYZ(i, x * d, Math.max(-0.35, y * d * 0.72), z * d);
  }
  g.computeVertexNormals();
  colorGeo(g, (x, y) => {
    const ao = 0.6 + Math.max(0, Math.min(1, (y + 0.35) / 1.1)) * 0.4;
    return [ao, ao, ao];
  });
  return clean(g);
}

function makeCrystal(seed) {
  const rng = mulberry32(seed);
  const parts = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const h = 1 + rng() * 2.2;
    const r = 0.18 + rng() * 0.2;
    const g = new THREE.CylinderGeometry(0, r, h * 0.35, 6, 1);
    g.translate(0, h + h * 0.175, 0);
    const b = new THREE.CylinderGeometry(r, r * 0.8, h, 6, 1);
    b.translate(0, h / 2, 0);
    let m = mergeGeometries([clean(b), clean(g)]);
    m.rotateZ((rng() - 0.5) * 0.9);
    m.rotateX((rng() - 0.5) * 0.9);
    m.translate((rng() - 0.5) * 0.8, 0, (rng() - 0.5) * 0.8);
    parts.push(m);
  }
  const g = mergeGeometries(parts);
  colorGeo(g, (x, y) => [0.6 + y * 0.15, 0.6 + y * 0.15, 0.6 + y * 0.15]);
  return g;
}

// Shared vertex injection for epoch-aware instanced vegetation.
const VEG_VERT_PARS = /* glsl */ `
attribute vec3 aCenter;
uniform float uTime; uniform vec2 uWind; uniform float uKind; uniform float uPart;
varying vec3 vTint; varying vec3 vEmis; varying float vRough; varying vec3 vVegWorld;
${GLSL_NOISE}
${GLSL_EPOCH}
// kind: 0 oak, 1 pine, 2 poplar, 3 rock, 4 crystal ; part: 0 trunk/body, 1 leaves
void vegStyle(int ep, float r, out vec3 tint, out vec3 emis, out float scale, out float rough){
  emis = vec3(0.0); scale = 1.0; rough = 0.85;
  int kind = int(uKind + 0.5);
  bool leaves = uPart > 0.5;
  if (kind == 3) {
    if (ep == 0) tint = vec3(0.42, 0.40, 0.37);
    else if (ep == 1) tint = vec3(0.14, 0.12, 0.12);
    else { tint = vec3(0.45, 0.43, 0.58); }
    return;
  }
  if (kind == 4) {
    tint = vec3(0.4, 0.7, 1.0); emis = vec3(0.25, 0.7, 1.4) * (0.7 + r * 0.6); rough = 0.2;
    scale = ep == 2 ? 1.0 : 0.0;
    return;
  }
  if (!leaves) {
    if (ep == 0) tint = vec3(0.30, 0.24, 0.18);
    else if (ep == 1) { tint = vec3(0.05, 0.045, 0.04); rough = 0.95; }
    else { tint = vec3(0.85, 0.9, 1.05); rough = 0.4; }
    return;
  }
  if (ep == 0) {
    float r2 = fract(r * 7.13);
    if (kind == 1) tint = mix(vec3(0.04, 0.10, 0.06), vec3(0.07, 0.14, 0.05), r);
    else if (kind == 2) tint = mix(vec3(0.12, 0.22, 0.05), vec3(0.22, 0.26, 0.06), r);
    else tint = mix(mix(vec3(0.08, 0.18, 0.04), vec3(0.16, 0.24, 0.05), r), vec3(0.06, 0.13, 0.05), r2 * 0.6);
    if (r > 0.965 && kind != 1) tint = vec3(0.42, 0.2, 0.04);
    else if (r > 0.94 && kind != 1) tint = vec3(0.28, 0.25, 0.05);
    rough = 0.8;
  } else if (ep == 1) {
    scale = kind == 1 && r > 0.6 ? 0.55 : 0.0;
    tint = vec3(0.06, 0.05, 0.04);
  } else {
    tint = mix(vec3(0.06, 0.24, 0.36), vec3(0.24, 0.1, 0.4), r);
    emis = tint * 0.28;
    scale = 1.05; rough = 0.35;
  }
}
`;
const VEG_VERT_MAIN = /* glsl */ `
  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float r = hash12(ip.xz);
  float k = epochOldMix(ip);
  vec3 tN, eN, tO, eO; float sN, sO, rN, rO;
  vegStyle(uEpochNew, r, tN, eN, sN, rN);
  vegStyle(uEpochOld, r, tO, eO, sO, rO);
  float esc = mix(sN, sO, k);
  vTint = mix(tN, tO, k);
  vEmis = mix(eN, eO, k);
  vRough = mix(rN, rO, k);
  float ring = epochRing(ip);
  vEmis += vec3(0.7, 0.9, 1.0) * ring * 1.5;
  transformed = aCenter + (transformed - aCenter) * esc;
  if (uKind < 2.5) {
    float hgt = max(transformed.y, 0.0);
    float phase = r * 6.28 + ip.x * 0.05 + ip.z * 0.04;
    float gust = vnoise(ip.xz * 0.02 + uTime * 0.15);
    float sw = (sin(uTime * 1.3 + phase) * 0.6 + gust * 0.8) * 0.012 * hgt * hgt / 8.0;
    transformed.xz += uWind * sw;
    if (uPart > 0.5) {
      float fl = sin(uTime * 4.0 + dot(position, vec3(3.1, 2.3, 1.7))) * 0.035;
      transformed += normal * fl;
    }
  }
`;

function vegMaterial(kind, part, tex) {
  const isLeaf = part === 1;
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0,
    map: kind === 3 ? tex.rock.map : !isLeaf && kind < 3 ? tex.bark.map : isLeaf ? tex.leaf.map : null,
    normalMap: kind === 3 ? tex.rock.normalMap : !isLeaf && kind < 3 ? tex.bark.normalMap : isLeaf ? tex.leaf.normalMap : null,
    normalScale: isLeaf ? new THREE.Vector2(1.6, 1.6) : new THREE.Vector2(1, 1),
    flatShading: false,
  });
  if (kind === 4) {
    mat.transparent = false;
    mat.metalness = 0.1;
  }
  const uniforms = { uTime: TIME_UNIFORM, uWind: WIND_UNIFORM, uKind: { value: kind }, uPart: { value: part }, uSunDirV: { value: SHARED.sunDir }, uNightV: NIGHT_UNIFORM, ...EPOCH_UNIFORMS };
  const hook = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VEG_VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VEG_VERT_MAIN)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vVegWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTint; varying vec3 vEmis; varying float vRough; varying vec3 vVegWorld; uniform vec3 uSunDirV; uniform float uNightV; uniform float uPart;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= vTint * 1.7;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRough;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vEmis;
        if (uPart > 0.5) {
          vec3 vv = normalize(vVegWorld - cameraPosition);
          float back = pow(max(dot(vv, uSunDirV), 0.0), 4.0) * (1.0 - uNightV) * max(uSunDirV.y, 0.0);
          totalEmissiveRadiance += diffuseColor.rgb * back * 0.9;
        }`);
  };
  addCompileHook(mat, hook, 'veg' + kind + '_' + part);
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  addCompileHook(depth, (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VEG_VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VEG_VERT_MAIN)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>');
  }, 'vegdepth' + kind + '_' + part);
  return { mat, depth };
}

const CELL_SIZE = 400;
const CELLS = Math.ceil(WORLD_SIZE / CELL_SIZE);

export class Vegetation {
  constructor(scene, terrain, collision, tex) {
    this.scene = scene;
    this.terrain = terrain;
    this.collision = collision;
    this.trees = [];
    this.rocks = [];
    this.crystals = [];
    this.group = new THREE.Group();
    this.group.name = 'vegetation';
    scene.add(this.group);
    this.kinds = [
      { name: 'oak', lod0: makeOak(11, 0), lod1: makeOak(11, 1) },
      { name: 'pine', lod0: makePine(23, 0), lod1: makePine(23, 1) },
      { name: 'poplar', lod0: makePoplar(37, 0), lod1: makePoplar(37, 1) },
    ];
    this.rockGeo = [makeRock(5, 0), makeRock(9, 0)];
    this.rockGeoL = [makeRock(5, 1), makeRock(9, 1)];
    this.crystalGeo = makeCrystal(77);
    this.mats = {};
    for (let k = 0; k < 3; k++) this.mats[k] = [vegMaterial(k, 0, tex), vegMaterial(k, 1, tex)];
    this.mats[3] = [vegMaterial(3, 0, tex)];
    this.mats[4] = [vegMaterial(4, 0, tex)];
    this.cells = [];
  }

  scatter(density = 1) {
    const T = this.terrain;
    const rng = mulberry32(4242);
    const step = 5.5;
    const avoid = POIS.map((p) => ({ x: p.x, z: p.z, r: p.type === 'village' ? p.r * 0.95 : p.type === 'camp' ? 10 : p.r * 1.05 }));
    const nrm = new THREE.Vector3();
    for (let z = -HALF_WORLD + 10; z < HALF_WORLD - 10; z += step) {
      for (let x = -HALF_WORLD + 10; x < HALF_WORLD - 10; x += step) {
        const px = x + (rng() - 0.5) * step * 0.9, pz = z + (rng() - 0.5) * step * 0.9;
        const r = Math.hypot(px, pz);
        if (r > 760) continue;
        const f = forestMask(px, pz);
        const cm = canyonMask(px, pz);
        let prob = f * 0.32 + 0.012 + Math.max(0, sn.noise(px * 0.01, pz * 0.01)) * 0.03;
        prob *= 1 - cm * 0.85;
        prob *= density;
        if (rng() > prob) continue;
        const h = T.heightAt(px, pz);
        if (h < 2.5 || h > 165) continue;
        T.normalAt(px, pz, nrm);
        if (nrm.y < 0.8) continue;
        if (roadDist(px, pz) < 4.5) continue;
        let bad = false;
        for (const a of avoid) if (Math.hypot(px - a.x, pz - a.z) < a.r) { bad = true; break; }
        if (bad) continue;
        const ld = Math.hypot(px - LAKE.x, pz - LAKE.z);
        if (ld < lakeRadius(px, pz) + 4) continue;
        if (Math.hypot(px - VOLCANO.x, pz - VOLCANO.z) < 130) continue;
        let kind = 0;
        const pineBias = smoothstep(-200, -420, pz) + smoothstep(40, 90, h) + (sn.noise(px * 0.004, pz * 0.004) > 0.35 ? 0.6 : 0);
        if (rng() < pineBias * 0.8) kind = 1;
        else if (rng() < 0.18 && f < 0.5) kind = 2;
        const s = 0.8 + rng() * 0.6;
        this.trees.push({ x: px, z: pz, y: h - 0.15, s, rot: rng() * Math.PI * 2, kind, alive: true, hp: 3 });
      }
    }
    // rocks & boulders
    for (let z = -HALF_WORLD + 10; z < HALF_WORLD - 10; z += 9) {
      for (let x = -HALF_WORLD + 10; x < HALF_WORLD - 10; x += 9) {
        const px = x + (rng() - 0.5) * 8, pz = z + (rng() - 0.5) * 8;
        if (Math.hypot(px, pz) > 770) continue;
        const h = T.heightAt(px, pz);
        T.normalAt(px, pz, nrm);
        const cm = canyonMask(px, pz);
        const mountain = smoothstep(-300, -450, pz) + smoothstep(560, 700, Math.hypot(px, pz));
        let prob = 0.025 + (1 - nrm.y) * 0.4 + cm * 0.08 + mountain * 0.08;
        if (rng() > prob * density) continue;
        if (roadDist(px, pz) < 3) continue;
        let bad = false;
        for (const a of avoid) if (Math.hypot(px - a.x, pz - a.z) < a.r * 0.8) { bad = true; break; }
        if (bad) continue;
        const big = rng() < 0.15;
        const s = big ? 2 + rng() * 3.5 : 0.35 + rng() * 1.1;
        this.rocks.push({ x: px, z: pz, y: h - s * 0.15, s, sy: 0.7 + rng() * 0.6, rot: rng() * 6.28, v: rng() < 0.5 ? 0 : 1, big, alive: true, hp: 4 });
      }
    }
    // crystals (Age of Stars only): near canyon, mountains and astral stair
    for (let i = 0; i < 260; i++) {
      const px = (rng() - 0.5) * 1400, pz = (rng() - 0.5) * 1400;
      if (Math.hypot(px, pz) > 700) continue;
      const cm = canyonMask(px, pz);
      const near = Math.hypot(px - 385, pz + 60) < 160;
      if (cm < 0.4 && !near && rng() > 0.25) continue;
      const h = T.heightAt(px, pz);
      if (h < 1) continue;
      this.crystals.push({ x: px, z: pz, y: h - 0.2, s: 0.7 + rng() * 0.9, rot: rng() * 6.28, alive: true, hp: 2 });
    }
    this._buildCells();
  }

  // Global instanced meshes with a dynamic two-level LOD: trees near the
  // camera use the detailed mesh (and cast shadows), the rest use the cheap
  // one. Rebuilt only when the camera has moved or something was harvested.
  _buildCells() {
    const d = new THREE.Object3D();
    const toM = (o, sx, sy, sz) => {
      d.position.set(o.x, o.y, o.z);
      d.rotation.set(0, o.rot, 0);
      d.scale.set(sx, sy, sz);
      d.updateMatrix();
      return d.matrix.toArray(new Float32Array(16));
    };
    for (const t of this.trees) {
      t.m = toM(t, t.s, t.s, t.s);
      t.col = this.collision.addCyl(t.x, t.z, t.y - 1, t.y + this.kinds[t.kind].lod0.height * t.s * 0.6, this.kinds[t.kind].lod0.trunkR * t.s * 1.1, { tag: 'tree', owner: t, climbable: true });
    }
    for (const r of this.rocks) {
      r.m = toM(r, r.s, r.s * r.sy, r.s);
      if (r.s > 0.8) r.col = this.collision.addCyl(r.x, r.z, r.y - r.s, r.y + r.s * r.sy * 0.75, r.s * 0.85, { tag: 'rock', owner: r, dome: r.s * r.sy * 0.35 });
    }
    for (const c of this.crystals) c.m = toM(c, c.s, c.s, c.s);
    const mk = (geo, matPair, cap, cast) => {
      const m = new THREE.InstancedMesh(geo, matPair.mat, Math.max(1, cap));
      m.customDepthMaterial = matPair.depth;
      m.castShadow = cast;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
      return m;
    };
    const counts = [0, 0, 0];
    for (const t of this.trees) counts[t.kind]++;
    this.treeMeshes = [];
    for (let k = 0; k < 3; k++) {
      this.treeMeshes.push([
        [mk(this.kinds[k].lod0.trunk, this.mats[k][0], counts[k], true), mk(this.kinds[k].lod0.leaves, this.mats[k][1], counts[k], true)],
        [mk(this.kinds[k].lod1.trunk, this.mats[k][0], counts[k], false), mk(this.kinds[k].lod1.leaves, this.mats[k][1], counts[k], false)],
      ]);
    }
    const rc = [0, 0];
    for (const r of this.rocks) rc[r.v]++;
    this.rockMeshes = [0, 1].map((v) => [mk(this.rockGeo[v], this.mats[3][0], rc[v], true), mk(this.rockGeoL[v], this.mats[3][0], rc[v], false)]);
    this.crystalMesh = mk(this.crystalGeo, this.mats[4][0], this.crystals.length, false);
    this.lastCam = new THREE.Vector3(1e9, 0, 0);
    this.dirty = true;
  }

  refreshTree(t) {
    if (t.col) t.col.active = t.alive;
    this.dirty = true;
  }
  refreshRock(r) {
    if (r.col) r.col.active = r.alive;
    this.dirty = true;
  }
  refreshCrystal() {
    this.dirty = true;
  }

  update(camPos) {
    const moved = Math.hypot(camPos.x - this.lastCam.x, camPos.z - this.lastCam.z);
    if (!this.dirty && moved < 8) return;
    this.dirty = false;
    this.lastCam.copy(camPos);
    const dd = G.qualityCfg ? G.qualityCfg.drawDist : 1;
    const R0 = 105 * dd, R1 = 900 * dd;
    const r0 = R0 * R0, r1 = R1 * R1;
    const cx = camPos.x, cz = camPos.z;
    const n = [[0, 0], [0, 0], [0, 0]];
    const put = (mesh, idx, m) => mesh.instanceMatrix.array.set(m, idx * 16);
    for (const t of this.trees) {
      if (!t.alive) continue;
      const dx = t.x - cx, dz = t.z - cz, d2 = dx * dx + dz * dz;
      if (d2 > r1) continue;
      const l = d2 < r0 ? 0 : 1;
      const ms = this.treeMeshes[t.kind][l];
      const i = n[t.kind][l]++;
      put(ms[0], i, t.m);
      put(ms[1], i, t.m);
    }
    for (let k = 0; k < 3; k++) for (let l = 0; l < 2; l++) for (const m of this.treeMeshes[k][l]) { m.count = n[k][l]; m.instanceMatrix.needsUpdate = true; }
    const rn = [[0, 0], [0, 0]];
    const rr0 = (R0 * 0.8) ** 2, rr1 = (R1 * 0.5) ** 2;
    for (const r of this.rocks) {
      if (!r.alive) continue;
      const dx = r.x - cx, dz = r.z - cz, d2 = dx * dx + dz * dz;
      if (d2 > rr1 && r.s < 2) continue;
      const l = d2 < rr0 ? 0 : 1;
      put(this.rockMeshes[r.v][l], rn[r.v][l]++, r.m);
    }
    for (let v = 0; v < 2; v++) for (let l = 0; l < 2; l++) { const m = this.rockMeshes[v][l]; m.count = rn[v][l]; m.instanceMatrix.needsUpdate = true; }
    let cn = 0;
    for (const c of this.crystals) if (c.alive) put(this.crystalMesh, cn++, c.m);
    this.crystalMesh.count = cn;
    this.crystalMesh.instanceMatrix.needsUpdate = true;
  }

  nearestTree(x, z, r) {
    let best = null, bd = r;
    for (const t of this.trees) {
      if (!t.alive) continue;
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
}
