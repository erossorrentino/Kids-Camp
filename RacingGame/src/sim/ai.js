// AI drivers. Each AI follows the circuit's racing line with a speed
// profile derived from its own car's power, grip, downforce, drag and brakes
// (so a Formula car really is faster than a hatchback), plus overtaking,
// defending, slipstreaming, a skill level and a little human variation.
// Motion is kinematic along the track frame, which keeps big fields smooth
// and stable while still reacting to contact with the player.
import { clamp, lerp, RNG } from '../core/rng.js';
import { DS } from './track.js';
import { CORNER_GRIP } from './vehicle.js';

const G = 9.81;

function driveForce(ph, v) {
  const P = ph.powerW * 0.88;
  const F = P / Math.max(v, 4);
  const Fmax = ph.ev ? ph.powerW / 22 : ph.powerW / 16;
  const share = ph.drive === 'AWD' ? 1 : ph.drive === 'FWD' ? ph.frontW * 0.92 : (1 - ph.frontW) * 1.08;
  const trac = ph.mu * (ph.mass * G + ph.cl * v * v) * Math.min(1, share);
  return Math.min(F, Fmax, trac);
}

export function accelAt(ph, v) {
  return (driveForce(ph, v) - ph.kDrag * v * v - 0.012 * ph.mass * G) / ph.mass;
}

export function brakeAt(ph, v) {
  return ph.mu * ph.brake * 0.9 * (G + (ph.cl * v * v) / ph.mass) + (ph.kDrag * v * v) / ph.mass;
}

// Max speed at each track sample along the racing line (m/s)
export function speedProfile(track, ph, gripScale = 1) {
  const N = track.N;
  const mu = ph.mu * gripScale * CORNER_GRIP; // cornering grip (braking below uses plain mu)
  const vmax = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const k = Math.abs(track.raceKappa[i]) + 1e-5;
    // banking helps (ovals)
    const bankBoost = 1 + Math.abs(Math.sin(track.bank[i])) * 1.6;
    const den = ph.mass * k - mu * ph.cl * bankBoost;
    vmax[i] = den <= 0 ? ph.vTop : Math.min(ph.vTop, Math.sqrt((mu * bankBoost * ph.mass * G) / den));
  }
  const v = Float32Array.from(vmax);
  for (let pass = 0; pass < 3; pass++) {
    for (let k = 0; k < N; k++) {
      const i = k, j = (k + 1) % N;
      const ds = DS * track.raceRatio[i];
      const a = Math.max(0, accelAt(ph, v[i]));
      v[j] = Math.min(v[j], Math.sqrt(v[i] * v[i] + 2 * a * ds));
    }
    for (let k = N - 1; k >= 0; k--) {
      const i = k, j = (k + 1) % N;
      const ds = DS * track.raceRatio[i];
      v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * brakeAt(ph, v[j]) * ds));
    }
  }
  return v;
}

export class AIDriver {
  constructor(track, ph, { skill = 0.95, seed = 1, name = 'AI', halfWidth = 0.95, halfLength = 2.3 } = {}) {
    this.track = track;
    this.p = ph;
    this.skill = skill;
    this.name = name;
    this.rng = new RNG(seed);
    this.profile = speedProfile(track, ph, 0.985);
    this.halfW = halfWidth; this.halfL = halfLength;
    this.s = 0; this.d = 0; this.v = 0;
    this.offset = 0; this.offsetTarget = 0; this.offsetTimer = 0;
    this.lateralV = 0;
    this.x = 0; this.y = 0; this.z = 0; this.heading = 0;
    this.steer = 0; this.roll = 0; this.pitch = 0;
    this.braking = false;
    this.frame = {};
    this.mood = this.rng.float(-0.015, 0.015); // per-race form
    this.wobble = this.rng.float(0, 100);
    this.held = true;
    this.bump = 0; // speed loss from contact
    this.rpm = 1000;
    this.gear = 1;
  }

  place(s, d) {
    this.s = s; this.d = d; this.offset = d - this.lineAt(s); this.offsetTarget = this.offset;
    this.v = 0;
    this.updatePose(0);
  }

  lineAt(s) {
    const tr = this.track;
    const f = (tr.wrapS(s)) / DS, i = Math.floor(f) % tr.N, j = (i + 1) % tr.N, t = f - Math.floor(f);
    return tr.raceLine[i] + (tr.raceLine[j] - tr.raceLine[i]) * t;
  }

  profileAt(s) {
    const tr = this.track;
    const f = (tr.wrapS(s)) / DS, i = Math.floor(f) % tr.N, j = (i + 1) % tr.N, t = f - Math.floor(f);
    return this.profile[i] + (this.profile[j] - this.profile[i]) * t;
  }

  // total progress (s) of other cars is compared in absolute distance
  update(dt, others, ctx = {}) {
    const tr = this.track;
    if (this.held) { this.v = 0; this.updatePose(dt); return; }
    const sWrapped = tr.wrapS(this.s);
    // ---- target speed: profile with lookahead, skill, mood, rubber band, slipstream
    let target = this.profileAt(this.s + this.v * 0.25);
    const look = Math.min(this.profileAt(this.s + 30), this.profileAt(this.s + 60));
    void look;
    let k = this.skill + this.mood;
    if (ctx.rubber) k += ctx.rubber;
    // slipstream: car directly ahead within 25m on a straight
    let slip = 0;
    let ahead = null, aheadGap = 1e9;
    for (const o of others) {
      if (o === this) continue;
      let gap = o.total - this.total;
      if (gap <= 0 || gap > 45) continue;
      const lat = Math.abs(o.d - this.d);
      if (lat < 2.6 && gap < aheadGap) { aheadGap = gap; ahead = o; }
      if (lat < 1.8 && gap < 28) slip = Math.max(slip, 1 - gap / 28);
    }
    target *= k * (1 + slip * 0.035);
    // going off-line costs corner speed
    const kap = Math.abs(tr.kappa[Math.floor(sWrapped / DS) % tr.N]);
    if (kap > 1 / 160) target *= 1 - Math.min(0.06, Math.abs(this.offset) * 0.012);
    target *= 1 - this.bump;
    this.bump = Math.max(0, this.bump - dt * 0.25);

    // ---- overtaking / avoidance
    this.offsetTimer -= dt;
    const hw = tr.hw[Math.floor(sWrapped / DS) % tr.N];
    const maxOff = hw - 1.3;
    if (ahead && aheadGap < 22) {
      const aheadSpeed = ahead.v ?? ahead.speed ?? 0;
      const closing = this.v - aheadSpeed;
      if (closing > -1 || aheadGap < 8) {
        if (this.offsetTimer <= 0) {
          // pick the side with more room relative to the car ahead
          const line = this.lineAt(this.s);
          const leftRoom = maxOff - (ahead.d) , rightRoom = (ahead.d) + maxOff;
          const side = leftRoom > rightRoom ? 1 : -1;
          this.offsetTarget = clamp(ahead.d + side * 3.0 - line, -maxOff - line, maxOff - line);
          this.offsetTimer = 2.5 + this.rng.next() * 1.5;
        }
        // don't drive into the back of them
        if (Math.abs(ahead.d - this.d) < 2.3 && aheadGap < 9) target = Math.min(target, aheadSpeed * (aheadGap < 5 ? 0.92 : 0.99));
      }
    } else if (this.offsetTimer <= 0) {
      this.offsetTarget = 0;
    }
    // ---- longitudinal
    const acc = accelAt(this.p, this.v) * (0.9 + this.skill * 0.1);
    const brk = brakeAt(this.p, this.v) * 0.95;
    const dv = target - this.v;
    this.braking = dv < -0.6;
    this.v += clamp(dv * 4, -brk, acc) * dt;
    this.v = Math.max(0, this.v);
    // ---- lateral
    const latRate = 2.6 * clamp(this.v / 20, 0.3, 1);
    const wob = Math.sin(this.wobble + this.s * 0.013) * 0.25 * (1.02 - this.skill) * 4;
    const desired = clamp(this.offsetTarget + wob, -maxOff - 2, maxOff + 2);
    const prevOff = this.offset;
    this.offset += clamp(desired - this.offset, -latRate * dt, latRate * dt);
    const line = this.lineAt(this.s);
    let d = clamp(line + this.offset, -maxOff, maxOff);
    this.lateralV = dt > 0 ? (d - this.d) / dt : 0;
    this.d = d;
    void prevOff;
    // ---- advance along the centreline (shorter on the inside)
    const kc = tr.kappa[Math.floor(sWrapped / DS) % tr.N];
    const ratio = clamp(1 - kc * this.d, 0.6, 1.4);
    const dsAlong = (this.v * dt) / ratio;
    this.s += dsAlong;
    this.total += dsAlong;
    this.updatePose(dt);
  }

  updatePose(dt) {
    const tr = this.track;
    const f = tr.frameAt(this.s, this.frame);
    const yawOff = this.v > 1 ? Math.atan2(this.lateralV, this.v) : 0;
    this.heading = f.heading + yawOff;
    this.x = f.x + f.lx * this.d;
    this.z = f.z + f.lz * this.d;
    this.y = tr.heightAt(f.i, f.t, this.d);
    const kap = tr.raceKappa[f.i];
    this.steer = clamp(Math.atan(kap * 2.7) * 1.2 + yawOff * 0.5, -0.5, 0.5);
    const ay = this.v * this.v * kap;
    this.roll = lerp(this.roll, clamp(-ay * 0.006, -0.06, 0.06), dt ? 1 - Math.exp(-dt * 5) : 1);
    const j = (f.i + 1) % tr.N;
    const grade = (tr.y[j] - tr.y[f.i]) / DS;
    this.groundPitch = -Math.atan(grade);
    this.groundRoll = Math.atan(Math.tan(tr.bank[f.i]));
    // fake engine rpm/gear for audio
    const vt = this.p.vTop;
    const gears = this.p.ev ? 1 : this.p.gears;
    const frac = clamp(this.v / vt, 0, 1);
    const g = Math.min(gears, 1 + Math.floor(frac * gears * 0.999));
    this.gear = g;
    const inGear = (frac * gears) - (g - 1);
    this.rpm = this.p.ev ? 800 + frac * this.p.redline : lerp(this.p.redline * 0.55, this.p.redline * 0.95, inGear);
  }

  get speed() { return this.v; }
}
