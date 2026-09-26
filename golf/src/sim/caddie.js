// Club distance table and club / power suggestions ("caddie").
import { CLUBS } from '../data/equipment.js';
import { computeLaunch, launchState } from './shot.js';
import { simulate, flatEnv } from './physics.js';
import { gearFor } from '../data/clubsets.js';

// Carry and total (meters) for every club at full power on flat fairway
export function clubTable(stats, fx, ball, aero, rho = 1.225, bag = null) {
  const env = flatEnv({ rho });
  const out = {};
  for (const c of CLUBS) {
    if (c.kind === 'putter') continue;
    const gear = gearFor(bag, c.id);
    const L = computeLaunch({ clubId: c.id, power: 1, stats, fx, ball, gear, lie: 'tee', noRandom: true, heading: 0 });
    const st = launchState(0, L);
    const r = simulate({ pos: { x: 0, y: 0.03, z: 0 }, vel: st.vel, spin: st.spin, env, ball: aero, maxTime: 20 });
    // Carry at partial power, for inverting distance -> power
    const curve = [0];
    for (let i = 1; i <= 10; i++) {
      const Lp = computeLaunch({ clubId: c.id, power: i / 10, stats, fx, ball, gear, lie: 'tee', noRandom: true, heading: 0 });
      const sp = launchState(0, Lp);
      curve.push(simulate({ pos: { x: 0, y: 0.03, z: 0 }, vel: sp.vel, spin: sp.spin, env, ball: aero, maxTime: 20 }).carry);
    }
    out[c.id] = { carry: r.carry, total: r.total, curve };
  }
  return out;
}

// Power needed for a club to carry `dist` meters (interpolating the table curve)
export function powerFor(entry, dist) {
  const c = entry.curve;
  if (dist >= c[10]) return Math.min(1.1, 1 + (dist - c[10]) / c[10]);
  for (let i = 1; i <= 10; i++) {
    if (c[i] >= dist) return (i - 1 + (dist - c[i - 1]) / (c[i] - c[i - 1])) / 10;
  }
  return 1;
}

export function carryAt(entry, power) {
  const c = entry.curve;
  const f = Math.max(0, Math.min(10, power * 10));
  const i = Math.min(9, Math.floor(f));
  return c[i] + (c[i + 1] - c[i]) * (f - i);
}

// Pick the club whose full carry best covers `dist` (meters). Returns {clubId, power}
export function suggestClub(table, dist, lie, allowDriver = true) {
  const order = ['LW', 'SW', 'GW', 'PW', '9I', '8I', '7I', '6I', '5I', '4H', '5W', '3W', 'DR'];
  const usable = order.filter((id) => {
    if (id === 'DR' && (!allowDriver || lie !== 'tee')) return false;
    if (lie === 'bunker' && (id === 'DR' || id === '3W')) return false;
    if ((lie === 'deep' || lie === 'fescue' || lie === 'heather') && ['DR', '3W', '5W'].includes(id)) return false;
    return true;
  });
  for (const id of usable) {
    if (table[id].carry >= dist * 0.98) {
      const power = Math.min(1, powerFor(table[id], dist));
      return { clubId: id, power };
    }
  }
  const id = usable[usable.length - 1];
  return { clubId: id, power: 1 };
}

