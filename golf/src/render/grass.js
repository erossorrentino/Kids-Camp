// Real grass blades around the ball: thousands of instanced clumps of
// curved, tapered blades (dark at the base, lighter at the tips) laid out
// over the surfaces near where you're playing from: a fine fuzz on the
// fairway right round the ball, longer grass in the rough, tall wispy
// fescue on links courses. They sway in the wind, take cloud and tree
// shadows, and sink into the ground toward the edge of the patch so
// there's no visible border. Rebuilt around the ball for every shot.
import * as THREE from '../../vendor/three.module.min.js';
import { RNG } from '../util/rng.js';
import { CLOUD_UNIFORMS, CLOUD_GLSL } from './atmosphere.js';
import { FOLIAGE_UNIFORMS } from './foliage.js';
import { albedo } from './terrainMaterial.js';

// One clump: blades fanning out from a small patch, height 1 (scaled per instance)
function clumpGeometry(blades, segs) {
  const rng = new RNG(77);
  const pos = [], nor = [], uv = [], col = [], idx = [];
  for (let b = 0; b < blades; b++) {
    const a = rng.float(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * 0.15;
    const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
    const yaw = rng.float(0, Math.PI * 2);
    const lean = rng.float(0.15, 0.55);
    const leanDir = a + rng.float(-0.6, 0.6);
    const h = rng.float(0.65, 1.0);
    const w = rng.float(0.007, 0.013);
    const tone = rng.float(0.8, 1.15);
    const base = pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const bend = lean * t * t;
      const cx = ox + Math.cos(leanDir) * bend * h, cz = oz + Math.sin(leanDir) * bend * h;
      const y = h * t * (1 - 0.18 * lean * t);
      const ww = w * (1 - t * 0.92);
      const sx = Math.cos(yaw) * ww, sz = Math.sin(yaw) * ww;
      pos.push(cx - sx, y, cz - sz, cx + sx, y, cz + sz);
      // normals lean toward "up" so blades light like the lawn, not like paper
      const nx = -Math.sin(yaw) * 0.45, nz = Math.cos(yaw) * 0.45;
      for (let k = 0; k < 2; k++) nor.push(nx, 0.9, nz);
      uv.push(0, t, 1, t);
      const v = (0.42 + 0.58 * Math.pow(t, 0.8)) * tone;
      col.push(v, v, v * (0.92 + 0.12 * t), v, v, v * (0.92 + 0.12 * t));
    }
    for (let i = 0; i < segs; i++) {
      const p = base + i * 2;
      idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function grassMaterial(uniforms) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, FOLIAGE_UNIFORMS, CLOUD_UNIFORMS, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime, uRadius;
uniform vec2 uWind;
uniform vec3 uCenter;
varying vec3 vGW;
varying float vGT;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec3 ip = instanceMatrix[3].xyz;
  float t = uv.y;
  vGT = t;
  // shrink into the ground toward the edge of the patch
  float d = length(ip.xz - uCenter.xz);
  float fade = 1.0 - smoothstep(uRadius * 0.62, uRadius, d);
  // the ball sits down in the grass but stays in sight
  fade *= mix(0.3, 1.0, smoothstep(0.08, 0.45, d));
  transformed.y *= fade;
  // wind: a steady lean plus gusts rolling across the grass
  float wl = length(uWind);
  vec2 wd = normalize(uWind + vec2(0.0001));
  float gust = sin(dot(ip.xz, wd) * 0.35 - uTime * (1.4 + wl * 0.12)) * 0.5 + 0.5;
  float flick = sin(uTime * 4.0 + ip.x * 3.1 + ip.z * 2.3) * 0.25;
  float bend = (0.08 + wl * 0.03) * (0.4 + gust * 0.9 + flick) * t * t;
  transformed.xz += wd * bend;
  transformed.y -= bend * 0.35 * t;
}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
vGW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;\nvarying float vGT;\n' + CLOUD_GLSL)
      .replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\nvec3 normal = normalize( vNormal );\nvec3 nonPerturbedNormal = normal;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{
  float cs = cloudShadow(vGW.xz);
  reflectedLight.directDiffuse *= cs;
  #if NUM_DIR_LIGHTS > 0
    vec3 vd = normalize(-vViewPosition);
    float back = pow(max(dot(vd, directionalLights[0].direction), 0.0), 3.0);
    reflectedLight.directDiffuse += directionalLights[0].color * diffuseColor.rgb * back * 0.5 * vGT * cs;
  #endif
}`);
  };
  m.customProgramCacheKey = () => 'grass-blades-v2';
  return m;
}

export class GrassField {
  constructor(hole, { quality = 'high' } = {}) {
    this.hole = hole;
    const high = quality === 'high';
    this.max = high ? 16000 : 6500;
    this.R = high ? 26 : 17;
    // full curved blades close to the ball, simpler straight ones further out
    this.nearR = high ? 8 : 6;
    this.uniforms = { uCenter: { value: new THREE.Vector3() }, uRadius: { value: this.R } };
    const mat = grassMaterial(this.uniforms);
    const make = (geo, n) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.count = 0;
      m.receiveShadow = true;
      return m;
    };
    const nearMax = Math.ceil(this.max * (this.nearR / this.R) ** 2 * 1.3);
    this.near = make(clumpGeometry(high ? 14 : 10, high ? 3 : 2), nearMax);
    this.far = make(clumpGeometry(high ? 10 : 8, 1), this.max);
    this.mesh = new THREE.Group();
    this.mesh.add(this.near, this.far);
    const c = hole.style.colors;
    this.cols = {
      fairway: albedo(c.fairway), first: albedo(c.fairway).lerp(albedo(c.rough, 0.75, 0.7), 0.5),
      rough: albedo(c.rough, 0.75, 0.74), deep: albedo(c.deep, 0.7, 0.7), fringe: albedo(c.fringe, 0.8, 0.74),
      fescue: new THREE.Color(0.32, 0.27, 0.13), heather: new THREE.Color(0.25, 0.17, 0.22),
    };
    this.at = null;
  }

  // Grow the patch round a spot (normally the ball)
  place(cx, cz) {
    if (this.at && Math.hypot(this.at.x - cx, this.at.z - cz) < 1) return;
    this.at = { x: cx, z: cz };
    const h = this.hole;
    const R = this.R;
    const step = Math.sqrt((Math.PI * R * R) / (this.max * 0.95));
    const rng = new RNG(Math.floor(cx * 13 + cz * 7) & 0xffff);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const UP = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color(), dry = new THREE.Color(0.3, 0.26, 0.1);
    const near = this.near, far = this.far;
    let nn = 0, nf = 0;
    for (let gz = -R; gz <= R; gz += step) {
      for (let gx = -R; gx <= R; gx += step) {
        const x = cx + gx + rng.float(-0.5, 0.5) * step, z = cz + gz + rng.float(-0.5, 0.5) * step;
        const d = Math.hypot(x - cx, z - cz);
        if (d > R) continue;
        const f = h.fields(x, z);
        if (f.dB < 0.15 || f.dW < 0.4 || f.dC < 0.4 || f.dO < 0.3) continue;
        const surf = h.surfaceFromFields(f);
        let ht, c, w = 1;
        if (surf === 'fairway') {
          // mown fairway: a fine fuzz only close to the ball
          if (d > 7 || rng.next() < 0.3) continue;
          ht = rng.float(0.025, 0.04); c = this.cols.fairway; w = 0.35;
        } else if (surf === 'fringe') {
          if (f.dG < 0.2 || d > 12) continue;
          ht = rng.float(0.03, 0.05); c = this.cols.fringe; w = 0.4;
        } else if (surf === 'first') { ht = rng.float(0.05, 0.08); c = this.cols.first; w = 0.55; }
        else if (surf === 'rough') { ht = rng.float(0.09, 0.17); c = this.cols.rough; w = 0.8; }
        else if (surf === 'fescue') { ht = rng.float(0.35, 0.7); c = this.cols.fescue; w = 1.2; }
        else if (surf === 'heather') { ht = rng.float(0.14, 0.26); c = rng.next() < 0.5 ? this.cols.heather : this.cols.deep; w = 1.1; }
        else if (surf === 'deep') { ht = rng.float(0.16, 0.32); c = this.cols.deep; w = 1.0; }
        else continue;
        const toNear = d < this.nearR && nn < near.instanceMatrix.count;
        if (!toNear && nf >= this.max) continue;
        const y = h.heightFromFields(x, z, f);
        q.setFromAxisAngle(UP, rng.float(0, Math.PI * 2));
        p.set(x, y - 0.01, z);
        s.set(w, ht, w);
        m4.compose(p, q, s);
        col.copy(c).multiplyScalar(rng.float(0.85, 1.12) * 1.15);
        if (rng.next() < 0.08) col.lerp(dry, 0.35); // a few dry blades
        const mesh = toNear ? near : far;
        const i = toNear ? nn++ : nf++;
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, col);
      }
    }
    near.count = nn;
    far.count = nf;
    for (const m of [near, far]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    }
    this.uniforms.uCenter.value.set(cx, 0, cz);
  }
}
