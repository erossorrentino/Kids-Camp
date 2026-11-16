// Deterministic random numbers + noise. Everything procedural in the game
// (10,000 cars, liveries, scenery placement, textures) is seeded so the
// same car always looks the same and the same track always has the same trees.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function hash2(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class RNG {
  constructor(seed) { this.next = mulberry32(seed >>> 0); }
  float(a = 0, b = 1) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.float(a, b + 1)); } // inclusive
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  // weighted pick: arr of [item, weight]
  weighted(arr) {
    let total = 0;
    for (const [, w] of arr) total += w;
    let r = this.next() * total;
    for (const [item, w] of arr) { r -= w; if (r <= 0) return item; }
    return arr[arr.length - 1][0];
  }
  gauss() {
    const u = 1 - this.next(), v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

// ---------------------------------------------------------------------------
// Periodic gradient noise (tileable when period is set) used for textures,
// and a non-periodic version for terrain.
// ---------------------------------------------------------------------------
export class Noise {
  constructor(seed = 1) {
    const rnd = mulberry32(seed);
    this.perm = new Uint16Array(512);
    this.gx = new Float32Array(256);
    this.gy = new Float32Array(256);
    const p = new Uint16Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    for (let i = 0; i < 256; i++) {
      const a = rnd() * Math.PI * 2;
      this.gx[i] = Math.cos(a);
      this.gy[i] = Math.sin(a);
    }
  }

  // gradient noise in roughly [-1, 1]; period (integer) makes it tile
  noise2(x, y, period = 0) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    let x0 = xi, y0 = yi, x1 = xi + 1, y1 = yi + 1;
    if (period > 0) {
      x0 = ((x0 % period) + period) % period; x1 = ((x1 % period) + period) % period;
      y0 = ((y0 % period) + period) % period; y1 = ((y1 % period) + period) % period;
    }
    const P = this.perm;
    const h00 = P[(P[x0 & 255] + y0) & 511] & 255;
    const h10 = P[(P[x1 & 255] + y0) & 511] & 255;
    const h01 = P[(P[x0 & 255] + y1) & 511] & 255;
    const h11 = P[(P[x1 & 255] + y1) & 511] & 255;
    const gx = this.gx, gy = this.gy;
    const n00 = gx[h00] * xf + gy[h00] * yf;
    const n10 = gx[h10] * (xf - 1) + gy[h10] * yf;
    const n01 = gx[h01] * xf + gy[h01] * (yf - 1);
    const n11 = gx[h11] * (xf - 1) + gy[h11] * (yf - 1);
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const a = n00 + u * (n10 - n00);
    const b = n01 + u * (n11 - n01);
    return (a + v * (b - a)) * 1.414;
  }

  fbm(x, y, octaves = 5, period = 0, lacunarity = 2, gain = 0.5) {
    let sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise2(x * freq, y * freq, period ? period * freq : 0);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  ridged(x, y, octaves = 5, period = 0) {
    let sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const n = 1 - Math.abs(this.noise2(x * freq, y * freq, period ? period * freq : 0));
      sum += amp * n * n;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));
