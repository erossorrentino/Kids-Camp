// Scoring averages of the AI sim by overall rating, to calibrate against tour stats.
// Run: node tools/calibrate_sim.mjs
import { generatePros } from '../src/data/players.js';
import { generateCourses } from '../src/data/courses.js';
import { courseProfile, simRound, drawForm, drawDayForm } from '../src/sim/aisim.js';
import { traitEffects } from '../src/data/traits.js';
import { RNG } from '../src/util/rng.js';

const pros = generatePros();
const courses = generateCourses();
const rng = new RNG(5);
const r = () => rng.next();
const buckets = {};
const t0 = performance.now();
const profs = courses.slice(0, 25).map(courseProfile);
console.log('profiles built ms', (performance.now() - t0).toFixed(0));
let rounds = 0;
const t1 = performance.now();
for (const p of pros) {
  p.fx = traitEffects(p.traits);
  for (let k = 0; k < 24; k++) {
    const prof = profs[k % profs.length];
    const cond = { windMph: rng.float(3, 16), stimp: prof.stimp, firm: prof.firm };
    const form = drawForm(p, r) + drawDayForm(p, r);
    const sc = simRound(p, prof, cond, r, { form });
    const par = prof.holes.reduce((s, h) => s + h.par, 0);
    const tot = sc.reduce((a, b) => a + b, 0) - par;
    const b = Math.floor(p.ovr / 5) * 5;
    (buckets[b] ||= []).push(tot);
    rounds++;
  }
}
console.log('rounds', rounds, 'ms', (performance.now() - t1).toFixed(0));
for (const b of Object.keys(buckets).sort()) {
  const a = buckets[b];
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  const sd = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length);
  console.log(`OVR ${b}-${+b + 4}: n=${a.length} avg to par ${m.toFixed(2)} sd ${sd.toFixed(2)} best ${Math.min(...a)} worst ${Math.max(...a)}`);
}
