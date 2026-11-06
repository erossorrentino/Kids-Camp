import * as THREE from 'three';
import { G } from '../core/G.js';
import { Rig, Anim, newPose, blendPose, blendUpper, buildCombatClips } from './rig.js';
import { QuadRig, WispRig } from './quadrig.js';
import { DIFFICULTY } from './player.js';

const _v = new THREE.Vector3();
let CLIPS = null;
const CLIP_HIT = { slash1: [0.13, 0.27], slash2: [0.11, 0.25], slash3: [0.2, 0.33], heavy: [0.3, 0.48], thrust: [0.16, 0.3], cast: [0.14, 0.24], castBig: [0.3, 0.5], spin: [0.15, 0.6] };

// ---------------------------------------------------------------------------
// Enemy catalogue
// ---------------------------------------------------------------------------
export const ENEMY_TYPES = {
  wolf: {
    name: 'Bramble Wolf', kind: 'quad', hp: 55, poise: 25, dmg: 10, speed: 8, walk: 2.2, reach: 1.9, sight: 26, xp: 18, radius: 0.6, height: 1.0,
    rig: { color: 0x6b5a48, color2: 0x3b3026, scale: 1.05 },
    drops: [['hide', 1, 2, 0.9], ['fiber', 1, 1, 0.3]],
    attacks: [
      { name: 'bite', range: [0, 2.2], windup: 0.45, active: 0.18, recover: 0.6, dmg: 1, arc: 1.2, reach: 2.1, lunge: 4, parryable: true, cd: 1.6 },
      { name: 'pounce', range: [3.5, 8], windup: 0.6, active: 0.35, recover: 0.9, dmg: 1.4, arc: 1.0, reach: 2.2, lunge: 13, parryable: true, cd: 4 },
    ],
  },
  thornling: {
    name: 'Thornling', kind: 'human', hp: 70, poise: 35, dmg: 12, speed: 4.6, walk: 1.6, reach: 2.2, sight: 22, xp: 22, radius: 0.45, height: 1.6,
    rig: { build: 'husk', bareArms: true, hairStyle: 'none', colors: { skin: 0x5b7a3a, cloth: 0x3c5226, cloth2: 0x2e3f1d, leather: 0x4a3a22, hair: 0x2e4a1a }, glowEyes: 0xffd24a, weapon: 'club', scale: 0.95 },
    drops: [['fiber', 1, 3, 0.9], ['wood', 1, 2, 0.6], ['herb', 1, 1, 0.3]],
    attacks: [
      { name: 'swing', clip: 'slash1', range: [0, 2.3], windup: 0.55, active: 0.16, recover: 0.6, dmg: 1, arc: 1.4, reach: 2.4, lunge: 2.5, parryable: true, cd: 1.4 },
      { name: 'smash', clip: 'slash3', range: [0, 2.6], windup: 0.8, active: 0.2, recover: 0.9, dmg: 1.6, arc: 0.8, reach: 2.6, lunge: 3, parryable: true, heavy: true, cd: 3 },
    ],
  },
  sentinel: {
    name: 'Gilded Construct', kind: 'human', hp: 140, poise: 70, dmg: 18, speed: 3.8, walk: 1.5, reach: 2.6, sight: 24, xp: 45, radius: 0.55, height: 2.2, armor: 0.25,
    rig: { build: 'knight', helm: true, plume: 0xcc3333, colors: { skin: 0xc9a14a, cloth: 0x8a6f2c, cloth2: 0x6b5520, leather: 0x4d3c18, metal: 0xe6c66a }, glowEyes: 0x7fe8ff, weapon: 'sword', weaponOpts: { length: 1.2, bladeColor: 0xf0d890, glow: 0x7fe8ff }, scale: 1.18 },
    drops: [['iron', 1, 3, 0.9], ['crystal', 1, 1, 0.3]],
    attacks: [
      { name: 'slash', clip: 'slash1', range: [0, 2.8], windup: 0.5, active: 0.15, recover: 0.5, dmg: 1, arc: 1.5, reach: 2.9, lunge: 3, parryable: true, cd: 1.2, combo: 'slash2' },
      { name: 'thrust', clip: 'thrust', range: [2, 5], windup: 0.65, active: 0.18, recover: 0.8, dmg: 1.3, arc: 0.6, reach: 3.4, lunge: 9, parryable: true, cd: 3 },
      { name: 'cleave', clip: 'heavy', range: [0, 3], windup: 1.0, active: 0.2, recover: 1.0, dmg: 2.0, arc: 2.2, reach: 3.2, lunge: 2, unblockable: true, parryable: false, heavy: true, cd: 5 },
    ],
  },
  husk: {
    name: 'Ash Husk', kind: 'human', hp: 80, poise: 30, dmg: 14, speed: 3.4, walk: 1.2, reach: 2.2, sight: 20, xp: 24, radius: 0.45, height: 1.7,
    rig: { build: 'husk', bareArms: true, hairStyle: 'none', colors: { skin: 0x3a3330, cloth: 0x2a2422, cloth2: 0x1f1a18, leather: 0x2a2018 }, glowEyes: 0xff6a22, weapon: 'club', weaponOpts: { color: 0x2a1a10 } },
    drops: [['ember', 1, 2, 0.8], ['stone', 1, 2, 0.4]],
    burns: true,
    attacks: [
      { name: 'claw', clip: 'slash2', range: [0, 2.3], windup: 0.6, active: 0.18, recover: 0.6, dmg: 1, arc: 1.3, reach: 2.3, lunge: 2.5, parryable: true, cd: 1.4 },
      { name: 'flail', clip: 'slash1', range: [0, 2.3], windup: 0.4, active: 0.15, recover: 0.5, dmg: 0.8, arc: 1.4, reach: 2.3, lunge: 2, parryable: true, cd: 1.0, combo: 'slash2' },
      { name: 'erupt', clip: 'castBig', range: [0, 3.5], windup: 1.2, active: 0.2, recover: 1.1, dmg: 1.8, aoe: 3.6, unblockable: true, parryable: false, heavy: true, cd: 7, element: 0 },
    ],
  },
  hound: {
    name: 'Cinder Hound', kind: 'quad', hp: 65, poise: 25, dmg: 12, speed: 9, walk: 2.5, reach: 2, sight: 28, xp: 26, radius: 0.6, height: 1.0,
    rig: { color: 0x2a1f1a, color2: 0x140e0c, glowEyes: 0xff7a22, scale: 1.1, flame: true },
    drops: [['ember', 1, 2, 0.9], ['hide', 1, 1, 0.4]],
    burns: true,
    attacks: [
      { name: 'bite', range: [0, 2.2], windup: 0.4, active: 0.18, recover: 0.6, dmg: 1, arc: 1.2, reach: 2.1, lunge: 4, parryable: true, cd: 1.4, element: 0 },
      { name: 'pounce', range: [3.5, 9], windup: 0.55, active: 0.35, recover: 0.9, dmg: 1.4, arc: 1.0, reach: 2.2, lunge: 14, parryable: true, cd: 3.5, element: 0 },
    ],
  },
  archer: {
    name: 'Ember Archer', kind: 'human', hp: 60, poise: 25, dmg: 12, speed: 3.8, walk: 1.4, reach: 18, sight: 32, xp: 26, radius: 0.45, height: 1.7, ranged: true, keep: 13,
    rig: { build: 'husk', hood: 0x3a2018, hairStyle: 'none', colors: { skin: 0x3a3330, cloth: 0x4a2a1c, cloth2: 0x2a1a12 }, glowEyes: 0xff9a3a, weapon: 'staff', weaponOpts: { color: 0x2a1a10, gem: 0xff7a2a } },
    drops: [['ember', 1, 2, 0.8], ['fiber', 1, 2, 0.5]],
    attacks: [
      { name: 'firebolt', clip: 'cast', range: [4, 22], windup: 0.9, active: 0.1, recover: 0.8, dmg: 1, projectile: { speed: 20, el: 0, color: 0xff7a2a, size: 0.35 }, parryable: true, cd: 2.2 },
      { name: 'swat', clip: 'slash1', range: [0, 2.2], windup: 0.45, active: 0.15, recover: 0.6, dmg: 0.8, arc: 1.4, reach: 2.2, lunge: 1.5, parryable: true, cd: 1.5 },
    ],
  },
  wisp: {
    name: 'Void Wisp', kind: 'wisp', hp: 50, poise: 20, dmg: 12, speed: 4.5, walk: 2, reach: 16, sight: 30, xp: 28, radius: 0.5, height: 2.0, ranged: true, keep: 10, flying: true,
    rig: { color: 0x9a7bff },
    drops: [['crystal', 1, 2, 0.9], ['starShard', 1, 1, 0.25]],
    attacks: [
      { name: 'orb', range: [3, 20], windup: 0.8, active: 0.1, recover: 0.6, dmg: 1, projectile: { speed: 14, el: 2, color: 0xc39bff, size: 0.4, homing: 1.5 }, parryable: true, cd: 2.0 },
      { name: 'nova', range: [0, 3.5], windup: 1.0, active: 0.15, recover: 0.8, dmg: 1.2, aoe: 3.5, unblockable: true, parryable: false, cd: 5, element: 2 },
    ],
  },
  golem: {
    name: 'Crystal Golem', kind: 'human', hp: 220, poise: 120, dmg: 24, speed: 2.8, walk: 1.2, reach: 3, sight: 22, xp: 70, radius: 0.9, height: 3.0, armor: 0.35, weak: 2,
    rig: { build: 'golem', hairStyle: 'none', colors: { skin: 0x6a6a8a, cloth: 0x4a4a6a, cloth2: 0x3a3a55, leather: 0x2a2a40, metal: 0x88ccff }, glowEyes: 0x7fe8ff, bareArms: true, scale: 1.55, pauldrons: false },
    drops: [['crystal', 2, 4, 1], ['stone', 2, 3, 0.8], ['starShard', 1, 2, 0.4]],
    attacks: [
      { name: 'punch', clip: 'slash2', range: [0, 3.4], windup: 0.8, active: 0.2, recover: 0.8, dmg: 1, arc: 1.4, reach: 3.5, lunge: 2, parryable: true, heavy: true, cd: 2 },
      { name: 'slam', clip: 'castBig', range: [0, 4.5], windup: 1.3, active: 0.2, recover: 1.3, dmg: 1.6, aoe: 4.8, unblockable: true, parryable: false, heavy: true, cd: 5.5 },
    ],
  },
  wraith: {
    name: 'Star Wraith', kind: 'human', hp: 75, poise: 30, dmg: 13, speed: 6, walk: 2, reach: 2.4, sight: 26, xp: 30, radius: 0.45, height: 1.9,
    rig: { build: 'wraith', robe: 0x2a2450, hood: 0x1a1640, hairStyle: 'none', colors: { skin: 0x1a1830, cloth: 0x2a2450, cloth2: 0x1a1640 }, glowEyes: 0xa0e0ff, weapon: 'sword', weaponOpts: { bladeColor: 0x9fd8ff, glow: 0x9fd8ff, length: 1.0, curve: true } },
    drops: [['crystal', 1, 2, 0.7], ['starShard', 1, 1, 0.3]],
    attacks: [
      { name: 'rend', clip: 'slash1', range: [0, 2.6], windup: 0.35, active: 0.14, recover: 0.45, dmg: 1, arc: 1.5, reach: 2.6, lunge: 3, parryable: true, cd: 1.0, combo: 'slash2' },
      { name: 'blink', clip: 'thrust', range: [4, 10], windup: 0.5, active: 0.2, recover: 0.7, dmg: 1.3, arc: 0.7, reach: 2.8, blink: true, parryable: true, cd: 4 },
    ],
  },
};

// ---------------------------------------------------------------------------
export class Enemy {
  constructor(type, x, z, opts = {}) {
    if (!CLIPS) CLIPS = buildCombatClips();
    const def = (this.def = typeof type === 'string' ? ENEMY_TYPES[type] : type);
    this.type = typeof type === 'string' ? type : def.id;
    this.name = def.name;
    const lvl = opts.level || 1;
    this.level = lvl;
    this.maxHp = Math.round(def.hp * (1 + (lvl - 1) * 0.35));
    this.hp = this.maxHp;
    this.hpShown = this.hp;
    this.maxPoise = def.poise;
    this.poise = def.poise;
    this.radius = def.radius;
    this.height = def.height;
    this.pos = new THREE.Vector3(x, G.terrain.heightAt(x, z), z);
    this.home = this.pos.clone();
    this.vel = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.state = 'idle';
    this.stateT = 0;
    this.cd = {};
    this.attack = null;
    this.status = { burn: 0, chill: 0, frozen: 0, shock: 0, slow: 0, fracture: 0 };
    this.dead = false;
    this.deadT = 0;
    this.flash = 0;
    this.camp = opts.camp || null;
    this.wanderT = 0;
    this.wanderTarget = this.pos.clone();
    this.staggered = false;
    this.pinned = 0;
    this.alertIcon = 0;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.lastHitBy = null;
    this.flying = !!def.flying;
    // visual
    if (def.kind === 'quad') this.rig = new QuadRig({ ...def.rig, uniqueMats: true });
    else if (def.kind === 'wisp') this.rig = new WispRig(def.rig);
    else {
      this.rig = new Rig({ ...def.rig, uniqueMats: true });
      if (def.rig.weapon) this.rig.setWeapon(def.rig.weapon, def.rig.weaponOpts || {});
      this.pose = newPose();
      this.tmpPose = newPose();
    }
    this.phase = Math.random() * 10;
    this.rig.addTo(G.scene);
    this.rig.root.position.copy(this.pos);
    this.resolveOut = {};
  }

  get boss() {
    return false;
  }

  remove() {
    this.rig.removeFrom(G.scene);
    this.removed = true;
  }

  distTo(p) {
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
  }
  faceToward(x, z, dt, rate = 6) {
    const target = Math.atan2(x - this.pos.x, z - this.pos.z);
    let d = target - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const s = rate * dt;
    this.yaw += Math.abs(d) < s ? d : Math.sign(d) * s;
    return Math.abs(d);
  }

  canSee(player) {
    if (player.dead || G.game?.peaceful) return false;
    const d = this.distTo(player.pos);
    let sight = this.def.sight;
    if (player.crouching) sight *= 0.5;
    if (G.atmo?.isNight) sight *= 0.75;
    if (this.state !== 'idle') sight *= 1.6;
    if (d > sight) return false;
    if (d < 4) return true;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dot = (dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw)) / d;
    return dot > -0.2 || d < sight * 0.35;
  }

  update(dt) {
    if (this.removed) return;
    const P = G.player;
    if (this.dead) {
      this.deadT += dt;
      this.animate(dt);
      if (this.deadT > 1.6 && !this.dissolved) {
        this.dissolved = true;
        G.fx?.dissolve(this.rig, this.def.burns ? 0xff9a5a : 0xbfe8ff);
        this.rig.setVisible(false);
      }
      if (this.deadT > 2.5) this.remove();
      return;
    }
    this.stateT += dt;
    for (const k in this.cd) this.cd[k] -= dt;
    this.tickStatus(dt);
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 6);
      this.rig.setFlash(this.flash, this.flashColor || 0xffffff);
    }
    this.alertIcon = Math.max(0, this.alertIcon - dt);
    this.hpShown += (this.hp - this.hpShown) * Math.min(1, dt * 6);
    // poise regen
    if (this.stateT > 2 && this.state !== 'stagger') this.poise = Math.min(this.maxPoise, this.poise + this.maxPoise * 0.25 * dt);
    if (this.status.frozen > 0 || this.pinned > 0) {
      this.pinned = Math.max(0, this.pinned - dt);
      this.animate(dt, true);
      return;
    }
    const slow = this.status.slow > 0 ? 0.4 : this.status.chill > 0 ? 0.7 : 1;
    const sdt = dt * slow;
    const dist = this.distTo(P.pos);
    switch (this.state) {
      case 'idle': {
        this.wanderT -= sdt;
        if (this.wanderT <= 0) {
          this.wanderT = 3 + Math.random() * 5;
          const a = Math.random() * Math.PI * 2, r = Math.random() * 8;
          this.wanderTarget.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
        }
        const dd = Math.hypot(this.wanderTarget.x - this.pos.x, this.wanderTarget.z - this.pos.z);
        if (dd > 0.8 && this.wanderT < 2.5) this.moveToward(this.wanderTarget.x, this.wanderTarget.z, this.def.walk, sdt);
        else this.brake(sdt);
        if (this.canSee(P)) this.setAlert();
        break;
      }
      case 'alert': {
        this.brake(sdt);
        this.faceToward(P.pos.x, P.pos.z, sdt, 8);
        if (this.stateT > 0.55) this.setState('combat');
        break;
      }
      case 'combat':
        this.combat(sdt, dist, P);
        break;
      case 'attack':
        this.updateAttack(sdt, P);
        break;
      case 'stagger':
        this.brake(sdt);
        if (this.stateT > this.staggerDur) {
          this.staggered = false;
          this.poise = this.maxPoise;
          this.setState('combat');
        }
        break;
      case 'return': {
        const dd = this.distTo(this.home);
        this.moveToward(this.home.x, this.home.z, this.def.speed * 0.7, sdt);
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.2 * sdt);
        if (dd < 2) this.setState('idle');
        if (this.canSee(P) && this.distTo(this.home) < 30) this.setState('combat');
        break;
      }
    }
    this.physics(sdt);
    this.animate(sdt);
  }

  setState(s) {
    if (this.state === 'attack' && s !== 'attack') G.combat?.releaseToken(this);
    this.state = s;
    this.stateT = 0;
  }
  setAlert() {
    this.setState('alert');
    this.alertIcon = 1.2;
    G.audio?.sfx(this.def.kind === 'quad' ? 'growl' : this.def.kind === 'wisp' ? 'wispAlert' : 'alert', { pos: this.pos });
    G.combat?.alertNearby(this);
  }

  combat(dt, dist, P) {
    if (P.dead || G.game?.peaceful) {
      this.setState('return');
      return;
    }
    const fromHome = this.distTo(this.home);
    if (fromHome > 55 && dist > 12) {
      this.setState('return');
      return;
    }
    if (dist > this.def.sight * 2.2) {
      this.setState('return');
      return;
    }
    this.faceToward(P.pos.x, P.pos.z, dt, this.def.kind === 'quad' ? 7 : 5);
    // choose attack
    const agg = DIFFICULTY[G.settings.difficulty]?.aggression || 1;
    if (this.stateT > 0.35 / agg) {
      const options = this.def.attacks.filter((a) => dist >= a.range[0] && dist <= a.range[1] && !(this.cd[a.name] > 0));
      if (options.length && G.combat?.requestToken(this)) {
        const a = options[Math.floor(Math.random() * options.length)];
        this.startAttack(a);
        return;
      }
    }
    // spacing
    const pref = this.def.ranged ? this.def.keep : this.def.reach * 0.85;
    const waiting = G.combat && !G.combat.hasToken(this) && G.combat.tokensFull();
    const want = waiting && !this.def.ranged ? pref + 2.5 : pref;
    if (dist > want + 1) this.moveToward(P.pos.x, P.pos.z, dist > 10 ? this.def.speed : this.def.speed * 0.6, dt);
    else if (dist < want - 1.5 && this.def.ranged) this.moveAway(P.pos, this.def.walk * 1.5, dt);
    else {
      // circle strafe
      if (Math.random() < dt * 0.3) this.strafeDir *= -1;
      const a = Math.atan2(this.pos.x - P.pos.x, this.pos.z - P.pos.z) + this.strafeDir * 0.6;
      const tx = P.pos.x + Math.sin(a) * want, tz = P.pos.z + Math.cos(a) * want;
      this.moveToward(tx, tz, this.def.walk, dt, true);
      this.faceToward(P.pos.x, P.pos.z, dt, 6);
    }
  }

  startAttack(a) {
    this.attack = { def: a, t: 0, phase: 'windup', hit: false, clip: a.clip ? CLIPS[a.clip] : null };
    this.setState('attack');
    this.cd[a.name] = a.cd * (0.8 + Math.random() * 0.4);
    // telegraph: glint colour tells the player whether to parry or dodge
    const head = _v.set(this.pos.x, this.pos.y + this.height * 0.9, this.pos.z);
    G.combat?.glint(head, a.parryable === false ? 'red' : 'gold', this);
    if (a.aoe) {
      const tx = this.pos.x + Math.sin(this.yaw) * (a.aoeOffset || 0), tz = this.pos.z + Math.cos(this.yaw) * (a.aoeOffset || 0);
      this.attack.decal = G.fx?.telegraph(tx, G.terrain.heightAt(tx, tz), tz, a.aoe, a.windup, 0xff4422);
      this.attack.aoeAt = new THREE.Vector3(tx, 0, tz);
    }
  }

  updateAttack(dt, P) {
    const at = this.attack;
    const a = at.def;
    at.t += dt;
    if (at.phase === 'windup') {
      this.brake(dt);
      if (!a.blink) this.faceToward(P.pos.x, P.pos.z, dt, at.t < a.windup * 0.7 ? 5 : 1.2);
      if (at.t >= a.windup) {
        at.phase = 'active';
        at.t = 0;
        if (a.blink) {
          // teleport behind/side of player
          const ang = Math.atan2(this.pos.x - P.pos.x, this.pos.z - P.pos.z) + Math.PI * (0.6 + Math.random() * 0.8);
          G.fx?.motes(this.pos.x, this.pos.y, this.pos.z, 20, 0x9fd8ff);
          this.pos.x = P.pos.x + Math.sin(ang) * 2;
          this.pos.z = P.pos.z + Math.cos(ang) * 2;
          this.pos.y = G.terrain.heightAt(this.pos.x, this.pos.z);
          this.yaw = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
          G.fx?.motes(this.pos.x, this.pos.y, this.pos.z, 20, 0x9fd8ff);
          G.audio?.sfx('blink', { pos: this.pos });
        }
        if (a.lunge) {
          this.vel.x = Math.sin(this.yaw) * a.lunge;
          this.vel.z = Math.cos(this.yaw) * a.lunge;
        }
        if (a.projectile) {
          const from = new THREE.Vector3(this.pos.x + Math.sin(this.yaw) * 0.6, this.pos.y + this.height * 0.75, this.pos.z + Math.cos(this.yaw) * 0.6);
          const to = new THREE.Vector3(P.pos.x, P.pos.y + 1.1, P.pos.z);
          G.combat?.spawnProjectile({ from, to, owner: this, dmg: this.dmg() * a.dmg, ...a.projectile, parryable: a.parryable !== false, hostile: true });
          at.hit = true;
        }
        G.audio?.sfx(this.def.kind === 'quad' ? 'bite' : a.heavy ? 'swingHeavy' : 'swing', { pos: this.pos, pitch: 0.8 });
      }
    } else if (at.phase === 'active') {
      if (a.lunge) {
        this.vel.x *= 0.92;
        this.vel.z *= 0.92;
      }
      if (!at.hit) {
        if (a.aoe) {
          const c = at.aoeAt || this.pos;
          G.fx?.shockwave(c.x, G.terrain.heightAt(c.x, c.z) + 0.1, c.z, a.aoe, a.element === 2 ? 0xc39bff : a.element === 0 ? 0xff7a2a : 0xffffff);
          if (a.element !== undefined) G.fx?.elementBurst(c.x, G.terrain.heightAt(c.x, c.z) + 0.5, c.z, a.element, 0.8);
          G.cam?.shake(0.3);
          G.audio?.sfx('slam', { pos: c });
          if (Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < a.aoe + P.radius && Math.abs(P.pos.y - this.pos.y) < 2.5) {
            const r = P.receiveAttack(this.dmg() * a.dmg, this, { parryable: false, unblockable: true, heavy: true, knock: 8 });
            if (r === 'hit' && a.element !== undefined) G.combat?.applyElementToPlayer(a.element);
          }
          at.hit = true;
        } else {
          const d = this.distTo(P.pos);
          const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z;
          const ang = Math.acos(Math.max(-1, Math.min(1, (dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw)) / (d || 1))));
          if (d < a.reach + P.radius && ang < (a.arc || 1.2) && Math.abs(P.pos.y - this.pos.y) < 2.2) {
            const r = P.receiveAttack(this.dmg() * a.dmg, this, { parryable: a.parryable !== false, unblockable: a.unblockable, heavy: a.heavy });
            at.hit = true;
            if (r === 'hit' && (a.element !== undefined || this.def.burns)) G.combat?.applyElementToPlayer(a.element ?? 0, 0.3);
            if (r === 'hit') G.audio?.sfx('hitFlesh', { pos: P.pos });
          }
        }
      }
      if (at.t >= a.active) {
        at.phase = 'recover';
        at.t = 0;
        if (at.decal) at.decal.kill = true;
      }
    } else {
      this.brake(dt);
      if (at.t >= a.recover) {
        if (a.combo && Math.random() < 0.6 && this.distTo(P.pos) < a.reach + 1) {
          const nxt = { ...a, name: a.name + '_c', clip: a.combo, combo: null, windup: a.windup * 0.6, cd: 0 };
          this.startAttack(nxt);
          return;
        }
        this.attack = null;
        this.setState('combat');
      }
    }
  }

  dmg() {
    return this.def.dmg * (1 + (this.level - 1) * 0.25);
  }

  moveToward(x, z, speed, dt, noFace) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const tvx = (dx / d) * speed, tvz = (dz / d) * speed;
    this.vel.x += (tvx - this.vel.x) * Math.min(1, dt * 6);
    this.vel.z += (tvz - this.vel.z) * Math.min(1, dt * 6);
    if (!noFace) this.faceToward(x, z, dt, 6);
  }
  moveAway(p, speed, dt) {
    const dx = this.pos.x - p.x, dz = this.pos.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    this.vel.x += ((dx / d) * speed - this.vel.x) * Math.min(1, dt * 5);
    this.vel.z += ((dz / d) * speed - this.vel.z) * Math.min(1, dt * 5);
  }
  brake(dt) {
    const k = Math.pow(0.0001, dt);
    this.vel.x *= k;
    this.vel.z *= k;
  }

  physics(dt) {
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    // separation from other enemies
    for (const o of G.enemies) {
      if (o === this || o.dead) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
      const d = Math.hypot(dx, dz);
      const min = this.radius + o.radius;
      if (d < min && d > 1e-4) {
        const push = (min - d) * 0.5;
        this.pos.x += (dx / d) * push;
        this.pos.z += (dz / d) * push;
      }
    }
    // keep off the player
    const P = G.player;
    {
      const dx = this.pos.x - P.pos.x, dz = this.pos.z - P.pos.z;
      const d = Math.hypot(dx, dz);
      const min = this.radius + P.radius;
      if (d < min && d > 1e-4 && Math.abs(P.pos.y - this.pos.y) < 1.5) {
        this.pos.x += (dx / d) * (min - d);
        this.pos.z += (dz / d) * (min - d);
      }
    }
    const before = this.pos.clone();
    G.collision.resolve(this.pos, this.radius, this.height, 0.5, this.resolveOut);
    const g = G.collision.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6, this.radius);
    let gh = g.h;
    if (this.flying) gh = Math.max(gh, (G.water?.level ?? -99) + 0.5);
    else if (G.water && G.water.level > gh + 0.8) {
      // enemies avoid deep water: push back
      this.pos.copy(before).addScaledVector(this.vel, -dt * 2);
      this.vel.multiplyScalar(-0.3);
      gh = G.collision.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6, this.radius).h;
    }
    // steep slopes block
    if (!this.flying && !g.col) {
      const n = G.terrain.normalAt(this.pos.x, this.pos.z, _v);
      if (n.y < 0.6 && gh > this.pos.y + 0.3) {
        this.pos.x = before.x - this.vel.x * dt;
        this.pos.z = before.z - this.vel.z * dt;
        gh = G.terrain.heightAt(this.pos.x, this.pos.z);
      }
    }
    if (this.pos.y > gh + 0.05 && !this.flying) {
      this.vy = (this.vy || 0) - 24 * dt;
      this.pos.y = Math.max(gh, this.pos.y + this.vy * dt);
    } else {
      this.vy = 0;
      this.pos.y += (gh - this.pos.y) * Math.min(1, dt * (this.flying ? 4 : 20));
    }
  }

  tickStatus(dt) {
    const s = this.status;
    if (s.burn > 0) {
      s.burn -= dt;
      this.burnTick = (this.burnTick || 0) + dt;
      if (this.burnTick > 0.5) {
        this.burnTick = 0;
        G.combat?.damageEnemy(this, 4 + this.maxHp * 0.015, { dot: true, el: -1, color: '#ff9a4a', noFlinch: true });
      }
      if (Math.random() < dt * 20) G.fx?.fire(this.pos.x + (Math.random() - 0.5) * 0.5, this.pos.y + Math.random() * this.height, this.pos.z + (Math.random() - 0.5) * 0.5, 0.6);
    }
    if (s.frozen > 0) {
      s.frozen -= dt;
      if (s.frozen <= 0) {
        this.rig.setFlash(0);
        G.fx?.elementBurst(this.pos.x, this.pos.y + 1, this.pos.z, 1, 0.5);
      } else this.rig.setFlash(0.35, 0x66ccff);
    }
    if (s.chill > 0) s.chill -= dt;
    if (s.shock > 0) {
      s.shock -= dt;
      if (Math.random() < dt * 10) G.fx?.sparks(this.pos.x, this.pos.y + Math.random() * this.height, this.pos.z, 3, 0xc39bff, 4);
    }
    if (s.slow > 0) s.slow -= dt;
    if (s.fracture > 0) s.fracture -= dt;
  }

  stagger(dur = 1.2, broken = false) {
    if (this.dead) return;
    G.combat?.releaseToken(this);
    if (this.attack?.decal) this.attack.decal.kill = true;
    this.attack = null;
    this.staggered = broken;
    this.staggerDur = dur;
    this.setState('stagger');
    this.vel.multiplyScalar(0.2);
  }

  die(killer) {
    this.dead = true;
    this.deadT = 0;
    G.combat?.releaseToken(this);
    if (this.attack?.decal) this.attack.decal.kill = true;
    G.audio?.sfx(this.def.kind === 'quad' ? 'whimper' : 'enemyDie', { pos: this.pos });
    if (killer === G.player) {
      G.player.gainXP(this.def.xp * this.level);
      G.loot?.dropFrom(this);
      G.game?.onEnemyKilled(this);
    }
    if (G.player.lockTarget === this) G.combat?.nextLock(true);
  }

  animate(dt, frozen) {
    const rig = this.rig;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (frozen) {
      if (rig.apply && this.pose) rig.apply(this.pose);
      return;
    }
    if (this.def.kind === 'quad') {
      let st = speed > 0.3 ? 'move' : 'idle';
      let u = 0;
      if (this.dead) { st = 'dead'; u = this.deadT * 2; }
      else if (this.state === 'attack' && this.attack) {
        const a = this.attack;
        if (a.phase === 'windup') { st = 'windup'; u = Math.min(1, a.t / a.def.windup); }
        else if (a.phase === 'active') { st = 'attack'; u = Math.min(1, a.t / Math.max(0.2, a.def.active)); }
      } else if (this.state === 'stagger') { st = 'stagger'; u = this.stateT / this.staggerDur; }
      rig.animate(dt, speed, st, u);
    } else if (this.def.kind === 'wisp') {
      let st = 'idle', u = 0;
      if (this.dead) { st = 'dead'; u = this.deadT; }
      else if (this.state === 'attack' && this.attack?.phase === 'windup') { st = 'windup'; u = this.attack.t / this.attack.def.windup; }
      rig.animate(dt, speed, st, u);
    } else {
      const P = this.pose;
      const combat = this.state !== 'idle' && this.state !== 'return';
      if (this.dead) Anim.dead(P, this.deadT * 1.6);
      else if (this.state === 'stagger') {
        Anim.stagger(P, this.stateT / this.staggerDur, 1);
        if (this.staggered) Anim.stagger(P, Math.min(0.5, this.stateT), 1);
      } else {
        if (speed > 0.2) {
          this.phase += (speed / (speed > 3 ? 1.7 : 1.1)) * dt * Math.PI;
          Anim.locomote(P, this.phase, speed / 8, G.time, { armed: true, lean: this.def.rig.build === 'husk' ? 0.25 : 0 });
        } else Anim.idle(P, G.time + this.phase, combat);
        if (this.def.rig.build === 'husk') {
          P[3] += 0.3;
          P[12] -= 0.2;
        }
        if (this.state === 'attack' && this.attack?.clip) {
          const a = this.attack;
          const h = CLIP_HIT[a.def.clip] || [0.15, 0.3];
          const clip = a.clip;
          let ct;
          if (a.phase === 'windup') ct = (a.t / a.def.windup) * h[0];
          else if (a.phase === 'active') ct = h[0] + (a.t / Math.max(0.05, a.def.active)) * (h[1] - h[0]);
          else ct = h[1] + (a.t / a.def.recover) * (clip.duration - h[1]);
          clip.sample(ct, this.tmpPose);
          const full = a.def.clip === 'heavy' || a.def.clip === 'castBig' || a.def.clip === 'slash3' || a.def.clip === 'thrust';
          if (full) blendPose(P, P, this.tmpPose, 1);
          else blendUpper(P, this.tmpPose, 1);
          // windup shake = readable telegraph
          if (a.phase === 'windup' && a.t > a.def.windup * 0.6) P[3 * 1 + 1] += Math.sin(G.time * 40) * 0.03;
        }
      }
      rig.apply(P);
      if (rig.robe) rig.robe.rotation.x = -Math.min(0.4, speed * 0.05);
    }
    rig.root.position.copy(this.pos);
    rig.root.rotation.y = this.yaw;
    if (this.flying) rig.root.position.y += 0.4;
    if (rig.updateCape) rig.updateCape(dt, { x: 0, y: 0 }, 0);
  }
}

// ---------------------------------------------------------------------------
// Spawner: camps per epoch, activated near the player, cleared until rest.
// ---------------------------------------------------------------------------
export class Spawner {
  constructor(camps) {
    this.camps = camps.map((c, i) => ({ ...c, id: c.id || 'camp' + i, cleared: false, active: false, enemies: [] }));
    this.timer = 0;
  }
  update(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    const P = G.player.pos;
    const ep = G.epochs.current;
    if (G.game?.inPocket) return;
    for (const c of this.camps) {
      const inEpoch = c.epochs.includes(ep) && (!c.cond || c.cond());
      const d = Math.hypot(P.x - c.x, P.z - c.z);
      if (!c.active && inEpoch && !c.cleared && d < 150 && !G.epochs.shifting) {
        c.active = true;
        const n = c.count;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + Math.random();
          const r = 2 + Math.random() * (c.r || 6);
          const t = c.types[i % c.types.length];
          const e = new Enemy(t, c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, { camp: c, level: c.level || 1 });
          c.enemies.push(e);
          G.enemies.push(e);
        }
      } else if (c.active && (d > 200 || !inEpoch)) {
        this.despawn(c);
      }
      if (c.active && c.enemies.length && c.enemies.every((e) => e.dead)) {
        if (!c.cleared) {
          c.cleared = true;
          G.game?.onCampCleared(c);
        }
      }
    }
  }
  despawn(c) {
    for (const e of c.enemies) if (!e.removed) {
      if (!e.dead) e.remove();
      const i = G.enemies.indexOf(e);
      if (i >= 0) G.enemies.splice(i, 1);
    }
    c.enemies = [];
    c.active = false;
  }
  resetAll() {
    for (const c of this.camps) {
      this.despawn(c);
      c.cleared = false;
    }
  }
  despawnAll() {
    for (const c of this.camps) this.despawn(c);
  }
}
