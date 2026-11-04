// Foliage made of leaf cards, the way modern games build trees: each canopy
// is a few hundred small textured quads (painted leaf clusters, pine needle
// sprays or palm leaflets, drawn once on a canvas) scattered through the
// crown. Their lighting normals point out from the crown's centre so it
// shades like a soft rounded mass, the inside is darker where leaves shade
// leaves, sunlight glows through them when you look toward the sun, they
// flutter in the wind, and their shadows on the ground are dappled.
import * as THREE from '../../vendor/three.module.min.js';
import { CLOUD_UNIFORMS, CLOUD_GLSL } from './atmosphere.js';

export const FOLIAGE_UNIFORMS = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(0.3, 0) } };

// ---------------------------------------------------------------- texture
// 2x2 atlas: broad leaves, small leaves, pine needles, palm leaflets.
// Painted in greys; the colour comes from the vertex colours.
let ATLAS = null;
export function leafAtlas() {
  if (ATLAS) return ATLAS;
  const S = 512, H = S / 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  let seed = 1234;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const grey = (v, a = 1) => `rgba(${Math.round(v * 255)},${Math.round(v * 255 * 1.02)},${Math.round(v * 235)},${a})`;
  const leaf = (x, y, len, wid, ang, v) => {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.fillStyle = grey(v);
    g.beginPath();
    g.moveTo(-len / 2, 0);
    g.quadraticCurveTo(0, -wid, len / 2, 0);
    g.quadraticCurveTo(0, wid, -len / 2, 0);
    g.fill();
    g.strokeStyle = grey(v * 0.72, 0.8);
    g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(-len / 2, 0); g.lineTo(len / 2 - 1, 0); g.stroke();
    g.restore();
  };
  // broad leaves: a dense, ragged cluster with a few twigs
  const cluster = (ox, oy, n, lmin, lmax, spread) => {
    g.strokeStyle = 'rgba(80,70,60,0.9)';
    g.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = rnd() * Math.PI * 2;
      g.beginPath(); g.moveTo(ox + H / 2, oy + H / 2); g.lineTo(ox + H / 2 + Math.cos(a) * spread * 0.8, oy + H / 2 + Math.sin(a) * spread * 0.8); g.stroke();
    }
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const r = spread * Math.pow(rnd(), 0.6);
      const x = ox + H / 2 + Math.cos(a) * r, y = oy + H / 2 + Math.sin(a) * r;
      const v = 0.72 + rnd() * 0.28 - (r / spread) * 0.06;
      leaf(x, y, lmin + rnd() * (lmax - lmin), (lmin + rnd() * (lmax - lmin)) * 0.42, a + (rnd() - 0.5) * 1.4, v);
    }
  };
  cluster(0, 0, 170, 16, 30, 112);
  cluster(H, 0, 210, 9, 16, 108);
  // pine needles: a branch along the cell with needle tufts both sides
  {
    const oy = H, ox = 0;
    g.strokeStyle = 'rgba(90,75,60,1)';
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(ox + 6, oy + H / 2); g.lineTo(ox + H - 10, oy + H / 2); g.stroke();
    for (let i = 0; i < 900; i++) {
      const t = rnd();
      const x = ox + 8 + t * (H - 22);
      const y = oy + H / 2 + (rnd() - 0.5) * 6;
      const len = (22 + rnd() * 36) * (1 - t * 0.55);
      const a = (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 1.1) + (rnd() - 0.5) * 0.3;
      const v = 0.7 + rnd() * 0.3;
      g.strokeStyle = grey(v);
      g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len * 0.35, y + Math.sin(a) * len); g.stroke();
    }
  }
  // palm leaflets: a rachis with long leaflets swept toward the tip
  {
    const oy = H, ox = H;
    for (let i = 0; i < 70; i++) {
      const t = i / 70;
      const x = ox + 6 + t * (H - 16);
      for (const side of [-1, 1]) {
        const len = 44 + 70 * Math.sin(Math.PI * Math.min(1, t * 1.1)) * (1 - t * 0.3);
        const v = 0.74 + rnd() * 0.26;
        g.strokeStyle = grey(v);
        g.lineWidth = 3.2 - t * 1.6;
        g.beginPath();
        g.moveTo(x, oy + H / 2);
        g.quadraticCurveTo(x + len * 0.3, oy + H / 2 + side * len * 0.45, x + len * 0.55, oy + H / 2 + side * len * 0.8);
        g.stroke();
      }
    }
    g.strokeStyle = 'rgba(150,140,110,1)';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(ox + 4, oy + H / 2); g.lineTo(ox + H - 6, oy + H / 2); g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  ATLAS = tex;
  return tex;
}
export const CELL = { broad: 0, small: 1, needle: 2, palm: 3 };
const cellUV = (c) => [(c % 2) * 0.5, c < 2 ? 0.5 : 0]; // u0, v0 (canvas y is flipped)

// ---------------------------------------------------------------- geometry
export class CardBuilder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; }
  quad(corners, normals, color, cell, flip = false, ao = [1, 1, 1, 1]) {
    const base = this.pos.length / 3;
    const [u0, v0] = cellUV(cell);
    const uvs = flip ? [[0.5, 0], [0, 0], [0, 0.5], [0.5, 0.5]] : [[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]];
    for (let k = 0; k < 4; k++) {
      const p = corners[k], n = normals[k];
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(n.x, n.y, n.z);
      this.uv.push(u0 + uvs[k][0], v0 + uvs[k][1]);
      this.col.push(color.r * ao[k], color.g * ao[k], color.b * ao[k]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  // A quad with its own UV rectangle inside an atlas cell: uv = [[u,v] x4] in 0..1 cell space
  quadUV(corners, normals, color, cell, uv, ao = [1, 1, 1, 1]) {
    const base = this.pos.length / 3;
    const [u0, v0] = cellUV(cell);
    for (let k = 0; k < 4; k++) {
      const p = corners[k], n = normals[k];
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(n.x, n.y, n.z);
      this.uv.push(u0 + uv[k][0] * 0.5, v0 + uv[k][1] * 0.5);
      this.col.push(color.r * ao[k], color.g * ao[k], color.b * ao[k]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  // Leaf cards scattered through an ellipsoid crown section
  cluster(rng, c, r, count, size, hex, crown, opts = {}) {
    const col = new THREE.Color(hex);
    // lower detail: fewer, bigger cards covering the same crown
    const dt = this.detail ?? 1;
    if (dt < 1) { count = Math.max(4, Math.round(count * dt)); const k = 1 / Math.sqrt(dt); size = [size[0] * k, size[1] * k]; }
    const tmp = new THREE.Vector3();
    const R = opts.crownR || Math.max(r.x, r.y, r.z) * 2;
    for (let i = 0; i < count; i++) {
      const d = new THREE.Vector3(rng.float(-1, 1), rng.float(-1, 1), rng.float(-1, 1));
      if (d.lengthSq() > 1 || d.lengthSq() < 1e-4) { i--; continue; }
      d.normalize();
      const t = 0.45 + 0.55 * Math.sqrt(rng.next());
      const p = new THREE.Vector3(c.x + d.x * r.x * t, c.y + d.y * r.y * t, c.z + d.z * r.z * t);
      const out = tmp.subVectors(p, crown).normalize().clone();
      const rand = new THREE.Vector3(rng.float(-1, 1), rng.float(-1, 1), rng.float(-1, 1));
      const n = opts.flat ? new THREE.Vector3(rand.x * 0.35, 1, rand.z * 0.35).normalize() : out.clone().addScaledVector(rand, 0.9).normalize();
      const a = new THREE.Vector3(rng.float(-1, 1), rng.float(-1, 1), rng.float(-1, 1)).cross(n).normalize();
      const b = new THREE.Vector3().crossVectors(n, a);
      const s = rng.float(size[0], size[1]) / 2;
      const corners = [
        p.clone().addScaledVector(a, -s).addScaledVector(b, -s), p.clone().addScaledVector(a, s).addScaledVector(b, -s),
        p.clone().addScaledVector(a, s).addScaledVector(b, s), p.clone().addScaledVector(a, -s).addScaledVector(b, s),
      ];
      // lighting normals: mostly out from the crown centre (soft round shading)
      const normals = corners.map((q) => tmp.subVectors(q, crown).normalize().clone().lerp(n, 0.2).normalize());
      // leaves deep inside the crown and low down are shaded by the rest
      const ao = corners.map((q) => {
        const depth = Math.min(1, q.distanceTo(crown) / R);
        const low = Math.min(1, Math.max(0, (q.y - (crown.y - R * 0.8)) / (R * 1.6)));
        return (0.62 + 0.38 * Math.pow(depth, 0.8)) * (0.84 + 0.16 * low) * rng.float(0.92, 1.08);
      });
      this.quad(corners, normals, col, opts.cell ?? CELL.broad, rng.next() < 0.5, ao);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------- materials
const SWAY = `
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
  // leaves flutter on their own
  float fl = sin(uTime * 7.0 + dot(transformed, vec3(3.1, 1.7, 2.3)) + ph) * (0.025 + length(uWind) * 0.004) * min(h * 1.5, 1.0);
  transformed += vec3(fl, fl * 0.6, -fl);
}`;

// Distant canopies would thin out to bare branches as the texture's smaller
// mip levels average the gaps between leaves into the leaves; boost alpha by
// how far down the mip chain we are so a far tree stays as full as a near one
const MIP_ALPHA = `#include <map_fragment>
{
  vec2 mdx = dFdx(vMapUv * 512.0), mdy = dFdy(vMapUv * 512.0);
  float lod = max(0.0, 0.5 * log2(max(dot(mdx, mdx), dot(mdy, mdy))));
  diffuseColor.a *= 1.0 + lod * 0.32;
}`;

export function foliageMaterial({ coverage = false } = {}) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, map: leafAtlas(), alphaTest: 0.42, side: THREE.DoubleSide });
  if (coverage) m.alphaToCoverage = true;
  m.extensions = { derivatives: true };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, FOLIAGE_UNIFORMS, CLOUD_UNIFORMS);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec2 uWind;\nvarying vec3 vLeafWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SWAY)
      .replace('#include <project_vertex>', `#include <project_vertex>
      {
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
        wp = instanceMatrix * wp;
        #endif
        vLeafWorld = (modelMatrix * wp).xyz;
      }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLeafWorld;\n' + CLOUD_GLSL)
      .replace('#include <map_fragment>', MIP_ALPHA)
      // keep the crown's rounded normals on both sides of each card
      .replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\nvec3 normal = normalize( vNormal );\nvec3 nonPerturbedNormal = normal;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      {
        float cs = cloudShadow(vLeafWorld.xz);
        reflectedLight.directDiffuse *= cs;
        #if NUM_DIR_LIGHTS > 0
          // sunlight shining through the leaves
          vec3 vd = normalize(-vViewPosition);
          float back = pow(max(dot(vd, directionalLights[0].direction), 0.0), 4.0);
          reflectedLight.directDiffuse += directionalLights[0].color * diffuseColor.rgb * (back * 0.8 + 0.12) * cs;
        #endif
      }`);
  };
  m.customProgramCacheKey = () => 'foliage-v2' + (coverage ? 'c' : '');
  return m;
}

// Shadow caster for leaf cards: the same sway, and holes where the texture is clear
export function foliageDepthMaterial() {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafAtlas(), alphaTest: 0.42, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, FOLIAGE_UNIFORMS);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec2 uWind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SWAY);
  };
  m.customProgramCacheKey = () => 'foliage-depth-v1';
  return m;
}
