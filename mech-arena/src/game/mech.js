/**
 * MECH ENTITY
 * ------------------------------------------------------------------
 * One instance per machine on the field, player or bot. Owns movement,
 * thermals, the per-location damage model, weapon state and the walk
 * animation. It deliberately knows nothing about *who* is driving it:
 * the player controller and the AI both write the same small set of
 * intent fields each frame.
 *
 * Intent fields (write these, then call update):
 *   moveX, moveZ    -1..1 strafe / forward
 *   desiredYaw      where the legs want to point
 *   aimYaw/aimPitch where the torso is looking
 *   wantJump, wantBrake, firing (Set of weapon indices), wantAbility
 */
import * as THREE from 'three';
import { buildMech } from '../world/mechBuilder.js';
import { buildWeaponModel } from '../world/weaponModels.js';
import { WEAPON_BY_ID } from '../data/weapons.js';
import { getAbility } from '../data/abilities.js';
import { LOCATIONS } from '../data/mechs.js';
import { aggregateMods } from '../data/pilots.js';
import { clamp, lerp, damp, approachAngle, angleDelta, makeRng } from '../core/rng.js';

const KPH_TO_MS = 1 / 3.6;
const SHUTDOWN_HEAT = 1.0;     // fraction of capacity
const OVERHEAT_WARN = 0.78;

let nextId = 1;

export class Mech {
  /**
   * @param {object} opts { chassis, loadout, skinId, pilotId, implants, team, name, isPlayer }
   * @param {object} world arena
   */
  constructor(opts, world, fx, audio) {
    this.id = nextId++;
    this.chassis = opts.chassis;
    this.team = opts.team;            // 'a' | 'b' | 'ffa<N>'
    this.name = opts.name || this.chassis.name;
    this.isPlayer = !!opts.isPlayer;
    this.skinId = opts.skinId;
    this.pilotId = opts.pilotId;
    this.implants = opts.implants || [];
    this.world = world;
    this.fx = fx;
    this.audio = audio;
    this.rng = makeRng(this.id * 7919 + 13);

    this.mods = aggregateMods(this.pilotId, this.implants);
    this._deriveStats();

    /* ---- transform ---- */
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;              // leg / body facing
    this.torsoYaw = 0;         // torso offset relative to legs
    this.aimYaw = 0;           // absolute world aim
    this.aimPitch = 0;
    this.grounded = true;
    this.radius = this.chassis.tons > 75 ? 4.4 : this.chassis.tons > 55 ? 3.7 : this.chassis.tons > 35 ? 3.1 : 2.6;
    this.height = this.chassis.build.height;

    /* ---- intent ---- */
    this.moveX = 0; this.moveZ = 0;
    // When true, moveX/moveZ are a world-space heading rather than a vector
    // in the legs' own frame. The on-screen stick writes it that way so the
    // machine goes where the stick points; bots use the legs' frame.
    this.moveWorld = false;
    this.desiredYaw = 0;
    this.wantJump = false;
    this.wantBrake = false;
    this.firing = new Set();
    this.wantAbility = false;
    this.wantMelee = false;

    /* ---- melee ---- */
    // A physical attack: no heat, no ammunition, and it hits far harder
    // than any small weapon -- but you have to be close enough to be hit
    // back by everything they own.
    this.meleeCooldown = 0;
    this.meleeSwing = 0;
    this.meleeArm = 1;
    this.meleeHit = false;

    /* ---- combat state ---- */
    this.armour = {}; this.structure = {};
    for (const loc of LOCATIONS) {
      this.armour[loc] = Math.round(this.chassis.armour[loc] * this.armourMul);
      this.structure[loc] = Math.round(this.chassis.structure[loc] * this.structureMul);
    }
    this.maxArmour = { ...this.armour };
    this.maxStructure = { ...this.structure };
    this.destroyed = {};
    for (const loc of LOCATIONS) this.destroyed[loc] = false;
    this.alive = true;
    this.shield = 0;
    this.maxShield = 0;
    this.shieldRegenDelay = 0;

    this.heat = 0;
    this.shutdown = false;
    this.shutdownTimer = 0;
    this.jetFuel = this.jets.fuel;

    /* ---- multipliers other systems write into ---- */
    this.speedMul = 1; this.turnMul = 1; this.jetMul = 1;
    this.damageMul = 1; this.damageTakenMul = 1;
    this.fireRateMul = 1;
    this.baseHeatGenMul = 1; this.heatGenMul = 1;
    this.spreadMul = 1; this.recoilMul = 1;
    this.frontalDR = 1;
    this.airControl = 0.35;
    this.iFrames = 0;
    this.staggerTime = 0;
    this.jammedFor = 0;
    this.ecmRadius = 0;
    this.amsDome = 0;
    this.repairField = 0;
    this.cloaked = false; this.radarHidden = false;
    this.screenFade = 1;          // driven by the camera, not by gameplay
    this.pinpoint = false; this.braced = false; this.bulwark = false;
    this.alphaMode = false; this.barrageShots = 0; this.barrageFree = false;
    this.chargeActive = false; this.pendingSlam = false;
    this.freeJets = false;
    this.firedThisFrame = false;
    this.deployed = null;

    /* ---- ability ---- */
    this.ability = getAbility(this.chassis.ability);
    this.abilityCd = 0;
    this.abilityTime = 0;
    this.abilityActive = false;

    /* ---- targeting ---- */
    this.target = null;
    this.lockProgress = 0;
    this.lockedTarget = null;
    this.lastDamagedBy = null;
    this.lastDamageTime = -99;
    this.revealedUntil = 0;
    this.taggedUntil = 0;

    /* ---- scoring ---- */
    this.kills = 0; this.deaths = 0; this.assists = 0;
    this.damageDealt = 0; this.damageTaken = 0; this.healingDone = 0;
    this.captureTime = 0;
    this.assistCredit = new Map();
    // Gunnery record. Counted per projectile or per hitscan ray, so a
    // shotgun pellet and a missile each count once; a hit is a shot that
    // damaged an enemy, whether directly or through splash.
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.damageByWeapon = new Map();

    /* ---- animation ---- */
    this.gait = 0;
    this.gaitSpeed = 0;
    this.lean = 0; this.leanTarget = 0;
    this.bob = 0;
    this.recoil = 0;
    this._stepFlag = 0;

    this._buildModel(opts.teamColor);
    this._buildWeapons(opts.loadout || []);
  }

  /* ------------------------------------------------------------------ */
  _deriveStats() {
    const m = this.mods, c = this.chassis;
    const f = (k) => 1 + (m[k] || 0);
    this.maxSpeed = c.speed * f('speed') * KPH_TO_MS;
    this.accel = c.accel * f('accel');
    this.turnRate = c.turn * f('turn') * Math.PI / 180;
    this.torsoTurnRate = c.torsoTurn * f('torsoTurn') * Math.PI / 180;
    this.armourMul = f('armour');
    this.structureMul = f('structure');
    this.heatCapacity = c.heatCap * f('heatCap');
    this.heatSinkRate = c.sinks * f('heatSink');
    this.jets = {
      thrust: c.jets.thrust * f('jetThrust'),
      fuel: c.jets.fuel * f('jetFuel'),
      regen: c.jets.regen * f('jetFuel'),
    };
    this.cooldownMul = f('cooldown');
    this.lockTimeMul = f('lockTime');
    this.sensorRange = 320 * f('sensorRange');
    this.reloadMul = f('reload');
    this.spreadBase = f('spread');
    this.missileSpreadMul = f('missileSpread');
    this.rateBase = f('rate');
    this.damageBase = f('damage');
    this.shieldBonus = f('shieldMul');
    this.shieldRegenBonus = f('shieldRegen');
    this.repairBonus = f('repairRate');
    this.energyResist = m.energyResist || 0;
    this.explosiveResist = m.explosiveResist || 0;
    this.empResist = m.empResist || 0;
    this.ecmResist = m.ecmResist || 0;
    this.stealthBonus = m.stealth || 0;
    this.shutdownResist = m.shutdownResist || 0;
    this.selfRepair = m.selfRepair || 0;
    this.lastStand = !!m.lastStand;
    this.radarBlur = !!m.radarBlur;
  }

  _buildModel(teamColor) {
    this.model = buildMech(this.chassis, this.skinId, teamColor);
    this.root = this.model.root;
    this.rig = this.model.rig;
    this.root.userData.mech = this;
  }

  _buildWeapons(loadout) {
    this.weapons = [];
    const hps = this.chassis.hardpoints;
    for (let i = 0; i < hps.length; i++) {
      const hp = hps[i];
      const id = loadout[i];
      if (!id) { this.weapons.push(null); continue; }
      const w = WEAPON_BY_ID[id];
      if (!w) { this.weapons.push(null); continue; }
      const { group, muzzle } = buildWeaponModel(w, this.model.materials, this.model.scaleRef);
      const mount = this.model.mounts[hp.loc] || this.model.mounts.CT;
      mount.add(group);
      const inst = {
        index: i, def: w, loc: hp.loc, group, muzzle,
        ammo: w.ammo < 0 ? -1 : Math.round(w.ammo * (1 + (this.mods.ammo || 0))),
        mag: w.mag < 0 ? -1 : w.mag,
        cooldown: 0, reloading: 0, charge: 0, spin: 0,
        heatBuild: 0, beamTime: 0, jammed: 0,
        group_key: i < 2 ? 'alpha' : 'beta',
        destroyed: false,
      };
      this.weapons.push(inst);
    }
    this.weaponGroups = { alpha: [], beta: [], all: [] };
    this.weapons.forEach((w, i) => {
      if (!w) return;
      this.weaponGroups.all.push(i);
      this.weaponGroups[w.group_key].push(i);
    });
    this.selected = this.weapons.findIndex(w => w);
    if (this.selected < 0) this.selected = 0;
    this.tonnage = this.weapons.reduce((a, w) => a + (w ? w.def.tons : 0), 0);
  }

  /* ------------------------------------------------------------------ */
  get totalArmour() { let t = 0; for (const l of LOCATIONS) t += this.armour[l]; return t; }
  get totalStructure() { let t = 0; for (const l of LOCATIONS) t += this.structure[l]; return t; }
  get maxTotal() {
    let t = 0;
    for (const l of LOCATIONS) t += this.maxArmour[l] + this.maxStructure[l];
    return t;
  }
  get healthFraction() { return clamp((this.totalArmour + this.totalStructure) / this.maxTotal, 0, 1); }
  get heatFraction() { return clamp(this.heat / this.heatCapacity, 0, 1); }
  get accuracy() { return this.shotsFired > 0 ? this.shotsHit / this.shotsFired : 0; }

  /** The weapon this pilot actually did the work with. */
  bestWeapon() {
    let best = null, most = 0;
    for (const [id, dmg] of this.damageByWeapon) if (dmg > most) { most = dmg; best = id; }
    return best ? { id: best, damage: most } : null;
  }

  eyePosition(out = new THREE.Vector3()) {
    return out.set(this.position.x, this.position.y + this.height * 0.82, this.position.z);
  }

  /** Unit aim direction. Positive aimPitch looks up. */
  aimForward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.aimPitch);
    return out.set(
      Math.sin(this.aimYaw) * cp,
      Math.sin(this.aimPitch),
      Math.cos(this.aimYaw) * cp,
    );
  }

  bodyForward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /* ------------------------------------------------------------------ */
  spawn(pos, yaw) {
    this.position.copy(pos);
    this.position.y = this.world.safeGround(pos.x, pos.z);
    this.velocity.set(0, 0, 0);
    this.yaw = this.desiredYaw = this.aimYaw = yaw;
    this.torsoYaw = 0; this.aimPitch = 0;
    this.alive = true;
    this.heat = 0;
    this.shutdown = false;
    this.jetFuel = this.jets.fuel;
    for (const loc of LOCATIONS) {
      this.armour[loc] = this.maxArmour[loc];
      this.structure[loc] = this.maxStructure[loc];
      this.destroyed[loc] = false;
    }
    for (const w of this.weapons) {
      if (!w) continue;
      w.destroyed = false;
      w.cooldown = 0; w.reloading = 0; w.charge = 0;
      w.ammo = w.def.ammo < 0 ? -1 : Math.round(w.def.ammo * (1 + (this.mods.ammo || 0)));
      w.mag = w.def.mag < 0 ? -1 : w.def.mag;
      w.group.visible = true;
    }
    this.abilityCd = 0;
    this.abilityActive = false;
    this.abilityTime = 0;
    this.iFrames = 1.2;
    this.shield = 0;
    this.assistCredit.clear();
    this._resetMultipliers();
    this._applySectionVisuals();
    this.root.visible = true;
    this.root.position.copy(this.position);
  }

  _resetMultipliers() {
    this.speedMul = 1; this.turnMul = 1; this.jetMul = 1;
    this.damageMul = 1; this.damageTakenMul = 1; this.fireRateMul = 1;
    this.heatGenMul = this.baseHeatGenMul = 1;
    this.spreadMul = 1; this.recoilMul = 1; this.frontalDR = 1;
    this.cloaked = false; this.radarHidden = false; this.pinpoint = false;
    this.braced = false; this.bulwark = false; this.alphaMode = false;
    this.chargeActive = false; this.freeJets = false;
    this.ecmRadius = 0; this.amsDome = 0; this.repairField = 0;
    this.jammedFor = 0; this.staggerTime = 0;
  }

  /* ================= per-frame update ================= */
  update(dt, ctx) {
    if (!this.alive) return;
    this.firedThisFrame = false;

    this._updateAbility(dt, ctx);
    this._updateMelee(dt, ctx);
    this._updateThermals(dt);
    this._updateMovement(dt);
    this._updateWeapons(dt, ctx);
    this._updateTimers(dt);
    this._updateAnimation(dt);
    this._updateVisualState(dt);
  }

  _updateTimers(dt) {
    this.iFrames = Math.max(0, this.iFrames - dt);
    this.staggerTime = Math.max(0, this.staggerTime - dt);
    this.jammedFor = Math.max(0, this.jammedFor - dt);
    this.abilityCd = Math.max(0, this.abilityCd - dt);
    this.shieldRegenDelay = Math.max(0, this.shieldRegenDelay - dt);
    if (this.maxShield > 0 && this.shieldRegenDelay <= 0 && this.shield < this.maxShield) {
      this.shield = Math.min(this.maxShield, this.shield + this.maxShield * 0.3 * (1 + this.shieldRegenBonus) * dt);
    }
    if (this.selfRepair > 0 && performance.now() * 0.001 - this.lastDamageTime > 6) {
      this._repairSpread(this.selfRepair * dt);
    }
  }

  /* ---- thermals ---- */
  _updateThermals(dt) {
    let dissipation = this.heatSinkRate;
    // Standing still and moving slowly both help; running cooks you.
    const spd = Math.hypot(this.velocity.x, this.velocity.z);
    dissipation *= 1 - clamp(spd / (this.maxSpeed + 0.01), 0, 1) * 0.28;
    if (this.braced) dissipation *= 1.4;
    for (const h of this.world.hazards) {
      if (h.type !== 'heat') continue;
      const d = Math.hypot(this.position.x - h.x, this.position.z - h.z);
      if (d < h.r + this.radius) this.heat += h.heat * dt * (1 - d / (h.r + this.radius));
    }
    this.heat = Math.max(0, this.heat - dissipation * dt);

    if (this.shutdown) {
      this.shutdownTimer -= dt * (1 + this.shutdownResist);
      // Holding brake forces a hot restart at the cost of more heat.
      if (this.wantBrake) this.shutdownTimer -= dt * 2.2;
      this.heat = Math.max(0, this.heat - this.heatSinkRate * 2.4 * dt);
      if (this.shutdownTimer <= 0 && this.heatFraction < 0.72) {
        this.shutdown = false;
        this.audio.play('startup', this.position);
      }
    } else if (this.heatFraction >= SHUTDOWN_HEAT) {
      this.shutdown = true;
      this.shutdownTimer = 3.2 * (1 - this.shutdownResist * 0.5);
      this.audio.play('shutdown', this.position);
      // Overheating also cooks the centre torso a little -- heat is a real cost.
      this._damageSection('CT', 60, { source: 'overheat', silent: true });
    }
  }

  /* ---- movement ---- */
  _updateMovement(dt) {
    const stunned = this.shutdown || this.staggerTime > 0;
    const grav = this.world.gravity;

    // Facing.
    if (!stunned) {
      const turn = this.turnRate * this.turnMul * dt;
      this.yaw = approachAngle(this.yaw, this.desiredYaw, turn);
    }
    // Torso tracks the aim independently, clamped to a realistic arc.
    const twistTarget = clamp(angleDelta(this.yaw, this.aimYaw), -2.0, 2.0);
    this.torsoYaw = approachAngle(this.torsoYaw, twistTarget, this.torsoTurnRate * dt);

    // Desired velocity in world space.
    let ax = 0, az = 0;
    if (!stunned) {
      let wx, wz;
      if (this.moveWorld) {
        /* moveX/moveZ are already a world-space direction -- the stick is
         * pointing where the machine should go and the legs are turning to
         * face it, so there is nothing to rotate and no strafe penalty to
         * apply. Until they have turned, walking sideways still costs
         * something, which is where the mass comes from. */
        wx = this.moveX; wz = this.moveZ;
        const off = Math.abs(angleDelta(this.yaw, Math.atan2(wx, wz)));
        const align = off > 2.2 ? 0.62 : off > 1.1 ? 0.82 : 1;
        wx *= align; wz *= align;
      } else {
        const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
        // Backpedalling and strafing are deliberately slower: mechs are not cars.
        const fwd = this.moveZ >= 0 ? 1 : 0.58;
        const strafeScale = 0.72;
        wx = (this.moveX * strafeScale * c + this.moveZ * fwd * s);
        wz = (-this.moveX * strafeScale * s + this.moveZ * fwd * c);
      }
      let target = this.maxSpeed * this.speedMul;
      if (this.destroyed.LL || this.destroyed.RL) target *= 0.55;   // limping
      if (this.wantBrake) target *= 0.35;
      ax = wx * target; az = wz * target;
    }

    const control = this.grounded ? 1 : this.airControl;
    const accel = this.accel * this.speedMul * control;
    this.velocity.x = damp(this.velocity.x, ax, accel * 0.42, dt);
    this.velocity.z = damp(this.velocity.z, az, accel * 0.42, dt);

    // Jump jets.
    const canJet = this.jets.thrust > 0 && !stunned;
    if (canJet && this.wantJump && (this.jetFuel > 0 || this.freeJets)) {
      this.velocity.y += this.jets.thrust * this.jetMul * dt * 3.0;
      if (!this.freeJets) this.jetFuel -= dt;
      this.heat += 3.2 * dt * this.heatGenMul;
      this.jetting = true;
    } else {
      this.jetting = false;
      if (this.grounded) this.jetFuel = Math.min(this.jets.fuel, this.jetFuel + this.jets.regen * dt);
    }
    this.velocity.y -= grav * dt;
    this.velocity.y = Math.max(this.velocity.y, -95);

    // Integrate with collision.
    this._move(dt);

    // Death-from-above slam resolution.
    if (this.pendingSlam && this.grounded && this.velocity.y <= 0) {
      this.pendingSlam = false;
      this._slam();
    }
  }

  _move(dt) {
    const p = this.position;
    const r = this.radius;
    const stepHeight = this.height * 0.22;

    // Horizontal: move each axis separately so sliding along walls works.
    const cols = this.world.queryBox(
      p.x - r - 14, p.z - r - 14, p.x + r + 14, p.z + r + 14, _colBuf);

    const tryAxis = (axis) => {
      const before = p[axis];
      p[axis] += this.velocity[axis] * dt;
      for (const c of cols) {
        if (!c.alive) continue;
        if (c.kind === 'barrier' && c.meta?.team === this.team) continue;
        if (p.x + r < c.min.x || p.x - r > c.max.x) continue;
        if (p.z + r < c.min.z || p.z - r > c.max.z) continue;
        // Vertical overlap? Allow stepping onto low obstacles.
        const feet = p.y, head = p.y + this.height * 0.9;
        if (c.max.y <= feet + stepHeight || c.min.y >= head) continue;
        p[axis] = before;
        this.velocity[axis] *= -0.08;
        if (this.chargeActive) this.endAbility();
        break;
      }
    };
    tryAxis('x');
    tryAxis('z');

    // Vertical.
    p.y += this.velocity.y * dt;
    let floor = this.world.heightAt(p.x, p.z);
    for (const c of cols) {
      if (!c.alive || c.kind === 'wall') continue;
      if (p.x + r * 0.7 < c.min.x || p.x - r * 0.7 > c.max.x) continue;
      if (p.z + r * 0.7 < c.min.z || p.z - r * 0.7 > c.max.z) continue;
      if (c.max.y <= p.y + stepHeight + Math.max(0, -this.velocity.y * dt)) floor = Math.max(floor, c.max.y);
      // Head bump.
      else if (c.min.y > p.y && c.min.y < p.y + this.height * 0.9 && this.velocity.y > 0) {
        this.velocity.y = 0;
        p.y = Math.min(p.y, c.min.y - this.height * 0.9);
      }
    }

    const wasGrounded = this.grounded;
    if (p.y <= floor) {
      const impact = -this.velocity.y;
      p.y = floor;
      if (this.velocity.y < 0) this.velocity.y = 0;
      this.grounded = true;
      if (!wasGrounded && impact > 18) this._landingImpact(impact);
    } else {
      this.grounded = false;
    }

    // Void: falling off a platform map is fatal.
    if (p.y < this.world.voidLevel) {
      this.onVoidDeath?.();
    }
  }

  _landingImpact(speed) {
    const scale = clamp((speed - 18) / 50, 0, 1);
    this.fx.footDust(this.position, 1.6 + scale * 2);
    this.audio.play('footstep', this.position);
    if (scale > 0.25 && !this.pendingSlam) {
      // Hard landings hurt the legs. Jump jets are not free.
      this._damageSection(this.rng.chance(0.5) ? 'LL' : 'RL', 40 * scale, { source: 'fall' });
    }
    if (this.isPlayer) this.fx.shakeRequest = Math.max(this.fx.shakeRequest, scale * 0.8);
  }

  _slam() {
    this.fx.shockwave(this.position.clone(), 14);
    this.audio.play('stomp', this.position);
    this.onSlam?.(14, 260);
  }

  /* ---- weapons ---- */
  _updateWeapons(dt, ctx) {
    const canFire = !this.shutdown && this.alive;
    for (const w of this.weapons) {
      if (!w || w.destroyed) continue;
      const d = w.def;
      if (w.jammed > 0) { w.jammed -= dt; continue; }
      if (w.reloading > 0) {
        w.reloading -= dt;
        if (w.reloading <= 0) {
          const want = d.mag;
          const take = w.ammo < 0 ? want : Math.min(want, w.ammo);
          w.mag = take;
          if (w.ammo > 0) w.ammo -= take;
          this.audio.play('reload', this.position);
        }
        continue;
      }
      w.cooldown = Math.max(0, w.cooldown - dt);

      const wantFire = canFire && (this.firing.has(w.index) || (this.alphaMode && this.firing.size > 0));
      // Rotary weapons spin up before they fire.
      if (d.spinUp) {
        w.spin = clamp(w.spin + (wantFire ? dt / d.spinUp : -dt / (d.spinUp * 0.7)), 0, 1);
        if (w.group.userData.spinner) w.group.userData.spinner.rotation.z += w.spin * dt * 26;
      }
      // Charge weapons build up while held and release on let-go (or at full).
      if (d.mode === 'charge') {
        if (wantFire && w.cooldown <= 0) {
          w.charge = Math.min(1, w.charge + dt / d.charge);
        } else if (w.charge > 0) {
          if (w.charge >= 0.55) this._fire(w, ctx, w.charge);
          w.charge = 0;
        }
        if (w.group.userData.lens) {
          w.group.userData.lens.material = w.group.userData.lens.material;
        }
        continue;
      }
      if (!wantFire) { w.beamTime = 0; continue; }
      if (d.spinUp && w.spin < 0.92) continue;
      if (w.cooldown > 0) continue;
      if (w.mag === 0) { this._startReload(w); continue; }
      if (w.ammo === 0 && w.mag <= 0) { this.audio.play('dry', this.position); w.cooldown = 0.4; continue; }
      if (d.mode === 'lock' && (d.flags || []).includes('homing')) {
        if (!this.lockedTarget) continue;
      }
      this._fire(w, ctx, 1);
    }
  }

  _startReload(w) {
    if (w.ammo === 0) return;
    w.reloading = w.def.reload * this.reloadMul;
  }

  _fire(w, ctx, chargeLevel = 1) {
    const d = w.def;
    const rpm = d.rpm * this.fireRateMul * this.rateBase;
    w.cooldown = 60 / Math.max(1, rpm);
    if (w.mag > 0) w.mag--;
    else if (w.ammo > 0) w.ammo--;

    if (d.jamChance && this.rng.chance(d.jamChance)) {
      w.jammed = 1.6;
      this.audio.play('dry', this.position);
      return;
    }

    const heat = d.heat * this.heatGenMul * (this.barrageFree ? 0 : 1) * chargeLevel;
    this.heat += heat;
    this.firedThisFrame = true;
    this.recoil = Math.min(1.4, this.recoil + (d.dmg * (d.pellets || 1)) / 220 * this.recoilMul);

    w.muzzle.getWorldPosition(_muzzlePos);
    ctx.fireWeapon(this, w, _muzzlePos, chargeLevel);

    // The flash follows the barrel's converged direction so it lines up
    // with where the round actually went.
    const conv = this._convPoint;
    if (conv) _fwd.copy(conv).sub(_muzzlePos).normalize();
    else this.aimForward(_fwd);
    this.fx.muzzle(_muzzlePos, _fwd, d);
    this.audio.weapon(d, _muzzlePos);

    if (this.barrageShots > 0 && d.cls === 'missile') {
      this.barrageShots--;
      if (this.barrageShots <= 0) this.barrageFree = false;
      w.cooldown = 0.08;
    }
  }

  /* ---- melee ---- */

  /** Reach of a punch or kick, measured from the mech's own hull. */
  get meleeReach() { return this.radius + this.height * 0.42; }

  /** Damage scales with tonnage, and with an intact arm to swing. */
  get meleeDamage() {
    const armed = !this.destroyed[this.meleeArm > 0 ? 'RA' : 'LA'];
    return this.chassis.tons * (armed ? 2.1 : 1.3) + 40;
  }

  _updateMelee(dt, ctx) {
    this.meleeCooldown = Math.max(0, this.meleeCooldown - dt);

    if (this.meleeSwing > 0) {
      const before = this.meleeSwing;
      this.meleeSwing = Math.max(0, this.meleeSwing - dt);
      // Contact lands in the middle of the swing, once.
      if (!this.meleeHit && before > MELEE_CONTACT && this.meleeSwing <= MELEE_CONTACT) {
        this.meleeHit = true;
        this._resolveMelee(ctx);
      }
      return;
    }

    if (!this.wantMelee) return;
    this.wantMelee = false;
    if (this.meleeCooldown > 0 || this.shutdown || this.staggerTime > 0) return;

    this.meleeSwing = MELEE_DURATION;
    this.meleeHit = false;
    this.meleeCooldown = 2.2;
    // Swing with whichever arm still exists; kick if both are gone.
    this.meleeArm = !this.destroyed.RA ? 1 : !this.destroyed.LA ? -1 : 0;
    this.audio.play('brace', this.position);
  }

  _resolveMelee(ctx) {
    const match = ctx?.match || this._ctx?.match;
    if (!match) return;
    const fwd = this.aimForward(_fwd).setY(0).normalize();
    const reach = this.meleeReach;
    let best = null, bestDot = 0.45;

    for (const other of match.aliveMechs()) {
      if (other === this || other.team === this.team) continue;
      const to = _v3.subVectors(other.position, this.position);
      const dist = to.length();
      if (dist > reach + other.radius) continue;
      to.setY(0).normalize();
      const dot = to.dot(fwd);
      if (dot < bestDot) continue;
      bestDot = dot;
      best = other;
    }

    const impact = this.position.clone()
      .addScaledVector(fwd, reach * 0.8)
      .setY(this.position.y + this.height * 0.5);

    if (!best) {
      // A whiffed swing still scars the scenery, which makes it feel physical.
      this.fx.sparks(impact, fwd.clone().negate(), 4, 0xbfc8d0);
      this.audio.impact(impact, 'stone');
      return;
    }

    const dmg = this.meleeDamage;
    // Punches land high, kicks land low.
    const loc = this.meleeArm === 0 ? (Math.random() < 0.5 ? 'LL' : 'RL')
      : best.height > this.height * 1.25 ? 'CT'
      : (Math.random() < 0.3 ? 'HD' : 'CT');

    match.applyDamage(best, this, dmg, {
      location: loc, source: 'melee', from: this.position, point: impact,
      type: 'kinetic', stagger: 1.1, shred: true,
    });
    // Shove them off their feet -- a 100-ton punch should move a light mech.
    const push = (this.chassis.tons / Math.max(25, best.chassis.tons)) * 13;
    best.velocity.addScaledVector(fwd, push);
    best.velocity.y += push * 0.28;

    this.fx.impactBurst(impact, 1.5, 0xffd9a0);
    this.fx.ring(impact, 0.5, 5, 0xffe8c0, 0.3, true);
    this.audio.explosion(impact, 0.5);
    if (this.isPlayer) this.fx.shakeRequest = Math.max(this.fx.shakeRequest, 0.45);
  }

  /* ---- melee ---- */

  /** Reach of a punch or kick, measured from the mech's own hull. */
  get meleeReach() { return this.radius + this.height * 0.42; }

  /** Damage scales with tonnage, and with an intact arm to swing. */
  get meleeDamage() {
    const armed = !this.destroyed[this.meleeArm > 0 ? 'RA' : 'LA'];
    return this.chassis.tons * (armed ? 2.1 : 1.3) + 40;
  }

  _updateMelee(dt, ctx) {
    this.meleeCooldown = Math.max(0, this.meleeCooldown - dt);

    if (this.meleeSwing > 0) {
      const before = this.meleeSwing;
      this.meleeSwing = Math.max(0, this.meleeSwing - dt);
      // Contact lands in the middle of the swing, once.
      if (!this.meleeHit && before > MELEE_CONTACT && this.meleeSwing <= MELEE_CONTACT) {
        this.meleeHit = true;
        this._resolveMelee(ctx);
      }
      return;
    }

    if (!this.wantMelee) return;
    this.wantMelee = false;
    if (this.meleeCooldown > 0 || this.shutdown || this.staggerTime > 0) return;

    this.meleeSwing = MELEE_DURATION;
    this.meleeHit = false;
    this.meleeCooldown = 2.2;
    // Swing with whichever arm still exists; kick if both are gone.
    this.meleeArm = !this.destroyed.RA ? 1 : !this.destroyed.LA ? -1 : 0;
    this.audio.play('brace', this.position);
  }

  _resolveMelee(ctx) {
    const match = ctx?.match || this._ctx?.match;
    if (!match) return;
    const fwd = this.aimForward(_fwd).setY(0).normalize();
    const reach = this.meleeReach;
    let best = null, bestDot = 0.45;

    for (const other of match.aliveMechs()) {
      if (other === this || other.team === this.team) continue;
      const to = _v3.subVectors(other.position, this.position);
      const dist = to.length();
      if (dist > reach + other.radius) continue;
      to.setY(0).normalize();
      const dot = to.dot(fwd);
      if (dot < bestDot) continue;
      bestDot = dot;
      best = other;
    }

    const impact = this.position.clone()
      .addScaledVector(fwd, reach * 0.8)
      .setY(this.position.y + this.height * 0.5);

    if (!best) {
      // A whiffed swing still scars the scenery, which makes it feel physical.
      this.fx.sparks(impact, fwd.clone().negate(), 4, 0xbfc8d0);
      this.audio.impact(impact, 'stone');
      return;
    }

    const dmg = this.meleeDamage;
    // Punches land high, kicks land low.
    const loc = this.meleeArm === 0 ? (Math.random() < 0.5 ? 'LL' : 'RL')
      : best.height > this.height * 1.25 ? 'CT'
      : (Math.random() < 0.3 ? 'HD' : 'CT');

    match.applyDamage(best, this, dmg, {
      location: loc, source: 'melee', from: this.position, point: impact,
      type: 'kinetic', stagger: 1.1, shred: true,
    });
    // Shove them off their feet -- a 100-ton punch should move a light mech.
    const push = (this.chassis.tons / Math.max(25, best.chassis.tons)) * 13;
    best.velocity.addScaledVector(fwd, push);
    best.velocity.y += push * 0.28;

    this.fx.impactBurst(impact, 1.5, 0xffd9a0);
    this.fx.ring(impact, 0.5, 5, 0xffe8c0, 0.3, true);
    this.audio.explosion(impact, 0.5);
    if (this.isPlayer) this.fx.shakeRequest = Math.max(this.fx.shakeRequest, 0.45);
  }

  /* ---- ability ---- */
  _updateAbility(dt, ctx) {
    if (this.wantAbility && !this.abilityActive && this.abilityCd <= 0 && !this.shutdown) {
      this.wantAbility = false;
      this.abilityActive = true;
      this.abilityTime = this.ability.duration;
      this.abilityCd = this.ability.cooldown * this.cooldownMul;
      this.ability.onActivate?.(this._abilityCtx(ctx));
      if (this.ability.duration <= 0) {
        this.abilityActive = false;
        this.ability.onEnd?.(this._abilityCtx(ctx));
      }
    }
    this.wantAbility = false;
    if (this.abilityActive) {
      this.abilityTime -= dt;
      this.ability.onTick?.(this._abilityCtx(ctx), dt);
      if (this.abilityTime <= 0) this.endAbility(ctx);
    }
  }

  _abilityCtx(ctx) {
    return { mech: this, match: ctx?.match || this._ctx?.match, world: this.world, fx: this.fx, audio: this.audio };
  }

  endAbility(ctx) {
    if (!this.abilityActive) return;
    this.abilityActive = false;
    this.abilityTime = 0;
    this.ability.onEnd?.(this._abilityCtx(ctx));
  }

  /* ================= damage ================= */

  /**
   * Resolve incoming damage against a section, spilling into structure and
   * then into the centre torso when a section is destroyed.
   */
  takeDamage(amount, location, opts = {}) {
    if (!this.alive || this.iFrames > 0) return 0;
    let dmg = amount * this.damageTakenMul;

    if (opts.type === 'energy') dmg *= 1 - this.energyResist;
    if (opts.type === 'explosive' || opts.splash) dmg *= 1 - this.explosiveResist;

    // Bulwark only helps against fire coming from the front.
    if (this.frontalDR < 1 && opts.from) {
      const toAttacker = Math.atan2(opts.from.x - this.position.x, opts.from.z - this.position.z);
      if (Math.abs(angleDelta(this.aimYaw, toAttacker)) < 1.1) dmg *= this.frontalDR;
    }

    // Shields soak first, unless the weapon overpenetrates them.
    if (this.shield > 0) {
      const pen = opts.overpen ? 0.5 : 1;
      const absorbed = Math.min(this.shield, dmg * pen);
      this.shield -= absorbed;
      dmg -= absorbed;
      this.shieldRegenDelay = 4.5;
      this.fx.ring(this.position.clone().setY(this.position.y + this.height * 0.5), 1, this.radius * 2.2, 0x7cd8ff, 0.25);
      if (dmg <= 0.01) return absorbed;
    }

    // Credit the attacker BEFORE resolving the damage. _damageSection can
    // destroy the mech synchronously, and the death handler reads
    // lastDamagedBy -- so setting it afterwards means a one-shot kill is
    // credited to whoever hit them previously, or to nobody at all.
    if (opts.attacker && opts.attacker !== this) this.lastDamagedBy = opts.attacker;

    const dealt = this._damageSection(location, dmg, opts);
    this.damageTaken += dealt;
    this.lastDamageTime = performance.now() * 0.001;
    if (opts.attacker && opts.attacker !== this) {
      this.assistCredit.set(opts.attacker.id, (this.assistCredit.get(opts.attacker.id) || 0) + dealt);
    }
    return dealt;
  }

  _damageSection(loc, dmg, opts = {}) {
    if (this.destroyed[loc]) loc = 'CT';   // hits on a missing limb carry through
    let remaining = dmg;
    let dealt = 0;

    const a = this.armour[loc];
    if (a > 0) {
      const used = Math.min(a, remaining);
      this.armour[loc] = a - used;
      remaining -= used;
      dealt += used;
    }
    if (remaining > 0) {
      // 'shred' weapons are far more effective once the plating is gone.
      const mult = opts.shred ? 1.6 : 1;
      const used = Math.min(this.structure[loc], remaining * mult);
      this.structure[loc] -= used;
      remaining = Math.max(0, remaining - used / mult);
      dealt += used / mult;
      if (this.structure[loc] <= 0) this._destroySection(loc);
    }
    // Overflow from a destroyed side torso rolls into the centre.
    if (remaining > 0.5 && loc !== 'CT' && loc !== 'HD') {
      dealt += this._damageSection('CT', remaining * 0.5, { ...opts, noOverflow: true });
    }
    this._applySectionVisuals();
    return dealt;
  }

  _destroySection(loc) {
    if (this.destroyed[loc]) return;
    this.destroyed[loc] = true;
    this.structure[loc] = 0;
    this.armour[loc] = 0;

    const worldPos = this.position.clone().setY(this.position.y + this.height * 0.55);
    this.fx.explosion(worldPos, 0.8);
    this.audio.explosion(worldPos, 0.7);

    // Weapons mounted in the section go with it -- and anything with rounds
    // still in the rack cooks off, which is why carrying a full AC/20 bin in
    // a side torso is a real decision rather than free damage.
    let cookOff = 0;
    for (const w of this.weapons) {
      if (!w || w.loc !== loc) continue;
      w.destroyed = true;
      w.group.visible = false;
      if (w.def.ammo > 0) {
        const rounds = Math.max(0, w.ammo) + Math.max(0, w.mag);
        const full = Math.max(1, w.def.ammo);
        // Pellet count is damped: a full LRM-20 bin should be frightening,
        // not an automatic centre-torso kill on anything it is bolted to.
        const perRound = w.def.dmg * Math.sqrt(w.def.pellets || 1);
        cookOff += perRound * Math.min(1, rounds / full) * 1.8;
        w.ammo = 0;
        w.mag = 0;
      }
    }
    // Side torso loss takes the arm on that side too.
    if (loc === 'LT' && !this.destroyed.LA) this._destroySection('LA');
    if (loc === 'RT' && !this.destroyed.RA) this._destroySection('RA');

    if (loc === 'LA' || loc === 'RA') {
      const g = loc === 'LA' ? this.rig.armL.group : this.rig.armR.group;
      g.visible = false;
    }
    if (cookOff > 0.5) this._cookOff(loc, cookOff);

    if (loc === 'CT' || loc === 'HD') {
      // Gravewalker pilots get one reprieve at the very end.
      if (this.lastStand && !this._usedLastStand) {
        this._usedLastStand = true;
        this.structure[loc] = Math.round(this.maxStructure[loc] * 0.18);
        this.destroyed[loc] = false;
        this.iFrames = 1.0;
        this.fx.ring(this.position.clone(), 1, 16, 0xff4d5e, 0.6);
        return;
      }
      this.onDestroyed?.();
    }
  }

  /**
   * Ammunition detonating inside a destroyed section. It hurts the centre
   * torso rather than the section that is already gone, so losing a loaded
   * arm can genuinely finish a mech.
   */
  _cookOff(loc, amount) {
    const pos = this.position.clone().setY(this.position.y + this.height * 0.5);
    this.fx.explosion(pos, 1.3, 0xffb45a);
    this.audio.explosion(pos, 1.1);
    if (this.isPlayer) this.fx.shakeRequest = Math.max(this.fx.shakeRequest, 0.9);
    // Reactive plating vents a good deal of it outward instead of inward.
    const inward = Math.min(amount, this.maxStructure.CT * 1.2) * (1 - this.explosiveResist);
    this.onCookOff?.(loc, amount);
    this._damageSection('CT', inward, { source: 'cookoff', noOverflow: true });
  }

  repair(amount) {
    const healed = this._repairSpread(amount * (1 + this.repairBonus));
    return healed;
  }

  _repairSpread(amount) {
    // Repair the most damaged living section first -- that is what a
    // field tech would do and it makes repair beams feel responsive.
    let best = null, bestFrac = 2;
    for (const loc of LOCATIONS) {
      if (this.destroyed[loc]) continue;
      const max = this.maxArmour[loc] + this.maxStructure[loc];
      const cur = this.armour[loc] + this.structure[loc];
      if (cur >= max) continue;
      const f = cur / max;
      if (f < bestFrac) { bestFrac = f; best = loc; }
    }
    if (!best) return 0;
    let left = amount;
    // Structure first (it is what keeps you alive), then plating.
    const sNeed = this.maxStructure[best] - this.structure[best];
    const sAdd = Math.min(sNeed, left);
    this.structure[best] += sAdd; left -= sAdd;
    const aNeed = this.maxArmour[best] - this.armour[best];
    const aAdd = Math.min(aNeed, left);
    this.armour[best] += aAdd; left -= aAdd;
    this._applySectionVisuals();
    return amount - left;
  }

  /**
   * Swap section materials as they take damage: painted plating, then
   * scorched metal once the armour is gone, then glowing internals.
   * Only runs when a section crosses a threshold, so it is free in the
   * common case of a hit that changes nothing visually.
   */
  _applySectionVisuals() {
    if (!this._sectionState) this._sectionState = {};
    const mats = this.model.materials;
    for (const loc of LOCATIONS) {
      const meshes = this.rig.sectionMeshes[loc];
      if (!meshes || !meshes.length) continue;
      let state;
      if (this.destroyed[loc]) state = 2;
      else if (this.armour[loc] <= 0) state = 2;
      else if (this.armour[loc] < this.maxArmour[loc] * 0.45) state = 1;
      else state = 0;
      if (this._sectionState[loc] === state) continue;
      this._sectionState[loc] = state;
      const mat = state === 2 ? mats.hullCritical : state === 1 ? mats.hullDamaged : mats.hull;
      for (const m of meshes) m.material = mat;
    }
  }

  /* ---- animation ---- */
  _updateAnimation(dt) {
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const speedFrac = clamp(speed / Math.max(1, this.maxSpeed), 0, 1.4);

    // Gait frequency scales with speed and inversely with mech size.
    const strideScale = 10 / this.height;
    this.gaitSpeed = speedFrac * 3.1 * strideScale;
    if (this.grounded) this.gait += this.gaitSpeed * dt * Math.PI * 2;

    const rig = this.rig;
    const amp = clamp(speedFrac, 0, 1);
    const airborne = !this.grounded;

    const legs = rig.legParts;
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      const ph = this.gait + leg.phase;
      const swing = Math.sin(ph);
      const lift = Math.max(0, Math.sin(ph + Math.PI / 2));
      const dir = leg.reverse ? -1 : 1;

      if (airborne) {
        // Tuck the legs while flying -- it reads instantly as "in the air".
        leg.thigh.rotation.x = damp(leg.thigh.rotation.x, -0.5, 8, dt);
        leg.knee.rotation.x = damp(leg.knee.rotation.x, dir * 0.9, 8, dt);
        leg.ankle.rotation.x = damp(leg.ankle.rotation.x, 0.35, 8, dt);
      } else {
        leg.thigh.rotation.x = swing * 0.44 * amp;
        leg.knee.rotation.x = dir * (0.18 + lift * 0.75) * amp + (leg.reverse ? -0.45 : 0.12);
        leg.ankle.rotation.x = -leg.thigh.rotation.x - leg.knee.rotation.x * dir * 0.6;
        // Footfall: dust and a thump when a foot passes the bottom of its arc.
        // Only the first pair reports footfalls: four feet would quadruple
        // the dust and the audio for no extra information.
        const contact = swing < -0.92 && i < 2;
        if (contact && this._stepFlag !== i + 1 && amp > 0.15) {
          this._stepFlag = i + 1;
          const fp = _v3.copy(this.position);
          fp.x += Math.sin(this.yaw + (i ? 0.4 : -0.4)) * 1.4;
          fp.z += Math.cos(this.yaw + (i ? 0.4 : -0.4)) * 1.4;
          this.fx.footDust(fp, 0.6 + this.chassis.tons / 90);
          this.audio.play('footstep', fp);
          if (this.isPlayer) this.fx.shakeRequest = Math.max(this.fx.shakeRequest, 0.05 + this.chassis.tons / 1400);
        } else if (!contact && this._stepFlag === i + 1) {
          this._stepFlag = 0;
        }
      }
      leg.group.rotation.z = 0;
    }

    // Body bob and pitch lean from acceleration.
    this.bob = Math.sin(this.gait * 2) * 0.09 * amp * (this.height * 0.1);
    const forwardVel = this.velocity.x * Math.sin(this.yaw) + this.velocity.z * Math.cos(this.yaw);
    this.leanTarget = clamp(forwardVel / Math.max(1, this.maxSpeed), -1, 1) * 0.10;
    this.lean = damp(this.lean, this.leanTarget, 5, dt);

    rig.legs.position.y = this.bob;
    rig.torsoYaw.rotation.y = this.torsoYaw;
    rig.torsoYaw.position.y = this.chassis.build.height * 0.46 + this.model.scaleRef.h * 0.28 + this.bob;
    rig.torsoPitch.rotation.x = -clamp(this.aimPitch, -0.7, 0.7) + this.lean + this.recoil * 0.06;

    // Arms follow the aim so guns point where the crosshair is.
    const armPitch = -clamp(this.aimPitch, -0.85, 0.85);
    rig.armL.upper.rotation.x = damp(rig.armL.upper.rotation.x, armPitch * 0.35 + Math.sin(this.gait + Math.PI) * 0.12 * amp, 12, dt);
    rig.armR.upper.rotation.x = damp(rig.armR.upper.rotation.x, armPitch * 0.35 + Math.sin(this.gait) * 0.12 * amp, 12, dt);
    rig.armL.elbow.rotation.x = damp(rig.armL.elbow.rotation.x, -0.12 - this.recoil * 0.25, 14, dt);
    rig.armR.elbow.rotation.x = damp(rig.armR.elbow.rotation.x, -0.12 - this.recoil * 0.25, 14, dt);

    if (this.meleeSwing > 0) {
      // Wind up, then throw: a fast forward swing out of a cocked shoulder.
      const t = 1 - this.meleeSwing / MELEE_DURATION;
      const throwPhase = clamp((t - 0.35) / 0.4, 0, 1);
      const swing = t < 0.35 ? -t / 0.35 * 1.3 : lerp(-1.3, 1.5, throwPhase);
      const arm = this.meleeArm > 0 ? rig.armR : this.meleeArm < 0 ? rig.armL : null;
      if (arm) {
        arm.upper.rotation.x = swing;
        arm.elbow.rotation.x = -0.9 + throwPhase * 0.85;
      } else {
        // No arms left: throw a kick instead.
        const leg = rig.legR;
        leg.thigh.rotation.x = swing * 0.8;
        leg.knee.rotation.x = 0.4 - throwPhase * 0.4;
      }
      rig.torsoYaw.rotation.y += -this.meleeArm * (t < 0.35 ? 0.3 : 0.3 - throwPhase * 0.55);
    }

    this.recoil = damp(this.recoil, 0, 9, dt);

    // Commit the transform.
    this.root.position.copy(this.position);
    this.root.rotation.y = this.yaw;
  }

  _updateVisualState(dt) {
    const hp = this.healthFraction;
    if (hp < 0.62) this.fx.damageSmoke(this, 1 - hp, dt);

    // Cloak and camera-proximity fade share one opacity channel, so the
    // lower of the two wins and neither fights the other for the material.
    const alpha = this.cloaked ? 0.11 : this.screenFade;
    if (Math.abs(alpha - (this._appliedAlpha ?? 1)) > 0.02) {
      this._appliedAlpha = alpha;
      const transparent = alpha < 0.995;
      this.root.traverse(o => {
        if (!o.isMesh || !o.material) return;
        o.material.transparent = transparent;
        o.material.depthWrite = !transparent;
        o.material.opacity = alpha;
      });
    }

    // Reactor state on the hull: running lights die with the reactor.
    const lit = this.shutdown ? 0.12 : this.heatFraction > 0.85 ? 3.4 : 2.4;
    if (this._litState !== lit) {
      this._litState = lit;
      const mats = this.model.materials;
      mats.accent.emissiveIntensity = lit;
      mats.glass.emissiveIntensity = lit * 0.23;
    }

    if (this.jetting) this.fx.thrusterTrail(this, dt);
  }

  /**
   * Release this mech's GPU resources. Match teardown calls this for live
   * mechs; a destroyed mech's model is handed to the wreck list instead and
   * freed when the wreck is recycled.
   */
  dispose(scene) {
    if (scene) scene.remove(this.root);
    this.root.traverse(o => { if (o.isMesh) o.geometry?.dispose?.(); });
    for (const mat of Object.values(this.model.materials)) mat?.dispose?.();
  }
}

const MELEE_DURATION = 0.55;
const MELEE_CONTACT = 0.55 * 0.42;   // where in the swing contact lands

const _colBuf = [];
const _muzzlePos = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _mfwd = new THREE.Vector3();
