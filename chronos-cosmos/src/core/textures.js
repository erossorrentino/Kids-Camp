import * as THREE from 'three';
import { hash2 } from './noise.js';

// Procedural, tileable PBR-ish textures generated at load time. Every
// surface in the game is painted here, no image files are shipped.

function pnoise(x, y, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const p = period;
  const h = (a, b) => hash2(((a % p) + p) % p + seed * 1013, ((b % p) + p) % p - seed * 7919);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function pfbm(x, y, period, oct, seed) {
  let s = 0, a = 0.5, n = 0, f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * pnoise(x * f, y * f, period * f, seed + i);
    n += a;
    a *= 0.5;
    f *= 2;
  }
  return s / n;
}

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// Build albedo + normal (+ roughness in alpha-less separate map) from a
// per-pixel function returning [r,g,b,height,rough].
function generate(size, fn, opts = {}) {
  const albedo = makeCanvas(size);
  const actx = albedo.getContext('2d');
  const aimg = actx.createImageData(size, size);
  const H = new Float32Array(size * size);
  const R = new Float32Array(size * size);
  const out = [0, 0, 0, 0, 0.8];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      out[4] = 0.8;
      fn(x / size, y / size, out);
      const i = y * size + x;
      aimg.data[i * 4] = Math.max(0, Math.min(255, out[0] * 255));
      aimg.data[i * 4 + 1] = Math.max(0, Math.min(255, out[1] * 255));
      aimg.data[i * 4 + 2] = Math.max(0, Math.min(255, out[2] * 255));
      aimg.data[i * 4 + 3] = 255;
      H[i] = out[3];
      R[i] = out[4];
    }
  }
  actx.putImageData(aimg, 0, 0);
  const strength = opts.normalStrength ?? 2.5;
  const normal = makeCanvas(size);
  const nctx = normal.getContext('2d');
  const nimg = nctx.createImageData(size, size);
  const rough = makeCanvas(size);
  const rctx = rough.getContext('2d');
  const rimg = rctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = H[y * size + ((x - 1 + size) % size)];
      const r = H[y * size + ((x + 1) % size)];
      const u = H[((y - 1 + size) % size) * size + x];
      const d = H[((y + 1) % size) * size + x];
      let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      nimg.data[i] = (nx * 0.5 + 0.5) * 255;
      nimg.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      nimg.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      nimg.data[i + 3] = 255;
      const rv = R[y * size + x] * 255;
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = rv;
      rimg.data[i + 3] = 255;
    }
  }
  nctx.putImageData(nimg, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  const nmap = new THREE.CanvasTexture(normal);
  const rmap = new THREE.CanvasTexture(rough);
  for (const t of [map, nmap, rmap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
  }
  return { map, normalMap: nmap, roughnessMap: rmap };
}

const mix = (a, b, t) => a + (b - a) * t;

// Running-bond brick / block masonry.
function masonry(u, v, out, o) {
  const rows = o.rows, cols = o.cols;
  const ry = v * rows;
  const row = Math.floor(ry);
  const off = (row % 2) * 0.5 * (o.offset ?? 1);
  const rx = u * cols + off + (o.jitter ? (hash2(row, 99) - 0.5) * 0.3 : 0);
  const col = Math.floor(rx);
  const fx = rx - col, fy = ry - row;
  const mortar = o.mortar;
  const ex = Math.min(fx, 1 - fx) * (1 / cols) * (o.aspect ?? 1);
  const ey = Math.min(fy, 1 - fy) * (1 / rows);
  const e = Math.min(ex * cols, ey * rows * (rows / cols));
  const edge = Math.min(fx, 1 - fx, (Math.min(fy, 1 - fy)) * (o.aspect ?? 1));
  const bid = hash2(((col % cols) + cols) % cols + row * 131, row);
  const n = pfbm(u * 16, v * 16, 16, 4, o.seed || 3);
  const n2 = pnoise(u * 64, v * 64, 64, 9);
  const bevel = Math.min(1, edge / (mortar * 2.2));
  const isMortar = edge < mortar;
  const tint = (bid - 0.5) * o.tintVar;
  if (isMortar) {
    out[0] = o.mortarColor[0] * (0.85 + n * 0.3);
    out[1] = o.mortarColor[1] * (0.85 + n * 0.3);
    out[2] = o.mortarColor[2] * (0.85 + n * 0.3);
    out[3] = 0.05 + n * 0.1;
    out[4] = 0.95;
  } else {
    const c = o.color;
    const dirt = Math.pow(n, 1.5) * 0.35;
    out[0] = (c[0] + tint * c[0] + (n2 - 0.5) * 0.06) * (1 - dirt);
    out[1] = (c[1] + tint * c[1] + (n2 - 0.5) * 0.06) * (1 - dirt);
    out[2] = (c[2] + tint * c[2] * 0.8 + (n2 - 0.5) * 0.06) * (1 - dirt);
    out[3] = 0.4 + Math.sqrt(bevel) * 0.45 + n * 0.12 + n2 * 0.05;
    out[4] = 0.75 + n2 * 0.2;
  }
  void e;
  void ey;
}

export function createTextures(maxSize = 512) {
  const T = {};
  const S = (n) => Math.min(n, maxSize);
  T.stone = generate(S(512), (u, v, o) =>
    masonry(u, v, o, {
      rows: 6, cols: 3, mortar: 0.035, color: [0.58, 0.55, 0.5], mortarColor: [0.36, 0.34, 0.31],
      tintVar: 0.35, seed: 4, aspect: 0.5, jitter: true,
    }), { normalStrength: 3.2 });
  T.brick = generate(S(512), (u, v, o) =>
    masonry(u, v, o, {
      rows: 12, cols: 4, mortar: 0.05, color: [0.62, 0.36, 0.26], mortarColor: [0.55, 0.52, 0.47],
      tintVar: 0.4, seed: 7, aspect: 0.33,
    }), { normalStrength: 2.5 });
  T.darkStone = generate(S(512), (u, v, o) => {
    masonry(u, v, o, {
      rows: 5, cols: 2, mortar: 0.03, color: [0.22, 0.21, 0.23], mortarColor: [0.08, 0.07, 0.07],
      tintVar: 0.25, seed: 11, aspect: 0.4, jitter: true,
    });
  }, { normalStrength: 3.5 });
  T.marble = generate(S(512), (u, v, o) => {
    masonry(u, v, o, {
      rows: 4, cols: 2, mortar: 0.012, color: [0.9, 0.88, 0.84], mortarColor: [0.7, 0.66, 0.58],
      tintVar: 0.08, seed: 13, aspect: 0.5,
    });
    const vein = Math.abs(Math.sin((u * 3 + pfbm(u * 4, v * 4, 4, 5, 21) * 3.5) * Math.PI * 2));
    const vv = Math.pow(1 - vein, 18) * 0.35;
    o[0] -= vv * 0.6; o[1] -= vv * 0.55; o[2] -= vv * 0.4;
    o[4] = 0.3 + o[4] * 0.2;
  }, { normalStrength: 1.2 });
  T.cobble = generate(S(512), (u, v, o) => {
    // voronoi cobbles
    const N = 10;
    const x = u * N, y = v * N;
    const xi = Math.floor(x), yi = Math.floor(y);
    let d1 = 9, d2 = 9, id = 0;
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const cx = xi + i, cy = yi + j;
        const wx = ((cx % N) + N) % N, wy = ((cy % N) + N) % N;
        const px = cx + 0.2 + hash2(wx, wy) * 0.6, py = cy + 0.2 + hash2(wy + 17, wx + 3) * 0.6;
        const d = Math.hypot(px - x, py - y);
        if (d < d1) { d2 = d1; d1 = d; id = hash2(wx * 7, wy * 13); } else if (d < d2) d2 = d;
      }
    const edge = d2 - d1;
    const n = pfbm(u * 32, v * 32, 32, 3, 5);
    const stoneH = Math.min(1, edge * 4);
    const t = 0.42 + id * 0.18;
    if (edge < 0.06) {
      o[0] = 0.18 + n * 0.08; o[1] = 0.16 + n * 0.08; o[2] = 0.12 + n * 0.06; o[3] = 0.0; o[4] = 0.95;
    } else {
      o[0] = t * (0.95 + n * 0.15); o[1] = t * (0.92 + n * 0.12); o[2] = t * (0.86 + n * 0.1);
      o[3] = Math.sqrt(stoneH) * 0.8 + n * 0.1; o[4] = 0.7 + n * 0.25;
    }
  }, { normalStrength: 4 });
  T.wood = generate(S(512), (u, v, o) => {
    const planks = 5;
    const px = u * planks;
    const p = Math.floor(px), fx = px - p;
    const pid = hash2(p, 3);
    const seg = Math.floor(v * 2 + pid * 2);
    const sid = hash2(p, seg + 11);
    const grain = pfbm(u * 8 + sid * 3, v * 1.5, 8, 3, 2);
    const rings = Math.sin((u * planks * 14 + grain * 6 + pid * 10) * 3.0) * 0.5 + 0.5;
    const fine = pnoise(u * 256, v * 16, 256, 4);
    const gap = Math.min(fx, 1 - fx) < 0.025 || Math.abs(((v * 2 + pid * 2) % 1)) < 0.006;
    const base = [0.42, 0.27, 0.15];
    const shade = 0.75 + sid * 0.35 + rings * 0.12 + (fine - 0.5) * 0.12;
    if (gap) {
      o[0] = 0.08; o[1] = 0.05; o[2] = 0.03; o[3] = 0; o[4] = 0.95;
    } else {
      o[0] = base[0] * shade; o[1] = base[1] * shade; o[2] = base[2] * shade;
      o[3] = 0.6 + rings * 0.1 + fine * 0.05; o[4] = 0.65 + fine * 0.2;
    }
  }, { normalStrength: 2 });
  T.bark = generate(S(256), (u, v, o) => {
    const n = pfbm(u * 8, v * 2, 8, 4, 31);
    const ridges = Math.pow(Math.abs(Math.sin((u * 10 + n * 2.5) * Math.PI)), 0.6);
    const t = 0.22 + ridges * 0.12 + n * 0.08;
    o[0] = t * 1.15; o[1] = t * 0.85; o[2] = t * 0.6; o[3] = ridges * 0.8 + n * 0.2; o[4] = 0.9;
  }, { normalStrength: 4 });
  T.plaster = generate(S(256), (u, v, o) => {
    const n = pfbm(u * 8, v * 8, 8, 5, 41);
    const n2 = pnoise(u * 64, v * 64, 64, 2);
    const stain = Math.max(0, pfbm(u * 2, v * 3, 2, 3, 51) - 0.45) * 0.9 * (1 - v * 0.5);
    const t = 0.86 + n * 0.08 + n2 * 0.03 - stain * 0.3;
    o[0] = t * 0.96; o[1] = t * 0.9; o[2] = t * 0.8; o[3] = n * 0.5 + n2 * 0.2; o[4] = 0.92;
  }, { normalStrength: 1.5 });
  T.roof = generate(S(512), (u, v, o) => {
    // overlapping clay tiles
    const rows = 10, cols = 8;
    const ry = v * rows, row = Math.floor(ry), fy = ry - row;
    const rx = u * cols + (row % 2) * 0.5, col = Math.floor(rx), fx = rx - col;
    const id = hash2(col + row * 37, row);
    const curve = Math.sin(fx * Math.PI);
    const lip = Math.pow(fy, 3);
    const n = pnoise(u * 64, v * 64, 64, 6);
    const t = 0.75 + id * 0.3;
    o[0] = 0.55 * t * (0.6 + curve * 0.4) * (1 - lip * 0.5);
    o[1] = 0.24 * t * (0.6 + curve * 0.4) * (1 - lip * 0.5);
    o[2] = 0.16 * t * (0.6 + curve * 0.4) * (1 - lip * 0.5);
    o[3] = curve * 0.5 + (1 - fy) * 0.4 + n * 0.05;
    o[4] = 0.7 + n * 0.2;
  }, { normalStrength: 3 });
  T.slate = generate(S(512), (u, v, o) => {
    const rows = 12, cols = 7;
    const ry = v * rows, row = Math.floor(ry), fy = ry - row;
    const rx = u * cols + (row % 2) * 0.5, col = Math.floor(rx), fx = rx - col;
    const id = hash2(col + row * 37, row + 5);
    const n = pnoise(u * 128, v * 128, 128, 6);
    const t = 0.18 + id * 0.08 + n * 0.03;
    const gap = Math.min(fx, 1 - fx) < 0.03;
    o[0] = gap ? 0.04 : t * 0.9; o[1] = gap ? 0.04 : t * 1.0; o[2] = gap ? 0.05 : t * 1.2;
    o[3] = gap ? 0 : 0.3 + (1 - fy) * 0.5 + n * 0.05; o[4] = 0.55 + n * 0.2;
  }, { normalStrength: 3 });
  T.thatch = generate(S(256), (u, v, o) => {
    const strands = pnoise(u * 128, v * 6, 128, 8);
    const n = pfbm(u * 8, v * 8, 8, 3, 61);
    const rows = 6; const fy = (v * rows) % 1;
    const t = 0.5 + strands * 0.35 + n * 0.15;
    o[0] = 0.62 * t * (0.7 + fy * 0.3); o[1] = 0.5 * t * (0.7 + fy * 0.3); o[2] = 0.28 * t * (0.7 + fy * 0.3);
    o[3] = strands * 0.6 + fy * 0.4; o[4] = 0.95;
  }, { normalStrength: 3 });
  T.metal = generate(S(256), (u, v, o) => {
    const n = pfbm(u * 16, v * 16, 16, 4, 71);
    const brush = pnoise(u * 256, v * 4, 256, 3);
    const t = 0.85 + n * 0.1 + brush * 0.08;
    o[0] = t; o[1] = t; o[2] = t; o[3] = n * 0.3 + brush * 0.1; o[4] = 0.25 + n * 0.3;
  }, { normalStrength: 0.8 });
  T.cloth = generate(S(256), (u, v, o) => {
    const wx = Math.sin(u * 256 * Math.PI) * 0.5 + 0.5;
    const wy = Math.sin(v * 256 * Math.PI) * 0.5 + 0.5;
    const n = pfbm(u * 8, v * 8, 8, 3, 81);
    const t = 0.85 + (wx * wy) * 0.12 + n * 0.1;
    o[0] = t; o[1] = t; o[2] = t; o[3] = wx * 0.3 + wy * 0.3; o[4] = 0.95;
  }, { normalStrength: 1 });
  T.rock = generate(S(512), (u, v, o) => {
    const n = pfbm(u * 6, v * 6, 6, 6, 91);
    const n2 = pfbm(u * 24, v * 24, 24, 3, 92);
    const strata = Math.sin((v * 20 + n * 4) * Math.PI) * 0.5 + 0.5;
    const t = 0.45 + n * 0.3 + strata * 0.06;
    o[0] = t * 0.95; o[1] = t * 0.9; o[2] = t * 0.85; o[3] = n * 0.7 + n2 * 0.3; o[4] = 0.85;
  }, { normalStrength: 5 });
  T.leaf = generate(S(256), (u, v, o) => {
    const n = pfbm(u * 12, v * 12, 12, 4, 101);
    const t = 0.7 + n * 0.5;
    o[0] = t; o[1] = t; o[2] = t; o[3] = n; o[4] = 0.8;
  }, { normalStrength: 3 });
  return T;
}

// Radial soft sprite used for glows/particles.
export function radialTexture(size = 64, inner = 0.0, falloff = 2.0) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size * 2 - 1, dy = (y + 0.5) / size * 2 - 1;
      const d = Math.hypot(dx, dy);
      const a = Math.max(0, 1 - Math.max(0, d - inner) / (1 - inner));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.pow(a, falloff) * 255;
    }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export { mix as _mix };
