// Player vehicle dynamics: a bicycle (two-axle) model with load transfer,
// a Pacejka-style tyre curve with friction ellipse, engine torque curve and
// gearbox (auto or manual, with clutch-slip launches), aerodynamic drag and
// downforce, slopes, surface grip, barrier collisions and optional driver
// assists (ABS, traction control, stability, countersteer, auto-brake).
import { clamp, lerp } from '../core/rng.js';

const G = 9.81;

export const SURFACES = {
  asphalt: { mu: 1.0, roll: 0.012, bump: 0 },
  curb: { mu: 0.94, roll: 0.02, bump: 1 },
  tarmac: { mu: 0.96, roll: 0.014, bump: 0 },
  grass: { mu: 0.62, roll: 0.09, bump: 0.35, dust: [0.35, 0.42, 0.22] },
  drygrass: { mu: 0.62, roll: 0.09, bump: 0.35, dust: [0.55, 0.5, 0.35] },
  gravel: { mu: 0.5, roll: 0.3, bump: 0.6, dust: [0.75, 0.68, 0.55] },
  sand: { mu: 0.55, roll: 0.22, bump: 0.4, dust: [0.85, 0.66, 0.45] },
  snow: { mu: 0.5, roll: 0.12, bump: 0.3, dust: [0.95, 0.96, 1.0] },
  dirt: { mu: 0.6, roll: 0.15, bump: 0.5, dust: [0.5, 0.4, 0.3] },
};

// Game-style cornering: race cars grip this much harder sideways than the
// real-world numbers, so they turn sharply (AI corner speeds use it too).
export const CORNER_GRIP = 1.6;

export class Vehicle {
  constructor(phys, track, opts = {}) {
    this.p = phys;
    this.track = track;
    this.assists = { abs: true, tcs: true, stability: true, steering: true, autoBrake: false, ...(opts.assists || {}) };
    this.manual = !!opts.manual;
    const wb = phys.wheelbase;
    this.a = wb * (1 - phys.frontW); // CG -> front axle
    this.b = wb * phys.frontW; // CG -> rear axle
    this.Iz = phys.mass * this.a * this.b * 1.05;
    this.halfW = opts.halfWidth || 0.95;
    this.halfL = opts.halfLength || 2.25;
    this.wet = opts.wet ? 0.82 : 1;
    this.latGrip = opts.latGrip ?? CORNER_GRIP;
    this.buildGears();
    this.reset(0, 0);
    this.nitroMax = phys.nitro || 0;
    this.nitro = this.nitroMax;
    this.nitroOn = false;
  }

  buildGears() {
    const p = this.p;
    const redW = (p.redline * 2 * Math.PI) / 60;
    if (p.ev) {
      this.ratios = [1];
      this.final = (redW * 0.98 * p.wheelR) / (p.vTop * 1.02);
    } else {
      const n = p.gears;
      const topTotal = (redW * 0.96 * p.wheelR) / (p.vTop * 1.03);
      const firstV = p.vTop * (n >= 7 ? 0.24 : n >= 6 ? 0.27 : n >= 5 ? 0.31 : 0.36);
      const spread = p.vTop * 1.03 / firstV;
      this.final = 3.5;
      this.ratios = [];
      for (let k = 0; k < n; k++) {
        // slightly progressive spacing (closer ratios in the higher gears)
        const t = k / (n - 1);
        const e = Math.pow(1 - t, 1.12);
        this.ratios.push((topTotal / this.final) * Math.pow(spread, e));
      }
    }
  }

  reset(s, d, speed = 0) {
    const tr = this.track;
    const f = tr.frameAt(s);
    this.x = f.x + f.lx * d;
    this.z = f.z + f.lz * d;
    this.heading = f.heading;
    this.vx = f.tx * speed; this.vz = f.tz * speed;
    this.yawRate = 0;
    this.steer = 0;
    this.gear = 0;
    this.rpm = this.p.idle || 0;
    this.shiftTimer = 0;
    this.ax = 0; this.ayLocal = 0;
    this.trackI = f.i;
    this.proj = tr.project(this.x, this.z, f.i, {});
    this.y = this.proj.y;
    this.pitch = 0; this.roll = 0;
    this.slipFront = 0; this.slipRear = 0; this.spin = 0; this.lockup = 0;
    this.surface = 'asphalt';
    this.impact = 0;
    this.offTrack = false;
    this.speed = speed;
    this.vLong = speed; this.vLat = 0;
    this.revLimiter = false;
    this.launchHold = false;
  }

  // Engine torque at the crank for a given rpm (N*m), full throttle
  torque(rpm) {
    const p = this.p;
    const w = Math.max(60, (rpm * 2 * Math.PI) / 60);
    if (p.ev) {
      const Tmax = p.powerW / ((p.redline * 0.32 * 2 * Math.PI) / 60);
      return Math.min(Tmax, p.powerW / w);
    }
    const x = clamp(rpm / p.redline, 0.05, 1.05);
    const pk = 0.84;
    let pw;
    if (x < pk) { const u = x / pk; pw = u * (2 - u) * 0.96 + 0.04 * u; }
    else pw = 1 - (x - pk) * 0.9;
    return (p.powerW * pw) / w;
  }

  // Most sideways acceleration the tyres can hold at speed v (m/s^2), with downforce
  latLimit(v) { const p = this.p; return p.mu * this.latGrip * this.wet * (G + (p.cl * v * v) / p.mass); }
  // Full steering lock at speed v: about the angle that gives the most grip, so
  // holding a steer button all the way turns the car hard instead of sliding.
  maxSteer(v) { const v2 = Math.max(v * v, 1); return Math.min(0.6, 0.12 + (this.p.wheelbase * this.latLimit(v)) / v2); }

  update(dt, input, opts = {}) {
    const p = this.p, tr = this.track, A = this.assists;
    const surf = SURFACES[this.surface] || SURFACES.asphalt;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const lx = Math.cos(this.heading), lz = -Math.sin(this.heading);
    let vLong = this.vx * fx + this.vz * fz;
    let vLat = this.vx * lx + this.vz * lz;
    const v = Math.hypot(this.vx, this.vz);
    this.speed = v;

    // ---- inputs
    let throttle = clamp(input.throttle || 0, 0, 1);
    let brake = clamp(input.brake || 0, 0, 1);
    const hand = input.handbrake ? 1 : 0;
    if (opts.frozen) { throttle = Math.min(throttle, 1); }

    // reverse: hold brake when (nearly) stopped
    if (!this.manual) {
      if (this.gear >= 0 && vLong < 0.8 && brake > 0.5 && throttle < 0.1) { this.reverseTimer = (this.reverseTimer || 0) + dt; if (this.reverseTimer > 0.35) this.gear = -1; }
      else this.reverseTimer = 0;
      if (this.gear === -1) {
        if (throttle > 0.1 && vLong > -0.5) { this.gear = 0; }
        else { const t = throttle; throttle = brake; brake = t; }
      }
    } else if (this.gear === -1) {
      const t = throttle; throttle = brake; brake = t;
    }

    // auto-brake assist (for younger drivers): brake if way above the safe speed ahead
    if (A.autoBrake && opts.safeSpeed && v > opts.safeSpeed * 1.04 && this.gear >= 0) {
      const over = (v - opts.safeSpeed * 1.04) / 6;
      brake = Math.max(brake, clamp(over, 0, 0.85));
      if (over > 0.15) throttle = Math.min(throttle, 0.2);
    }

    // ---- steering (speed sensitive + countersteer assist)
    const beta = Math.abs(vLong) > 2 ? Math.atan2(vLat, Math.abs(vLong)) : 0;
    const maxS = this.maxSteer(v);
    let target = clamp(input.steer || 0, -1, 1) * maxS;
    if (A.steering) target += clamp(beta * 0.75, -0.35, 0.35);
    const rate = (input.analog ? 6 : 4.5) * Math.max(maxS, 0.12);
    this.steer += clamp(target - this.steer, -rate * dt, rate * dt);
    const delta = this.steer;

    // ---- loads
    const L = p.wheelbase, h = p.cgHeight, m = p.mass;
    const down = p.cl * v * v;
    const transfer = clamp((m * this.ax * h) / L, -m * G * 0.45, m * G * 0.45);
    let Fzf = (m * G * this.b) / L - transfer + down * p.aeroBalance;
    let Fzr = (m * G * this.a) / L + transfer + down * (1 - p.aeroBalance);
    // banking: extra normal load when cornering into it
    const bankLocal = this.groundRoll || 0;
    const loadBoost = 1 + Math.abs(Math.sin(bankLocal)) * clamp(Math.abs(this.ayLocal) / G, 0, 2);
    Fzf *= loadBoost; Fzr *= loadBoost;
    Fzf = Math.max(Fzf, 300); Fzr = Math.max(Fzr, 300);
    const mu = p.mu * surf.mu * this.wet;

    // ---- drivetrain
    let Fdrive = 0;
    const redline = p.redline;
    const wheelW = vLong / p.wheelR;
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    if (this.gear >= 0) {
      const ratio = this.ratios[this.gear] * this.final;
      let rpm = Math.abs(wheelW) * ratio * 60 / (2 * Math.PI);
      // clutch slip at launch: engine revs above wheel speed
      const clutchRpm = p.ev ? 0 : (p.idle + throttle * (redline * 0.55 - p.idle));
      if (this.gear === 0 && rpm < clutchRpm) rpm = lerp(rpm, clutchRpm, 0.85);
      rpm = Math.max(rpm, p.idle);
      this.revLimiter = rpm > redline * 1.0;
      let T = this.torque(Math.min(rpm, redline)) * throttle;
      if (this.revLimiter) T *= 0.0;
      if (this.nitroOn) T *= 1.38;
      if (this.shiftTimer > 0) T = 0;
      Fdrive = (T * ratio * 0.9) / p.wheelR;
      // engine braking off-throttle
      if (throttle < 0.05 && !p.ev) Fdrive -= (rpm / redline) * m * 0.9 * clamp(vLong, 0, 3) / 3;
      if (throttle < 0.05 && p.ev) Fdrive -= 0.06 * m * G * clamp(vLong / 10, 0, 1); // regen
      this.rpm = lerp(this.rpm, rpm, 1 - Math.exp(-dt * 18));
      // automatic gearbox
      if (!this.manual && this.shiftTimer <= 0 && !p.ev) {
        const n = this.ratios.length;
        if (rpm > redline * 0.95 && this.gear < n - 1 && throttle > 0.2) this.shift(1);
        else if (this.gear > 0) {
          const lowerRpm = rpm * (this.ratios[this.gear - 1] / this.ratios[this.gear]);
          if (lowerRpm < redline * (throttle > 0.5 ? 0.82 : 0.68) && rpm < redline * 0.55) this.shift(-1);
        }
      }
    } else {
      // reverse
      const ratio = this.ratios[0] * this.final * 1.1;
      const rpm = Math.max(p.idle, Math.abs(wheelW) * ratio * 60 / (2 * Math.PI));
      this.rpm = lerp(this.rpm, rpm + throttle * 1500, 1 - Math.exp(-dt * 10));
      Fdrive = vLong > -9 ? -((this.torque(Math.min(rpm, redline)) * throttle * ratio * 0.9) / p.wheelR) * 0.5 : 0;
    }

    // split drive between axles
    let fFront = p.drive === 'FWD' ? 1 : p.drive === 'AWD' ? 0.4 : 0;
    let Fxf = Fdrive * fFront, Fxr = Fdrive * (1 - fFront);
    // traction limits (+ TCS)
    const limF = mu * Fzf, limR = mu * Fzr;
    const tcs = A.tcs ? 0.86 : 1.0;
    this.spin = 0;
    if (Math.abs(Fxf) > limF * tcs) { this.spin = Math.max(this.spin, (Math.abs(Fxf) - limF) / limF); Fxf = Math.sign(Fxf) * limF * (A.tcs ? tcs : 0.92); }
    if (Math.abs(Fxr) > limR * tcs) { this.spin = Math.max(this.spin, (Math.abs(Fxr) - limR) / limR); Fxr = Math.sign(Fxr) * limR * (A.tcs ? tcs : 0.92); }
    if (A.tcs) this.spin *= 0.25;

    // brakes (+ ABS)
    this.lockup = 0;
    if (brake > 0 && Math.abs(vLong) > 0.3) {
      const Fb = brake * p.brake * 1.25 * mu * (Fzf + Fzr);
      const sgn = Math.sign(vLong);
      let bf = Fb * 0.63, br = Fb * 0.37;
      const absCap = A.abs ? 0.95 : 1.15;
      if (bf > limF * absCap) { if (!A.abs) this.lockup = 1; bf = limF * (A.abs ? 0.95 : 0.85); }
      if (br > limR * absCap) { if (!A.abs) this.lockup = 1; br = limR * (A.abs ? 0.95 : 0.85); }
      Fxf -= sgn * bf; Fxr -= sgn * br;
    } else if (brake > 0 && Math.abs(vLong) <= 0.3) {
      // hold still
      this.vx *= 0.8; this.vz *= 0.8;
    }
    // handbrake locks the rear
    let rearLatScale = 1;
    if (hand && Math.abs(vLong) > 0.5) {
      Fxr = -Math.sign(vLong) * limR * 0.75;
      rearLatScale = 0.32;
    }

    // ---- tyre lateral forces
    const vxa = Math.max(Math.abs(vLong), 3.0);
    const sg = vLong >= 0 ? 1 : -1;
    const alphaF = Math.atan2(vLat + this.yawRate * this.a, vxa) - delta * sg;
    const alphaR = Math.atan2(vLat - this.yawRate * this.b, vxa);
    const Bf = 18, Br = 19.5, C = 1.3;
    const muLat = mu * this.latGrip;
    let Fyf = -muLat * Fzf * Math.sin(C * Math.atan(Bf * alphaF));
    let Fyr = -muLat * Fzr * Math.sin(C * Math.atan(Br * alphaR)) * rearLatScale;
    // friction ellipse: longitudinal use eats into lateral capacity
    const capF = muLat * Fzf * Math.sqrt(Math.max(0, 1 - (Fxf * Fxf) / (limF * limF)));
    const capR = muLat * Fzr * Math.sqrt(Math.max(0, 1 - (Fxr * Fxr) / (limR * limR))) * rearLatScale;
    Fyf = clamp(Fyf, -capF, capF);
    Fyr = clamp(Fyr, -capR, capR);
    if (this.lockup) { Fyf *= 0.3; }
    this.slipFront = Math.abs(alphaF);
    this.slipRear = Math.abs(alphaR);

    // ---- resistive forces
    const Fdrag = p.kDrag * v * v;
    const Froll = surf.roll * m * G * clamp(v / 2, 0, 1);
    let dragX = 0, dragZ = 0;
    if (v > 0.01) { dragX = -(this.vx / v) * (Fdrag + Froll); dragZ = -(this.vz / v) * (Fdrag + Froll); }
    // slope (grade along heading)
    const grade = this.grade || 0;
    const Fslope = -m * G * grade;

    // ---- sum in car frame then world frame
    const cd = Math.cos(delta), sd = Math.sin(delta);
    const Flong = Fxf * cd - Fyf * sd + Fxr + Fslope;
    const Flat = Fyf * cd + Fxf * sd + Fyr - m * G * Math.sin(bankLocal);
    let torque = this.a * (Fyf * cd + Fxf * sd) - this.b * Fyr;
    // stability assist: steer the yaw rate toward what the driver asks for, but
    // never faster than the tyres can hold (so the car turns hard without spinning)
    if (A.stability && v > 5) {
      const rMax = (muLat * (G + down / m) * 0.97) / v;
      const yawTarget = clamp((vLong * Math.tan(delta)) / L, -rMax, rMax);
      const err = this.yawRate - yawTarget;
      torque -= err * this.Iz * (Math.abs(beta) > 0.07 ? 3.5 : 2.0);
    }
    const Fwx = Flong * fx + Flat * lx + dragX;
    const Fwz = Flong * fz + Flat * lz + dragZ;
    this.vx += (Fwx / m) * dt;
    this.vz += (Fwz / m) * dt;
    this.yawRate += (torque / this.Iz) * dt;
    // low speed: blend to kinematic yaw, kill creep
    if (v < 4) {
      const kin = (vLong * Math.tan(delta)) / L;
      this.yawRate = lerp(kin, this.yawRate, v / 4);
      if (throttle < 0.05 && v < 0.6 && this.gear >= 0) { this.vx *= 0.9; this.vz *= 0.9; }
    }
    this.heading += this.yawRate * dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    // smoothed accelerations for load transfer and body motion
    const axNow = Flong / m, ayNow = Flat / m;
    this.ax = lerp(this.ax, axNow, 1 - Math.exp(-dt * 10));
    this.ayLocal = lerp(this.ayLocal, ayNow, 1 - Math.exp(-dt * 8));
    this.vLong = vLong; this.vLat = vLat;

    // ---- nitro
    if (input.nitro && this.nitro > 0 && throttle > 0.5 && this.gear >= 0) { this.nitroOn = true; this.nitro = Math.max(0, this.nitro - dt); }
    else this.nitroOn = false;

    // ---- track contact
    this.groundFollow(dt);
  }

  shift(dir) {
    const n = this.ratios.length;
    const g = clamp(this.gear + dir, this.manual ? -1 : 0, n - 1);
    if (g === this.gear) return;
    this.gear = g;
    this.shiftTimer = this.p.ev ? 0 : this.p.shiftTime;
    this.lastShift = dir;
    this.shiftEvent = (this.shiftEvent || 0) + 1;
  }

  groundFollow(dt) {
    const tr = this.track;
    const pr = tr.project(this.x, this.z, this.trackI, this.proj);
    this.trackI = pr.i;
    const i = pr.i, d = pr.d;
    // barrier collisions (car half-extent across the track depends on yaw)
    const rel = this.heading - tr.heading[i];
    const ext = this.halfW * Math.abs(Math.cos(rel)) + this.halfL * Math.abs(Math.sin(rel));
    this.impact = 0;
    const limL = pr.barrierL - ext, limR = -(pr.barrierR - ext);
    if (d > limL || d < limR) {
      const side = d > limL ? 1 : -1;
      const pen = side > 0 ? d - limL : limR - d;
      const nx = tr.lx[i] * side, nz = tr.lz[i] * side; // outward normal
      this.x -= nx * pen; this.z -= nz * pen;
      const vn = this.vx * nx + this.vz * nz;
      if (vn > 0) {
        const e = 0.28;
        this.vx -= (1 + e) * vn * nx; this.vz -= (1 + e) * vn * nz;
        // scrape friction
        const tx = this.vx - (this.vx * nx + this.vz * nz) * nx, tz = this.vz - (this.vx * nx + this.vz * nz) * nz;
        const fr = clamp(0.06 + vn * 0.02, 0, 0.35);
        this.vx -= tx * fr; this.vz -= tz * fr;
        // yaw: rotate toward the wall direction
        const wallH = tr.heading[i];
        let dh = wallH - this.heading;
        while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
        if (Math.abs(dh) > Math.PI / 2) dh = dh > 0 ? dh - Math.PI : dh + Math.PI;
        this.yawRate = this.yawRate * 0.5 + dh * clamp(vn * 0.25, 0, 2.5);
        this.impact = vn;
      }
      tr.project(this.x, this.z, this.trackI, pr);
    }
    this.y = pr.y;
    this.surface = tr.surfaceAt(pr.i, pr.d);
    this.offTrack = this.surface !== 'asphalt' && this.surface !== 'curb';
    // grade + bank -> pitch/roll of the chassis
    const N = tr.N, j = (i + 1) % N;
    const dy = tr.y[j] - tr.y[i];
    const gradeTrack = dy / 2;
    const fwdDot = Math.cos(rel);
    this.grade = gradeTrack * fwdDot;
    let bank = tr.bank[i];
    if (Math.abs(pr.d) > tr.hw[i]) bank = Math.sign(pr.d) * -0.025;
    this.groundPitch = -Math.atan(gradeTrack) * fwdDot + Math.atan(Math.tan(bank)) * Math.sin(rel);
    this.groundRoll = Math.atan(Math.tan(bank)) * fwdDot + Math.atan(gradeTrack) * Math.sin(rel) * -1;
  }

  get kmh() { return this.speed * 3.6; }
}
