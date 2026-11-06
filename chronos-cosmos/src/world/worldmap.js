import { Simplex2, smoothstep, clamp, lerp } from '../core/noise.js';

// The shape of Aeloria: a lake valley ringed by mountains, the Redstone
// mesas to the west, Thornwood to the east, Frostpeak/Cinderpeak north.
// North is -Z.

export const SEED = 7331;
export const noise = new Simplex2(SEED);
const n2 = new Simplex2(SEED + 17);
const n3 = new Simplex2(SEED + 101);

export const LAKE = { x: 0, z: 40, r: 205 };
export const ISLAND = { x: 0, z: 40, r: 46, top: 15 };
export const VOLCANO = { x: 60, z: -560, r: 260, peak: 205, crater: 46, floor: 168 };

export const REGIONS = [
  { id: 'meadowvale', name: 'Meadowvale', test: (x, z) => x < -60 && z > 120 },
  { id: 'mirror', name: 'Mirror Lake', test: (x, z) => Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 30 },
  { id: 'redstone', name: 'Redstone Mesas', test: (x, z) => canyonMask(x, z) > 0.4 },
  { id: 'frostpeak', name: 'Frostpeak', test: (x, z) => z < -380 },
  { id: 'thornwood', name: 'Thornwood', test: (x, z) => x > 150 },
  { id: 'heartlands', name: 'The Heartlands', test: () => true },
];
export const REGION_EPOCH_NAMES = {
  frostpeak: ['Frostpeak', 'Cinderpeak', 'Frostpeak Reach'],
  meadowvale: ['Meadowvale', 'The Ashen Fields', 'Starfall Meadows'],
  mirror: ['Mirror Lake', 'The Dry Basin', 'The Glimmering Deep'],
  redstone: ['Redstone Mesas', 'The Scorched Mesas', 'The Crystal Mesas'],
  thornwood: ['Thornwood', 'The Charwood', 'The Silverwood'],
  heartlands: ['The Heartlands', 'The Heartlands', 'The Heartlands'],
};
export function regionAt(x, z) {
  for (const r of REGIONS) if (r.test(x, z)) return r;
  return REGIONS[REGIONS.length - 1];
}

// Points of interest. r = flatten radius, h = forced height (otherwise local
// average). These anchor villages, arenas, shrines and campsites.
export const POIS = [
  { id: 'hearthmere', name: 'Hearthmere', x: -300, z: 330, r: 78, type: 'village' },
  { id: 'kestrel', name: "Kestrel's Rest", x: 360, z: 260, r: 66, type: 'village' },
  { id: 'colosseum', name: 'The Gilded Ring', x: -480, z: -120, r: 70, h: 22, type: 'arena' },
  { id: 'spire', name: 'The Chrono Spire', x: 0, z: 40, r: 20, h: 15, type: 'spire' },
  { id: 'pillar1', name: 'Dawnwatch Pillar', x: -120, z: 410, r: 16, type: 'pillar' },
  { id: 'pillar2', name: 'Mesa Pillar', x: -300, z: -190, r: 16, type: 'pillar' },
  { id: 'pillar3', name: 'Northwind Pillar', x: 240, z: -300, r: 16, type: 'pillar' },
  { id: 'trial1', name: 'Trial of Embers', x: -440, z: 190, r: 28, type: 'trial' },
  { id: 'trial2', name: 'Trial of Ages', x: -360, z: -330, r: 30, type: 'trial' },
  { id: 'trial3', name: 'Trial of Frost', x: 228, z: 46, r: 8, type: 'trial' },
  { id: 'rift1', name: 'Meadow Rift', x: 140, z: 340, r: 12, type: 'rift' },
  { id: 'rift2', name: 'Hollow Rift', x: -220, z: -300, r: 12, type: 'rift' },
  { id: 'rift3', name: 'Thorn Rift', x: 450, z: 90, r: 12, type: 'rift' },
  { id: 'astral', name: 'Astral Stair', x: 385, z: -60, r: 22, type: 'astral' },
  { id: 'camp_cinder', name: 'Cinderpeak Foothold', x: 40, z: -370, r: 16, type: 'camp' },
  { id: 'camp_canyon', name: 'Canyon Gate', x: -330, z: -40, r: 14, type: 'camp' },
  { id: 'camp_lakeeast', name: 'Eastshore Camp', x: 235, z: 90, r: 14, type: 'camp' },
  { id: 'camp_lakewest', name: 'Reedwater Camp', x: -170, z: 175, r: 14, type: 'camp' },
  { id: 'camp_far', name: 'Lone Hill Camp', x: -40, z: 520, r: 14, type: 'camp' },
];
export const poi = (id) => POIS.find((p) => p.id === id);

export const START = { x: -228, z: 262 };

// Roads (dirt trails): polylines of [x,z]
export const ROADS = [
  [[-300, 330], [-262, 296], [-215, 262], [-175, 222], [-120, 260], [-60, 300], [40, 315], [140, 330], [250, 300], [360, 260]],
  [[-300, 330], [-360, 250], [-420, 200], [-430, 120], [-380, 40], [-330, -40], [-400, -90], [-480, -120]],
  [[-300, 330], [-210, 380], [-120, 410]],
  [[360, 260], [330, 160], [235, 90], [250, -70], [300, -150], [385, -60]],
  [[250, -70], [170, -200], [100, -300], [40, -370]],
  [[-330, -40], [-260, -140], [-300, -190], [-330, -270], [-360, -330]],
  [[-175, 222], [-170, 175], [-160, 120]],
];

function fbm(x, z, f, o) {
  return noise.fbm(x * f, z * f, o);
}

export function lakeRadius(x, z) {
  const a = Math.atan2(z - LAKE.z, x - LAKE.x);
  return LAKE.r + n2.noise(Math.cos(a) * 1.6, Math.sin(a) * 1.6) * 34 + n2.noise(Math.cos(a) * 4, Math.sin(a) * 4) * 10;
}

export function canyonMask(x, z) {
  const w = noise.noise(x * 0.006, z * 0.006) * 55;
  return smoothstep(-255, -360, x + w) * smoothstep(-560, -470, z + w) * smoothstep(300, 180, z - w);
}

export function forestMask(x, z) {
  const base = smoothstep(130, 260, x + noise.noise(x * 0.004, z * 0.004) * 80) * smoothstep(420, 300, z);
  const patches = smoothstep(0.25, 0.55, n3.fbm(x * 0.006, z * 0.006, 3) * 0.5 + 0.5);
  const north = smoothstep(-300, -420, z) * (1 - smoothstep(-500, -620, z)) * 0.6;
  return clamp(Math.max(base * (0.75 + patches * 0.5), patches * 0.55, north * patches), 0, 1);
}

function roadDistSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
// Smooth roads with Catmull-Rom so they curve naturally.
export const ROAD_SEGS = (() => {
  const segs = [];
  for (const road of ROADS) {
    const pts = [];
    for (let i = 0; i < road.length - 1; i++) {
      const p0 = road[Math.max(0, i - 1)], p1 = road[i], p2 = road[i + 1], p3 = road[Math.min(road.length - 1, i + 2)];
      for (let s = 0; s < 8; s++) {
        const t = s / 8, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    pts.push(road[road.length - 1]);
    for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]);
  }
  return segs;
})();
// Bucket segments in a coarse grid so per-vertex queries stay cheap.
const RCELL = 32;
const roadGrid = new Map();
for (const s of ROAD_SEGS) {
  const x0 = Math.floor((Math.min(s[0], s[2]) - 12) / RCELL), x1 = Math.floor((Math.max(s[0], s[2]) + 12) / RCELL);
  const z0 = Math.floor((Math.min(s[1], s[3]) - 12) / RCELL), z1 = Math.floor((Math.max(s[1], s[3]) + 12) / RCELL);
  for (let i = x0; i <= x1; i++)
    for (let j = z0; j <= z1; j++) {
      const k = i * 10007 + j;
      if (!roadGrid.has(k)) roadGrid.set(k, []);
      roadGrid.get(k).push(s);
    }
}
export function roadDist(x, z) {
  const list = roadGrid.get(Math.floor(x / RCELL) * 10007 + Math.floor(z / RCELL));
  if (!list) return 99;
  let d = 99;
  for (const s of list) {
    const v = roadDistSegment(x, z, s[0], s[1], s[2], s[3]);
    if (v < d) d = v;
  }
  return d;
}

// Raw terrain before POI flattening.
export function rawHeight(x, z) {
  const r = Math.hypot(x, z);
  // rolling hills
  let h = 9 + fbm(x, z, 1 / 420, 5) * 16 + fbm(x + 500, z - 300, 1 / 110, 4) * 4.5;
  // gentle meadows in the south-west
  const meadow = smoothstep(-40, -220, x) * smoothstep(120, 260, z);
  h = lerp(h, 7 + fbm(x, z, 1 / 300, 3) * 6, meadow * 0.7);
  // eastern hills a touch rougher
  h += smoothstep(150, 350, x) * (noise.ridged(x * 0.006, z * 0.006, 4) * 22 - 6);
  // canyon mesas: terraced plateaus with sheer risers
  const cm = canyonMask(x, z);
  if (cm > 0) {
    const m = n2.fbm(x / 170, z / 170, 4) * 0.5 + 0.5;
    const raw = 10 + m * 95;
    const step = 17;
    const k = raw / step;
    const fl = Math.floor(k);
    const fr = k - fl;
    const terr = (fl + smoothstep(0.72, 0.98, fr)) * step + fr * 2.0;
    h = lerp(h, terr, cm);
  }
  // northern mountains
  const mm = smoothstep(-320, -580, z + noise.noise(x * 0.004, 3.3) * 70) * (1 - cm);
  if (mm > 0) h += mm * (28 + Math.pow(noise.ridged(x / 380, z / 380, 5), 1.25) * 170 + n2.fbm(x / 90, z / 90, 3) * 10);
  // volcano cone with crater
  const vd = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
  if (vd < VOLCANO.r) {
    const t = 1 - vd / VOLCANO.r;
    const gully = n3.ridged(Math.atan2(z - VOLCANO.z, x - VOLCANO.x) * 3.0, vd * 0.012, 3);
    const cone = Math.pow(t, 1.5) * VOLCANO.peak + noise.noise(x * 0.02, z * 0.02) * 8 * t - gully * 22 * t * (1 - t) * 2;
    h = Math.max(h, cone + 8);
    if (vd < VOLCANO.crater + 18) {
      const c = smoothstep(VOLCANO.crater + 18, VOLCANO.crater, vd);
      h = lerp(h, VOLCANO.floor, c);
    }
  }
  // world rim
  const rim = smoothstep(590, 770, r + noise.noise(x * 0.003, z * 0.003) * 60);
  if (rim > 0) h += rim * (105 + Math.pow(noise.ridged(x / 320, z / 320, 5), 1.2) * 135);
  // lake basin
  const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
  const lr = lakeRadius(x, z);
  if (ld < lr + 60) {
    const t = smoothstep(lr + 50, lr - 35, ld);
    const bed = -13 + fbm(x, z, 1 / 60, 3) * 3 + smoothstep(lr - 35, lr - 120, ld) * -3;
    h = lerp(h, Math.min(h, bed), t);
    // gentle beach near the waterline
    const beach = smoothstep(lr + 30, lr, ld) * (1 - t);
    h = lerp(h, Math.min(h, 2.2), beach * 0.6);
  }
  // central island
  const id = Math.hypot(x - ISLAND.x, z - ISLAND.z);
  if (id < ISLAND.r + 10) {
    const t = smoothstep(ISLAND.r + 8, 14, id);
    const ih = -8 + t * 23 + noise.noise(x * 0.05, z * 0.05) * 1.5 * t;
    h = Math.max(h, ih);
  }
  return h;
}

const flatCache = new Map();
function poiTarget(p) {
  if (p.h !== undefined) return p.h;
  if (flatCache.has(p.id)) return flatCache.get(p.id);
  let s = 0, n = 0;
  for (let a = 0; a < 12; a++) {
    for (const rr of [0, p.r * 0.4, p.r * 0.8]) {
      s += rawHeight(p.x + Math.cos(a) * rr, p.z + Math.sin(a) * rr);
      n++;
    }
  }
  const v = Math.max(3.5, s / n);
  flatCache.set(p.id, v);
  return v;
}

export function worldHeight(x, z) {
  let h = rawHeight(x, z);
  for (const p of POIS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r * 1.6) {
      const w = smoothstep(p.r * 1.6, p.r * 0.75, d);
      const target = poiTarget(p) + (p.type === 'village' ? noise.noise(x * 0.03, z * 0.03) * 0.6 : 0);
      h = lerp(h, target, w);
    }
  }
  // roads slightly sunken and smoothed
  const rd = roadDist(x, z);
  if (rd < 5) h -= (1 - rd / 5) * 0.25;
  return h;
}

// Biome masks for the GPU (grass density, path, canyon, forest)
export function biomeMasks(x, z) {
  const rd = roadDist(x, z);
  const path = smoothstep(3.6, 1.6, rd + noise.noise(x * 0.3, z * 0.3) * 0.6);
  const cm = canyonMask(x, z);
  const fm = forestMask(x, z);
  let grass = 0.85 + noise.noise(x * 0.02, z * 0.02) * 0.15;
  grass *= 1 - path;
  grass *= 1 - cm * 0.85;
  grass *= 1 - fm * 0.35;
  // plazas
  for (const p of POIS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (p.type === 'village' && d < 16) grass *= smoothstep(10, 16, d);
    if ((p.type === 'arena' || p.type === 'spire' || p.type === 'trial') && d < p.r * 0.8) grass *= 0.15;
    if (p.type === 'camp' && d < 6) grass *= 0.2;
  }
  const lakeD = Math.hypot(x - LAKE.x, z - LAKE.z);
  const lr = lakeRadius(x, z);
  if (lakeD < lr + 10) grass *= smoothstep(lr - 5, lr + 10, lakeD);
  return [clamp(grass, 0, 1), path, cm, fm];
}
