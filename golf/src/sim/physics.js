// Golf ball physics.
//
// Flight: gravity + aerodynamic drag + Magnus lift from backspin/sidespin,
// with drag/lift coefficients that depend on the spin ratio S = r*w/v, spin
// that decays during flight, wind (weaker near the ground) and air density
// that drops with altitude (mountain courses play longer).
//
// Ground: each bounce is a rigid-body impulse with a coefficient of
// restitution and Coulomb friction acting at the contact point, so backspin
// genuinely checks or spins the ball back and topspin releases it. Once the
// bounces die out the ball rolls: gravity along the slope (5/7 g sin for a
// rolling sphere) against a surface-specific rolling resistance. Greens use
// the course's Stimpmeter speed. The cup captures a ball only if it is slow
// enough to drop before crossing the hole (lip-outs happen otherwise).
//
// Units: meters, seconds, radians. y is up. The playing env supplies
// terrain and hazard queries (see HoleModel).

export const G = 9.81;
export const BALL_R = 0.021335;
export const BALL_M = 0.04593;
export const BALL_AREA = Math.PI * BALL_R * BALL_R;
export const CUP_R = 0.054;
export const PIN_R = 0.0125;
export const PIN_H = 2.13;
const I_K = 0.4; // I = k m r^2 (solid sphere; golf balls are very close)

// Fitted to tour launch-monitor data (see tools/tune_physics.mjs)
export const AERO = {
  cd0: 0.19,
  cd1: 0.462,
  cl1: 0.58,
  clp: 0.526,
  clMax: 0.386,
  spinTau: 40,
};

// Turf bounce (after A. R. Penner, "The run of a golf ball", 2002): the ball
// digs a small crater, which tilts the effective contact normal back toward
// where the ball came from, so fast steep landings lose far more forward
// speed than a rigid bounce would. `crater` scales that tilt per surface.
export const TURF = {
  crater: 1.0,
  craterMax: 0.62,
};

// e: restitution scale (1 = Penner's fairway fit), mu: friction,
// roll: rolling deceleration (m/s^2), crater: how much the ball digs in
export const SURFACES = {
  tee:     { e: 1.0,  mu: 0.43, roll: 1.0,  crater: 1.0,  label: 'Tee Box' },
  fairway: { e: 1.0,  mu: 0.43, roll: 1.1,  crater: 1.0,  label: 'Fairway' },
  fringe:  { e: 0.95, mu: 0.45, roll: 0.9,  crater: 1.05, label: 'Fringe' },
  green:   { e: 0.9,  mu: 0.45, roll: 0.5,  crater: 1.15, label: 'Green' },
  first:   { e: 0.85, mu: 0.5,  roll: 2.0,  crater: 1.15, label: 'First Cut' },
  rough:   { e: 0.6,  mu: 0.6,  roll: 4.0,  crater: 1.35, label: 'Rough' },
  deep:    { e: 0.35, mu: 0.8,  roll: 7.0,  crater: 1.6,  label: 'Deep Rough' },
  fescue:  { e: 0.35, mu: 0.8,  roll: 7.5,  crater: 1.6,  label: 'Fescue' },
  heather: { e: 0.35, mu: 0.8,  roll: 7.5,  crater: 1.6,  label: 'Heather' },
  waste:   { e: 0.8,  mu: 0.55, roll: 3.0,  crater: 0.8,  label: 'Waste Area' },
  bunker:  { e: 0.15, mu: 0.95, roll: 9.0,  crater: 2.0,  label: 'Bunker' },
  path:    { e: 1.9,  mu: 0.35, roll: 0.55, crater: 0.1,  label: 'Cart Path' },
};

export function stimpDecel(stimpFeet) {
  // Stimpmeter: ball leaves the ramp at 1.83 m/s and rolls `stimp` feet on flat green
  const d = stimpFeet * 0.3048;
  return (1.83 * 1.83) / (2 * d);
}

export function airDensity(altitudeM = 0) {
  return 1.225 * Math.exp(-altitudeM / 8500);
}

// ----- small vector helpers (plain objects for speed and portability) -----
const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
const len = (a) => Math.hypot(a.x, a.y, a.z);
const cross = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

// Heading 0 = toward -z; positive heading turns right (+x).
export function headingVec(h) {
  return v3(Math.sin(h), 0, -Math.cos(h));
}
export function rightVec(h) {
  return v3(Math.cos(h), 0, Math.sin(h));
}

/**
 * Initial velocity + spin vectors.
 * startDeg: horizontal start direction relative to heading (+ = right)
 * axisDeg: spin-axis tilt (+ = ball curves right, i.e. fade/slice for a right-hander)
 */
export function launch({ heading, speed, launchDeg, startDeg = 0, spinRpm, axisDeg = 0 }) {
  const h = heading + (startDeg * Math.PI) / 180;
  const la = (launchDeg * Math.PI) / 180;
  const f = headingVec(h);
  const vel = v3(f.x * Math.cos(la) * speed, Math.sin(la) * speed, f.z * Math.cos(la) * speed);
  const r = rightVec(h);
  const t = (axisDeg * Math.PI) / 180;
  const w = (spinRpm * 2 * Math.PI) / 60;
  // Backspin axis points to the right of travel; tilting it down on the right curves the ball right
  const spin = v3(r.x * Math.cos(t) * w, -Math.sin(t) * w, r.z * Math.cos(t) * w);
  return { vel, spin };
}

function aeroAccel(p, v, w, env, ball, out) {
  // Wind is stronger with height above ground (simple log-ish profile)
  const ground = env.heightAt(p.x, p.z);
  const hAbove = Math.max(0, p.y - ground);
  const prof = env.windProfile ? Math.min(1, 0.45 + hAbove / 40) : 1;
  const wm = ball.wind * prof;
  const rx = v.x - env.wind.x * wm;
  const ry = v.y;
  const rz = v.z - env.wind.z * wm;
  const speed = Math.hypot(rx, ry, rz) || 1e-6;
  const wmag = Math.hypot(w.x, w.y, w.z);
  const S = (BALL_R * wmag) / speed;
  const cd = (AERO.cd0 + AERO.cd1 * Math.min(S, 0.4)) * ball.drag;
  const cl = Math.min(AERO.clMax, AERO.cl1 * Math.pow(S, AERO.clp)) * ball.lift;
  const k = (0.5 * env.rho * BALL_AREA) / BALL_M;
  out.x = -k * cd * speed * rx;
  out.y = -k * cd * speed * ry - G;
  out.z = -k * cd * speed * rz;
  if (wmag > 1e-3) {
    // lift along w x v
    const cx = w.y * rz - w.z * ry;
    const cy = w.z * rx - w.x * rz;
    const cz = w.x * ry - w.y * rx;
    const cm = Math.hypot(cx, cy, cz) || 1e-9;
    const L = (k * cl * speed * speed) / cm;
    out.x += L * cx;
    out.y += L * cy;
    out.z += L * cz;
  }
  return out;
}

const DEFAULT_BALL = { drag: 1, lift: 1, wind: 1 };

function surfaceParams(env, s) {
  const base = SURFACES[s] || SURFACES.rough;
  const firm = env.firmness ?? 0.5; // 0 soft .. 1 firm
  const e = base.e * (0.8 + 0.4 * firm);
  let roll = base.roll * (1.25 - 0.5 * firm);
  if (s === 'green') roll = env.greenDecel;
  if (s === 'fringe') roll = Math.max(env.greenDecel * 1.8, base.roll * (1.2 - 0.4 * firm));
  const crater = base.crater * (1.35 - 0.7 * firm) * TURF.crater;
  return { e, mu: base.mu, roll, crater };
}

// Penner's fit for turf restitution vs normal impact speed (m/s)
function turfCOR(vn) {
  const v = Math.min(vn, 20);
  return Math.max(0.12, 0.51 - 0.0375 * v + 0.000903 * v * v);
}

/**
 * Simulate a shot until the ball comes to rest, holes out, or hits a hazard.
 * @param {object} o
 *   pos, vel, spin: initial state
 *   env: hole environment (heightAt, normalAt, surfaceAt, waterAt, isOB, treesNear, cup, rho, wind, ...)
 *   ball: ball aero multipliers
 *   rolling: start in rolling mode (putts)
 *   rng: function returning 0..1 (for tree deflections, lip-outs)
 *   pinIn: flagstick in the hole
 */
export function simulate(o) {
  const env = o.env;
  const ball = o.ball || DEFAULT_BALL;
  const rng = o.rng || Math.random;
  const dt = 1 / 240;
  const p = v3(o.pos.x, o.pos.y, o.pos.z);
  const v = v3(o.vel.x, o.vel.y, o.vel.z);
  const w = v3(o.spin ? o.spin.x : 0, o.spin ? o.spin.y : 0, o.spin ? o.spin.z : 0);
  let rolling = !!o.rolling;
  const samples = [];
  const events = [];
  const start = v3(p.x, p.y, p.z);
  let t = 0;
  let apex = p.y;
  let apexT = 0;
  let firstLand = null;
  let lastSurface = env.surfaceAt(p.x, p.z);
  let outcome = 'rest';
  let bounces = 0;
  let stillFor = 0;
  let plugged = false;
  let overCup = false;
  const a = v3();
  const a2 = v3();
  const pm = v3();
  const vm = v3();
  const maxT = o.maxTime || 60;
  const cup = env.cup;
  let stepCount = 0;
  const pushSample = () => samples.push(t, p.x, p.y, p.z, rolling ? 1 : 0);
  pushSample();

  while (t < maxT) {
    stepCount++;
    if (!rolling) {
      // --- flight: midpoint (RK2) integration ---
      aeroAccel(p, v, w, env, ball, a);
      pm.x = p.x + v.x * dt * 0.5; pm.y = p.y + v.y * dt * 0.5; pm.z = p.z + v.z * dt * 0.5;
      vm.x = v.x + a.x * dt * 0.5; vm.y = v.y + a.y * dt * 0.5; vm.z = v.z + a.z * dt * 0.5;
      aeroAccel(pm, vm, w, env, ball, a2);
      const px = p.x, py = p.y, pz = p.z;
      p.x += vm.x * dt; p.y += vm.y * dt; p.z += vm.z * dt;
      v.x += a2.x * dt; v.y += a2.y * dt; v.z += a2.z * dt;
      const decay = Math.exp(-dt / AERO.spinTau);
      w.x *= decay; w.y *= decay; w.z *= decay;
      t += dt;
      if (p.y > apex) { apex = p.y; apexT = t; }

      if (!env.inBounds(p.x, p.z)) {
        outcome = 'ob';
        events.push({ type: 'ob', t, x: p.x, y: p.y, z: p.z });
        pushSample();
        break;
      }

      // Flagstick
      if (o.pinIn && cup) {
        const dx = p.x - cup.x, dz = p.z - cup.z;
        const dh = Math.hypot(dx, dz);
        if (dh < BALL_R + PIN_R && p.y > cup.y && p.y < cup.y + PIN_H) {
          const nx = dx / (dh || 1), nz = dz / (dh || 1);
          const vn = v.x * nx + v.z * nz;
          if (vn < 0) {
            v.x -= 1.35 * vn * nx; v.z -= 1.35 * vn * nz;
            v.x *= 0.55; v.z *= 0.55;
            events.push({ type: 'pin', t, x: p.x, y: p.y, z: p.z });
          }
        }
      }

      // Trees
      if (env.treesNear) {
        const trees = env.treesNear(p.x, p.z);
        for (let i = 0; i < trees.length; i++) {
          const tr = trees[i];
          const dx = p.x - tr.x, dz = p.z - tr.z;
          const dh = Math.hypot(dx, dz);
          // trunk
          if (p.y < tr.y + tr.trunkH && dh < tr.trunkR + BALL_R) {
            const nx = dx / (dh || 1), nz = dz / (dh || 1);
            const vn = v.x * nx + v.z * nz;
            if (vn < 0) {
              v.x -= 1.4 * vn * nx; v.z -= 1.4 * vn * nz;
              v.x *= 0.6; v.y *= 0.6; v.z *= 0.6;
              events.push({ type: 'tree', t, x: p.x, y: p.y, z: p.z });
            }
          }
          // canopy (ellipsoid or cone)
          const cy = (p.y - tr.canopyY) / tr.canopyH;
          if (Math.abs(cy) < 1) {
            let rad = tr.canopyR;
            if (tr.shape === 'cone') rad = tr.canopyR * (1 - (cy + 1) / 2);
            else rad = tr.canopyR * Math.sqrt(1 - cy * cy);
            if (dh < rad) {
              const sp = Math.hypot(v.x, v.y, v.z);
              const damp = Math.exp(-tr.density * 1.2 * dt);
              v.x *= damp; v.y *= damp; v.z *= damp;
              if (rng() < tr.density * 5 * dt * Math.min(1, sp / 15)) {
                // Branch strike: random deflection, big speed loss
                const keep = 0.25 + rng() * 0.35;
                const rx = rng() - 0.5, ry = rng() - 0.7, rz = rng() - 0.5;
                v.x = v.x * keep * 0.5 + rx * sp * keep;
                v.y = v.y * keep * 0.5 + ry * sp * keep;
                v.z = v.z * keep * 0.5 + rz * sp * keep;
                w.x *= 0.3; w.y *= 0.3; w.z *= 0.3;
                events.push({ type: 'tree', t, x: p.x, y: p.y, z: p.z });
              }
            }
          }
        }
      }

      // Water surface
      const wat = env.waterAt(p.x, p.z);
      if (wat && p.y - BALL_R <= wat.level) {
        outcome = 'water';
        events.push({ type: 'water', t, x: p.x, y: wat.level, z: p.z });
        p.y = wat.level;
        pushSample();
        break;
      }

      // Ground contact
      const gh = env.heightAt(p.x, p.z);
      if (p.y - BALL_R <= gh) {
        // back up to the contact point along the step
        const prevGap = py - BALL_R - env.heightAt(px, pz);
        const gap = p.y - BALL_R - gh;
        const f = prevGap > 0 ? prevGap / (prevGap - gap) : 0;
        p.x = px + (p.x - px) * f;
        p.z = pz + (p.z - pz) * f;
        p.y = env.heightAt(p.x, p.z) + BALL_R;
        const surf = env.surfaceAt(p.x, p.z);
        lastSurface = surf;
        if (!firstLand) {
          firstLand = { x: p.x, y: p.y, z: p.z, t, surface: surf, speed: len(v), angle: Math.atan2(-v.y, Math.hypot(v.x, v.z)) };
        }
        // Holed on the fly?
        if (cup) {
          const dc = Math.hypot(p.x - cup.x, p.z - cup.z);
          if (dc < CUP_R - BALL_R * 0.3 && (o.pinIn ? -v.y < 9 : -v.y < 5) && Math.hypot(v.x, v.z) < (o.pinIn ? 9 : 4)) {
            outcome = 'holed';
            p.x = cup.x; p.z = cup.z; p.y = cup.y - 0.05;
            events.push({ type: 'holed', t, x: p.x, y: p.y, z: p.z });
            pushSample();
            break;
          }
        }
        const n0 = env.normalAt(p.x, p.z);
        const sp = surfaceParams(env, surf);
        const vn0 = dot(v, n0);
        if (vn0 < 0) {
          bounces++;
          events.push({ type: 'bounce', t, x: p.x, y: p.y, z: p.z, surface: surf, speed: -vn0 });
          // Plugged in a bunker
          if (surf === 'bunker' && -vn0 > 11 && bounces === 1 && rng() < 0.55) {
            plugged = true;
            v.x = v.y = v.z = 0;
            pushSample();
            break;
          }
          // Crater: tilt the contact normal back against the direction of travel
          const speedIn = len(v);
          const vt0 = v3(v.x - vn0 * n0.x, v.y - vn0 * n0.y, v.z - vn0 * n0.z);
          const vt0m = len(vt0) || 1e-9;
          const impactAng = Math.atan2(-vn0, vt0m);
          const thc = Math.min(TURF.craterMax, sp.crater * 0.2687 * (speedIn / 18.6) * (impactAng / 0.768));
          const c = Math.cos(thc), s = Math.sin(thc);
          const n = v3(n0.x * c - (vt0.x / vt0m) * s, n0.y * c - (vt0.y / vt0m) * s, n0.z * c - (vt0.z / vt0m) * s);
          const vn = dot(v, n);
          const e = turfCOR(-vn) * sp.e;
          // Contact point velocity (tangential): vt + w x (-r n)
          const vt = v3(v.x - vn * n.x, v.y - vn * n.y, v.z - vn * n.z);
          const rc = v3(-BALL_R * n.x, -BALL_R * n.y, -BALL_R * n.z);
          const wr = cross(w, rc);
          const uc = v3(vt.x + wr.x, vt.y + wr.y, vt.z + wr.z);
          const ucm = len(uc);
          const Jn = -(1 + e) * vn;
          const maxJt = sp.mu * Jn;
          let jt = ucm / (1 + 1 / I_K); // impulse needed to stop slipping (per unit mass)
          if (jt > maxJt) jt = maxJt;
          if (ucm > 1e-6) {
            const J = v3((-uc.x / ucm) * jt, (-uc.y / ucm) * jt, (-uc.z / ucm) * jt);
            v.x = vt.x + J.x - e * vn * n.x;
            v.y = vt.y + J.y - e * vn * n.y;
            v.z = vt.z + J.z - e * vn * n.z;
            const dw = cross(rc, J);
            const s = 1 / (I_K * BALL_R * BALL_R);
            w.x += dw.x * s; w.y += dw.y * s; w.z += dw.z * s;
          } else {
            v.x = vt.x - e * vn * n.x;
            v.y = vt.y - e * vn * n.y;
            v.z = vt.z - e * vn * n.z;
          }
          // Spin-back: a rigid bounce overstates how hard the ball zips back,
          // since real turf tears and the ball skids. Keep a fraction of it.
          const vtn = dot(v, n0);
          const tx = v.x - vtn * n0.x, ty = v.y - vtn * n0.y, tz = v.z - vtn * n0.z;
          if (tx * vt0.x + ty * vt0.y + tz * vt0.z < 0) {
            v.x = tx * 0.35 + vtn * n0.x; v.y = ty * 0.35 + vtn * n0.y; v.z = tz * 0.35 + vtn * n0.z;
          }
          // Settle into a roll once the bounce is tiny
          const vnAfter = dot(v, n0);
          if (vnAfter < 0.9 || surf === 'bunker') {
            v.x -= vnAfter * n0.x; v.y -= vnAfter * n0.y; v.z -= vnAfter * n0.z;
            rolling = true;
          }
          p.y += 0.001;
        }
      }
    } else {
      // --- rolling on the surface ---
      const surf = env.surfaceAt(p.x, p.z);
      lastSurface = surf;
      const sp = surfaceParams(env, surf);
      const n = env.normalAt(p.x, p.z);
      // Gravity along the slope: g_t = g - (g.n)n with g = (0,-G,0),
      // times 5/7 for a sphere that rolls without slipping
      const ax = (5 / 7) * G * n.y * n.x;
      const ay = (5 / 7) * G * (n.y * n.y - 1);
      const az = (5 / 7) * G * n.y * n.z;
      let speed = len(v);
      const slopeAcc = Math.hypot(ax, ay, az);
      const decel = sp.roll * n.y;
      if (speed < 0.02 && slopeAcc < decel * 0.95) {
        stillFor += dt;
        v.x = v.y = v.z = 0;
        if (cup && Math.hypot(p.x - cup.x, p.z - cup.z) < CUP_R) {
          outcome = 'holed';
          p.x = cup.x; p.z = cup.z; p.y = cup.y - 0.05;
          events.push({ type: 'holed', t, x: p.x, y: p.y, z: p.z });
          pushSample();
          break;
        }
        if (stillFor > 0.05) { pushSample(); break; }
      } else {
        stillFor = 0;
        v.x += ax * dt; v.y += ay * dt; v.z += az * dt;
        speed = len(v);
        if (speed > 1e-6) {
          const dv = Math.min(speed, decel * dt);
          v.x -= (v.x / speed) * dv; v.y -= (v.y / speed) * dv; v.z -= (v.z / speed) * dv;
        }
      }
      const px = p.x, pz = p.z;
      p.x += v.x * dt;
      p.z += v.z * dt;
      p.y = env.heightAt(p.x, p.z) + BALL_R;
      // keep velocity in the tangent plane of the new point
      const n2 = env.normalAt(p.x, p.z);
      const vn2 = dot(v, n2);
      v.x -= vn2 * n2.x; v.y -= vn2 * n2.y; v.z -= vn2 * n2.z;
      t += dt;

      if (!env.inBounds(p.x, p.z)) { outcome = 'ob'; events.push({ type: 'ob', t, x: p.x, y: p.y, z: p.z }); pushSample(); break; }

      // Cup capture: closest approach of this step's segment to the cup center
      if (cup) {
        const sx = p.x - px, sz = p.z - pz;
        const segL2 = sx * sx + sz * sz || 1e-12;
        let u = ((cup.x - px) * sx + (cup.z - pz) * sz) / segL2;
        u = Math.max(0, Math.min(1, u));
        const cx = px + sx * u, cz = pz + sz * u;
        const d = Math.hypot(cx - cup.x, cz - cup.z);
        if (d < CUP_R) {
          if (!overCup) {
            // Decide once per crossing, on entry
            overCup = true;
            const hs = Math.hypot(v.x, v.z);
            // How far the ball's line passes from the cup center sets the chord it crosses
            const lineD = hs > 1e-6 ? Math.abs((v.x * (cup.z - p.z) - v.z * (cup.x - p.x)) / hs) : d;
            const chord = 2 * Math.sqrt(Math.max(0, CUP_R * CUP_R - lineD * lineD));
            const vMax = chord / Math.sqrt((2 * BALL_R) / G);
            if (hs < vMax || (hs < vMax * 1.2 && rng() < 0.3)) {
              outcome = 'holed';
              p.x = cup.x; p.z = cup.z; p.y = cup.y - 0.05;
              events.push({ type: 'holed', t, x: p.x, y: p.y, z: p.z });
              pushSample();
              break;
            }
            // Too fast: catches the far lip. Edge hits deflect, center hits hop over.
            const edge = lineD / CUP_R;
            const side = (cx - cup.x) * v.z - (cz - cup.z) * v.x > 0 ? 1 : -1;
            const ang = edge > 0.4 ? side * edge * 0.9 : 0;
            const c = Math.cos(ang), s = Math.sin(ang);
            const nx = v.x * c - v.z * s, nz = v.x * s + v.z * c;
            const keep = 0.8 - 0.15 * (1 - edge);
            v.x = nx * keep; v.z = nz * keep;
            events.push({ type: 'lip', t, x: p.x, y: p.y, z: p.z });
          }
        } else if (d > CUP_R + 0.01) {
          overCup = false;
        }
      }
      // Water while rolling
      const wat = env.waterAt(p.x, p.z);
      if (wat && env.heightAt(p.x, p.z) < wat.level) {
        outcome = 'water';
        events.push({ type: 'water', t, x: p.x, y: wat.level, z: p.z });
        p.y = wat.level;
        pushSample();
        break;
      }
      // Tree trunks block a rolling ball
      if (env.treesNear) {
        const trees = env.treesNear(p.x, p.z);
        for (const tr of trees) {
          const dx = p.x - tr.x, dz = p.z - tr.z;
          const dh = Math.hypot(dx, dz);
          if (dh < tr.trunkR + BALL_R) {
            const nx = dx / (dh || 1), nz = dz / (dh || 1);
            const vn = v.x * nx + v.z * nz;
            if (vn < 0) { v.x -= 1.3 * vn * nx; v.z -= 1.3 * vn * nz; }
          }
        }
      }
    }
    if (stepCount % 4 === 0) pushSample();
  }
  if (!firstLand && outcome !== 'water' && outcome !== 'ob') {
    firstLand = { x: p.x, y: p.y, z: p.z, t, surface: lastSurface };
  }
  const restSurface = outcome === 'rest' ? env.surfaceAt(p.x, p.z) : lastSurface;
  if (outcome === 'rest' && env.isOB(p.x, p.z)) outcome = 'ob';
  const land = firstLand || { x: p.x, y: p.y, z: p.z };
  return {
    samples: new Float32Array(samples),
    events,
    outcome,
    plugged,
    rest: { x: p.x, y: p.y, z: p.z },
    restSurface,
    land,
    apex: apex - start.y,
    apexT,
    duration: t,
    carry: Math.hypot(land.x - start.x, land.z - start.z),
    total: Math.hypot(p.x - start.x, p.z - start.z),
    start,
  };
}

// Flat-ground environment used by the tuner and the club distance table
export function flatEnv(extra = {}) {
  return Object.assign({
    heightAt: () => 0,
    normalAt: () => ({ x: 0, y: 1, z: 0 }),
    surfaceAt: () => 'fairway',
    waterAt: () => null,
    isOB: () => false,
    inBounds: () => true,
    treesNear: null,
    cup: null,
    rho: 1.225,
    wind: { x: 0, z: 0 },
    windProfile: true,
    firmness: 0.5,
    greenDecel: stimpDecel(11),
  }, extra);
}
