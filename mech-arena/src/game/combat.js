/**
 * COMBAT
 * ------------------------------------------------------------------
 * Turns a trigger pull into damage. Three delivery models:
 *
 *   hitscan     instant -- lasers, TAG, point defence
 *   ballistic   travelling projectile with gravity drop and lead
 *   guided      missiles that steer, arc, cluster or home onto a lock
 *
 * Hit location is resolved from where the ray actually meets the target's
 * capsule, so aiming at the legs damages the legs. That is what makes the
 * per-section armour model worth having.
 */
import * as THREE from 'three';
import { damageAtRange } from '../data/weapons.js';
import { clamp, lerp, makeRng } from '../core/rng.js';

const rng = makeRng(0xC0FFEE);
const MAX_PROJECTILES = 900;

/* Hit-location bands as fractions of mech height, sampled bottom-up. */
function locationFromHit(mech, point, fromDir) {
  const rel = (point.y - mech.position.y) / mech.height;
  // Left/right is decided in the target's own frame.
  const dx = point.x - mech.position.x, dz = point.z - mech.position.z;
  const c = Math.cos(-mech.yaw), s = Math.sin(-mech.yaw);
  const lx = dx * c - dz * s;
  const side = lx < -mech.radius * 0.35 ? 'L' : lx > mech.radius * 0.35 ? 'R' : 'C';

  if (rel > 0.86) return 'HD';
  if (rel < 0.46) return side === 'L' ? 'LL' : side === 'R' ? 'RL' : (rng.chance(0.5) ? 'LL' : 'RL');
  if (side === 'L') return Math.abs(lx) > mech.radius * 0.8 ? 'LA' : 'LT';
  if (side === 'R') return Math.abs(lx) > mech.radius * 0.8 ? 'RA' : 'RT';
  return 'CT';
}

/** Cheap capsule test: a vertical cylinder with a spherical cap. */
function rayHitsMech(origin, dir, maxT, mech, out) {
  const r = mech.radius;
  const ox = origin.x - mech.position.x, oz = origin.z - mech.position.z;
  const a = dir.x * dir.x + dir.z * dir.z;
  if (a < 1e-8) return false;
  const b = 2 * (ox * dir.x + oz * dir.z);
  const c = ox * ox + oz * oz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0 || t > maxT) return false;
  const y = origin.y + dir.y * t;
  const bottom = mech.position.y, top = mech.position.y + mech.height;
  if (y < bottom || y > top) return false;
  out.set(origin.x + dir.x * t, y, origin.z + dir.z * t);
  out.t = t;
  return true;
}

export class Combat {
  constructor(match, world, fx, audio) {
    this.match = match;
    this.world = world;
    this.fx = fx;
    this.audio = audio;

    this.projectiles = [];
    this.freeList = [];
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      this.freeList.push({
        alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        prev: new THREE.Vector3(), owner: null, def: null, life: 0,
        homing: null, arcing: false, gravity: 0, damage: 0, radius: 0.3,
        color: 0xffffff, tracer: true, clusterAt: 0, mine: false, armTime: 0,
      });
    }
    this.mines = [];
    this.artillery = [];
    this.drones = [];
  }

  /* ---------------------------------------------------------------- */
  _alloc() {
    const p = this.freeList.pop();
    if (!p) return null;
    p.alive = true;
    this.projectiles.push(p);
    return p;
  }

  _free(p) {
    p.alive = false;
    p.homing = null;
    p.owner = null;
    const i = this.projectiles.indexOf(p);
    if (i >= 0) this.projectiles.splice(i, 1);
    this.freeList.push(p);
  }

  /* ================= firing ================= */

  /**
   * Where this mech's weapons are converging this frame.
   *
   * Hardpoints are metres apart on a mech's body. Firing every one of them
   * parallel to the crosshair means an arm-mounted gun lands its shots a
   * couple of metres to the side -- fine at 400m, a clean miss at 30m.
   * Real fire control converges the barrels on the aim point instead, and
   * that is what a player expects when the reticle is on a target.
   *
   * Recomputed at most once per mech per frame, since it costs a raycast.
   */
  convergencePoint(mech) {
    const frame = this.match.frameId;
    if (mech._convFrame === frame) return mech._convPoint;
    mech._convFrame = frame;

    const eye = mech.eyePosition(_conv1);
    const dir = mech.aimForward(_conv2);

    // Prefer the range to whatever this mech is actually shooting at. The
    // crosshair ray is a poor substitute: in a city it clips the corner of
    // a building forty metres away while the target is two hundred metres
    // down the street, and converging on the corner throws every arm-
    // mounted shot wide of the thing you were aiming at.
    let dist = null;
    const t = (mech.lockedTarget?.alive && mech.lockedTarget.team !== mech.team) ? mech.lockedTarget
      : (mech.target?.alive && mech.target.team !== mech.team) ? mech.target
      : null;
    if (t) {
      const along = _conv3.copy(t.position).setY(t.position.y + t.height * 0.5).sub(eye).dot(dir);
      if (along > 0) dist = along;
    }
    if (dist == null) {
      const hit = this.world.raycast(eye, dir, 1200);
      dist = hit ? hit.t : 600;
    }

    // Converging too close turns a small aiming error into a large one past
    // the convergence point, so keep a sane floor.
    dist = clamp(dist, 60, 1200);
    mech._convPoint = (mech._convPoint || new THREE.Vector3())
      .copy(eye).addScaledVector(dir, dist);
    return mech._convPoint;
  }

  /** Called by Mech when a weapon actually discharges. */
  fireWeapon(mech, inst, muzzlePos, chargeLevel = 1) {
    const d = inst.def;
    const pellets = d.pellets || 1;

    // Point this barrel at the convergence point rather than straight ahead.
    const converge = this.convergencePoint(mech);
    const baseDir = _dir.copy(converge).sub(muzzlePos);
    const len = baseDir.length();
    if (len < 0.001) baseDir.copy(mech.aimForward(_conv2));
    else baseDir.multiplyScalar(1 / len);

    // Aim assist for bots is applied by the AI, not here -- every shooter
    // goes through the same spread and travel-time maths.
    const spread = (d.spread || 0) * mech.spreadMul * mech.spreadBase
                 * (mech.grounded ? 1 : 1.55)
                 * (1 + Math.hypot(mech.velocity.x, mech.velocity.z) / Math.max(1, mech.maxSpeed) * 0.6)
                 * (d.cls === 'missile' ? mech.missileSpreadMul : 1);

    const dmgScale = mech.damageMul * mech.damageBase * chargeLevel;

    for (let i = 0; i < pellets; i++) {
      const dir = applySpread(baseDir, spread);
      if (d.mode === 'beam' || d.vel === 0) {
        this._hitscan(mech, inst, muzzlePos, dir, dmgScale);
      } else if (d.cls === 'missile') {
        this._launchMissile(mech, inst, muzzlePos, dir, dmgScale, i, pellets);
      } else {
        this._launchProjectile(mech, inst, muzzlePos, dir, dmgScale);
      }
    }

    if ((d.flags || []).includes('drone')) this._spawnDrones(mech, inst);
  }

  _hitscan(mech, inst, origin, dir, dmgScale) {
    const d = inst.def;
    const maxRange = d.max;
    const wall = this.world.raycast(origin, dir, maxRange);
    let hitMech = null, hitPoint = null, hitT = wall ? wall.t : maxRange;

    for (const other of this.match.aliveMechs()) {
      if (other === mech) continue;
      if (!this._canHit(mech, other, d)) continue;
      if (rayHitsMech(origin, dir, hitT, other, _hp)) {
        hitT = _hp.t;
        hitMech = other;
        hitPoint = _hp.clone();
      }
    }

    const endPoint = hitPoint || (wall
      ? origin.clone().addScaledVector(dir, wall.t)
      : origin.clone().addScaledVector(dir, maxRange));

    // Barriers belonging to the shooter's team do not stop their own fire.
    if (wall && !hitMech && wall.collider.kind === 'barrier' && wall.collider.meta?.team === mech.team) {
      // Re-trace past the friendly barrier.
      const past = origin.clone().addScaledVector(dir, wall.t + 1.2);
      return this._hitscan(mech, inst, past, dir, dmgScale);
    }

    const flags = d.flags || [];
    if (flags.includes('heal')) {
      this._resolveSupportBeam(mech, inst, origin, endPoint, hitMech);
      return;
    }
    if (flags.includes('tag') && hitMech) {
      hitMech.taggedUntil = performance.now() * 0.001 + 3.0;
      this.fx.beam(origin, endPoint, d.tracer, 0.05, 0.08);
      return;
    }

    if (d.mode === 'beam') this.fx.beam(origin, endPoint, d.tracer, d.dmg > 20 ? 0.24 : 0.12, 0.07);
    else this.fx.tracer(origin, endPoint, d.tracer, 0.08);

    if (hitMech) {
      const dist = origin.distanceTo(hitPoint);
      const dmg = damageAtRange(d, dist) * dmgScale;
      const loc = mech.pinpoint ? (mech.target === hitMech ? 'CT' : locationFromHit(hitMech, hitPoint, dir)) : locationFromHit(hitMech, hitPoint, dir);
      this.match.applyDamage(hitMech, mech, dmg, {
        location: loc, weapon: d, from: origin, point: hitPoint,
        type: d.cls === 'energy' ? 'energy' : 'kinetic',
        shred: flags.includes('shred'), overpen: flags.includes('overpen'),
      });
      if (flags.includes('emp')) hitMech.heat += d.dmg * 0.55 * (1 - hitMech.empResist);
      this.fx.sparks(hitPoint, dir.clone().negate(), 6, d.tracer);
      this.audio.impact(hitPoint, 'metal');
    } else if (wall) {
      const p = origin.clone().addScaledVector(dir, wall.t);
      this.fx.sparks(p, wall.normal, 5, d.tracer);
      this.audio.impact(p, 'stone');
      this._damageCollider(wall.collider, d.dmg * dmgScale, p);
    }
  }

  _resolveSupportBeam(mech, inst, origin, endPoint, hitMech) {
    const d = inst.def;
    if (hitMech && hitMech.team === mech.team && hitMech !== mech) {
      if (d.heal) {
        // d.heal is per second; the beam ticks at rpm/60 times a second.
        const healed = hitMech.repair(d.heal / (d.rpm / 60));
        mech.healingDone += healed;
        this.fx.repairTick(hitMech.position);
      }
      if (d.shieldGive) {
        hitMech.maxShield = Math.max(hitMech.maxShield, d.shieldGive * (1 + mech.shieldBonus));
        hitMech.shield = hitMech.maxShield;
        hitMech.shieldRegenDelay = 0;
      }
      this.fx.beam(origin, hitMech.position.clone().setY(hitMech.position.y + hitMech.height * 0.5), 0x9dff9d, 0.1, 0.09);
    } else {
      this.fx.beam(origin, endPoint, 0x9dff9d, 0.08, 0.07);
    }
  }

  _launchProjectile(mech, inst, origin, dir, dmgScale) {
    const d = inst.def;
    const p = this._alloc();
    if (!p) return;
    p.pos.copy(origin);
    p.prev.copy(origin);
    p.vel.copy(dir).multiplyScalar(d.vel);
    // Inherit a little of the shooter's motion: shots lead naturally.
    p.vel.addScaledVector(mech.velocity, 0.25);
    p.owner = mech;
    p.def = d;
    p.damage = d.dmg * dmgScale;
    p.life = clamp(d.max / d.vel * 1.4, 0.3, 8);
    p.gravity = (d.flags || []).includes('pierce') ? 1.5 : 9.2;
    p.arcing = false;
    p.homing = null;
    p.color = d.tracer;
    p.radius = clamp(d.dmg / 200, 0.12, 0.6);
    p.tracer = true;
    p.mine = false;
    p.clusterAt = 0;
    p.delay = 0;
    p.spawnPos = origin.clone();
  }

  _launchMissile(mech, inst, origin, dir, dmgScale, idx, total) {
    const d = inst.def;
    const flags = d.flags || [];
    const p = this._alloc();
    if (!p) return;
    p.pos.copy(origin);
    p.prev.copy(origin);
    p.owner = mech;
    p.def = d;
    p.damage = d.dmg * dmgScale;
    p.color = d.tracer;
    p.radius = 0.28;
    p.tracer = true;
    p.mine = flags.includes('mine');
    p.arcing = flags.includes('arcing');
    p.gravity = p.arcing ? 10.5 : 0.8;
    p.clusterAt = flags.includes('cluster') ? 0.55 : 0;
    p.life = clamp(d.max / Math.max(40, d.vel) * 2.4, 0.6, 12);
    p.spawnPos = origin.clone();

    // Ripple-fire: each tube leaves a fraction of a second after the last.
    p.delay = idx * (total > 6 ? 0.035 : 0.06);

    const launchDir = dir.clone();
    if (p.arcing) {
      // Lob it: the arc is what lets LRMs clear cover.
      launchDir.y += 0.55 + rng() * 0.2;
      launchDir.normalize();
    } else if (total > 1) {
      // Spread the rack out so a volley looks like a volley.
      launchDir.x += (rng() - 0.5) * 0.09;
      launchDir.y += (rng() - 0.5) * 0.09;
      launchDir.z += (rng() - 0.5) * 0.09;
      launchDir.normalize();
    }
    p.vel.copy(launchDir).multiplyScalar(d.vel * (p.arcing ? 1.0 : 0.55));
    p.accelTo = d.vel;

    if (flags.includes('homing')) {
      const tgt = mech.lockedTarget && mech.lockedTarget.alive ? mech.lockedTarget : this._taggedTarget(mech);
      if (tgt) p.homing = tgt;
    }
  }

  _taggedTarget(mech) {
    const now = performance.now() * 0.001;
    let best = null, bestD = Infinity;
    for (const m of this.match.aliveMechs()) {
      if (m.team === mech.team) continue;
      if (m.taggedUntil < now) continue;
      const d = m.position.distanceTo(mech.position);
      if (d < bestD) { bestD = d; best = m; }
    }
    return best;
  }

  _spawnDrones(mech, inst) {
    for (let i = 0; i < 2; i++) {
      this.drones.push({
        owner: mech, life: 22, angle: rng() * 6.28,
        pos: mech.position.clone().setY(mech.position.y + mech.height + 3),
        cooldown: rng() * 0.6, def: inst.def,
      });
    }
  }

  /* ================= per-frame ================= */

  update(dt) {
    this._updateProjectiles(dt);
    this._updateMines(dt);
    this._updateArtillery(dt);
    this._updateDrones(dt);
    this._updateAMS(dt);
  }

  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.life -= dt;
      if (p.life <= 0) { this._detonate(p, p.pos.clone(), null); continue; }

      p.prev.copy(p.pos);

      // Guidance.
      if (p.homing && p.homing.alive) {
        const tgt = _v1.copy(p.homing.position).setY(p.homing.position.y + p.homing.height * 0.5);
        // ECM and smoke break a lock mid-flight.
        if (this._lockBroken(p.owner, p.homing, p.pos)) {
          p.homing = null;
        } else {
          const want = tgt.sub(p.pos).normalize();
          const speed = p.vel.length();
          const turn = clamp(dt * 3.4, 0, 1);
          p.vel.lerp(want.multiplyScalar(speed), turn);
          if (p.accelTo && speed < p.accelTo) p.vel.setLength(Math.min(p.accelTo, speed + p.accelTo * 1.6 * dt));
        }
      } else if (p.accelTo) {
        const speed = p.vel.length();
        if (speed < p.accelTo) p.vel.setLength(Math.min(p.accelTo, speed + p.accelTo * 1.4 * dt));
      }

      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);

      // Cluster munitions split at the apex of their arc.
      if (p.clusterAt && p.vel.y < 0 && p.pos.y - p.spawnPos.y > 8) {
        this._splitCluster(p);
        continue;
      }

      const seg = _v2.subVectors(p.pos, p.prev);
      const segLen = seg.length();
      if (segLen > 0.0001) {
        const dir = _v3.copy(seg).multiplyScalar(1 / segLen);
        // Mechs first, then world.
        let bestT = segLen, hitMech = null, hitPoint = null;
        for (const m of this.match.aliveMechs()) {
          if (m === p.owner) continue;
          if (!this._canHit(p.owner, m, p.def)) continue;
          if (rayHitsMech(p.prev, dir, bestT, m, _hp)) {
            bestT = _hp.t; hitMech = m; hitPoint = _hp.clone();
          }
        }
        const wall = this.world.raycast(p.prev, dir, bestT);
        if (wall && (!hitMech || wall.t < bestT)) {
          if (!(wall.collider.kind === 'barrier' && wall.collider.meta?.team === p.owner?.team)) {
            const pt = p.prev.clone().addScaledVector(dir, wall.t);
            if (p.mine) this._placeMine(p, pt);
            else this._detonate(p, pt, null, wall.collider, wall.normal);
            continue;
          }
        }
        if (hitMech) { this._detonate(p, hitPoint, hitMech); continue; }
      }

      if (p.tracer) {
        const len = p.def.cls === 'missile' ? 2.4 : 5.5;
        const tail = _v4.copy(p.pos).addScaledVector(p.vel, -len / Math.max(1, p.vel.length()));
        this.fx.tracer(tail, p.pos, p.color, 0.06);
        if (p.def.cls === 'missile' && rng() < 0.55) {
          this.fx.particle(p.pos.x, p.pos.y, p.pos.z,
            -p.vel.x * 0.05 + rng.range(-1, 1), -p.vel.y * 0.05 + rng.range(0, 2), -p.vel.z * 0.05 + rng.range(-1, 1),
            { life: 0.5, size: 0.45, size1: 1.8, color: 0xb0a89c, color1: 0x2a2724, drag: 1.6, grav: 0.8 });
        }
      }
    }
  }

  _splitCluster(p) {
    const n = 5;
    const dmg = p.damage * 0.55;
    for (let i = 0; i < n; i++) {
      const c = this._alloc();
      if (!c) break;
      c.pos.copy(p.pos); c.prev.copy(p.pos);
      c.vel.copy(p.vel).multiplyScalar(0.55);
      c.vel.x += rng.range(-9, 9); c.vel.z += rng.range(-9, 9); c.vel.y -= rng.range(0, 5);
      c.owner = p.owner; c.def = p.def; c.damage = dmg;
      c.gravity = 11; c.life = 4; c.color = p.color; c.radius = 0.2;
      c.tracer = true; c.arcing = true; c.homing = null; c.clusterAt = 0; c.mine = false;
      c.delay = 0; c.spawnPos = p.pos.clone();
    }
    this.fx.burst(p.pos, 10, { speed: 6, life: 0.3, size: 0.4, size1: 0, color: 0xffd9a0, color1: 0x5a3a10 });
    this._free(p);
  }

  _placeMine(p, pt) {
    this.mines.push({
      pos: pt.clone(), owner: p.owner, def: p.def, damage: p.damage,
      life: 45, arm: 0.8, radius: p.def.splash?.r || 6,
    });
    this.fx.flash(pt, 0xff7a7a, 1.2, 0.1);
    this._free(p);
  }

  _detonate(p, point, hitMech, collider = null, normal = null) {
    const d = p.def;
    const flags = d.flags || [];
    if (hitMech) {
      const dist = p.spawnPos ? p.spawnPos.distanceTo(point) : 0;
      const dmg = damageAtRange(d, dist) / d.dmg * p.damage;
      const loc = locationFromHit(hitMech, point, p.vel);
      this.match.applyDamage(hitMech, p.owner, dmg, {
        location: loc, weapon: d, from: p.spawnPos, point,
        type: d.cls === 'energy' ? 'energy' : 'kinetic',
        shred: flags.includes('shred'), overpen: flags.includes('overpen'),
        stagger: flags.includes('stagger') ? 0.35 : 0,
      });
      if (flags.includes('emp')) hitMech.heat += d.dmg * 0.6 * (1 - hitMech.empResist);
      this.fx.sparks(point, p.vel.clone().normalize().negate(), 8, d.tracer);
      this.audio.impact(point, 'metal');
    }

    if (d.splash) {
      this._splashDamage(point, d.splash.r, d.splash.dmg * (p.damage / d.dmg), p.owner, d);
      this.fx.explosion(point, clamp(d.splash.r / 5, 0.4, 2.4), d.tracer);
      this.audio.explosion(point, clamp(d.splash.r / 6, 0.4, 2));
    } else if (!hitMech) {
      this.fx.sparks(point, normal || _up, 6, d.tracer);
      this.audio.impact(point, 'stone');
    }

    if (collider) this._damageCollider(collider, p.damage, point);
    if (flags.includes('pierce') && hitMech) {
      // Rail slugs carry on through. Halve the payload and continue.
      const cont = this._alloc();
      if (cont) {
        cont.pos.copy(point).addScaledVector(p.vel.clone().normalize(), hitMech.radius * 2.2);
        cont.prev.copy(cont.pos);
        cont.vel.copy(p.vel).multiplyScalar(0.8);
        cont.owner = p.owner; cont.def = d; cont.damage = p.damage * 0.45;
        cont.gravity = p.gravity; cont.life = 1.2; cont.color = d.tracer;
        cont.radius = p.radius; cont.tracer = true; cont.homing = null;
        cont.clusterAt = 0; cont.mine = false; cont.delay = 0;
        cont.spawnPos = cont.pos.clone();
      }
    }
    this._free(p);
  }

  _splashDamage(center, radius, damage, owner, def) {
    for (const m of this.match.aliveMechs()) {
      const d = m.position.clone().setY(m.position.y + m.height * 0.45).distanceTo(center);
      if (d > radius + m.radius) continue;
      const f = clamp(1 - (d - m.radius) / radius, 0, 1);
      if (f <= 0) continue;
      if (m === owner) {
        // Self-splash still hurts, but much less -- otherwise nobody would
        // ever fire a rocket at close range, which is half the fun.
        this.match.applyDamage(m, owner, damage * f * 0.28, { location:'CT', weapon: def, splash: true, type:'explosive', silent: true });
        continue;
      }
      if (m.team === owner?.team && this.match.friendlyFire === false) continue;
      this.match.applyDamage(m, owner, damage * f, {
        location: 'CT', weapon: def, from: center, splash: true, type: 'explosive',
      });
    }
    // Destructible scenery takes splash too.
    const cols = this.world.queryBox(center.x - radius, center.z - radius, center.x + radius, center.z + radius, []);
    for (const c of cols) if (c.destructible) this._damageCollider(c, damage * 0.6, center);
  }

  _damageCollider(c, dmg, point) {
    if (!c.destructible || !c.alive) return;
    c.hp -= dmg;
    if (c.hp <= 0) {
      c.alive = false;
      const center = new THREE.Vector3(
        (c.min.x + c.max.x) / 2, (c.min.y + c.max.y) / 2, (c.min.z + c.max.z) / 2);
      this.fx.explosion(center, 1.3);
      this.audio.explosion(center, 1.1);
    }
  }

  _updateMines(dt) {
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.life -= dt;
      m.arm -= dt;
      if (m.life <= 0) { this.mines.splice(i, 1); continue; }
      if (m.arm > 0) continue;
      if (rng() < dt * 6) this.fx.particle(m.pos.x, m.pos.y + 0.4, m.pos.z, 0, 0.6, 0,
        { life: 0.4, size: 0.3, size1: 0, color: 0xff5a5a, color1: 0x5a0000, drag: 1, grav: 0 });
      for (const t of this.match.aliveMechs()) {
        if (t.team === m.owner?.team) continue;
        if (t.position.distanceTo(m.pos) > m.radius * 0.7 + t.radius) continue;
        this._splashDamage(m.pos, m.radius, m.damage, m.owner, m.def);
        this.fx.explosion(m.pos, 1.5);
        this.audio.explosion(m.pos, 1.2);
        this.mines.splice(i, 1);
        break;
      }
    }
  }

  callArtillery(target, owner, opts) {
    this.artillery.push({
      target: target.clone(), owner, delay: opts.delay, radius: opts.radius,
      shells: opts.shells, damage: opts.damage, fired: 0, interval: 0.22, t: 0,
    });
  }

  _updateArtillery(dt) {
    for (let i = this.artillery.length - 1; i >= 0; i--) {
      const a = this.artillery[i];
      if (a.delay > 0) {
        a.delay -= dt;
        if (rng() < dt * 10) this.fx.particle(
          a.target.x + rng.range(-a.radius, a.radius), a.target.y + 0.5, a.target.z + rng.range(-a.radius, a.radius),
          0, 2, 0, { life: 0.5, size: 0.4, size1: 0, color: 0xff4d5e, color1: 0x5a0000, drag: 1, grav: 0 });
        continue;
      }
      a.t -= dt;
      if (a.t <= 0) {
        a.t = a.interval;
        const p = a.target.clone();
        p.x += rng.range(-a.radius, a.radius);
        p.z += rng.range(-a.radius, a.radius);
        p.y = this.world.safeGround(p.x, p.z);
        this._splashDamage(p, 11, a.damage, a.owner, { cls: 'missile', dmg: a.damage, tracer: 0xffa040 });
        this.fx.explosion(p, 1.8);
        this.audio.explosion(p, 1.4);
        a.fired++;
        if (a.fired >= a.shells) this.artillery.splice(i, 1);
      }
    }
  }

  _updateDrones(dt) {
    for (let i = this.drones.length - 1; i >= 0; i--) {
      const dr = this.drones[i];
      dr.life -= dt;
      if (dr.life <= 0 || !dr.owner?.alive) { this.drones.splice(i, 1); continue; }
      dr.angle += dt * 1.6;
      const o = dr.owner;
      const want = _v1.set(
        o.position.x + Math.cos(dr.angle) * 7,
        o.position.y + o.height + 3,
        o.position.z + Math.sin(dr.angle) * 7);
      dr.pos.lerp(want, clamp(dt * 3, 0, 1));
      this.fx.particle(dr.pos.x, dr.pos.y, dr.pos.z, 0, 0, 0,
        { life: 0.1, size: 0.55, size1: 0.4, color: 0x9fe8ff, color1: 0x9fe8ff, drag: 0, grav: 0 });
      dr.cooldown -= dt;
      if (dr.cooldown > 0) continue;
      const tgt = o.target && o.target.alive && o.target.team !== o.team ? o.target : null;
      if (!tgt || tgt.position.distanceTo(dr.pos) > dr.def.max) continue;
      dr.cooldown = 0.5;
      const aim = _v2.copy(tgt.position).setY(tgt.position.y + tgt.height * 0.5).sub(dr.pos).normalize();
      this.fx.tracer(dr.pos, tgt.position.clone().setY(tgt.position.y + tgt.height * 0.5), 0x9fe8ff, 0.08);
      this.match.applyDamage(tgt, o, dr.def.dmg, { location: 'CT', weapon: dr.def, from: dr.pos, type: 'energy' });
    }
  }

  /** Point defence: AMS weapons and Aegis domes shoot down missiles. */
  _updateAMS(dt) {
    const defenders = [];
    for (const m of this.match.aliveMechs()) {
      if (m.amsDome > 0) defenders.push({ mech: m, radius: m.amsDome, rate: 1 });
      for (const w of m.weapons) {
        if (!w || w.destroyed) continue;
        if ((w.def.flags || []).includes('ams')) defenders.push({ mech: m, radius: w.def.opt, rate: 0.55 });
      }
    }
    if (!defenders.length) return;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (p.def.cls !== 'missile' || p.mine) continue;
      for (const def of defenders) {
        if (def.mech.team === p.owner?.team) continue;
        const d = p.pos.distanceTo(def.mech.position);
        if (d > def.radius) continue;
        if (rng() > def.rate * dt * 5.5) continue;
        this.fx.tracer(def.mech.position.clone().setY(def.mech.position.y + def.mech.height * 0.7), p.pos, 0xffe9a0, 0.06);
        this.fx.impactBurst(p.pos, 0.5, 0xffe9a0);
        this.audio.impact(p.pos, 'metal');
        this._free(p);
        break;
      }
    }
  }

  /* ---------------------------------------------------------------- */
  _canHit(shooter, target, def) {
    if (!target.alive) return false;
    if (target.team === shooter.team && !this.match.friendlyFire) {
      // Support beams still need to "hit" allies.
      return !!(def.flags || []).includes('heal');
    }
    return true;
  }

  _lockBroken(owner, target, missilePos) {
    if (!target) return true;
    if (this.world.smokeBlocks(missilePos, target.position)) return true;
    for (const m of this.match.aliveMechs()) {
      if (!m.ecmRadius || m.team === owner?.team) continue;
      if (m.position.distanceTo(target.position) < m.ecmRadius * (1 - (owner?.ecmResist || 0))) return true;
    }
    return false;
  }

  reset() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) this._free(this.projectiles[i]);
    this.mines.length = 0;
    this.artillery.length = 0;
    this.drones.length = 0;
  }
}

/* ---------------- helpers ---------------- */
function applySpread(dir, spreadDeg) {
  if (spreadDeg <= 0.0001) return dir.clone();
  const rad = spreadDeg * Math.PI / 180;
  // Pick a random direction inside a cone around `dir`.
  const out = dir.clone();
  const up = Math.abs(out.y) > 0.95 ? _right : _up;
  const t1 = _v5.crossVectors(out, up).normalize();
  const t2 = _v6.crossVectors(out, t1).normalize();
  const a = rng() * Math.PI * 2;
  const r = Math.sqrt(rng()) * rad;
  out.addScaledVector(t1, Math.cos(a) * Math.tan(r));
  out.addScaledVector(t2, Math.sin(a) * Math.tan(r));
  return out.normalize();
}

const _dir = new THREE.Vector3();
const _conv1 = new THREE.Vector3();
const _conv2 = new THREE.Vector3();
const _conv3 = new THREE.Vector3();
const _hp = Object.assign(new THREE.Vector3(), { t: 0 });
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _right = new THREE.Vector3(1, 0, 0);

export { locationFromHit, rayHitsMech };
