import * as THREE from 'three';
import { G } from '../core/G.js';
import { Rig, Anim, newPose, blendPose, blendUpper, buildCombatClips, setJ, addJ } from './rig.js';
import { WIND_UNIFORM } from '../core/shaderlib.js';

const GRAV = 24;
const WALK = 2.4, RUN = 5.4, SPRINT = 8.6, CROUCH = 1.9;
const JUMP_V = 8.4;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _n = new THREE.Vector3();
const _tip = new THREE.Vector3(), _base = new THREE.Vector3();

export const DIFFICULTY = {
  story: { dmgTaken: 0.45, parry: 0.32, aggression: 0.6, dmgDealt: 1.35 },
  balanced: { dmgTaken: 1, parry: 0.2, aggression: 1, dmgDealt: 1 },
  hard: { dmgTaken: 1.5, parry: 0.13, aggression: 1.3, dmgDealt: 0.9 },
};

export class Player {
  constructor() {
    this.rig = new Rig({
      build: 'hero', cape: 0x7a1f2b, weapon: 'sword', hairStyle: 'tail', uniqueMats: true,
      colors: { cloth: 0x27345e, cloth2: 0x6e5636, leather: 0x3e2a1d, metal: 0xc7a96a, hair: 0x5a3418, skin: 0xd9a888 },
    });
    this.rig.setWeapon('sword', { glow: 0x8fe0ff });
    this.clips = buildCombatClips();
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.mode = 'ground';
    this.action = null;
    this.radius = 0.34;
    this.height = 1.75;
    // stats
    this.level = 1;
    this.xp = 0;
    this.maxHp = 100;
    this.hp = 100;
    this.maxStamina = 100;
    this.stamina = 100;
    this.maxMana = 100;
    this.mana = 100;
    this.baseDamage = 14;
    this.weaponDamage = 0;
    this.armor = 0;
    this.staminaDelay = 0;
    this.exhausted = false;
    this.stance = 'wind';
    this.element = 0;
    this.imbue = null; // {el, t}
    this.iframes = 0;
    this.parryT = -1;
    this.blocking = false;
    this.grounded = true;
    this.groundCol = null;
    this.onTerrain = true;
    this.phase = 0;
    this.climb = null;
    this.combatT = 0;
    this.lastSafe = new THREE.Vector3();
    this.lockTarget = null;
    this.crouching = false;
    this.sprintHeld = 0;
    this.fallStartY = 0;
    this.lastStep = 0;
    this.pose = newPose();
    this.tmpPose = newPose();
    this.lastGroundY = 0;
    this.comboQueued = false;
    this.speedMul = 1;
    this.skills = new Set();
    this.dead = false;
    this.hurtT = 0;
    this.trail = null;
    this.landT = 0;
    this.gliderOpen = 0;
    this.buildGlider();
    this.resolveOut = {};
    this.footPhaseLast = 0;
  }

  buildGlider() {
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.4, 0.25, 1.0, 0.3, 1.45, 0.05);
    shape.bezierCurveTo(1.2, -0.05, 1.1, -0.25, 0.9, -0.2);
    shape.bezierCurveTo(0.7, -0.35, 0.5, -0.3, 0.35, -0.42);
    shape.bezierCurveTo(0.2, -0.3, 0.1, -0.2, 0, -0.1);
    const geo = new THREE.ShapeGeometry(shape, 12);
    const m = new THREE.MeshStandardMaterial({ color: 0x9ad8ff, emissive: 0x3aa8ff, emissiveIntensity: 0.9, transparent: true, opacity: 0.75, side: THREE.DoubleSide, roughness: 0.3, depthWrite: false });
    const l = new THREE.Mesh(geo, m);
    const r = new THREE.Mesh(geo, m);
    r.scale.x = -1;
    g.add(l, r);
    g.position.set(0, 0.22, -0.12);
    g.rotation.x = -0.15;
    this.rig.j.chest.add(g);
    g.scale.setScalar(0.001);
    this.glider = g;
    this.gliderMat = m;
  }

  get camYaw() {
    return G.cam ? G.cam.yaw : 0;
  }

  spawn(x, y, z) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.mode = 'ground';
    this.action = null;
    this.lastSafe.copy(this.pos);
    this.rig.root.position.copy(this.pos);
    if (this.rig.cape) this.rig.cape.inited = false;
  }

  addTo(scene) {
    this.rig.addTo(scene);
  }

  // ------------------------------------------------------------------ stats
  useStamina(a) {
    this.stamina = Math.max(0, this.stamina - a);
    this.staminaDelay = 0.9;
    if (this.stamina <= 0.01) this.exhausted = true;
  }
  canUseStamina(a = 1) {
    return !this.exhausted && this.stamina >= a * 0.5;
  }
  get attackPower() {
    const lv = 1 + (this.level - 1) * 0.06;
    const sk = this.skills.has('keen') ? 1.15 : 1;
    const diff = DIFFICULTY[G.settings.difficulty]?.dmgDealt || 1;
    return (this.baseDamage + this.weaponDamage) * lv * sk * diff;
  }

  // -------------------------------------------------------------- movement
  inputDir(out) {
    if (G.ui?.blocking || G.cutscene?.active) return out.set(0, 0, 0);
    const iv = G.input.moveVec;
    const yaw = this.camYaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    out.set(fx * -iv.y + rx * iv.x, 0, fz * -iv.y + rz * iv.x);
    return out;
  }

  turnToward(dir, rate, dt) {
    if (dir.lengthSq() < 1e-4) return;
    const target = Math.atan2(dir.x, dir.z);
    let d = target - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const step = rate * dt;
    this.yaw += Math.abs(d) < step ? d : Math.sign(d) * step;
  }
  faceTarget(t, dt, rate = 14) {
    if (!t) return;
    _v2.set(t.pos.x - this.pos.x, 0, t.pos.z - this.pos.z);
    this.turnToward(_v2, rate, dt);
  }

  update(dt) {
    const inp = G.input;
    const col = G.collision;
    const terrain = G.terrain;
    if (this.mode === 'locked') {
      this.animate(dt, 0);
      return;
    }
    this.combatT = Math.max(0, this.combatT - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.staminaDelay -= dt;
    if (this.staminaDelay <= 0 && this.mode !== 'climb' && this.mode !== 'glide' && !(this.mode === 'swim' && this.sprinting)) {
      const regen = (this.skills.has('secondwind') ? 42 : 32) * (this.grounded ? 1 : 0.4);
      this.stamina = Math.min(this.maxStamina, this.stamina + regen * dt);
      if (this.exhausted && this.stamina > this.maxStamina * 0.35) this.exhausted = false;
    }
    const manaRegen = (this.skills.has('flow') ? 11 : 7.5) + (G.game?.companionPerk === 'lyra' ? 3 : 0);
    this.mana = Math.min(this.maxMana, this.mana + manaRegen * dt);
    if (this.imbue) {
      this.imbue.t -= dt;
      if (this.imbue.t <= 0) this.imbue = null;
    }

    if (this.dead) {
      this.deadT += dt;
      this.vel.x *= 0.9; this.vel.z *= 0.9;
      this.applyGravityAndGround(dt);
      this.animate(dt, 0);
      return;
    }
    if (this.mode === 'mounted') {
      const a = this.action;
      if (a) {
        a.t += dt;
        if (a.type === 'attack' && a.t >= a.hit[0] && a.t <= a.hit[1]) G.combat?.playerSwing(this, a);
        if (a.t >= (a.dur || 0.5)) this.action = null;
      }
      this.animate(dt, 0);
      return;
    }

    const dir = this.inputDir(_v);
    const hasInput = dir.lengthSq() > 0.01;
    const inMag = Math.min(1, Math.hypot(inp.moveVec.x, inp.moveVec.y));

    // sprint / dodge disambiguation: tap = dodge, hold = sprint
    if (inp.down('sprint')) this.sprintHeld += dt;
    const dodgeTap = inp.up('sprint') && this.sprintHeld > 0 && this.sprintHeld < 0.24;
    if (!inp.down('sprint') && !inp.up('sprint')) this.sprintHeld = 0;
    if (inp.up('sprint')) this.sprintHeld = 0;
    this.sprinting = inp.down('sprint') && this.sprintHeld >= 0.24 && hasInput && this.canUseStamina(1) && !this.blocking;

    if (inp.hit('crouch') && this.mode === 'ground' && !G.ui?.blocking) this.crouching = !this.crouching;
    if (this.sprinting) this.crouching = false;

    // stance swap
    if (inp.hit('stance') && !G.build?.active && !G.ui?.blocking) {
      this.stance = this.stance === 'wind' ? 'stone' : 'wind';
      G.hud?.toast(this.stance === 'wind' ? 'Stance of Wind — swift strikes' : 'Stance of Stone — crushing blows', 'stance');
      G.audio?.sfx('stance');
    }

    switch (this.mode) {
      case 'ground':
      case 'air':
        this.updateGroundAir(dt, dir, hasInput, inMag, dodgeTap);
        break;
      case 'glide':
        this.updateGlide(dt, dir, hasInput);
        break;
      case 'climb':
        this.updateClimb(dt);
        break;
      case 'swim':
        this.updateSwim(dt, dir, hasInput);
        break;
    }

    // world bounds
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > 745 && !G.game?.inPocket) {
      this.pos.x *= 745 / r;
      this.pos.z *= 745 / r;
    }
    if (this.pos.y < -60 && !G.game?.inPocket) this.respawnSafe(10);

    if (this.grounded && this.mode === 'ground' && !this.action) {
      const d = G.water ? G.water.level - this.pos.y : -1;
      if (d < 0.2) this.lastSafe.copy(this.pos);
    }
    this.animate(dt, inMag);
  }

  respawnSafe(dmg = 0) {
    this.spawn(this.lastSafe.x, this.lastSafe.y + 0.5, this.lastSafe.z);
    if (dmg) this.hp = Math.max(1, this.hp - dmg);
    G.fx?.screenFade(0.6);
  }

  updateGroundAir(dt, dir, hasInput, inMag, dodgeTap) {
    const inp = G.input;
    const a = this.action;
    const locked = this.lockTarget && !this.lockTarget.dead;
    // ---- actions that take over movement
    if (a) {
      this.updateAction(dt, dir, hasInput);
    } else {
      // combat inputs
      if (!G.build?.active && !G.ui?.blocking) this.handleCombatInput(dt, dir, hasInput, dodgeTap);
    }
    const act = this.action;
    // ---- locomotion
    let target = 0;
    if (!act || act.allowMove) {
      if (hasInput) {
        target = this.crouching ? CROUCH : inMag < 0.5 ? WALK : this.sprinting ? SPRINT : RUN;
        if (this.blocking) target = WALK * 0.8;
        if (act && act.allowMove) target *= act.moveMul ?? 0.4;
        target *= this.speedMul;
      }
      if (this.sprinting && this.mode === 'ground') this.useStamina(14 * dt);
    }
    const accel = this.mode === 'ground' ? (target > 0 ? 16 : 22) : 4;
    if (!act || act.allowMove) {
      const tvx = hasInput ? dir.x / (dir.length() || 1) * target : 0;
      const tvz = hasInput ? dir.z / (dir.length() || 1) * target : 0;
      const k = Math.min(1, accel * dt);
      this.vel.x += (tvx - this.vel.x) * k;
      this.vel.z += (tvz - this.vel.z) * k;
      if (locked && !this.sprinting && this.mode === 'ground') this.faceTarget(this.lockTarget, dt, 12);
      else if (hasInput) this.turnToward(dir, this.mode === 'ground' ? 11 : 4, dt);
    }

    // jump
    if (inp.hit('jump') && !act && !G.ui?.blocking && !G.cutscene?.active) {
      if (this.mode === 'ground' && (this.grounded || this.coyote > 0)) {
        this.vel.y = JUMP_V * (this.sprinting ? 1.05 : 1);
        this.mode = 'air';
        this.grounded = false;
        this.coyote = 0;
        this.fallStartY = this.pos.y;
        G.audio?.sfx('jump', { pos: this.pos });
        this.crouching = false;
      } else if (this.mode === 'air' && this.canUseStamina(5) && this.pos.y - G.terrain.heightAt(this.pos.x, this.pos.z) > 2.2 && G.game?.flags?.glider !== false) {
        this.mode = 'glide';
        this.vel.y = Math.max(this.vel.y, -3);
        G.audio?.sfx('glide', { pos: this.pos });
      }
    }

    this.integrate(dt, dir, hasInput);
  }

  integrate(dt, dir, hasInput) {
    const col = G.collision;
    // horizontal
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const res = col.resolve(this.pos, this.radius, this.height, 0.55, this.resolveOut);
    // steep terrain handling
    const terrain = G.terrain;
    terrain.normalAt(this.pos.x, this.pos.z, _n);
    // climbing triggers
    if (hasInput && this.mode !== 'climb' && !this.action && this.canUseStamina(4) && !this.crouching) {
      if (res.wall && res.wall.climbable && res.wall.top > this.pos.y + 1.3) {
        const into = -(dir.x * res.wallNormal.x + dir.z * res.wallNormal.z) / (dir.length() || 1);
        if (into > 0.6) {
          this.startClimb('col', res.wall, res.wallNormal);
          return;
        }
      }
      if (this.mode === 'ground' || this.mode === 'air') {
        const ahx = this.pos.x + dir.x / (dir.length() || 1) * 0.7, ahz = this.pos.z + dir.z / (dir.length() || 1) * 0.7;
        const hAhead = terrain.heightAt(ahx, ahz);
        terrain.normalAt(ahx, ahz, _v2);
        if (_v2.y < 0.62 && hAhead - this.pos.y > 0.7 && (this.mode === 'air' || this.vel.lengthSq() > 0.5)) {
          const into = -(dir.x * _v2.x + dir.z * _v2.z) / (dir.length() || 1) / Math.max(0.01, Math.hypot(_v2.x, _v2.z));
          if (into > 0.45) {
            this.startClimb('terrain');
            return;
          }
        }
      }
    }
    this.applyGravityAndGround(dt);
  }

  applyGravityAndGround(dt) {
    const col = G.collision;
    const terrain = G.terrain;
    const wasGrounded = this.grounded;
    const g = col.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.05, this.radius, 0.6);
    let gh = g.h;
    this.groundCol = g.col;
    // water / ice
    const wl = G.water ? G.water.level : -1e9;
    if (G.water && !g.col && G.water.isIce(this.pos.x, this.pos.z) && wl > gh) gh = wl + 0.05;
    // building blocks ground handled by collision world (blocks are colliders)
    if (this.mode === 'ground' && this.grounded) {
      // stick to ground when walking down slopes
      if (this.pos.y - gh < 0.65 && this.vel.y <= 0.1) {
        this.pos.y = gh;
        this.vel.y = 0;
      } else {
        this.grounded = false;
        this.mode = 'air';
        this.coyote = 0.12;
        this.fallStartY = this.pos.y;
      }
    } else {
      this.coyote = Math.max(0, (this.coyote || 0) - dt);
      this.vel.y -= GRAV * dt * (this.action?.type === 'plunge' ? 1.6 : 1);
      if (this.vel.y < -55) this.vel.y = -55;
      this.pos.y += this.vel.y * dt;
      if (this.resolveOut.ceiling && this.vel.y > 0) this.vel.y = 0;
      if (this.pos.y <= gh) {
        this.pos.y = gh;
        this.land(this.vel.y);
        this.vel.y = 0;
        this.grounded = true;
        if (this.mode !== 'dead') this.mode = 'ground';
        if (g.col && g.col.bounce) {
          this.vel.y = 18;
          this.mode = 'air';
          this.grounded = false;
          this.fallStartY = this.pos.y;
          G.audio?.sfx('bounce', { pos: this.pos });
          G.fx?.ring(this.pos.x, this.pos.y + 0.1, this.pos.z, 2, 0xd08aff, 1, 0.4);
        }
      } else {
        this.grounded = false;
        if (this.mode === 'ground') this.mode = 'air';
      }
    }
    // slide off steep terrain
    if (this.grounded && !g.col) {
      terrain.normalAt(this.pos.x, this.pos.z, _n);
      this.onTerrain = true;
      if (_n.y < 0.62) {
        const slideK = (0.62 - _n.y) * 30;
        this.vel.x += _n.x * slideK * dt * 10;
        this.vel.z += _n.z * slideK * dt * 10;
        // prevent climbing up the steep part
        const up = -(this.vel.x * _n.x + this.vel.z * _n.z);
        if (up > 0) {
          const nh = Math.hypot(_n.x, _n.z) || 1;
          this.vel.x += (_n.x / nh) * up;
          this.vel.z += (_n.z / nh) * up;
        }
      }
    } else this.onTerrain = false;
    // swimming
    if (G.water && wl - this.pos.y > 1.2 && !G.water.isIce(this.pos.x, this.pos.z) && this.mode !== 'dead') {
      if (this.mode !== 'swim') {
        G.audio?.sfx('splash', { pos: this.pos });
        G.fx?.splash(this.pos.x, wl, this.pos.z, Math.min(1.5, Math.abs(this.vel.y) / 10 + 0.4));
      }
      this.mode = 'swim';
      this.vel.y = 0;
      this.pos.y = wl - 1.2;
      this.action = null;
      this.grounded = false;
    }
    void wasGrounded;
  }

  land(vy) {
    const fall = -vy;
    if (this.action && this.action.type === 'plunge') {
      this.plungeImpact();
    }
    if (fall > 6) {
      G.audio?.sfx('land', { pos: this.pos, volume: Math.min(1, fall / 20) });
      G.fx?.dust(this.pos.x, this.pos.y, this.pos.z, Math.min(1.5, fall / 15));
      this.landT = Math.min(0.35, fall / 50);
    }
    const wl = G.water ? G.water.level : -1e9;
    if (fall > 19 && !this.skills.has('featherfall') && wl < this.pos.y - 0.5 && !this.groundCol?.bounce) {
      const dmg = Math.round((fall - 19) * 4.5);
      this.takeDamage(dmg, null, { fall: true });
      G.cam?.shake(0.5);
    }
  }

  // ------------------------------------------------------------- climbing
  startClimb(kind, colObj, normal) {
    this.mode = 'climb';
    this.action = null;
    this.vel.set(0, 0, 0);
    this.climb = { kind, col: colObj || null, n: new THREE.Vector3(), phase: 0, jumpT: 0 };
    if (normal) this.climb.n.copy(normal);
    else G.terrain.normalAt(this.pos.x, this.pos.z, this.climb.n);
    this.crouching = false;
    G.audio?.sfx('grab', { pos: this.pos });
  }

  stopClimb(push = 0.6) {
    const n = this.climb ? this.climb.n : _n.set(0, 0, 0);
    const nh = Math.hypot(n.x, n.z) || 1;
    this.mode = 'air';
    this.vel.set((n.x / nh) * push * 3, 0, (n.z / nh) * push * 3);
    this.climb = null;
    this.fallStartY = this.pos.y;
  }

  updateClimb(dt) {
    const inp = G.input;
    const c = this.climb;
    const terrain = G.terrain;
    const col = G.collision;
    const iv = inp.moveVec;
    const up = -iv.y, side = iv.x;
    const moving = Math.abs(up) + Math.abs(side) > 0.1;
    const wet = G.weather ? G.weather.rain : 0;
    const drain = (moving ? (up > 0 ? 9 : 6) : 1.5) * (this.skills.has('mountaineer') ? 0.7 : 1) * (1 + wet * 0.8);
    this.useStamina(drain * dt);
    if (this.stamina <= 0 || inp.hit('crouch')) {
      this.stopClimb(0.4);
      return;
    }
    // slippery rain: occasional slide down
    let slip = 0;
    if (wet > 0.3 && moving && up > 0 && Math.sin(G.time * 3.1) > 0.97) slip = -1.2;
    const speed = 1.7 * (c.jumpT > 0 ? 3.2 : 1);
    if (c.jumpT > 0) c.jumpT -= dt;
    // climb jump
    if (inp.hit('jump') && this.canUseStamina(18) && c.jumpT <= 0) {
      if (up < -0.3 || Math.abs(side) > 0.7) {
        // leap away
        this.useStamina(10);
        const n = c.n;
        this.stopClimb(1.2);
        this.vel.y = 6;
        this.yaw = Math.atan2(n.x, n.z);
        return;
      }
      this.useStamina(18);
      c.jumpT = 0.35;
      G.audio?.sfx('jump', { pos: this.pos });
    }
    const effUp = c.jumpT > 0 ? 1 : up + slip;
    c.phase += (moving || c.jumpT > 0 ? 1 : 0) * dt * 7;
    if (c.kind === 'terrain') {
      terrain.normalAt(this.pos.x, this.pos.z, c.n);
      const n = c.n;
      // tangent "up" = world up projected on surface plane
      const tu = _v.set(-n.x * n.y, 1 - n.y * n.y, -n.z * n.y).normalize();
      const ts = _v2.crossVectors(n, tu).normalize();
      const dx = (tu.x * effUp - ts.x * side) * speed * dt;
      const dz = (tu.z * effUp - ts.z * side) * speed * dt;
      this.pos.x += dx;
      this.pos.z += dz;
      const h = terrain.heightAt(this.pos.x, this.pos.z);
      this.pos.y = h;
      this.yaw = Math.atan2(-n.x, -n.z);
      terrain.normalAt(this.pos.x, this.pos.z, _n);
      if (_n.y > 0.7) {
        // reached gentle ground: mantle
        this.mode = 'ground';
        this.grounded = true;
        this.climb = null;
        this.startAction({ type: 'mantle', clip: this.clips.mantle, dur: 0.42 });
        return;
      }
      if (effUp < 0) {
        // climbing down onto flat ground
        const gh = col.groundAt(this.pos.x, this.pos.z, this.pos.y, this.radius).h;
        if (_n.y > 0.6 && this.pos.y - gh < 0.2) {
          this.mode = 'ground';
          this.climb = null;
          return;
        }
      }
      if (G.water && this.pos.y < G.water.level - 1.0) {
        this.climb = null;
        this.mode = 'air';
      }
      // obstacles while climbing terrain
      col.resolve(this.pos, this.radius, this.height, 0.4, this.resolveOut);
    } else {
      const k = c.col;
      if (!k || !k.active) {
        this.stopClimb(0.3);
        return;
      }
      const n = c.n;
      const tx = -n.z, tz = n.x; // tangent
      this.pos.y += effUp * speed * dt;
      this.pos.x += tx * -side * speed * dt;
      this.pos.z += tz * -side * speed * dt;
      // press into wall then resolve to keep contact
      this.pos.x -= n.x * 0.12;
      this.pos.z -= n.z * 0.12;
      const res = col.resolve(this.pos, this.radius, this.height, 0.0, this.resolveOut);
      if (res.wall) {
        c.col = res.wall;
        c.n.copy(res.wallNormal);
      }
      this.yaw = Math.atan2(-c.n.x, -c.n.z);
      // top edge -> mantle
      if (this.pos.y + 1.0 > c.col.top) {
        if (effUp > 0 || this.pos.y + 0.6 > c.col.top) {
          this.pos.y = c.col.top + 0.02;
          this.pos.x -= c.n.x * 0.55;
          this.pos.z -= c.n.z * 0.55;
          const g = col.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.1, this.radius, 0.3);
          this.pos.y = Math.max(this.pos.y, g.h);
          this.mode = 'ground';
          this.grounded = true;
          this.climb = null;
          this.startAction({ type: 'mantle', clip: this.clips.mantle, dur: 0.42 });
          return;
        }
      }
      if (!res.wall) {
        // slipped past an edge
        this.stopClimb(0.2);
        return;
      }
      const g = col.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.1, this.radius, 0.2);
      if (this.pos.y <= g.h + 0.02) {
        this.pos.y = g.h;
        if (effUp < 0) {
          this.mode = 'ground';
          this.climb = null;
        }
      }
    }
  }

  // ---------------------------------------------------------------- glide
  updateGlide(dt, dir, hasInput) {
    const inp = G.input;
    this.useStamina((this.skills.has('featherfall') ? 3.5 : 6) * dt);
    if (inp.hit('jump') || this.stamina <= 0) {
      this.mode = 'air';
      this.fallStartY = this.pos.y;
      this.applyGravityAndGround(dt);
      return;
    }
    if (G.input.attackHit() && !this.action) {
      this.mode = 'air';
      this.startPlunge();
      return;
    }
    if (hasInput) this.turnToward(dir, 2.4, dt);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const fwd = hasInput ? 9.5 : 7.2;
    const k = Math.min(1, dt * 1.8);
    this.vel.x += (fx * fwd - this.vel.x) * k;
    this.vel.z += (fz * fwd - this.vel.z) * k;
    let sink = -2.4;
    // updrafts
    const ups = G.world?.updraftList || [];
    for (const u of ups) {
      const d = Math.hypot(this.pos.x - u.x, this.pos.z - u.z);
      if (d < u.r && this.pos.y < u.top) sink = Math.max(sink, u.strength * (1 - d / u.r * 0.5));
    }
    this.vel.y += (sink - this.vel.y) * Math.min(1, dt * 2.5);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    const res = G.collision.resolve(this.pos, this.radius, this.height, 0.3, this.resolveOut);
    if (res.wall && res.wall.climbable && res.wall.top > this.pos.y + 1.2 && this.canUseStamina(5)) {
      this.startClimb('col', res.wall, res.wallNormal);
      return;
    }
    const g = G.collision.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.1, this.radius);
    if (this.pos.y <= g.h) {
      this.pos.y = g.h;
      this.vel.y = 0;
      this.mode = 'ground';
      this.grounded = true;
      return;
    }
    // hitting a cliff face while gliding -> grab it
    G.terrain.normalAt(this.pos.x + fx * 0.8, this.pos.z + fz * 0.8, _n);
    const hAhead = G.terrain.heightAt(this.pos.x + fx * 0.8, this.pos.z + fz * 0.8);
    if (_n.y < 0.6 && hAhead > this.pos.y + 0.4) {
      this.startClimb('terrain');
      return;
    }
    if (G.water && G.water.level - this.pos.y > 0.4 && !G.water.isIce(this.pos.x, this.pos.z)) {
      this.mode = 'air';
      this.applyGravityAndGround(dt);
    }
  }

  // ----------------------------------------------------------------- swim
  updateSwim(dt, dir, hasInput) {
    const inp = G.input;
    const wl = G.water.level;
    const fast = inp.down('sprint') && this.canUseStamina(1) && hasInput;
    this.sprinting = fast;
    const sp = (fast ? 4.4 : 2.3) * (hasInput ? 1 : 0);
    if (fast) this.useStamina(16 * dt);
    else if (hasInput) this.useStamina(1.5 * dt), (this.staminaDelay = 0.3);
    const tvx = hasInput ? dir.x / dir.length() * sp : 0;
    const tvz = hasInput ? dir.z / dir.length() * sp : 0;
    this.vel.x += (tvx - this.vel.x) * Math.min(1, dt * 3);
    this.vel.z += (tvz - this.vel.z) * Math.min(1, dt * 3);
    if (hasInput) this.turnToward(dir, 6, dt);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y = wl - 1.2 + Math.sin(G.time * 2) * 0.04;
    G.collision.resolve(this.pos, this.radius, this.height, 0.6, this.resolveOut);
    if (this.stamina <= 0 && this.exhausted) {
      // exhausted: sink and wash ashore
      this.respawnSafe(15);
      G.hud?.toast('You ran out of stamina and were swept ashore.', 'warn');
      return;
    }
    const gh = G.collision.groundAt(this.pos.x, this.pos.z, this.pos.y + 1.2, this.radius, 1.2).h;
    if (wl - gh < 1.15) {
      this.pos.y = gh;
      this.mode = 'ground';
      this.grounded = true;
    }
    if (inp.hit('jump') && wl - gh < 2.5) {
      this.vel.y = 6;
      this.mode = 'air';
      this.pos.y = wl - 0.6;
    }
    if (G.water.isIce(this.pos.x, this.pos.z)) {
      this.pos.y = wl + 0.05;
      this.mode = 'ground';
      this.grounded = true;
    }
    if (hasInput && Math.random() < dt * 4) G.fx?.ripple(this.pos.x, wl, this.pos.z);
  }

  // --------------------------------------------------------------- combat
  handleCombatInput(dt, dir, hasInput, dodgeTap) {
    const inp = G.input;
    this.blocking = false;
    if (dodgeTap && this.mode === 'ground' && this.canUseStamina(18)) {
      this.startRoll(dir, hasInput);
      return;
    }
    // block / parry
    if (inp.blockHit() && this.mode === 'ground') {
      this.parryT = G.gameTime;
      this.startAction({ type: 'parry', clip: this.clips.parry, dur: 0.38, allowMove: true, moveMul: 0.2 });
      this.combatT = 6;
      return;
    }
    if (inp.blockDown() && this.mode === 'ground' && G.gameTime - this.parryT > 0.2) {
      this.blocking = true;
      this.combatT = 6;
    }
    // attacks
    if (this.mode === 'air' && inp.attackHit()) {
      if (this.pos.y - G.terrain.heightAt(this.pos.x, this.pos.z) > 1.6) {
        this.startPlunge();
        return;
      }
    }
    if (this.mode !== 'ground') return;
    const held = inp.held.attack || 0;
    if (inp.attackDown() && held > 0.34 && !this.charging) {
      this.charging = true;
      this.startAction({ type: 'charge', dur: 99, allowMove: true, moveMul: 0.3 });
      return;
    }
    if (inp.attackHit()) {
      const t = this.lockTarget;
      if (t && t.staggered && t.pos.distanceTo(this.pos) < 3.2 && !t.boss) {
        this.startFinisher(t);
        return;
      }
      if (this.sprinting && Math.hypot(this.vel.x, this.vel.z) > 6) {
        this.startAttack('thrust', 0);
        return;
      }
      this.startAttack('slash1', 0);
    }
  }

  startAction(a) {
    a.t = 0;
    this.action = a;
    return a;
  }

  stanceMul() {
    return this.stance === 'wind' ? { speed: 1.22, dmg: 0.82, poise: 0.85, range: 1 } : { speed: 0.86, dmg: 1.32, poise: 1.7, range: 1.12 };
  }

  startAttack(name, combo, extra = {}) {
    const sm = this.stanceMul();
    const clip = this.clips[name];
    const defs = {
      slash1: { hit: [0.13, 0.27], dmg: 1.0, reach: 2.6, arc: 1.4, lunge: 2.2 },
      slash2: { hit: [0.11, 0.25], dmg: 1.05, reach: 2.6, arc: 1.4, lunge: 2.2 },
      slash3: { hit: [0.2, 0.33], dmg: 1.6, reach: 2.9, arc: 0.9, lunge: 3.2, shake: 0.25 },
      thrust: { hit: [0.16, 0.3], dmg: 1.5, reach: 3.2, arc: 0.6, lunge: 7.5 },
      heavy: { hit: [0.3, 0.48], dmg: 2.1, reach: 3.0, arc: 2.2, lunge: 2.5, shake: 0.35 },
      spin: { hit: [0.15, 0.6], dmg: 1.4, reach: 3.0, arc: 7, lunge: 1.0, multi: true },
      finisher: { hit: [0.42, 0.55], dmg: 5, reach: 3.2, arc: 2, lunge: 1.5, shake: 0.6 },
    };
    const d = defs[name];
    const speed = (extra.speed || 1) * sm.speed;
    this.startAction({
      type: 'attack', name, clip, combo, speed, dur: clip.duration / speed, hit: [d.hit[0] / speed, d.hit[1] / speed],
      dmg: d.dmg * sm.dmg * (extra.charge || 1), poise: sm.poise * (name === 'heavy' ? 2.2 : 1), reach: d.reach * sm.range, arc: d.arc, lunge: d.lunge,
      hitSet: new Set(), queued: false, shake: d.shake || 0, multi: d.multi, el: this.imbue ? this.imbue.el : -1,
    });
    this.combatT = 7;
    this.rig.sheathe(false);
    if (this.useStaminaCost(name)) {}
    G.audio?.sfx(name === 'heavy' || name === 'finisher' ? 'swingHeavy' : 'swing', { pos: this.pos, pitch: 0.9 + Math.random() * 0.2 + (this.stance === 'wind' ? 0.1 : -0.1) });
    // face lock target or input direction
    const t = this.lockTarget || G.combat?.autoTarget(this.pos, this.yaw, 6);
    if (t) {
      const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z;
      this.yaw = Math.atan2(dx, dz);
    } else {
      const dir = this.inputDir(_v);
      if (dir.lengthSq() > 0.01) this.yaw = Math.atan2(dir.x, dir.z);
    }
    if (G.trails) G.trails.start(this);
  }

  useStaminaCost(name) {
    const c = { slash1: 8, slash2: 8, slash3: 12, thrust: 14, heavy: 20, spin: 18, finisher: 0 }[name] || 8;
    this.useStamina(c * (this.stance === 'stone' ? 1.2 : 1));
    return true;
  }

  startRoll(dir, hasInput) {
    this.useStamina(18);
    let d = dir.clone();
    const back = !hasInput;
    if (back) d.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    d.normalize();
    this.startAction({ type: 'roll', dur: back ? 0.38 : 0.6, dir: d, back, startT: G.gameTime });
    this.iframes = back ? 0.26 : 0.38;
    this.rollStart = G.gameTime;
    if (!back) this.yaw = Math.atan2(d.x, d.z);
    G.audio?.sfx('dodge', { pos: this.pos });
    G.fx?.dust(this.pos.x, this.pos.y, this.pos.z, 0.5);
  }

  startPlunge() {
    this.startAction({ type: 'plunge', clip: this.clips.plunge, dur: 99, hitSet: new Set() });
    this.vel.y = Math.min(this.vel.y, -6);
    this.vel.x *= 0.3;
    this.vel.z *= 0.3;
    G.audio?.sfx('swingHeavy', { pos: this.pos, pitch: 0.7 });
    this.rig.sheathe(false);
  }

  plungeImpact() {
    const drop = Math.max(2, this.fallStartY - this.pos.y);
    const dmg = this.attackPower * (1.6 + Math.min(3, drop / 6));
    G.combat?.aoe(this.pos, 4 + Math.min(3, drop / 8), dmg, { source: this, poise: 3, knock: 8, el: this.imbue ? this.imbue.el : -1, kind: 'plunge' });
    G.fx?.shockwave(this.pos.x, this.pos.y + 0.1, this.pos.z, 5, 0xbfe8ff);
    G.cam?.shake(0.6);
    G.audio?.sfx('slam', { pos: this.pos });
    this.action = null;
    this.startAction({ type: 'recover', clip: this.clips.plunge, dur: 0.45, fromEnd: true });
    this.landT = 0.3;
  }

  startFinisher(t) {
    this.startAttack('finisher', 0);
    this.action.target = t;
    t.pinned = 1.2;
    G.cam?.cinematic('finisher', this, t, 1.2);
    G.slowmo?.(0.35, 0.5);
  }

  updateAction(dt, dir, hasInput) {
    const a = this.action;
    a.t += dt;
    const inp = G.input;
    switch (a.type) {
      case 'roll': {
        const u = a.t / a.dur;
        const sp = a.back ? 5.5 * (1 - u) : 9.5 * Math.max(0, 1 - u * u);
        this.vel.x = a.dir.x * sp;
        this.vel.z = a.dir.z * sp;
        if (a.t >= a.dur) this.action = null;
        // chain into attack
        if (u > 0.6 && inp.attackHit()) {
          this.action = null;
          this.startAttack('thrust', 0, { speed: 1.1 });
        }
        break;
      }
      case 'attack': {
        this.vel.x *= 0.82;
        this.vel.z *= 0.82;
        // lunge forward during wind-up into strike
        if (a.t < a.hit[1]) {
          const t = this.lockTarget || a.target;
          let lunge = a.lunge;
          if (t) {
            const dd = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z) - (t.radius || 0.5) - 1.4;
            lunge = Math.max(0, Math.min(lunge, dd * 4));
            this.faceTarget(t, dt, 18);
          }
          const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
          this.vel.x = fx * lunge;
          this.vel.z = fz * lunge;
        }
        if (a.t >= a.hit[0] && a.t <= a.hit[1]) {
          G.combat?.playerSwing(this, a);
        }
        if (inp.attackHit() && a.t > a.dur * 0.3) a.queued = true;
        const next = { slash1: 'slash2', slash2: 'slash3' }[a.name];
        if (a.queued && next && a.t > a.dur * 0.62) {
          this.startAttack(next, a.combo + 1);
          return;
        }
        if (a.queued && a.name === 'slash3' && a.t > a.dur * 0.8) {
          this.startAttack('slash1', 0);
          return;
        }
        if (inp.up('sprint') && this.sprintHeld < 0.24 && a.t > a.dur * 0.5 && this.canUseStamina(18)) {
          this.action = null;
          this.startRoll(dir, hasInput);
          return;
        }
        if (a.t >= a.dur) this.action = null;
        break;
      }
      case 'charge': {
        a.allowMove = true;
        const lvl = Math.min(1, a.t / 1.1);
        this.chargeLevel = lvl;
        if (this.rig.weapon) {
          this.rig.weapon.userData.glowMat.opacity = 0.3 + lvl * 0.7;
        }
        if (!inp.attackDown() || a.t > 2.5) {
          this.charging = false;
          this.action = null;
          const spin = this.skills.has('whirlwind') && lvl > 0.95;
          this.startAttack(spin ? 'spin' : 'heavy', 0, { charge: 1 + lvl * 0.9 });
          this.chargeLevel = 0;
        }
        if (inp.up('sprint') && this.sprintHeld < 0.24) {
          this.charging = false;
          this.action = null;
          this.chargeLevel = 0;
          this.startRoll(dir, hasInput);
        }
        break;
      }
      case 'parry':
      case 'cast':
      case 'mantle':
      case 'recover':
      case 'pickup':
      case 'harvest':
      case 'stagger':
      case 'drink': {
        if (a.type === 'harvest' && !a.done && a.t > 0.3) {
          a.done = true;
          G.combat?.harvestHit(this, a.target);
        }
        if (a.type === 'stagger') {
          this.vel.x *= 0.9;
          this.vel.z *= 0.9;
        } else if (!a.allowMove) {
          this.vel.x *= 0.8;
          this.vel.z *= 0.8;
        }
        if (a.type === 'mantle') {
          const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
          this.vel.x = fx * 1.5;
          this.vel.z = fz * 1.5;
        }
        if (a.type === 'drink' && !a.done && a.t > 0.5) {
          a.done = true;
          if (a.onDone) a.onDone();
        }
        if (a.t >= a.dur) this.action = null;
        break;
      }
      case 'plunge': {
        this.vel.x *= 0.95;
        this.vel.z *= 0.95;
        if (this.mode === 'ground') this.action = null;
        break;
      }
      default:
        if (a.t >= (a.dur || 0.5)) this.action = null;
    }
  }

  // Called by enemies. Returns 'hit' | 'parry' | 'block' | 'dodge' | 'perfect' | 'guardbreak'
  receiveAttack(dmg, source, opts = {}) {
    if (this.dead || this.mode === 'locked') return 'none';
    const diff = DIFFICULTY[G.settings.difficulty] || DIFFICULTY.balanced;
    if (this.iframes > 0) {
      const since = G.gameTime - (this.rollStart || -9);
      if (since < 0.2 && !this.perfectCooldown) {
        this.perfectCooldown = true;
        G.after(1.2, () => (this.perfectCooldown = false));
        G.combat?.perfectDodge(this, source);
        return 'perfect';
      }
      return 'dodge';
    }
    const facing = source ? this.facingDot(source.pos) : 1;
    const parryWin = diff.parry + (this.skills.has('riposte') ? 0.04 : 0);
    if (opts.parryable !== false && facing > -0.35 && G.gameTime - this.parryT < parryWin && this.mode === 'ground') {
      if (source) this.yaw = Math.atan2(source.pos.x - this.pos.x, source.pos.z - this.pos.z);
      G.combat?.parrySuccess(this, source, opts);
      this.mana = Math.min(this.maxMana, this.mana + 15);
      return 'parry';
    }
    if (this.blocking && facing > 0.2 && opts.unblockable !== true) {
      const cost = dmg * 1.1 * (G.game?.companionPerk === 'kael' ? 0.7 : 1);
      if (this.stamina >= cost * 0.5) {
        this.useStamina(cost);
        this.takeDamage(dmg * 0.2 * diff.dmgTaken, source, { blocked: true });
        G.audio?.sfx('block', { pos: this.pos });
        G.fx?.sparks(this.pos.x + Math.sin(this.yaw) * 0.6, this.pos.y + 1.3, this.pos.z + Math.cos(this.yaw) * 0.6, 12, 0xffd27a);
        const kx = this.pos.x - source.pos.x, kz = this.pos.z - source.pos.z, kl = Math.hypot(kx, kz) || 1;
        this.vel.x += (kx / kl) * 3;
        this.vel.z += (kz / kl) * 3;
        return 'block';
      }
      this.useStamina(this.stamina);
      this.blocking = false;
      this.startAction({ type: 'stagger', dur: 1.0 });
      G.audio?.sfx('guardbreak', { pos: this.pos });
      this.takeDamage(dmg * 0.6 * diff.dmgTaken, source, {});
      return 'guardbreak';
    }
    this.takeDamage(dmg * diff.dmgTaken, source, opts);
    return 'hit';
  }

  facingDot(p) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    return (dx / l) * Math.sin(this.yaw) + (dz / l) * Math.cos(this.yaw);
  }

  takeDamage(dmg, source, opts = {}) {
    if (this.dead) return;
    const reduced = dmg * (1 - Math.min(0.6, this.armor / 100));
    this.hp = Math.max(0, this.hp - reduced);
    this.hurtT = 0.5;
    G.hud?.damageFlash(Math.min(1, reduced / 30));
    G.fx?.damageNumber(this.pos.x, this.pos.y + 2, this.pos.z, reduced, opts.blocked ? '#aaa' : '#ff6b6b');
    if (!opts.blocked) {
      G.audio?.sfx('hurt', { pos: this.pos });
      G.cam?.shake(Math.min(0.6, 0.15 + reduced / 50));
      if (source && !opts.fall && (reduced > 10 || opts.heavy)) {
        const kx = this.pos.x - source.pos.x, kz = this.pos.z - source.pos.z, kl = Math.hypot(kx, kz) || 1;
        this.vel.x = (kx / kl) * (opts.knock || 5);
        this.vel.z = (kz / kl) * (opts.knock || 5);
        if (this.mode === 'ground') this.startAction({ type: 'stagger', dur: opts.heavy ? 0.8 : 0.45 });
        if (this.mode === 'climb') this.stopClimb(0.6);
        if (this.mode === 'glide') this.mode = 'air';
      }
    }
    if (this.hp <= 0) this.die();
  }

  heal(a) {
    this.hp = Math.min(this.maxHp, this.hp + a);
    G.fx?.healBurst(this.pos);
  }

  die() {
    this.dead = true;
    this.deadT = 0;
    this.action = null;
    this.mode = this.mode === 'swim' ? 'swim' : 'ground';
    G.audio?.sfx('death');
    G.game?.onPlayerDeath();
  }

  revive(x, y, z) {
    this.dead = false;
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.mana = this.maxMana;
    this.exhausted = false;
    this.spawn(x, y, z);
  }

  // -------------------------------------------------------------- animate
  animate(dt, inMag) {
    const rig = this.rig;
    const P = this.pose;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const t = G.time;
    const armed = this.combatT > 0 || this.lockTarget;
    if (!armed && !this.rig.sheathed && this.mode === 'ground' && !this.action) rig.sheathe(true);
    if (armed && rig.sheathed) rig.sheathe(false);
    rig.body.rotation.set(0, 0, 0);
    rig.body.position.set(0, 0, 0);
    if (this.dead) {
      Anim.dead(P, this.deadT * 2);
    } else if (this.mode === 'climb' && this.climb) {
      Anim.climb(P, this.climb.phase, true);
      const n = this.climb.n;
      const lean = this.climb.kind === 'terrain' ? Math.asin(Math.min(1, Math.max(0, n.y))) : 0;
      rig.body.rotation.x = lean * 0.9;
      rig.body.position.z = -0.05;
    } else if (this.mode === 'glide') {
      const turn = (G.input.moveVec.x || 0);
      Anim.glide(P, t, turn);
    } else if (this.mode === 'swim') {
      Anim.swim(P, (this.phase += dt * (speed > 0.3 ? 5 : 2)), speed > 0.3);
    } else if (this.mode === 'air' && !this.action) {
      Anim.air(P, this.vel.y, t);
    } else if (this.mode === 'mounted') {
      Anim.work(P, t, 'sit');
      addJ(P, 'thighL', 0.4, 0, 0.35);
      addJ(P, 'thighR', 0.4, 0, -0.35);
      addJ(P, 'shinL', -0.2, 0, 0);
      addJ(P, 'shinR', -0.2, 0, 0);
      addJ(P, 'spine', 0.15 + (this.mountLean || 0), 0, 0);
      setJ(P, 'armL', -0.9, 0, 0.1);
      setJ(P, 'armR', -0.9, 0, -0.1);
    } else {
      // ground locomotion
      if (speed > 0.15) {
        const stride = this.crouching ? 0.9 : speed > 7 ? 2.2 : speed > 3.5 ? 1.75 : 1.1;
        this.phase += (speed / stride) * dt * Math.PI;
        const sp = speed / SPRINT;
        if (this.crouching) Anim.crouch(P, this.phase, sp * 2, t);
        else Anim.locomote(P, this.phase, sp, t, { armed: armed && !rig.sheathed });
        // footsteps
        const fp = Math.floor(this.phase / Math.PI);
        if (fp !== this.footPhaseLast) {
          this.footPhaseLast = fp;
          G.audio?.footstep(this.surfaceType(), Math.min(1, speed / 6), this.pos);
          if (speed > 6 && this.grounded) G.fx?.dust(this.pos.x, this.pos.y, this.pos.z, 0.15);
        }
      } else {
        if (this.crouching) {
          Anim.crouch(P, 0, 0, t);
        } else Anim.idle(P, t, armed && !rig.sheathed);
      }
      if (this.blocking) {
        this.clips.block.sample(0.5, this.tmpPose);
        blendUpper(P, this.tmpPose, 1);
      }
      if (this.landT > 0) {
        this.landT -= dt;
        P[J_OFF + 1] -= this.landT * 0.8;
        addJ(P, 'shinL', this.landT * 2, 0, 0);
        addJ(P, 'shinR', this.landT * 2, 0, 0);
        addJ(P, 'thighL', -this.landT * 1.5, 0, 0);
        addJ(P, 'thighR', -this.landT * 1.5, 0, 0);
      }
    }
    // action overlays
    const a = this.action;
    if (a && !this.dead) {
      if (a.type === 'roll') {
        const u = Math.min(1, a.t / a.dur);
        Anim.roll(P, u);
        if (!a.back) rig.body.rotation.x = u * Math.PI * 2;
        else rig.body.rotation.x = -Math.sin(u * Math.PI) * 0.4;
        rig.body.position.y = Math.sin(u * Math.PI) * (a.back ? 0.05 : 0.45);
      } else if (a.type === 'attack' && a.clip) {
        a.clip.sample(a.t * a.speed, this.tmpPose);
        const full = a.name === 'slash3' || a.name === 'heavy' || a.name === 'thrust' || a.name === 'finisher';
        const w = Math.min(1, a.t * 12) * Math.min(1, (a.dur - a.t) * 6 + 0.2);
        if (full) blendPose(P, P, this.tmpPose, w);
        else blendUpper(P, this.tmpPose, w);
        if (a.name === 'spin') rig.body.rotation.y = -Math.min(1, a.t / (a.dur * 0.7)) * Math.PI * 2;
      } else if (a.type === 'charge') {
        this.clips.heavy.sample(0.25, this.tmpPose);
        blendUpper(P, this.tmpPose, Math.min(1, a.t * 6));
        P[J_OFF + 1] -= 0.05;
      } else if (a.clip) {
        const tt = a.fromEnd ? a.clip.duration * (0.6 + 0.4 * (a.t / a.dur)) : a.t;
        a.clip.sample(tt, this.tmpPose);
        const full = a.type === 'mantle' || a.type === 'pickup' || a.type === 'plunge' || a.type === 'recover' || a.type === 'castBig';
        const w = Math.min(1, a.t * 10) * Math.min(1, (a.dur - a.t) * 6 + (a.type === 'plunge' ? 1 : 0.1));
        if (full) blendPose(P, P, this.tmpPose, Math.min(1, w));
        else blendUpper(P, this.tmpPose, Math.min(1, w));
      } else if (a.type === 'stagger') {
        Anim.stagger(this.tmpPose, a.t / a.dur, 1);
        blendPose(P, P, this.tmpPose, 1);
      } else if (a.type === 'drink') {
        setJ(P, 'armR', -2.0, 0.5, -0.3);
        setJ(P, 'foreR', -1.8, 0, 0);
        setJ(P, 'head', -0.4, 0, 0);
      }
    }
    // glider visuals
    const gl = this.mode === 'glide' ? 1 : 0;
    this.gliderOpen += (gl - this.gliderOpen) * Math.min(1, dt * 10);
    this.glider.scale.setScalar(Math.max(0.001, this.gliderOpen * this.rig.s));
    this.glider.visible = this.gliderOpen > 0.02;
    // weapon glow (imbue / charge)
    if (rig.weapon) {
      const ud = rig.weapon.userData;
      if (this.imbue) {
        const ec = [0xff7a2a, 0x8fe8ff, 0xc39bff, 0xffe08a][this.imbue.el];
        ud.glowMat.color.setHex(ec);
        ud.glowMat.opacity = 0.7 + Math.sin(t * 10) * 0.2;
        ud.bladeMat.emissive.setHex(ec);
        ud.bladeMat.emissiveIntensity = 0.6;
      } else if (!this.charging) {
        ud.glowMat.opacity *= 0.9;
        ud.bladeMat.emissiveIntensity *= 0.9;
        ud.glowMat.color.setHex(this.stance === 'wind' ? 0x8fe0ff : 0xffb36a);
      }
    }
    // glance toward a locked foe or someone close by
    let look = 0;
    if (this.mode === 'ground' && !this.action) {
      let tgt = this.lockTarget && !this.lockTarget.dead ? this.lockTarget.pos : null;
      if (!tgt && G.npcs) {
        let best = 25;
        for (const n of G.npcs.list) {
          if (!n.rig?.root.visible) continue;
          const d2 = (n.pos.x - this.pos.x) ** 2 + (n.pos.z - this.pos.z) ** 2;
          if (d2 < best) { best = d2; tgt = n.pos; }
        }
      }
      if (tgt) {
        let a = Math.atan2(tgt.x - this.pos.x, tgt.z - this.pos.z) - this.yaw;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        if (Math.abs(a) < 1.6) look = Math.max(-0.9, Math.min(0.9, a));
      }
    }
    this.lookYaw = (this.lookYaw || 0) + (look - (this.lookYaw || 0)) * Math.min(1, dt * 4);
    if (Math.abs(this.lookYaw) > 0.01) addJ(P, 'head', 0, this.lookYaw * 0.75, 0);
    rig.apply(P);
    // place rig
    rig.root.position.copy(this.pos);
    rig.root.rotation.y = this.yaw;
    if (this.mode === 'climb' && this.climb && this.climb.kind === 'terrain') {
      const n = this.climb.n;
      const nh = Math.hypot(n.x, n.z) || 1;
      rig.root.position.x += (n.x / nh) * 0.32;
      rig.root.position.z += (n.z / nh) * 0.32;
    }
    rig.root.updateMatrixWorld(true);
    rig.groundY = this.mode === 'swim' ? G.water.level - 0.2 : this.pos.y;
    const w = WIND_UNIFORM.value;
    const runWind = speed * 0.9;
    const wx = w.x * 2 - Math.sin(this.yaw) * runWind * 3;
    const wz = w.y * 2 - Math.cos(this.yaw) * runWind * 3;
    rig.updateCape(dt, { x: wx, y: wz }, this.mode === 'glide' ? 14 : this.mode === 'air' && this.vel.y < -5 ? 18 : 0);
  }

  surfaceType() {
    if (this.groundCol) return this.groundCol.tag === 'wood' ? 'wood' : 'stone';
    if (G.water && G.water.level - this.pos.y > 0.05) return 'water';
    const e = G.epochs ? G.epochs.current : 0;
    const m = G.terrain.maskAt(this.pos.x, this.pos.z);
    if (m[1] > 0.5) return 'dirt';
    if (this.pos.y > 150) return e === 1 ? 'dirt' : 'snow';
    if (m[2] > 0.5) return 'stone';
    return e === 1 ? 'dirt' : 'grass';
  }

  gainXP(n) {
    this.xp += n;
    let leveled = false;
    while (this.xp >= this.xpForNext()) {
      this.xp -= this.xpForNext();
      this.level++;
      this.maxHp += 10;
      this.maxMana += 5;
      this.hp = this.maxHp;
      this.mana = this.maxMana;
      this.skillPoints = (this.skillPoints || 0) + 1;
      leveled = true;
    }
    if (leveled) {
      G.hud?.banner(`Level ${this.level}`, 'You feel time bend more easily around you. +1 skill point', 'level');
      G.audio?.sfx('levelup');
      G.fx?.healBurst(this.pos, 0xffe08a);
    }
  }
  xpForNext() {
    return Math.round(60 * Math.pow(this.level, 1.45));
  }
}

const J_OFF = 19 * 3;
