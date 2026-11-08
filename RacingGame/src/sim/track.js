// Track geometry + queries (no rendering here; usable from Node for tests).
//
// A layout is a list of "turtle" commands: ['S', metres] for a straight,
// ['L'|'R', degrees, radius] for a constant-radius corner. The builder
// closes the loop exactly (least-squares adjustment of straight lengths),
// smooths curvature so corners have natural transition spirals, adds
// elevation and banking, then derives per-sample barrier distances that
// never overlap other parts of the circuit, curbs, run-off types, and a
// minimum-curvature racing line used by the AI.

export const DS = 2; // metres between samples

function wrap(i, n) { return ((i % n) + n) % n; }
const smooth01 = (t) => t * t * (3 - 2 * t);
const sstep = (a, b, x) => smooth01(Math.min(1, Math.max(0, (x - a) / (b - a))));

function integrate(cmds, ds) {
  // returns kappa samples (per ds) and the straight bookkeeping for closure
  const kappa = [];
  const straights = [];
  let theta = 0, x = 0, z = 0;
  for (let c = 0; c < cmds.length; c++) {
    const cmd = cmds[c];
    if (cmd[0] === 'S') {
      const n = Math.max(1, Math.round(cmd[1] / ds));
      straights.push({ c, theta, len: cmd[1] });
      for (let i = 0; i < n; i++) { kappa.push(0); x += Math.sin(theta) * ds; z += Math.cos(theta) * ds; }
    } else {
      const dir = cmd[0] === 'L' ? 1 : -1;
      const ang = (cmd[1] * Math.PI) / 180, r = cmd[2];
      const len = ang * r;
      const n = Math.max(1, Math.round(len / ds));
      const k = (dir * ang) / (n * ds);
      for (let i = 0; i < n; i++) {
        const th = theta + k * ds * 0.5;
        x += Math.sin(th) * ds; z += Math.cos(th) * ds;
        theta += k * ds;
        kappa.push(k);
      }
    }
  }
  return { kappa, straights, end: [x, z], theta };
}

export function closeLayout(layout) {
  // normalise total turning to exactly +-360 deg
  let total = 0;
  for (const c of layout) if (c[0] !== 'S') total += (c[0] === 'L' ? 1 : -1) * c[1];
  const scale = 360 / Math.abs(total);
  let cmds = layout.map((c) => (c[0] === 'S' ? [...c] : [c[0], c[1] * scale, c[2]]));
  // least-squares straight adjustment so the end meets the start
  for (let iter = 0; iter < 3; iter++) {
    const { straights, end } = integrate(cmds, 0.5);
    const E = end;
    let m00 = 0, m01 = 0, m11 = 0;
    for (const s of straights) {
      const w = s.len, dx = Math.sin(s.theta), dz = Math.cos(s.theta);
      m00 += w * dx * dx; m01 += w * dx * dz; m11 += w * dz * dz;
    }
    const det = m00 * m11 - m01 * m01;
    if (Math.abs(det) < 1e-9) break;
    const l0 = (-E[0] * m11 + E[1] * m01) / det;
    const l1 = (E[0] * m01 - E[1] * m00) / det;
    for (const s of straights) {
      const dx = Math.sin(s.theta), dz = Math.cos(s.theta);
      const delta = s.len * (dx * l0 + dz * l1);
      cmds[s.c][1] = Math.max(10, s.len + delta);
    }
  }
  return { cmds, turnScale: scale };
}

function periodicCatmull(points, f) {
  // points: [[frac, value], ...] sorted, periodic on [0,1)
  const n = points.length;
  if (n === 0) return 0;
  if (n === 1) return points[0][1];
  f = f - Math.floor(f);
  let i = n - 1;
  for (let k = 0; k < n; k++) if (points[k][0] <= f) i = k;
  const p1 = points[i], p2 = points[(i + 1) % n];
  const p0 = points[(i - 1 + n) % n], p3 = points[(i + 2) % n];
  let x1 = p1[0], x2 = p2[0];
  if (x2 <= x1) x2 += 1;
  let ff = f; if (ff < x1) ff += 1;
  const t = (ff - x1) / (x2 - x1);
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
}

export class Track {
  constructor(def) {
    this.def = def;
    this.type = def.type || 'circuit'; // circuit | street | oval
    const sc = def.scale || 1;
    const scaled = def.layout.map((c) => (c[0] === 'S' ? ['S', c[1] * sc] : [c[0], c[1], c[2] * sc]));
    const { cmds } = closeLayout(scaled);
    this.cmds = cmds;
    // dense curvature at 1 m, smoothed cyclically
    const fine = integrate(cmds, 1);
    let k = Float64Array.from(fine.kappa);
    const nF = k.length;
    const win = def.smooth ?? 14;
    for (let pass = 0; pass < 2; pass++) {
      const out = new Float64Array(nF);
      let acc = 0;
      for (let i = -win; i <= win; i++) acc += k[wrap(i, nF)];
      for (let i = 0; i < nF; i++) {
        out[i] = acc / (2 * win + 1);
        acc += k[wrap(i + win + 1, nF)] - k[wrap(i - win, nF)];
      }
      k = out;
    }
    // integrate to positions
    let th = def.startHeading ?? 0, x = 0, z = 0;
    const fx = new Float64Array(nF), fz = new Float64Array(nF), fth = new Float64Array(nF);
    for (let i = 0; i < nF; i++) {
      fx[i] = x; fz[i] = z; fth[i] = th;
      const tm = th + k[i] * 0.5;
      x += Math.sin(tm); z += Math.cos(tm);
      th += k[i];
    }
    // distribute residual closure error
    const ex = x, ez = z;
    for (let i = 0; i < nF; i++) { fx[i] -= (ex * i) / nF; fz[i] -= (ez * i) / nF; }
    this.closureError = Math.hypot(ex, ez);

    // resample every DS metres
    const N = Math.floor(nF / DS);
    this.N = N;
    this.length = N * DS;
    const A = (T = Float32Array) => new T(N);
    this.x = A(); this.z = A(); this.y = A(); this.heading = A(); this.kappa = A();
    this.tx = A(); this.tz = A(); this.lx = A(); this.lz = A();
    this.bank = A(); this.hw = A();
    const cx = def.offset?.[0] ?? 0, cz = def.offset?.[1] ?? 0;
    for (let i = 0; i < N; i++) {
      const j = i * DS;
      this.x[i] = fx[j] + cx; this.z[i] = fz[j] + cz;
      let kk = 0;
      for (let q = 0; q < DS; q++) kk += k[(j + q) % nF];
      this.kappa[i] = kk / DS;
    }
    for (let i = 0; i < N; i++) {
      const a = wrap(i - 1, N), b = wrap(i + 1, N);
      const dx = this.x[b] - this.x[a], dz = this.z[b] - this.z[a];
      const h = Math.atan2(dx, dz);
      this.heading[i] = h;
      this.tx[i] = Math.sin(h); this.tz[i] = Math.cos(h);
      this.lx[i] = Math.cos(h); this.lz[i] = -Math.sin(h);
    }
    // elevation
    const elev = (def.elevation || [[0, 0]]).slice().sort((p, q) => p[0] - q[0]);
    for (let i = 0; i < N; i++) this.y[i] = periodicCatmull(elev, i / N) + (def.baseY || 0);
    // width + banking
    const baseW = def.width || 13;
    for (let i = 0; i < N; i++) {
      let w = baseW;
      if (def.widthVar) w += def.widthVar * Math.sin((i / N) * Math.PI * 2 * 3 + 1.3);
      this.hw[i] = w / 2;
      const kap = this.kappa[i];
      let b;
      if (this.type === 'oval') {
        const maxB = (def.maxBank ?? 24) * Math.PI / 180;
        b = -Math.sign(kap) * maxB * sstep(0.0008, 0.004, Math.abs(kap));
      } else {
        b = Math.max(-0.08, Math.min(0.08, -kap * (def.bankK ?? 4)));
      }
      this.bank[i] = b;
    }
    // smooth bank
    this.bank = this._smoothArr(this.bank, 10);

    this._buildHash();
    this._computeClearance();
    this._computeEdges();
    this._computeRacingLine();
  }

  _smoothArr(arr, win) {
    const N = this.N, out = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = -win; k <= win; k++) s += arr[wrap(i + k, N)];
      out[i] = s / (2 * win + 1);
    }
    return out;
  }

  _buildHash() {
    this.cell = 25;
    this.hash = new Map();
    let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity, miny = Infinity, maxy = -Infinity, sumy = 0;
    for (let i = 0; i < this.N; i++) {
      const key = this._key(this.x[i], this.z[i]);
      let l = this.hash.get(key);
      if (!l) { l = []; this.hash.set(key, l); }
      l.push(i);
      minx = Math.min(minx, this.x[i]); maxx = Math.max(maxx, this.x[i]);
      minz = Math.min(minz, this.z[i]); maxz = Math.max(maxz, this.z[i]);
      miny = Math.min(miny, this.y[i]); maxy = Math.max(maxy, this.y[i]);
      sumy += this.y[i];
    }
    this.bounds = { minx, maxx, minz, maxz, miny, maxy, cx: (minx + maxx) / 2, cz: (minz + maxz) / 2, avgY: sumy / this.N };
  }
  _key(x, z) { return Math.floor(x / this.cell) * 73856093 ^ Math.floor(z / this.cell) * 19349663; }

  // indices of samples within radius r of (x,z)
  near(x, z, r, cb) {
    const c = this.cell, R = Math.ceil(r / c);
    const ix = Math.floor(x / c), iz = Math.floor(z / c);
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
      const l = this.hash.get((ix + a) * 73856093 ^ (iz + b) * 19349663);
      if (l) for (const i of l) cb(i);
    }
  }

  nearestGlobal(x, z) {
    let best = -1, bd = Infinity;
    for (const r of [60, 200, 800]) {
      this.near(x, z, r, (i) => {
        const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2;
        if (d < bd) { bd = d; best = i; }
      });
      if (best >= 0) break;
    }
    if (best < 0) {
      for (let i = 0; i < this.N; i++) {
        const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    }
    return best;
  }

  _computeClearance() {
    const N = this.N;
    this.clearL = new Float32Array(N).fill(400);
    this.clearR = new Float32Array(N).fill(400);
    const localWin = Math.ceil(160 / DS);
    for (let i = 0; i < N; i++) {
      const xi = this.x[i], zi = this.z[i];
      this.near(xi, zi, 140, (j) => {
        let dij = Math.abs(i - j); dij = Math.min(dij, N - dij);
        if (dij < localWin) return;
        const vx = this.x[j] - xi, vz = this.z[j] - zi;
        const dist = Math.hypot(vx, vz);
        const lat = vx * this.lx[i] + vz * this.lz[i];
        const lon = vx * this.tx[i] + vz * this.tz[i];
        if (Math.abs(lon) > dist * 0.85 && dist > 30) return; // mostly ahead/behind: not a side constraint
        if (lat > 0) this.clearL[i] = Math.min(this.clearL[i], dist);
        else this.clearR[i] = Math.min(this.clearR[i], dist);
      });
    }
  }

  _computeEdges() {
    const N = this.N, def = this.def, type = this.type;
    const theme = def.runoff || { inside: 'grass', outside: 'gravel', straight: 'grass' };
    const curbL = new Uint8Array(N), curbR = new Uint8Array(N);
    let bL = new Float32Array(N), bR = new Float32Array(N);
    this.runL = new Array(N); this.runR = new Array(N);
    const curbThresh = 1 / 260;
    const ext = Math.ceil(16 / DS);
    for (let i = 0; i < N; i++) {
      const kap = this.kappa[i];
      if (type !== 'oval' && Math.abs(kap) > curbThresh) {
        for (let k = -ext; k <= ext; k++) { curbL[wrap(i + k, N)] = 1; curbR[wrap(i + k, N)] = 1; }
      }
    }
    for (let i = 0; i < N; i++) {
      const kap = this.kappa[i], hw = this.hw[i];
      const R = Math.abs(kap) > 1e-5 ? 1 / Math.abs(kap) : 1e5;
      const cornering = Math.abs(kap) > 1 / 320;
      const leftIsOutside = kap < 0;
      let runIn, runOut;
      if (type === 'street') { runIn = def.streetRunoff ?? 2.5; runOut = def.streetRunoff ?? 2.5; if (cornering) runOut += 5; }
      else if (type === 'oval') { runIn = 18; runOut = 2.5; }
      else {
        runIn = def.runoffIn ?? 7;
        runOut = cornering ? (def.runoffOut ?? 10) + Math.min(20, R / 7) : (def.runoffIn ?? 7) + 2;
      }
      const L = leftIsOutside ? runOut : runIn;
      const Rr = leftIsOutside ? runIn : runOut;
      bL[i] = hw + L; bR[i] = hw + Rr;
      // run-off surface types
      const typeOut = cornering ? theme.outside : theme.straight;
      const typeIn = cornering ? theme.inside : theme.straight;
      this.runL[i] = leftIsOutside ? typeOut : typeIn;
      this.runR[i] = leftIsOutside ? typeIn : typeOut;
      if (type === 'oval') { this.runL[i] = leftIsOutside ? 'tarmac' : theme.inside; this.runR[i] = leftIsOutside ? theme.inside : 'tarmac'; }
    }
    // smooth barrier distances (moving max then min to keep it flowing), clamp by clearance
    const smoothMax = (arr, w) => {
      const out = new Float32Array(N);
      for (let i = 0; i < N; i++) { let m = 0; for (let k = -w; k <= w; k++) m = Math.max(m, arr[wrap(i + k, N)]); out[i] = m; }
      return out;
    };
    bL = this._smoothArr(smoothMax(bL, 12), 12);
    bR = this._smoothArr(smoothMax(bR, 12), 12);
    for (let i = 0; i < N; i++) {
      const hw = this.hw[i];
      bL[i] = Math.max(hw + 1.2, Math.min(bL[i], this.clearL[i] / 2 - 1.5));
      bR[i] = Math.max(hw + 1.2, Math.min(bR[i], this.clearR[i] / 2 - 1.5));
    }
    // a second pass of min-smoothing so clearance clamps don't create spikes
    const smoothMin = (arr, w) => {
      const out = new Float32Array(N);
      for (let i = 0; i < N; i++) { let m = 1e9; for (let k = -w; k <= w; k++) m = Math.min(m, arr[wrap(i + k, N)]); out[i] = m; }
      return out;
    };
    this.barrierL = this._smoothArr(smoothMin(bL, 6), 6);
    this.barrierR = this._smoothArr(smoothMin(bR, 6), 6);
    // outer verge width (beyond barrier) limited by clearance too
    this.vergeL = new Float32Array(N); this.vergeR = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      this.vergeL[i] = Math.max(0, Math.min(14, this.clearL[i] / 2 - this.barrierL[i] - 0.3));
      this.vergeR[i] = Math.max(0, Math.min(14, this.clearR[i] / 2 - this.barrierR[i] - 0.3));
    }
    this.vergeL = this._smoothArr(smoothMin(this.vergeL, 5), 5);
    this.vergeR = this._smoothArr(smoothMin(this.vergeR, 5), 5);
    this.curbL = curbL; this.curbR = curbR;
    this.curbW = type === 'street' ? 0.9 : 1.3;
  }

  _computeRacingLine() {
    const N = this.N;
    const d = new Float32Array(N);
    const px = new Float32Array(N), pz = new Float32Array(N);
    const margin = 1.3;
    const lim = (i) => this.hw[i] - margin + (this.curbL[i] ? 0.5 : 0);
    for (let iter = 0; iter < 260; iter++) {
      for (let i = 0; i < N; i++) { px[i] = this.x[i] + this.lx[i] * d[i]; pz[i] = this.z[i] + this.lz[i] * d[i]; }
      const k = iter < 80 ? 12 : iter < 160 ? 6 : 3;
      for (let i = 0; i < N; i++) {
        const a = wrap(i - k, N), b = wrap(i + k, N);
        const mx = (px[a] + px[b]) / 2, mz = (pz[a] + pz[b]) / 2;
        const target = (mx - this.x[i]) * this.lx[i] + (mz - this.z[i]) * this.lz[i];
        const L = lim(i);
        d[i] = Math.max(-L, Math.min(L, d[i] + (target - d[i]) * 0.6));
      }
    }
    this.raceLine = this._smoothArr(d, 2);
    // curvature of the racing line (signed) for speed profiles
    const rk = new Float32Array(N);
    for (let i = 0; i < N; i++) { px[i] = this.x[i] + this.lx[i] * this.raceLine[i]; pz[i] = this.z[i] + this.lz[i] * this.raceLine[i]; }
    for (let i = 0; i < N; i++) {
      const a = wrap(i - 3, N), b = wrap(i + 3, N);
      const h1 = Math.atan2(px[i] - px[a], pz[i] - pz[a]);
      const h2 = Math.atan2(px[b] - px[i], pz[b] - pz[i]);
      let dh = h2 - h1;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      const len = Math.hypot(px[b] - px[i], pz[b] - pz[i]) + Math.hypot(px[i] - px[a], pz[i] - pz[a]);
      rk[i] = dh / (len / 2);
    }
    this.raceKappa = this._smoothArr(rk, 3);
    // path-length ratio: metres of racing line per metre of centreline
    this.raceRatio = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const b = wrap(i + 1, N);
      this.raceRatio[i] = Math.hypot(px[b] - px[i], pz[b] - pz[i]) / DS;
    }
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------
  wrapS(s) { const L = this.length; return ((s % L) + L) % L; }

  // Frame at arc length s (interpolated)
  frameAt(s, out = {}) {
    s = this.wrapS(s);
    const f = s / DS, i = Math.floor(f) % this.N, t = f - Math.floor(f), j = (i + 1) % this.N;
    const L = (a) => a[i] + (a[j] - a[i]) * t;
    out.i = i; out.t = t;
    out.x = L(this.x); out.y = L(this.y); out.z = L(this.z);
    let h0 = this.heading[i], h1 = this.heading[j];
    let dh = h1 - h0; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    out.heading = h0 + dh * t;
    out.tx = Math.sin(out.heading); out.tz = Math.cos(out.heading);
    out.lx = Math.cos(out.heading); out.lz = -Math.sin(out.heading);
    out.kappa = L(this.kappa); out.bank = L(this.bank); out.hw = L(this.hw);
    out.raceLine = L(this.raceLine);
    out.barrierL = L(this.barrierL); out.barrierR = L(this.barrierR);
    return out;
  }

  // Surface height at sample i (+t) and lateral offset d
  heightAt(i, t, d) {
    const j = (i + 1) % this.N;
    const y = this.y[i] + (this.y[j] - this.y[i]) * t;
    const b = this.bank[i] + (this.bank[j] - this.bank[i]) * t;
    const hw = this.hw[i];
    const dc = Math.max(-hw, Math.min(hw, d));
    let h = y + Math.tan(b) * dc;
    const ad = Math.abs(d);
    if (ad > hw) h -= (ad - hw) * 0.025;
    return h;
  }

  // Project world (x,z) onto the centreline. hint = previous sample index.
  project(x, z, hint = -1, out = {}) {
    const N = this.N;
    let i = hint >= 0 ? hint : this.nearestGlobal(x, z);
    const d2 = (k) => (this.x[k] - x) ** 2 + (this.z[k] - z) ** 2;
    let best = d2(i);
    for (const dir of [1, -1]) {
      let k = i, steps = 0;
      while (steps++ < 80) {
        const n = wrap(k + dir, N), dn = d2(n);
        if (dn < best) { best = dn; i = n; k = n; } else break;
      }
    }
    if (best > 100 * 100 && hint >= 0) { i = this.nearestGlobal(x, z); }
    // refine on the segment [i, i+1] or [i-1, i]
    let a = i, b = wrap(i + 1, N);
    let vx = this.x[b] - this.x[a], vz = this.z[b] - this.z[a];
    let t = ((x - this.x[a]) * vx + (z - this.z[a]) * vz) / (vx * vx + vz * vz);
    if (t < 0) {
      a = wrap(i - 1, N); b = i;
      vx = this.x[b] - this.x[a]; vz = this.z[b] - this.z[a];
      t = ((x - this.x[a]) * vx + (z - this.z[a]) * vz) / (vx * vx + vz * vz);
    }
    t = Math.max(0, Math.min(1, t));
    const lx = this.lx[a] + (this.lx[b] - this.lx[a]) * t, lz = this.lz[a] + (this.lz[b] - this.lz[a]) * t;
    const cx = this.x[a] + vx * t, cz = this.z[a] + vz * t;
    out.i = a; out.t = t;
    out.s = (a + t) * DS;
    out.d = (x - cx) * lx + (z - cz) * lz;
    out.y = this.heightAt(a, t, out.d);
    out.hw = this.hw[a];
    out.barrierL = this.barrierL[a] + (this.barrierL[b] - this.barrierL[a]) * t;
    out.barrierR = this.barrierR[a] + (this.barrierR[b] - this.barrierR[a]) * t;
    out.heading = this.heading[a];
    return out;
  }

  // Surface under a lateral offset: 'asphalt' | 'curb' | runoff type
  surfaceAt(i, d) {
    const hw = this.hw[i];
    if (Math.abs(d) <= hw) return 'asphalt';
    const curb = d > 0 ? this.curbL[i] : this.curbR[i];
    if (curb && Math.abs(d) <= hw + this.curbW) return 'curb';
    return d > 0 ? this.runL[i] : this.runR[i];
  }

  // grid slot transform: index 0 = pole; staggered two-wide grid behind the line
  gridSlot(k) {
    const back = 10 + k * 8;
    const s = this.wrapS(-back);
    const f = this.frameAt(s);
    const side = k % 2 === 0 ? 1 : -1;
    const d = side * Math.min(3.2, f.hw - 2.2);
    return { s, d, x: f.x + f.lx * d, z: f.z + f.lz * d, y: this.heightAt(f.i, f.t, d), heading: f.heading };
  }
}
