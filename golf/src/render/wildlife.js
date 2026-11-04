// Wildlife: mallards and a mother duck with her ducklings on the ponds,
// rabbits nibbling in the rough, squirrels darting round the tree trunks and,
// at night, fireflies. They scatter when a ball lands near them: drakes take
// off quacking and circle back later, the mother leads her ducklings away
// across the water, rabbits bolt for cover and squirrels run up a tree.
import * as THREE from '../../vendor/three.module.min.js';
import { RNG, mixSeed } from '../util/rng.js';
import { mergeGeos } from './trees.js';

function paint(g, color) {
  const n = g.index ? g.toNonIndexed() : g;
  if (n.attributes.uv) n.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const a = new Float32Array(n.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
  n.setAttribute('color', new THREE.BufferAttribute(a, 3));
  n.computeVertexNormals();
  return n;
}
const sph = (r, sx, sy, sz, x, y, z, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h).scale(sx, sy, sz).translate(x, y, z);
const mat = () => new THREE.MeshLambertMaterial({ vertexColors: true });
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ------------------------------------------------------------ models
// Everything faces +z with its feet (or waterline) at y = 0
function duckGeo(kind) {
  const drake = kind === 'drake';
  const baby = kind === 'duckling';
  const body = baby ? '#c9a940' : drake ? '#a9a79c' : '#8a6a45';
  const back = baby ? '#6e5530' : drake ? '#5d5a50' : '#6b4f31';
  const head = baby ? '#d8bb52' : drake ? '#1d6b3c' : '#7a5b3a';
  const parts = [
    paint(sph(0.16, 1, 0.6, 1.5, 0, 0.05, 0), body),
    paint(sph(0.14, 0.9, 0.35, 1.25, 0, 0.1, -0.03), back),
    paint(sph(0.11, 1, 0.8, 0.9, 0, 0.06, 0.13), drake ? '#6b3b2a' : body),
    paint(new THREE.ConeGeometry(0.06, 0.16, 5).rotateX(-Math.PI / 2 + 0.5).translate(0, 0.1, -0.22), drake ? '#222' : back),
    paint(sph(0.05, 1, 1.6, 1, 0, 0.16, 0.19), head),
    paint(sph(0.07, 1, 0.95, 1.15, 0, 0.25, 0.21), head),
    paint(new THREE.BoxGeometry(0.05, 0.022, 0.09).translate(0, 0.235, 0.3), baby ? '#3a3020' : drake ? '#e8c43a' : '#d98a2b'),
    paint(sph(0.012, 1, 1, 1, 0.052, 0.265, 0.25, 5, 4), '#111'),
    paint(sph(0.012, 1, 1, 1, -0.052, 0.265, 0.25, 5, 4), '#111'),
  ];
  if (drake) parts.push(paint(new THREE.CylinderGeometry(0.049, 0.051, 0.018, 8).translate(0, 0.19, 0.195), '#f4f4f0'));
  if (!drake && !baby) parts.push(paint(new THREE.BoxGeometry(0.03, 0.02, 0.1).translate(0.12, 0.11, -0.04), '#3a4fb8'), paint(new THREE.BoxGeometry(0.03, 0.02, 0.1).translate(-0.12, 0.11, -0.04), '#3a4fb8'));
  return mergeGeos(parts);
}

function wingGeo(color) {
  // a wing reaching out along +x from the shoulder
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.09, 0.36, 0, 0.02, 0.3, 0, -0.1, 0, 0, 0.09, 0.3, 0, -0.1, 0, 0, -0.12], 3));
  return paint(g, color);
}

function rabbitGeo(jack) {
  const fur = jack ? '#a88a64' : '#8a7560';
  const ear = jack ? 5.2 : 3.4;
  return mergeGeos([
    paint(sph(0.12, 1, 0.9, 1.35, 0, 0.12, 0), fur),
    paint(sph(0.1, 1, 1, 1, 0, 0.1, -0.07), fur),
    paint(sph(0.07, 1, 0.95, 1.2, 0, 0.22, 0.14), fur),
    paint(sph(0.022, 1, ear, 0.55, 0, 0, 0).rotateZ(0.16).rotateX(-0.3).translate(0.032, 0.26 + 0.022 * ear * 0.9, 0.1), fur),
    paint(sph(0.022, 1, ear, 0.55, 0, 0, 0).rotateZ(-0.16).rotateX(-0.3).translate(-0.032, 0.26 + 0.022 * ear * 0.9, 0.1), fur),
    paint(sph(0.035, 1, 1, 1, 0, 0.15, -0.17, 6, 5), '#f4f1ea'),
    paint(sph(0.013, 1, 1, 1, 0.05, 0.245, 0.18, 5, 4), '#111'),
    paint(sph(0.013, 1, 1, 1, -0.05, 0.245, 0.18, 5, 4), '#111'),
    paint(sph(0.012, 1, 1, 1, 0, 0.215, 0.225, 5, 4), '#d88a8a'),
    paint(sph(0.03, 1, 0.6, 1.6, 0.05, 0.02, 0.1, 5, 4), fur),
    paint(sph(0.03, 1, 0.6, 1.6, -0.05, 0.02, 0.1, 5, 4), fur),
  ]);
}

function squirrelGeo(red) {
  const fur = red ? '#a4532a' : '#8b8378';
  const tail = red ? '#b86234' : '#9a9286';
  return mergeGeos([
    paint(sph(0.06, 1, 1, 1.8, 0, 0.07, 0), fur),
    paint(sph(0.045, 1, 0.95, 1.2, 0, 0.12, 0.1), fur),
    paint(sph(0.012, 1, 1.6, 0.6, 0.025, 0.17, 0.09, 5, 4), fur),
    paint(sph(0.012, 1, 1.6, 0.6, -0.025, 0.17, 0.09, 5, 4), fur),
    paint(sph(0.009, 1, 1, 1, 0.03, 0.135, 0.135, 5, 4), '#111'),
    paint(sph(0.009, 1, 1, 1, -0.03, 0.135, 0.135, 5, 4), '#111'),
    paint(sph(0.05, 1, 1.5, 1, 0, 0.0, 0).rotateX(0.5).translate(0, 0.1, -0.13), tail),
    paint(sph(0.055, 1, 1.6, 1, 0, 0.0, 0).rotateX(-0.25).translate(0, 0.21, -0.16), tail),
    paint(sph(0.04, 1, 1, 1, 0, 0.3, -0.12), tail),
    paint(sph(0.03, 0.8, 0.5, 1.4, 0, 0.1, 0.02), '#e8dccb'),
  ]);
}

// ------------------------------------------------------------ wildlife
export class Wildlife {
  constructor(hole, opts = {}) {
    this.hole = hole;
    this.group = new THREE.Group();
    this.rng = new RNG(mixSeed(hole.seed, 'wildlife'));
    this.low = opts.quality === 'low';
    this.night = !!opts.night;
    this.rain = !!opts.rain;
    this.t = 0;
    this.ducks = [];
    this.rabbits = [];
    this.squirrels = [];
    this.fireflies = null;
    const desert = hole.style.scenery === 'mesas';
    this.addDucks();
    if (!this.low || this.ducks.length === 0) this.addRabbits(desert);
    if (!this.night && !this.rain && !desert && !this.low) this.addSquirrels();
    if (this.night && !desert && !this.rain) this.addFireflies();
  }

  // ---------------- ducks ----------------
  addDucks() {
    const h = this.hole;
    const rng = this.rng;
    const geos = {};
    const geo = (k) => geos[k] || (geos[k] = duckGeo(k));
    let wingG = null;
    const ponds = h.waters.filter((w) => w.type === 'pond');
    let budget = this.low ? 2 : 12;
    for (const w of ponds) {
      if (budget <= 0) break;
      const loop = this.pondLoop(w, rng.float(0.35, 0.6));
      if (!loop) continue;
      const add = (kind, lp, lead = null, lag = 0) => {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(geo(kind), mat()));
        let wl = null, wr = null;
        if (kind === 'drake' || kind === 'hen') {
          wingG = wingG || { drake: wingGeo('#6f6c62'), hen: wingGeo('#735537') };
          wl = new THREE.Mesh(wingG[kind], mat());
          wr = new THREE.Mesh(wingG[kind], mat());
          wl.material.side = wr.material.side = THREE.DoubleSide;
          wl.position.set(0.07, 0.13, 0.02);
          wr.position.set(-0.07, 0.13, 0.02);
          wr.scale.x = -1;
          wl.visible = wr.visible = false;
          g.add(wl, wr);
        }
        const s = kind === 'duckling' ? 0.48 : 1.15;
        g.scale.setScalar(s);
        this.group.add(g);
        const d = { g, wl, wr, kind, loop: lp, a: rng.float(0, Math.PI * 2), speed: rng.float(0.25, 0.45), dir: rng.sign(), state: 'swim', t: 0, ph: rng.float(0, 6.28), lead, lag, pond: w, s };
        this.ducks.push(d);
        budget--;
        return d;
      };
      // a mother with a line of ducklings paddling behind her
      if (!this.low && rng.chance(0.55)) {
        const mum = add('hen', loop);
        const n = rng.int(3, 6);
        for (let i = 0; i < n && budget > 0; i++) add('duckling', loop, mum, 0.7 + i * 0.45);
      }
      const pairs = this.low ? 1 : rng.int(1, 3);
      for (let i = 0; i < pairs && budget > 0; i++) {
        const lp = this.pondLoop(w, rng.float(0.25, 0.65)) || loop;
        add(rng.chance(0.6) ? 'drake' : 'hen', lp);
      }
    }
  }

  // An oval swimming route well inside the pond, or null for a tiny pond
  pondLoop(w, frac) {
    const h = this.hole;
    for (let k = 0; k < 5; k++, frac *= 0.75) {
      const rx = w.rx * frac, rz = w.rz * frac;
      if (Math.min(rx, rz) < 1.5) return null;
      let ok = true;
      for (let i = 0; i < 12 && ok; i++) {
        const a = (i / 12) * Math.PI * 2;
        const p = this.loopPoint({ x: w.x, z: w.z, rx, rz, rot: w.rot || 0 }, a);
        const f = h.fields(p.x, p.z);
        if (!(f.dW < -1.2)) ok = false;
      }
      if (ok) return { x: w.x, z: w.z, rx, rz, rot: w.rot || 0, y: w.level };
    }
    return null;
  }

  loopPoint(lp, a) {
    const u = Math.cos(a) * lp.rx, v = Math.sin(a) * lp.rz;
    const c = Math.cos(lp.rot), s = Math.sin(lp.rot);
    return { x: lp.x + u * c + v * s, z: lp.z + u * s - v * c };
  }

  updateDucks(dt) {
    const t = this.t;
    for (const d of this.ducks) {
      d.t += dt;
      const g = d.g;
      if (d.state === 'swim' || d.state === 'hurry') {
        const fast = d.state === 'hurry' ? 4 : 1;
        if (d.state === 'hurry' && d.t > 5) d.state = 'swim';
        if (d.lead) {
          // ducklings trail their mother around the same loop, a few feet apart
          d.a = d.lead.a - (d.lag / ((d.loop.rx + d.loop.rz) / 2)) * d.lead.dir;
          d.dir = d.lead.dir;
        } else if (!this.night) {
          d.a += (d.speed * fast * d.dir * dt) / Math.max(1.5, (d.loop.rx + d.loop.rz) / 2);
        }
        const p = this.loopPoint(d.loop, d.a);
        const p2 = this.loopPoint(d.loop, d.a + 0.05 * d.dir);
        const bob = Math.sin(t * 2.2 + d.ph) * 0.012;
        g.position.set(p.x, d.loop.y + bob, p.z);
        g.rotation.set(Math.sin(t * 1.7 + d.ph) * 0.05, Math.atan2(p2.x - p.x, p2.z - p.z), Math.sin(t * 2.2 + d.ph) * 0.04);
        g.visible = true;
        // the odd dabble: tail up, head under
        if (!d.lead && !this.night && Math.sin(t * 0.23 + d.ph * 3) > 0.985) g.rotation.x = 1.1;
      } else if (d.state === 'fly') {
        // up and away, flapping hard, then gone for a while
        const k = d.t;
        const climb = Math.min(1, k / 3);
        d.x += d.vx * dt; d.z += d.vz * dt;
        d.y += (4.2 * (1 - climb) + 0.6) * dt;
        g.position.set(d.x, d.y, d.z);
        g.rotation.set(-0.35 * (1 - climb), Math.atan2(d.vx, d.vz), 0);
        const flap = Math.sin(k * 19 + d.ph) * 0.95;
        d.wl.rotation.z = flap; d.wr.rotation.z = -flap;
        if (k > 9) { d.state = 'away'; d.t = 0; g.visible = false; }
      } else if (d.state === 'away') {
        if (d.t > 14) {
          // circle back in and glide down onto the water
          const home = this.loopPoint(d.loop, d.a);
          const ang = this.rng.float(0, Math.PI * 2);
          d.from = { x: home.x + Math.sin(ang) * 70, y: d.loop.y + 22, z: home.z + Math.cos(ang) * 70 };
          d.to = { x: home.x, y: d.loop.y, z: home.z };
          d.state = 'land'; d.t = 0; g.visible = true;
        }
      } else if (d.state === 'land') {
        const k = Math.min(1, d.t / 6);
        const e = 1 - (1 - k) * (1 - k);
        const x = d.from.x + (d.to.x - d.from.x) * e, z = d.from.z + (d.to.z - d.from.z) * e;
        const y = d.from.y + (d.to.y - d.from.y) * (k * k * (3 - 2 * k));
        g.position.set(x, y, z);
        g.rotation.set(k > 0.85 ? -0.5 : 0.1, Math.atan2(d.to.x - d.from.x, d.to.z - d.from.z), 0);
        // glide with the odd flap, then a flurry to brake
        const flap = k > 0.85 ? Math.sin(d.t * 22) * 0.9 : Math.sin(d.t * 3) > 0.7 ? Math.sin(d.t * 17) * 0.8 : 0.15;
        d.wl.rotation.z = flap; d.wr.rotation.z = -flap;
        if (k >= 1) { d.state = 'swim'; d.t = 0; d.wl.visible = d.wr.visible = false; }
      }
    }
  }

  // ---------------- rabbits ----------------
  addRabbits(desert) {
    const h = this.hole;
    const rng = this.rng;
    const n = this.rain ? 1 : this.low ? 2 : rng.int(2, 4);
    const geo = rabbitGeo(desert);
    for (let i = 0, tries = 0; i < n && tries < 60; tries++) {
      const s = rng.float(Math.min(90, h.length * 0.3), h.length - 15);
      const pt = h.pointAtS(s);
      const r = { x: Math.cos(pt.heading), z: Math.sin(pt.heading) };
      const lat = rng.sign() * (h.fwHalf + rng.float(2, (h.roughW || 12) + 8));
      const x = pt.x + r.x * lat, z = pt.z + r.z * lat;
      if (!this.clearGround(x, z)) continue;
      const g = new THREE.Mesh(geo, mat());
      g.scale.setScalar(desert ? 1.35 : 1.2);
      g.castShadow = !this.low;
      this.group.add(g);
      this.rabbits.push({ g, x, z, hx: x, hz: z, yaw: rng.float(0, 6.28), state: 'sit', t: 0, wait: rng.float(1, 5), ph: rng.float(0, 6.28) });
      i++;
    }
    for (const r of this.rabbits) this.placeRabbit(r, 0);
  }

  clearGround(x, z) {
    const h = this.hole;
    if (!h.inBounds(x, z)) return false;
    const f = h.fields(x, z);
    return f.dW > 3 && f.dB > 1.5 && f.dG > 6 && f.dT > 5 && f.dC > 1.5 && f.dO > 3 && f.dF > 1;
  }

  placeRabbit(r, lift) {
    const y = this.hole.heightAt(r.x, r.z);
    r.g.position.set(r.x, y + lift, r.z);
    r.g.rotation.set(r.pitch || 0, r.yaw, 0);
  }

  hopTo(r, x, z, dur, height) {
    r.from = { x: r.x, z: r.z };
    r.to = { x, z };
    r.dur = dur;
    r.height = height;
    r.t = 0;
    r.yaw = Math.atan2(x - r.x, z - r.z);
  }

  updateRabbits(dt) {
    const rng = this.rng;
    for (const r of this.rabbits) {
      if (r.state === 'hidden') continue;
      r.t += dt;
      if (r.state === 'sit') {
        // nibble the grass, ears and nose twitching
        r.pitch = Math.max(0, Math.sin(this.t * 1.3 + r.ph)) * 0.35;
        this.placeRabbit(r, 0);
        if (r.t > r.wait) {
          const a = rng.float(0, Math.PI * 2), d = rng.float(0.6, 1.3);
          let x = r.x + Math.sin(a) * d, z = r.z + Math.cos(a) * d;
          // stay close to home
          if (Math.hypot(x - r.hx, z - r.hz) > 5) { x = r.x + (r.hx - r.x) * 0.3; z = r.z + (r.hz - r.z) * 0.3; }
          if (this.clearGround(x, z)) { r.state = 'hop'; this.hopTo(r, x, z, 0.36, 0.14); } else r.t = 0;
        }
      } else if (r.state === 'hop' || r.state === 'flee') {
        const k = Math.min(1, r.t / r.dur);
        r.x = r.from.x + (r.to.x - r.from.x) * k;
        r.z = r.from.z + (r.to.z - r.from.z) * k;
        r.pitch = (0.5 - k) * 0.5;
        this.placeRabbit(r, Math.sin(k * Math.PI) * r.height);
        if (k >= 1) {
          if (r.state === 'flee' && r.hops > 0) {
            r.hops--;
            const a = r.fleeYaw + rng.float(-0.4, 0.4);
            this.hopTo(r, r.x + Math.sin(a) * 1.6, r.z + Math.cos(a) * 1.6, 0.26, 0.28);
          } else if (r.state === 'flee') {
            r.state = 'hidden';
            r.g.visible = false;
          } else {
            r.state = 'sit'; r.t = 0; r.wait = rng.float(1.5, 6);
          }
        }
      }
    }
  }

  // ---------------- squirrels ----------------
  addSquirrels() {
    const h = this.hole;
    const rng = this.rng;
    const good = (h.trees || []).filter((t) => ['oak', 'pine', 'birch', 'cypress'].includes(t.kind) && !t.lean);
    const near = good.filter((t) => {
      const f = h.fields(t.x, t.z);
      return f.dF > 5 && f.dF < 32 && f.dG > 8 && f.dT > 8;
    });
    const n = Math.min(near.length, rng.int(1, 3));
    const red = rng.chance(0.4);
    const geo = squirrelGeo(red);
    for (let i = 0; i < n; i++) {
      const tree = near.splice(rng.int(0, near.length - 1), 1)[0];
      const a = rng.float(0, Math.PI * 2);
      const d = tree.trunkR + rng.float(1, 3);
      const g = new THREE.Mesh(geo, mat());
      g.scale.setScalar(1.3);
      this.group.add(g);
      const sq = { g, tree, x: tree.x + Math.sin(a) * d, z: tree.z + Math.cos(a) * d, y: 0, yaw: rng.float(0, 6.28), state: 'pause', t: 0, wait: rng.float(0.5, 2.5), ph: rng.float(0, 6.28) };
      this.squirrels.push(sq);
      this.placeSquirrel(sq);
    }
  }

  placeSquirrel(sq) {
    const gy = this.hole.heightAt(sq.x, sq.z);
    if (sq.state === 'climb' || sq.state === 'up' || sq.state === 'down') {
      sq.g.position.set(sq.x, sq.tree.y + sq.y, sq.z);
      // body vertical against the trunk, head up (or down on the way back)
      sq.g.rotation.set(sq.state === 'down' ? Math.PI / 2 : -Math.PI / 2, sq.yaw, 0, 'YXZ');
    } else {
      const sit = sq.state === 'pause' && Math.sin(this.t * 0.9 + sq.ph) > 0.3;
      sq.g.position.set(sq.x, gy, sq.z);
      sq.g.rotation.set(sit ? -0.8 : 0, sq.yaw, 0, 'YXZ');
    }
  }

  updateSquirrels(dt) {
    const rng = this.rng;
    for (const sq of this.squirrels) {
      sq.t += dt;
      const tr = sq.tree;
      if (sq.state === 'pause') {
        if (sq.t > sq.wait) {
          const a = rng.float(0, Math.PI * 2), d = tr.trunkR + rng.float(0.8, 3.5);
          sq.tx = tr.x + Math.sin(a) * d; sq.tz = tr.z + Math.cos(a) * d;
          sq.state = 'dart'; sq.t = 0; sq.speed = rng.float(2.2, 3.6);
        }
      } else if (sq.state === 'dart' || sq.state === 'bolt') {
        const dx = sq.tx - sq.x, dz = sq.tz - sq.z;
        const L = Math.hypot(dx, dz);
        const step = sq.speed * dt;
        sq.yaw = Math.atan2(dx, dz);
        if (L <= step) {
          sq.x = sq.tx; sq.z = sq.tz;
          if (sq.state === 'bolt') { sq.state = 'climb'; sq.y = 0.1; } else { sq.state = 'pause'; sq.t = 0; sq.wait = rng.float(0.8, 3); }
        } else { sq.x += (dx / L) * step; sq.z += (dz / L) * step; }
      } else if (sq.state === 'climb') {
        sq.y += 2.4 * dt;
        if (sq.y > Math.max(2.4, tr.trunkH * 0.85)) { sq.state = 'up'; sq.t = 0; }
      } else if (sq.state === 'up') {
        if (sq.t > 18) { sq.state = 'down'; sq.t = 0; }
      } else if (sq.state === 'down') {
        sq.y -= 1.6 * dt;
        if (sq.y <= 0.05) { sq.y = 0; sq.state = 'pause'; sq.t = 0; sq.wait = 2; sq.yaw += Math.PI; }
      }
      this.placeSquirrel(sq);
    }
  }

  // ---------------- fireflies ----------------
  addFireflies() {
    const h = this.hole;
    const rng = this.rng;
    const n = this.low ? 60 : 160;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    this.ffBase = [];
    for (let i = 0; i < n; i++) {
      const s = rng.float(0, h.length);
      const pt = h.pointAtS(s);
      const r = { x: Math.cos(pt.heading), z: Math.sin(pt.heading) };
      const lat = rng.sign() * (h.fwHalf + rng.float(4, 30));
      const x = pt.x + r.x * lat, z = pt.z + r.z * lat;
      this.ffBase.push({ x, y: h.heightAt(x, z) + rng.float(0.4, 2.6), z, ph: rng.float(0, 30), sp: rng.float(0.3, 0.8) });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const cv = document.createElement('canvas');
    cv.width = cv.height = 32;
    const c = cv.getContext('2d');
    const gr = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(cv);
    this.fireflies = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.35, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.fireflies.frustumCulled = false;
    this.group.add(this.fireflies);
  }

  updateFireflies() {
    const f = this.fireflies;
    const pos = f.geometry.attributes.position.array;
    const col = f.geometry.attributes.color.array;
    const t = this.t;
    this.ffBase.forEach((b, i) => {
      const k = t * b.sp + b.ph;
      pos[i * 3] = b.x + Math.sin(k * 0.7) * 1.2;
      pos[i * 3 + 1] = b.y + Math.sin(k * 1.1) * 0.4;
      pos[i * 3 + 2] = b.z + Math.cos(k * 0.6) * 1.2;
      // slow blinks: glow for a moment, then dark
      const blink = Math.max(0, Math.sin(k * 2.3)) ** 6;
      col[i * 3] = 0.75 * blink; col[i * 3 + 1] = 1.0 * blink; col[i * 3 + 2] = 0.25 * blink;
    });
    f.geometry.attributes.position.needsUpdate = true;
    f.geometry.attributes.color.needsUpdate = true;
  }

  // ---------------- reactions ----------------
  // Something landed (or splashed) at x,z: everything close enough runs.
  // Returns what happened so the caller can play the right sounds.
  scare(x, z, radius = 18) {
    const out = { flew: 0, swam: 0, ran: 0 };
    const rng = this.rng;
    for (const d of this.ducks) {
      if (d.state !== 'swim' && d.state !== 'hurry') continue;
      const p = d.g.position;
      const dist = Math.hypot(p.x - x, p.z - z);
      if (dist > radius * 1.6) continue;
      if (d.kind === 'drake' || (d.kind === 'hen' && !this.ducks.some((o) => o.lead === d))) {
        const a = Math.atan2(p.x - x, p.z - z) + rng.float(-0.5, 0.5);
        const sp = rng.float(8, 11);
        d.state = 'fly'; d.t = 0; d.x = p.x; d.y = p.y; d.z = p.z; d.vx = Math.sin(a) * sp; d.vz = Math.cos(a) * sp;
        d.wl.visible = d.wr.visible = true;
        out.flew++;
      } else if (!d.lead) {
        // a mother leads her ducklings off in a hurry
        d.state = 'hurry'; d.t = 0;
        const here = this.loopPoint(d.loop, d.a);
        const ahead = this.loopPoint(d.loop, d.a + 0.3 * d.dir);
        const toward = (ahead.x - here.x) * (x - here.x) + (ahead.z - here.z) * (z - here.z);
        if (toward > 0) d.dir = -d.dir;
        out.swam++;
      }
    }
    for (const r of this.rabbits) {
      if (r.state === 'hidden' || r.state === 'flee') continue;
      if (Math.hypot(r.x - x, r.z - z) > radius) continue;
      r.state = 'flee';
      r.hops = rng.int(6, 9);
      r.fleeYaw = Math.atan2(r.x - x, r.z - z);
      this.hopTo(r, r.x + Math.sin(r.fleeYaw) * 1.6, r.z + Math.cos(r.fleeYaw) * 1.6, 0.26, 0.28);
      out.ran++;
    }
    for (const sq of this.squirrels) {
      if (!['pause', 'dart'].includes(sq.state)) continue;
      if (Math.hypot(sq.x - x, sq.z - z) > radius * 1.2) continue;
      // run to the far side of the trunk and up
      const a = Math.atan2(sq.tree.x - x, sq.tree.z - z);
      const rr = sq.tree.trunkR + 0.07;
      sq.tx = sq.tree.x + Math.sin(a) * rr; sq.tz = sq.tree.z + Math.cos(a) * rr;
      sq.yaw = a + Math.PI;
      sq.state = 'bolt'; sq.speed = 5.5; sq.t = 0;
      out.ran++;
    }
    return out;
  }

  // For tests and the dev page
  counts() {
    return { ducks: this.ducks.length, rabbits: this.rabbits.length, squirrels: this.squirrels.length, fireflies: this.fireflies ? this.ffBase.length : 0 };
  }

  update(dt) {
    this.t += dt;
    if (this.ducks.length) this.updateDucks(dt);
    if (this.rabbits.length) this.updateRabbits(dt);
    if (this.squirrels.length) this.updateSquirrels(dt);
    if (this.fireflies) this.updateFireflies();
  }
}
