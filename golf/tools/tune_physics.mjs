// Fits the drag/lift model in src/sim/physics.js to tour-average launch
// monitor data (ball speed, launch, spin -> carry, peak height, land angle).
// Run: node tools/tune_physics.mjs [--search]
import { AERO, simulate, launch, flatEnv } from '../src/sim/physics.js';

const MPH = 0.44704;
const YD = 0.9144;
// club: ball speed mph, launch deg, spin rpm, carry yds, peak height yds, land angle deg
const DATA = [
  ['Driver', 167, 10.9, 2686, 275, 32, 38],
  ['3 Wood', 158, 9.2, 3655, 243, 30, 43],
  ['5 Wood', 152, 9.4, 4350, 230, 31, 47],
  ['Hybrid', 146, 10.2, 4437, 225, 29, 47],
  ['4 Iron', 137, 11.0, 4836, 203, 28, 48],
  ['5 Iron', 132, 12.1, 5361, 194, 31, 49],
  ['6 Iron', 127, 14.1, 6231, 183, 30, 50],
  ['7 Iron', 120, 16.3, 7097, 172, 32, 50],
  ['8 Iron', 115, 18.1, 7998, 160, 31, 50],
  ['9 Iron', 109, 20.4, 8647, 148, 30, 51],
  ['PW', 102, 24.2, 9304, 136, 29, 52],
];

function run(row) {
  const [, mph, la, rpm] = row;
  const { vel, spin } = launch({ heading: 0, speed: mph * MPH, launchDeg: la, spinRpm: rpm });
  const env = flatEnv();
  const r = simulate({ pos: { x: 0, y: 0.03, z: 0 }, vel, spin, env });
  return { carry: r.carry / YD, apex: r.apex / YD, land: (r.land.angle * 180) / Math.PI, total: r.total / YD };
}

function error() {
  let e = 0;
  for (const row of DATA) {
    const r = run(row);
    e += ((r.carry - row[4]) / 4) ** 2 + ((r.apex - row[5]) / 4) ** 2 + ((r.land - row[6]) / 5) ** 2;
  }
  return e;
}

function report() {
  console.log('AERO', JSON.stringify(AERO));
  console.log('club        carry(target)  apex(target)  land(target)  total');
  for (const row of DATA) {
    const r = run(row);
    console.log(
      row[0].padEnd(10),
      `${r.carry.toFixed(0).padStart(5)} (${row[4]})`.padEnd(14),
      `${r.apex.toFixed(0).padStart(4)} (${row[5]})`.padEnd(13),
      `${r.land.toFixed(0).padStart(4)} (${row[6]})`.padEnd(13),
      r.total.toFixed(0),
    );
  }
  console.log('error', error().toFixed(2));
}

if (process.argv.includes('--search')) {
  let best = { ...AERO };
  let bestE = error();
  const keys = ['cd0', 'cd1', 'cl1', 'clp', 'clMax', 'spinTau'];
  const scale = { cd0: 0.03, cd1: 0.08, cl1: 0.25, clp: 0.1, clMax: 0.04, spinTau: 8 };
  for (let it = 0; it < 4000; it++) {
    const temp = 1 - it / 4000;
    for (const k of keys) AERO[k] = best[k] + (Math.random() * 2 - 1) * scale[k] * (0.2 + temp);
    AERO.cd0 = Math.max(0.15, AERO.cd0);
    AERO.cd1 = Math.max(0, AERO.cd1);
    AERO.clp = Math.min(1.2, Math.max(0.3, AERO.clp));
    AERO.clMax = Math.min(0.45, Math.max(0.2, AERO.clMax));
    AERO.spinTau = Math.min(80, Math.max(8, AERO.spinTau));
    const e = error();
    if (e < bestE) { bestE = e; best = { ...AERO }; }
  }
  Object.assign(AERO, best);
  for (const k of keys) AERO[k] = Math.round(AERO[k] * 1000) / 1000;
}
report();

// Ground behaviour: rollout on fairway and green
import { stimpDecel } from '../src/sim/physics.js';
function groundReport(firmness) {
  console.log(`\nfirmness ${firmness}: carry / total on fairway / roll on green (yds), green = stimp 12`);
  for (const row of DATA) {
    const [, mph, la, rpm] = row;
    const { vel, spin } = launch({ heading: 0, speed: mph * MPH, launchDeg: la, spinRpm: rpm });
    const fw = simulate({ pos: { x: 0, y: 0.03, z: 0 }, vel, spin, env: flatEnv({ firmness }) });
    const gr = simulate({ pos: { x: 0, y: 0.03, z: 0 }, vel, spin, env: flatEnv({ firmness, surfaceAt: () => 'green', greenDecel: stimpDecel(12) }) });
    const rr = simulate({ pos: { x: 0, y: 0.03, z: 0 }, vel, spin, env: flatEnv({ firmness, surfaceAt: () => 'rough' }) });
    console.log(row[0].padEnd(10), (fw.carry / YD).toFixed(0).padStart(4), (fw.total / YD).toFixed(0).padStart(5), ' green roll', ((gr.total - gr.carry) / YD).toFixed(1).padStart(6), ' rough roll', ((rr.total - rr.carry) / YD).toFixed(1).padStart(6), ' bounces', fw.events.filter((e) => e.type === 'bounce').length);
  }
  // Wedges
  for (const [name, mph, la, rpm] of [['GW', 95, 27.5, 9700], ['SW', 87, 31, 10000], ['LW', 78, 35, 10200], ['SW 50%', 43.5, 33, 6500], ['LW 30%', 24, 38, 4500]]) {
    const { vel, spin } = launch({ heading: 0, speed: mph * MPH, launchDeg: la, spinRpm: rpm });
    const gr = simulate({ pos: { x: 0, y: 0.03, z: 0 }, vel, spin, env: flatEnv({ firmness, surfaceAt: () => 'green', greenDecel: stimpDecel(12) }) });
    console.log(name.padEnd(10), (gr.carry / YD).toFixed(0).padStart(4), ' green roll', ((gr.total - gr.carry) / YD).toFixed(1));
  }
}
groundReport(0.5);
groundReport(0.85);
