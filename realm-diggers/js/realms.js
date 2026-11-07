'use strict';
// ============================================================
// The 10 realms: terrain generators + look & feel
// ============================================================

// ---------- generation helpers ----------
function gset(c, x, y, z, id) { if (y >= 0 && y < HEIGHT) c.blocks[(y << 8) | (z << 4) | x] = id; }
function gget(c, x, y, z) { return (y >= 0 && y < HEIGHT) ? c.blocks[(y << 8) | (z << 4) | x] : 0; }
// world-coordinate set, clipped to this chunk. mode 1 = only into air/replaceable
function wset(c, wx, y, wz, id, mode) {
  const lx = wx - c.cx * 16, lz = wz - c.cz * 16;
  if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 0 || y >= HEIGHT) return;
  const i = (y << 8) | (lz << 4) | lx;
  if (mode === 1 && c.blocks[i] !== 0 && !REPL[c.blocks[i]] && !LEAF[c.blocks[i]]) return;
  if (mode === 2 && c.blocks[i] !== 0) return;
  c.blocks[i] = id;
}
function inChunk(c, wx, wz) { const lx = wx - c.cx * 16, lz = wz - c.cz * 16; return lx >= 0 && lx < 16 && lz >= 0 && lz < 16; }
// jittered grid of feature candidates overlapping this chunk (+margin)
function forCells(c, cell, margin, salt, seed, fn) {
  const x0 = c.cx * 16 - margin, x1 = c.cx * 16 + 15 + margin, z0 = c.cz * 16 - margin, z1 = c.cz * 16 + 15 + margin;
  for (let gz = Math.floor(z0 / cell); gz <= Math.floor(z1 / cell); gz++)
    for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) {
      const wx = gx * cell + Math.floor(ihash(gx, salt, gz, seed) * cell);
      const wz = gz * cell + Math.floor(ihash(gx, salt + 1, gz, seed) * cell);
      if (wx < x0 || wx > x1 || wz < z0 || wz > z1) continue;
      fn(wx, wz, ihash(gx, salt + 2, gz, seed), mulberry32((ihash(gx, salt + 3, gz, seed) * 4294967296) >>> 0));
    }
}
function placeOres(c, seed, ores, host) {
  const rnd = mulberry32((ihash(c.cx, 777, c.cz, seed) * 4294967296) >>> 0);
  for (const o of ores) {
    let tries = Math.floor(o.tries); if (rnd() < o.tries - tries) tries++;
    for (let t = 0; t < tries; t++) {
      let x = Math.floor(rnd() * 16), z = Math.floor(rnd() * 16), y = o.min + Math.floor(rnd() * (o.max - o.min));
      const n = 1 + Math.floor(rnd() * o.size);
      for (let k = 0; k < n; k++) {
        if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < HEIGHT) {
          const i = (y << 8) | (z << 4) | x;
          if (host[c.blocks[i]]) c.blocks[i] = o.id;
        }
        x += Math.floor(rnd() * 3) - 1; y += Math.floor(rnd() * 3) - 1; z += Math.floor(rnd() * 3) - 1;
      }
    }
  }
}
function hostSet(...keys) { const h = new Uint8Array(256); for (const k of keys) h[B[k]] = 1; return h; }

// Low-res sampled 3D cave noise, trilinear-interpolated. top[i] = carve below this y.
function carveCaves(c, G, top, o) {
  const SX = 5, SY = 33, SZ = 5, bx = c.cx * 16, bz = c.cz * 16;
  const A = new Float32Array(SX * SY * SZ), Bn = new Float32Array(SX * SY * SZ), Cn = new Float32Array(SX * SY * SZ);
  const s = o.scale || 0.028;
  for (let iz = 0; iz < SZ; iz++) for (let iy = 0; iy < SY; iy++) for (let ix = 0; ix < SX; ix++) {
    const x = bx + ix * 4, y = iy * 4, z = bz + iz * 4, k = (iz * SY + iy) * SX + ix;
    A[k] = G.c1.noise3(x * s, y * s * 1.5, z * s);
    Bn[k] = G.c2.noise3(x * s, y * s * 1.5, z * s);
    Cn[k] = G.c3.noise3(x * s * 0.6, y * s * 1.1, z * s * 0.6);
  }
  const lerp3 = (arr, x, y, z) => {
    const ix = x >> 2, iy = y >> 2, iz = z >> 2, fx = (x & 3) / 4, fy = (y & 3) / 4, fz = (z & 3) / 4;
    const k = (iz * SY + iy) * SX + ix;
    const c00 = arr[k] + (arr[k + 1] - arr[k]) * fx, c10 = arr[k + SX] + (arr[k + SX + 1] - arr[k + SX]) * fx;
    const k2 = k + SX * SY;
    const c01 = arr[k2] + (arr[k2 + 1] - arr[k2]) * fx, c11 = arr[k2 + SX] + (arr[k2 + SX + 1] - arr[k2 + SX]) * fx;
    const c0 = c00 + (c10 - c00) * fy, c1 = c01 + (c11 - c01) * fy;
    return c0 + (c1 - c0) * fz;
  };
  const thr = o.thr || 0.0065, cav = o.cavern || 0.62, minY = o.minY || 1, carvable = o.host;
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const tmax = Math.min(top[z * 16 + x], 124);
    for (let y = minY; y < tmax; y++) {
      const i = (y << 8) | (z << 4) | x;
      if (!carvable[c.blocks[i]]) continue;
      const a = lerp3(A, x, y, z), b = lerp3(Bn, x, y, z);
      if (a * a + b * b < thr || lerp3(Cn, x, y, z) > cav) {
        c.blocks[i] = (o.liquidY && y <= o.liquidY) ? o.liquid : 0;
      }
    }
  }
}

// ---------- shared feature builders ----------
function leafBlob(c, x, y, z, r, id, rnd, flat = 1) {
  for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const d = dx * dx + (dy * dy) / flat + dz * dz;
    if (d <= r * r + 0.5 && !(d > r * r - 1 && rnd() < 0.35)) wset(c, x + dx, y + dy, z + dz, id, 1);
  }
}
function treeOak(c, x, y, z, rnd, log, leaves) {
  const h = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < h; i++) wset(c, x, y + i, z, log, 0);
  for (let dy = -2; dy <= 1; dy++) {
    const r = dy >= 0 ? 1 : 2;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) === r && Math.abs(dz) === r && (dy === 1 || rnd() < 0.5)) continue;
      wset(c, x + dx, y + h + dy, z + dz, leaves, 1);
    }
  }
  wset(c, x, y + h + 1, z, leaves, 1);
}
function treePine(c, x, y, z, rnd, log, leaves) {
  const h = 6 + Math.floor(rnd() * 4);
  for (let i = 0; i < h; i++) wset(c, x, y + i, z, log, 0);
  let r = 0;
  for (let i = h + 1; i >= 2; i--) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (Math.abs(dx) + Math.abs(dz) <= r + (r > 1 ? 0 : 1)) wset(c, x + dx, y + i, z + dz, leaves, 1);
    r = (h + 1 - i) % 3 === 2 ? 1 : Math.min(r + 1, 3);
  }
}
function treePalm(c, x, y, z, rnd) {
  const h = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < h; i++) wset(c, x, y + i, z, B.palm_log, 0);
  const t = y + h;
  wset(c, x, t, z, B.palm_leaves, 1);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let k = 1; k <= 3; k++) wset(c, x + dx * k, t - (k === 3 ? 1 : 0), z + dz * k, B.palm_leaves, 1);
  }
  for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) wset(c, x + dx, t, z + dz, B.palm_leaves, 1);
}

// ============================================================
// Villages: a plaza with a well, houses, farms and paths.
// Placement is deterministic per 170-block cell, so every chunk agrees.
// ============================================================
const VILLAGE_CELL = 170;
const VILLAGE_THEMES = {
  oak: { found: 'cobble', floor: 'planks', wall: 'planks', corner: 'oak_log', roofs: ['bricks', 'paint_red', 'paint_blue', 'stone_bricks', 'paint_green'], path: 'gravel', farm: 'grass', crop: 'berry_bush' },
  desert: { found: 'sandstone', floor: 'sandstone', wall: 'sandstone', corner: 'oak_log', roofs: ['paint_orange', 'paint_yellow', 'bricks'], path: 'gravel', farm: 'grass', crop: 'berry_bush' },
  snow: { found: 'cobble', floor: 'planks', wall: 'planks', corner: 'pine_log', roofs: ['snow', 'stone_bricks', 'paint_blue'], path: 'gravel', farm: 'grass', crop: 'berry_bush' },
  ice: { found: 'packed_ice', floor: 'planks', wall: 'packed_ice', corner: 'blue_ice', roofs: ['snow', 'paint_white'], path: 'gravel', farm: 'grass', crop: 'berry_bush' },
  candy: { found: 'chocolate', floor: 'chocolate', wall: 'cake', corner: 'candy_cane', roofs: ['icing', 'lolli_red', 'lolli_blue', 'paint_pink'], path: 'chocolate', farm: 'frosting', crop: 'gumdrop' },
  jungle: { found: 'mud', floor: 'planks', wall: 'mud', corner: 'jungle_log', roofs: ['jungle_leaves'], path: 'gravel', farm: 'jungle_grass', crop: 'berry_bush' },
};
const _villages = new WeakMap();
function villageCenter(G, realm, gx, gz) {
  const V = realm.village; if (!V) return null;
  let m = _villages.get(G); if (!m) { m = new Map(); _villages.set(G, m); }
  const k = gx * 100003 + gz;
  if (m.has(k)) return m.get(k);
  let v = null;
  if (ihash(gx, 901, gz, G.seed) < (gx === 0 && gz === 0 ? 1 : V.chance)) {
    for (let t = 0; t < 12 && !v; t++) {
      const x = gx * VILLAGE_CELL + 30 + Math.floor(ihash(gx, 910 + t, gz, G.seed) * (VILLAGE_CELL - 60));
      const z = gz * VILLAGE_CELL + 30 + Math.floor(ihash(gx, 930 + t, gz, G.seed) * (VILLAGE_CELL - 60));
      const col = V.column(G, x, z);
      if (!col.ok) continue;
      let lo = col.h, hi = col.h, ok = true;
      for (let a = 0; a < 8 && ok; a++) {
        const s = V.column(G, Math.round(x + Math.cos(a * 0.785) * 15), Math.round(z + Math.sin(a * 0.785) * 15));
        if (!s.ok) ok = false; lo = Math.min(lo, s.h); hi = Math.max(hi, s.h);
      }
      if (ok && hi - lo <= 8) v = { x, z, h: col.h, theme: col.theme, seed: (ihash(gx, 950, gz, G.seed) * 4294967296) >>> 0, key: realm.key + ':' + gx + ',' + gz };
    }
  }
  m.set(k, v);
  return v;
}
function villagesNear(G, realm, x, z, r) {
  if (!realm.village) return [];
  const out = [];
  for (let gz = Math.floor((z - r) / VILLAGE_CELL); gz <= Math.floor((z + r) / VILLAGE_CELL); gz++)
    for (let gx = Math.floor((x - r) / VILLAGE_CELL); gx <= Math.floor((x + r) / VILLAGE_CELL); gx++) {
      const v = villageCenter(G, realm, gx, gz);
      if (v && Math.hypot(v.x - x, v.z - z) <= r) out.push(v);
    }
  return out;
}
const nearVillage = (G, realm, x, z, r) => villagesNear(G, realm, x, z, r).length > 0;
function villageLayout(G, realm, v) {
  if (v.layout) return v.layout;
  const rnd = mulberry32(v.seed), V = realm.village, P = VILLAGE_THEMES[v.theme];
  const n = 5 + Math.floor(rnd() * 3), a0 = rnd() * Math.PI * 2, items = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + i * (Math.PI * 2 / n) + (rnd() - .5) * 0.25, r = 13 + rnd() * 3;
    const x = Math.round(v.x + Math.cos(a) * r), z = Math.round(v.z + Math.sin(a) * r);
    const dx = v.x - x, dz = v.z - z;
    const side = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'E' : 'W') : (dz > 0 ? 'S' : 'N');
    const col = V.column(G, x, z);
    items.push({ type: (i === 1 || i === 5) ? 'farm' : 'house', x, z, h: col.h, ok: col.ok && Math.abs(col.h - v.h) <= 6, side, roof: P.roofs[Math.floor(rnd() * P.roofs.length)] });
  }
  v.layout = items;
  return items;
}
function buildVillages(c, G, realm) {
  for (const v of villagesNear(G, realm, c.cx * 16 + 8, c.cz * 16 + 8, 36)) buildVillage(c, G, realm, v);
}
function buildVillage(c, G, realm, v) {
  const V = realm.village, P = VILLAGE_THEMES[v.theme], id = k => B[k];
  const colH = (x, z) => V.column(G, x, z).h;
  const touches = (x, z, r) => !(x + r < c.cx * 16 || x - r > c.cx * 16 + 15 || z + r < c.cz * 16 || z - r > c.cz * 16 + 15);
  // flatten ground under a footprint to height fy and clear above it
  const pad = (x, z, half, fy, top, clearTo) => {
    for (let dz = -half; dz <= half; dz++) for (let dx = -half; dx <= half; dx++) {
      const X = x + dx, Z = z + dz;
      if (!inChunk(c, X, Z)) continue;
      const ch = colH(X, Z);
      for (let y = Math.min(ch, fy - 1); y < fy; y++) wset(c, X, y, Z, id(P.found), 0);
      wset(c, X, fy, Z, top, 0);
      for (let y = fy + 1; y <= Math.max(ch + 1, fy + clearTo); y++) wset(c, X, y, Z, 0, 0);
    }
  };
  const h = v.h;
  if (touches(v.x, v.z, 6)) {
    pad(v.x, v.z, 5, h, id(P.path), 5);
    for (let dz = -2; dz <= 1; dz++) for (let dx = -2; dx <= 1; dx++) {
      const X = v.x + dx, Z = v.z + dz, edge = dx === -2 || dx === 1 || dz === -2 || dz === 1;
      if (edge) { wset(c, X, h, Z, id(P.found), 0); wset(c, X, h + 1, Z, id(P.found), 0); }
      else for (let y = h - 3; y <= h; y++) wset(c, X, y, Z, B.water, 0);
      wset(c, X, h + 4, Z, id(P.roofs[0]), 0);
    }
    for (const [dx, dz] of [[-2, -2], [1, -2], [-2, 1], [1, 1]]) for (let y = h + 2; y <= h + 3; y++) wset(c, v.x + dx, y, v.z + dz, id(P.corner), 0);
    for (const [dx, dz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) { for (let y = h + 1; y <= h + 3; y++) wset(c, v.x + dx, y, v.z + dz, id(P.corner), 0); wset(c, v.x + dx, h + 4, v.z + dz, B.lantern, 0); }
  }
  for (const it of villageLayout(G, realm, v)) {
    if (!it.ok) continue;
    // path from the plaza to the building
    const dx = it.x - v.x, dz = it.z - v.z, dist = Math.hypot(dx, dz);
    if (touches((it.x + v.x) / 2, (it.z + v.z) / 2, dist / 2 + 2)) for (let t = 6; t < dist - 3; t += 0.5) {
      const X = Math.round(v.x + dx * t / dist), Z = Math.round(v.z + dz * t / dist);
      if (!inChunk(c, X, Z)) continue;
      const ph = colH(X, Z);
      wset(c, X, ph, Z, id(P.path), 0); wset(c, X, ph + 1, Z, 0, 0); wset(c, X, ph + 2, Z, 0, 0);
    }
    if (!touches(it.x, it.z, 5)) continue;
    const fy = it.h;
    if (it.type === 'farm') {
      pad(it.x, it.z, 3, fy, id(P.farm), 4);
      for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
        const X = it.x + a, Z = it.z + b;
        if (Math.abs(a) === 3 || Math.abs(b) === 3) wset(c, X, fy, Z, id(P.corner), 0);
        else if (b === 0) wset(c, X, fy, Z, B.water, 0);
        else wset(c, X, fy + 1, Z, id(P.crop), 0);
      }
      continue;
    }
    // house: 7x7, door facing the plaza
    const rot = { S: (a, b) => [a, b], N: (a, b) => [-a, -b], E: (a, b) => [b, -a], W: (a, b) => [-b, a] }[it.side];
    const local = new Map();
    const at = (a, b, y, block) => { const [rx, rz] = rot(a, b); local.set(rx + ',' + y + ',' + rz, block); };
    pad(it.x, it.z, 3, fy, id(P.floor), 8);
    for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
      const edge = Math.abs(a) === 3 || Math.abs(b) === 3, corner = Math.abs(a) === 3 && Math.abs(b) === 3;
      for (let y = fy + 1; y <= fy + 3; y++) if (edge) at(a, b, y, corner ? id(P.corner) : id(P.wall));
      for (let k = 0; k < 4; k++) if (Math.abs(a) <= 3 - k && Math.abs(b) <= 3 - k) at(a, b, fy + 4 + k, id(it.roof));
    }
    at(0, 3, fy + 1, 0); at(0, 3, fy + 2, 0);
    at(-3, 0, fy + 2, B.glass); at(3, 0, fy + 2, B.glass); at(0, -3, fy + 2, B.glass);
    at(-2, -2, fy + 1, B.bed); at(2, -2, fy + 1, B.workbench); at(1, -2, fy + 1, B.furnace); at(0, 0, fy + 3, B.lantern);
    for (const [k, block] of local) { const [lx, y, lz] = k.split(',').map(Number); wset(c, it.x + lx, y, it.z + lz, block, 0); }
  }
}

// ============================================================
// Realm definitions
// ============================================================
const OCEAN = 0, FROZEN = 1, BEACH = 2, PEAK = 3, MOUNTAIN = 4, SNOWY = 5, DESERT = 6, FOREST = 7, PLAINS = 8;

const REALMS = [];
const REALM = {};
function realm(def) {
  def.index = REALMS.length;
  REALMS.push(def); REALM[def.key] = def;
  return def;
}
function makeG(seed, salt) {
  const s = (seed ^ Math.imul(salt + 1, 0x9E3779B1)) >>> 0;
  const n = []; for (let i = 0; i < 9; i++) n.push(new Noise(s + i * 1013));
  return { seed: s, n, c1: new Noise(s + 50001), c2: new Noise(s + 50002), c3: new Noise(s + 50003) };
}

// ---------------------------------------------------------------- 1. Greenhollow
const GH_SEA = 48;
function ghColumn(G, x, z) {
  const cont = fbm2(G.n[0], x * 0.0021 + 13.1, z * 0.0021 - 7.7, 4);
  const hills = fbm2(G.n[1], x * 0.011, z * 0.011, 3);
  const r = ridge2(G.n[2], x * 0.0055, z * 0.0055, 4);
  const mMask = smoothstep(-0.05, 0.45, cont);
  let h = 52 + cont * 15 + hills * 5 + Math.pow(r, 2.6) * 60 * mMask;
  const riv = Math.abs(G.n[5].noise2(x * 0.0028, z * 0.0028));
  if (riv < 0.04 && h < 76 && h > GH_SEA - 4) h = lerp(GH_SEA - 3, h, smoothstep(0, 0.04, riv));
  h = Math.floor(clamp(h, 8, 116));
  const temp = G.n[3].noise2(x * 0.0034 + 31, z * 0.0034 + 17) - (h > 82 ? (h - 82) * 0.012 : 0);
  const moist = G.n[4].noise2(x * 0.004 - 11, z * 0.004 + 5);
  let bio;
  if (h < GH_SEA - 1) bio = temp < -0.32 ? FROZEN : OCEAN;
  else if (h <= GH_SEA + 1 && temp >= -0.32) bio = BEACH;
  else if (h > 94) bio = PEAK;
  else if (h > 82) bio = MOUNTAIN;
  else if (temp < -0.32) bio = SNOWY;
  else if (temp > 0.3 && moist < 0.1) bio = DESERT;
  else if (moist > 0.1) bio = FOREST;
  else bio = PLAINS;
  return { h, bio };
}
const GH_HOST = hostSet('stone');
const GH_CARVE = hostSet('stone', 'dirt', 'grass', 'sand', 'gravel', 'sandstone', 'clay', 'coal_ore', 'copper_ore', 'iron_ore', 'gold_ore', 'grass_snow', 'snow');

realm({
  key: 'greenhollow', name: 'Greenhollow', color: '#5fbf4a', gem: null,
  tagline: 'Your home world',
  desc: 'Rolling meadows, forests, deserts, snowy peaks, deep caves full of ore, and villages with friendly traders.',
  how: 'You start here. Step on any Realm Gate to come back home.',
  hint: 'Home sweet home.',
  sky: { mode: 'cycle', day: ['#5a9cf0', '#bfe0ff'], night: ['#04060f', '#111a30'], sunset: '#ff9a5a', stars: 1, sun: 1, moon: 1, clouds: 1, cloudY: 118, cloudColor: '#ffffff' },
  ambient: 0.05, sunMin: 0.2, gravity: 1, weather: 'rain', platform: 'cobble', spawnXZ: [0, 0], spawnMode: 'top',
  music: { root: 60, scale: [0, 2, 4, 7, 9], tempo: 0.42, wave: 'triangle' },
  village: { chance: 0.75, column(G, x, z) { const c = ghColumn(G, x, z); return { h: c.h, ok: [PLAINS, FOREST, DESERT, SNOWY].includes(c.bio) && c.h > GH_SEA + 1 && c.h < 84, theme: c.bio === DESERT ? 'desert' : c.bio === SNOWY ? 'snow' : 'oak' }; } },
  mobs: ['fluffalo', 'boar', 'bunny', 'gloomling', 'spitter', 'shimmerwing', 'bramble_fox', 'shade_bat', 'golden_hopbun', 'modling'], tier: 0,
  makeGen: seed => makeG(seed, 0),
  gen(c, G) {
    const bx = c.cx * 16, bz = c.cz * 16, s = G.seed, bl = c.blocks;
    const H = new Int16Array(256), BIO = new Uint8Array(256), TOP = new Int16Array(256);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) { const col = ghColumn(G, bx + x, bz + z); H[z * 16 + x] = col.h; BIO[z * 16 + x] = col.bio; }
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const i = z * 16 + x, h = H[i], bio = BIO[i], wx = bx + x, wz = bz + z;
      let top = B.grass, fill = B.dirt, depth = 3;
      if (bio === OCEAN || bio === FROZEN) { const n = G.n[6].noise2(wx * 0.05, wz * 0.05); top = n > 0.35 ? B.gravel : (n < -0.5 ? B.clay : B.sand); fill = B.sand; }
      else if (bio === BEACH) { top = B.sand; fill = B.sand; }
      else if (bio === DESERT) { top = B.sand; fill = B.sand; depth = 4; }
      else if (bio === SNOWY) top = B.grass_snow;
      else if (bio === PEAK) { top = B.snow; fill = B.stone; }
      else if (bio === MOUNTAIN) { if (G.n[6].noise2(wx * 0.08, wz * 0.08) > 0) { top = B.stone; fill = B.stone; } }
      const cracked = ihash(wx, 0, wz, s) < 0.035;
      bl[(z << 4) | x] = cracked ? B.cracked_worldstone : B.worldstone;
      const yMax = Math.max(h, GH_SEA);
      for (let y = 1; y <= yMax; y++) {
        let id;
        if (!cracked && y <= 3 && ihash(wx, y, wz, s + 7) < (4 - y) * 0.22) id = B.worldstone;
        else if (y < h - depth) id = (bio === DESERT && y >= h - depth - 3) ? B.sandstone : B.stone;
        else if (y < h) id = fill;
        else if (y === h) id = top;
        else id = (y === GH_SEA && (bio === FROZEN || bio === SNOWY)) ? B.ice : B.water;
        bl[(y << 8) | (z << 4) | x] = id;
      }
      const entrance = h > GH_SEA + 3 && G.n[7].noise2(wx * 0.018, wz * 0.018) > 0.62;
      TOP[i] = entrance ? h + 1 : (h <= GH_SEA + 2 ? h - 9 : h - 5);
    }
    placeOres(c, s, [
      { id: B.coal_ore, min: 5, max: 110, tries: 14, size: 8 },
      { id: B.copper_ore, min: 10, max: 70, tries: 6, size: 6 },
      { id: B.iron_ore, min: 5, max: 64, tries: 9, size: 6 },
      { id: B.gold_ore, min: 3, max: 32, tries: 3, size: 5 },
      { id: B.ruby_ore, min: 2, max: 18, tries: 1.6, size: 4 },
      { id: B.sapphire_ore, min: 2, max: 24, tries: 1.6, size: 4 },
      { id: B.mod_geode, min: 2, max: 45, tries: 0.5, size: 1 },
      { id: B.fossil_block, min: 5, max: 36, tries: 0.7, size: 2 },
    ], GH_HOST);
    carveCaves(c, G, TOP, { host: GH_CARVE, liquidY: 10, liquid: B.lava });
    // surface plants
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const i = z * 16 + x, h = H[i], bio = BIO[i], wx = bx + x, wz = bz + z;
      if (h >= HEIGHT - 2) continue;
      const g = bl[(h << 8) | (z << 4) | x], above = (h + 1 << 8) | (z << 4) | x;
      if (bl[above] !== 0) continue;
      const r = ihash(wx, 2, wz, s);
      if (g === B.grass) {
        if (bio === FOREST) { if (r < 0.22) bl[above] = B.tall_grass; else if (r < 0.27) bl[above] = [B.flower_red, B.flower_yellow, B.flower_blue][Math.floor(r * 1000) % 3]; else if (r < 0.28) bl[above] = B.mushroom_red; else if (r < 0.288) bl[above] = B.berry_bush; }
        else if (bio === PLAINS) { if (r < 0.2) bl[above] = B.tall_grass; else if (r < 0.26) bl[above] = [B.flower_red, B.flower_yellow, B.flower_blue][Math.floor(r * 1000) % 3]; else if (r < 0.265) bl[above] = B.berry_bush; }
        else if (r < 0.06) bl[above] = B.tall_grass;
      } else if (g === B.grass_snow && r < 0.04) bl[above] = B.tall_grass;
      else if (g === B.sand && bio === DESERT) {
        if (r < 0.011) { const ch = 1 + Math.floor(ihash(wx, 3, wz, s) * 3); for (let k = 1; k <= ch; k++) gset(c, x, h + k, z, B.cactus); }
        else if (r < 0.025) bl[above] = B.dead_bush;
      } else if (g === B.sand && bio === BEACH && r < 0.012) bl[above] = B.conch_block;
    }
    // trees
    forCells(c, 5, 3, 11, s, (wx, wz, h, rnd) => {
      if (nearVillage(G, this, wx, wz, 26)) return;
      const col = ghColumn(G, wx, wz);
      if (col.h <= GH_SEA + 1 || col.h > 110) return;
      const ch = { [FOREST]: 0.78, [PLAINS]: 0.07, [SNOWY]: 0.3, [MOUNTAIN]: 0.1, [BEACH]: 0.04 }[col.bio] || 0;
      if (h > ch) return;
      if (inChunk(c, wx, wz)) { const g = gget(c, wx - bx, col.h, wz - bz); if (g !== B.grass && g !== B.grass_snow && g !== B.stone && g !== B.sand) return; }
      if (col.bio === BEACH) treePalm(c, wx, col.h + 1, wz, rnd);
      else if (col.bio === SNOWY || col.bio === MOUNTAIN) treePine(c, wx, col.h + 1, wz, rnd, B.pine_log, B.pine_leaves);
      else if (col.bio === FOREST && rnd() < 0.35) treeOak(c, wx, col.h + 1, wz, rnd, B.birch_log, B.birch_leaves);
      else treeOak(c, wx, col.h + 1, wz, rnd, B.oak_log, B.oak_leaves);
    });
    // occasional surface lava pools
    forCells(c, 72, 5, 31, s, (wx, wz, h, rnd) => {
      if (h > 0.3 || nearVillage(G, this, wx, wz, 34)) return;
      const col = ghColumn(G, wx, wz);
      if (col.h <= GH_SEA + 3 || (col.bio !== PLAINS && col.bio !== DESERT && col.bio !== MOUNTAIN)) return;
      const r = 2 + rnd() * 2, lvl = col.h;
      for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.hypot(dx, dz); if (d > r) continue;
        const X = wx + dx, Z = wz + dz; if (!inChunk(c, X, Z)) continue;
        for (let y = lvl - 1; y <= lvl; y++) wset(c, X, y, Z, d > r - 0.8 && y === lvl ? B.stone : B.lava, 0);
        for (let y = lvl + 1; y < lvl + 6; y++) wset(c, X, y, Z, 0, 0);
      }
    });
    buildVillages(c, G, this);
  },
});

// ---------------------------------------------------------------- 2. Emberdeep
const EM_LAVA = 34;
const EM_HOST = hostSet('ashstone');
realm({
  key: 'emberdeep', name: 'Emberdeep', color: '#ff6a2a', gem: 'fire_opal',
  tagline: 'Land of lava and ash',
  desc: 'Glowing lava seas, ashstone spires, cinder trees and Fire Opal hidden in the rock.',
  how: 'Craft an Ember Key (2 Gold Ingots + 4 Coal at a Workbench). Hold it and jump into lava!',
  hint: 'Something glowing hot... and a key.',
  sky: { mode: 'fixed', time: 0.25, day: ['#2a0805', '#c04a1c'], stars: 0, sun: 0, clouds: 0 },
  ambient: 0.32, sunMin: 0.6, sunTint: [1, 0.72, 0.6], gravity: 1, weather: 'embers', platform: 'obsidian', spawnXZ: [0, 0], spawnMode: 'top',
  fogScale: 0.75,
  music: { root: 45, scale: [0, 1, 4, 5, 7, 8, 10], tempo: 0.55, wave: 'sawtooth' },
  mobs: ['cinder_slime', 'fire_imp', 'ember_beetle', 'cinder_golem', 'emberling', 'modling'], tier: 1,
  makeGen: seed => makeG(seed, 1),
  gen(c, G) {
    const bx = c.cx * 16, bz = c.cz * 16, s = G.seed, bl = c.blocks, TOP = new Int16Array(256), H = new Int16Array(256);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = bx + x, wz = bz + z;
      const base = 44 + fbm2(G.n[0], wx * 0.008, wz * 0.008, 4) * 16 + fbm2(G.n[1], wx * 0.03, wz * 0.03, 2) * 3;
      const spire = Math.pow(ridge2(G.n[2], wx * 0.012, wz * 0.012, 3), 6) * 46;
      const h = Math.floor(clamp(base + spire, 8, 120));
      H[z * 16 + x] = h; TOP[z * 16 + x] = h - 4;
      const mag = G.n[3].noise2(wx * 0.04, wz * 0.04);
      bl[(z << 4) | x] = B.worldstone;
      for (let y = 1; y <= Math.max(h, EM_LAVA); y++) {
        let id;
        if (y < h - 1) id = B.ashstone;
        else if (y <= h) {
          if (h <= EM_LAVA + 1) id = ihash(wx, y, wz, s) < 0.3 ? B.obsidian : B.ash;
          else if (mag > 0.55) id = B.magma;
          else if (y === h && h > EM_LAVA + 3) id = B.scorch_moss;
          else id = B.ash;
        } else id = B.lava;
        bl[(y << 8) | (z << 4) | x] = id;
      }
    }
    placeOres(c, s, [
      { id: B.ember_ore, min: 5, max: 70, tries: 6, size: 5 },
      { id: B.gold_ore, min: 5, max: 50, tries: 4, size: 5 },
      { id: B.coal_ore, min: 5, max: 90, tries: 5, size: 6 },
      { id: B.obsidian, min: 5, max: 40, tries: 2, size: 6 },
      { id: B.ruby_ore, min: 3, max: 30, tries: 1.4, size: 4 },
      { id: B.mod_geode, min: 3, max: 60, tries: 0.5, size: 1 },
    ], EM_HOST);
    carveCaves(c, G, TOP, { host: hostSet('ashstone', 'ember_ore', 'gold_ore', 'coal_ore'), thr: 0.005, liquidY: 18, liquid: B.lava });
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const h = H[z * 16 + x], wx = bx + x, wz = bz + z;
      if (h >= 126 || gget(c, x, h + 1, z) !== 0) continue;
      const g = gget(c, x, h, z), r = ihash(wx, 2, wz, s);
      if (g === B.scorch_moss && r < 0.05) gset(c, x, h + 1, z, B.ember_fungus);
      else if ((g === B.ash || g === B.scorch_moss) && r < 0.058) { const k = 1 + Math.floor(ihash(wx, 3, wz, s) * 4); for (let j = 1; j <= k; j++) gset(c, x, h + j, z, B.ember_crystal); }
    }
    forCells(c, 9, 3, 12, s, (wx, wz, h, rnd) => {
      if (h > 0.4) return;
      const base = 44 + fbm2(G.n[0], wx * 0.008, wz * 0.008, 4) * 16 + fbm2(G.n[1], wx * 0.03, wz * 0.03, 2) * 3;
      const spire = Math.pow(ridge2(G.n[2], wx * 0.012, wz * 0.012, 3), 6) * 46;
      const gh = Math.floor(clamp(base + spire, 8, 120));
      if (gh <= EM_LAVA + 3 || spire > 6) return;
      const th = 4 + Math.floor(rnd() * 4);
      for (let i = 1; i <= th; i++) wset(c, wx, gh + i, wz, B.char_log, 0);
      leafBlob(c, wx, gh + th + 1, wz, 2, B.ember_leaves, rnd, 0.6);
    });
  },
});

// ---------------------------------------------------------------- 3. Frostveil
const FV_SEA = 46;
const FV_HOST = hostSet('stone');
function fvHeight(G, x, z) {
  const r = ridge2(G.n[2], x * 0.006, z * 0.006, 3);
  return Math.floor(clamp(52 + fbm2(G.n[0], x * 0.006, z * 0.006, 4) * 14 + fbm2(G.n[1], x * 0.02, z * 0.02, 2) * 4 + Math.pow(r, 3) * 30, 10, 118));
}
realm({
  key: 'frostveil', name: 'Frostveil', color: '#8fe0ff', gem: 'glacite',
  tagline: 'The frozen frontier',
  desc: 'Snowfields, giant ice spikes, frozen seas and dancing auroras. Ice is slippery!',
  how: 'Build a frame of Ice blocks (inside: 2 wide, 3 tall), then use a Frost Crystal on the frame.',
  hint: 'A frame of something cold...',
  sky: { mode: 'fixed', time: 0.08, day: ['#14244e', '#8fb8e0'], stars: 0.7, aurora: 1, sun: 1, clouds: 0 },
  ambient: 0.12, sunMin: 0.78, sunTint: [0.88, 0.95, 1.08], gravity: 1, weather: 'snow', platform: 'packed_ice', spawnXZ: [0, 0], spawnMode: 'top',
  music: { root: 72, scale: [0, 2, 4, 7, 11], tempo: 0.7, wave: 'sine' },
  village: { chance: 0.6, column(G, x, z) { const h = fvHeight(G, x, z); return { h, ok: h > FV_SEA + 1 && h < 80, theme: 'ice' }; } },
  mobs: ['penguin', 'frost_wisp', 'yeti', 'frost_fox', 'tusker', 'modling'], tier: 1,
  makeGen: seed => makeG(seed, 2),
  gen(c, G) {
    const bx = c.cx * 16, bz = c.cz * 16, s = G.seed, bl = c.blocks, TOP = new Int16Array(256), H = new Int16Array(256);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = bx + x, wz = bz + z, h = fvHeight(G, wx, wz);
      H[z * 16 + x] = h; TOP[z * 16 + x] = h - 4;
      const blue = G.n[3].noise2(wx * 0.05, wz * 0.05) > 0.62;
      bl[(z << 4) | x] = B.worldstone;
      for (let y = 1; y <= Math.max(h, FV_SEA); y++) {
        let id;
        if (y < h - 2) id = B.stone;
        else if (y <= h) id = (h <= FV_SEA ? (y === h ? B.gravel : B.stone) : (blue && y === h ? B.blue_ice : B.snow));
        else id = y === FV_SEA ? B.ice : B.water;
        bl[(y << 8) | (z << 4) | x] = id;
      }
    }
    placeOres(c, s, [
      { id: B.glacite_ore, min: 5, max: 70, tries: 6, size: 4 },
      { id: B.sapphire_ore, min: 3, max: 40, tries: 3, size: 4 },
      { id: B.iron_ore, min: 5, max: 64, tries: 6, size: 6 },
      { id: B.coal_ore, min: 5, max: 100, tries: 7, size: 7 },
      { id: B.mod_geode, min: 3, max: 50, tries: 0.5, size: 1 },
    ], FV_HOST);
    carveCaves(c, G, TOP, { host: hostSet('stone', 'coal_ore', 'iron_ore', 'glacite_ore') });
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const h = H[z * 16 + x];
      if (h > FV_SEA && gget(c, x, h, z) === B.snow && ihash(bx + x, 2, bz + z, s) < 0.03 && gget(c, x, h + 1, z) === 0) gset(c, x, h + 1, z, B.tall_grass);
    }
    forCells(c, 14, 3, 13, s, (wx, wz, h, rnd) => {
      if (h > 0.3 || nearVillage(G, this, wx, wz, 28)) return;
      const gh = fvHeight(G, wx, wz); if (gh <= FV_SEA + 1) return;
      const sh = 7 + Math.floor(rnd() * 16), r0 = 1 + rnd() * 1.6;
      for (let y = 0; y < sh; y++) {
        const r = r0 * (1 - y / sh) + 0.3;
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dz * dz <= r * r) wset(c, wx + dx, gh + 1 + y, wz + dz, B.packed_ice, 0);
      }
    });
    forCells(c, 7, 3, 14, s, (wx, wz, h, rnd) => {
      if (h > 0.4 || nearVillage(G, this, wx, wz, 26)) return;
      const gh = fvHeight(G, wx, wz); if (gh <= FV_SEA + 1) return;
      treePine(c, wx, gh + 1, wz, rnd, B.pine_log, B.frost_leaves);
    });
    buildVillages(c, G, this);
  },
});

// ---------------------------------------------------------------- 4. Skyreach
const SK_HOST = hostSet('skystone');
function skColumn(G, x, z) {
  const out = { a: null, b: null };
  const m = fbm2(G.n[0], x * 0.012, z * 0.012, 4) - 0.16;
  if (m > 0) {
    const cy = 66 + G.n[1].noise2(x * 0.004, z * 0.004) * 14;
    out.a = [Math.floor(cy - m * 40 - Math.abs(G.n[3].noise2(x * 0.08, z * 0.08)) * 6), Math.floor(cy + m * 10 + fbm2(G.n[2], x * 0.05, z * 0.05, 2) * 2)];
  }
  const m2 = fbm2(G.n[4], x * 0.02 + 100, z * 0.02, 3) - 0.36;
  if (m2 > 0) {
    const cy = 100 + G.n[5].noise2(x * 0.006, z * 0.006) * 6;
    out.b = [Math.floor(cy - m2 * 24), Math.floor(cy + m2 * 8)];
  }
  return out;
}
realm({
  key: 'skyreach', name: 'Skyreach', color: '#ffd25a', gem: 'skyshard',
  tagline: 'Islands above the clouds',
  desc: 'Floating islands with golden trees, drifting over an endless sea of clouds. Do not fall!',
  how: 'In Greenhollow, build a tower and climb above the clouds (height 124 or more).',
  hint: 'Higher... higher... above the clouds.',
  sky: { mode: 'fixed', time: 0.2, day: ['#5f9cff', '#ffe2a8'], stars: 0, sun: 1, sunBig: 1, clouds: 0, cloudSea: 1, cloudColor: '#fff4dc' },
  ambient: 0.2, sunMin: 1, sunTint: [1.05, 1, 0.9], gravity: 0.85, weather: 'sparkles', platform: 'cloud', spawnXZ: [0, 0], spawnMode: 'top',
  voidBelow: true, fallOut: 'greenhollow',
  music: { root: 67, scale: [0, 2, 4, 6, 7, 9, 11], tempo: 0.5, wave: 'sine' },
  mobs: ['puffbird', 'storm_sprite', 'sky_whale', 'modling'], tier: 1,
  makeGen: seed => makeG(seed, 3),
  gen(c, G) {
    const bx = c.cx * 16, bz = c.cz * 16, s = G.seed, bl = c.blocks;
    const TOPS = new Int16Array(256).fill(-1);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = bx + x, wz = bz + z, col = skColumn(G, wx, wz);
      for (const isl of [col.a, col.b]) {
        if (!isl) continue;
        const [b0, t0] = isl;
        for (let y = Math.max(1, b0); y <= Math.min(124, t0); y++) bl[(y << 8) | (z << 4) | x] = y === t0 ? B.sky_grass : (y > t0 - 4 ? B.sky_soil : B.skystone);
        TOPS[z * 16 + x] = Math.max(TOPS[z * 16 + x], t0);
      }
      const cl = fbm2(G.n[6], wx * 0.02, wz * 0.02, 3);
      if (cl > 0.28) { const k = Math.floor((cl - 0.28) * 9); for (let y = 34 - k; y <= 34 + Math.floor(k / 2); y++) if (bl[(y << 8) | (z << 4) | x] === 0) bl[(y << 8) | (z << 4) | x] = B.cloud; }
    }
    placeOres(c, s, [
      { id: B.skyshard_ore, min: 20, max: 115, tries: 7, size: 4 },
      { id: B.gold_ore, min: 20, max: 115, tries: 4, size: 4 },
      { id: B.iron_ore, min: 20, max: 115, tries: 3, size: 4 },
      { id: B.coal_ore, min: 20, max: 115, tries: 3, size: 5 },
      { id: B.mod_geode, min: 20, max: 110, tries: 0.6, size: 1 },
    ], SK_HOST);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const t = TOPS[z * 16 + x]; if (t < 1 || t > 125) continue;
      if (gget(c, x, t, z) !== B.sky_grass || gget(c, x, t + 1, z) !== 0) continue;
      const r = ihash(bx + x, 2, bz + z, s);
      if (r < 0.12) gset(c, x, t + 1, z, B.tall_grass); else if (r < 0.17) gset(c, x, t + 1, z, B.sky_flower);
    }
    forCells(c, 8, 3, 15, s, (wx, wz, h, rnd) => {
      if (h > 0.4) return;
      const col = skColumn(G, wx, wz); const isl = col.b || col.a; if (!isl) return;
      const top = isl[1]; if (top - isl[0] < 3) return;
      const th = 4 + Math.floor(rnd() * 3);
      for (let i = 1; i <= th; i++) wset(c, wx, top + i, wz, B.skywood_log, 0);
      leafBlob(c, wx, top + th + 1, wz, 2, B.golden_leaves, rnd, 0.8);
    });
  },
});

// ---------------------------------------------------------------- 5. Hollow Deep
realm({
  key: 'hollowdeep', name: 'Hollow Deep', color: '#5ad8ff', gem: 'glowquartz',
  tagline: 'The endless cavern',
  desc: 'A world with no sky: giant glowing mushrooms, crystal caves and underground lakes. Bring torches!',
  how: 'Dig down to the very bottom of Greenhollow and break a glowing Cracked Worldstone (Iron Pickaxe or better).',
  hint: 'Dig... all... the... way... down.',
  sky: { mode: 'none', day: ['#06030c', '#0e0a1c'], stars: 0, sun: 0, clouds: 0 },
  ambient: 0.07, sunMin: 0, gravity: 1, weather: 'spores', platform: 'gloomstone', spawnXZ: [0, 0], spawnMode: 'bottom',
  hasCeiling: true, fogFar: 70,
  music: { root: 48, scale: [0, 2, 3, 7, 8], tempo: 0.8, wave: 'triangle' },
  mobs: ['gloomcrawler', 'glowbug', 'gloomling', 'shroomling', 'shade_bat', 'modling'], tier: 2,
  makeGen: seed => makeG(seed, 4),
  gen(c, G) {
    const bx = c.cx * 16, bz = c.cz * 16, s = G.seed, bl = c.blocks;
    for (let y = 0; y < HEIGHT; y++) for (let i = 0; i < 256; i++) bl[(y << 8) | i] = (y === 0 || y >= 125) ? B.worldstone : B.gloomstone;
    placeOres(c, s, [
      { id: B.glowquartz_ore, min: 5, max: 120, tries: 10, size: 5 },
      { id: B.iron_ore, min: 5, max: 120, tries: 8, size: 6 },
      { id: B.gold_ore, min: 5, max: 120, tries: 5, size: 5 },
      { id: B.ruby_ore, min: 5, max: 120, tries: 2.5, size: 4 },
      { id: B.sapphire_ore, min: 5, max: 120, tries: 2, size: 4 },
      { id: B.coal_ore, min: 5, max: 120, tries: 6, size: 7 },
      { id: B.mod_geode, min: 5, max: 120, tries: 0.9, size: 1 },
      { id: B.fossil_block, min: 5, max: 120, tries: 0.5, size: 2 },
    ], hostSet('gloomstone'));
    // big caverns: low-res density field
    const SX = 5, SY = 33, SZ = 5, D = new Float32Array(SX * SY * SZ);
    for (let iz = 0; iz < SZ; iz++) for (let iy = 0; iy < SY; iy++) for (let ix = 0; ix < SX; ix++) {
      const x = bx + ix * 4, y = iy * 4, z = bz + iz * 4;
      const bias = 0.2 - Math.pow((y - 62) / 52, 2) * 0.75;
      D[(iz * SY + iy) * SX + ix] = fbm3(G.c1, x * 0.02, y * 0.032, z * 0.02, 2) + bias;
    }
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) for (let y = 2; y < 122; y++) {
      const ix = x >> 2, iy = y >> 2, iz = z >> 2, fx = (x & 3) / 4, fy = (y & 3) / 4, fz = (z & 3) / 4, k = (iz * SY + iy) * SX + ix;
      const a = D[k] + (D[k + 1] - D[k]) * fx, b = D[k + SX] + (D[k + SX + 1] - D[k + SX]) * fx;
      const k2 = k + SX * SY, a2 = D[k2] + (D[k2 + 1] - D[k2]) * fx, b2 = D[k2 + SX] + (D[k2 + SX + 1] - D[k2 + SX]) * fx;
      const v0 = a + (b - a) * fy, v1 = a2 + (b2 - a2) * fy, v = v0 + (v1 - v0) * fz;
      if (v > 0.05) bl[(y << 8) | (z << 4) | x] = y <= 22 ? B.water : 0;
    }
    carveCaves(c, G, new Int16Array(256).fill(120), { host: hostSet('gloomstone', 'iron_ore', 'coal_ore', 'glowquartz_ore'), minY: 3, thr: 0.006, cavern: 2 });
    // floors and ceilings
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = bx + x, wz = bz + z;
      for (let y = 2; y < 122; y++) {
        const id = bl[(y << 8) | (z << 4) | x], up = bl[(y + 1 << 8) | (z << 4) | x], dn = bl[(y - 1 << 8) | (z << 4) | x];
        if (id === B.gloomstone && up === 0) {
          bl[(y << 8) | (z << 4) | x] = B.deep_moss;
          const r = ihash(wx, y, wz, s);
          if (r < 0.09) bl[(y + 1 << 8) | (z << 4) | x] = B.glowshroom;
          else if (r < 0.1) bl[(y + 1 << 8) | (z << 4) | x] = B.mushroom_red;
        } else if (id === B.gloomstone && dn === 0 && ihash(wx, y, wz, s + 9) < 0.03) {
          const k = 1 + Math.floor(ihash(wx, y, wz, s + 10) * 3);
          for (let j = 1; j <= k; j++) if (bl[(y - j << 8) | (z << 4) | x] === 0) bl[(y - j << 8) | (z << 4) | x] = B.amethyst;
        }
      }
    }
    // giant glowcaps (kept fully inside the chunk)
    const rnd = mulberry32((ihash(c.cx, 99, c.cz, s) * 4294967296) >>> 0);
    for (let t = 0; t < 2; t++) {
      const x = 3 + Math.floor(rnd() * 10), z = 3 + Math.floor(rnd() * 10);
      for (let y = 4; y < 100; y++) {
        if (bl[(y << 8) | (z << 4) | x] !== B.deep_moss) continue;
        let room = 0;
        while (room < 14) { const id = bl[(y + 1 + room << 8) | (z << 4) | x]; if (id !== 0 && RENDER[id] !== R_CROSS) break; room++; }
        if (room < 8) continue;
        const sh = 5 + Math.floor(rnd() * Math.min(7, room - 6));
        for (let j = 1; j <= sh; j++) gset(c, x, y + j, z, B.shroom_stem);
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          if (gget(c, x + dx, y + sh + 1, z + dz) === 0) gset(c, x + dx, y + sh + 1, z + dz, B.shroom_cap);
          if ((Math.abs(dx) === 2 || Math.abs(dz) === 2) && gget(c, x + dx, y + sh, z + dz) === 0) gset(c, x + dx, y + sh, z + dz, B.shroom_cap);
        }
        break;
      }
    }
  },
});

// ---------------------------------------------------------------- 6. Lunara
function luColumn(G, x, z) {
  let h = 52 + fbm2(G.n[0], x * 0.01, z * 0.01, 4) * 5 + fbm2(G.n[1], x * 0.003, z * 0.003, 2) * 9;
  const cell = 34, gx = Math.floor(x / cell), gz = Math.floor(z / cell);
  let depth = 0;
  for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
    const cx = gx + ox, cz = gz + oz;
    if (ihash(cx, 5, cz, G.seed) > 0.7) continue;
    const px = cx * cell + ihash(cx, 6, cz, G.seed) * cell, pz = cz * cell + ihash(cx, 7, cz, G.seed) * cell;
    const r = 5 + ihash(cx, 8, cz, G.seed) * 15, d = Math.hypot(x - px, z - pz);
    if (d < r) { const dd = (1 - (d / r) * (d / r)) * r * 0.5; h -= dd; depth = Math.max(depth, dd); }
    else if (d < r * 1.3) h += (1 - Math.abs(d - r * 1.12) / (r * 0.18)) * r * 0.1 * (d < r * 1.3 ? 1 : 0);
  }
  return { h: Math.floor(clamp(h, 10, 110)), depth };
}
realm({
  key: 'lunara', name: 'Lunara', color: '#c8d0ff', gem: 'moonstone',
  tagline: 'The moon (low gravity!)',
  desc: 'Bouncy low gravity, huge craters, alien sprouts and Moon Cheese. Look up: you can see home!',
  how: 'Build a Moon Rocket, place it on the ground and use it to blast off.',
  hint: 'You will need a ride... a very fast one.',
  sky: { mode: 'fixed', time: 0.18, day: ['#000006', '#07071a'], stars: 1.2, sun: 1, planet: 1, clouds: 0 },
  ambient: 0.14, sunMin: 0.95, sunTint: [0.95, 0.97, 1.05], gravity: 0.34, weather: null, platform: 'moonrock', spawnXZ: [0, 0], spawnMode: 'top',
  music: { root: 62, scale: [0, 2, 4, 6, 8, 10], tempo: 0.75, wave: 'sine' },
  mobs: ['moon_hopper', 'zorbling', 'crater_crab', 'modling'], tier: 2,
  makeGen: seed => makeG(seed, 5),
  gen(c, G) {
    const bx = c.cx * 16, bz = c.cz * 16, s = G.seed, bl = c.blocks, TOP = new Int16Array(256), H = new Int16Array(256);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const col = luColumn(G, bx + x, bz + z), h = col.h;
      H[z * 16 + x] = h; TOP[z * 16 + x] = h - 4;
      bl[(z << 4) | x] = B.worldstone;
      for (let y = 1; y <= h; y++) bl[(y << 8) | (z << 4) | x] = y < h - 3 ? B.moonrock : ((col.depth > 5 && y === h) ? B.lunar_ice : B.regolith);
    }
    placeOres(c, s, [
      { id: B.moonstone_ore, min: 5, max: 60, tries: 6, size: 4 },
      { id: B.cheese_ore, min: 20, max: 60, tries: 4, size: 6 },
      { id: B.iron_ore, min: 5, max: 60, tries: 5, size: 5 },
      { id: B.copper_ore, min: 5, max: 60, tries: 4, size: 5 },
      { id: B.mod_geode, min: 3, max: 50, tries: 0.55, size: 1 },
    ], hostSet('moonrock'));
    carveCaves(c, G, TOP, { host: hostSet('moonrock', 'regolith', 'iron_ore', 'copper_ore', 'cheese_ore'), thr: 0.007 });
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const h = H[z * 16 + x];
      if (gget(c, x, h, z) === B.regolith && gget(c, x, h + 1, z) === 0 && ihash(bx + x, 2, bz + z, s) < 0.015) gset(c, x, h + 1, z, B.alien_crystal);
    }
    forCells(c, 11, 3, 16, s, (wx, wz, h, rnd) => {
      if (h > 0.25) return;
      const gh = luColumn(G, wx, wz).h, r = 1 + rnd() * 1.5;
      for (let dy = -1; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy + dz * dz <= r * r + 0.5) wset(c, wx + dx, gh + 1 + dy, wz + dz, B.moonrock, 0);
    });
  },
});

// ---------------------------------------------------------------- 7. Coral Abyss
const CA_SEA = 62;
function caColumn(G, x, z) {
  let h = 34 + fbm2(G.n[0], x * 0.008, z * 0.008, 4) * 12 + fbm2(G.n[1], x * 0.03, z * 0.03, 2) * 3;
  const isl = fbm2(G.n[2], x * 0.006 + 40, z * 0.006, 3);
  if (isl > 0.3) h = lerp(h, 66 + (isl - 0.3) * 28, smoothstep(0.3, 0.42, isl));
  return Math.floor(clamp(h, 10, 100));
}
realm({
  key: 'coralabyss', name: 'Coral Abyss', color: '#3fe0c8', gem: 'aquamarine',
  tagline: 'An ocean world',
  desc: 'Rainbow coral reefs, kelp forests, pearl clams and tiny palm islands. The Conch lets you breathe underwater here.',
  how: 'Find a Conch Shell on a Greenhollow beach. Swim underwater and blow it (use it).',
  hint: 'Listen to the sea... underwater.',
  sky: { mode: 'cycle', day: ['#3a8ee8', '#aeeaf2'], night: ['#020818', '#0a1a30'], sunset: '#ff8a7a', stars: 1, sun: 1, moon: 1, clouds: 1, cloudY: 118, cloudColor: '#ffffff' },
  ambient: 0.06, sunMin: 0.22, gravity: 1, weather: null, platform: 'sand', spawnXZ: [0, 0], spawnMode: 'top', waterBreathing: true,
  music: { root: 62, scale: [0, 2, 3, 5, 7, 9, 10], tempo: 0.55, wave: 'triangle' },
  mobs: ['fish', 'shark', 'turtle', 'jellyfish', 'octopus', 'modling'], tier: 1,
  makeGen: seed => makeG(seed, 6),
  gen(c, G) {
    const bx = c.cx * 16, bz = c.cz * 16, s = G.seed, bl = c.blocks, TOP = new Int16Array(256), H = new Int16Array(256);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = bx + x, wz = bz + z, h = caColumn(G, wx, wz);
      H[z * 16 + x] = h; TOP[z * 16 + x] = h - 7;
      const grav = G.n[3].noise2(wx * 0.06, wz * 0.06) > 0.45;
      bl[(z << 4) | x] = B.worldstone;
      for (let y = 1; y <= Math.max(h, CA_SEA); y++) {
        let id;
        if (y < h - 4) id = B.seastone;
        else if (y <= h) id = h > CA_SEA + 2 ? (y === h ? B.grass : B.dirt) : (grav && y === h ? B.gravel : B.sand);
        else id = B.water;
        bl[(y << 8) | (z << 4) | x] = id;
      }
    }
    placeOres(c, s, [
      { id: B.aquamarine_ore, min: 5, max: 60, tries: 7, size: 4 },
      { id: B.gold_ore, min: 5, max: 50, tries: 3, size: 5 },
      { id: B.iron_ore, min: 5, max: 60, tries: 5, size: 5 },
      { id: B.ruby_ore, min: 3, max: 30, tries: 1, size: 3 },
      { id: B.mod_geode, min: 3, max: 50, tries: 0.5, size: 1 },
    ], hostSet('seastone'));
    carveCaves(c, G, TOP, { host: hostSet('seastone', 'iron_ore', 'gold_ore'), thr: 0.005, liquidY: CA_SEA, liquid: B.water });
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const h = H[z * 16 + x], wx = bx + x, wz = bz + z, g = gget(c, x, h, z);
      if (gget(c, x, h + 1, z) !== B.water && gget(c, x, h + 1, z) !== 0) continue;
      const r = ihash(wx, 2, wz, s);
      if (h < CA_SEA - 3) {
        const reef = fbm2(G.n[4], wx * 0.05, wz * 0.05, 2);
        if (reef > 0.12 && r < 0.45) {
          const col = [B.coral_red, B.coral_yellow, B.coral_blue, B.coral_pink][Math.floor(ihash(wx, 3, wz, s) * 4)];
          const ch = 1 + Math.floor(ihash(wx, 4, wz, s) * 3);
          for (let k = 1; k <= ch && h + k < CA_SEA - 1; k++) gset(c, x, h + k, z, col);
          if (r < 0.06 && h + ch + 1 < CA_SEA) gset(c, x, h + ch + 1, z, B.bubble_coral);
        } else if (r < 0.06) {
          const kh = Math.min(CA_SEA - 2 - h, 4 + Math.floor(ihash(wx, 5, wz, s) * 14));
          for (let k = 1; k <= kh; k++) gset(c, x, h + k, z, B.kelp);
        } else if (r < 0.3) gset(c, x, h + 1, z, B.seagrass);
        else if (r < 0.315 && g === B.sand) gset(c, x, h, z, B.clam);
        else if (r < 0.325) gset(c, x, h + 1, z, B.bubble_coral);
      } else if (h > CA_SEA && g === B.grass && r < 0.12) gset(c, x, h + 1, z, B.tall_grass);
      else if (h > CA_SEA && g === B.sand && r < 0.01) gset(c, x, h + 1, z, B.conch_block);
    }
    forCells(c, 6, 3, 17, s, (wx, wz, h, rnd) => {
      if (h > 0.5) return;
      const gh = caColumn(G, wx, wz); if (gh <= CA_SEA + 1) return;
      treePalm(c, wx, gh + 1, wz, rnd);
    });
  },
});

// ---------------------------------------------------------------- 8. Sugarland
const SU_MILK = 46;
function suHeight(G, x, z) { return Math.floor(clamp(50 + fbm2(G.n[0], x * 0.009, z * 0.009, 4) * 12 + Math.pow(ridge2(G.n[1], x * 0.006, z * 0.006, 3), 2) * 18, 10, 110)); }
realm({
  key: 'sugarland', name: 'Sugarland', color: '#ff8ad8', gem: 'sugar_crystal',
  tagline: 'A world made of candy',
  desc: 'Frosting hills, candy cane forests, lollipop trees, chocolate milk lakes and cotton candy clouds. You can eat the cake!',
  how: 'Craft a Dream Bed and take a nap in it.',
  hint: 'Sweet dreams are made of this...',
  sky: { mode: 'fixed', time: 0.22, day: ['#86c8ff', '#ffd6ef'], stars: 0, sun: 1, rainbow: 1, clouds: 1, cloudY: 112, cloudColor: '#ffd0ec' },
  ambient: 0.2, sunMin: 1, sunTint: [1.05, 0.98, 1.02], gravity: 1, weather: 'sparkles', platform: 'icing', spawnXZ: [0, 0], spawnMode: 'top',
  music: { root: 67, scale: [0, 2, 4, 5, 7, 9], tempo: 0.32, wave: 'square' },
  village: { chance: 0.6, column(G, x, z) { const h = suHeight(G, x, z); return { h, ok: h > SU_MILK + 1 && h < 78, theme: 'candy' }; } },
  mobs: ['gummy_bear', 'jelly_slime', 'puffmallow', 'modling'], tier: 1,
  makeGen: seed => makeG(seed, 7),
  gen(c, G) {
    const bx = c.cx * 16, bz = c.cz * 16, s = G.seed, bl = c.blocks, TOP = new Int16Array(256), H = new Int16Array(256);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = bx + x, wz = bz + z, h = suHeight(G, wx, wz);
      H[z * 16 + x] = h; TOP[z * 16 + x] = h - 5;
      const icing = G.n[3].noise2(wx * 0.03, wz * 0.03) > 0.5;
      bl[(z << 4) | x] = B.worldstone;
      for (let y = 1; y <= Math.max(h, SU_MILK); y++) {
        let id;
        if (y < h - 8) id = B.candy_stone;
        else if (y < h - 3) id = B.chocolate;
        else if (y < h) id = B.cake;
        else if (y === h) id = h <= SU_MILK ? B.chocolate : (icing ? B.icing : B.frosting);
        else id = B.choco_milk;
        bl[(y << 8) | (z << 4) | x] = id;
      }
      const cc = fbm2(G.n[5], wx * 0.025, wz * 0.025, 3);
      if (cc > 0.32) { const k = Math.floor((cc - 0.32) * 10); for (let y = 90 - k; y <= 90 + Math.floor(k / 2); y++) bl[(y << 8) | (z << 4) | x] = B.cotton_candy; }
    }
    placeOres(c, s, [
      { id: B.sugar_ore, min: 5, max: 60, tries: 7, size: 5 },
      { id: B.gold_ore, min: 5, max: 50, tries: 3, size: 5 },
      { id: B.iron_ore, min: 5, max: 60, tries: 4, size: 5 },
      { id: B.coal_ore, min: 5, max: 70, tries: 3, size: 6 },
      { id: B.mod_geode, min: 3, max: 50, tries: 0.5, size: 1 },
    ], hostSet('candy_stone'));
    carveCaves(c, G, TOP, { host: hostSet('candy_stone', 'chocolate', 'iron_ore', 'coal_ore'), liquidY: 9, liquid: B.choco_milk });
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const h = H[z * 16 + x], g = gget(c, x, h, z);
      if ((g !== B.frosting && g !== B.icing) || gget(c, x, h + 1, z) !== 0) continue;
      const r = ihash(bx + x, 2, bz + z, s);
      if (r < 0.04) gset(c, x, h + 1, z, B.gumdrop); else if (r < 0.07) gset(c, x, h + 1, z, B.flower_red); else if (r < 0.085) gset(c, x, h + 1, z, B.flower_yellow);
    }
    forCells(c, 8, 3, 18, s, (wx, wz, h, rnd) => {
      if (h > 0.55 || nearVillage(G, this, wx, wz, 26)) return;
      const gh = suHeight(G, wx, wz); if (gh <= SU_MILK + 1) return;
      if (rnd() < 0.5) {
        const th = 5 + Math.floor(rnd() * 4), dir = rnd() < 0.5 ? [1, 0] : [0, 1];
        for (let i = 1; i <= th; i++) wset(c, wx, gh + i, wz, B.candy_cane, 0);
        wset(c, wx, gh + th + 1, wz, B.candy_cane, 0);
        wset(c, wx + dir[0], gh + th + 1, wz + dir[1], B.candy_cane, 0);
        wset(c, wx + dir[0] * 2, gh + th + 1, wz + dir[1] * 2, B.candy_cane, 0);
        wset(c, wx + dir[0] * 2, gh + th, wz + dir[1] * 2, B.candy_cane, 0);
      } else {
        const th = 4 + Math.floor(rnd() * 3), col = [B.lolli_red, B.lolli_green, B.lolli_blue][Math.floor(rnd() * 3)];
        const ax = rnd() < 0.5;
        for (let i = 1; i <= th; i++) wset(c, wx, gh + i, wz, B.icing, 0);
        const cy = gh + th + 2;
        for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
          if (a * a + b * b > 5) continue;
          if (ax) wset(c, wx + a, cy + b, wz, col, 0); else wset(c, wx, cy + b, wz + a, col, 0);
        }
      }
    });
    buildVillages(c, G, this);
  },
});

// ---------------------------------------------------------------- 9. Dino Valley
const DV_SEA = 50;
function dvColumn(G, x, z) {
  let h = 56 + fbm2(G.n[0], x * 0.007, z * 0.007, 4) * 15 + fbm2(G.n[1], x * 0.025, z * 0.025, 2) * 4;
  const riv = Math.abs(G.n[2].noise2(x * 0.003, z * 0.003));
  if (riv < 0.035) h = lerp(DV_SEA - 3, h, smoothstep(0, 0.035, riv));
  let volc = 0, crater = false;
  const cell = 260, gx = Math.floor(x / cell), gz = Math.floor(z / cell);
  for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
    const cx = gx + ox, cz = gz + oz;
    if (ihash(cx, 21, cz, G.seed) > 0.6) continue;
    const px = cx * cell + 60 + ihash(cx, 22, cz, G.seed) * (cell - 120), pz = cz * cell + 60 + ihash(cx, 23, cz, G.seed) * (cell - 120);
    const d = Math.hypot(x - px, z - pz);
    if (d < 70) {
      const peak = 62 + Math.pow(1 - d / 70, 1.6) * 52;
      if (peak > h) { h = peak; volc = 1 - d / 70; }
      if (d < 7) { h = 62 + Math.pow(1 - 7 / 70, 1.6) * 52 - 7; crater = true; }
    }
  }
  return { h: Math.floor(clamp(h, 10, 120)), volc, crater };
}
realm({
  key: 'dinovalley', name: 'Dino Valley', color: '#7ad04a', gem: 'amber',
  tagline: 'A prehistoric jungle',
  desc: 'Giant jungle trees, vines, rivers, smoking volcanoes and dinosaurs. Some are friendly. Some are NOT.',
  how: 'Dig up a Fossil deep underground, craft a Time Clock (Fossil + 2 Gold + 4 Copper) and use it.',
  hint: 'Travel back in time... with something very old.',
  sky: { mode: 'cycle', day: ['#5aa2d8', '#dcecc4'], night: ['#040a08', '#0c1a14'], sunset: '#ffa85a', stars: 1, sun: 1, moon: 1, clouds: 1, cloudY: 118, cloudColor: '#f4f8ee' },
  ambient: 0.05, sunMin: 0.2, gravity: 1, weather: null, platform: 'mud', spawnXZ: [0, 0], spawnMode: 'top', fogScale: 0.85,
  music: { root: 50, scale: [0, 3, 5, 7, 10], tempo: 0.45, wave: 'triangle', drums: true },
  village: { chance: 0.6, column(G, x, z) { const c = dvColumn(G, x, z); return { h: c.h, ok: c.h > DV_SEA + 1 && c.h < 82 && c.volc === 0, theme: 'jungle' }; } },
  mobs: ['raptor', 'hornback', 'treetop', 'kingjaw', 'glidewing', 'spikeback', 'modling'], tier: 2,
  makeGen: seed => makeG(seed, 8),
  gen(c, G) {
    const bx = c.cx * 16, bz = c.cz * 16, s = G.seed, bl = c.blocks, TOP = new Int16Array(256), H = new Int16Array(256);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = bx + x, wz = bz + z, col = dvColumn(G, wx, wz), h = col.h;
      H[z * 16 + x] = col.volc > 0.25 ? -h : h; TOP[z * 16 + x] = col.volc > 0 ? h - 12 : h - 5;
      bl[(z << 4) | x] = B.worldstone;
      for (let y = 1; y <= Math.max(h, DV_SEA); y++) {
        let id;
        if (col.volc > 0.25) id = y <= h ? (y < h - 2 ? B.stone : B.volcanic_rock) : B.water;
        else if (y < h - 3) id = B.stone;
        else if (y < h) id = B.mud;
        else if (y === h) id = h <= DV_SEA + 1 ? B.mud : B.jungle_grass;
        else id = B.water;
        bl[(y << 8) | (z << 4) | x] = id;
      }
      if (col.crater) for (let y = h - 1; y <= h; y++) bl[(y << 8) | (z << 4) | x] = B.lava;
    }
    placeOres(c, s, [
      { id: B.amber_ore, min: 5, max: 70, tries: 6, size: 4 },
      { id: B.fossil_block, min: 5, max: 60, tries: 2, size: 2 },
      { id: B.coal_ore, min: 5, max: 100, tries: 7, size: 7 },
      { id: B.iron_ore, min: 5, max: 64, tries: 6, size: 6 },
      { id: B.gold_ore, min: 3, max: 32, tries: 2.5, size: 5 },
      { id: B.mod_geode, min: 3, max: 50, tries: 0.5, size: 1 },
    ], hostSet('stone'));
    carveCaves(c, G, TOP, { host: hostSet('stone', 'mud', 'coal_ore', 'iron_ore'), liquidY: 10, liquid: B.lava });
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const h = H[z * 16 + x]; if (h < 0) continue;
      if (gget(c, x, h, z) !== B.jungle_grass || gget(c, x, h + 1, z) !== 0) continue;
      const r = ihash(bx + x, 2, bz + z, s);
      if (r < 0.14) gset(c, x, h + 1, z, B.fern); else if (r < 0.28) gset(c, x, h + 1, z, B.tall_grass);
      else if (r < 0.3) gset(c, x, h + 1, z, B.flower_red); else if (r < 0.31) gset(c, x, h + 1, z, B.berry_bush);
    }
    forCells(c, 6, 5, 19, s, (wx, wz, h, rnd) => {
      if (h > 0.55 || nearVillage(G, this, wx, wz, 26)) return;
      const col = dvColumn(G, wx, wz); if (col.h <= DV_SEA + 1 || col.volc > 0.1) return;
      const th = 8 + Math.floor(rnd() * 7), top = col.h + th;
      for (let i = 1; i <= th; i++) wset(c, wx, col.h + i, wz, B.jungle_log, 0);
      const r = 3 + Math.floor(rnd() * 2);
      for (let dy = -1; dy <= 1; dy++) {
        const rr = dy === 1 ? r - 1 : r;
        for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) {
          if (dx * dx + dz * dz > rr * rr + 1 || rnd() < 0.08) continue;
          wset(c, wx + dx, top + dy, wz + dz, B.jungle_leaves, 1);
          if (dy === -1 && dx * dx + dz * dz >= (rr - 1) * (rr - 1) && rnd() < 0.18) {
            const vl = 2 + Math.floor(rnd() * 5);
            for (let k = 1; k <= vl; k++) wset(c, wx + dx, top - 1 - k, wz + dz, B.vine, 2);
          }
        }
      }
    });
    buildVillages(c, G, this);
  },
});

// ---------------------------------------------------------------- 10. Prismara
function prHeight(G, x, z) {
  const d = Math.hypot(x, z);
  let h = 52 + fbm2(G.n[0], x * 0.01, z * 0.01, 4) * 10 + fbm2(G.n[1], x * 0.03, z * 0.03, 2) * 3;
  if (d < 36) h = lerp(60, h, smoothstep(20, 36, d));
  return Math.floor(clamp(h, 10, 110));
}
const CRYSTAL_IDS = () => CRYSTALS.map(c => B['crystal_' + c[0]]);
realm({
  key: 'prismara', name: 'Prismara', color: '#c46aff', gem: null,
  tagline: 'The final realm',
  desc: 'Rainbow crystal spires under a starry nebula. The rarest Mythic mods hide here, guarded by the Prism Guardian.',
  how: 'Collect all 8 Realm Gems, craft the Star Key at a Workbench, and use it.',
  hint: 'Gather a gem from every other realm.',
  sky: { mode: 'fixed', time: 0.1, day: ['#140832', '#c870e8'], stars: 1, nebula: 1, sun: 1, clouds: 0 },
  ambient: 0.24, sunMin: 0.65, sunTint: [0.95, 0.85, 1.1], gravity: 0.9, weather: 'sparkles', platform: 'prism_stone', spawnXZ: [0, 46], spawnMode: 'top',
  music: { root: 64, scale: [0, 2, 4, 5, 7, 9, 10], tempo: 0.38, wave: 'triangle' },
  mobs: ['crystal_golem', 'prism_moth', 'starhorn', 'modling'], tier: 3,
  makeGen: seed => makeG(seed, 9),
  gen(c, G) {
    const bx = c.cx * 16, bz = c.cz * 16, s = G.seed, bl = c.blocks, TOP = new Int16Array(256), H = new Int16Array(256);
    const cry = CRYSTAL_IDS();
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = bx + x, wz = bz + z, h = prHeight(G, wx, wz), d = Math.hypot(wx, wz);
      H[z * 16 + x] = h; TOP[z * 16 + x] = d < 40 ? 0 : h - 5;
      bl[(z << 4) | x] = B.worldstone;
      for (let y = 1; y <= h; y++) bl[(y << 8) | (z << 4) | x] = y < h - 2 ? B.prism_stone : (y === h ? (d < 17 ? B.guardian_stone : B.prism_grass) : B.prism_stone);
    }
    placeOres(c, s, [
      { id: B.starstone_ore, min: 5, max: 55, tries: 5, size: 4 },
      { id: B.ruby_ore, min: 5, max: 50, tries: 3, size: 4 },
      { id: B.gold_ore, min: 5, max: 50, tries: 3, size: 5 },
      { id: B.mod_geode, min: 3, max: 55, tries: 1, size: 1 },
    ], hostSet('prism_stone'));
    carveCaves(c, G, TOP, { host: hostSet('prism_stone', 'gold_ore', 'ruby_ore') });
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const h = H[z * 16 + x];
      if (gget(c, x, h, z) !== B.prism_grass || gget(c, x, h + 1, z) !== 0) continue;
      const r = ihash(bx + x, 2, bz + z, s);
      if (r < 0.05) gset(c, x, h + 1, z, B.star_flower); else if (r < 0.12) gset(c, x, h + 1, z, B.tall_grass);
    }
    forCells(c, 10, 3, 20, s, (wx, wz, h, rnd) => {
      if (h > 0.45 || Math.hypot(wx, wz) < 26) return;
      const gh = prHeight(G, wx, wz), sh = 5 + Math.floor(rnd() * 14), r0 = 1 + rnd() * 1.3, id = cry[Math.floor(rnd() * cry.length)];
      for (let y = 0; y < sh; y++) {
        const r = r0 * (1 - y / sh) + 0.35;
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dz * dz <= r * r) wset(c, wx + dx, gh + 1 + y, wz + dz, id, 0);
      }
    });
    forCells(c, 18, 2, 21, s, (wx, wz, h, rnd) => {
      if (h > 0.3) return;
      const cy = 76 + Math.floor(rnd() * 22), id = cry[Math.floor(rnd() * cry.length)];
      for (let dy = -2; dy <= 2; dy++) { const r = 2 - Math.abs(dy); for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (Math.abs(dx) + Math.abs(dz) <= r) wset(c, wx + dx, cy + dy, wz + dz, id, 0); }
    });
    // Guardian arena: ring of crystal pillars
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, px = Math.round(Math.cos(a) * 14), pz = Math.round(Math.sin(a) * 14);
      for (let y = 61; y < 68 + (k % 2) * 3; y++) wset(c, px, y, pz, cry[k % cry.length], 0);
    }
  },
});

// Realm helpers
function realmByKey(k) { return REALM[k] || REALMS[0]; }
