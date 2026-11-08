// Upgrade parts, effective car stats, physics parameters and the
// Performance Rating (PR), which is computed from a quick lap simulation on
// an abstract reference circuit so it reflects real pace (power, weight,
// grip, downforce, drag) rather than an arbitrary formula.
import { clamp, lerp } from '../core/rng.js';

export const PARTS = [
  { key: 'engine', name: 'Engine Tune', desc: 'Remapped engine, forged internals. More power everywhere.', icon: '⚙', levels: [
    { name: 'Stage 1', cost: 2500, power: 1.08 }, { name: 'Stage 2', cost: 6500, power: 1.17 }, { name: 'Stage 3', cost: 15000, power: 1.27 }] },
  { key: 'turbo', name: 'Turbo / Supercharger', desc: 'Forced induction for a big jump in power.', icon: '🌀', noEV: true, levels: [
    { name: 'Low Boost', cost: 4000, power: 1.1 }, { name: 'High Boost', cost: 9500, power: 1.22 }, { name: 'Twin Turbo', cost: 21000, power: 1.36 }] },
  { key: 'exhaust', name: 'Exhaust', desc: 'Free-flowing exhaust: a little power, less weight, a lot more noise.', icon: '🔊', noEV: true, levels: [
    { name: 'Sport', cost: 1200, power: 1.03, mass: -6 }, { name: 'Race', cost: 3000, power: 1.06, mass: -12 }, { name: 'Titanium', cost: 6500, power: 1.09, mass: -18 }] },
  { key: 'intake', name: 'Intake & ECU', desc: 'Cold air intake and a smarter engine computer.', icon: '💨', levels: [
    { name: 'Sport', cost: 1000, power: 1.03 }, { name: 'Race', cost: 2600, power: 1.06 }, { name: 'Custom Map', cost: 5500, power: 1.1 }] },
  { key: 'transmission', name: 'Gearbox', desc: 'Quicker shifts and better gear ratios.', icon: '🔧', levels: [
    { name: 'Sport', cost: 2000, shift: 0.15, accel: 1.02 }, { name: 'Race', cost: 5200, shift: 0.1, accel: 1.04 }, { name: 'Sequential', cost: 11500, shift: 0.05, accel: 1.06 }] },
  { key: 'weight', name: 'Weight Reduction', desc: 'Strip weight: carbon panels, lighter seats, no carpet.', icon: '🪶', levels: [
    { name: 'Stage 1', cost: 2200, massMul: 0.95 }, { name: 'Stage 2', cost: 5200, massMul: 0.9 }, { name: 'Stage 3', cost: 11500, massMul: 0.84 }, { name: 'Carbon Body', cost: 25000, massMul: 0.78 }] },
  { key: 'tires', name: 'Tyres', desc: 'Stickier rubber means faster corners and shorter braking.', icon: '⭕', levels: [
    { name: 'Sport', cost: 1100, grip: 1.08 }, { name: 'Semi-Slick', cost: 2800, grip: 1.16 }, { name: 'Racing Slick', cost: 6500, grip: 1.26 }] },
  { key: 'brakes', name: 'Brakes', desc: 'Bigger discs and calipers. Brake later, pass more cars.', icon: '🛑', levels: [
    { name: 'Sport', cost: 1600, brake: 1.12 }, { name: 'Race', cost: 4200, brake: 1.25 }, { name: 'Carbon Ceramic', cost: 9500, brake: 1.4 }] },
  { key: 'suspension', name: 'Suspension', desc: 'Lower, stiffer, sharper. Less body roll and more grip.', icon: '🔩', levels: [
    { name: 'Sport', cost: 2000, grip: 1.04 }, { name: 'Race', cost: 5000, grip: 1.08 }, { name: 'Adjustable', cost: 10500, grip: 1.12 }] },
  { key: 'aero', name: 'Aero Kit', desc: 'Splitter and rear wing push the car into the track at speed.', icon: '🪽', levels: [
    { name: 'Street Kit', cost: 3000, aero: 0.35, drag: 1.03 }, { name: 'Track Kit', cost: 7200, aero: 0.8, drag: 1.06 }, { name: 'Race Wing', cost: 15500, aero: 1.4, drag: 1.1 }] },
  { key: 'nitro', name: 'Nitrous', desc: 'Press N (or Shift) for a huge burst of power. Refills a little every lap.', icon: '🔥', levels: [
    { name: '1 Bottle', cost: 3000, nitro: 4 }, { name: '2 Bottles', cost: 6500, nitro: 7 }, { name: '3 Bottles', cost: 13000, nitro: 10 }] },
];
export const PART_KEYS = PARTS.map((p) => p.key);

// Price of a part scales with how valuable the car is
export function partCost(car, key, level) {
  const p = PARTS.find((q) => q.key === key);
  if (!p || level < 1 || level > p.levels.length) return 0;
  const f = clamp(Math.pow(car.price / 30000, 0.6), 0.55, 40);
  const c = p.levels[level - 1].cost * f;
  return c < 10000 ? Math.round(c / 50) * 50 : Math.round(c / 500) * 500;
}

export function partAvailable(car, key) {
  const p = PARTS.find((q) => q.key === key);
  if (!p) return false;
  if (p.noEV && car.ev) return false;
  if ((car.cls === 'formula1' || car.cls === 'proto') && (key === 'aero' || key === 'tires')) return false;
  return true;
}

// Effective stats with parts applied -> everything the physics/AI/UI need
export function effectiveStats(car, parts = {}) {
  let power = 1, massAdd = 0, massMul = 1, grip = 1, brake = 1, aeroAdd = 0, drag = 1, shift = car.race ? 0.08 : car.ev ? 0 : 0.22, accel = 1, nitro = 0;
  for (const p of PARTS) {
    const lvl = parts[p.key] || 0;
    if (!lvl || !partAvailable(car, p.key)) continue;
    const L = p.levels[lvl - 1];
    if (L.power) power *= L.power;
    if (L.mass) massAdd += L.mass;
    if (L.massMul) massMul *= L.massMul;
    if (L.grip) grip *= L.grip;
    if (L.brake) brake *= L.brake;
    if (L.aero) aeroAdd += L.aero;
    if (L.drag) drag *= L.drag;
    if (L.shift !== undefined) shift = Math.min(shift, L.shift);
    if (L.accel) accel *= L.accel;
    if (L.nitro) nitro = L.nitro;
  }
  // race cars already run slicks; street tyres upgrade gives less to them
  if (car.race && parts.tires) grip = 1 + (grip - 1) * 0.4;
  const hp = car.hp * power;
  const kg = Math.max(car.kg * 0.6, car.kg * massMul + massAdd);
  const mu = car.grip * grip;
  const aero = car.aero + aeroAdd;
  const powerW = hp * 745.7 * accel;
  const mass = kg + 75; // + driver
  const vTopBase = car.top / 3.6;
  // drag coefficient chosen so the stock car reaches its catalogue top speed
  const kStock = (car.hp * 745.7 * 0.9) / Math.pow(vTopBase, 3);
  const kDrag = kStock * drag;
  const vTop = Math.cbrt((powerW * 0.9) / kDrag);
  const cl = aero * 0.75; // downforce N per (m/s)^2
  const wheelR = car.body === 'formula' ? 0.36 : car.body === 'suv' || car.body === 'pickup' ? 0.38 : 0.33;
  const physics = {
    mass, powerW, kDrag, cl, mu, brake, drive: car.drive, ev: car.ev, redline: car.redline,
    idle: car.ev ? 0 : 900, gears: car.gears, shiftTime: shift, frontW: car.frontW, vTop,
    wheelbase: car.body === 'formula' ? 3.6 : car.body === 'hatch' ? 2.55 : car.body === 'pickup' ? 3.4 : 2.7,
    cgHeight: car.body === 'formula' ? 0.28 : car.body === 'suv' || car.body === 'pickup' ? 0.68 : car.body === 'proto' ? 0.33 : 0.48,
    wheelR, nitro, aeroBalance: car.body === 'formula' ? 0.45 : 0.42, race: car.race,
  };
  const st = {
    hp: Math.round(hp), kg: Math.round(kg), topKmh: Math.round(vTop * 3.6), mu, aero, brake,
    accel0100: estimateZeroToHundred(physics), physics,
  };
  st.pr = performanceRating(physics);
  return st;
}

function tractionForce(ph, v) {
  const g = 9.81;
  const down = ph.cl * v * v;
  const share = ph.drive === 'AWD' ? 1 : ph.drive === 'FWD' ? ph.frontW * 0.92 : (1 - ph.frontW) * 1.08;
  return ph.mu * (ph.mass * g + down) * Math.min(1, share);
}

function driveForce(ph, v) {
  const eff = 0.88;
  const P = ph.powerW * eff;
  const F = P / Math.max(v, 4);
  // low-speed torque limit (cars don't have infinite torque at 0 km/h)
  const Fmax = ph.ev ? (ph.powerW / 22) : (ph.powerW / 16);
  return Math.min(F, Fmax, tractionForce(ph, v));
}

function estimateZeroToHundred(ph) {
  let v = 0, t = 0;
  const dt = 0.02;
  while (v < 27.78 && t < 60) {
    const F = driveForce(ph, v) - ph.kDrag * v * v - 0.012 * ph.mass * 9.81;
    v += (F / ph.mass) * dt;
    t += dt;
    // shift pauses (rough): one shift every ~45 km/h for ICE cars
    if (!ph.ev && Math.floor((v * 3.6) / 48) !== Math.floor(((v - (F / ph.mass) * dt) * 3.6) / 48)) t += ph.shiftTime;
  }
  return Math.round(t * 10) / 10;
}

// Abstract reference circuit: [straight metres] or [radius, angle deg]
const REF = [[700], [45, 90], [300], [120, 60], [420], [22, 180], [500], [220, 45], [260], [70, 120], [380], [35, 90], [200], [160, 70], [600], [55, 105]];

export function lapSim(ph, segments = REF) {
  const ds = 6, g = 9.81;
  const pts = [];
  for (const s of segments) {
    if (s.length === 1) { for (let d = 0; d < s[0]; d += ds) pts.push(Infinity); }
    else { const len = s[0] * s[1] * Math.PI / 180; for (let d = 0; d < len; d += ds) pts.push(s[0]); }
  }
  const n = pts.length;
  const vmax = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const R = pts[i];
    if (!isFinite(R)) { vmax[i] = ph.vTop; continue; }
    const den = ph.mass / R - ph.mu * ph.cl;
    vmax[i] = den <= 0 ? ph.vTop : Math.min(ph.vTop, Math.sqrt((ph.mu * ph.mass * g) / den));
  }
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) v[i] = vmax[i];
  for (let pass = 0; pass < 2; pass++) {
    // forward (acceleration)
    for (let k = 0; k < n; k++) {
      const i = k, j = (k + 1) % n;
      const a = (driveForce(ph, v[i]) - ph.kDrag * v[i] * v[i]) / ph.mass;
      v[j] = Math.min(v[j], Math.sqrt(Math.max(0, v[i] * v[i] + 2 * Math.max(0, a) * ds)));
    }
    // backward (braking)
    for (let k = n - 1; k >= 0; k--) {
      const i = k, j = (k + 1) % n;
      const b = ph.mu * ph.brake * 0.9 * (g + (ph.cl * v[j] * v[j]) / ph.mass) + (ph.kDrag * v[j] * v[j]) / ph.mass;
      v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * b * ds));
    }
  }
  let t = 0;
  for (let i = 0; i < n; i++) t += ds / Math.max(1, v[i]);
  return t;
}

const T_SLOW = 150, T_FAST = 64; // calibrated: slowest compact ~= 100, Formula Elite ~= 1000
export function performanceRating(ph) {
  const t = lapSim(ph);
  const x = (T_SLOW / t - 1) / (T_SLOW / T_FAST - 1);
  return Math.max(50, Math.round(100 + 900 * x));
}
