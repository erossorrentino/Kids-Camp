'use strict';
/* Small math helpers shared by the simulation and the renderer. */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const smooth = (t) => t * t * (3 - 2 * t);
const hyp = Math.hypot;
const TAU = Math.PI * 2;

function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function turnToward(a, b, maxStep) {
  const d = angDiff(a, b);
  return a + clamp(d, -maxStep, maxStep);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let RNG = mulberry32(20261112);
const rand = () => RNG();
const randRange = (a, b) => a + (b - a) * RNG();
const randSign = () => (RNG() < 0.5 ? -1 : 1);
const pick = (arr) => arr[Math.floor(RNG() * arr.length) % arr.length];
/* rating → 0..1 (50 maps to 0, 99 to 1; weak ratings go slightly negative) */
const rt = (v) => clamp((v - 50) / 49, -0.3, 1);

/* distance from point P to segment AB, plus the parameter along AB */
function distSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + dx * t, cz = az + dz * t;
  return { d: hyp(px - cx, pz - cz), t };
}
