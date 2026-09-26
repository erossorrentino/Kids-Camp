// Procedural hole builder. A HoleModel answers every question the physics,
// the renderer, the AI and the UI ask about the ground: height, slope,
// surface type, hazards, trees, the pin. It is plain JS (no three.js), so it
// runs in Node for testing too.
//
// Coordinates: meters. The tee is at the origin, play heads roughly toward
// -z, +x is to the golfer's right looking down the hole, y is up.
import { RNG, Noise2D, clamp, lerp, smoothstep, mixSeed } from '../util/rng.js';
import { STYLES } from '../data/courses.js';

export const YD = 0.9144;

// ---------- geometry helpers ----------
function rot(x, z, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c - z * s, x * s + z * c];
}
function fwd(h) { return { x: Math.sin(h), z: -Math.cos(h) }; }

// Blob SDF: an ellipse whose radius wobbles with angle. Negative inside.
function blobSDF(b, x, z) {
  const dx = x - b.x, dz = z - b.z;
  // local frame: v along b.rot heading, u to the right
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  const u = dx * c + dz * s;
  const v = dx * s - dz * c;
  const nu = u / b.rx, nv = v / b.rz;
  const r = Math.hypot(nu, nv);
  const ang = Math.atan2(nv, nu);
  const edge = 1 + b.w1 * Math.sin(3 * ang + b.p1) + b.w2 * Math.sin(5 * ang + b.p2);
  return (r - edge) * Math.min(b.rx, b.rz);
}

function makeBlob(rng, x, z, rx, rz, rotA, wobble = 0.1) {
  return { x, z, rx, rz, rot: rotA, w1: rng.float(0, wobble), w2: rng.float(0, wobble * 0.6), p1: rng.float(0, 6.28), p2: rng.float(0, 6.28) };
}

function segSDF(points, x, z, halfW) {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const vx = b.x - a.x, vz = b.z - a.z;
    const l2 = vx * vx + vz * vz || 1e-9;
    let t = ((x - a.x) * vx + (z - a.z) * vz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - (a.x + vx * t), z - (a.z + vz * t));
    if (d < best) best = d;
  }
  return best - halfW;
}

export class HoleModel {
  constructor(course, holeIndex, opts = {}) {
    this.course = course;
    this.index = holeIndex;
    this.info = course.holes[holeIndex];
    this.par = this.info.par;
    this.yards = this.info.yards;
    this.styleName = course.style;
    this.style = STYLES[course.style];
    this.seed = mixSeed(course.seed, this.info.seed, 'hole');
    this.noise = new Noise2D(mixSeed(this.info.seed, 'terrain'));
    this.noise2 = new Noise2D(mixSeed(this.info.seed, 'detail'));
    const rng = new RNG(this.seed);
    this.rng = rng;
    this.buildRouting(rng);
    this.buildProjectionGrid();
    this.buildFeatures(rng);
    this.finalizeWater();
    this.buildTrees(new RNG(mixSeed(this.seed, 'trees')));
    this.setPin(opts.pinDay || 0);
  }

  // ---------------- routing / centerline ----------------
  buildRouting(rng) {
    const L = this.yards * YD;
    const par = this.par;
    const pts = [{ x: 0, z: 0 }];
    let h = rng.float(-0.1, 0.1);
    const add = (dist) => {
      const last = pts[pts.length - 1];
      const f = fwd(h);
      pts.push({ x: last.x + f.x * dist, z: last.z + f.z * dist });
    };
    this.doglegs = [];
    if (par === 3) {
      add(L);
    } else if (par === 4) {
      const s1 = clamp(rng.float(232, 262), L * 0.52, L - 105);
      add(s1);
      const dog = rng.chance(0.62) ? rng.sign() * rng.float(0.16, 0.48) : rng.float(-0.07, 0.07);
      h += dog;
      this.doglegs.push({ s: s1, angle: dog });
      add(L - s1);
    } else {
      const s1 = rng.float(245, 268);
      const s2 = clamp(rng.float(185, 225), 150, L - s1 - 70);
      add(s1);
      const d1 = rng.chance(0.55) ? rng.sign() * rng.float(0.12, 0.38) : rng.float(-0.06, 0.06);
      h += d1;
      add(s2);
      const d2 = rng.chance(0.6) ? rng.sign() * rng.float(0.12, 0.4) : rng.float(-0.06, 0.06);
      h += d2;
      this.doglegs.push({ s: s1, angle: d1 }, { s: s1 + s2, angle: d2 });
      add(L - s1 - s2);
    }
    // Densify every 2 m then smooth with a moving average for rounded doglegs
    const dense = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(1, Math.round(d / 2));
      for (let k = 0; k < n; k++) dense.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
    }
    dense.push(pts[pts.length - 1]);
    const W = 18;
    let sm = dense;
    for (let pass = 0; pass < 2; pass++) {
      const out = [];
      for (let i = 0; i < sm.length; i++) {
        const w = Math.min(W, i, sm.length - 1 - i);
        let sx = 0, sz = 0;
        for (let k = -w; k <= w; k++) { sx += sm[i + k].x; sz += sm[i + k].z; }
        out.push({ x: sx / (2 * w + 1), z: sz / (2 * w + 1) });
      }
      sm = out;
    }
    let s = 0;
    this.path = sm.map((p, i) => {
      if (i > 0) s += Math.hypot(p.x - sm[i - 1].x, p.z - sm[i - 1].z);
      return { x: p.x, z: p.z, s };
    });
    this.length = s;
    this.greenCenter = { x: sm[sm.length - 1].x, z: sm[sm.length - 1].z };
    const pe = sm[sm.length - 1], pb = sm[Math.max(0, sm.length - 12)];
    this.finalHeading = Math.atan2(pe.x - pb.x, -(pe.z - pb.z));
    this.teeHeading = Math.atan2(sm[6].x - sm[0].x, -(sm[6].z - sm[0].z));
    this.pts = pts;

    // Bounds of the playable area
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of this.path) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const m = 105;
    this.bounds = { minX: minX - m, maxX: maxX + m, minZ: minZ - m, maxZ: maxZ + 45 };
    this.gdir = { x: (this.greenCenter.x) / Math.hypot(this.greenCenter.x, this.greenCenter.z), z: (this.greenCenter.z) / Math.hypot(this.greenCenter.x, this.greenCenter.z) };
    this.straightLen = Math.hypot(this.greenCenter.x, this.greenCenter.z);
  }

  buildProjectionGrid() {
    const b = this.bounds;
    const cell = 8;
    const nx = Math.ceil((b.maxX - b.minX) / cell) + 1;
    const nz = Math.ceil((b.maxZ - b.minZ) / cell) + 1;
    const grid = new Int32Array(nx * nz);
    const P = this.path;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = b.minX + i * cell, z = b.minZ + j * cell;
        let best = 0, bd = Infinity;
        for (let k = 0; k < P.length; k += 2) {
          const d = (P[k].x - x) ** 2 + (P[k].z - z) ** 2;
          if (d < bd) { bd = d; best = k; }
        }
        grid[j * nx + i] = best;
      }
    }
    this.pgrid = { grid, nx, nz, cell };
  }

  // Nearest point on the centerline: s (distance along), d (signed lateral, + = right)
  project(x, z, out = {}) {
    const b = this.bounds, g = this.pgrid;
    const i = clamp(Math.round((x - b.minX) / g.cell), 0, g.nx - 1);
    const j = clamp(Math.round((z - b.minZ) / g.cell), 0, g.nz - 1);
    const k0 = g.grid[j * g.nx + i];
    const P = this.path;
    let bestD2 = Infinity, bs = 0, bd = 0;
    const lo = Math.max(0, k0 - 10), hi = Math.min(P.length - 2, k0 + 10);
    for (let k = lo; k <= hi; k++) {
      const a = P[k], c = P[k + 1];
      const vx = c.x - a.x, vz = c.z - a.z;
      const l2 = vx * vx + vz * vz || 1e-9;
      let t = ((x - a.x) * vx + (z - a.z) * vz) / l2;
      const first = k === 0, last = k === P.length - 2;
      if (!first) t = Math.max(0, t);
      if (!last) t = Math.min(1, t);
      const px = a.x + vx * t, pz = a.z + vz * t;
      const d2 = (x - px) ** 2 + (z - pz) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        const l = Math.sqrt(l2);
        bs = a.s + t * l;
        bd = ((x - a.x) * -vz + (z - a.z) * vx) / l;
      }
    }
    out.s = bs;
    out.d = bd;
    return out;
  }

  pointAtS(s) {
    const P = this.path;
    s = clamp(s, 0, this.length);
    let lo = 0, hi = P.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (P[mid].s < s) lo = mid; else hi = mid;
    }
    const a = P[lo], b = P[hi];
    const t = (s - a.s) / ((b.s - a.s) || 1);
    return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), heading: Math.atan2(b.x - a.x, -(b.z - a.z)) };
  }

  // ---------------- features ----------------
  buildFeatures(rng) {
    const st = this.style;
    const course = this.course;
    const diff = course.difficulty; // 0..4
    const L = this.length;
    const par = this.par;

    // Elevation change tee -> green and terrain character
    this.elevDelta = rng.gauss(0, st.terrain.elev * 0.35);
    if (rng.chance(0.3)) this.elevDelta = -Math.abs(this.elevDelta) - 2; // elevated tees are common
    this.macroAmp = st.terrain.amp;
    this.macroFreq = st.terrain.freq;
    this.microAmp = this.styleName === 'Links' ? 0.75 : this.styleName === 'Desert' ? 0.8 : 0.5;
    this.microFreq = this.styleName === 'Links' ? 3 : 5;
    this.fairwayMicro = this.styleName === 'Links' ? 0.5 : 0.15;
    this.corridorRise = rng.float(1, 4) * (this.styleName === 'Links' ? 0.4 : 1);

    // Fairway
    const [fw0, fw1] = st.fairwayWidth;
    this.fwHalf = rng.float(fw0, fw1) - diff * 0.6;
    this.fwWob = rng.float(0.1, 0.22);
    if (par === 3) {
      this.fwStart = L - 38;
      this.fwEnd = L - 6;
      this.fwHalf = 8;
    } else {
      this.fwStart = this.yards < 390 ? rng.float(95, 130) : rng.float(140, 185);
      this.fwEnd = L - 8;
    }
    this.roughW = rng.float(16, 26);

    // Tee box
    this.tee = { x: 0, z: 0, heading: this.teeHeading, halfW: 5, back: 14, front: 3 };

    // Green
    const gc = this.greenCenter;
    const grx = rng.float(10.5, 15) - diff * 0.4;
    const grz = rng.float(12.5, 18) - diff * 0.4 + (par === 5 ? 1.5 : 0) - (par === 3 ? 1 : 0);
    this.green = makeBlob(rng, gc.x, gc.z, grx, grz, this.finalHeading + rng.float(-0.35, 0.35), 0.09);
    // Green contours: overall tilt toward the front, plus an optional tier
    const tiltDir = this.finalHeading + Math.PI + rng.float(-1.0, 1.0); // downhill direction (toward approach)
    const tiltPct = rng.float(0.008, 0.018) + diff * 0.0015;
    this.greenTilt = { x: Math.sin(tiltDir) * tiltPct, z: -Math.cos(tiltDir) * tiltPct };
    this.greenTier = rng.chance(0.4)
      ? { dir: this.finalHeading + rng.float(-0.5, 0.5), off: rng.float(-3, 3), h: rng.float(0.18, 0.3) * rng.sign(), w: 11 }
      : null;
    this.greenRaise = rng.float(0.2, 0.8);

    // Bunkers
    this.bunkers = [];
    const [b0, b1] = st.bunkers;
    const nGreen = par === 3 ? rng.int(2, 4) : rng.int(Math.max(1, b0 - 2), Math.min(4, b1 - 1));
    const gAngles = [];
    for (let i = 0; i < nGreen; i++) {
      let ang;
      for (let t = 0; t < 20; t++) {
        ang = this.finalHeading + Math.PI + rng.float(-2.3, 2.3); // around the green, favouring the front/sides
        if (gAngles.every((a) => Math.abs(Math.atan2(Math.sin(a - ang), Math.cos(a - ang))) > 0.75)) break;
      }
      gAngles.push(ang);
      const pot = st.potBunkers && rng.chance(0.6);
      const rx = pot ? rng.float(2, 3) : rng.float(3.2, 5.5);
      const rz = pot ? rx * rng.float(0.9, 1.2) : rng.float(6, 11);
      const f = fwd(ang);
      const gr = Math.max(this.green.rx, this.green.rz);
      const dist = gr * 1.12 + rx + rng.float(2.5, 4.5);
      this.bunkers.push({ ...makeBlob(rng, gc.x + f.x * dist, gc.z + f.z * dist, rx, rz, ang + Math.PI / 2, 0.15), depth: pot ? 1.2 : 0.75, kind: pot ? 'pot' : 'green' });
    }
    if (par > 3) {
      const nFw = rng.int(b0 > 3 ? 1 : 0, Math.max(1, b1 - nGreen));
      for (let i = 0; i < nFw; i++) {
        const s = rng.float(235, 285) + (par === 5 && rng.chance(0.4) ? rng.float(150, 210) : 0);
        if (s > L - 60) continue;
        const pt = this.pointAtS(s);
        const side = rng.sign();
        const pot = st.potBunkers && rng.chance(0.7);
        const rx = pot ? rng.float(2, 3.2) : rng.float(4, 7.5);
        const rz = pot ? rx : rng.float(9, 18);
        const lat = pot ? rng.float(-this.fwHalf, this.fwHalf) : side * (this.fwHalf + rng.float(-2, 5));
        const r = { x: Math.cos(pt.heading), z: Math.sin(pt.heading) };
        this.bunkers.push({ ...makeBlob(rng, pt.x + r.x * lat, pt.z + r.z * lat, rx, rz, pt.heading + rng.float(-0.3, 0.3), 0.14), depth: pot ? 1.1 : 0.5, kind: pot ? 'pot' : 'fairway' });
      }
      // Links: scatter extra pot bunkers across the landing areas
      if (st.potBunkers) {
        const extra = rng.int(2, 5);
        for (let i = 0; i < extra; i++) {
          const s = rng.float(180, L - 40);
          const pt = this.pointAtS(s);
          const lat = rng.float(-this.fwHalf - 8, this.fwHalf + 8);
          const r = { x: Math.cos(pt.heading), z: Math.sin(pt.heading) };
          const rx = rng.float(1.8, 2.8);
          this.bunkers.push({ ...makeBlob(rng, pt.x + r.x * lat, pt.z + r.z * lat, rx, rx * rng.float(0.9, 1.25), rng.float(0, 6), 0.12), depth: 1.1, kind: 'pot' });
        }
      }
    }
    // Keep bunkers off the green
    this.bunkers = this.bunkers.filter((b) => blobSDF(this.green, b.x, b.z) > Math.max(b.rx, b.rz) * 0.6 + 1.2 || b.kind !== 'fairway');

    // Water
    this.waters = [];
    const waterChance = st.water * (0.8 + diff * 0.15);
    if (rng.chance(waterChance)) {
      const kind = rng.weighted(['greenside', 'lateral', 'creek'], (k) => (k === 'greenside' ? (par === 3 ? 4 : 2) : k === 'lateral' ? (par === 3 ? 0.3 : 2) : par === 3 ? 0.4 : 1.2));
      if (kind === 'greenside') {
        const ang = this.finalHeading + Math.PI + rng.float(-1.3, 1.3);
        const f = fwd(ang);
        const r = rng.float(10, 22);
        const gr = Math.max(this.green.rx, this.green.rz);
        const dist = gr + r * 0.8 + rng.float(3, 7);
        this.waters.push({ type: 'pond', ...makeBlob(rng, gc.x + f.x * dist, gc.z + f.z * dist, r * rng.float(1, 1.6), r, ang + Math.PI / 2, 0.12) });
      } else if (kind === 'lateral') {
        const s = rng.float(150, Math.max(160, L - 90));
        const pt = this.pointAtS(s);
        const side = rng.sign();
        const r = rng.float(12, 24);
        const lat = side * (this.fwHalf + r * 0.7 + rng.float(3, 12));
        const rr = { x: Math.cos(pt.heading), z: Math.sin(pt.heading) };
        this.waters.push({ type: 'pond', ...makeBlob(rng, pt.x + rr.x * lat, pt.z + rr.z * lat, r, r * rng.float(1.5, 2.6), pt.heading, 0.12) });
      } else {
        const s = par === 5 ? rng.float(300, Math.max(310, L - 150)) : Math.max(this.fwStart - 20, L - rng.float(60, 95));
        const pt = this.pointAtS(s);
        const pts = [];
        const across = pt.heading + Math.PI / 2 + rng.float(-0.3, 0.3);
        const fx = Math.sin(across), fz = -Math.cos(across);
        for (let k = -6; k <= 6; k++) {
          const t = k * 22;
          const wig = rng.float(-6, 6);
          pts.push({ x: pt.x + fx * t + Math.sin(pt.heading) * wig, z: pt.z + fz * t - Math.cos(pt.heading) * wig });
        }
        this.waters.push({ type: 'creek', points: pts, half: rng.float(3, 5) });
      }
    }
    // Keep water clear of the green and tee
    for (const w of this.waters) {
      for (let iter = 0; iter < 12; iter++) {
        let minG = Infinity;
        if (w.type === 'creek') {
          for (let i = 0; i < w.points.length - 1; i++) {
            for (let t = 0; t <= 1; t += 0.25) {
              const px = lerp(w.points[i].x, w.points[i + 1].x, t), pz = lerp(w.points[i].z, w.points[i + 1].z, t);
              minG = Math.min(minG, blobSDF(this.green, px, pz) - w.half, Math.hypot(px, pz) - 30);
            }
          }
        } else {
          for (let a = 0; a < 24; a++) {
            const ang = (a / 24) * Math.PI * 2;
            const r = Math.max(w.rx, w.rz) * 1.15;
            const px = w.x + Math.cos(ang) * r, pz = w.z + Math.sin(ang) * r;
            minG = Math.min(minG, blobSDF(this.green, px, pz), Math.hypot(px, pz) - 25);
          }
        }
        if (minG > 6) break;
        const push = 6 - minG + 1;
        if (w.type === 'creek') {
          // slide the creek back toward the tee along the approach
          const f = fwd(this.finalHeading);
          for (const p of w.points) { p.x -= f.x * push; p.z -= f.z * push; }
        } else {
          const dx = w.x - gc.x, dz = w.z - gc.z;
          const dl = Math.hypot(dx, dz) || 1;
          w.x += (dx / dl) * push; w.z += (dz / dl) * push;
        }
      }
    }

    // Bunkers never sit in or right beside water
    this.bunkers = this.bunkers.filter((b) => this.waters.every((w) => {
      const d = w.type === 'creek' ? segSDF(w.points, b.x, b.z, w.half) : blobSDF(w, b.x, b.z);
      return d > Math.max(b.rx, b.rz) + 3;
    }));

    // Ocean along one side on seaside courses
    this.ocean = null;
    const oceanP = { Coastal: 0.45, Links: 0.25, Tropical: 0.3 }[this.styleName] || 0;
    if (rng.chance(oceanP)) {
      this.ocean = {
        side: rng.sign(),
        offset: this.fwHalf + this.roughW + rng.float(4, 22),
        cliff: this.styleName === 'Coastal',
        level: 0,
      };
    }
    // Cart path: runs through the rough on the outside of the first dogleg
    if (par > 3 || rng.chance(0.6)) {
      const dl = this.doglegs.find((d) => Math.abs(d.angle) > 0.12);
      const side = dl ? -Math.sign(dl.angle) : rng.sign();
      const gR = Math.max(this.green.rx, this.green.rz);
      this.cartPath = { side, lat: this.fwHalf + this.roughW * rng.float(0.38, 0.55), half: 1.15, s0: 4, s1: L - gR - 14 };
      if (this.ocean && this.ocean.side === side) this.cartPath.side = -side;
    } else this.cartPath = null;

    // Out of bounds on some holes
    this.ob = { left: rng.chance(0.3 + diff * 0.05), right: rng.chance(0.3 + diff * 0.05), dist: this.fwHalf + this.roughW + rng.float(18, 30) };
    if (this.ocean) {
      if (this.ocean.side > 0) this.ob.right = false; else this.ob.left = false;
    }
  }

  // Field values: signed distances to every feature. Negative = inside.
  fields(x, z, pr = this.project(x, z, {})) {
    const s = pr.s, d = pr.d;
    const ad = Math.abs(d);
    const L = this.length;
    // Fairway
    const hw = this.fairwayHalfWidth(s, d);
    // Rounded leading edge where the fairway begins
    const capR = hw * 0.9;
    const t0 = (this.fwStart + capR - s) / capR;
    let dF;
    if (t0 >= 1) dF = Math.max(ad, this.fwStart - s) + 0.01;
    else dF = ad - (t0 > 0 ? hw * Math.sqrt(1 - t0 * t0) : hw);
    dF = Math.max(dF, s - this.fwEnd);
    // Rough corridor
    const rw = hw + this.roughW + 7 * this.noise2.get(s / 70, d > 0 ? 5 : -5);
    let dR = Math.max(ad - rw, -20 - s, s - (L + 32));
    const dG = blobSDF(this.green, x, z);
    dR = Math.min(dR, dG - 22);
    // Tee box (rounded rectangle in the tee's frame)
    const tc = Math.cos(this.tee.heading), ts = Math.sin(this.tee.heading);
    const tu = (x - this.tee.x) * tc + (z - this.tee.z) * ts;
    const tv = (x - this.tee.x) * ts - (z - this.tee.z) * tc; // + toward target
    const qx = Math.abs(tu) - this.tee.halfW;
    const qv = Math.max(-this.tee.back - tv, tv - this.tee.front);
    const dT = Math.hypot(Math.max(qx, 0), Math.max(qv, 0)) + Math.min(Math.max(qx, qv), 0) - 0.5;
    dR = Math.min(dR, dT - 6);
    let dB = Infinity, bunker = null;
    for (const b of this.bunkers) {
      const v = blobSDF(b, x, z);
      if (v < dB) { dB = v; bunker = b; }
    }
    let dW = Infinity, water = null;
    for (const w of this.waters) {
      const v = w.type === 'creek' ? segSDF(w.points, x, z, w.half) : blobSDF(w, x, z);
      if (v < dW) { dW = v; water = w; }
    }
    let dO = Infinity;
    if (this.ocean) dO = this.ocean.offset - d * this.ocean.side;
    let dC = Infinity;
    const cp = this.cartPath;
    if (cp) dC = Math.max(Math.abs(d - cp.side * cp.lat) - cp.half, cp.s0 - s, s - cp.s1);
    return { s, d, dF, dR, dG, dT, dB, bunker, dW, water, dO, dC };
  }

  fairwayHalfWidth(s, d) {
    const n = this.noise2.get(s / 55, d > 0 ? 1.7 : -1.7);
    let hw = this.fwHalf * (1 + this.fwWob * n);
    // narrow as the fairway approaches the green (the apron)
    const toEnd = this.fwEnd - s;
    if (toEnd < 30) hw = lerp(Math.min(hw, 9), hw, smoothstep(0, 30, toEnd));
    return hw;
  }

  // Terrain before water/ocean carving
  baseHeight(x, z, f) {
    const tt = clamp((x * this.gdir.x + z * this.gdir.z) / this.straightLen, -0.3, 1.3);
    let h = this.elevDelta * smoothstep(0, 1, tt);
    const nf = this.macroFreq;
    h += this.macroAmp * this.noise.fbm(x * nf, z * nf, 2, 2, 0.4);
    const outside = smoothstep(1, 14, Math.min(f.dF, f.dG - 3));
    const mf = nf * this.microFreq;
    h += this.microAmp * this.noise2.fbm(x * mf + 31.7, z * mf - 17.3, 3) * lerp(this.fairwayMicro, 1, outside);
    h += this.corridorRise * smoothstep(12, 60, f.dR + 10);
    // Green complex: soften relief around the green so it can be approached
    if (this.greenBaseY !== undefined && f.dG < 45) {
      const base = this.greenBaseY - this.greenRaise;
      h = base + (h - base) * lerp(0.12, 1, smoothstep(0, 45, f.dG));
    }
    return h;
  }

  greenSurface(x, z) {
    const g = this.green;
    let h = this.greenBaseY + (x - g.x) * this.greenTilt.x + (z - g.z) * this.greenTilt.z;
    if (this.greenTier) {
      const t = this.greenTier;
      const u = (x - g.x) * Math.sin(t.dir) - (z - g.z) * Math.cos(t.dir) - t.off;
      h += t.h * smoothstep(-t.w / 2, t.w / 2, u);
    }
    h += 0.07 * this.noise2.get(x * 0.06 + 11, z * 0.06 - 5);
    return h;
  }

  heightFromFields(x, z, f) {
    let h = this.baseHeight(x, z, f);
    // Tee: flat, slightly raised
    const tm = 1 - smoothstep(0, 5, f.dT);
    if (tm > 0) h = lerp(h, this.teeY, tm);
    // Keep a clear launch corridor in front of the tee (no walls to hit)
    if (f.s > -6 && f.s < 75 && Math.abs(f.d) < 32) {
      const cap = this.teeY - 0.15 + Math.max(0, f.s - 3) * 0.1;
      const w = (1 - smoothstep(16, 32, Math.abs(f.d))) * (1 - smoothstep(55, 75, f.s));
      if (h > cap) h = lerp(h, cap, w);
    }
    // Green: shaped surface blended into the surrounds
    const gm = 1 - smoothstep(0, 5, f.dG);
    if (gm > 0) h = lerp(h, this.greenSurface(x, z), gm);
    // Bunkers: carved bowls, pot bunkers deep with a raised lip
    if (f.dB < 1.5 && f.bunker) {
      const b = f.bunker;
      const wide = b.kind === 'pot' ? 0.6 : 1.4;
      const keepGreen = smoothstep(0.2, 2.2, f.dG);
      let dh = -b.depth * (1 - smoothstep(-wide, 0.25, f.dB));
      if (b.kind !== 'fairway') dh += 0.22 * Math.exp(-((f.dB - 0.55) ** 2) / 0.12);
      h += dh * keepGreen;
    }
    // Water banks (outside the green)
    if (f.water && f.dW < 6) {
      const level = f.water.level;
      const gOut = smoothstep(1, 5, f.dG);
      const bank = f.dW < 0 ? level - 0.35 - Math.min(1.6, -f.dW * 0.35) : level + 0.3 + f.dW * 0.28;
      if (bank < h) h = lerp(h, bank, gOut);
    }
    if (this.ocean && f.dO < 30) {
      const o = this.ocean;
      const gOut = smoothstep(0, 3, f.dG);
      // Cliffs rise ~3 m per meter from the shoreline; beaches shelve gently
      const bank = o.cliff
        ? (f.dO < 0 ? o.level - 2 - Math.min(6, -f.dO * 0.3) : o.level + 0.5 + f.dO * 3)
        : (f.dO < 0 ? o.level - 0.4 - Math.min(3, -f.dO * 0.08) : o.level + 0.35 + f.dO * 0.12);
      if (bank < h) h = lerp(h, bank, gOut);
    }
    return h;
  }

  finalizeWater() {
    // Tee and green reference heights come from the base terrain
    const f0 = this.fields(0, 0);
    this.teeY = this.baseHeight(0, 0, f0) + 0.45;
    const g = this.green;
    const fg = this.fields(g.x, g.z);
    this.greenBaseY = this.baseHeight(g.x, g.z, fg) + this.greenRaise;
    // Water level: a little below the lowest ground around each water body
    for (const w of this.waters) {
      let lo = Infinity;
      const pts = [];
      if (w.type === 'creek') {
        for (const p of w.points) pts.push(p);
      } else {
        for (let a = 0; a < 16; a++) {
          const ang = (a / 16) * Math.PI * 2;
          pts.push({ x: w.x + Math.cos(ang) * w.rx * 1.1, z: w.z + Math.sin(ang) * w.rz * 1.1 });
        }
      }
      for (const p of pts) lo = Math.min(lo, this.baseHeight(p.x, p.z, this.fields(p.x, p.z)));
      w.level = lo - 0.6;
      // Never let water sit above the green surface
      w.level = Math.min(w.level, this.greenBaseY - 1.2);
    }
    if (this.ocean) {
      let lo = Infinity;
      for (let s = 0; s <= this.length; s += 20) {
        const p = this.pointAtS(s);
        const r = { x: Math.cos(p.heading), z: Math.sin(p.heading) };
        const off = this.ocean.offset * this.ocean.side;
        const q = { x: p.x + r.x * off, z: p.z + r.z * off };
        lo = Math.min(lo, this.baseHeight(q.x, q.z, this.fields(q.x, q.z)));
      }
      this.ocean.level = this.ocean.cliff ? lo - 9 : lo - 1.2;
    }
  }

  // ---------------- queries used by physics / renderer ----------------
  heightAt(x, z) {
    return this.heightFromFields(x, z, this.fields(x, z));
  }

  normalAt(x, z) {
    const e = 0.3;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    const nx = -hx / (2 * e), nz = -hz / (2 * e);
    const l = Math.hypot(nx, 1, nz);
    return { x: nx / l, y: 1 / l, z: nz / l };
  }

  surfaceFromFields(f) {
    if (f.dG < 0) return 'green';
    if (f.dG < 1.4) return 'fringe';
    if (f.dB < 0) return 'bunker';
    if (f.dT < 0) return 'tee';
    if (f.dC < 0 && f.dW > 0.5) return 'path';
    if (f.dF < 0) return 'fairway';
    if (f.dF < 2.2) return 'first';
    if (this.ocean && !this.ocean.cliff && f.dO < 9) return 'waste'; // beach
    if (f.dR < 0) return 'rough';
    if (this.style.waste) return 'waste';
    if (this.style.fescue) return 'fescue';
    if (this.style.heather) return 'heather';
    return 'deep';
  }

  surfaceAt(x, z) {
    return this.surfaceFromFields(this.fields(x, z));
  }

  waterAt(x, z) {
    const f = this.fields(x, z);
    if (f.dW < 0 && f.water) return { level: f.water.level, body: f.water };
    if (this.ocean && f.dO < 0) return { level: this.ocean.level, body: this.ocean };
    return null;
  }

  isOB(x, z) {
    if (!this.inBounds(x, z)) return true;
    const pr = this.project(x, z, {});
    if (this.ob.left && pr.d < -this.ob.dist) return true;
    if (this.ob.right && pr.d > this.ob.dist) return true;
    return false;
  }

  inBounds(x, z) {
    const b = this.bounds;
    return x > b.minX + 2 && x < b.maxX - 2 && z > b.minZ + 2 && z < b.maxZ - 2;
  }

  // ---------------- trees ----------------
  buildTrees(rng) {
    const st = this.style;
    const dens = st.trees.density;
    const kinds = st.trees.kinds;
    const trees = [];
    const tryPlace = (x, z, kind) => {
      if (!this.inBounds(x, z)) return;
      const f = this.fields(x, z);
      if (f.dF < 5 || f.dG < 10 || f.dB < 3 || f.dT < 8 || f.dW < 3 || f.dO < 4 || f.dC < 2.5) return;
      if (f.s < -10 && Math.abs(f.d) < 15) return;
      for (const t of trees) if ((t.x - x) ** 2 + (t.z - z) ** 2 < 16) return;
      trees.push(this.makeTree(rng, x, z, kind));
    };
    const L = this.length;
    const step = 11 / Math.max(0.05, dens);
    for (let s = -30; s < L + 40; s += step * rng.float(0.6, 1.4)) {
      const pt = this.pointAtS(s);
      const r = { x: Math.cos(pt.heading), z: Math.sin(pt.heading) };
      for (const side of [-1, 1]) {
        if (this.ocean && side === this.ocean.side) continue;
        const rows = dens > 1 ? 3 : dens > 0.5 ? 2 : 1;
        for (let row = 0; row < rows; row++) {
          const lat = side * (this.fwHalf + this.roughW * rng.float(0.55, 1.1) + row * rng.float(8, 14) + rng.float(0, 6));
          const ps = s + rng.float(-4, 4);
          const q = this.pointAtS(ps);
          tryPlace(q.x + r.x * lat, q.z + r.z * lat, rng.pick(kinds));
        }
      }
    }
    // A few specimen trees that guard corners and the green
    const specimens = Math.round(rng.float(1, 4) * Math.min(1.2, dens + 0.3));
    for (let i = 0; i < specimens; i++) {
      const s = rng.float(180, L - 30);
      const pt = this.pointAtS(s);
      const r = { x: Math.cos(pt.heading), z: Math.sin(pt.heading) };
      const lat = rng.sign() * (this.fwHalf + rng.float(7, 16));
      tryPlace(pt.x + r.x * lat, pt.z + r.z * lat, rng.pick(kinds));
    }
    // Background woodland beyond the corridor (visual + physics)
    const extra = Math.round(160 * dens);
    const b = this.bounds;
    for (let i = 0; i < extra; i++) {
      const x = rng.float(b.minX, b.maxX), z = rng.float(b.minZ, b.maxZ);
      const f = this.fields(x, z);
      if (f.dR > 4) tryPlace(x, z, rng.pick(kinds));
    }
    this.trees = trees;
    // Spatial hash for fast queries
    const cell = 12;
    const map = new Map();
    for (const t of trees) {
      const reach = Math.max(t.canopyR, t.trunkR) + 1;
      const i0 = Math.floor((t.x - reach) / cell), i1 = Math.floor((t.x + reach) / cell);
      const j0 = Math.floor((t.z - reach) / cell), j1 = Math.floor((t.z + reach) / cell);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const k = i * 100003 + j;
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(t);
      }
    }
    this.treeMap = map;
    this.treeCell = cell;
  }

  makeTree(rng, x, z, kind) {
    const y = this.heightAt(x, z);
    const sc = rng.float(0.8, 1.25);
    switch (kind) {
      case 'pine': return { x, z, y, kind, trunkR: 0.25 * sc, trunkH: 4 * sc, canopyY: y + 10 * sc, canopyH: 7.5 * sc, canopyR: 3.6 * sc, shape: 'cone', density: 1.2, sc };
      case 'oak': return { x, z, y, kind, trunkR: 0.4 * sc, trunkH: 3.2 * sc, canopyY: y + 8 * sc, canopyH: 4.5 * sc, canopyR: 5.5 * sc, shape: 'ellipse', density: 1.0, sc };
      case 'birch': return { x, z, y, kind, trunkR: 0.16 * sc, trunkH: 4 * sc, canopyY: y + 8 * sc, canopyH: 4 * sc, canopyR: 2.6 * sc, shape: 'ellipse', density: 0.7, sc };
      case 'palm': return { x, z, y, kind, trunkR: 0.2 * sc, trunkH: 9 * sc, canopyY: y + 9.5 * sc, canopyH: 1.3 * sc, canopyR: 3.6 * sc, shape: 'ellipse', density: 0.55, sc, lean: rng.float(-0.25, 0.25), leanDir: rng.float(0, 6.28) };
      case 'cypress': return { x, z, y, kind, trunkR: 0.35 * sc, trunkH: 2.5 * sc, canopyY: y + 7 * sc, canopyH: 5 * sc, canopyR: 4.5 * sc, shape: 'ellipse', density: 1.1, sc };
      case 'cactus': return { x, z, y, kind, trunkR: 0.3 * sc, trunkH: 5 * sc, canopyY: y - 50, canopyH: 0.01, canopyR: 0, shape: 'none', density: 0, sc, arms: rng.int(0, 3) };
      default: return { x, z, y, kind: 'bush', trunkR: 0.1, trunkH: 0.4, canopyY: y + 1.1 * sc, canopyH: 1.1 * sc, canopyR: 1.8 * sc, shape: 'ellipse', density: 1.5, sc };
    }
  }

  treesNear(x, z) {
    const k = Math.floor(x / this.treeCell) * 100003 + Math.floor(z / this.treeCell);
    return this.treeMap.get(k) || EMPTY;
  }

  // ---------------- pin ----------------
  setPin(day = 0) {
    const rng = new RNG(mixSeed(this.seed, 'pin', day));
    const g = this.green;
    let best = null;
    for (let i = 0; i < 90; i++) {
      const ang = rng.float(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * 0.85;
      const [u, v] = rot(r * g.rx * Math.cos(ang), r * g.rz * Math.sin(ang), 0);
      const c = Math.cos(g.rot), s = Math.sin(g.rot);
      const x = g.x + u * c + v * s;
      const z = g.z + u * s - v * c;
      const dg = blobSDF(g, x, z);
      if (dg > -3.2) continue;
      const n = this.normalAt(x, z);
      const slope = Math.hypot(n.x, n.z) / n.y;
      if (slope > 0.03) continue;
      // Sunday pins tuck closer to edges and hazards
      const edge = -dg;
      let hazard = Infinity;
      for (const b of this.bunkers) hazard = Math.min(hazard, blobSDF(b, x, z));
      const tough = day * 0.15 * (6 - Math.min(6, edge)) + (hazard < 12 ? day * 0.2 : 0);
      const score = -slope * 30 + tough + rng.float(0, 1.2) - (day === 0 ? Math.max(0, 5 - edge) * 0.3 : 0);
      if (!best || score > best.score) best = { x, z, score };
    }
    if (!best) best = { x: g.x, z: g.z };
    this.pin = { x: best.x, z: best.z, y: this.heightAt(best.x, best.z) };
    this.cup = this.pin;
  }

  // ---------------- helpers for gameplay / UI ----------------
  teeSpot() {
    const f = fwd(this.tee.heading);
    return { x: f.x * 1.2, z: f.z * 1.2, y: this.heightAt(f.x * 1.2, f.z * 1.2) };
  }

  distToPin(x, z) {
    return Math.hypot(this.pin.x - x, this.pin.z - z);
  }

  // Aim point for a shot of `carry` meters from (x,z): along the centerline toward the pin
  suggestAim(x, z, carry) {
    const dp = this.distToPin(x, z);
    if (dp <= carry * 1.08) return { x: this.pin.x, z: this.pin.z };
    const pr = this.project(x, z, {});
    // walk along the path until the straight-line distance matches the carry
    let s = pr.s;
    let pt = this.pointAtS(s);
    for (let k = 0; k < 400 && s < this.length; k++) {
      s += 2;
      pt = this.pointAtS(s);
      if (Math.hypot(pt.x - x, pt.z - z) >= carry) break;
    }
    return { x: pt.x, z: pt.z };
  }

  describe() {
    const hz = [];
    if (this.waters.length) hz.push(this.waters[0].type === 'creek' ? 'creek' : 'water');
    if (this.ocean) hz.push('ocean');
    const nb = this.bunkers.length;
    if (nb) hz.push(`${nb} bunker${nb > 1 ? 's' : ''}`);
    if (this.ob.left || this.ob.right) hz.push(`OB ${this.ob.left && this.ob.right ? 'both sides' : this.ob.left ? 'left' : 'right'}`);
    const dl = this.doglegs.find((d) => Math.abs(d.angle) > 0.12);
    const shape = dl ? `Dogleg ${dl.angle > 0 ? 'right' : 'left'}` : 'Straight';
    const elev = this.greenBaseY - this.teeY;
    return {
      shape,
      hazards: hz,
      elevation: elev,
      elevText: Math.abs(elev) < 1.5 ? 'Flat' : elev > 0 ? `Uphill ${Math.round(elev / YD)} yds` : `Downhill ${Math.round(-elev / YD)} yds`,
    };
  }
}

const EMPTY = [];
