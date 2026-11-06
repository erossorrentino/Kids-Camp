// Seeded RNG + 2D simplex noise and fractal helpers used by world generation.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRAD = new Float32Array([
  1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 1, 0, -1, 0, 0, 1, 0, -1, 0, 1, 0, -1,
]);
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

export class Simplex2 {
  constructor(seed = 1) {
    const r = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    this.perm = new Uint8Array(512);
    this.pm12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.pm12[i] = this.perm[i] % 12;
    }
  }
  noise(xin, yin) {
    const perm = this.perm, pm = this.pm12;
    let n0 = 0, n1 = 0, n2 = 0;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const g = pm[ii + perm[jj]] * 2;
      t0 *= t0;
      n0 = t0 * t0 * (GRAD[g] * x0 + GRAD[g + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const g = pm[ii + i1 + perm[jj + j1]] * 2;
      t1 *= t1;
      n1 = t1 * t1 * (GRAD[g] * x1 + GRAD[g + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const g = pm[ii + 1 + perm[jj + 1]] * 2;
      t2 *= t2;
      n2 = t2 * t2 * (GRAD[g] * x2 + GRAD[g + 1] * y2);
    }
    return 70 * (n0 + n1 + n2);
  }
  fbm(x, y, oct = 5, lac = 2.0, gain = 0.5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let o = 0; o < oct; o++) {
      s += a * this.noise(x * f, y * f);
      n += a;
      a *= gain;
      f *= lac;
    }
    return s / n;
  }
  // Ridged multifractal in [0,1]
  ridged(x, y, oct = 5, lac = 2.0, gain = 0.5) {
    let a = 0.5, f = 1, s = 0, w = 1, n = 0;
    for (let o = 0; o < oct; o++) {
      let v = 1 - Math.abs(this.noise(x * f, y * f));
      v *= v;
      v *= w;
      w = Math.min(1, Math.max(0, v * 2));
      s += v * a;
      n += a;
      a *= gain;
      f *= lac;
    }
    return s / n;
  }
}

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const fract = (x) => x - Math.floor(x);
export function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
