// Fires thousands of balls at the backboard from every direction and reports any frame where
// the ball's centre ends up inside the glass (i.e. it passed through instead of bouncing).
const fs = require('fs'), vm = require('vm'), path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'js');
let code = ['00-config.js', '01-util.js', '02-sim-core.js'].map((f) => fs.readFileSync(path.join(SRC, f), 'utf8').replace(/^'use strict';/, '')).join('\n');
code += '\n;globalThis.__api = { CT, physStep, DT };';
const ctx = vm.createContext({ console, Math, Date, Object, Array, Number, JSON });
vm.runInContext(code, ctx);
const { CT, physStep, DT } = ctx.__api;
let inside = 0, through = 0, shots = 0;
const rnd = (a, b) => a + Math.random() * (b - a);
for (let i = 0; i < 4000; i++) {
  const s = Math.random() < 0.5 ? 1 : -1;
  // aim at a random point on or around the glass, launched from in front, behind, above or the side
  const tx = s * (CT.BB_X + 0.06), ty = rnd(8.4, 13.2), tz = rnd(-3.6, 3.6);
  const from = Math.random();
  let ox, oy, oz;
  if (from < 0.45) { ox = s * rnd(20, 40); oy = rnd(6, 9); oz = rnd(-15, 15); }       // shots from the court
  else if (from < 0.65) { ox = s * rnd(46, 54); oy = rnd(4, 10); oz = rnd(-8, 8); }   // from behind the board
  else if (from < 0.85) { ox = s * rnd(40, 46); oy = rnd(16, 22); oz = rnd(-4, 4); }  // dropping onto the top edge
  else { ox = s * rnd(40, 46); oy = rnd(8, 13); oz = rnd(8, 14) * (Math.random() < 0.5 ? 1 : -1); } // from the side
  const b = { x: ox, y: oy, z: oz, vx: 0, vy: 0, vz: 0, hitRim: false, scoredSide: 0, floorHits: 0 };
  const T = rnd(0.35, 0.9), g = CT.G;
  b.vx = (tx - ox) / T; b.vz = (tz - oz) / T; b.vy = (ty - oy + 0.5 * g * T * T) / T;
  let bad = false, side = Math.sign(s * b.x - (CT.BB_X + 0.06)), px = b.x, py = b.y, pz = b.z;
  for (let k = 0; k < 150; k++) {
    physStep(b, DT, false);
    const ax = s * b.x, nside = Math.sign(ax - (CT.BB_X + 0.06));
    const inRect = (y, z) => Math.abs(z) < CT.BB_HW - 0.02 && y > CT.BB_BOT + 0.02 && y < CT.BB_TOP - 0.02;
    if (inRect(b.y, b.z) && ax > CT.BB_X + 0.01 && ax < CT.BB_X + 0.11) bad = true;          // centre inside the glass
    if (nside !== side) {                                                                   // crossed the glass plane
      const t = (CT.BB_X + 0.06 - s * px) / (ax - s * px || 1e-9);
      if (inRect(py + (b.y - py) * t, pz + (b.z - pz) * t)) { through++; bad = true; break; }
      side = nside;
    }
    px = b.x; py = b.y; pz = b.z;
  }
  if (bad) inside++;
  shots++;
}
console.log(`${shots} balls fired: ${inside} entered or crossed the glass (${(100 * inside / shots).toFixed(1)}%), ${through} passed straight through`);
process.exitCode = inside ? 1 : 0;
