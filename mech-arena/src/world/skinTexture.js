/**
 * SKIN TEXTURES
 * ------------------------------------------------------------------
 * Paints a skin's pattern into a canvas and hands back a THREE texture,
 * plus a matching roughness map so battleworn finishes actually look
 * scuffed rather than merely dark. Results are cached by skin id, since
 * ten mechs on a map usually share only two or three paint jobs.
 */
import * as THREE from 'three';
import { makeRng } from '../core/rng.js';
import { SKIN_BY_ID, DEFAULT_SKIN } from '../data/skins.js';

const SIZE = 512;

/**
 * Painted skins are cached by id, but there are 2,496 of them and bots roll
 * random ones every match, so an unbounded cache grows for as long as a
 * session lasts. A small insertion-ordered cache with the oldest entries
 * evicted keeps a match's worth resident and bounds the total.
 */
const MAX_CACHED_SKINS = 32;
const cache = new Map();

function evictOldestSkins() {
  while (cache.size > MAX_CACHED_SKINS) {
    const oldest = cache.keys().next().value;
    const entry = cache.get(oldest);
    cache.delete(oldest);
    entry.map.dispose();
    entry.roughMap.dispose();
  }
}

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
}

/* ---- pattern painters; each fills an already-primed canvas ---- */
const PAINT = {
  solid() {},

  panel(c, s, rng) {
    // Plated panel lines: the base look for almost every mech.
    c.strokeStyle = 'rgba(0,0,0,0.30)';
    c.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      const y = rng() * SIZE;
      c.beginPath(); c.moveTo(0, y); c.lineTo(SIZE, y); c.stroke();
    }
    for (let i = 0; i < 18; i++) {
      const x = rng() * SIZE;
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, SIZE); c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 40; i++) {
      const x = rng() * SIZE, y = rng() * SIZE;
      c.fillRect(x, y, rng() * 40 + 8, 2);
    }
  },

  stripe(c, s, rng) {
    PAINT.panel(c, s, rng);
    c.fillStyle = s.trim;
    const w = SIZE * 0.10;
    c.fillRect(SIZE * 0.42, 0, w, SIZE);
    c.fillStyle = s.secondary;
    c.fillRect(SIZE * 0.42 + w, 0, w * 0.35, SIZE);
  },

  splinter(c, s, rng) {
    c.fillStyle = s.secondary;
    for (let i = 0; i < 26; i++) {
      c.beginPath();
      const x = rng() * SIZE, y = rng() * SIZE;
      c.moveTo(x, y);
      for (let k = 0; k < 4; k++) c.lineTo(x + (rng() - 0.5) * 190, y + (rng() - 0.5) * 190);
      c.closePath(); c.fill();
    }
    PAINT.panel(c, s, rng);
  },

  hexcam(c, s, rng) {
    const r = 22;
    for (let y = 0; y < SIZE + r; y += r * 1.5) {
      for (let x = 0; x < SIZE + r; x += r * Math.sqrt(3)) {
        const ox = (Math.round(y / (r * 1.5)) % 2) * r * Math.sqrt(3) / 2;
        c.fillStyle = rng() < 0.4 ? s.secondary : rng() < 0.5 ? mix(s.primary, s.trim, 0.2) : s.primary;
        c.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 3 * i + Math.PI / 6;
          const px = x + ox + Math.cos(a) * r, py = y + Math.sin(a) * r;
          i ? c.lineTo(px, py) : c.moveTo(px, py);
        }
        c.closePath(); c.fill();
      }
    }
    PAINT.panel(c, s, rng);
  },

  digital(c, s, rng) {
    const cell = 16;
    for (let y = 0; y < SIZE; y += cell) {
      for (let x = 0; x < SIZE; x += cell) {
        const r = rng();
        if (r < 0.26) c.fillStyle = s.secondary;
        else if (r < 0.36) c.fillStyle = mix(s.primary, s.trim, 0.3);
        else continue;
        c.fillRect(x, y, cell, cell);
      }
    }
    PAINT.panel(c, s, rng);
  },

  chevron(c, s, rng) {
    PAINT.panel(c, s, rng);
    c.strokeStyle = s.trim; c.lineWidth = 16;
    for (let i = -2; i < 8; i++) {
      c.beginPath();
      c.moveTo(-40, i * 90);
      c.lineTo(SIZE / 2, i * 90 + 70);
      c.lineTo(SIZE + 40, i * 90);
      c.stroke();
    }
  },

  tiger(c, s, rng) {
    c.strokeStyle = s.secondary;
    c.lineCap = 'round';
    for (let i = 0; i < 34; i++) {
      c.lineWidth = rng() * 16 + 5;
      c.beginPath();
      let x = rng() * SIZE, y = rng() * SIZE;
      c.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (rng() - 0.3) * 70; y += (rng() - 0.5) * 34; c.lineTo(x, y); }
      c.stroke();
    }
    PAINT.panel(c, s, rng);
  },

  urbanblk(c, s, rng) {
    for (let i = 0; i < 70; i++) {
      c.fillStyle = rng() < 0.5 ? s.secondary : mix(s.primary, '#ffffff', 0.12);
      const w = rng() * 90 + 20, h = rng() * 90 + 20;
      c.fillRect(rng() * SIZE, rng() * SIZE, w, h);
    }
    PAINT.panel(c, s, rng);
  },

  weathered(c, s, rng) {
    PAINT.panel(c, s, rng);
    for (let i = 0; i < 260; i++) {
      c.fillStyle = `rgba(0,0,0,${rng() * 0.2})`;
      c.beginPath(); c.arc(rng() * SIZE, rng() * SIZE, rng() * 26 + 2, 0, 7); c.fill();
    }
    for (let i = 0; i < 120; i++) {
      c.fillStyle = `rgba(120,70,30,${rng() * 0.35})`;
      c.fillRect(rng() * SIZE, rng() * SIZE, rng() * 6 + 1, rng() * 44 + 4);
    }
  },

  circuit(c, s, rng) {
    PAINT.panel(c, s, rng);
    c.strokeStyle = s.trim; c.lineWidth = 2.4;
    for (let i = 0; i < 44; i++) {
      let x = Math.round(rng() * 16) * 32, y = Math.round(rng() * 16) * 32;
      c.beginPath(); c.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        if (rng() < 0.5) x += (rng() < 0.5 ? -1 : 1) * 32; else y += (rng() < 0.5 ? -1 : 1) * 32;
        c.lineTo(x, y);
      }
      c.stroke();
      c.fillStyle = s.trim;
      c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill();
    }
  },

  shatter(c, s, rng) {
    const pts = Array.from({ length: 26 }, () => [rng() * SIZE, rng() * SIZE]);
    for (const [px, py] of pts) {
      c.beginPath();
      const n = 5 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rng() * 0.4;
        const r = 40 + rng() * 70;
        const x = px + Math.cos(a) * r, y = py + Math.sin(a) * r;
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.closePath();
      c.fillStyle = rng() < 0.5 ? s.secondary : mix(s.primary, s.trim, 0.25);
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 2; c.stroke();
    }
    PAINT.panel(c, s, rng);
  },

  flames(c, s, rng) {
    PAINT.panel(c, s, rng);
    for (let i = 0; i < 14; i++) {
      const baseY = SIZE * 0.55 + rng() * SIZE * 0.4;
      const x0 = rng() * SIZE;
      c.beginPath();
      c.moveTo(x0, baseY);
      const h = 90 + rng() * 180;
      c.bezierCurveTo(x0 + 40, baseY - h * 0.4, x0 - 30, baseY - h * 0.7, x0 + 12, baseY - h);
      c.bezierCurveTo(x0 + 46, baseY - h * 0.6, x0 + 60, baseY - h * 0.3, x0 + 62, baseY);
      c.closePath();
      const g = c.createLinearGradient(0, baseY, 0, baseY - h);
      g.addColorStop(0, s.trim); g.addColorStop(1, s.secondary);
      c.fillStyle = g; c.fill();
    }
  },
};

/** Build (and cache) the albedo + roughness maps for a skin id. */
export function skinMaterialMaps(skinId) {
  const id = SKIN_BY_ID[skinId] ? skinId : DEFAULT_SKIN;
  if (cache.has(id)) {
    // Refresh insertion order so a skin in active use is not evicted.
    const hit = cache.get(id);
    cache.delete(id);
    cache.set(id, hit);
    return hit;
  }
  const s = SKIN_BY_ID[id];
  const rng = makeRng(hashStr(id));

  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const c = cv.getContext('2d');
  c.fillStyle = s.primary;
  c.fillRect(0, 0, SIZE, SIZE);
  (PAINT[s.pattern] || PAINT.panel)(c, s, rng);

  if (s.wear > 0) {
    for (let i = 0; i < 340; i++) {
      c.fillStyle = `rgba(20,16,12,${rng() * 0.3 * s.wear})`;
      c.beginPath(); c.arc(rng() * SIZE, rng() * SIZE, rng() * 16 + 1, 0, 7); c.fill();
    }
    for (let i = 0; i < 90; i++) {
      c.fillStyle = `rgba(210,200,190,${rng() * 0.22 * s.wear})`;
      c.fillRect(rng() * SIZE, rng() * SIZE, rng() * 22 + 2, 1.6);
    }
  }

  const map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;

  // Roughness: the pattern's luminance jitter doubles as surface variation.
  const rc = document.createElement('canvas');
  rc.width = rc.height = 256;
  const r2 = rc.getContext('2d');
  const base = Math.round(s.rough * 255);
  r2.fillStyle = `rgb(${base},${base},${base})`;
  r2.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 700; i++) {
    const v = Math.max(0, Math.min(255, base + (rng() - 0.5) * 120));
    r2.fillStyle = `rgba(${v},${v},${v},0.5)`;
    r2.fillRect(rng() * 256, rng() * 256, rng() * 16 + 2, rng() * 16 + 2);
  }
  const roughMap = new THREE.CanvasTexture(rc);
  roughMap.wrapS = roughMap.wrapT = THREE.RepeatWrapping;

  const out = { map, roughMap, skin: s };
  cache.set(id, out);
  evictOldestSkins();
  return out;
}

/** Full material set for a mech: hull, dark trim, accent glow, glass. */
export function skinMaterials(skinId, teamColor = null) {
  const { map, roughMap, skin } = skinMaterialMaps(skinId);
  const hull = new THREE.MeshStandardMaterial({
    map, roughnessMap: roughMap, metalness: skin.metal, roughness: 1.0,
    envMapIntensity: skin.irid ? 1.9 : 1.15,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: new THREE.Color(skin.secondary).multiplyScalar(0.7),
    metalness: Math.min(1, skin.metal + 0.15), roughness: Math.max(0.12, skin.rough * 0.8),
  });
  const trim = new THREE.MeshStandardMaterial({
    color: new THREE.Color(skin.trim),
    metalness: skin.metal, roughness: Math.max(0.1, skin.rough * 0.6),
  });
  const accentColor = teamColor != null ? new THREE.Color(teamColor) : new THREE.Color(skin.trim);
  const accent = new THREE.MeshStandardMaterial({
    color: accentColor, emissive: accentColor, emissiveIntensity: 2.4,
    metalness: 0.2, roughness: 0.4,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x0b1a24, emissive: accentColor, emissiveIntensity: 0.55,
    metalness: 1.0, roughness: 0.08, transparent: true, opacity: 0.85,
  });
  // Progressive damage states. Swapping a section's material is far cheaper
  // than a per-vertex damage channel and reads clearly at combat distance:
  // scorched plating, then glowing exposed structure.
  const hullDamaged = hull.clone();
  hullDamaged.color = new THREE.Color(0x6b5f55);
  hullDamaged.roughness = 1.0;
  hullDamaged.metalness = Math.max(0.25, skin.metal * 0.55);

  const hullCritical = hull.clone();
  hullCritical.color = new THREE.Color(0x3a2a22);
  hullCritical.roughness = 1.0;
  hullCritical.metalness = 0.3;
  hullCritical.emissive = new THREE.Color(0xff4a1f);
  hullCritical.emissiveIntensity = 0.55;

  return { hull, hullDamaged, hullCritical, dark, trim, accent, glass, skin };
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function disposeSkinCache() {
  for (const { map, roughMap } of cache.values()) { map.dispose(); roughMap.dispose(); }
  cache.clear();
}
