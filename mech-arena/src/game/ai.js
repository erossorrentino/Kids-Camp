/**
 * BOT PILOTS
 * ------------------------------------------------------------------
 * A bot writes the same intent fields a human's input writes, so bots and
 * players run through identical physics, heat and weapon code. No bot
 * gets extra damage, extra armour or perfect aim -- difficulty is spent
 * on reaction time, aim error and how well they read the situation.
 *
 * Behaviour is a small state machine:
 *   patrol   -> nothing seen; move toward the objective or a waypoint
 *   engage   -> hold the optimal bracket for its best weapon and shoot
 *   flank    -> break line of sight and come around the side
 *   retreat  -> badly hurt or overheating; break contact and cool down
 *   support  -> a healer sticking to the most damaged ally
 *   capture  -> stand in the zone because the mode says so
 */
import * as THREE from 'three';
import { clamp, lerp, damp, angleDelta, makeRng } from '../core/rng.js';
import { dps, damageAtRange } from '../data/weapons.js';

export const DIFFICULTIES = {
  recruit:  { label:'RECRUIT',  react:0.55, aimError:5.2, lead:0.35, cover:0.25, abilityIQ:0.3, burstDiscipline:0.35, heatIQ:0.3, rangeIQ:0.35, focusFire:0.2 },
  regular:  { label:'REGULAR',  react:0.35, aimError:3.0, lead:0.62, cover:0.5,  abilityIQ:0.55, burstDiscipline:0.55, heatIQ:0.55, rangeIQ:0.6, focusFire:0.45 },
  veteran:  { label:'VETERAN',  react:0.22, aimError:1.7, lead:0.85, cover:0.72, abilityIQ:0.78, burstDiscipline:0.75, heatIQ:0.78, rangeIQ:0.8, focusFire:0.7 },
  elite:    { label:'ELITE',    react:0.14, aimError:0.95,lead:0.95, cover:0.88, abilityIQ:0.92, burstDiscipline:0.9,  heatIQ:0.92, rangeIQ:0.92, focusFire:0.88 },
  ace:      { label:'ACE',      react:0.09, aimError:0.55,lead:1.0,  cover:0.96, abilityIQ:1.0,  burstDiscipline:0.97, heatIQ:1.0,  rangeIQ:1.0, focusFire:0.96 },
};

const REPATH_INTERVAL = 0.45;

export class BotBrain {
  constructor(mech, match, difficulty = 'regular') {
    this.mech = mech;
    this.match = match;
    this.world = match.world;
    this.d = DIFFICULTIES[difficulty] || DIFFICULTIES.regular;
    this.difficulty = difficulty;
    this.rng = makeRng(mech.id * 104729 + 7);

    this.state = 'patrol';
    this.stateTime = 0;
    this.target = null;
    this.targetSeenAt = -99;
    this.lastKnownTargetPos = new THREE.Vector3();
    this.reactionTimer = 0;
    this.repathTimer = 0;
    this.waypoint = null;
    this.strafeDir = this.rng.chance(0.5) ? 1 : -1;
    this.strafeTimer = 0;
    this.aimJitter = new THREE.Vector2();
    this.jitterTimer = 0;
    this.burstTimer = 0;
    this.burstOn = false;
    this.avoidVec = new THREE.Vector3();
    this.stuckTimer = 0;
    this.lastPos = mech.position.clone();
    this.jumpCooldown = 0;
    this.preferredRange = this._computePreferredRange();
    // Range targets move and dodge so they are worth shooting at, but never
    // fire back. The flag is set by the match after construction.
    this.passive = false;
    this.isSupport = mech.weapons.some(w => w && (w.def.flags || []).includes('heal'));
  }

  /** The bracket this loadout actually wants to fight in. */
  _computePreferredRange() {
    let num = 0, den = 0;
    for (const w of this.mech.weapons) {
      if (!w) continue;
      const weight = dps(w.def);
      num += w.def.opt * weight;
      den += weight;
    }
    return den > 0 ? num / den : 250;
  }

  /* ================================================================ */
  update(dt) {
    const m = this.mech;
    if (!m.alive) return;

    this.stateTime += dt;
    this.reactionTimer -= dt;
    this.repathTimer -= dt;
    this.strafeTimer -= dt;
    this.jitterTimer -= dt;
    this.burstTimer -= dt;
    this.jumpCooldown -= dt;

    this._sense(dt);
    this._chooseState(dt);
    this._act(dt);
    this._antiStuck(dt);
  }

  /* ---- perception ---- */
  _sense(dt) {
    const m = this.mech;
    const now = this.match.time;

    // Re-evaluate the target only as often as reaction time allows.
    if (this.reactionTimer <= 0) {
      this.reactionTimer = this.d.react * this.rng.range(0.7, 1.3);
      const best = this._pickTarget();
      if (best !== this.target) {
        this.target = best;
        // Switching targets costs a beat, even for an ace.
        this.reactionTimer += this.d.react * 0.6;
      }
    }

    if (this.target && this.target.alive && this._canSee(this.target)) {
      this.targetSeenAt = now;
      this.lastKnownTargetPos.copy(this.target.position);
    }
    if (this.target && !this.target.alive) this.target = null;
    // Publish it: fire control converges the barrels on the current target.
    m.target = this.target;
  }

  _canSee(other) {
    const m = this.mech;
    if (other.cloaked && m.position.distanceTo(other.position) > 45 * (1 - other.stealthBonus)) return false;
    const now = this.match.time;
    if (other.revealedUntil > now || other.taggedUntil > now) return true;
    const from = m.eyePosition(_v1);
    const to = _v2.copy(other.position).setY(other.position.y + other.height * 0.55);
    if (from.distanceTo(to) > m.sensorRange * 2.4) return false;
    if (this.world.smokeBlocks(from, to)) return false;
    return this.world.lineOfSight(from, to, other.radius * 0.9);
  }

  _pickTarget() {
    const m = this.mech;
    let best = null, bestScore = -Infinity;
    const focus = this.match.focusTarget?.(m.team);

    for (const other of this.match.aliveMechs()) {
      if (other.team === m.team) continue;
      const dist = m.position.distanceTo(other.position);
      if (dist > m.sensorRange * 2.4) continue;
      const visible = this._canSee(other);
      // A contact behind cover is still a contact: a pilot who forgets about
      // everything the moment it breaks line of sight never finds a fight on
      // a dense map.
      if (!visible && dist > m.sensorRange * 0.9) continue;

      // Score: closer is better, hurt is better, and the weapons actually
      // reaching them matters more than raw proximity.
      let score = 900 - dist * 1.6;
      score += (1 - other.healthFraction) * 420;
      score -= Math.abs(dist - this.preferredRange) * 0.9;
      if (!visible) score -= 380;
      if (other === this.target) score += 130;             // avoid dithering
      if (other.lastDamagedBy === m) score += 90;
      if (focus && other === focus) score += 320 * this.d.focusFire;
      if (other.isPlayer) score += 40;                      // bots do contest the player
      if (other.juggernaut) score += 260;
      best = score > bestScore ? (bestScore = score, other) : best;
    }
    return best;
  }

  /* ---- decision ---- */
  _chooseState(dt) {
    const m = this.mech;
    const hp = m.healthFraction;
    const heat = m.heatFraction;
    const seen = this.match.time - this.targetSeenAt < 2.5;

    let next = this.state;

    if (m.shutdown) next = 'retreat';
    else if (hp < 0.24 && this.rng.chance(this.d.heatIQ)) next = 'retreat';
    else if (heat > 0.9 && this.d.heatIQ > 0.4) next = 'retreat';
    else if (this._wantsResupply()) next = 'resupply';
    else if (this.isSupport && this._woundedAlly()) next = 'support';
    else if (this.target && seen) {
      const dist = m.position.distanceTo(this.target.position);
      const badBracket = dist > this.preferredRange * 2.1 || dist < this.preferredRange * 0.25;
      if (badBracket && this.rng.chance(this.d.rangeIQ) && this.stateTime > 1.2) next = 'flank';
      else next = 'engage';
    } else if (this.match.wantsObjective(m)) next = 'capture';
    else next = 'patrol';

    // Flanking is a commitment, not a twitch.
    if (this.state === 'flank' && this.stateTime < 2.6 && next === 'engage') next = 'flank';
    if (this.state === 'retreat' && hp < 0.5 && heat > 0.45 && this.stateTime < 4) next = 'retreat';

    if (next !== this.state) {
      this._announce(this.state, next);
      this.state = next;
      this.stateTime = 0;
      this.waypoint = null;
      this.repathTimer = 0;
    }
  }

  /** A line of chatter when the situation changes enough to be worth one. */
  _announce(from, to) {
    const m = this.mech;
    const t = this.target;
    if (to === 'engage' && from !== 'hunt' && t) {
      const cls = t.chassis.classLabel.toLowerCase();
      this.match.say(m, 'contact',
        this.rng.chance(0.5)
          ? `Contact — ${cls}, ${Math.round(m.position.distanceTo(t.position))} metres.`
          : `Engaging a ${cls}. ${t.name}.`);
    } else if (to === 'retreat') {
      this.match.say(m, 'retreat',
        m.heatFraction > 0.85 ? 'Cooking off — breaking contact.'
          : m.shutdown ? 'Reactor scrammed, I am a sitting target.'
          : `I am down to ${Math.round(m.healthFraction * 100)} percent. Falling back.`);
    } else if (to === 'resupply') {
      this.match.say(m, 'resupply',
        this._lowOnAmmo() ? 'Running dry. Hitting a pad.' : 'Pulling out for a patch-up.');
    } else if (to === 'flank' && t) {
      this.match.say(m, 'flank', `Going around on ${t.name}. Hold their attention.`);
    } else if (to === 'support' && this.supportTarget) {
      this.match.say(m, 'support', `Coming to you, ${this.supportTarget.name}.`);
    }
  }

  _woundedAlly() {
    const m = this.mech;
    let best = null, worst = 0.82;
    for (const a of this.match.aliveMechs()) {
      if (a.team !== m.team || a === m) continue;
      if (a.healthFraction < worst) { worst = a.healthFraction; best = a; }
    }
    this.supportTarget = best;
    return !!best;
  }

  /* ---- action ---- */
  _act(dt) {
    const m = this.mech;
    m.moveX = 0; m.moveZ = 0;
    m.wantJump = false;
    m.wantBrake = false;
    m.firing.clear();
    this._considerMelee();

    switch (this.state) {
      case 'engage': this._engage(dt); break;
      case 'flank': this._flank(dt); break;
      case 'retreat': this._retreat(dt); break;
      case 'support': this._support(dt); break;
      case 'capture': this._capture(dt); break;
      case 'hunt': this._hunt(dt); break;
      case 'resupply': this._resupply(dt); break;
      default: this._patrol(dt); break;
    }

    this._considerAbility(dt);
  }

  _engage(dt) {
    const m = this.mech, t = this.target;
    if (!t) { this._patrol(dt); return; }

    const toTarget = _v1.subVectors(t.position, m.position);
    const dist = toTarget.length();
    const visible = this._canSee(t);

    this._aimAt(t, dt, visible);

    // Hold the bracket: close if long, back off if smothered.
    const want = this.preferredRange * lerp(1.15, 0.85, this.d.rangeIQ);
    const err = dist - want;
    let forward = clamp(err / 60, -1, 1);
    if (Math.abs(err) < want * 0.18) forward = 0;

    // Strafe so they are not a stationary target.
    if (this.strafeTimer <= 0) {
      this.strafeTimer = this.rng.range(0.9, 2.2);
      if (this.rng.chance(0.55)) this.strafeDir *= -1;
    }
    const strafe = this.strafeDir * (0.55 + this.d.cover * 0.45);

    this._moveTowardHeading(Math.atan2(toTarget.x, toTarget.z), forward, strafe, dt);

    // Use cover when hurt: duck behind the nearest blocker.
    if (m.healthFraction < 0.45 && !visible && this.d.cover > 0.4) m.wantBrake = true;

    if (visible) this._shoot(t, dist, dt);
    else if (this.match.time - this.targetSeenAt < 1.2) {
      // Keep firing at the last known position with indirect weapons only.
      this._shoot(t, dist, dt, true);
    }

    // Jump to break a stalemate or clear an obstacle.
    if (m.jets.thrust > 0 && this.jumpCooldown <= 0 && this.rng.chance(dt * (visible ? 0.35 : 0.9) * this.d.cover)) {
      m.wantJump = true;
      this.jumpCooldown = this.rng.range(2.5, 6);
    }
  }

  _flank(dt) {
    const m = this.mech, t = this.target;
    if (!t) { this._patrol(dt); return; }
    if (this.repathTimer <= 0 || !this.waypoint) {
      this.repathTimer = REPATH_INTERVAL * 3;
      // Aim for a point on the far side, offset perpendicular to the approach.
      const to = _v1.subVectors(t.position, m.position).setY(0).normalize();
      const perp = _v2.set(-to.z, 0, to.x).multiplyScalar(this.strafeDir * this.rng.range(45, 95));
      this.waypoint = t.position.clone().add(perp).addScaledVector(to, -this.preferredRange * 0.8);
      this.waypoint.y = this.world.safeGround(this.waypoint.x, this.waypoint.z);
    }
    this._navigateTo(this.waypoint, dt, 1);
    this._aimAt(t, dt, this._canSee(t));
    if (this._canSee(t)) this._shoot(t, m.position.distanceTo(t.position), dt);
    if (m.position.distanceTo(this.waypoint) < 16) { this.state = 'engage'; this.stateTime = 0; }
  }

  _retreat(dt) {
    const m = this.mech;
    if (this.repathTimer <= 0 || !this.waypoint) {
      this.repathTimer = REPATH_INTERVAL * 4;
      const away = this.target
        ? _v1.subVectors(m.position, this.target.position).setY(0).normalize()
        : _v1.set(this.rng.range(-1, 1), 0, this.rng.range(-1, 1)).normalize();
      // Head back toward friendly territory, not just "away".
      const home = this.match.spawnCenter(m.team);
      const dir = away.lerp(_v2.subVectors(home, m.position).setY(0).normalize(), 0.5).normalize();
      this.waypoint = m.position.clone().addScaledVector(dir, 110);
      this.waypoint.y = this.world.safeGround(this.waypoint.x, this.waypoint.z);
    }
    this._navigateTo(this.waypoint, dt, 1);
    // Keep the guns pointed back while withdrawing.
    if (this.target) {
      this._aimAt(this.target, dt, this._canSee(this.target));
      if (this._canSee(this.target) && m.heatFraction < 0.7) {
        this._shoot(this.target, m.position.distanceTo(this.target.position), dt);
      }
    }
    if (m.heatFraction > 0.55) m.wantBrake = true;   // stand still and cool
  }

  _support(dt) {
    const m = this.mech;
    const ally = this.supportTarget;
    if (!ally || !ally.alive) { this.state = 'patrol'; return; }
    const dist = m.position.distanceTo(ally.position);
    const healWeapon = m.weapons.find(w => w && !w.destroyed && (w.def.flags || []).includes('heal'));
    const idealRange = healWeapon ? healWeapon.def.opt * 0.55 : 40;

    this._navigateTo(ally.position, dt, dist > idealRange ? 1 : -0.35);
    this._aimAtPoint(_v1.copy(ally.position).setY(ally.position.y + ally.height * 0.5), dt);
    if (healWeapon && dist < healWeapon.def.opt) m.firing.add(healWeapon.index);

    // Shoot back with everything else if something is in front of us.
    if (this.target && this._canSee(this.target) && dist > idealRange * 0.6) {
      this._aimAt(this.target, dt, true);
      this._shoot(this.target, m.position.distanceTo(this.target.position), dt);
    }
  }

  _capture(dt) {
    const m = this.mech;
    const zone = this.match.bestZoneFor(m);
    if (!zone) { this._patrol(dt); return; }
    const dist = m.position.distanceTo(zone.pos);
    if (dist > zone.radius * 0.6) this._navigateTo(zone.pos, dt, 1);
    else {
      // Inside the zone: circle the middle rather than standing still.
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) { this.strafeTimer = this.rng.range(1.2, 2.6); this.strafeDir *= -1; }
      this._moveTowardHeading(Math.atan2(zone.pos.x - m.position.x, zone.pos.z - m.position.z), 0, this.strafeDir * 0.6, dt);
    }
    if (this.target && this._canSee(this.target)) {
      this._aimAt(this.target, dt, true);
      this._shoot(this.target, m.position.distanceTo(this.target.position), dt);
    } else {
      m.aimYaw = damp(m.aimYaw, m.yaw, 3, dt);
    }
  }

  /**
   * Does this pilot have a reason to break off for a resupply pad, and is
   * one close enough to be worth the walk?
   */
  _wantsResupply() {
    const pads = this.match.pickups;
    if (!pads) return false;
    const m = this.mech;

    let want = null;
    if (m.healthFraction < 0.5) want = 'repair';
    else if (m.heatFraction > 0.85) want = 'coolant';
    else if (this._lowOnAmmo()) want = 'ammo';
    if (!want) return false;

    const pad = pads.nearestLive(m.position, want) || pads.nearestLive(m.position);
    if (!pad) return false;
    // Only worth it if it is nearer than the fight is dangerous.
    const d = pad.pos.distanceTo(m.position);
    if (d > 220) return false;
    this.resupplyPad = pad;
    return true;
  }

  _lowOnAmmo() {
    const m = this.mech;
    let any = false, dry = 0, total = 0;
    for (const w of m.weapons) {
      if (!w || w.destroyed || w.def.ammo < 0) continue;
      any = true; total++;
      const max = Math.round(w.def.ammo * (1 + (m.mods.ammo || 0)));
      if (w.ammo < max * 0.2) dry++;
    }
    return any && dry / total > 0.6;
  }

  _resupply(dt) {
    const m = this.mech;
    const pad = this.resupplyPad;
    if (!pad || pad.cooldown > 0) { this.state = 'patrol'; this.stateTime = 0; return; }
    this._navigateTo(pad.pos, dt, 1);
    if (this.target && this._canSee(this.target)) {
      this._aimAt(this.target, dt, true);
      this._shoot(this.target, m.position.distanceTo(this.target.position), dt);
    }
    if (m.position.distanceTo(pad.pos) < 6) { this.state = 'engage'; this.stateTime = 0; }
  }

  /**
   * Move to where the target was last seen. This is what keeps a fight
   * going on a map full of corners -- without it, bots lose contact the
   * moment anyone steps behind a wall and drift back to wandering.
   */
  _hunt(dt) {
    const m = this.mech;
    const t = this.target;
    if (!t || !t.alive) { this._patrol(dt); return; }

    // If the target is visible again, that is the engage state's job.
    if (this._canSee(t)) { this.state = 'engage'; this.stateTime = 0; return; }

    if (!this.waypoint || this.repathTimer <= 0) {
      this.repathTimer = REPATH_INTERVAL * 2;
      // Head for the last known position, but bias toward where they were
      // heading rather than where they stood.
      this.waypoint = this.lastKnownTargetPos.clone().addScaledVector(t.velocity, 1.2);
      this.waypoint.y = this.world.safeGround(this.waypoint.x, this.waypoint.z);
    }
    this._navigateTo(this.waypoint, dt, 1);
    this._aimAtPoint(_v1.copy(this.waypoint).setY(this.waypoint.y + 6), dt);

    // Indirect-fire weapons can still work the last known position.
    const dist = m.position.distanceTo(this.waypoint);
    if (dist < 400 && this.match.time - this.targetSeenAt < 3) this._shoot(t, dist, dt, true);

    if (m.position.distanceTo(this.waypoint) < 14) {
      this.waypoint = null;
      this.repathTimer = 0;
      // Arrived and found nothing: stop hunting a cold trail.
      if (this.match.time - this.targetSeenAt > 6) { this.target = null; this.state = 'patrol'; this.stateTime = 0; }
    }
  }

  _patrol(dt) {
    const m = this.mech;
    if (!this.waypoint || m.position.distanceTo(this.waypoint) < 18 || this.repathTimer <= 0) {
      this.repathTimer = REPATH_INTERVAL * 8;
      const obj = this.match.patrolPoint(m);
      this.waypoint = obj.clone();
      this.waypoint.y = this.world.safeGround(this.waypoint.x, this.waypoint.z);
    }
    this._navigateTo(this.waypoint, dt, 1);
    // Sweep the torso while walking so bots visibly scan.
    m.aimYaw = m.yaw + Math.sin(this.match.time * 0.7 + this.mech.id) * 0.7;
    m.aimPitch = damp(m.aimPitch, 0, 4, dt);
  }

  /* ---- movement primitives ---- */

  _navigateTo(point, dt, sign = 1) {
    const m = this.mech;
    const to = _v3.subVectors(point, m.position).setY(0);
    const dist = to.length();
    if (dist < 0.5) return;
    to.multiplyScalar(1 / dist);

    // Steer around obstacles with three short whisker rays.
    const avoid = this._avoidance(to);
    const steer = _v4.copy(to).addScaledVector(avoid, 1.5).normalize();
    this._moveTowardHeading(Math.atan2(steer.x, steer.z), sign, 0, dt);

    // Jump over things that are genuinely in the way.
    if (m.jets.thrust > 0 && avoid.lengthSq() > 0.5 && this.jumpCooldown <= 0 && this.rng.chance(dt * 1.6)) {
      m.wantJump = true;
      this.jumpCooldown = this.rng.range(2, 4);
    }
  }

  _avoidance(forward) {
    const m = this.mech;
    const out = this.avoidVec.set(0, 0, 0);
    const origin = _v5.copy(m.position).setY(m.position.y + m.height * 0.45);
    const probe = 16 + m.radius * 2;
    for (const off of [-0.55, 0, 0.55]) {
      const a = Math.atan2(forward.x, forward.z) + off;
      _v6.set(Math.sin(a), 0, Math.cos(a));
      const hit = this.world.raycast(origin, _v6, probe);
      if (!hit) continue;
      // Ignore things we can simply step over.
      if (hit.collider.max.y < m.position.y + m.height * 0.25) continue;
      const w = (1 - hit.t / probe) * (off === 0 ? 1.4 : 1);
      out.x -= Math.sin(a + (off >= 0 ? -1.3 : 1.3)) * w;
      out.z -= Math.cos(a + (off >= 0 ? -1.3 : 1.3)) * w;
    }
    return out;
  }

  _moveTowardHeading(heading, forward, strafe, dt) {
    const m = this.mech;
    m.desiredYaw = heading;
    // Translate world-space intent into the mech's local move axes.
    const rel = angleDelta(m.yaw, heading);
    const c = Math.cos(rel), s = Math.sin(rel);
    m.moveZ = clamp(forward * c - strafe * s, -1, 1);
    m.moveX = clamp(forward * s + strafe * c, -1, 1);
  }

  _antiStuck(dt) {
    const m = this.mech;
    const moved = m.position.distanceTo(this.lastPos);
    this.lastPos.copy(m.position);
    const trying = Math.abs(m.moveX) + Math.abs(m.moveZ) > 0.2;
    if (trying && moved < 0.04 * (dt * 60)) this.stuckTimer += dt;
    else this.stuckTimer = Math.max(0, this.stuckTimer - dt * 2);

    if (this.stuckTimer > 0.9) {
      // Back out, turn, and pick a new waypoint.
      this.strafeDir *= -1;
      this.waypoint = null;
      this.repathTimer = 0;
      m.desiredYaw = m.yaw + this.rng.range(1.8, 4.4);
      m.moveZ = -0.8;
      if (m.jets.thrust > 0) m.wantJump = true;
      this.stuckTimer = 0;
    }
  }

  /* ---- gunnery ---- */

  _aimAt(target, dt, visible) {
    const m = this.mech;
    const aimPoint = _v1.copy(visible ? target.position : this.lastKnownTargetPos);
    aimPoint.y += target.height * this._aimHeightBias();

    if (visible) {
      // Lead the target by its velocity over the projectile's flight time.
      const best = this._bestWeaponFor(m.position.distanceTo(target.position));
      const vel = best?.def.vel || 0;
      if (vel > 0) {
        const tof = m.position.distanceTo(target.position) / vel;
        aimPoint.addScaledVector(target.velocity, tof * this.d.lead);
        // Compensate for gravity drop on the same flight time.
        if (best && best.def.cls !== 'energy') aimPoint.y += 0.5 * 9.2 * tof * tof * this.d.lead;
      }
    }
    this._aimAtPoint(aimPoint, dt);
  }

  /** Bots aim for the centre of mass, with better pilots biasing higher. */
  _aimHeightBias() { return lerp(0.42, 0.58, this.d.aimError < 2 ? 0.8 : 0.3); }

  _aimAtPoint(point, dt) {
    const m = this.mech;
    if (this.jitterTimer <= 0) {
      this.jitterTimer = this.rng.range(0.16, 0.42);
      const e = this.d.aimError;
      this.aimJitter.set(this.rng.range(-e, e), this.rng.range(-e * 0.6, e * 0.6));
    }
    const eye = m.eyePosition(_v5);
    const dx = point.x - eye.x, dy = point.y - eye.y, dz = point.z - eye.z;
    const flat = Math.hypot(dx, dz);
    const wantYaw = Math.atan2(dx, dz) + this.aimJitter.x * Math.PI / 180;
    const wantPitch = Math.atan2(dy, flat) + this.aimJitter.y * Math.PI / 180;

    // Turn rate is the chassis's, not the bot's -- an Atlas still tracks slowly.
    const rate = m.torsoTurnRate * dt;
    const dYaw = angleDelta(m.aimYaw, wantYaw);
    m.aimYaw += clamp(dYaw, -rate, rate);
    const dPitch = wantPitch - m.aimPitch;
    m.aimPitch = clamp(m.aimPitch + clamp(dPitch, -rate, rate), -0.85, 0.85);
  }

  _bestWeaponFor(dist) {
    const m = this.mech;
    let best = null, bestScore = -1;
    for (const w of m.weapons) {
      if (!w || w.destroyed || w.reloading > 0) continue;
      if (w.ammo === 0 && w.mag <= 0) continue;
      const score = damageAtRange(w.def, dist) * (w.def.pellets || 1) * (w.def.rpm / 60);
      if (score > bestScore) { bestScore = score; best = w; }
    }
    return best;
  }

  _shoot(target, dist, dt, indirectOnly = false) {
    if (this.passive) return;
    const m = this.mech;

    // Only pull the trigger once the torso is actually pointed at them.
    const eye = m.eyePosition(_v5);
    const want = _v6.copy(target.position).setY(target.position.y + target.height * 0.45).sub(eye);
    const wantYaw = Math.atan2(want.x, want.z);
    const aimOff = Math.abs(angleDelta(m.aimYaw, wantYaw));
    const angularSize = Math.atan2(target.radius, Math.max(1, dist));
    if (aimOff > angularSize + 0.12) return;

    // Heat discipline: stop before shutting down.
    const heatCeiling = lerp(1.05, 0.82, this.d.heatIQ);
    // Trigger discipline: even good pilots fire in bursts, not one long hose.
    if (this.burstTimer <= 0) {
      this.burstOn = !this.burstOn;
      this.burstTimer = this.burstOn
        ? this.rng.range(0.35, 1.1)
        : this.rng.range(0.12, 0.5) * (1 - this.d.burstDiscipline * 0.6);
    }
    if (!this.burstOn && m.heatFraction > 0.4) return;

    for (const w of m.weapons) {
      if (!w || w.destroyed || w.reloading > 0) continue;
      if (w.ammo === 0 && w.mag <= 0) continue;
      const d = w.def;
      if (indirectOnly && !(d.flags || []).includes('arcing')) continue;
      if ((d.flags || []).includes('heal')) continue;
      // Do not waste long-range ammunition at knife range, or vice versa.
      if (dist > d.max * 0.98) continue;
      if (this.d.rangeIQ > 0.5 && dist < d.opt * 0.12 && d.splash && d.splash.r > 5) continue;
      if (m.heatFraction + d.heat / m.heatCapacity > heatCeiling) continue;
      if (d.mode === 'lock' && (d.flags || []).includes('homing') && m.lockedTarget !== target) continue;
      m.firing.add(w.index);
    }
  }

  /**
   * Throw a punch when something is already inside knife range. Bots do
   * not chase for melee -- that reads as suicidal -- but they will not
   * pass up a free hit either.
   */
  _considerMelee() {
    const m = this.mech;
    if (m.meleeCooldown > 0 || m.meleeSwing > 0 || m.shutdown) return;
    const t = this.target;
    if (!t || !t.alive || t.team === m.team) return;
    const d = m.position.distanceTo(t.position);
    if (d > m.meleeReach + t.radius * 0.8) return;
    // Only when actually facing them, and only as often as skill allows.
    const to = _v6.subVectors(t.position, m.position).setY(0).normalize();
    if (to.dot(m.aimForward(_v5).setY(0).normalize()) < 0.65) return;
    if (!this.rng.chance(0.35 + this.d.abilityIQ * 0.6)) return;
    m.wantMelee = true;
  }

  /* ---- abilities ---- */
  _considerAbility(dt) {
    const m = this.mech;
    if (this.passive) return;
    if (m.abilityCd > 0 || m.abilityActive || m.shutdown) return;
    if (!this.rng.chance(dt * 6 * this.d.abilityIQ)) return;

    const id = m.ability.id;
    const t = this.target;
    const dist = t ? m.position.distanceTo(t.position) : Infinity;
    const hp = m.healthFraction;
    const heat = m.heatFraction;
    let want = false;

    switch (id) {
      case 'blink': want = (hp < 0.4 && dist < 120) || (dist > 90 && dist < 200 && hp > 0.6); break;
      case 'afterburn': want = this.state === 'flank' || this.state === 'retreat' || (t && dist > 160); break;
      case 'vault': want = this.state === 'flank' || (t && dist > 110) || this.stuckTimer > 0.4; break;
      case 'overdrive': want = this.state !== 'patrol' && (hp < 0.5 || dist < 90); break;
      case 'charge': want = !!t && dist < 70 && dist > 16 && this._canSee(t); break;
      case 'deathdrop': want = !!t && dist < 34 && this._canSee(t); break;
      case 'bulwark': want = !!t && this._canSee(t) && hp < 0.7 && dist < 260; break;
      case 'braced': want = !!t && this._canSee(t) && dist > this.preferredRange * 0.7; break;
      case 'shieldwall': want = !!t && this._canSee(t) && dist < 200; break;
      case 'ams_dome': want = this._missilesIncoming(); break;
      case 'smoke': want = hp < 0.5 || this._missilesIncoming(); break;
      case 'cloak': want = hp < 0.45 || this.state === 'flank'; break;
      case 'overclock': want = !!t && this._canSee(t) && dist < this.preferredRange * 1.3 && heat < 0.45; break;
      case 'alpha': want = !!t && this._canSee(t) && dist < this.preferredRange * 1.2; break;
      case 'stomp': want = this._enemiesWithin(17) > 0; break;
      case 'emp_burst': want = this._enemiesWithin(22) > 0; break;
      case 'jammer': want = !!t && dist < 150; break;
      case 'scan': want = !t || this.state === 'patrol' || this.match.time % 30 < 1; break;
      case 'targetlock': want = !!t && this._canSee(t); break;
      case 'artillery': want = !!t && this._canSee(t) && dist > 90; break;
      case 'skyfall': want = !!t && this._canSee(t) && m.weapons.some(w => w && w.def.cls === 'missile'); break;
      case 'repairfield': want = this._alliesHurtWithin(20) > 0; break;
      default: want = !!t;
    }
    if (want) m.wantAbility = true;
  }

  _enemiesWithin(r) {
    let n = 0;
    for (const o of this.match.aliveMechs()) {
      if (o.team === this.mech.team) continue;
      if (o.position.distanceTo(this.mech.position) < r) n++;
    }
    return n;
  }

  _alliesHurtWithin(r) {
    let n = 0;
    for (const o of this.match.aliveMechs()) {
      if (o.team !== this.mech.team) continue;
      if (o.healthFraction < 0.75 && o.position.distanceTo(this.mech.position) < r) n++;
    }
    return n;
  }

  _missilesIncoming() {
    const c = this.match.combat;
    for (const p of c.projectiles) {
      if (p.def.cls !== 'missile' || p.owner?.team === this.mech.team) continue;
      if (p.pos.distanceTo(this.mech.position) < 90) return true;
    }
    return false;
  }
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();
