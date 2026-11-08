// Race control: F1-style start lights, lap counting and timing, running
// order, car-to-car contact, wrong-way detection and the finish.
import { clamp } from '../core/rng.js';

export class Race {
  constructor(track, entrants, { laps = 3, rubberBand = 0.02 } = {}) {
    this.track = track;
    this.entrants = entrants;
    this.laps = laps;
    this.state = 'grid'; // grid -> lights -> racing -> finished
    this.time = 0; // race clock
    this.lightTimer = 0;
    this.lights = 0;
    this.goDelay = 0.6 + Math.random() * 1.2;
    this.events = [];
    this.rubberBand = rubberBand;
    this.finishOrder = [];
    this.player = entrants.find((e) => e.isPlayer);
    for (const e of entrants) {
      e.lap = 0; e.lapStart = 0; e.lastLap = 0; e.bestLap = 0; e.finished = false; e.finishTime = 0; e.lapTimes = [];
      e.wrongWay = 0;
    }
  }

  emit(type, data = {}) { this.events.push({ type, ...data }); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  startLights() { this.state = 'lights'; this.lightTimer = 0; this.lights = 0; }

  update(dt) {
    if (this.state === 'lights') {
      this.lightTimer += dt;
      const n = Math.min(5, Math.floor(this.lightTimer / 0.9));
      if (n !== this.lights && this.lightTimer < 4.6) { this.lights = n; this.emit('light', { n }); }
      if (this.lightTimer >= 4.5 + this.goDelay) {
        this.lights = 0;
        this.state = 'racing';
        this.time = 0;
        for (const e of this.entrants) { if (e.ai) e.ai.held = false; e.lapStart = 0; }
        this.emit('go');
      }
    } else if (this.state === 'racing' || this.state === 'finished') {
      this.time += dt;
    }
  }

  // called after all cars have moved this frame
  postUpdate(dt) {
    const L = this.track.length;
    for (const e of this.entrants) {
      const total = e.ai ? e.ai.total : e.total;
      if (e.finished) continue;
      const lapNow = Math.floor(total / L); // 0 while on the opening lap's grid side
      if (lapNow > e.lap && this.state !== 'grid' && this.state !== 'lights') {
        // completed a lap
        if (e.lap >= 1) {
          const lt = this.time - e.lapStart;
          e.lastLap = lt; e.lapTimes.push(lt);
          if (!e.bestLap || lt < e.bestLap) e.bestLap = lt;
          if (e.isPlayer) this.emit('lap', { lap: e.lap, time: lt, best: e.bestLap === lt });
        }
        e.lap = lapNow;
        e.lapStart = this.time;
        if (e.lap > this.laps) {
          e.finished = true;
          e.finishTime = this.time;
          this.finishOrder.push(e);
          if (e.isPlayer) { this.state = 'finished'; this.emit('finish', { position: this.finishOrder.length }); }
        } else if (e.isPlayer && e.lap === this.laps) this.emit('finalLap');
      }
    }
    this.resolveContacts(dt);
    this.updatePositions();
  }

  updatePositions() {
    const order = this.entrants.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return (b.ai ? b.ai.total : b.total) - (a.ai ? a.ai.total : a.total);
    });
    order.forEach((e, i) => {
      if (e.isPlayer && e.position && e.position !== i + 1 && this.state === 'racing') this.emit('position', { from: e.position, to: i + 1 });
      e.position = i + 1;
    });
    this.order = order;
  }

  // Gap (seconds, approx) of each entrant to the leader
  gapToLeader(e) {
    const lead = this.order[0];
    if (e === lead) return 0;
    const dl = (lead.ai ? lead.ai.total : lead.total) - (e.ai ? e.ai.total : e.total);
    const v = Math.max(15, e.ai ? e.ai.v : e.veh.speed);
    return dl / v;
  }

  // Oriented-box contact between every pair of cars
  resolveContacts() {
    const E = this.entrants;
    for (let a = 0; a < E.length; a++) {
      for (let b = a + 1; b < E.length; b++) {
        const A = E[a], B = E[b];
        const pa = poseOf(A), pb = poseOf(B);
        const dx = pb.x - pa.x, dz = pb.z - pa.z;
        if (dx * dx + dz * dz > 49) continue;
        const hit = satOBB(pa, pb);
        if (!hit) continue;
        // n points from A to B
        let { nx, nz, depth } = hit;
        if (nx * dx + nz * dz < 0) { nx = -nx; nz = -nz; }
        this.separate(A, B, pa, pb, nx, nz, depth);
      }
    }
  }

  separate(A, B, pa, pb, nx, nz, depth) {
    const tr = this.track;
    const va = velOf(A), vb = velOf(B);
    const vrel = (vb.x - va.x) * nx + (vb.z - va.z) * nz; // <0 means closing
    const ma = A.mass || 1200, mb = B.mass || 1200;
    const wa = mb / (ma + mb), wb = ma / (ma + mb);
    // positional correction
    const push = (ent, pose, sx, sz, amt) => {
      if (ent.veh) { ent.veh.x += sx * amt; ent.veh.z += sz * amt; }
      else {
        const i = Math.floor(tr.wrapS(ent.ai.s) / 2) % tr.N;
        const lat = sx * tr.lx[i] + sz * tr.lz[i];
        const lon = sx * tr.tx[i] + sz * tr.tz[i];
        ent.ai.d += lat * amt; ent.ai.offset += lat * amt * 0.8;
        ent.ai.s += lon * amt; ent.ai.total += lon * amt;
      }
    };
    push(A, pa, -nx, -nz, depth * wa + 0.01);
    push(B, pb, nx, nz, depth * wb + 0.01);
    if (vrel < 0) {
      const e = 0.3;
      const j = -(1 + e) * vrel;
      const applyVel = (ent, sx, sz, amt) => {
        if (ent.veh) { ent.veh.vx += sx * amt; ent.veh.vz += sz * amt; ent.veh.yawRate += (Math.random() - 0.5) * amt * 0.08; }
        else {
          const i = Math.floor(tr.wrapS(ent.ai.s) / 2) % tr.N;
          const lon = sx * tr.tx[i] + sz * tr.tz[i];
          ent.ai.v = Math.max(0, ent.ai.v + lon * amt);
          ent.ai.offsetTarget += (sx * tr.lx[i] + sz * tr.lz[i]) * amt * 0.3;
          ent.ai.bump = Math.min(0.15, ent.ai.bump + Math.abs(amt) * 0.004);
        }
      };
      applyVel(A, -nx, -nz, j * wa);
      applyVel(B, nx, nz, j * wb);
      if (A.isPlayer || B.isPlayer) this.emit('contact', { strength: j });
    }
  }
}

function poseOf(e) {
  if (e.veh) return { x: e.veh.x, z: e.veh.z, h: e.veh.heading, hw: e.veh.halfW, hl: e.veh.halfL };
  return { x: e.ai.x, z: e.ai.z, h: e.ai.heading, hw: e.ai.halfW, hl: e.ai.halfL };
}
function velOf(e) {
  if (e.veh) return { x: e.veh.vx, z: e.veh.vz };
  return { x: Math.sin(e.ai.heading) * e.ai.v, z: Math.cos(e.ai.heading) * e.ai.v };
}

// 2D separating-axis test for two oriented rectangles
function satOBB(a, b) {
  const axes = [
    [Math.sin(a.h), Math.cos(a.h)], [Math.cos(a.h), -Math.sin(a.h)],
    [Math.sin(b.h), Math.cos(b.h)], [Math.cos(b.h), -Math.sin(b.h)],
  ];
  const dx = b.x - a.x, dz = b.z - a.z;
  let best = Infinity, bx = 0, bz = 0;
  for (const [ax, az] of axes) {
    const ra = a.hl * Math.abs(Math.sin(a.h) * ax + Math.cos(a.h) * az) + a.hw * Math.abs(Math.cos(a.h) * ax - Math.sin(a.h) * az);
    const rb = b.hl * Math.abs(Math.sin(b.h) * ax + Math.cos(b.h) * az) + b.hw * Math.abs(Math.cos(b.h) * ax - Math.sin(b.h) * az);
    const dist = Math.abs(dx * ax + dz * az);
    const o = ra + rb - dist;
    if (o <= 0) return null;
    if (o < best) { best = o; bx = ax; bz = az; }
  }
  return { nx: bx, nz: bz, depth: clamp(best, 0, 1.5) };
}
