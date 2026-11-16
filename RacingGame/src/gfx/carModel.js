// Procedural car model generator.
//
// Every one of the 10,000 cars is built from a compact "visual spec": a body
// type plus a few dozen continuous parameters (proportions, roof line,
// cabin position, fender flare, wheel size, wing, lights, paint, livery).
//
// Body surface = a loft: profile curves (top line, underbody line, plan
// width) define a superellipse cross-section at each station along the car.
// Wheel arches are cut by clamping the section to an arch curve, fender
// flares bulge the sides near each axle, and a "dip" term lets the hood sit
// lower than the fenders (supercars, prototypes, classics). The glass cabin
// is a second loft sitting on the body. Lights, grille vents, pillars and
// roof panels are "patches" of those same parametric surfaces, so they
// conform exactly to the bodywork.
import * as THREE from 'three';
import { RNG, clamp, lerp, smoothstep } from '../core/rng.js';
import * as TX from './textures.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Monotone cubic 1D curve (no overshoot) through [[x, y], ...]
// ---------------------------------------------------------------------------
class Curve1D {
  constructor(pts) {
    pts = pts.slice().sort((a, b) => a[0] - b[0]);
    const n = pts.length;
    this.xs = pts.map((p) => p[0]);
    this.ys = pts.map((p) => p[1]);
    const xs = this.xs, ys = this.ys;
    const dx = [], sl = [];
    for (let i = 0; i < n - 1; i++) {
      dx[i] = Math.max(1e-6, xs[i + 1] - xs[i]);
      sl[i] = (ys[i + 1] - ys[i]) / dx[i];
    }
    const m = new Array(n);
    m[0] = sl[0]; m[n - 1] = sl[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (sl[i - 1] * sl[i] <= 0) m[i] = 0;
      else m[i] = (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / sl[i - 1] + (dx[i] + 2 * dx[i - 1]) / sl[i]);
    }
    this.dx = dx; this.m = m;
  }
  eval(x) {
    const xs = this.xs, n = xs.length;
    if (x <= xs[0]) return this.ys[0];
    if (x >= xs[n - 1]) return this.ys[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] > x) hi = mid; else lo = mid; }
    const h = this.dx[lo], t = (x - xs[lo]) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * this.ys[lo] + (t3 - 2 * t2 + t) * h * this.m[lo] +
      (-2 * t3 + 3 * t2) * this.ys[lo + 1] + (t3 - t2) * h * this.m[lo + 1];
  }
}

const sgn = (v) => (v < 0 ? -1 : 1);
const spow = (v, e) => sgn(v) * Math.pow(Math.abs(v), e);

// ---------------------------------------------------------------------------
// Generic parametric surface -> BufferGeometry with finite-difference normals
// ---------------------------------------------------------------------------
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3();

function surfaceGeometry(fn, us, ts, { center = null, offset = 0, uvMode = 'param', flip = false, uvRange = null } = {}) {
  const nu = us.length, nt = ts.length;
  const pos = new Float32Array(nu * nt * 3);
  const nor = new Float32Array(nu * nt * 3);
  const uv = new Float32Array(nu * nt * 2);
  const p = [0, 0, 0], pu = [0, 0, 0], pt = [0, 0, 0];
  const eu = 1e-4, et = 1e-4;
  const u0 = us[0], u1 = us[nu - 1], t0 = ts[0], t1 = ts[nt - 1];
  for (let i = 0; i < nu; i++) {
    const u = us[i];
    for (let j = 0; j < nt; j++) {
      const t = ts[j];
      fn(u, t, p);
      // central-ish differences, staying inside domain
      const ua = Math.max(0, u - eu), ub = Math.min(1, u + eu);
      fn(ub, t, pu); fn(ua, t, _tmpP);
      _a.set(pu[0] - _tmpP[0], pu[1] - _tmpP[1], pu[2] - _tmpP[2]);
      fn(u, t + et, pt); fn(u, t - et, _tmpP);
      _b.set(pt[0] - _tmpP[0], pt[1] - _tmpP[1], pt[2] - _tmpP[2]);
      _n.crossVectors(_b, _a);
      if (_n.lengthSq() < 1e-20) _n.set(0, 1, 0);
      _n.normalize();
      if (center) {
        const c = center(u);
        _c.set(p[0] - c[0], p[1] - c[1], 0);
        if (_c.lengthSq() > 1e-10 && _n.dot(_c) < 0) _n.negate();
      }
      if (flip) _n.negate();
      const k = (i * nt + j) * 3;
      pos[k] = p[0] + _n.x * offset; pos[k + 1] = p[1] + _n.y * offset; pos[k + 2] = p[2] + _n.z * offset;
      nor[k] = _n.x; nor[k + 1] = _n.y; nor[k + 2] = _n.z;
      const q = (i * nt + j) * 2;
      if (uvMode === 'param') { uv[q] = u; uv[q + 1] = t; }
      else { uv[q] = (u - u0) / (u1 - u0 || 1); uv[q + 1] = (t - t0) / (t1 - t0 || 1); }
      if (uvRange) { uv[q] = uvRange[0] + uv[q] * uvRange[1]; }
    }
  }
  const idx = [];
  for (let i = 0; i < nu - 1; i++) {
    for (let j = 0; j < nt - 1; j++) {
      const a = i * nt + j, b = (i + 1) * nt + j, c = (i + 1) * nt + j + 1, d = i * nt + j + 1;
      idx.push(a, b, d, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  fixWinding(g);
  return g;
}
const _tmpP = [0, 0, 0];

// Make triangle winding agree with the stored normals (so front faces render)
function fixWinding(g) {
  const pos = g.attributes.position, nor = g.attributes.normal, idx = g.index.array;
  let agree = 0, total = 0;
  const step = Math.max(3, Math.floor(idx.length / 3 / 60) * 3);
  for (let f = 0; f < idx.length; f += step) {
    const a = idx[f], b = idx[f + 1], c = idx[f + 2];
    _a.fromBufferAttribute(pos, a); _b.fromBufferAttribute(pos, b); _c.fromBufferAttribute(pos, c);
    _b.sub(_a); _c.sub(_a);
    _n.crossVectors(_b, _c);
    if (_n.lengthSq() < 1e-14) continue;
    _a.fromBufferAttribute(nor, a);
    total++;
    if (_n.dot(_a) > 0) agree++;
  }
  if (total && agree < total / 2) {
    for (let f = 0; f < idx.length; f += 3) { const t = idx[f + 1]; idx[f + 1] = idx[f + 2]; idx[f + 2] = t; }
  }
}

function linspace(a, b, n) {
  const r = [];
  for (let i = 0; i < n; i++) r.push(a + ((b - a) * i) / (n - 1));
  return r;
}

// Flat polygon cap from a ring of points (convex), facing +z or -z
function capGeometry(ring, z, facing) {
  const n = ring.length;
  let cx = 0, cy = 0;
  for (const [x, y] of ring) { cx += x; cy += y; }
  cx /= n; cy /= n;
  const pos = [cx, cy, z], nor = [0, 0, facing], uv = [0.5, 0.5];
  for (const [x, y] of ring) { pos.push(x, y, z); nor.push(0, 0, facing); uv.push(0.5, 0.5); }
  const idx = [];
  for (let i = 0; i < n; i++) {
    const a = 1 + i, b = 1 + ((i + 1) % n);
    if (facing > 0) idx.push(0, a, b); else idx.push(0, b, a);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  fixWinding(g);
  return g;
}

// ---------------------------------------------------------------------------
// Body type presets. Heights are fractions of overall height H; u runs from
// rear bumper (0) to front bumper (1).
// ---------------------------------------------------------------------------
export const BODY_TYPES = {
  hatch: {
    L: [3.85, 4.3], W: [1.72, 1.82], H: [1.40, 1.50], wb: 0.63, fo: 0.21, clr: [0.13, 0.16], wr: [0.30, 0.33], tw: [0.20, 0.23],
    top: [[0, 0.56], [0.025, 0.66], [0.06, 0.70], [0.6, 0.66], [0.75, 0.6], [0.93, 0.52], [1, 0.42]],
    bot: [[0, 0.24], [0.06, 0.12], [0.94, 0.12], [1, 0.22]],
    hw: [[0, 0.88], [0.07, 0.97], [0.25, 1], [0.8, 1], [0.93, 0.96], [1, 0.82]],
    cabin: { u0: 0.035, r0: 0.11, r1: 0.52, u1: 0.68, pr: 0.35, pf: 1.25 }, n: 3.8, nb: 6, tumble: 0.12, flare: 0.015, dip: 0,
    kF: 0.55, eF: 0.05, kR: 0.7, eR: 0.03, roofNarrow: 0.8,
  },
  sedan: {
    L: [4.55, 4.95], W: [1.80, 1.88], H: [1.40, 1.48], wb: 0.6, fo: 0.205, clr: [0.13, 0.15], wr: [0.32, 0.34], tw: [0.22, 0.25],
    top: [[0, 0.55], [0.03, 0.65], [0.1, 0.69], [0.25, 0.69], [0.62, 0.65], [0.78, 0.6], [0.94, 0.53], [1, 0.42]],
    bot: [[0, 0.26], [0.07, 0.12], [0.93, 0.12], [1, 0.24]],
    hw: [[0, 0.86], [0.08, 0.97], [0.2, 1], [0.8, 1], [0.93, 0.95], [1, 0.82]],
    cabin: { u0: 0.25, r0: 0.37, r1: 0.57, u1: 0.69, pr: 0.6, pf: 1.2 }, n: 4, nb: 6, tumble: 0.1, flare: 0.02, dip: 0,
    kF: 0.55, eF: 0.05, kR: 0.65, eR: 0.035, roofNarrow: 0.8,
  },
  coupe: {
    L: [4.4, 4.75], W: [1.82, 1.9], H: [1.30, 1.38], wb: 0.6, fo: 0.2, clr: [0.12, 0.14], wr: [0.32, 0.345], tw: [0.23, 0.26],
    top: [[0, 0.56], [0.03, 0.66], [0.12, 0.70], [0.25, 0.70], [0.62, 0.64], [0.8, 0.58], [0.95, 0.5], [1, 0.4]],
    bot: [[0, 0.27], [0.07, 0.11], [0.93, 0.11], [1, 0.24]],
    hw: [[0, 0.86], [0.1, 0.98], [0.22, 1], [0.8, 1], [0.93, 0.95], [1, 0.8]],
    cabin: { u0: 0.2, r0: 0.38, r1: 0.55, u1: 0.68, pr: 0.75, pf: 1.25 }, n: 4, nb: 6, tumble: 0.14, flare: 0.03, dip: 0.02,
    kF: 0.5, eF: 0.055, kR: 0.65, eR: 0.035, roofNarrow: 0.78,
  },
  muscle: {
    L: [4.7, 5.05], W: [1.88, 1.96], H: [1.30, 1.38], wb: 0.58, fo: 0.19, clr: [0.12, 0.15], wr: [0.33, 0.35], tw: [0.25, 0.28],
    top: [[0, 0.6], [0.025, 0.7], [0.08, 0.72], [0.22, 0.72], [0.55, 0.69], [0.8, 0.66], [0.96, 0.62], [1, 0.52]],
    bot: [[0, 0.26], [0.05, 0.12], [0.95, 0.12], [1, 0.26]],
    hw: [[0, 0.93], [0.06, 0.99], [0.2, 1], [0.85, 1], [0.95, 0.98], [1, 0.9]],
    cabin: { u0: 0.22, r0: 0.33, r1: 0.5, u1: 0.6, pr: 0.55, pf: 1.1 }, n: 5.5, nb: 7, tumble: 0.1, flare: 0.04, dip: 0,
    kF: 0.78, eF: 0.03, kR: 0.8, eR: 0.025, roofNarrow: 0.82, hoodScoop: true,
  },
  sports: {
    L: [4.25, 4.6], W: [1.86, 1.96], H: [1.22, 1.30], wb: 0.58, fo: 0.21, clr: [0.11, 0.13], wr: [0.33, 0.35], tw: [0.25, 0.29],
    top: [[0, 0.55], [0.03, 0.66], [0.12, 0.68], [0.28, 0.67], [0.6, 0.6], [0.8, 0.53], [0.95, 0.45], [1, 0.35]],
    bot: [[0, 0.28], [0.07, 0.1], [0.93, 0.1], [1, 0.22]],
    hw: [[0, 0.86], [0.1, 0.98], [0.2, 1], [0.78, 1], [0.92, 0.94], [1, 0.76]],
    cabin: { u0: 0.15, r0: 0.38, r1: 0.53, u1: 0.65, pr: 0.9, pf: 1.3 }, n: 3.6, nb: 6, tumble: 0.16, flare: 0.045, dip: 0.04,
    kF: 0.45, eF: 0.06, kR: 0.6, eR: 0.04, roofNarrow: 0.74,
  },
  gt: {
    L: [4.6, 4.95], W: [1.92, 2.0], H: [1.25, 1.32], wb: 0.6, fo: 0.19, clr: [0.11, 0.13], wr: [0.34, 0.36], tw: [0.26, 0.3],
    top: [[0, 0.55], [0.03, 0.66], [0.12, 0.68], [0.25, 0.67], [0.58, 0.6], [0.8, 0.55], [0.95, 0.47], [1, 0.36]],
    bot: [[0, 0.27], [0.06, 0.1], [0.94, 0.1], [1, 0.22]],
    hw: [[0, 0.85], [0.1, 0.98], [0.2, 1], [0.8, 1], [0.93, 0.94], [1, 0.76]],
    cabin: { u0: 0.14, r0: 0.34, r1: 0.48, u1: 0.6, pr: 0.95, pf: 1.3 }, n: 3.6, nb: 6, tumble: 0.16, flare: 0.05, dip: 0.05,
    kF: 0.45, eF: 0.06, kR: 0.6, eR: 0.04, roofNarrow: 0.74,
  },
  wedge: {
    L: [4.4, 4.8], W: [1.98, 2.08], H: [1.10, 1.2], wb: 0.6, fo: 0.21, clr: [0.09, 0.11], wr: [0.34, 0.36], tw: [0.27, 0.32],
    top: [[0, 0.64], [0.03, 0.74], [0.1, 0.78], [0.3, 0.8], [0.7, 0.62], [0.85, 0.5], [0.96, 0.4], [1, 0.3]],
    bot: [[0, 0.32], [0.06, 0.09], [0.95, 0.09], [1, 0.18]],
    hw: [[0, 0.88], [0.1, 1], [0.22, 1], [0.75, 0.98], [0.92, 0.9], [1, 0.7]],
    cabin: { u0: 0.3, r0: 0.43, r1: 0.55, u1: 0.73, pr: 1.2, pf: 1.4 }, n: 3.4, nb: 7, tumble: 0.2, flare: 0.06, dip: 0.09,
    kF: 0.35, eF: 0.07, kR: 0.75, eR: 0.03, roofNarrow: 0.66, sideIntake: true,
  },
  suv: {
    L: [4.55, 5.0], W: [1.9, 2.0], H: [1.62, 1.8], wb: 0.6, fo: 0.19, clr: [0.19, 0.23], wr: [0.36, 0.40], tw: [0.25, 0.28],
    top: [[0, 0.6], [0.025, 0.66], [0.06, 0.67], [0.6, 0.64], [0.78, 0.6], [0.94, 0.56], [1, 0.48]],
    bot: [[0, 0.26], [0.06, 0.14], [0.94, 0.14], [1, 0.26]],
    hw: [[0, 0.92], [0.06, 0.99], [0.2, 1], [0.85, 1], [0.95, 0.97], [1, 0.88]],
    cabin: { u0: 0.04, r0: 0.08, r1: 0.55, u1: 0.68, pr: 0.25, pf: 1.1 }, n: 5.5, nb: 7, tumble: 0.08, flare: 0.03, dip: 0,
    kF: 0.72, eF: 0.035, kR: 0.8, eR: 0.025, roofNarrow: 0.86,
  },
  pickup: {
    L: [5.2, 5.8], W: [1.95, 2.05], H: [1.75, 1.9], wb: 0.63, fo: 0.17, clr: [0.22, 0.26], wr: [0.38, 0.41], tw: [0.26, 0.29],
    top: [[0, 0.52], [0.02, 0.56], [0.4, 0.56], [0.43, 0.56], [0.7, 0.57], [0.9, 0.54], [1, 0.48]],
    bot: [[0, 0.28], [0.05, 0.15], [0.95, 0.15], [1, 0.28]],
    hw: [[0, 0.95], [0.05, 1], [0.9, 1], [0.97, 0.97], [1, 0.9]],
    cabin: { u0: 0.4, r0: 0.43, r1: 0.6, u1: 0.71, pr: 0.25, pf: 1.0 }, n: 6, nb: 7, tumble: 0.06, flare: 0.04, dip: 0,
    kF: 0.82, eF: 0.025, kR: 0.9, eR: 0.015, roofNarrow: 0.88, bed: [0.03, 0.39],
  },
  classic: {
    L: [4.1, 4.6], W: [1.66, 1.78], H: [1.28, 1.38], wb: 0.58, fo: 0.19, clr: [0.14, 0.17], wr: [0.31, 0.33], tw: [0.16, 0.19],
    top: [[0, 0.5], [0.04, 0.62], [0.14, 0.66], [0.28, 0.66], [0.6, 0.64], [0.85, 0.6], [0.96, 0.54], [1, 0.42]],
    bot: [[0, 0.3], [0.08, 0.14], [0.92, 0.14], [1, 0.3]],
    hw: [[0, 0.8], [0.1, 0.95], [0.25, 1], [0.78, 1], [0.92, 0.93], [1, 0.76]],
    cabin: { u0: 0.26, r0: 0.38, r1: 0.55, u1: 0.65, pr: 0.7, pf: 0.9 }, n: 2.8, nb: 4, tumble: 0.14, flare: 0.05, dip: 0.07,
    kF: 0.5, eF: 0.07, kR: 0.5, eR: 0.07, roofNarrow: 0.8, chrome: true, roundLights: true,
  },
  proto: {
    L: [4.6, 4.8], W: [1.98, 2.02], H: [1.03, 1.08], wb: 0.63, fo: 0.21, clr: [0.07, 0.08], wr: [0.34, 0.355], tw: [0.30, 0.33],
    top: [[0, 0.82], [0.03, 0.86], [0.2, 0.86], [0.42, 0.72], [0.62, 0.66], [0.82, 0.6], [0.95, 0.45], [1, 0.3]],
    bot: [[0, 0.25], [0.05, 0.07], [0.95, 0.07], [1, 0.12]],
    hw: [[0, 0.92], [0.08, 1], [0.85, 1], [0.95, 0.92], [1, 0.8]],
    cabin: { u0: 0.42, r0: 0.5, r1: 0.58, u1: 0.68, pr: 1.0, pf: 1.2 }, n: 3.6, nb: 8, tumble: 0.15, flare: 0.07, dip: 0.3,
    kF: 0.4, eF: 0.05, kR: 0.92, eR: 0.015, roofNarrow: 0.7, cabinWidth: 0.5, fin: true,
  },
};

// ---------------------------------------------------------------------------
// Visual spec generation (deterministic from seed)
// ---------------------------------------------------------------------------
export const PAINT_COLORS = [
  0xd0021b, 0xe10600, 0x9b0d15, 0xff5a00, 0xffb300, 0xf5d000, 0x9bcb3c, 0x1e8c3a, 0x0b5d3b, 0x00a6a6,
  0x0aa5e8, 0x1b4fd8, 0x0b2a6f, 0x14152a, 0x5b2a86, 0xa21caf, 0xff4f9a, 0xf2f2f2, 0xd8d8d8, 0xa9adb3,
  0x6b7078, 0x3a3d42, 0x111214, 0x050505, 0x7a5230, 0xc9a66b, 0x2f4f4f, 0x8a9a5b, 0xb87333, 0x4a90e2,
];
export const RIM_COLORS = [0xc8ccd0, 0xd9dde0, 0x2a2a2a, 0x111111, 0x8a8f96, 0xd4af37, 0xb0b5ba, 0x3a3f45];
export const CALIPER_COLORS = [0xd0021b, 0xffd400, 0x1b4fd8, 0xff6a00, 0x222222, 0x9bcb3c, 0xc8ccd0];

export function makeVisualSpec(bodyType, seed, opts = {}) {
  const rng = new RNG(seed);
  const B = BODY_TYPES[bodyType] ? bodyType : (bodyType === 'formula' ? 'formula' : 'sedan');
  const r = (a) => rng.float(a[0], a[1]);
  const spec = {
    body: B, seed,
    paint: opts.paint ?? rng.pick(PAINT_COLORS),
    accent: opts.accent ?? rng.pick(PAINT_COLORS),
    rim: opts.rim ?? rng.pick(RIM_COLORS),
    caliper: rng.pick(CALIPER_COLORS),
    finish: opts.finish ?? rng.weighted([['metallic', 5], ['gloss', 4], ['pearl', 1.5], ['matte', 0.8]]),
    rimStyle: rng.int(0, 5),
    spokes: rng.pick([5, 5, 6, 7, 10, 12, 14, 20]),
    livery: opts.livery ?? 'none',
    number: opts.number ?? rng.int(2, 99),
    race: !!opts.race,
    wing: opts.wing ?? 0,
    splitter: opts.splitter ?? 0,
    lightStyle: rng.int(0, 3),
    twoToneRoof: rng.chance(0.15),
    vary: rng.float(0, 1),
    electric: !!opts.electric,
    roofScoop: !!opts.roofScoop,
  };
  if (opts.paint == null) delete opts.paint;
  if (B === 'formula') {
    Object.assign(spec, { L: 5.5, W: 1.98, H: 0.95, wr: 0.36, twF: 0.31, twR: 0.38, clr: 0.05 });
    spec.livery = opts.livery ?? 'formula';
    return spec;
  }
  const P = BODY_TYPES[B];
  spec.L = r(P.L); spec.W = r(P.W); spec.H = r(P.H);
  spec.clr = r(P.clr); spec.wr = r(P.wr); spec.twF = r(P.tw); spec.twR = spec.twF * rng.float(1.0, 1.12);
  spec.jit = []; // per-control-point jitter so siblings differ
  for (let i = 0; i < 24; i++) spec.jit.push(rng.float(-1, 1));
  spec.cabinShift = rng.float(-0.025, 0.025);
  spec.roofScale = rng.float(0.97, 1.03);
  spec.flare = P.flare * rng.float(0.7, 1.4) + (opts.race ? 0.035 : 0);
  spec.n = P.n * rng.float(0.88, 1.12);
  spec.dip = P.dip * rng.float(0.7, 1.3);
  if (opts.race) {
    spec.wr = Math.max(spec.wr, 0.335);
    spec.twF = Math.max(spec.twF, 0.28); spec.twR = Math.max(spec.twR, 0.3);
    spec.clr = Math.max(0.06, spec.clr - 0.05);
  }
  return spec;
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
function paintMaterial(spec, liveryTex, bumpTex) {
  const finish = spec.finish;
  const params = {
    color: liveryTex ? 0xffffff : spec.paint,
    map: liveryTex || null,
    bumpMap: bumpTex || null,
    bumpScale: 0.6,
    metalness: 0.0, roughness: 0.3, clearcoat: 1.0, clearcoatRoughness: 0.03,
    envMapIntensity: 1.0,
  };
  if (finish === 'metallic') { params.metalness = 0.62; params.roughness = 0.34; }
  else if (finish === 'gloss') { params.metalness = 0.05; params.roughness = 0.22; }
  else if (finish === 'pearl') { params.metalness = 0.35; params.roughness = 0.28; params.iridescence = 0.6; params.iridescenceIOR = 1.6; params.iridescenceThicknessRange = [220, 480]; }
  else if (finish === 'matte') { params.metalness = 0.15; params.roughness = 0.62; params.clearcoat = 0.0; }
  else if (finish === 'chrome') { params.metalness = 1.0; params.roughness = 0.06; }
  return new THREE.MeshPhysicalMaterial(params);
}

function sharedMats() {
  if (sharedMats.m) return sharedMats.m;
  const carbonMap = TX.carbonTexture();
  carbonMap.repeat.set(6, 6);
  sharedMats.m = {
    glass: new THREE.MeshPhysicalMaterial({ color: 0x07090c, metalness: 0.0, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.0, envMapIntensity: 1.6, reflectivity: 0.9 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.45, metalness: 0.2 }),
    matteBlack: new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.8, metalness: 0.0 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.06, metalness: 1.0 }),
    carbon: new THREE.MeshPhysicalMaterial({ map: carbonMap, color: 0xffffff, roughness: 0.5, metalness: 0.2, clearcoat: 0.5, clearcoatRoughness: 0.25, envMapIntensity: 0.6 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92, metalness: 0.0 }),
    grille: new THREE.MeshStandardMaterial({ map: TX.grilleTexture(), roughness: 0.6, metalness: 0.3 }),
    disc: new THREE.MeshStandardMaterial({ map: TX.discTexture(), roughness: 0.42, metalness: 0.85 }),
    under: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1, metalness: 0 }),
    exhaust: new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.25, metalness: 1.0 }),
    exhaustInner: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x111820, metalness: 0.9, roughness: 0.05, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.8 }),
  };
  return sharedMats.m;
}

// ---------------------------------------------------------------------------
// Livery painter: canvas mapped onto (u along length, t around section)
// ---------------------------------------------------------------------------
const hex = (c) => '#' + new THREE.Color(c).getHexString();

function paintLivery(spec, dims, res = 1) {
  // drawing happens in a 1024x512 logical space; res < 1 makes a smaller texture
  const W = 1024, H = 512;
  const cv = document.createElement('canvas');
  cv.width = Math.round(W * res); cv.height = Math.round(H * res);
  const ctx = cv.getContext('2d');
  ctx.scale(res, res);
  const bump = document.createElement('canvas');
  bump.width = Math.round(W * res); bump.height = Math.round(H * res);
  const bctx = bump.getContext('2d');
  bctx.scale(res, res);
  bctx.fillStyle = '#fff'; bctx.fillRect(0, 0, W, H);
  // stretch correction: px per metre along vs around
  const pxU = W / dims.L, pxT = H / dims.perim;
  const aspect = pxU / pxT;
  const X = (u) => u * W;
  const Y = (t) => (1 - t) * H;
  const base = hex(spec.paint), acc = hex(spec.accent);
  ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);

  const rng = new RNG(spec.seed * 7 + 1);
  const L = spec.livery;
  const sideBands = [[0.08, 0.42], [0.58, 0.92]]; // left, right
  if (L === 'stripes' || L === 'race_stripes') {
    ctx.fillStyle = acc;
    const w = 0.022, gap = 0.008;
    ctx.fillRect(0, Y(0.5 + gap + w), W, w * H);
    ctx.fillRect(0, Y(0.5 - gap), W, w * H);
  }
  if (L === 'twotone') {
    ctx.fillStyle = acc;
    ctx.fillRect(0, Y(0.2), W, 0.2 * H);
    ctx.fillRect(0, Y(1.0), W, 0.2 * H);
  }
  if (L === 'sidestripe') {
    ctx.fillStyle = acc;
    ctx.fillRect(0, Y(0.3), W, 0.025 * H);
    ctx.fillRect(0, Y(0.73), W, 0.025 * H);
  }
  if (L === 'race' || L === 'race_stripes' || L === 'formula') {
    // diagonal swooshes on the sides
    ctx.save();
    ctx.fillStyle = acc;
    for (const [t0, t1] of sideBands) {
      ctx.beginPath();
      const a = rng.float(0.1, 0.35);
      ctx.moveTo(X(a), Y(t0)); ctx.lineTo(X(a + 0.25), Y(t0)); ctx.lineTo(X(a + 0.45), Y(t1)); ctx.lineTo(X(a + 0.2), Y(t1));
      ctx.closePath(); ctx.fill();
    }
    // nose band
    ctx.fillRect(X(0.9), 0, X(0.1), H);
    ctx.restore();
    // sponsor text along lower sides and number roundels on doors
    const sponsor = TX.SPONSORS[rng.int(0, TX.SPONSORS.length - 1)];
    const sponsor2 = TX.SPONSORS[rng.int(0, TX.SPONSORS.length - 1)];
    const drawSide = (tc, flipY, mirrorX, fn) => {
      ctx.save();
      ctx.translate(0, Y(tc));
      ctx.scale(mirrorX ? -1 : 1, flipY ? -1 : 1);
      fn();
      ctx.restore();
    };
    const numberAt = (uc, tc, flipY, mirrorX) => {
      drawSide(tc, flipY, mirrorX, () => {
        const cx = mirrorX ? -X(uc) : X(uc);
        ctx.save();
        ctx.translate(cx, 0);
        ctx.scale(1, aspect);
        const r = 0.055 * H / aspect * 1.6;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.ellipse(0, 0, r * 1.2, r, 0, 0, TAU); ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#111'; ctx.stroke();
        ctx.fillStyle = '#111';
        ctx.font = `italic 900 ${r * 1.5}px "Titillium Web", Arial, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(spec.number), 0, r * 0.08);
        ctx.restore();
      });
    };
    const textAt = (txt, uc, tc, size, color, flipY, mirrorX) => {
      drawSide(tc, flipY, mirrorX, () => {
        const cx = mirrorX ? -X(uc) : X(uc);
        ctx.save();
        ctx.translate(cx, 0);
        ctx.scale(1, aspect);
        ctx.fillStyle = color;
        ctx.font = `italic 900 ${size}px "Titillium Web", Arial, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, 0, 0);
        ctx.restore();
      });
    };
    const doorU = clamp(dims.doorU, 0.3, 0.7);
    // left side (t=0.25): mirrored horizontally; right side (t=0.75): flipped vertically
    if (L !== 'formula') {
      numberAt(doorU, 0.26, false, true);
      numberAt(doorU, 0.74, true, false);
    }
    textAt(sponsor[0], doorU - 0.02, 0.15, 22, sponsor[2] === '#ffffff' ? '#fff' : '#111', false, true);
    textAt(sponsor[0], doorU - 0.02, 0.85, 22, sponsor[2] === '#ffffff' ? '#fff' : '#111', true, false);
    textAt(sponsor2[0], 0.14, 0.3, 16, '#ffffff', false, true);
    textAt(sponsor2[0], 0.14, 0.7, 16, '#ffffff', true, false);
    // hood number / sponsor across top
    ctx.save();
    ctx.translate(X(dims.hoodU), Y(0.5));
    ctx.rotate(-Math.PI / 2);
    ctx.scale(1, aspect);
    ctx.fillStyle = '#ffffff';
    ctx.font = `italic 900 26px "Titillium Web", Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(L === 'formula' ? sponsor[0] : String(spec.number), 0, 0);
    ctx.restore();
  }
  if (L === 'fade') {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, acc); g.addColorStop(0.55, base); g.addColorStop(1, base);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // ---- panel gaps: doors, hood, trunk (drawn on colour + bump)
  const lines = (c, col, wpx) => {
    c.strokeStyle = col; c.lineWidth = wpx;
    if (!spec.race || spec.body !== 'formula') {
      for (const [t0, t1] of sideBands) {
        for (const du of dims.doorLines) {
          c.beginPath(); c.moveTo(X(du), Y(t0 + 0.03)); c.lineTo(X(du + 0.01), Y(t1 - 0.04)); c.stroke();
        }
        // sill line
        c.beginPath(); c.moveTo(X(dims.doorLines[0]), Y(t0 + 0.035)); c.lineTo(X(dims.doorLines[dims.doorLines.length - 1]), Y(t0 + 0.035)); c.stroke();
      }
      // hood shut line
      c.beginPath(); c.moveTo(X(dims.hoodLine), Y(0.36)); c.lineTo(X(dims.hoodLine), Y(0.64)); c.stroke();
      // trunk
      if (dims.trunkLine > 0) { c.beginPath(); c.moveTo(X(dims.trunkLine), Y(0.38)); c.lineTo(X(dims.trunkLine), Y(0.62)); c.stroke(); }
    }
  };
  lines(ctx, 'rgba(0,0,0,0.45)', 1.6);
  lines(bctx, '#000', 2.2);
  // fuel cap
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(X(0.22), Y(0.33), 7 / aspect * 2.2, 7, 0, 0, TAU); ctx.stroke();

  const map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  map.userData.ownCanvas = true;
  const bumpMap = new THREE.CanvasTexture(bump);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.userData.ownCanvas = true;
  return { map, bumpMap };
}

// ---------------------------------------------------------------------------
// Wheels
// ---------------------------------------------------------------------------
function buildWheelGeoms(radius, width, spec, detail) {
  const seg = detail >= 2 ? 44 : detail === 1 ? 30 : 18;
  const rimR = radius * (spec.body === 'formula' ? 0.62 : spec.body === 'classic' ? 0.6 : spec.body === 'suv' || spec.body === 'pickup' ? 0.66 : 0.71);
  const hw = width / 2;
  // tyre cross-section (r, x) lathed around X axis
  const prof = [];
  const sideR = (radius - rimR);
  const pts = [
    [rimR * 0.98, -hw * 0.92], [rimR + sideR * 0.25, -hw], [rimR + sideR * 0.7, -hw * 1.02], [radius - 0.025, -hw * 0.94],
    [radius, -hw * 0.75], [radius, hw * 0.75], [radius - 0.025, hw * 0.94], [rimR + sideR * 0.7, hw * 1.02], [rimR + sideR * 0.25, hw], [rimR * 0.98, hw * 0.92],
  ];
  for (const [rr, x] of pts) prof.push(new THREE.Vector2(rr, x));
  const tyre = new THREE.LatheGeometry(prof, seg);
  tyre.rotateZ(-Math.PI / 2); // lathe axis Y -> X
  // sidewall decal ring (outer face, +X)
  const side = new THREE.RingGeometry(rimR * 1.02, radius * 0.96, seg, 1);
  side.rotateY(Math.PI / 2);
  side.translate(hw * 1.02 + 0.002, 0, 0);
  // remap ring UVs planar
  {
    const p = side.attributes.position, uv = side.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getZ(i) / (radius * 2) * 1.0, 0.5 + p.getY(i) / (radius * 2) * 1.0);
  }
  // rim face: extruded disc with spoke windows
  const shape = new THREE.Shape();
  shape.absarc(0, 0, rimR * 0.97, 0, TAU, false);
  const style = spec.rimStyle;
  const nsp = style === 3 ? 0 : spec.body === 'formula' ? 10 : spec.spokes;
  const inner = rimR * (style === 4 ? 0.45 : 0.3), outer = rimR * (style === 2 ? 0.9 : 0.86);
  if (nsp > 0) {
    const spokeW = style === 1 ? 0.22 : style === 5 ? 0.12 : 0.32; // fraction of sector that is spoke
    for (let i = 0; i < nsp; i++) {
      const a0 = (i / nsp) * TAU, a1 = ((i + 1) / nsp) * TAU;
      const pad = ((a1 - a0) * spokeW) / 2;
      const s0 = a0 + pad, s1 = a1 - pad;
      if (s1 - s0 < 0.04) continue;
      const hole = new THREE.Path();
      const twist = style === 5 ? 0.25 : 0;
      hole.moveTo(Math.cos(s0 + twist) * inner, Math.sin(s0 + twist) * inner);
      hole.absarc(0, 0, outer, s0, s1, false);
      hole.lineTo(Math.cos(s1 + twist) * inner, Math.sin(s1 + twist) * inner);
      if (style !== 2) hole.absarc(0, 0, inner, s1 + twist, s0 + twist, true);
      shape.holes.push(hole);
    }
  } else {
    // dish with small round holes
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU, h = new THREE.Path();
      h.absarc(Math.cos(a) * rimR * 0.62, Math.sin(a) * rimR * 0.62, rimR * 0.16, 0, TAU, true);
      shape.holes.push(h);
    }
  }
  const face = new THREE.ExtrudeGeometry(shape, {
    depth: 0.025, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.008, bevelSegments: detail >= 2 ? 2 : 1,
    curveSegments: detail >= 2 ? 10 : 5,
  });
  face.rotateY(Math.PI / 2);
  face.translate(hw * 0.62, 0, 0);
  // barrel (inside of rim) and hub cap
  const barrel = new THREE.CylinderGeometry(rimR * 0.98, rimR * 0.98, width * 0.9, seg, 1, true);
  barrel.rotateZ(Math.PI / 2);
  const cap = new THREE.CylinderGeometry(rimR * 0.2, rimR * 0.22, 0.05, 16);
  cap.rotateZ(Math.PI / 2);
  cap.translate(hw * 0.68, 0, 0);
  // brake disc + caliper (inboard)
  const disc = new THREE.CylinderGeometry(rimR * 0.82, rimR * 0.82, 0.03, seg);
  disc.rotateZ(Math.PI / 2);
  disc.translate(hw * 0.12, 0, 0);
  // disc texture mapping on caps: cylinder caps get uv already radial-ish
  const caliper = new THREE.BoxGeometry(0.07, rimR * 0.55, rimR * 0.3);
  caliper.translate(hw * 0.22, rimR * 0.52, -rimR * 0.18);
  return { tyre, side, face, barrel, cap, disc, caliper, rimR };
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------
export function buildCar(spec, { detail = 2, night = false } = {}) {
  if (spec.body === 'formula') return buildFormula(spec, { detail, night });
  const M = sharedMats();
  const P = BODY_TYPES[spec.body];
  const jit = spec.jit || new Array(24).fill(0);
  const L = spec.L, W = spec.W, H = spec.H;
  const wbase = L * P.wb, fo = L * P.fo;
  const zF = L / 2 - fo, zR = zF - wbase;
  const zMid = (zF + zR) / 2; // shift everything so axle midpoint is origin
  const uF = (zF + L / 2) / L, uR = (zR + L / 2) / L;
  const wr = spec.wr, clr = spec.clr;
  const archR = wr + 0.045;

  // ---- profile curves with jitter
  const jy = (pts, scale, k0) => pts.map(([u, v], i) => [u, v * H * (1 + jit[(i + k0) % 24] * scale)]);
  const topC = new Curve1D(jy(P.top, 0.03, 0));
  const botPts = P.bot.map(([u, v]) => [u, Math.max(clr, v * H * (v > 0.15 ? 1 : 0) + (v <= 0.15 ? clr : 0))]);
  const botC = new Curve1D(botPts);
  const hwC = new Curve1D(P.hw.map(([u, v], i) => [u, v * (1 + jit[(i + 7) % 24] * 0.015)]));
  const dipC = new Curve1D([[0, 0], [Math.max(0.05, uR - 0.1), 0], [uR, spec.dip * 0.3], [Math.min(0.62, uF - 0.25), 0], [uF - 0.12, spec.dip], [uF + 0.08, spec.dip], [1, spec.dip * 0.7]]);
  const n = spec.n, nb = P.nb, tumble = P.tumble;
  const flareY = wr + archR * 0.55;

  const station = (u) => {
    const z = -L / 2 + u * L - zMid;
    let top = topC.eval(u), bot = botC.eval(u);
    let hw = hwC.eval(u) * W / 2;
    // end rounding
    let k = 1;
    if (u > 1 - P.eF) { const t = (u - (1 - P.eF)) / P.eF; k = P.kF + (1 - P.kF) * Math.sqrt(Math.max(0, 1 - t * t)); }
    if (u < P.eR) { const t = (P.eR - u) / P.eR; k = P.kR + (1 - P.kR) * Math.sqrt(Math.max(0, 1 - t * t)); }
    const yc = (top + bot) / 2, hh = ((top - bot) / 2) * k;
    hw *= lerp(1, k, 0.85);
    // arch clamp + flare
    let arch = -1e9, flare = 0;
    for (const za of [zF - zMid, zR - zMid]) {
      const dz = z - za;
      if (Math.abs(dz) < archR) arch = Math.max(arch, wr + Math.sqrt(archR * archR - dz * dz));
      flare += Math.exp(-Math.pow(dz / (archR * 1.25), 4));
    }
    return { z, yc, hh, hw, arch, flare: flare * spec.flare, dip: dipC.eval(u) };
  };
  const cacheS = new Map();
  const st = (u) => { let s = cacheS.get(u); if (!s) { s = station(u); cacheS.set(u, s); } return s; };

  const hullPoint = (u, t, out) => {
    const s = st(u);
    const th = t * TAU - Math.PI / 2;
    const c = Math.cos(th), sn = Math.sin(th);
    const upper = sn >= 0;
    const ex = 2 / (upper ? n : nb);
    let x = s.hw * spow(c, ex);
    const yN = spow(sn, ex);
    let y = s.hh * yN;
    if (upper) {
      x *= 1 - tumble * yN * yN;
      // hood/nose dip between fenders
      if (s.dip > 0) {
        const xr = Math.abs(x) / s.hw;
        y -= s.dip * H * 0.35 * yN * (1 - smoothstep(0.3, 0.78, xr));
      }
    }
    let Y = s.yc + y;
    // fender flare bulge around arch height on the sides
    if (s.flare > 0) x += sgn(c) * s.flare * Math.exp(-Math.pow((Y - flareY) / 0.2, 2)) * Math.pow(Math.abs(c), 0.35);
    if (Y < s.arch) Y = s.arch;
    out[0] = x; out[1] = Y; out[2] = s.z;
    return out;
  };
  const hullCenter = (u) => { const s = st(u); return [0, s.yc, s.z]; };

  // stations: uniform + dense around arches and ends
  const nAlong = detail >= 2 ? 110 : detail === 1 ? 70 : 40;
  const nAround = detail >= 2 ? 64 : detail === 1 ? 44 : 28;
  let us = linspace(0, 1, nAlong);
  const addRange = (a, b, step) => { for (let u = a; u <= b; u += step) us.push(clamp(u, 0, 1)); };
  const du = (archR / L);
  const stepA = detail >= 2 ? 0.0035 : 0.007;
  for (const ua of [uF, uR]) {
    addRange(ua - du * 1.15, ua + du * 1.15, stepA);
    us.push(ua - du + 0.0004, ua - du - 0.0004, ua + du - 0.0004, ua + du + 0.0004);
  }
  addRange(0, P.eR, P.eR / (detail >= 2 ? 10 : 5));
  addRange(1 - P.eF, 1, P.eF / (detail >= 2 ? 12 : 6));
  us = [...new Set(us.map((u) => Math.round(u * 1e5) / 1e5))].sort((a, b) => a - b);
  const ts = linspace(0, 1, nAround + 1);

  // dims for livery
  const cab = P.cabin;
  const cs = spec.cabinShift || 0;
  const cu0 = cab.u0 + cs, cr0 = cab.r0 + cs, cr1 = cab.r1 + cs, cu1 = cab.u1 + cs;
  const dims = {
    L, perim: 2 * (W + H * 0.75), doorU: (cr0 + cr1) / 2,
    doorLines: spec.body === 'hatch' || spec.body === 'coupe' || spec.body === 'sports' || spec.body === 'gt' || spec.body === 'wedge' || spec.body === 'muscle' || spec.body === 'classic' || spec.body === 'proto'
      ? [cr0 - 0.02, cu1 - 0.01] : [cu0 + 0.06, (cr0 + cr1) / 2, cu1 - 0.01],
    hoodLine: Math.min(0.97, cu1 + 0.03), hoodU: (cu1 + 1) / 2, trunkLine: spec.body === 'sedan' || spec.body === 'classic' || spec.body === 'muscle' ? Math.max(0.05, cu0 - 0.02) : 0,
  };
  const useLivery = true;
  const { map: liveryMap, bumpMap } = useLivery ? paintLivery(spec, dims, detail >= 2 ? 1 : 0.5) : {};
  const paint = paintMaterial(spec, liveryMap, detail >= 2 ? bumpMap : null);
  if (detail < 2 && bumpMap) { bumpMap.dispose(); bumpMap.image.width = 0; bumpMap.image.height = 0; }
  const accentMat = new THREE.MeshPhysicalMaterial({ color: spec.accent, metalness: 0.3, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 });
  const headMat = new THREE.MeshStandardMaterial({
    map: TX.headlightTexture(spec.lightStyle % 2), emissiveMap: TX.headlightTexture(spec.lightStyle % 2),
    emissive: 0xffffff, emissiveIntensity: night ? 3.0 : 0.6, roughness: 0.05, metalness: 0.6,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    map: TX.taillightTexture(), emissiveMap: TX.taillightTexture(), emissive: 0xff1a1a,
    emissiveIntensity: night ? 1.6 : 0.45, roughness: 0.1, metalness: 0.2,
  });

  const root = new THREE.Group();
  root.name = 'car';
  const body = new THREE.Group();
  root.add(body);
  const addMesh = (geo, mat, parent = body, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow && detail >= 1;
    m.receiveShadow = detail >= 1;
    parent.add(m);
    return m;
  };

  // ---- hull
  const hullGeo = surfaceGeometry(hullPoint, us, ts, { center: hullCenter });
  addMesh(hullGeo, paint);
  // end caps
  const ringAt = (u) => ts.slice(0, -1).map((t) => { const p = hullPoint(u, t, [0, 0, 0]); return [p[0], p[1]]; });
  addMesh(capGeometry(ringAt(1), st(1).z, 1), paint);
  addMesh(capGeometry(ringAt(0), st(0).z, -1), paint);

  // ---- cabin (glass) sitting on the hull
  const roofH = H * spec.roofScale;
  const cabW = P.cabinWidth;
  const cabinBase = (u) => {
    // beltline: hull top at centre minus a little so it sinks in
    const p = hullPoint(u, 0.5, [0, 0, 0]);
    return p[1] - 0.025;
  };
  const cabinTop = (u) => {
    const base = cabinBase(u);
    let h;
    if (u <= cr0) { const s = clamp((u - cu0) / (cr0 - cu0), 0, 1); h = Math.pow(Math.sin(s * Math.PI / 2), cab.pr); }
    else if (u >= cr1) { const s = clamp((cu1 - u) / (cu1 - cr1), 0, 1); h = Math.pow(Math.sin(s * Math.PI / 2), cab.pf); }
    else h = 1 + 0.02 * Math.sin(((u - cr0) / (cr1 - cr0)) * Math.PI);
    return base + Math.max(0, roofH - base) * h;
  };
  const cabinHalfW = (u) => {
    const s = st(u);
    const w = cabW ? cabW * W / 2 : s.hw * (1 - tumble) * 0.97;
    return w;
  };
  const nCab = 2 / (spec.body === 'classic' ? 3 : 5);
  const cabinPoint = (u, t, out) => {
    const base = cabinBase(u), top = cabinTop(u), h = Math.max(0.001, top - base);
    const th = t * Math.PI; // 0 = right base, 0.5 = roof, 1 = left base (via cos sign)
    const c = Math.cos(th), sn = Math.sin(th);
    const yN = Math.pow(Math.abs(sn), nCab);
    let x = cabinHalfW(u) * spow(c, nCab) * lerp(1, P.roofNarrow, yN);
    out[0] = x; out[1] = base + h * yN; out[2] = -L / 2 + u * L - zMid;
    return out;
  };
  const cabinCenter = (u) => [0, cabinBase(u), -L / 2 + u * L - zMid];
  const cus = linspace(cu0, cu1, detail >= 2 ? 60 : 30);
  const cts = linspace(0, 1, detail >= 2 ? 40 : 24);
  addMesh(surfaceGeometry(cabinPoint, cus, cts, { center: cabinCenter }), M.glass);
  // roof panel (painted or contrast black) and pillars
  const roofMat = spec.twoToneRoof ? M.trim : paint;
  const roofU0 = cr0 + 0.012, roofU1 = cr1 - 0.008;
  if (roofU1 > roofU0) {
    addMesh(surfaceGeometry(cabinPoint, linspace(roofU0, roofU1, 16), linspace(0.24, 0.76, 18), { center: cabinCenter, offset: 0.004, uvMode: 'local' }), roofMat);
  }
  // A pillars
  for (const [a, b] of [[0.17, 0.27], [0.73, 0.83]]) {
    addMesh(surfaceGeometry(cabinPoint, linspace(cr1, cu1 - 0.004, 14), linspace(a, b, 4), { center: cabinCenter, offset: 0.004, uvMode: 'local' }), spec.twoToneRoof ? M.trim : paint);
  }
  // C pillars (fat for sedans/coupes)
  const cw = spec.body === 'hatch' || spec.body === 'suv' ? [0.0, 0.3] : [0.0, 0.26];
  for (const [a, b] of [[cw[0] + 0.02, cw[1]], [1 - cw[1], 1 - cw[0] - 0.02]]) {
    const cu = spec.body === 'hatch' || spec.body === 'suv' ? [cu0 + 0.004, cr0 + 0.04] : [cu0 + 0.004, cr0 + 0.01];
    addMesh(surfaceGeometry(cabinPoint, linspace(cu[0], cu[1], 12), linspace(a, b, 6), { center: cabinCenter, offset: 0.004, uvMode: 'local' }), spec.twoToneRoof ? M.trim : paint);
  }
  // B pillar (black)
  if (spec.body !== 'proto') {
    const bu = dims.doorLines.length > 2 ? dims.doorLines[1] : (cr0 + cr1) / 2 - 0.02;
    for (const [a, b] of [[0.0, 0.2], [0.8, 1.0]]) {
      addMesh(surfaceGeometry(cabinPoint, linspace(bu - 0.006, bu + 0.006, 3), linspace(a, b, 6), { center: cabinCenter, offset: 0.005, uvMode: 'local' }), M.trim, body, false);
    }
  }
  // window trim (chrome for classics/luxury, black otherwise)
  for (const [a, b] of [[0.0, 0.035], [0.965, 1.0]]) {
    addMesh(surfaceGeometry(cabinPoint, linspace(cu0 + 0.01, cu1 - 0.01, 30), linspace(a, b, 2), { center: cabinCenter, offset: 0.004, uvMode: 'local' }), P.chrome ? M.chrome : M.trim, body, false);
  }

  // ---- lights: patches on the hull near the ends
  const ls = spec.lightStyle;
  const headU = ls === 2 ? [0.965, 0.993] : P.roundLights ? [0.955, 0.995] : [0.95, 0.99];
  const headT = ls === 1 ? [0.36, 0.44] : ls === 2 ? [0.33, 0.47] : [0.335, 0.425];
  if (spec.body !== 'proto' || true) {
    addMesh(surfaceGeometry(hullPoint, linspace(headU[0], headU[1], 8), linspace(headT[0], headT[1], 10), { center: hullCenter, offset: 0.004, uvMode: 'local' }), headMat, body, false);
    addMesh(surfaceGeometry(hullPoint, linspace(headU[0], headU[1], 8), linspace(1 - headT[1], 1 - headT[0], 10), { center: hullCenter, offset: 0.004, uvMode: 'local' }), headMat, body, false);
  }
  const tailT = ls === 2 ? [[0.32, 0.68]] : [[0.31, 0.43], [0.57, 0.69]];
  for (const [a, b] of tailT) {
    addMesh(surfaceGeometry(hullPoint, linspace(0.006, P.eR * 1.6, 6), linspace(a, b, ls === 2 ? 24 : 10), { center: hullCenter, offset: 0.004, uvMode: 'local' }), tailMat, body, false);
  }

  // ---- front fascia: grille + lower intake clipped to the real front face
  const front = st(1);
  const frontZ = front.z + 0.004;
  const frontRing = ringAt(1);
  const isEV = !!spec.electric;
  const bandShape = (ring, y0, y1, shrink) => {
    // horizontal extent of the polygon at height y
    const extent = (y) => {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) {
          const x = a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
          lo = Math.min(lo, x); hi = Math.max(hi, x);
        }
      }
      return [lo, hi];
    };
    const steps = 8, left = [], right = [];
    for (let i = 0; i <= steps; i++) {
      const y = y0 + (y1 - y0) * i / steps;
      const [lo, hi] = extent(y);
      if (!isFinite(lo)) return null;
      const c = (lo + hi) / 2, h = (hi - lo) / 2 * shrink;
      right.push([c + h, y]); left.push([c - h, y]);
    }
    const sh = new THREE.Shape();
    sh.moveTo(right[0][0], right[0][1]);
    for (const p of right) sh.lineTo(p[0], p[1]);
    for (const p of left.reverse()) sh.lineTo(p[0], p[1]);
    sh.closePath();
    const g = new THREE.ShapeGeometry(sh);
    const pa = g.attributes.position, uva = g.attributes.uv;
    for (let i = 0; i < pa.count; i++) uva.setXY(i, pa.getX(i) * 4, pa.getY(i) * 4);
    return g;
  };
  let ringTop = -Infinity, ringBot = Infinity;
  for (const [x, y] of frontRing) { if (Math.abs(x) < front.hw * 0.25) ringTop = Math.max(ringTop, y); ringBot = Math.min(ringBot, y); }
  const fh = ringTop - ringBot;
  if (fh > 0.05) {
    const hasUpperGrille = !['wedge', 'proto', 'sports', 'gt'].includes(spec.body);
    if (!isEV && hasUpperGrille && fh > 0.16) {
      const big = spec.body === 'muscle' || spec.body === 'suv' || spec.body === 'pickup';
      const gg = bandShape(frontRing, ringBot + fh * 0.42, ringBot + fh * (big ? 0.86 : 0.78), big ? 0.86 : 0.62);
      if (gg) { const gm = new THREE.Mesh(gg, M.grille); gm.position.z = frontZ; body.add(gm); }
    }
    const ig = bandShape(frontRing, ringBot + fh * 0.08, ringBot + fh * 0.34, 0.8);
    if (ig) { const im = new THREE.Mesh(ig, M.grille); im.position.z = frontZ + 0.001; body.add(im); }
  }
  // rear: dark lower valance on the tail cap
  const rearRing = ringAt(0);
  let rTop = -Infinity, rBot = Infinity;
  for (const [x, y] of rearRing) { if (Math.abs(x) < front.hw * 0.25) rTop = Math.max(rTop, y); rBot = Math.min(rBot, y); }
  if (rTop - rBot > 0.08) {
    const rg = bandShape(rearRing, rBot + 0.005, rBot + (rTop - rBot) * 0.3, 0.92);
    if (rg) { const rm = new THREE.Mesh(rg, spec.race ? M.carbon : M.trim); rm.rotation.y = Math.PI; rm.position.z = st(0).z - 0.004; body.add(rm); }
  }

  // ---- black lower trim: rockers between the arches, bumper lips
  const trimMat = spec.race ? M.carbon : M.trim;
  const duA = archR / L * 1.06;
  for (const [a, b] of [[0.095, 0.16], [0.84, 0.905]]) {
    addMesh(surfaceGeometry(hullPoint, linspace(uR + duA, uF - duA, 24), linspace(a, b, 4), { center: hullCenter, offset: 0.003, uvMode: 'local' }), trimMat, body, false);
  }
  for (const [a, b] of [[0.0, 0.1], [0.9, 1.0]]) {
    addMesh(surfaceGeometry(hullPoint, linspace(uF + duA, 1, 14), linspace(a, b, 6), { center: hullCenter, offset: 0.003, uvMode: 'local' }), trimMat, body, false);
    addMesh(surfaceGeometry(hullPoint, linspace(0, uR - duA, 10), linspace(a, b, 6), { center: hullCenter, offset: 0.003, uvMode: 'local' }), trimMat, body, false);
  }

  // ---- underbody occluder (hides see-through under arches)
  const tub = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.6, W - Math.max(spec.twF, spec.twR) * 2 - 0.12), wr * 1.5, (zF - zR) + archR * 2.4), M.under);
  tub.position.set(0, clr + wr * 0.75, 0);
  body.add(tub);
  // wheel-well darkness: inner liners (thin dark boxes behind the wheels)
  for (const za of [zF - zMid, zR - zMid]) {
    const liner = new THREE.Mesh(new THREE.CylinderGeometry(archR * 0.98, archR * 0.98, W * 0.86, 20, 1, true, 0, Math.PI), M.under);
    liner.rotation.z = Math.PI / 2;
    liner.rotation.y = 0;
    liner.position.set(0, wr, za);
    liner.material = M.under;
    body.add(liner);
  }

  // ---- side skirts, splitter, diffuser
  const rocker = st(0.5);
  if (spec.race || spec.splitter || spec.body === 'wedge' || spec.body === 'proto' || spec.body === 'gt') {
    const outline = [];
    const uStart = Math.min(1 - P.eF * 2.5, uF + duA + 0.01);
    for (const u of linspace(uStart, 1, 12)) { const pp = hullPoint(u, 0.13, [0, 0, 0]); outline.push([Math.abs(pp[0]) + 0.03, pp[2] + (u > 0.995 ? 0.06 : 0.0)]); }
    const sh = new THREE.Shape();
    sh.moveTo(outline[0][0], outline[0][1] - 0.05);
    for (const [x, z] of outline) sh.lineTo(x, z);
    for (const [x, z] of outline.slice().reverse()) sh.lineTo(-x, z);
    sh.lineTo(-outline[0][0], outline[0][1] - 0.05);
    sh.closePath();
    const spg = new THREE.ExtrudeGeometry(sh, { depth: 0.022, bevelEnabled: false, curveSegments: 2 });
    spg.rotateX(Math.PI / 2);
    const sp = new THREE.Mesh(spg, spec.race ? M.carbon : M.trim);
    sp.position.y = Math.max(0.045, clr - 0.02) + 0.022;
    body.add(sp);
    const dif = new THREE.Group();
    for (let i = -3; i <= 3; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, 0.36), M.carbon);
      fin.position.set(i * W * 0.1, clr + 0.07, st(0).z + 0.2);
      fin.rotation.x = 0.22;
      dif.add(fin);
    }
    body.add(dif);
    for (const sx of [-1, 1]) {
      const sk = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, (zF - zR) - archR * 2.1), spec.race ? M.carbon : M.trim);
      sk.position.set(sx * (rocker.hw - 0.02), clr + 0.03, 0);
      body.add(sk);
    }
  }

  // ---- exhausts
  const exN = spec.body === 'muscle' || spec.body === 'gt' || spec.body === 'sports' ? 4 : spec.body === 'wedge' ? 2 : spec.body === 'hatch' ? 1 : 2;
  const rear = st(0.0);
  for (let i = 0; i < exN; i++) {
    const side = exN === 1 ? 1 : (i < exN / 2 ? -1 : 1);
    const k = exN === 4 ? (i % 2) : 0;
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 16, 1, true), M.exhaust);
    ex.rotation.x = Math.PI / 2;
    const xx = side * (W * (spec.body === 'wedge' ? 0.08 : 0.28) + k * 0.11);
    ex.position.set(xx, clr + 0.08, rear.z + 0.02);
    body.add(ex);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.04, 12), M.exhaustInner);
    inner.position.set(xx, clr + 0.08, rear.z - 0.05);
    inner.rotation.y = Math.PI;
    body.add(inner);
  }

  // ---- mirrors
  if (spec.body !== 'proto') {
    for (const sx of [-1, 1]) {
      const mu = cu1 - 0.02;
      const p = cabinPoint(mu, sx > 0 ? 1 : 0, [0, 0, 0]);
      const mirror = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), paint);
      mirror.scale.set(1.1, 0.6, 0.55);
      mirror.position.set((Math.abs(p[0]) + 0.13) * (p[0] >= 0 ? 1 : -1), p[1] + 0.06, p[2]);
      mirror.castShadow = detail >= 1;
      body.add(mirror);
      const glassM = new THREE.Mesh(new THREE.CircleGeometry(0.07, 12), M.chrome);
      glassM.scale.set(1.1, 0.55, 1);
      glassM.position.copy(mirror.position).add(new THREE.Vector3(0, 0, -0.05));
      glassM.rotation.y = Math.PI;
      body.add(glassM);
    }
  }

  // ---- hood scoop / vents / pickup bed / fin / side intakes
  if (P.hoodScoop || spec.body === 'muscle') {
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(W * 0.28, 0.07, 0.5), paint);
    const p = hullPoint(uF - 0.02, 0.5, [0, 0, 0]);
    scoop.position.set(0, p[1] + 0.02, p[2]);
    body.add(scoop);
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.24, 0.05), M.under);
    hole.position.set(0, p[1] + 0.025, p[2] + 0.252);
    body.add(hole);
  }
  if (spec.body === 'wedge' || spec.body === 'gt' || spec.race) {
    // hood vents
    for (const [a, b] of [[0.42, 0.47], [0.53, 0.58]]) {
      addMesh(surfaceGeometry(hullPoint, linspace(uF + 0.02, uF + 0.07, 4), linspace(a, b, 4), { center: hullCenter, offset: 0.003, uvMode: 'local' }), M.grille, body, false);
    }
  }
  if (P.sideIntake) {
    for (const [a, b] of [[0.2, 0.3], [0.7, 0.8]]) {
      addMesh(surfaceGeometry(hullPoint, linspace(uR + 0.07, uR + 0.17, 6), linspace(a, b, 6), { center: hullCenter, offset: 0.003, uvMode: 'local' }), M.grille, body, false);
    }
  }
  if (P.bed) {
    addMesh(surfaceGeometry(hullPoint, linspace(P.bed[0], P.bed[1], 10), linspace(0.4, 0.6, 8), { center: hullCenter, offset: 0.003, uvMode: 'local' }), M.trim, body, false);
  }
  if (P.fin) {
    const p0 = hullPoint(0.04, 0.5, [0, 0, 0]);
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0); finShape.lineTo(L * 0.38, 0); finShape.lineTo(0.05, 0.32); finShape.lineTo(0, 0.32);
    const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: 0.012, bevelEnabled: false }), paint);
    fin.rotation.y = -Math.PI / 2;
    fin.position.set(0.006, p0[1] - 0.02, p0[2]);
    body.add(fin);
  }

  // ---- rear wing
  const wingType = spec.wing;
  if (wingType > 0) {
    const pDeck = hullPoint(0.06, 0.5, [0, 0, 0]);
    const wingW = W * (wingType >= 3 ? 0.92 : 0.8);
    if (wingType === 1) {
      // lip spoiler
      const lip = new THREE.Mesh(new THREE.BoxGeometry(wingW, 0.035, 0.12), paint);
      lip.position.set(0, pDeck[1] + 0.02, pDeck[2] - 0.06);
      lip.rotation.x = -0.3;
      body.add(lip);
    } else {
      const hgt = wingType === 2 ? 0.16 : wingType === 3 ? 0.3 : 0.42;
      const chord = wingType === 2 ? 0.22 : wingType === 3 ? 0.3 : 0.38;
      const wingMat = wingType >= 3 ? M.carbon : paint;
      const foil = new THREE.Mesh(airfoilGeo(chord, wingW, 0.045), wingMat);
      foil.position.set(0, pDeck[1] + hgt, pDeck[2] - 0.02);
      foil.rotation.x = 0.12;
      foil.castShadow = true;
      body.add(foil);
      for (const sx of [-1, 1]) {
        const up = new THREE.Mesh(new THREE.BoxGeometry(0.025, hgt, 0.12), wingType >= 3 ? M.carbon : M.trim);
        up.position.set(sx * wingW * 0.3, pDeck[1] + hgt / 2, pDeck[2] + 0.02);
        body.add(up);
        const ep = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.16, chord * 1.2), wingType >= 3 ? M.carbon : paint);
        ep.position.set(sx * wingW / 2, pDeck[1] + hgt + 0.02, pDeck[2] - 0.02);
        body.add(ep);
      }
    }
  }

  // ---- rally / extras
  if (spec.roofScoop) {
    const p = cabinPoint((cr0 + cr1) / 2, 0.5, [0, 0, 0]);
    const rs = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.35), paint);
    rs.position.set(0, p[1] + 0.03, p[2]);
    body.add(rs);
  }

  // ---- chrome bumpers for classics
  if (P.chrome) {
    for (const u of [0.003, 0.997]) {
      const s = st(u);
      const bump = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, W * 0.9, 4, 10), M.chrome);
      bump.rotation.z = Math.PI / 2;
      bump.position.set(0, s.yc - s.hh * 0.45, s.z + (u > 0.5 ? 0.03 : -0.03));
      body.add(bump);
    }
  }

  // ---- wheels
  const wheels = [];
  const wF = buildWheelGeoms(wr, spec.twF, spec, detail);
  const wRr = buildWheelGeoms(wr, spec.twR, spec, detail);
  const rimMat = new THREE.MeshStandardMaterial({ color: spec.rim, metalness: 0.92, roughness: 0.22 });
  const caliperMat = new THREE.MeshStandardMaterial({ color: spec.caliper, metalness: 0.3, roughness: 0.4 });
  const sideMat = new THREE.MeshStandardMaterial({ map: TX.sidewallTexture(spec.race ? '#ffd400' : '#6a6a6a'), roughness: 0.85, transparent: false });
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.88, metalness: 0 });
  const trackHalfF = W / 2 - spec.twF / 2 - 0.02 + spec.flare * 0.6;
  const trackHalfR = W / 2 - spec.twR / 2 - 0.02 + spec.flare * 0.6;
  for (const [zA, isFront] of [[zF - zMid, true], [zR - zMid, false]]) {
    for (const side of [1, -1]) {
      const g = isFront ? wF : wRr;
      const pivot = new THREE.Group();
      pivot.position.set(side * (isFront ? trackHalfF : trackHalfR), wr, zA);
      const mirror = new THREE.Group();
      mirror.scale.x = side; // outer face toward the outside
      pivot.add(mirror);
      const spin = new THREE.Group();
      mirror.add(spin);
      const tyre = new THREE.Mesh(g.tyre, tyreMat); tyre.castShadow = detail >= 1; spin.add(tyre);
      if (detail >= 1) spin.add(new THREE.Mesh(g.side, sideMat));
      spin.add(new THREE.Mesh(g.face, rimMat));
      spin.add(new THREE.Mesh(g.barrel, rimMat));
      spin.add(new THREE.Mesh(g.cap, rimMat));
      if (detail >= 1) {
        spin.add(new THREE.Mesh(g.disc, M.disc));
        mirror.add(new THREE.Mesh(g.caliper, caliperMat));
      }
      root.add(pivot);
      wheels.push({ pivot, spin, isFront, side, radius: wr });
    }
  }
  root.traverse((o) => { if (o.isMesh) { o.receiveShadow = detail >= 1; } });

  const brakeLightIntensity = night ? 1.6 : 0.45;
  return new Car3D(root, body, wheels, {
    headMat, tailMat, paint, brakeLightIntensity, night,
    dims: { L, W, H, wheelbase: wbase, trackF: trackHalfF * 2, trackR: trackHalfR * 2, wheelR: wr, front: front.z, rear: rear.z, frontZ: zF - zMid, rearZ: zR - zMid },
    disposables: [liveryMap, bumpMap, paint, accentMat, headMat, tailMat, rimMat, caliperMat, sideMat, tyreMat],
  });
}

function roundedRectGeo(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ShapeGeometry(s, 4);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - x) / w * (w / 0.25), (p.getY(i) - y) / h * (h / 0.25));
  return g;
}

// Wing airfoil extruded across the car (X axis)
function airfoilGeo(chord, span, thick) {
  const s = new THREE.Shape();
  const N = 16;
  for (let i = 0; i <= N; i++) {
    const x = i / N;
    const yt = 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1015 * x ** 4) / 0.1;
    const camber = 0.06 * Math.sin(Math.PI * x);
    const px = (0.5 - x) * chord, py = (camber + yt * 0.1) * chord;
    if (i === 0) s.moveTo(px, py); else s.lineTo(px, py);
  }
  for (let i = N; i >= 0; i--) {
    const x = i / N;
    const yt = 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1015 * x ** 4) / 0.1;
    const camber = 0.06 * Math.sin(Math.PI * x);
    s.lineTo((0.5 - x) * chord, (camber - yt * 0.1) * chord);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: span, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -span / 2);
  g.rotateY(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Open-wheel formula car
// ---------------------------------------------------------------------------
function buildFormula(spec, { detail = 2, night = false }) {
  const M = sharedMats();
  const L = 5.5, W = 1.98;
  const wr = 0.36;
  const zF = 1.8, zR = -1.8; // wheelbase 3.6
  const dims = { L, perim: 1.8, doorU: 0.5, doorLines: [], hoodLine: 0, hoodU: 0.72, trunkLine: 0 };
  const { map: liveryMap, bumpMap: unusedBump } = paintLivery({ ...spec, race: true, livery: 'formula' }, dims, detail >= 2 ? 1 : 0.5);
  unusedBump.dispose(); unusedBump.image.width = 0; unusedBump.image.height = 0;
  const paint = paintMaterial({ ...spec, finish: spec.finish === 'matte' ? 'matte' : 'gloss' }, liveryMap, null);
  const accent = new THREE.MeshPhysicalMaterial({ color: spec.accent, roughness: 0.3, metalness: 0.2, clearcoat: 1 });
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const add = (g, m, p = body) => { const me = new THREE.Mesh(g, m); me.castShadow = detail >= 1; me.receiveShadow = detail >= 1; p.add(me); return me; };

  // monocoque / nose / engine cover (u: rear 0 -> nose 1), z from -2.45 to +3.0
  const z0 = -2.35, z1 = 3.05;
  const top = new Curve1D([[0, 0.5], [0.06, 0.56], [0.25, 0.72], [0.38, 0.98], [0.44, 1.0], [0.5, 0.8], [0.6, 0.74], [0.72, 0.62], [0.86, 0.45], [1, 0.26]]);
  const bot = new Curve1D([[0, 0.14], [0.6, 0.1], [0.8, 0.16], [1, 0.16]]);
  const hwC = new Curve1D([[0, 0.12], [0.1, 0.17], [0.3, 0.22], [0.42, 0.24], [0.55, 0.3], [0.65, 0.26], [0.8, 0.15], [0.95, 0.1], [1, 0.06]]);
  const mono = (u, t, out) => {
    const z = z0 + u * (z1 - z0);
    const tp = top.eval(u), bt = bot.eval(u), hw = hwC.eval(u);
    let k = 1;
    if (u > 0.97) k = 0.4 + 0.6 * Math.sqrt(Math.max(0, 1 - ((u - 0.97) / 0.03) ** 2));
    const yc = (tp + bt) / 2, hh = (tp - bt) / 2 * k;
    const th = t * TAU - Math.PI / 2, c = Math.cos(th), s = Math.sin(th);
    const ex = s >= 0 ? 2 / 2.6 : 2 / 5;
    let x = hw * k * spow(c, ex);
    const yN = spow(s, ex);
    if (yN > 0) x *= 1 - 0.25 * yN * yN;
    out[0] = x; out[1] = yc + hh * yN; out[2] = z;
    return out;
  };
  const monoC = (u) => [0, (top.eval(u) + bot.eval(u)) / 2, z0 + u * (z1 - z0)];
  const nA = detail >= 2 ? 90 : 50, nT = detail >= 2 ? 48 : 28;
  add(surfaceGeometry(mono, linspace(0, 1, nA), linspace(0, 1, nT + 1), { center: monoC }), paint);
  // cockpit opening (dark) and airbox intake
  add(surfaceGeometry(mono, linspace(0.47, 0.6, 10), linspace(0.42, 0.58, 8), { center: monoC, offset: 0.004, uvMode: 'local' }), M.under);
  add(surfaceGeometry(mono, linspace(0.43, 0.455, 4), linspace(0.44, 0.56, 6), { center: monoC, offset: 0.004, uvMode: 'local' }), M.under);
  // nose cap colour
  add(surfaceGeometry(mono, linspace(0.93, 1, 6), linspace(0, 1, nT + 1), { center: monoC, offset: 0.002, uvMode: 'local' }), accent);

  // sidepods
  for (const sx of [-1, 1]) {
    const pz0 = -1.1, pz1 = 0.75;
    const ptop = new Curve1D([[0, 0.32], [0.4, 0.5], [0.8, 0.62], [1, 0.58]]);
    const phw = new Curve1D([[0, 0.12], [0.5, 0.2], [0.85, 0.24], [1, 0.22]]);
    const pod = (u, t, out) => {
      const z = pz0 + u * (pz1 - pz0);
      const tp = ptop.eval(u), bt = 0.12, hw = phw.eval(u);
      let k = 1;
      if (u > 0.94) k = 0.55 + 0.45 * Math.sqrt(Math.max(0, 1 - ((u - 0.94) / 0.06) ** 2));
      const yc = (tp + bt) / 2, hh = (tp - bt) / 2 * k;
      const th = t * TAU - Math.PI / 2, c = Math.cos(th), s = Math.sin(th);
      const ex = 2 / 3.2;
      out[0] = sx * (0.34 + hw * 0.5) + hw * k * spow(c, ex); out[1] = yc + hh * spow(s, ex); out[2] = z;
      return out;
    };
    const podC = (u) => [sx * (0.34 + phw.eval(u) * 0.5), (ptop.eval(u) + 0.12) / 2, pz0 + u * (pz1 - pz0)];
    add(surfaceGeometry(pod, linspace(0, 1, detail >= 2 ? 40 : 20), linspace(0, 1, detail >= 2 ? 33 : 21), { center: podC }), paint);
    // intake mouth
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16), M.under);
    mouth.scale.set(0.8, 1.1, 1);
    mouth.position.set(sx * (0.34 + 0.11), 0.38, pz1 + 0.005);
    body.add(mouth);
  }
  // floor
  const floor = add(new THREE.BoxGeometry(1.5, 0.03, 3.1), M.under);
  floor.position.set(0, 0.07, -0.25);
  // front wing
  const fw = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const el = add(airfoilGeo(0.28 - i * 0.05, W * 0.94, 0.06), i === 0 ? M.carbon : accent, fw);
    el.position.set(0, 0.09 + i * 0.055, 2.75 - i * 0.12);
    el.rotation.x = -0.1 - i * 0.18;
  }
  for (const sx of [-1, 1]) {
    const ep = add(new THREE.BoxGeometry(0.015, 0.26, 0.5), M.carbon, fw);
    ep.position.set(sx * W * 0.47, 0.16, 2.65);
  }
  body.add(fw);
  // rear wing
  const rw = new THREE.Group();
  const main = add(airfoilGeo(0.34, 1.0, 0.07), M.carbon, rw);
  main.position.set(0, 0.86, -2.3); main.rotation.x = 0.15;
  const flap = add(airfoilGeo(0.2, 1.0, 0.06), accent, rw);
  flap.position.set(0, 0.99, -2.42); flap.rotation.x = 0.55;
  for (const sx of [-1, 1]) {
    const ep = add(new THREE.BoxGeometry(0.02, 0.55, 0.62), paint, rw);
    ep.position.set(sx * 0.51, 0.82, -2.33);
  }
  const beam = add(airfoilGeo(0.18, 0.9, 0.08), M.carbon, rw);
  beam.position.set(0, 0.42, -2.25);
  const pylon = add(new THREE.BoxGeometry(0.03, 0.5, 0.2), M.carbon, rw);
  pylon.position.set(0, 0.62, -2.15);
  body.add(rw);
  // engine fin
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0); finShape.lineTo(1.6, 0); finShape.lineTo(0.2, 0.22); finShape.lineTo(0, 0.22);
  const fin = add(new THREE.ExtrudeGeometry(finShape, { depth: 0.01, bevelEnabled: false }), paint);
  fin.rotation.y = -Math.PI / 2; fin.position.set(0.005, 0.68, -2.2);
  // halo
  const haloCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.26, 0.74, -0.15), new THREE.Vector3(0.25, 0.9, 0.2), new THREE.Vector3(0.12, 0.95, 0.45),
    new THREE.Vector3(0, 0.955, 0.5), new THREE.Vector3(-0.12, 0.95, 0.45), new THREE.Vector3(-0.25, 0.9, 0.2), new THREE.Vector3(-0.26, 0.74, -0.15),
  ]);
  add(new THREE.TubeGeometry(haloCurve, 40, 0.028, 10, false), M.trim);
  add(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(0, 0.95, 0.5), new THREE.Vector3(0, 0.74, 0.75)), 4, 0.025, 8, false), M.trim);
  // driver helmet
  const helmetMat = new THREE.MeshPhysicalMaterial({ color: spec.accent, clearcoat: 1, roughness: 0.25, metalness: 0.2 });
  const helmet = add(new THREE.SphereGeometry(0.135, 24, 16), helmetMat);
  helmet.position.set(0, 0.86, 0.02);
  helmet.scale.set(1, 1, 1.12);
  const visor = add(new THREE.SphereGeometry(0.137, 24, 8, -0.9, 1.8, 1.2, 0.5), M.visor);
  visor.position.copy(helmet.position); visor.scale.copy(helmet.scale);
  visor.rotation.y = Math.PI / 2;
  // mirrors
  for (const sx of [-1, 1]) {
    const mm = add(new THREE.BoxGeometry(0.12, 0.05, 0.03), paint);
    mm.position.set(sx * 0.42, 0.74, 0.55);
  }

  // wheels + suspension
  const wheels = [];
  const tw = { F: 0.31, R: 0.38 };
  const half = { F: W / 2 - tw.F / 2, R: W / 2 - tw.R / 2 };
  const gF = buildWheelGeoms(wr, tw.F, { ...spec, body: 'formula', rimStyle: 0 }, detail);
  const gR = buildWheelGeoms(wr, tw.R, { ...spec, body: 'formula', rimStyle: 0 }, detail);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.8, roughness: 0.3 });
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85 });
  const sideMat = new THREE.MeshStandardMaterial({ map: TX.sidewallTexture(['#ff2a2a', '#ffd400', '#f2f2f2'][spec.seed % 3]), roughness: 0.85 });
  const armMat = M.carbon;
  for (const [zA, isFront] of [[zF, true], [zR, false]]) {
    for (const side of [1, -1]) {
      const g = isFront ? gF : gR;
      const hx = isFront ? half.F : half.R;
      const pivot = new THREE.Group();
      pivot.position.set(side * hx, wr, zA);
      const mirror = new THREE.Group(); mirror.scale.x = side; pivot.add(mirror);
      const spin = new THREE.Group(); mirror.add(spin);
      const ty = new THREE.Mesh(g.tyre, tyreMat); ty.castShadow = detail >= 1; spin.add(ty);
      if (detail >= 1) spin.add(new THREE.Mesh(g.side, sideMat));
      spin.add(new THREE.Mesh(g.face, rimMat));
      spin.add(new THREE.Mesh(g.barrel, rimMat));
      root.add(pivot);
      wheels.push({ pivot, spin, isFront, side, radius: wr });
      // wishbones
      for (const [dy, dz] of [[0.12, 0.18], [-0.08, 0.15]]) {
        for (const s2 of [-1, 1]) {
          const a = new THREE.Vector3(side * 0.22, wr + dy * 0.6, zA + s2 * dz);
          const b = new THREE.Vector3(side * (hx - 0.1), wr + dy, zA);
          const len = a.distanceTo(b);
          const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 6), armMat);
          arm.position.copy(a).add(b).multiplyScalar(0.5);
          arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
          root.add(arm);
        }
      }
    }
  }
  const headMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff1010, emissiveIntensity: night ? 1.5 : 0.4 });
  const rl = add(new THREE.BoxGeometry(0.08, 0.06, 0.02), tailMat);
  rl.position.set(0, 0.36, -2.42);
  return new Car3D(root, body, wheels, {
    headMat, tailMat, paint, brakeLightIntensity: night ? 1.5 : 0.4, night,
    dims: { L, W, H: 0.95, wheelbase: zF - zR, trackF: half.F * 2, trackR: half.R * 2, wheelR: wr, front: 3.05, rear: -2.45, frontZ: zF, rearZ: zR },
    disposables: [liveryMap, paint, accent, helmetMat, rimMat, tyreMat, sideMat, headMat, tailMat],
  });
}

// ---------------------------------------------------------------------------
// Runtime wrapper: wheel spin/steer, body roll/pitch, lights
// ---------------------------------------------------------------------------
function blobMaterial() {
  if (!blobMaterial.m) {
    blobMaterial.m = new THREE.MeshBasicMaterial({ map: TX.blobShadowTexture(), color: 0x000000, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  }
  return blobMaterial.m;
}

export class Car3D {
  constructor(root, body, wheels, o) {
    this.root = root;
    this.body = body;
    this.wheels = wheels;
    this.headMat = o.headMat;
    this.tailMat = o.tailMat;
    this.paint = o.paint;
    this.brakeBase = o.brakeLightIntensity;
    this.dims = o.dims;
    this.disposables = o.disposables || [];
    this.wheelAngle = 0;
    this.braking = false;
    // soft contact shadow (ambient occlusion under the car)
    const d = this.dims;
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(d.W + 0.6, (d.front - d.rear) + 0.7), blobMaterial());
    blob.rotation.x = -Math.PI / 2;
    blob.position.set(0, 0.02, (d.front + d.rear) / 2);
    blob.renderOrder = 2;
    root.add(blob);
    this.blob = blob;
  }
  update(dt, { steer = 0, speed = 0, roll = 0, pitch = 0, braking = false, suspension = null }) {
    const r = this.dims.wheelR;
    this.wheelAngle += (speed / r) * dt;
    for (const w of this.wheels) {
      w.spin.rotation.x = this.wheelAngle;
      if (w.isFront) w.pivot.rotation.y = steer;
    }
    this.body.rotation.z = roll;
    this.body.rotation.x = pitch;
    if (braking !== this.braking) {
      this.braking = braking;
      this.tailMat.emissiveIntensity = braking ? 6 : this.brakeBase;
    }
  }
  setHeadlights(on) { this.headMat.emissiveIntensity = on ? 4 : 0.6; }
  // After liteSwap(): follow the swapped materials so brake lights / headlights still change
  useLite(cache) {
    this.tailMat = cache.get(this.tailMat) || this.tailMat;
    this.headMat = cache.get(this.headMat) || this.headMat;
    this.paint = cache.get(this.paint) || this.paint;
    this.blob.visible = true;
  }
  dispose() {
    this.root.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    this.root.removeFromParent();
    for (const d of this.disposables) {
      if (!d || !d.dispose) continue;
      d.dispose();
      // free the livery canvas right away (iPhone Safari limits total canvas memory)
      if (d.isTexture && d.userData.ownCanvas && d.image && 'width' in d.image) { d.image.width = 0; d.image.height = 0; }
    }
  }
}
