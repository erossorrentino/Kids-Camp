// Procedural texture factory. No image files ship with the game: every
// surface (asphalt grain, grass, gravel, curbs, sponsor boards, crowds,
// carbon fibre...) is painted here at load time and cached.
import * as THREE from 'three';
import { Noise, RNG, clamp } from '../core/rng.js';

const cache = new Map();
let maxAniso = 8;
export function setMaxAnisotropy(a) { maxAniso = a; }

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function tex(c, { srgb = true, repeat = true, aniso = true, mips = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso ? maxAniso : 1;
  t.generateMipmaps = mips;
  if (!mips) t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

// Height field (Float32Array, wraps) -> tangent-space normal map canvas
function heightToNormal(h, w, hgt, strength) {
  const c = canvas(w, hgt);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, hgt);
  const d = img.data;
  for (let y = 0; y < hgt; y++) {
    for (let x = 0; x < w; x++) {
      const xl = (x - 1 + w) % w, xr = (x + 1) % w;
      const yu = (y - 1 + hgt) % hgt, yd = (y + 1) % hgt;
      const dx = (h[y * w + xr] - h[y * w + xl]) * strength;
      const dy = (h[yd * w + x] - h[yu * w + x]) * strength;
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function fillFromFn(w, h, fn) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b, a = 255] = fn(x, y);
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ---------------------------------------------------------------------------
// Ground materials
// ---------------------------------------------------------------------------
export function asphaltTextures() {
  return cached('asphalt', () => {
    const N = 512, n = new Noise(11), rng = new RNG(5);
    const h = new Float32Array(N * N);
    const albedo = new Float32Array(N * N);
    const rough = new Float32Array(N * N);
    // aggregate stones: sparse sharp bumps
    const stones = new Float32Array(N * N);
    for (let k = 0; k < 9000; k++) {
      const cx = rng.float(0, N), cy = rng.float(0, N), r = rng.float(0.8, 2.6);
      const bright = rng.float(-0.5, 0.55);
      for (let y = Math.floor(cy - r); y <= cy + r; y++) {
        for (let x = Math.floor(cx - r); x <= cx + r; x++) {
          const dd = Math.hypot(x - cx, y - cy) / r;
          if (dd > 1) continue;
          const xi = ((x % N) + N) % N, yi = ((y % N) + N) % N;
          const v = Math.sqrt(1 - dd * dd);
          const idx = yi * N + xi;
          if (v > stones[idx]) { stones[idx] = v; albedo[idx] = bright; }
        }
      }
    }
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const u = x / N, v = y / N;
        const fine = n.fbm(u * 64, v * 64, 3, 64);
        const mid = n.fbm(u * 8, v * 8, 4, 8);
        h[i] = stones[i] * 0.9 + fine * 0.25 + mid * 0.1;
        // albedo: dark binder + lighter stones
        const base = 0.235 + mid * 0.035 + fine * 0.03;
        albedo[i] = base + stones[i] * (0.02 + albedo[i] * 0.05);
        rough[i] = 0.82 - stones[i] * 0.22 + fine * 0.05;
      }
    }
    const map = tex(fillFromFn(N, N, (x, y) => {
      const a = clamp(albedo[y * N + x], 0, 1) * 255;
      return [a, a * 1.0, a * 1.02];
    }));
    const normalMap = tex(heightToNormal(h, N, N, 1.1), { srgb: false });
    const roughnessMap = tex(fillFromFn(N, N, (x, y) => {
      const r = clamp(rough[y * N + x], 0, 1) * 255;
      return [r, r, r];
    }), { srgb: false });
    return { map, normalMap, roughnessMap };
  });
}

// generic organic ground: grass / gravel / sand / snow / dirt / rock
const GROUND_PRESETS = {
  grass: { c1: [64, 98, 40], c2: [98, 122, 58], c3: [50, 76, 34], blades: true, nscale: 1.2, rough: 0.95 },
  drygrass: { c1: [128, 122, 64], c2: [156, 146, 86], c3: [102, 98, 52], blades: true, nscale: 1.0, rough: 0.95 },
  gravel: { c1: [168, 152, 124], c2: [196, 182, 152], c3: [128, 116, 96], pebbles: true, nscale: 2.2, rough: 0.9 },
  sand: { c1: [196, 152, 104], c2: [214, 176, 128], c3: [170, 126, 84], nscale: 0.8, rough: 0.92, ripples: true },
  snow: { c1: [232, 238, 246], c2: [250, 252, 255], c3: [206, 216, 232], nscale: 0.6, rough: 0.7 },
  dirt: { c1: [104, 78, 56], c2: [128, 98, 70], c3: [80, 60, 44], pebbles: true, nscale: 1.4, rough: 0.95 },
  rock: { c1: [150, 92, 64], c2: [182, 118, 82], c3: [112, 66, 46], strata: true, nscale: 2.5, rough: 0.9 },
  greyrock: { c1: [118, 116, 112], c2: [150, 148, 142], c3: [88, 86, 84], strata: true, nscale: 2.5, rough: 0.9 },
  pavement: { c1: [150, 148, 142], c2: [170, 168, 160], c3: [128, 126, 122], tiles: true, nscale: 0.6, rough: 0.85 },
};

export function groundTextures(kind) {
  return cached('ground_' + kind, () => {
    const P = GROUND_PRESETS[kind] || GROUND_PRESETS.grass;
    const N = 512, n = new Noise(kind.length * 97 + 3), rng = new RNG(kind.length * 13 + 7);
    const h = new Float32Array(N * N);
    const col = new Float32Array(N * N * 3);
    const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    if (P.pebbles) {
      for (let k = 0; k < 7000; k++) {
        const cx = rng.float(0, N), cy = rng.float(0, N), r = rng.float(1.2, 4.5);
        const shade = rng.float(-0.25, 0.3);
        for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
          const dd = Math.hypot(x - cx, (y - cy) * 1.2) / r;
          if (dd > 1) continue;
          const xi = ((x % N) + N) % N, yi = ((y % N) + N) % N, idx = yi * N + xi;
          const v = Math.sqrt(1 - dd * dd);
          if (v > h[idx]) {
            h[idx] = v;
            const c = mixc(P.c1, P.c2, clamp(0.5 + shade + v * 0.2, 0, 1));
            col[idx * 3] = c[0]; col[idx * 3 + 1] = c[1]; col[idx * 3 + 2] = c[2];
          }
        }
      }
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, u = x / N, v = y / N;
      const f1 = n.fbm(u * 6, v * 6, 5, 6) * 0.5 + 0.5;
      const f2 = n.fbm(u * 32, v * 32, 3, 32) * 0.5 + 0.5;
      let height = f1 * 0.4 + f2 * 0.3;
      let c = mixc(P.c3, P.c1, clamp(f1 * 1.4 - 0.1, 0, 1));
      c = mixc(c, P.c2, clamp((f2 - 0.5) * 2.2, 0, 1) * 0.6);
      if (P.blades) {
        // grass blades: high-frequency anisotropic streaks
        const b = n.noise2(u * 220, v * 60, 220) * 0.5 + 0.5;
        const b2 = n.noise2(u * 90 + 7, v * 240, 90) * 0.5 + 0.5;
        const blade = Math.pow(Math.max(b, b2), 3);
        height += blade * 0.6;
        c = mixc(c, mixc(P.c2, [200, 210, 120], 0.15), blade * 0.5);
        c = mixc(c, P.c3, (1 - blade) * 0.25);
      }
      if (P.ripples) {
        const r = Math.sin((v * 40 + n.fbm(u * 3, v * 3, 3, 3) * 6) * Math.PI * 2) * 0.5 + 0.5;
        height += r * 0.25;
        c = mixc(c, P.c2, r * 0.2);
      }
      if (P.strata) {
        const s = Math.sin((v * 18 + n.fbm(u * 4, v * 4, 4, 4) * 3) * Math.PI * 2) * 0.5 + 0.5;
        const cr = n.ridged(u * 10, v * 10, 4, 10);
        height += s * 0.3 + cr * 0.5;
        c = mixc(c, P.c3, cr * 0.4);
        c = mixc(c, P.c2, s * 0.25);
      }
      if (P.tiles) {
        const tx = (u * 8) % 1, ty = (v * 8) % 1;
        const edge = Math.min(tx, 1 - tx, ty, 1 - ty);
        const g = edge < 0.03 ? 0 : 1;
        height = height * 0.3 + g * 0.7;
        c = mixc([90, 88, 84], c, g);
      }
      if (P.pebbles && h[i] > 0) {
        height = Math.max(height * 0.3, h[i]);
        const pc = [col[i * 3], col[i * 3 + 1], col[i * 3 + 2]];
        c = mixc(c, pc, clamp(h[i] * 2, 0, 1));
      }
      h[i] = height * P.nscale;
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    const map = tex(fillFromFn(N, N, (x, y) => {
      const i = (y * N + x) * 3;
      return [col[i], col[i + 1], col[i + 2]];
    }));
    const normalMap = tex(heightToNormal(h, N, N, 2.2), { srgb: false });
    return { map, normalMap, roughness: P.rough };
  });
}

// Large-scale tileable noise for breaking up repetition (R,G,B = 3 octaves)
export function macroNoise() {
  return cached('macro', () => {
    const N = 256, n = new Noise(77);
    const c = fillFromFn(N, N, (x, y) => {
      const u = x / N, v = y / N;
      return [
        (n.fbm(u * 3, v * 3, 4, 3) * 0.5 + 0.5) * 255,
        (n.fbm(u * 7 + 3, v * 7, 4, 7) * 0.5 + 0.5) * 255,
        (n.fbm(u * 15, v * 15 + 5, 3, 15) * 0.5 + 0.5) * 255,
      ];
    });
    return tex(c, { srgb: false });
  });
}

// ---------------------------------------------------------------------------
// Curbs: red/white (or blue/white, green/white...) striped, with ridges
// ---------------------------------------------------------------------------
export function curbTexture(colA = '#d01818', colB = '#f2f2f2') {
  return cached('curb' + colA + colB, () => {
    const W = 64, H = 256;
    const c = canvas(W, H), ctx = c.getContext('2d');
    ctx.fillStyle = colA; ctx.fillRect(0, 0, W, H / 2);
    ctx.fillStyle = colB; ctx.fillRect(0, H / 2, W, H / 2);
    // wear / dirt
    const rng = new RNG(9);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(30,30,30,${rng.float(0.02, 0.12)})`;
      ctx.fillRect(rng.float(0, W), rng.float(0, H), rng.float(1, 4), rng.float(1, 6));
    }
    // dark edge strip on track side
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(0.12, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    return tex(c);
  });
}

// ---------------------------------------------------------------------------
// Sponsor billboards (all brands invented)
// ---------------------------------------------------------------------------
export const SPONSORS = [
  ['VORTEXA', '#e10600', '#ffffff'], ['NOVA FUEL', '#0a1a3a', '#ffcc00'], ['KRONOS', '#111111', '#00e5ff'],
  ['PULSAR TYRES', '#ffd400', '#111111'], ['AEROLUX', '#ffffff', '#0047ab'], ['HELIX OIL', '#00843d', '#ffffff'],
  ['ZENITH WATCHES', '#1c1c1c', '#d4af37'], ['RAPIDO', '#ff6a00', '#ffffff'], ['ORBIT TELECOM', '#5b2a86', '#ffffff'],
  ['TITAN BRAKES', '#c8102e', '#111111'], ['SKYLINE AIR', '#00a3e0', '#ffffff'], ['VOLTRIX', '#111111', '#7cff00'],
  ['MAGMA ENERGY', '#8b0000', '#ffb000'], ['FROST COLA', '#d8f3ff', '#d10000'], ['APEX VELOCITY', '#0b0f1a', '#ff2d55'],
  ['NEXUS BANK', '#003b6f', '#ffffff'],
];

export function sponsorAtlas() {
  return cached('sponsors', () => {
    const W = 1024, rowH = 128, rows = SPONSORS.length;
    const c = canvas(W, rowH * rows), ctx = c.getContext('2d');
    SPONSORS.forEach(([name, bg, fg], r) => {
      const y = r * rowH;
      ctx.fillStyle = bg; ctx.fillRect(0, y, W, rowH);
      // two logos per board so it reads at distance
      for (let k = 0; k < 2; k++) {
        const cx = W * (0.25 + 0.5 * k);
        ctx.save();
        ctx.translate(cx, y + rowH / 2);
        ctx.fillStyle = fg;
        // logo mark
        ctx.beginPath();
        if (r % 3 === 0) { ctx.moveTo(-210, 26); ctx.lineTo(-180, -30); ctx.lineTo(-150, 26); ctx.closePath(); }
        else if (r % 3 === 1) { ctx.arc(-185, 0, 26, 0, Math.PI * 2); }
        else { ctx.rect(-212, -24, 48, 48); }
        ctx.fill();
        ctx.font = `italic 900 ${name.length > 10 ? 52 : 64}px "Titillium Web", "Arial Black", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, 30, 4);
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(0, y, W, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, y + rowH - 6, W, 6);
    });
    const t = tex(c);
    t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

// ---------------------------------------------------------------------------
// Crowd on grandstands: rows of tiny coloured spectators
// ---------------------------------------------------------------------------
export function crowdTexture() {
  return cached('crowd', () => {
    const W = 512, H = 256, c = canvas(W, H), ctx = c.getContext('2d');
    const rng = new RNG(3);
    ctx.fillStyle = '#3a3d44'; ctx.fillRect(0, 0, W, H);
    const rows = 8, rh = H / rows;
    const shirts = ['#e8e8e8', '#d32f2f', '#1976d2', '#fbc02d', '#388e3c', '#212121', '#f57c00', '#7b1fa2', '#ff4081', '#00bcd4', '#ffffff', '#c62828'];
    const skins = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
    for (let r = 0; r < rows; r++) {
      const y0 = r * rh;
      ctx.fillStyle = r % 2 ? '#50545c' : '#454950';
      ctx.fillRect(0, y0 + rh * 0.78, W, rh * 0.22);
      for (let x = 2; x < W; x += rng.float(5, 8)) {
        if (rng.chance(0.08)) continue;
        const bw = rng.float(4, 6), by = y0 + rh * 0.3 + rng.float(-2, 2);
        ctx.fillStyle = rng.pick(shirts);
        ctx.fillRect(x, by + 6, bw, rh * 0.5);
        ctx.fillStyle = rng.pick(skins);
        ctx.beginPath(); ctx.arc(x + bw / 2, by + 3, 2.6, 0, Math.PI * 2); ctx.fill();
        if (rng.chance(0.05)) { // flag
          ctx.fillStyle = rng.pick(shirts);
          ctx.fillRect(x + 2, by - 10, 9, 6);
        }
      }
    }
    return tex(c);
  });
}

// ---------------------------------------------------------------------------
// Building facades: day albedo + night emissive (random lit windows)
// ---------------------------------------------------------------------------
export function facadeTextures(style = 0) {
  return cached('facade' + style, () => {
    const W = 256, H = 512, rng = new RNG(31 + style * 7);
    const cols = style === 1 ? 6 : 8, rowsN = style === 1 ? 14 : 18;
    const base = ['#c9c4bb', '#8a96a3', '#d8cfc0', '#6e7a86', '#b8a48c'][style % 5];
    const glass = ['#2a3a4c', '#1d2836', '#33465a', '#283545', '#3a3a3a'][style % 5];
    const a = canvas(W, H), actx = a.getContext('2d');
    const e = canvas(W, H), ectx = e.getContext('2d');
    actx.fillStyle = base; actx.fillRect(0, 0, W, H);
    ectx.fillStyle = '#000'; ectx.fillRect(0, 0, W, H);
    const cw = W / cols, rh = H / rowsN;
    for (let r = 0; r < rowsN; r++) for (let k = 0; k < cols; k++) {
      const x = k * cw + cw * 0.15, y = r * rh + rh * 0.2, w = cw * 0.7, hh = rh * 0.6;
      const gg = actx.createLinearGradient(x, y, x + w, y + hh);
      gg.addColorStop(0, glass); gg.addColorStop(1, '#5b7290');
      actx.fillStyle = gg; actx.fillRect(x, y, w, hh);
      if (rng.chance(0.45)) {
        const warm = rng.chance(0.75);
        const l = rng.float(0.5, 1);
        ectx.fillStyle = warm ? `rgba(255,${190 + l * 40 | 0},${110 + l * 60 | 0},${l})` : `rgba(180,220,255,${l})`;
        ectx.fillRect(x, y, w, hh);
      }
    }
    return { map: tex(a), emissiveMap: tex(e) };
  });
}

// ---------------------------------------------------------------------------
// Carbon fibre weave
// ---------------------------------------------------------------------------
export function carbonTexture() {
  return cached('carbon', () => {
    const N = 128, cell = 16;
    const c = fillFromFn(N, N, (x, y) => {
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      const horiz = (cx + cy) % 2 === 0;
      const t = horiz ? (y % cell) / cell : (x % cell) / cell;
      const s = Math.sin(t * Math.PI);
      const v = 18 + s * 38 + (horiz ? 8 : 0);
      return [v, v, v * 1.08];
    });
    return tex(c);
  });
}

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------
export function smokeSprite() {
  return cached('smoke', () => {
    const N = 128, n = new Noise(5);
    const c = fillFromFn(N, N, (x, y) => {
      const dx = x / N - 0.5, dy = y / N - 0.5;
      const r = Math.hypot(dx, dy) * 2;
      const f = n.fbm(x / 24, y / 24, 4) * 0.5 + 0.5;
      const a = clamp((1 - r) * 1.3, 0, 1) * (0.55 + f * 0.6);
      return [255, 255, 255, clamp(a * a, 0, 1) * 255];
    });
    return tex(c, { repeat: false });
  });
}

export function glowSprite() {
  return cached('glow', () => {
    const N = 64;
    const c = fillFromFn(N, N, (x, y) => {
      const r = Math.hypot(x / N - 0.5, y / N - 0.5) * 2;
      const a = Math.pow(clamp(1 - r, 0, 1), 2.2);
      return [255, 255, 255, a * 255];
    });
    return tex(c, { repeat: false });
  });
}

// soft round blob used as fake contact shadow under cars
export function blobShadowTexture() {
  return cached('blob', () => {
    const W = 128, H = 256;
    const c = fillFromFn(W, H, (x, y) => {
      const dx = (x / W - 0.5) * 2, dy = (y / H - 0.5) * 2;
      // rounded-rectangle falloff
      const qx = Math.max(Math.abs(dx) - 0.45, 0), qy = Math.max(Math.abs(dy) - 0.62, 0);
      const d = Math.hypot(qx / 0.55, qy / 0.38);
      const a = Math.pow(clamp(1 - d, 0, 1), 1.6);
      return [0, 0, 0, a * 255];
    });
    return tex(c, { repeat: false });
  });
}

// ---------------------------------------------------------------------------
// Tyre sidewall: slight lettering band + tread
// ---------------------------------------------------------------------------
export function tyreTexture(slick) {
  return cached('tyre' + slick, () => {
    const W = 512, H = 64, c = canvas(W, H), ctx = c.getContext('2d');
    ctx.fillStyle = '#161616'; ctx.fillRect(0, 0, W, H);
    if (!slick) {
      ctx.fillStyle = '#090909';
      for (let x = 0; x < W; x += 16) {
        ctx.fillRect(x, 0, 5, H);
        ctx.save(); ctx.translate(x + 8, H / 2); ctx.rotate(0.5); ctx.fillRect(-1, -H, 3, H * 2); ctx.restore();
      }
    }
    return tex(c);
  });
}

export function sidewallTexture(accent = '#ffd400') {
  return cached('side' + accent, () => {
    const N = 256, c = canvas(N, N), ctx = c.getContext('2d');
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, N, N);
    ctx.save();
    ctx.translate(N / 2, N / 2);
    ctx.fillStyle = accent;
    ctx.font = 'bold 22px Arial, sans-serif';
    const text = 'PULSAR  RACE  ';
    for (let k = 0; k < 2; k++) {
      ctx.save();
      ctx.rotate(k * Math.PI);
      for (let i = 0; i < text.length; i++) {
        ctx.save();
        ctx.rotate(-0.9 + i * 0.13);
        ctx.fillText(text[i], -6, -N * 0.41);
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.restore();
    return tex(c, { repeat: false });
  });
}

// brake disc: drilled/grooved
export function discTexture() {
  return cached('disc', () => {
    const N = 256, c = canvas(N, N), ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(N / 2, N / 2, N * 0.18, N / 2, N / 2, N / 2);
    g.addColorStop(0, '#2a2a2a'); g.addColorStop(0.4, '#8b8b8b'); g.addColorStop(0.95, '#9a9a9a'); g.addColorStop(1, '#555');
    ctx.fillStyle = g; ctx.fillRect(0, 0, N, N);
    ctx.strokeStyle = 'rgba(40,40,40,0.6)'; ctx.lineWidth = 2;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(N / 2 + Math.cos(a) * N * 0.24, N / 2 + Math.sin(a) * N * 0.24);
      ctx.lineTo(N / 2 + Math.cos(a + 0.35) * N * 0.47, N / 2 + Math.sin(a + 0.35) * N * 0.47);
      ctx.stroke();
    }
    ctx.fillStyle = '#222';
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2, rr = N * (0.3 + (i % 3) * 0.05);
      ctx.beginPath(); ctx.arc(N / 2 + Math.cos(a) * rr, N / 2 + Math.sin(a) * rr, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    return tex(c, { repeat: false });
  });
}

// Honeycomb grille (used as albedo; dark mesh with highlights)
export function grilleTexture() {
  return cached('grille', () => {
    const W = 128, H = 128, c = canvas(W, H), ctx = c.getContext('2d');
    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 2;
    const r = 8;
    for (let y = 0; y < H + r; y += r * 1.5) {
      for (let x = 0; x < W + r; x += r * Math.sqrt(3)) {
        const ox = (Math.round(y / (r * 1.5)) % 2) * r * Math.sqrt(3) / 2;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + (k * Math.PI) / 3;
          const px = x + ox + Math.cos(a) * r * 0.8, py = y + Math.sin(a) * r * 0.8;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.stroke();
      }
    }
    return tex(c);
  });
}

// Headlight internals: reflector bowls + LED strip, used as emissive map
export function headlightTexture(style = 0) {
  return cached('headlight' + style, () => {
    const W = 256, H = 128, c = canvas(W, H), ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#5a6066'); g.addColorStop(1, '#1d2024');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const nb = style === 1 ? 3 : 2;
    for (let i = 0; i < nb; i++) {
      const cx = W * (0.25 + (0.5 * i) / Math.max(1, nb - 1) * (nb > 1 ? 1 : 0)) * (nb === 3 ? 0.8 : 1) + (nb === 3 ? W * 0.1 : 0);
      const rg = ctx.createRadialGradient(cx, H * 0.55, 2, cx, H * 0.55, H * 0.38);
      rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.35, '#dfe8f0'); rg.addColorStop(0.7, '#7d8a96'); rg.addColorStop(1, '#2c3238');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, H * 0.55, H * 0.36, 0, Math.PI * 2); ctx.fill();
    }
    // DRL strip
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(W * 0.06, H * 0.08, W * 0.88, H * 0.1);
    return tex(c, { repeat: false });
  });
}

export function taillightTexture() {
  return cached('taillight', () => {
    const W = 256, H = 64, c = canvas(W, H), ctx = c.getContext('2d');
    ctx.fillStyle = '#3a0000'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#ff2020' : '#c00000';
      ctx.fillRect(W * 0.04, H * (0.12 + i * 0.2), W * 0.92, H * 0.12);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(W * 0.7, H * 0.2, W * 0.2, H * 0.6);
    return tex(c, { repeat: false });
  });
}

// Window frames for the pit building etc.
export function pitBuildingTexture() {
  return cached('pitbuilding', () => {
    const W = 512, H = 256, c = canvas(W, H), ctx = c.getContext('2d');
    ctx.fillStyle = '#e8e8ea'; ctx.fillRect(0, 0, W, H);
    // upper glazing band
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.45);
    g.addColorStop(0, '#26384a'); g.addColorStop(1, '#4f6f8f');
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.06, W, H * 0.38);
    ctx.fillStyle = '#cfd3d8';
    for (let x = 0; x < W; x += 32) ctx.fillRect(x, H * 0.06, 3, H * 0.38);
    // garages
    for (let k = 0; k < 4; k++) {
      const x = k * (W / 4) + 10;
      ctx.fillStyle = '#16181c'; ctx.fillRect(x, H * 0.55, W / 4 - 20, H * 0.45);
      ctx.fillStyle = '#2b2f36';
      for (let y = H * 0.58; y < H; y += 8) ctx.fillRect(x, y, W / 4 - 20, 2);
      ctx.fillStyle = ['#e10600', '#0047ab', '#ffd400', '#00843d'][k];
      ctx.fillRect(x, H * 0.5, W / 4 - 20, H * 0.04);
    }
    return tex(c);
  });
}

// Chain-link catch fence (alpha map)
export function fenceTexture() {
  return cached('fence', () => {
    const N = 64, c = canvas(N, N), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, N, N);
    ctx.strokeStyle = 'rgba(200,205,210,1)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(N, N);
    ctx.moveTo(N, 0); ctx.lineTo(0, N);
    ctx.stroke();
    return tex(c);
  });
}

// Track-side gantry / bridge banner text
export function textBanner(text, bg = '#111', fg = '#fff', w = 1024, h = 128) {
  return cached('banner' + text + bg + fg, () => {
    const c = canvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg;
    ctx.font = `italic 900 ${h * 0.62}px "Titillium Web", "Arial Black", Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 4);
    return tex(c, { repeat: false });
  });
}

// Checkered pattern for start/finish
export function checkerTexture() {
  return cached('checker', () => {
    const N = 64, c = fillFromFn(N, N, (x, y) => {
      const v = ((x >> 3) + (y >> 3)) % 2 ? 245 : 18;
      return [v, v, v];
    });
    const t = tex(c);
    t.magFilter = THREE.NearestFilter;
    return t;
  });
}

// Starfield for night skies is done in the sky shader; this is a water normal map
export function waterNormal() {
  return cached('waternormal', () => {
    const N = 256, n = new Noise(19);
    const h = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      h[y * N + x] = n.fbm(u * 8, v * 8, 5, 8);
    }
    return tex(heightToNormal(h, N, N, 6), { srgb: false });
  });
}

export function leafTexture(kind = 'green') {
  return cached('leaf' + kind, () => {
    const N = 128, n = new Noise(kind.length * 3 + 1);
    const palette = {
      green: [[52, 92, 34], [86, 128, 44]],
      pine: [[30, 60, 34], [52, 88, 50]],
      blossom: [[236, 150, 186], [252, 206, 222]],
      autumn: [[176, 80, 26], [220, 150, 40]],
      palm: [[70, 120, 40], [120, 160, 60]],
      snowpine: [[40, 66, 50], [228, 236, 244]],
    }[kind] || [[60, 100, 40], [90, 130, 50]];
    const c = fillFromFn(N, N, (x, y) => {
      const f = n.fbm(x / 10, y / 10, 4, 0) * 0.5 + 0.5;
      const t = clamp(f * 1.6 - 0.3, 0, 1);
      const [a, b] = palette;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    });
    return tex(c);
  });
}
