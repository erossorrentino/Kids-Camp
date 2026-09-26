// Turns a swing (power, path deviation) plus the golfer's stats, traits,
// ball, lie and slope into launch conditions for the physics.
import { CLUB_BY_ID } from '../data/equipment.js';
import { airDensity, stimpDecel, launch, simulate, BALL_R } from './physics.js';

const deg = Math.PI / 180;

export function speedFactor(stats) {
  // Tour-average swing speed at Power 64
  return 0.875 + stats.power * 0.00195;
}

export function makeEnv(hole, cond) {
  return {
    heightAt: (x, z) => hole.heightAt(x, z),
    normalAt: (x, z) => hole.normalAt(x, z),
    surfaceAt: (x, z) => hole.surfaceAt(x, z),
    waterAt: (x, z) => hole.waterAt(x, z),
    isOB: (x, z) => hole.isOB(x, z),
    inBounds: (x, z) => hole.inBounds(x, z),
    treesNear: (x, z) => hole.treesNear(x, z),
    cup: hole.cup,
    rho: airDensity(cond.altitude || 0),
    wind: cond.wind,
    windProfile: true,
    firmness: cond.firmness,
    greenDecel: stimpDecel(cond.stimp),
  };
}

// Ball aero multipliers for this golfer (wind skill + traits + ball)
export function ballAero(ball, stats, fx) {
  return {
    drag: ball.drag,
    lift: ball.lift,
    wind: ball.wind * fx.wind * (1.2 - stats.wind * 0.005),
  };
}

function skillForClub(club, power, stats) {
  if (club.kind === 'wood' || club.kind === 'hybrid') return stats.accuracy;
  if (club.kind === 'wedge') return power < 0.6 ? stats.shortGame : (stats.irons + stats.shortGame) / 2;
  return stats.irons;
}

// Lie effects: returns multipliers and dispersion
export function lieEffect(lie, club, distToPin, stats, fx, rng, plugged, gear = null) {
  const out = { speed: 1, spin: 1, launch: 0, disp: 1, note: '' };
  const rec = (factor, kind) => {
    // Recovery skill, traits and club design reduce how much of the penalty applies
    let scale = (1.3 - stats.recovery / 100) * (kind === 'bunker' ? fx.bunker : fx.rough);
    if (gear) scale *= 1 - (kind === 'bunker' ? gear.sand : gear.rough);
    return 1 - (1 - factor) * Math.max(0.1, scale);
  };
  switch (lie) {
    case 'tee':
      break;
    case 'fairway':
      if (club.id === 'DR' && gear && gear.deck) { out.speed = 0.98; out.launch = -1; out.disp = 1.08; out.note = 'Mini driver off the deck'; }
      else if (club.id === 'DR') { out.speed = 0.93; out.launch = -2.5; out.disp = 1.3; out.note = 'Driver off the deck'; }
      break;
    case 'fringe':
    case 'first':
      out.speed = 0.985; out.spin = 0.9;
      break;
    case 'rough': {
      const flier = rng() < 0.25;
      out.speed = rec(flier ? 0.97 : 0.9 - rng() * 0.05, 'rough');
      out.spin = flier ? 0.5 : 0.72;
      out.launch = -1;
      out.disp = 1.25;
      if (club.kind === 'wood') out.speed *= 0.9;
      out.note = flier ? 'Flier lie: less spin, it will run' : 'Rough';
      break;
    }
    case 'deep':
    case 'fescue':
    case 'heather':
      out.speed = rec(0.7 - rng() * 0.08, 'rough');
      out.spin = 0.5;
      out.launch = 1.5;
      out.disp = 1.6;
      if (club.kind === 'wood' || club.kind === 'hybrid') out.speed *= 0.6;
      out.note = 'Buried in thick grass';
      break;
    case 'waste':
      out.speed = rec(0.95, 'bunker'); out.spin = 0.85; out.disp = 1.1;
      break;
    case 'bunker':
      if (plugged) {
        out.speed = rec(0.5, 'bunker'); out.spin = 0.3; out.launch = 4; out.disp = 1.8; out.note = 'Plugged: fried egg lie';
      } else if (club.kind === 'wedge' && distToPin < 55) {
        out.speed = rec(0.62, 'bunker'); out.spin = 0.6; out.launch = 6; out.disp = 1.2; out.note = 'Splash shot: the sand eats distance';
      } else if (club.kind === 'wood') {
        out.speed = rec(0.72, 'bunker'); out.spin = 0.7; out.disp = 1.5; out.note = 'Wood from the sand';
      } else {
        out.speed = rec(0.9, 'bunker'); out.spin = 0.8; out.disp = 1.2; out.note = 'Fairway bunker: pick it clean';
      }
      break;
    default:
      break;
  }
  return out;
}

// Slope at the ball, relative to the aim direction: uphill (+) and side (+ = ball above feet)
export function slopeLie(hole, x, z, heading) {
  const n = hole.normalAt(x, z);
  const fx = Math.sin(heading), fz = -Math.cos(heading);
  const rx = Math.cos(heading), rz = Math.sin(heading);
  // ground gradient = -n.xz / n.y
  const gx = -n.x / n.y, gz = -n.z / n.y;
  const up = (gx * fx + gz * fz); // rise per meter toward target
  const side = (gx * rx + gz * rz); // rise per meter to the right (ball side for a right-hander)
  return { uphillDeg: Math.atan(up) / deg, sideDeg: Math.atan(side) / deg };
}

/**
 * Build launch conditions for a full / partial swing.
 * input: { clubId, power (0-1.1), devDeg (swing path error), tempo (0.6-1), shape {x,y}, heading,
 *          stats, fx, ball, lie, plugged, slope {uphillDeg, sideDeg}, distToPin, pressure (0-1), rng, noRandom }
 */
export function computeLaunch(inp) {
  const club = CLUB_BY_ID[inp.clubId];
  const { stats, fx, ball } = inp;
  // Predictions use the typical lie (no flier, mid-range loss) so the aim ring stays put
  const rng = inp.noRandom ? () => 0.5 : inp.rng || Math.random;
  const gauss = () => {
    if (inp.noRandom) return 0;
    let u = 0, v = 0;
    while (!u) u = rng();
    while (!v) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const p = Math.max(0.02, inp.power);
  // The club model in the bag for this club (distance, launch, spin, forgiveness...)
  const gear = inp.gear || { speed: 1, launch: 0, spin: 1, forgive: 0.5, work: 1, bias: 0, sand: 0, rough: 0 };
  const lie = lieEffect(inp.lie, club, inp.distToPin ?? 999, stats, fx, rng, inp.plugged, gear);
  let sf = speedFactor(stats);
  if (club.kind === 'wood' || club.kind === 'hybrid') sf *= fx.speedDrive;
  const soft = ball.soft ? 1 + ball.soft * 0.02 * ((70 - stats.power) / 40) : 1;
  const tempo = inp.tempo ?? 1;
  let speed = club.speed * sf * ball.speed * soft * p * lie.speed * tempo * gear.speed;

  const isWood = club.kind === 'wood' || club.kind === 'hybrid';
  let spin = club.spin * (0.32 + 0.68 * Math.min(p, 1)) * (isWood ? ball.spinD : ball.spinW) * lie.spin * gear.spin;
  if (!isWood) spin *= fx.spinMult;
  let launchDeg = club.launch + lie.launch + gear.launch + (club.kind === 'wedge' ? (1 - Math.min(p, 1)) * 4 : 0);

  // Intentional shaping from the impact-point control
  const shape = inp.shape || { x: 0, y: 0 };
  launchDeg -= shape.y * 2.5;
  spin *= 1 - shape.y * 0.3;
  speed *= 1 - Math.abs(shape.y) * 0.02 - Math.abs(shape.x) * 0.015;

  // Slope lies
  const sl = inp.slope || { uphillDeg: 0, sideDeg: 0 };
  launchDeg += sl.uphillDeg * 0.8;
  speed *= 1 - Math.abs(sl.uphillDeg) * 0.004;

  // Swing path error -> face / path -> start line + curvature
  const dz = 3;
  const dev = inp.devDeg || 0;
  const e = Math.sign(dev) * Math.max(0, Math.abs(dev) - dz);
  const skill = skillForClub(club, p, stats);
  let k = 1.45 - skill * 0.008;
  if (isWood) k *= fx.driverErr;
  else if (club.kind === 'wedge' && p < 0.6) k *= fx.chipErr;
  else k *= fx.ironErr;
  const over = Math.max(0, p - 1);
  k *= 1 + over * 6; // overswinging past 100% costs accuracy fast
  k *= 1.45 - 0.9 * gear.forgive; // a bigger sweet spot forgives a crooked swing
  let startDeg = e * 0.25 * k;
  let axisDeg = e * 1.15 * k * ball.side;
  axisDeg += shape.x * 9 * ball.side * gear.work;
  startDeg -= shape.x * 2.2 * gear.work;
  if (p > 0.5) axisDeg += (fx.shapeBias + gear.bias) * ball.side;
  axisDeg -= sl.sideDeg * 1.4; // ball above feet draws, below feet fades

  // Random dispersion from skill, lie, pressure and traits
  const pressure = inp.pressure || 0;
  let pf = 1 + pressure * (1 - stats.mental / 100) * 0.9;
  if (fx.pressure < 0) pf *= 1 + pressure * 0.6;
  if (fx.pressure > 0) pf = 1 + (pf - 1) * 0.4;
  const D = (1.45 - skill / 100) * fx.dispersion * lie.disp * pf * (1 + over * 3) * (inp.dispMult || 1) * (1.25 - 0.5 * gear.forgive);
  const cons = 1.25 - stats.consistency * 0.004;
  startDeg += gauss() * 0.9 * D;
  axisDeg += gauss() * 2.6 * D * ball.side;
  speed *= 1 + gauss() * 0.012 * D * cons;
  launchDeg += gauss() * 0.5 * D;
  spin *= 1 + gauss() * 0.05 * D;

  return {
    speed, launchDeg, spinRpm: Math.max(0, spin), axisDeg, startDeg,
    lieNote: lie.note, club,
  };
}

export function launchState(heading, L) {
  return launch({ heading, speed: L.speed, launchDeg: L.launchDeg, startDeg: L.startDeg, spinRpm: L.spinRpm, axisDeg: L.axisDeg });
}

// Putting: power maps to "roll this far on a flat green"
export function computePutt(inp) {
  const { stats, fx, ball } = inp;
  const rng = inp.rng || Math.random;
  const gauss = () => {
    if (inp.noRandom) return 0;
    let u = 0, v = 0;
    while (!u) u = rng();
    while (!v) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const decel = stimpDecel(inp.stimp);
  const dist = Math.max(0.05, inp.power * inp.scale);
  let v0 = Math.sqrt(2 * decel * dist);
  const skill = (1.4 - stats.putting / 100) / ball.putt;
  const pressure = inp.pressure || 0;
  let pf = 1 + pressure * (1 - stats.mental / 100) * 0.8;
  if (fx.pressure < 0) pf *= 1 + pressure * 0.6;
  let fastPenalty = fx.fastGreens && inp.stimp >= 12.5 ? 1.35 : 1;
  const dz = 1.2;
  const dev = inp.devDeg || 0;
  const e = Math.sign(dev) * Math.max(0, Math.abs(dev) - dz);
  // Putter model: aim = start-line error, pace = speed error, nerve = calms pressure and yips
  const pt = inp.gear || { aim: 1, pace: 1, nerve: 0 };
  pf = 1 + (pf - 1) * (1 - pt.nerve * 0.6);
  let startDeg = e * 0.1 * (0.6 + skill) * pt.aim + gauss() * 0.3 * skill * pf * fastPenalty * pt.aim;
  v0 *= 1 + gauss() * 0.025 * skill * pf * fastPenalty * fx.lag * pt.pace;
  if (fx.yips && inp.distToPin < 2.5 && rng() < (fx.shortPuttMiss + pressure * 0.05) * (1 - pt.nerve)) {
    startDeg += (rng() < 0.5 ? -1 : 1) * (1.5 + rng() * 2);
  }
  const h = inp.heading + startDeg * deg;
  return { vel: { x: Math.sin(h) * v0, y: 0, z: -Math.cos(h) * v0 }, startDeg, v0 };
}

// Where a clean (error-free) shot would land and stop, for the aim ring and "plays like"
export function predictShot(hole, env, pos, heading, inp, withWind = false) {
  const L = computeLaunch({ ...inp, heading, noRandom: true, devDeg: 0, tempo: 1, pressure: 0 });
  const st = launchState(heading, L);
  const e = withWind ? env : { ...env, wind: { x: 0, z: 0 }, treesNear: null };
  const r = simulate({ pos: { x: pos.x, y: pos.y + BALL_R + 0.01, z: pos.z }, vel: st.vel, spin: st.spin, env: e, ball: inp.aero, maxTime: 15 });
  return r;
}
