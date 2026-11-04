// Plays full holes with a simple bot through the real physics to check
// that generated holes are playable and scores land in a sane range.
// Run: node tools/bot_round.mjs [courseCount]
import { generateCourses } from '../src/data/courses.js';
import { HoleModel } from '../src/sim/hole.js';
import { makeEnv, computeLaunch, launchState, computePutt, ballAero, slopeLie } from '../src/sim/shot.js';
import { simulate, BALL_R } from '../src/sim/physics.js';
import { clubTable, suggestClub, powerFor, carryAt } from '../src/sim/caddie.js';
import { lieEffect } from '../src/sim/shot.js';
import { BALL_BY_ID } from '../src/data/equipment.js';
import { traitEffects } from '../src/data/traits.js';
import { RNG } from '../src/util/rng.js';

const courses = generateCourses();
const nCourses = parseInt(process.argv[2] || '6', 10);
const stats = { power: 80, accuracy: 80, irons: 80, shortGame: 80, putting: 80, recovery: 80, mental: 80, wind: 80, consistency: 80 };
const fx = traitEffects([]);
const ball = BALL_BY_ID.tourbal;
const aero = ballAero(ball, stats, fx);
const rng = new RNG(99);
const r01 = () => rng.next();

function playHole(course, h) {
  const hole = new HoleModel(course, h);
  const cond = { wind: { x: rng.float(-4, 4), z: rng.float(-4, 4) }, firmness: course.firm, stimp: course.stimp, altitude: course.style === 'Mountain' ? 1600 : 0 };
  const env = makeEnv(hole, cond);
  const table = clubTable(stats, fx, ball, aero, env.rho);
  let pos = hole.teeSpot();
  let lie = 'tee';
  let strokes = 0;
  const log = [];
  let plugged = false;
  while (strokes < 12) {
    const dPin = hole.distToPin(pos.x, pos.z);
    strokes++;
    let res;
    if (lie === 'green' || (lie === 'fringe' && dPin < 12)) {
      const heading = Math.atan2(hole.pin.x - pos.x, -(hole.pin.z - pos.z));
      // crude read: aim straight, pace to hole + 0.4 m
      const scale = 30;
      const pt = computePutt({ power: Math.min(1, (dPin + 0.4) / scale), scale, stimp: cond.stimp, heading, stats, fx, ball, devDeg: rng.gauss(0, 1.5), distToPin: dPin, rng: r01 });
      res = simulate({ pos: { x: pos.x, y: pos.y + BALL_R, z: pos.z }, vel: pt.vel, rolling: true, env, rng: r01 });
      log.push(`putt ${dPin.toFixed(1)}m -> ${res.outcome}`);
    } else {
      const reach = table.DR.carry;
      const aimCarry = Math.min(dPin, lie === 'tee' && hole.par > 3 ? reach : dPin);
      // Aim to land short of the pin and let it release; compensate for the lie
      const want = Math.min(aimCarry, dPin * (dPin < 60 ? 0.85 : 0.96));
      const lf = lieEffect(lie, { kind: 'wedge', id: 'SW' }, dPin, stats, fx, () => 0.5, plugged).speed;
      const sug = suggestClub(table, want / Math.pow(lf, 1.6), lie, lie === 'tee');
      const carry = carryAt(table[sug.clubId], sug.power);
      const aim = hole.suggestAim(pos.x, pos.z, Math.min(carry, dPin));
      const heading = Math.atan2(aim.x - pos.x, -(aim.z - pos.z));
      const L = computeLaunch({ clubId: sug.clubId, power: sug.power, devDeg: rng.gauss(0, 2.5), stats, fx, ball, lie, plugged, slope: slopeLie(hole, pos.x, pos.z, heading), distToPin: dPin, rng: r01, heading });
      const st = launchState(heading, L);
      res = simulate({ pos: { x: pos.x, y: pos.y + BALL_R + 0.01, z: pos.z }, vel: st.vel, spin: st.spin, env, ball: aero, rng: r01, pinIn: true });
      log.push(`${sug.clubId}@${(sug.power * 100).toFixed(0)}% ${lie} ${dPin.toFixed(0)}m -> ${res.outcome}/${res.restSurface} carry ${res.carry.toFixed(0)} tot ${res.total.toFixed(0)}`);
    }
    plugged = res.plugged;
    if (res.outcome === 'holed') return { strokes, log, hole };
    if (res.outcome === 'water') {
      strokes++;
      // drop near where it went in, back toward the tee
      const e = res.events.find((ev) => ev.type === 'water');
      let dx = pos.x - e.x, dz = pos.z - e.z;
      const dl = Math.hypot(dx, dz) || 1;
      let q = { x: e.x, z: e.z };
      for (let k = 0; k < 60 && hole.waterAt(q.x, q.z); k++) { q.x += (dx / dl) * 2; q.z += (dz / dl) * 2; }
      q.x += (dx / dl) * 2; q.z += (dz / dl) * 2;
      pos = { x: q.x, z: q.z, y: hole.heightAt(q.x, q.z) };
      lie = hole.surfaceAt(pos.x, pos.z);
      continue;
    }
    if (res.outcome === 'ob') { strokes++; continue; }
    pos = { x: res.rest.x, z: res.rest.z, y: hole.heightAt(res.rest.x, res.rest.z) };
    lie = res.restSurface;
  }
  return { strokes, log, hole, gaveUp: true };
}

let total = 0, parTotal = 0, holes = 0;
const dist = {};
const t0 = performance.now();
for (let ci = 0; ci < nCourses; ci++) {
  const course = courses[(ci * 17) % courses.length];
  let rs = 0;
  for (let h = 0; h < 18; h++) {
    const r = playHole(course, h);
    rs += r.strokes;
    const rel = r.strokes - r.hole.par;
    dist[rel] = (dist[rel] || 0) + 1;
    holes++;
    if (rel >= 3 || r.gaveUp) console.log(`  ${course.name} #${h + 1} par ${r.hole.par} -> ${r.strokes}\n    ${r.log.join('\n    ')}`);
  }
  total += rs; parTotal += course.par;
  console.log(`${course.name} (${course.style}) par ${course.par}: ${rs}`);
}
console.log('avg vs par per round', ((total - parTotal) / nCourses).toFixed(2), 'score dist', JSON.stringify(dist), 'ms', (performance.now() - t0).toFixed(0));
