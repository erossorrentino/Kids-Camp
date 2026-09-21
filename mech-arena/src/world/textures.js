/**
 * PROCEDURAL SURFACE TEXTURES
 * ------------------------------------------------------------------
 * Flat-coloured geometry is what makes a procedural world look like a
 * prototype. These generators paint albedo, roughness and normal maps
 * into canvases at load time, which costs a few milliseconds once and
 * buys the surfaces their scale back: you can see how big a wall is
 * because you can see its panel lines.
 *
 * Everything is cached by key, so a map with forty concrete objects
 * still only ever builds one concrete texture.
 */
import * as THREE from 'three';
import { makeRng } from '../core/rng.js';

/**
 * Surface sets are per arena, and each one is three 512px canvases. Two
 * arenas' worth is all that is ever live at once, so cap the cache well
 * above that and evict the oldest rather than growing for a whole session.
 */
const MAX_CACHED_SURFACES = 16;
const cache = new Map();

function evictOldestSurfaces() {
  while (cache.size > MAX_CACHED_SURFACES) {
    const oldest = cache.keys().next().value;
    const s = cache.get(oldest);
    cache.delete(oldest);
    s.map.dispose(); s.normalMap.dispose(); s.roughnessMap.dispose();
  }
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/** Value noise, tileable, rendered straight into ImageData. */
function noiseInto(ctx, size, { scale = 8, octaves = 4, seed = 1, contrast = 1, base = 0.5 } = {}) {
  const rng = makeRng(seed);
  const grids = [];
  for (let o = 0; o < octaves; o++) {
    const n = scale * (1 << o);
    const g = new Float32Array(n * n);
    for (let i = 0; i < g.length; i++) g[i] = rng();
    grids.push({ n, g });
  }
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const sample = (grid, x, y) => {
    const { n, g } = grid;
    const fx = x * n, fy = y * n;
    const x0 = Math.floor(fx) % n, y0 = Math.floor(fy) % n;
    const x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
    const tx = fx - Math.floor(fx), ty = fy - Math.floor(fy);
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g[y0 * n + x0], b = g[y0 * n + x1];
    const c = g[y1 * n + x0], e = g[y1 * n + x1];
    return (a + (b - a) * sx) + ((c + (e - c) * sx) - (a + (b - a) * sx)) * sy;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0, amp = 1, norm = 0;
      for (const grid of grids) {
        v += sample(grid, x / size, y / size) * amp;
        norm += amp;
        amp *= 0.5;
      }
      v = (v / norm - 0.5) * contrast + base;
      const px = Math.max(0, Math.min(255, Math.round(v * 255)));
      const i = (y * size + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = px;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Convert a greyscale height canvas into a tangent-space normal map. */
function normalFromHeight(src, strength = 2.2) {
  const size = src.width;
  const sctx = src.getContext('2d');
  const h = sctx.getImageData(0, 0, size, size).data;
  const out = canvas(size);
  const octx = out.getContext('2d');
  const img = octx.createImageData(size, size);
  const d = img.data;
  const at = (x, y) => h[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      d[i] = Math.round((-dx / len * 0.5 + 0.5) * 255);
      d[i + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255);
      d[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      d[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

function tex(cv, repeat = 1, srgb = false) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ *
 * Surface recipes
 * ------------------------------------------------------------------ */

/** Ground: large-scale noise tinted toward the biome colour, plus grit. */
function groundMaps(colorHex, { style = 'rock', seed = 1 }) {
  const S = 512;
  const height = canvas(S);
  const hctx = height.getContext('2d');
  noiseInto(hctx, S, { scale: 6, octaves: 5, seed, contrast: 1.1, base: 0.5 });

  if (style === 'dunes' || style === 'sand') {
    // Wind ripples: a directional sine on top of the noise.
    hctx.globalCompositeOperation = 'overlay';
    for (let y = 0; y < S; y++) {
      const v = 128 + Math.sin(y * 0.26 + Math.sin(y * 0.03) * 6) * 26;
      hctx.fillStyle = `rgb(${v},${v},${v})`;
      hctx.fillRect(0, y, S, 1);
    }
    hctx.globalCompositeOperation = 'source-over';
  } else if (style === 'rock') {
    // Fractured plates.
    const rng = makeRng(seed + 7);
    hctx.globalCompositeOperation = 'multiply';
    hctx.strokeStyle = 'rgba(70,70,70,0.7)';
    hctx.lineWidth = 2;
    for (let i = 0; i < 46; i++) {
      hctx.beginPath();
      let x = rng() * S, y = rng() * S;
      hctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (rng() - 0.5) * 160; y += (rng() - 0.5) * 160; hctx.lineTo(x, y); }
      hctx.stroke();
    }
    hctx.globalCompositeOperation = 'source-over';
  } else if (style === 'metal') {
    hctx.globalCompositeOperation = 'multiply';
    hctx.strokeStyle = 'rgba(60,60,60,0.85)';
    hctx.lineWidth = 3;
    for (let i = 0; i <= S; i += 64) {
      hctx.beginPath(); hctx.moveTo(i, 0); hctx.lineTo(i, S); hctx.stroke();
      hctx.beginPath(); hctx.moveTo(0, i); hctx.lineTo(S, i); hctx.stroke();
    }
    hctx.globalCompositeOperation = 'source-over';
  }

  // Albedo: the biome colour modulated by the height field.
  const albedo = canvas(S);
  const actx = albedo.getContext('2d');
  const base = new THREE.Color(colorHex);
  const hd = hctx.getImageData(0, 0, S, S).data;
  const img = actx.createImageData(S, S);
  const d = img.data;
  for (let i = 0; i < S * S; i++) {
    const v = 0.72 + (hd[i * 4] / 255) * 0.56;
    d[i * 4] = Math.min(255, base.r * 255 * v);
    d[i * 4 + 1] = Math.min(255, base.g * 255 * v);
    d[i * 4 + 2] = Math.min(255, base.b * 255 * v);
    d[i * 4 + 3] = 255;
  }
  actx.putImageData(img, 0, 0);

  return { albedo, height };
}

/** Concrete: panel joints, stains, chipped edges. */
function concreteMaps(colorHex, { seed = 1 }) {
  const S = 512;
  const rng = makeRng(seed);
  const height = canvas(S);
  const h = height.getContext('2d');
  noiseInto(h, S, { scale: 10, octaves: 4, seed, contrast: 0.55, base: 0.62 });

  h.strokeStyle = 'rgba(40,40,40,0.9)';
  h.lineWidth = 3;
  for (let i = 0; i <= S; i += 128) {
    h.beginPath(); h.moveTo(i, 0); h.lineTo(i, S); h.stroke();
    h.beginPath(); h.moveTo(0, i); h.lineTo(S, i); h.stroke();
  }
  // Bolt heads at the panel corners.
  h.fillStyle = 'rgba(210,210,210,0.8)';
  for (let x = 0; x <= S; x += 128) {
    for (let y = 0; y <= S; y += 128) {
      for (const [ox, oy] of [[10, 10], [-10, 10], [10, -10], [-10, -10]]) {
        h.beginPath(); h.arc(x + ox, y + oy, 3.2, 0, 7); h.fill();
      }
    }
  }

  const albedo = canvas(S);
  const a = albedo.getContext('2d');
  a.drawImage(height, 0, 0);
  a.globalCompositeOperation = 'multiply';
  a.fillStyle = '#' + new THREE.Color(colorHex).getHexString();
  a.fillRect(0, 0, S, S);
  a.globalCompositeOperation = 'source-over';
  // Weathering streaks running down from the joints.
  for (let i = 0; i < 90; i++) {
    const x = rng() * S, y = Math.floor(rng() * 4) * 128;
    const g = a.createLinearGradient(0, y, 0, y + 90);
    g.addColorStop(0, `rgba(30,26,22,${rng() * 0.35})`);
    g.addColorStop(1, 'rgba(30,26,22,0)');
    a.fillStyle = g;
    a.fillRect(x, y, rng() * 12 + 3, 90);
  }
  return { albedo, height };
}

/** Industrial metal: brushed finish, rivets, rust blooms. */
function metalMaps(colorHex, { seed = 1 }) {
  const S = 512;
  const rng = makeRng(seed);
  const height = canvas(S);
  const h = height.getContext('2d');
  noiseInto(h, S, { scale: 16, octaves: 3, seed, contrast: 0.4, base: 0.6 });
  // Brushed streaks.
  for (let i = 0; i < 900; i++) {
    const y = rng() * S;
    const v = 128 + (rng() - 0.5) * 70;
    h.strokeStyle = `rgba(${v},${v},${v},0.25)`;
    h.lineWidth = rng() * 2 + 0.4;
    h.beginPath(); h.moveTo(0, y); h.lineTo(S, y + (rng() - 0.5) * 8); h.stroke();
  }
  // Rivet lines.
  h.fillStyle = 'rgba(225,225,225,0.85)';
  for (let x = 16; x < S; x += 96) {
    for (let y = 12; y < S; y += 22) {
      h.beginPath(); h.arc(x, y, 2.6, 0, 7); h.fill();
    }
  }

  const albedo = canvas(S);
  const a = albedo.getContext('2d');
  a.drawImage(height, 0, 0);
  a.globalCompositeOperation = 'multiply';
  a.fillStyle = '#' + new THREE.Color(colorHex).getHexString();
  a.fillRect(0, 0, S, S);
  a.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 26; i++) {
    const x = rng() * S, y = rng() * S, r = rng() * 46 + 10;
    const g = a.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(120,62,24,${rng() * 0.4 + 0.15})`);
    g.addColorStop(1, 'rgba(120,62,24,0)');
    a.fillStyle = g;
    a.beginPath(); a.arc(x, y, r, 0, 7); a.fill();
  }
  return { albedo, height };
}

const RECIPES = { ground: groundMaps, concrete: concreteMaps, metal: metalMaps };

/**
 * @param {'ground'|'concrete'|'metal'} kind
 * @returns {{map:THREE.Texture, normalMap:THREE.Texture, roughnessMap:THREE.Texture}}
 */
export function surface(kind, colorHex, { seed = 1, repeat = 4, style = null, normalStrength = 2.0 } = {}) {
  const key = `${kind}|${colorHex}|${seed}|${repeat}|${style}`;
  if (cache.has(key)) {
    const hit = cache.get(key);
    cache.delete(key);
    cache.set(key, hit);   // keep recently used sets alive
    return hit;
  }
  const { albedo, height } = (RECIPES[kind] || concreteMaps)(colorHex, { style, seed });
  const normal = normalFromHeight(height, normalStrength);
  const out = {
    map: tex(albedo, repeat, true),
    normalMap: tex(normal, repeat),
    roughnessMap: tex(height, repeat),
  };
  cache.set(key, out);
  evictOldestSurfaces();
  return out;
}

export function disposeTextureCache() {
  for (const s of cache.values()) {
    s.map.dispose(); s.normalMap.dispose(); s.roughnessMap.dispose();
  }
  cache.clear();
}
