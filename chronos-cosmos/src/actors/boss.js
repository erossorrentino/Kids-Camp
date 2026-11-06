import * as THREE from 'three';
import { VLight } from '../core/lights.js';
import { G } from '../core/G.js';
import { Rig, Anim, newPose, blendPose, blendUpper, buildCombatClips, makeClip, setJ, addJ } from './rig.js';
import { DIFFICULTY } from './player.js';
import { Enemy } from './enemies.js';

const _v = new THREE.Vector3();
let CLIPS = null;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const FOG_FRAG = `uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
void main(){ float a = n(vec2(vUv.x * 40.0 + uTime * 0.3, vUv.y * 4.0 - uTime * 0.5)) * 0.6 + n(vec2(vUv.x * 90.0 - uTime * 0.2, vUv.y * 9.0)) * 0.4;
  float fade = smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.5, 1.0, vUv.y));
  gl_FragColor = vec4(uColor * (1.0 + a), a * fade * 0.75); }`;

// ---------------------------------------------------------------------------
// Boss definitions
// ---------------------------------------------------------------------------
const BOSSES = {
  varok: {
    name: 'Varok', title: 'Varok, the Gilded Sentinel', epoch: 0, shard: 'shardDawn', hp: 1500, poise: 260, dmg: 24, speed: 4.2, scale: 2.9, radius: 1.6, xp: 600,
    rig: { build: 'knight', helm: true, plume: 0xcc2a2a, colors: { skin: 0xd8b060, cloth: 0x8a6a2a, cloth2: 0x6a5020, leather: 0x4a3a18, metal: 0xf0d070 }, glowEyes: 0x7fe8ff, weapon: 'greatsword', weaponOpts: { color: 0xf0d890, glow: 0x7fe8ff, scale: 1 }, cape: 0x8a1a1a },
    arena: () => G.content.colosseum, arenaR: 29, fog: 0xffd890,
    moves1: ['sweep', 'overhead', 'thrust', 'combo'],
    moves2: ['sweep', 'overhead', 'spears', 'leap', 'whirl', 'combo'],
    lines: ['None pass the Gilded Ring.', 'The Heart’s light is mine to guard!'],
  },
  morgrath: {
    name: 'Morgrath', title: 'Morgrath, the Ember Tyrant', epoch: 1, shard: 'shardEmber', hp: 1900, poise: 320, dmg: 28, speed: 3.6, scale: 3.4, radius: 2.0, xp: 800, weak: 1,
    rig: { build: 'golem', hairStyle: 'none', bareArms: true, pauldrons: false, colors: { skin: 0x2a1a14, cloth: 0x1a1210, cloth2: 0x140e0c, leather: 0x1a1210, metal: 0xff5a1a }, glowEyes: 0xffaa22 },
    arena: () => G.content.crater, arenaR: 38, fog: 0xff6a2a, lava: true,
    moves1: ['punch', 'pound', 'breath', 'charge'],
    moves2: ['punch', 'pound', 'breath', 'meteors', 'charge', 'meteors'],
    lines: ['Burn. Everything burns.', 'I am what is left when the fire forgets to stop!'],
  },
  nyxara: {
    name: 'Nyxara', title: 'Nyxara, the Void Herald', epoch: 2, shard: 'shardStar', hp: 1700, poise: 220, dmg: 24, speed: 5, scale: 2.1, radius: 1.2, xp: 900, weak: 2, hover: 1.4,
    rig: { build: 'wraith', robe: 0x1a1440, hood: 0x2a1a5a, hairStyle: 'none', colors: { skin: 0x0a0820, cloth: 0x2a1a5a, cloth2: 0x1a1440 }, glowEyes: 0xc8a8ff, weapon: 'staff', weaponOpts: { color: 0x2a2a4a, gem: 0xc39bff }, cape: 0x3a2a8a, capeEmissive: 0x4a2aaa },
    arena: () => { const a = G.content.astral.isles.find((i) => i.arena); return { x: a.x, z: a.z, y: a.y }; }, arenaR: 21, fog: 0xa080ff,
    moves1: ['orbs', 'beam', 'blink', 'starfall'],
    moves2: ['orbs', 'beam', 'blink', 'starfall', 'summon', 'gravity'],
    lines: ['The stars do not need you, little moment.', 'Fall upward into the dark!'],
  },
  chronarch: {
    name: 'The Chronarch', title: 'Vaelith, the Chronarch', epoch: -1, hp: 2600, poise: 300, dmg: 26, speed: 6, scale: 1.55, radius: 0.8, xp: 2000,
    rig: { build: 'knight', helm: true, plume: 0xffe08a, colors: { skin: 0xe8d8c0, cloth: 0xe8dcc0, cloth2: 0xc8b890, leather: 0x8a7050, metal: 0xffe08a }, glowEyes: 0xffffff, weapon: 'sword', weaponOpts: { length: 1.4, bladeColor: 0xfff0c0, glow: 0xffd86b, curve: true }, cape: 0xf0e8d0, capeEmissive: 0xffd08a },
    arena: () => G.content.spire, arenaR: 18.5, fog: 0xffe08a,
    moves1: ['duel', 'duel', 'dash', 'thrust'],
    moves2: ['duel', 'dash', 'pound', 'meteors', 'thrust'],
    moves3: ['duel', 'orbs', 'beam', 'blink', 'timestop', 'starfall'],
    lines: ['You should not have come back, Timeborn.', 'Let me show you what it costs to hold the hours.'],
  },
};

// Move library: timings + behaviour callbacks.
const MOVES = {
  sweep: { range: [0, 8], windup: 0.9, active: 0.25, recover: 0.9, clip: 'heavy', parryable: true },
  overhead: { range: [0, 9], windup: 1.1, active: 0.2, recover: 1.1, clip: 'slash3', unblockable: true },
  thrust: { range: [4, 16], windup: 0.8, active: 0.35, recover: 1.0, clip: 'thrust', parryable: true },
  combo: { range: [0, 7], windup: 0.7, active: 0.2, recover: 0.4, clip: 'slash1', parryable: true, chain: ['overhead'] },
  spears: { range: [0, 30], windup: 0.8, active: 1.6, recover: 0.8, clip: 'castBig', magic: true },
  leap: { range: [6, 26], windup: 0.7, active: 1.1, recover: 1.2, clip: 'castBig', unblockable: true },
  whirl: { range: [0, 12], windup: 0.8, active: 2.2, recover: 1.2, clip: 'spin', unblockable: true },
  punch: { range: [0, 8], windup: 0.85, active: 0.25, recover: 0.9, clip: 'slash2', parryable: true },
  pound: { range: [0, 10], windup: 1.3, active: 0.3, recover: 1.3, clip: 'castBig', unblockable: true },
  breath: { range: [3, 16], windup: 1.0, active: 1.8, recover: 1.0, clip: 'cast', magic: true },
  meteors: { range: [0, 40], windup: 1.0, active: 2.0, recover: 0.8, clip: 'castBig', magic: true },
  charge: { range: [8, 30], windup: 0.9, active: 1.2, recover: 1.2, clip: 'thrust', unblockable: true },
  orbs: { range: [0, 30], windup: 0.8, active: 0.8, recover: 0.8, clip: 'cast', magic: true },
  beam: { range: [0, 25], windup: 1.2, active: 2.0, recover: 0.9, clip: 'cast', magic: true },
  blink: { range: [3, 25], windup: 0.5, active: 0.3, recover: 0.8, clip: 'thrust', parryable: true },
  starfall: { range: [0, 30], windup: 0.9, active: 1.8, recover: 0.8, clip: 'castBig', magic: true },
  summon: { range: [0, 40], windup: 1.2, active: 0.2, recover: 1.0, clip: 'castBig', magic: true },
  gravity: { range: [0, 20], windup: 1.6, active: 0.4, recover: 1.2, clip: 'castBig', unblockable: true },
  duel: { range: [0, 4.5], windup: 0.45, active: 0.15, recover: 0.3, clip: 'slash1', parryable: true, chain: ['duel2', 'duel3'] },
  duel2: { range: [0, 5], windup: 0.3, active: 0.15, recover: 0.3, clip: 'slash2', parryable: true },
  duel3: { range: [0, 5], windup: 0.55, active: 0.2, recover: 0.8, clip: 'slash3', parryable: true },
  dash: { range: [5, 20], windup: 0.4, active: 0.4, recover: 0.6, clip: 'thrust', parryable: true },
  timestop: { range: [0, 30], windup: 1.4, active: 0.3, recover: 1.0, clip: 'castBig', magic: true },
};

export class Boss {
  constructor(id) {
    if (!CLIPS) CLIPS = buildCombatClips();
    const d = (this.def = BOSSES[id]);
    this.id = id;
    this.name = d.name;
    this.title = d.title;
    const diff = DIFFICULTY[G.settings.difficulty] || DIFFICULTY.balanced;
    this.maxHp = Math.round(d.hp * (G.settings.difficulty === 'story' ? 0.7 : G.settings.difficulty === 'hard' ? 1.25 : 1));
    this.hp = this.maxHp;
    this.hpShown = this.hp;
    this.maxPoise = d.poise;
    this.poise = d.poise;
    this.radius = d.radius;
    this.height = 1.8 * d.scale;
    const a = d.arena();
    this.arena = { x: a.x, z: a.z, y: a.y ?? G.terrain.heightAt(a.x, a.z), r: d.arenaR };
    this.pos = V(this.arena.x, this.arena.y, this.arena.z - d.arenaR * 0.45);
    this.vel = V(0, 0, 0);
    this.yaw = 0;
    this.status = { burn: 0, chill: 0, frozen: 0, shock: 0, slow: 0, fracture: 0 };
    this.state = 'idle';
    this.stateT = 0;
    this.phase = 1;
    this.move = null;
    this.dead = false;
    this.boss = true;
    this.def.kind = 'human';
    this.def.armor = 0.1;
    this.flash = 0;
    this.staggered = false;
    this.cdT = 0;
    this.rig = new Rig({ ...d.rig, scale: d.scale, uniqueMats: true });
    if (d.rig.weapon) this.rig.setWeapon(d.rig.weapon, d.rig.weaponOpts || {});
    if (d.lava) for (const m of this.rig.materials) { m.emissive.setHex(0xff4a10); m.emissiveIntensity = 0.35; this.lavaMats = this.rig.materials; }
    this.pose = newPose();
    this.tmp = newPose();
    this.rig.addTo(G.scene);
    this.rig.root.position.copy(this.pos);
    this.aura = new VLight(d.fog, 0, 20, 2);
    this.rig.root.add(this.aura);
    this.level = 1;
    this.resolveOut = {};
    this.walkPhase = 0;
  }

  get type() { return this.id; }

  distTo(p) { return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }
  setAlert() {}
  setState(s) { this.state = s; this.stateT = 0; }
  stagger(dur = 2.5, broken = false) {
    if (this.dead || this.state === 'phase') return;
    if (this.move?.decals) for (const dd of this.move.decals) dd.kill = true;
    this.move = null;
    this.staggered = broken;
    this.staggerDur = broken ? dur : Math.min(dur, 0.7);
    this.setState('stagger');
    if (broken) G.audio?.sfx('bossStagger', { pos: this.pos });
  }
  dmg() { return this.def.dmg * (this.phase >= 2 ? 1.15 : 1); }

  die(killer) {
    this.dead = true;
    this.deadT = 0;
    G.audio?.sfx('bossDie', { pos: this.pos });
    G.slowmo(0.2, 1.5);
    G.cam.shake(0.8);
    G.player.lockTarget = null;
    G.bosses.onBossDefeated(this);
  }
  remove() {
    this.rig.removeFrom(G.scene);
    this.removed = true;
  }

  faceToward(x, z, dt, rate = 3) {
    const target = Math.atan2(x - this.pos.x, z - this.pos.z);
    let d = target - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const s = rate * dt;
    this.yaw += Math.abs(d) < s ? d : Math.sign(d) * s;
    return Math.abs(d);
  }

  update(dt) {
    if (this.removed) return;
    const P = G.player;
    this.hpShown += (this.hp - this.hpShown) * Math.min(1, dt * 5);
    if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 6); this.rig.setFlash(this.flash, 0xffffff); }
    else if (this.lavaMats) for (const m of this.lavaMats) { m.emissive.setHex(0xff4a10); m.emissiveIntensity = 0.35 + (this.phase >= 2 ? 0.4 : 0) + Math.sin(G.time * 3) * 0.1; }
    this.aura.intensity = this.phase >= 2 ? 8 + Math.sin(G.time * 6) * 3 : 0;
    if (this.dead) {
      this.deadT += dt;
      Anim.dead(this.pose, this.deadT * 0.8);
      this.rig.apply(this.pose);
      if (this.deadT > 1.5 && !this.dissolved) {
        this.dissolved = true;
        for (let i = 0; i < 6; i++) G.after(i * 0.15, () => G.fx.dissolve(this.rig, this.def.fog));
      }
      if (this.deadT > 2.6) { this.rig.setVisible(false); this.remove(); }
      return;
    }
    this.stateT += dt;
    this.tickStatus(dt);
    const slow = this.status.slow > 0 ? 0.55 : this.status.chill > 0 ? 0.8 : 1;
    const sdt = this.status.frozen > 0 ? 0 : dt * slow;
    // phase transitions
    const f = this.hp / this.maxHp;
    const want = this.def.moves3 ? (f < 0.34 ? 3 : f < 0.67 ? 2 : 1) : f < 0.5 ? 2 : 1;
    if (want > this.phase && this.state !== 'phase') {
      this.phase = want;
      this.startPhase();
    }
    switch (this.state) {
      case 'idle': break;
      case 'combat': this.combat(sdt, P); break;
      case 'move': this.updateMove(sdt, P); break;
      case 'stagger':
        if (this.stateT > this.staggerDur) { this.staggered = false; this.poise = this.maxPoise; this.setState('combat'); }
        break;
      case 'phase':
        if (this.stateT > 2.2) { this.invuln = false; this.setState('combat'); }
        break;
    }
    // keep inside the arena, hovering bosses float
    const dx = this.pos.x - this.arena.x, dz = this.pos.z - this.arena.z;
    const dr = Math.hypot(dx, dz);
    if (dr > this.arena.r - this.radius) { this.pos.x = this.arena.x + (dx / dr) * (this.arena.r - this.radius); this.pos.z = this.arena.z + (dz / dr) * (this.arena.r - this.radius); }
    const gh = G.collision.groundAt(this.pos.x, this.pos.z, this.pos.y + 2, this.radius, 3).h;
    const hover = this.def.hover ? this.def.hover + Math.sin(G.time * 1.5) * 0.3 : 0;
    if (!this.airborne) this.pos.y += (gh + hover - this.pos.y) * Math.min(1, dt * 10);
    this.animate(sdt);
  }

  startPhase() {
    this.state = 'phase';
    this.stateT = 0;
    this.invuln = true;
    if (this.move?.decals) for (const d of this.move.decals) d.kill = true;
    this.move = null;
    G.audio?.sfx('roar', { pos: this.pos });
    G.cam.shake(0.6);
    G.fx.shockwave(this.pos.x, this.pos.y + 0.2, this.pos.z, 10, this.def.fog);
    const line = this.def.lines[Math.min(this.def.lines.length - 1, this.phase - 1)];
    G.hud.toast(`<b>${this.name}</b> “${line}”`, 'boss');
    if (this.id === 'chronarch') {
      G.epochs.shift(this.phase === 2 ? 1 : 2, { force: true, center: this.pos, cooldown: 0 });
    }
    // knock the player back
    const P = G.player;
    const kx = P.pos.x - this.pos.x, kz = P.pos.z - this.pos.z, kl = Math.hypot(kx, kz) || 1;
    if (kl < 9) { P.vel.x += (kx / kl) * 10; P.vel.z += (kz / kl) * 10; }
  }

  tickStatus(dt) {
    const s = this.status;
    if (s.burn > 0) {
      s.burn -= dt;
      this.burnT = (this.burnT || 0) + dt;
      if (this.burnT > 0.5) { this.burnT = 0; G.combat.damageEnemy(this, 6, { dot: true, el: -1, color: '#ff9a4a', noFlinch: true }); }
      if (Math.random() < dt * 20) G.fx.fire(this.pos.x + (Math.random() - 0.5), this.pos.y + Math.random() * this.height, this.pos.z + (Math.random() - 0.5), 0.8);
    }
    if (s.frozen > 0) { s.frozen -= dt; this.rig.setFlash(0.35, 0x66ccff); if (s.frozen <= 0) this.rig.setFlash(0); }
    for (const k of ['chill', 'shock', 'slow', 'fracture']) if (s[k] > 0) s[k] -= dt;
  }

  combat(dt, P) {
    if (P.dead) return;
    const dist = this.distTo(P.pos);
    this.faceToward(P.pos.x, P.pos.z, dt, 3.5);
    this.cdT -= dt;
    const agg = DIFFICULTY[G.settings.difficulty]?.aggression || 1;
    if (this.cdT <= 0) {
      const list = this.phase === 3 ? this.def.moves3 : this.phase === 2 ? this.def.moves2 : this.def.moves1;
      const opts = list.filter((m) => dist >= MOVES[m].range[0] && dist <= MOVES[m].range[1] && m !== this.lastMove);
      if (opts.length) {
        const m = opts[Math.floor(Math.random() * opts.length)];
        this.startMove(m);
        return;
      }
    }
    // approach / strafe
    const ideal = 4 + this.radius;
    if (dist > ideal + 1) {
      const sp = this.def.speed * (this.phase >= 2 ? 1.2 : 1);
      this.vel.x += ((P.pos.x - this.pos.x) / dist * sp - this.vel.x) * Math.min(1, dt * 3);
      this.vel.z += ((P.pos.z - this.pos.z) / dist * sp - this.vel.z) * Math.min(1, dt * 3);
    } else {
      this.vel.multiplyScalar(Math.pow(0.05, dt));
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    void agg;
  }

  startMove(name) {
    const m = MOVES[name];
    this.lastMove = name;
    this.move = { name, def: m, t: 0, phase: 'windup', hit: false, decals: [], data: {} };
    this.setState('move');
    const head = V(this.pos.x, this.pos.y + this.height * 0.92, this.pos.z);
    if (m.parryable) G.combat.glint(head, 'gold', this);
    else if (m.unblockable) G.combat.glint(head, 'red', this);
    this.onWindup(name);
  }

  // ------------------------------------------------------------- behaviours
  onWindup(name) {
    const P = G.player;
    const mv = this.move;
    const gy = (x, z) => G.collision.groundAt(x, z, this.arena.y + 5, 0.5, 20).h;
    switch (name) {
      case 'pound':
        mv.decals.push(G.fx.telegraph(this.pos.x, gy(this.pos.x, this.pos.z), this.pos.z, 9.5, mv.def.windup, 0xff4422));
        break;
      case 'spears':
      case 'starfall':
      case 'meteors': {
        mv.data.spots = [];
        const n = name === 'meteors' ? 7 : name === 'spears' ? 6 : 8;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, r = i === 0 ? 0 : 2 + Math.random() * 9;
          let x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
          const ax = x - this.arena.x, az = z - this.arena.z, ar = Math.hypot(ax, az);
          if (ar > this.arena.r - 2) { x = this.arena.x + ax / ar * (this.arena.r - 2); z = this.arena.z + az / ar * (this.arena.r - 2); }
          const delay = mv.def.windup + i * (mv.def.active / n);
          mv.data.spots.push({ x, z, y: gy(x, z), t: delay, done: false, r: name === 'spears' ? 2.2 : 3 });
          mv.decals.push(G.fx.telegraph(x, gy(x, z), z, name === 'spears' ? 2.2 : 3, delay, name === 'starfall' ? 0xa080ff : name === 'spears' ? 0xffd860 : 0xff5a1a));
        }
        break;
      }
      case 'gravity':
        mv.decals.push(G.fx.telegraph(this.pos.x, gy(this.pos.x, this.pos.z), this.pos.z, 7, mv.def.windup + 0.4, 0xa080ff));
        break;
      case 'timestop':
        G.hud.toast('Time ripples outward. Dodge through it!', 'warn');
        break;
      case 'leap':
        mv.data.target = P.pos.clone();
        break;
    }
    G.audio?.sfx(mv.def.magic ? 'bossCast' : 'bossWindup', { pos: this.pos });
  }

  updateMove(dt, P) {
    const mv = this.move;
    const m = mv.def;
    mv.t += dt;
    const name = mv.name;
    if (mv.phase === 'windup') {
      if (!['beam', 'breath'].includes(name)) this.faceToward(P.pos.x, P.pos.z, dt, mv.t < m.windup * 0.75 ? 4 : 0.5);
      this.vel.multiplyScalar(Math.pow(0.01, dt));
      if (mv.t >= m.windup) {
        mv.phase = 'active';
        mv.t = 0;
        this.onActive(name, P);
      }
    } else if (mv.phase === 'active') {
      this.whileActive(name, P, dt, mv.t);
      if (mv.t >= m.active) {
        mv.phase = 'recover';
        mv.t = 0;
        this.airborne = false;
      }
    } else {
      this.vel.multiplyScalar(Math.pow(0.02, dt));
      if (mv.t >= m.recover * (this.phase >= 2 ? 0.75 : 1)) {
        if (m.chain && Math.random() < (this.phase >= 2 ? 0.85 : 0.6)) {
          const next = m.chain[0];
          const rest = m.chain.slice(1);
          this.startMove(next);
          if (rest.length) this.move.def = { ...MOVES[next], chain: rest };
          return;
        }
        this.move = null;
        this.cdT = (this.phase >= 2 ? 0.4 : 0.8) * (G.settings.difficulty === 'story' ? 1.8 : 1);
        this.setState('combat');
      }
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
  }

  meleeHit(reach, arc, mult, opts = {}) {
    const P = G.player;
    const d = this.distTo(P.pos);
    const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z;
    const ang = Math.acos(Math.max(-1, Math.min(1, (dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw)) / (d || 1))));
    if (d < reach + this.radius + P.radius && ang < arc && Math.abs(P.pos.y - this.pos.y) < 3.5) {
      const r = P.receiveAttack(this.dmg() * mult, this, { heavy: true, knock: 9, ...opts });
      if (r === 'hit') G.audio?.sfx('hitFlesh', { pos: P.pos });
      return r;
    }
    return null;
  }
  aoeHit(x, z, r, mult, opts = {}) {
    const P = G.player;
    if (Math.hypot(P.pos.x - x, P.pos.z - z) < r + P.radius && P.pos.y - G.terrain.heightAt(P.pos.x, P.pos.z) < (opts.jumpable ? 1.0 : 3.5)) {
      return P.receiveAttack(this.dmg() * mult, this, { parryable: false, unblockable: true, heavy: true, knock: 10, ...opts });
    }
    return null;
  }

  onActive(name, P) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const mv = this.move;
    const sc = this.def.scale;
    const swing = () => G.audio?.sfx('swingHeavy', { pos: this.pos, pitch: 0.6 });
    switch (name) {
      case 'sweep': swing(); this.meleeHit(6.5, 1.5, 1.0, { parryable: true }); break;
      case 'combo': case 'duel': case 'duel2': swing(); this.vel.set(fx * 6, 0, fz * 6); this.meleeHit(2.4 * sc + 1, 1.3, name.startsWith('duel') ? 0.7 : 0.9, { parryable: true }); break;
      case 'duel3': swing(); this.vel.set(fx * 8, 0, fz * 8); this.meleeHit(2.6 * sc + 1.2, 0.9, 1.1, { parryable: true }); break;
      case 'punch': swing(); this.vel.set(fx * 4, 0, fz * 4); this.meleeHit(6, 1.1, 1.0, { parryable: true }); break;
      case 'overhead': {
        swing();
        this.meleeHit(7.5, 0.5, 1.4, { unblockable: true, parryable: false });
        const sx = this.pos.x + fx * 6, sz = this.pos.z + fz * 6;
        G.fx.shockwave(sx, G.terrain.heightAt(sx, sz) + 0.2, sz, 4, 0xffd890);
        G.cam.shake(0.5);
        // travelling ground wave
        mv.data.wave = { x: sx, z: sz, dx: fx, dz: fz, t: 0, hit: false };
        G.audio?.sfx('slam', { pos: this.pos });
        break;
      }
      case 'thrust': case 'dash': case 'charge':
        this.vel.set(fx * (name === 'charge' ? 22 : 18), 0, fz * (name === 'charge' ? 22 : 18));
        swing();
        break;
      case 'blink': {
        const a = Math.atan2(this.pos.x - P.pos.x, this.pos.z - P.pos.z) + Math.PI + (Math.random() - 0.5) * 1.5;
        G.fx.motes(this.pos.x, this.pos.y, this.pos.z, 30, this.def.fog);
        this.pos.x = P.pos.x + Math.sin(a) * 3.2;
        this.pos.z = P.pos.z + Math.cos(a) * 3.2;
        this.yaw = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
        G.fx.motes(this.pos.x, this.pos.y, this.pos.z, 30, this.def.fog);
        G.audio?.sfx('blink', { pos: this.pos });
        this.meleeHit(3.5, 1.4, 1.0, { parryable: true });
        break;
      }
      case 'pound':
        G.fx.shockwave(this.pos.x, this.pos.y + 0.2, this.pos.z, 10, 0xff6a2a);
        G.fx.elementBurst(this.pos.x, this.pos.y + 0.5, this.pos.z, 0, 1.5);
        G.cam.shake(0.7);
        G.audio?.sfx('explosion', { pos: this.pos });
        this.aoeHit(this.pos.x, this.pos.z, 9.5, 1.3);
        if (this.phase >= 2 || this.id === 'morgrath') for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.random(); G.world.addFirePatch(this.pos.x + Math.cos(a) * 6, this.pos.z + Math.sin(a) * 6, 6, 2); }
        break;
      case 'leap':
        this.airborne = true;
        mv.data.from = this.pos.clone();
        mv.data.decal = G.fx.telegraph(mv.data.target.x, G.terrain.heightAt(mv.data.target.x, mv.data.target.z), mv.data.target.z, 6, m_def(this).active, 0xff4422);
        break;
      case 'orbs': {
        const n = this.phase >= 2 ? 7 : 5;
        for (let i = 0; i < n; i++) {
          const a = this.yaw + (i - (n - 1) / 2) * 0.35;
          const from = V(this.pos.x + Math.sin(a) * 1.5, this.pos.y + this.height * 0.7, this.pos.z + Math.cos(a) * 1.5);
          const to = V(P.pos.x + Math.sin(a) * 4, P.pos.y + 1, P.pos.z + Math.cos(a) * 4);
          G.after(i * 0.12, () => { if (!this.dead) G.combat.spawnProjectile({ from, to, owner: this, dmg: this.dmg() * 0.55, el: 2, color: 0xc39bff, size: 0.5, speed: 11, homing: 1.2, parryable: true, hostile: true, life: 6 }); });
        }
        G.audio?.sfx('wispAlert', { pos: this.pos });
        break;
      }
      case 'summon':
        for (let i = 0; i < 2; i++) {
          const a = this.yaw + (i ? 1.2 : -1.2);
          G.bosses.spawnAdd('wisp', this.pos.x + Math.sin(a) * 5, this.pos.z + Math.cos(a) * 5);
        }
        break;
      case 'gravity': {
        const d = this.distTo(P.pos);
        if (d < 7.4) this.aoeHit(this.pos.x, this.pos.z, 7, 1.4);
        G.fx.elementBurst(this.pos.x, this.pos.y + 1, this.pos.z, 2, 2);
        G.fx.ring(this.pos.x, this.pos.y + 0.3, this.pos.z, 8, 0xa080ff, 1, 0.5);
        G.cam.shake(0.5);
        G.audio?.sfx('thunderBig', { pos: this.pos });
        break;
      }
      case 'timestop': {
        mv.data.ring = 0;
        G.fx.ring(this.pos.x, this.pos.y + 0.5, this.pos.z, 30, 0xffe08a, 1, 2.0);
        G.atmo.flash = 0.3;
        G.audio?.sfx('stasis', { pos: this.pos });
        break;
      }
      case 'whirl':
        G.audio?.sfx('swingHeavy', { pos: this.pos, pitch: 0.5 });
        break;
    }
  }

  whileActive(name, P, dt, t) {
    const mv = this.move;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    switch (name) {
      case 'thrust': case 'dash': case 'charge':
        if (!mv.hit) {
          const r = this.meleeHit(2 + this.radius, 1.0, name === 'charge' ? 1.3 : 1.1, { parryable: name !== 'charge', unblockable: name === 'charge' });
          if (r) mv.hit = true;
        }
        this.vel.multiplyScalar(Math.pow(0.15, dt));
        if (name === 'charge' && Math.random() < dt * 30) G.fx.dust(this.pos.x, this.pos.y, this.pos.z, 0.6);
        break;
      case 'overhead': {
        const w = mv.data.wave;
        if (w) {
          w.t += dt;
          const step = 18 * dt;
          w.x += w.dx * step; w.z += w.dz * step;
          if (Math.random() < 0.8) G.fx.dust(w.x, G.terrain.heightAt(w.x, w.z), w.z, 0.8);
          G.fx.add.emit({ x: w.x, y: G.terrain.heightAt(w.x, w.z) + 0.3, z: w.z, life: 0.3, size: 1.5, size1: 0.2, color: [3, 2.5, 1] });
          if (!w.hit && this.aoeHit(w.x, w.z, 1.6, 0.9, { jumpable: true })) w.hit = true;
        }
        break;
      }
      case 'spears': case 'starfall': case 'meteors':
        for (const s of mv.data.spots) {
          if (s.done || mv.t + m_def(this).windup < s.t) continue;
          s.done = true;
          if (name === 'spears') {
            G.fx.sparks(s.x, s.y + 0.5, s.z, 20, 0xffe08a, 8);
            G.fx.ring(s.x, s.y + 0.1, s.z, s.r, 0xffd860, 1, 0.4);
            for (let k = 0; k < 6; k++) G.fx.add.emit({ x: s.x + (Math.random() - 0.5), y: s.y, z: s.z + (Math.random() - 0.5), vy: 14, life: 0.3, size: 0.5, size1: 0.1, color: [4, 3, 1.2] });
            G.audio?.sfx('spear', { pos: s });
          } else if (name === 'starfall') {
            G.fx.bolt(V(s.x + 2, s.y + 30, s.z - 1), V(s.x, s.y, s.z), 0xb0a0ff, 1.5, 0.25);
            G.fx.elementBurst(s.x, s.y + 0.3, s.z, 2, 0.8);
            G.audio?.sfx('thunder', { pos: s, volume: 0.5 });
          } else {
            G.fx.elementBurst(s.x, s.y + 0.3, s.z, 0, 1.2);
            G.fx.shockwave(s.x, s.y + 0.2, s.z, s.r, 0xff6a2a);
            G.audio?.sfx('explosion', { pos: s, volume: 0.6 });
            if (this.phase >= 2) G.world.addFirePatch(s.x, s.z, 4, 1.8);
          }
          this.aoeHit(s.x, s.z, s.r, name === 'spears' ? 0.8 : 0.9);
        }
        break;
      case 'breath': case 'beam': {
        // sweep a cone / line across the arena
        const sweep = name === 'beam' ? Math.sin(t * 1.4) * 1.1 : Math.sin(t * 2) * 0.6;
        if (t < 0.05) mv.data.baseYaw = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z) - (name === 'beam' ? 0 : 0);
        this.yaw = mv.data.baseYaw + sweep;
        const dx = Math.sin(this.yaw), dz = Math.cos(this.yaw);
        const len = name === 'beam' ? 26 : 13;
        for (let k = 0; k < 4; k++) {
          const s = Math.random() * len;
          const px = this.pos.x + dx * s, pz = this.pos.z + dz * s;
          const py = this.pos.y + (name === 'beam' ? this.height * 0.6 : this.height * 0.75) - s * (name === 'beam' ? 0.04 : 0.1);
          if (name === 'beam') G.fx.add.emit({ x: px, y: py, z: pz, life: 0.2, size: 1.0, size1: 0.3, color: [2.5, 2, 4.5] });
          else G.fx.add.emit({ x: px, y: py, z: pz, vx: dx * 6, vy: 0.5, vz: dz * 6, life: 0.4, size: 1.4, size1: 0.3, color: [5, 1.8, 0.4], color1: [2, 0.3, 0.05] });
        }
        mv.data.tick = (mv.data.tick || 0) + dt;
        if (mv.data.tick > 0.25) {
          mv.data.tick = 0;
          const pdx = P.pos.x - this.pos.x, pdz = P.pos.z - this.pos.z;
          const along = pdx * dx + pdz * dz;
          const perp = Math.abs(pdx * dz - pdz * dx);
          const width = name === 'beam' ? 1.3 : 1.2 + along * 0.25;
          const highEnough = name === 'beam' && P.pos.y - G.terrain.heightAt(P.pos.x, P.pos.z) > 1.0;
          if (along > 0 && along < len && perp < width && !highEnough) {
            const r = P.receiveAttack(this.dmg() * 0.35, this, { parryable: false, unblockable: true });
            if (r === 'hit') G.combat.applyElementToPlayer(name === 'beam' ? 2 : 0, 0.5);
          }
        }
        break;
      }
      case 'leap': {
        const u = Math.min(1, t / m_def(this).active);
        const a = mv.data.from, b = mv.data.target;
        this.pos.x = a.x + (b.x - a.x) * u;
        this.pos.z = a.z + (b.z - a.z) * u;
        this.pos.y = a.y + Math.sin(u * Math.PI) * 9;
        if (u >= 1 && !mv.hit) {
          mv.hit = true;
          this.airborne = false;
          G.fx.shockwave(this.pos.x, G.terrain.heightAt(this.pos.x, this.pos.z) + 0.2, this.pos.z, 7, 0xffd890);
          G.cam.shake(0.8);
          G.audio?.sfx('slam', { pos: this.pos });
          this.aoeHit(this.pos.x, this.pos.z, 6, 1.4, { jumpable: false });
          // expanding ring the player must jump over
          mv.data.ring = { r: 6, t: 0 };
        }
        break;
      }
      case 'whirl': {
        const sp = 5;
        const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, dl = Math.hypot(dx, dz) || 1;
        this.vel.x += ((dx / dl) * sp - this.vel.x) * Math.min(1, dt * 2);
        this.vel.z += ((dz / dl) * sp - this.vel.z) * Math.min(1, dt * 2);
        this.yaw += dt * 14;
        mv.data.tick = (mv.data.tick || 0) + dt;
        if (mv.data.tick > 0.35) { mv.data.tick = 0; this.aoeHit(this.pos.x, this.pos.z, 2.8 * this.def.scale * 0.5 + 2, 0.6); G.audio?.sfx('swing', { pos: this.pos, pitch: 0.6 }); }
        break;
      }
      case 'timestop': {
        mv.data.ring += dt * 15;
        const d = this.distTo(P.pos);
        if (!mv.hit && Math.abs(d - mv.data.ring) < 1.5) {
          mv.hit = true;
          if (P.iframes <= 0) {
            P.startAction({ type: 'stagger', dur: 1.5 });
            P.takeDamage(this.dmg() * 0.4, this, {});
            G.hud.toast('Frozen in time!', 'warn');
            G.post.grade.uniforms.uSlow.value = 1;
          } else G.combat.perfectDodge(P, this);
        }
        break;
      }
    }
    // jumpable ring after a leap
    const ring = mv.data.ring;
    if (ring && typeof ring === 'object') {
      ring.t += dt;
      ring.r += dt * 14;
      if (Math.random() < 0.7) {
        const a = Math.random() * Math.PI * 2;
        const x = this.pos.x + Math.cos(a) * ring.r, z = this.pos.z + Math.sin(a) * ring.r;
        G.fx.add.emit({ x, y: G.terrain.heightAt(x, z) + 0.3, z, life: 0.25, size: 1.2, size1: 0.2, color: [3, 2.5, 1] });
      }
      const d = this.distTo(P.pos);
      if (!ring.hit && Math.abs(d - ring.r) < 0.9 && P.pos.y - G.terrain.heightAt(P.pos.x, P.pos.z) < 0.8) {
        ring.hit = true;
        P.receiveAttack(this.dmg() * 0.6, this, { parryable: false, unblockable: true });
      }
    }
  }

  animate(dt) {
    const P = this.pose;
    const t = G.time;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.state === 'stagger') Anim.stagger(P, Math.min(1, this.stateT / Math.max(0.4, this.staggerDur)), 1);
    else if (this.state === 'phase') { Anim.idle(P, t, true); setJ(P, 'spine', -0.5, 0, 0); setJ(P, 'head', -0.6, 0, 0); setJ(P, 'armL', -0.5, 0, 1.6); setJ(P, 'armR', -0.5, 0, -1.6); }
    else if (speed > 0.3) {
      this.walkPhase += (speed / (1.6 * this.def.scale)) * dt * Math.PI;
      Anim.locomote(P, this.walkPhase, Math.min(1, speed / 9), t, { armed: true });
    } else Anim.idle(P, t, true);
    const mv = this.move;
    if (this.state === 'move' && mv) {
      const clip = CLIPS[mv.def.clip];
      if (clip) {
        let ct;
        const hit = { slash1: [0.13, 0.27], slash2: [0.11, 0.25], slash3: [0.2, 0.33], heavy: [0.3, 0.48], thrust: [0.16, 0.3], cast: [0.14, 0.24], castBig: [0.3, 0.5], spin: [0.15, 0.6] }[mv.def.clip] || [0.2, 0.3];
        if (mv.phase === 'windup') ct = (mv.t / mv.def.windup) * hit[0];
        else if (mv.phase === 'active') ct = hit[0] + Math.min(1, mv.t / Math.max(0.1, mv.def.active)) * (hit[1] - hit[0]);
        else ct = hit[1] + (mv.t / mv.def.recover) * (clip.duration - hit[1]);
        clip.sample(ct, this.tmp);
        blendPose(P, P, this.tmp, 1);
        if (mv.phase === 'windup' && mv.t > mv.def.windup * 0.55) P[4] += Math.sin(t * 50) * 0.02;
      }
    }
    this.rig.apply(P);
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
    this.rig.groundY = this.pos.y;
    this.rig.updateCape?.(dt, { x: 1, y: 0.3 }, this.def.hover ? 6 : 0);
    if (this.def.hover && this.rig.robe) this.rig.robe.rotation.x = Math.sin(t) * 0.05;
  }
}

function m_def(b) { return b.move.def; }

// ---------------------------------------------------------------------------
export class BossManager {
  constructor() {
    this.active = null;
    this.fog = null;
    this.adds = [];
    this.cool = 0;
  }

  checkTriggers() {
    if (this.active || G.cutscene.active || G.dialogue.active) return;
    this.cool -= 1 / 60;
    if (this.cool > 0) return;
    const S = G.game.state;
    const P = G.player.pos;
    const e = G.epochs.current;
    const near = (a, r) => Math.hypot(P.x - a.x, P.z - a.z) < r && Math.abs(P.y - (a.y ?? P.y)) < 12;
    const canFight = G.quests.isActive('main3') || G.quests.isDone('main3');
    if (canFight && e === 0 && !S.inv.shardDawn && near(G.content.colosseum, 24)) this.begin('varok');
    else if (canFight && e === 1 && !S.inv.shardEmber && near(G.content.crater, 30)) this.begin('morgrath');
    else if (canFight && e === 2 && !S.inv.shardStar) {
      const a = G.content.astral.isles.find((i) => i.arena);
      if (near(a, 18)) this.begin('nyxara');
    }
    if (G.quests.isActive('main4') && !S.flags.chronarch_defeated && G.quests.stepId('main4') !== 'choose' && near(G.content.spire, 15)) {
      if (G.quests.stepId('main4') === 'spire') G.quests.complete('main4');
      this.begin('chronarch');
    }
  }

  begin(id) {
    const b = new Boss(id);
    this.active = b;
    this.startEpoch = G.epochs.current;
    G.enemies.push(b);
    G.game.bossActive = b;
    G.spawner.despawnAll();
    this.makeFog(b);
    b.pos.y = b.arena.y + 0.1;
    const P = G.player;
    const cam = (dx, dy, dz) => V(b.pos.x + dx, b.pos.y + dy, b.pos.z + dz);
    const sc = b.def.scale;
    G.audio?.setMusic?.('boss');
    G.cutscene.play([
      { cam: { from: cam(0, sc * 1.2, 14 * sc * 0.5 + 4), to: cam(0, sc * 1.6, 9 * sc * 0.5 + 3), look: cam(0, sc * 1.8, 0), lookTo: cam(0, sc * 2, 0), dur: 3, fov: 45 }, line: { s: b.name, t: b.def.lines[0] } },
      { fn: () => { G.hud.banner(b.title, '', 'boss'); G.audio?.sfx('roar', { pos: b.pos }); G.cam.shake(0.5); }, dur: 1.6 },
    ], () => {
      b.setState('combat');
      b.cdT = 1.2;
      G.hud.setBoss(b);
      P.lockTarget = b;
    });
  }

  makeFog(b) {
    const geo = new THREE.CylinderGeometry(b.arena.r + 0.5, b.arena.r + 0.5, 14, 64, 1, true);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(b.def.fog) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: FOG_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    this.fog = new THREE.Mesh(geo, mat);
    this.fog.position.set(b.arena.x, b.arena.y + 5, b.arena.z);
    G.scene.add(this.fog);
  }
  clearFog() {
    if (this.fog) { G.scene.remove(this.fog); this.fog.geometry.dispose(); this.fog.material.dispose(); this.fog = null; }
  }

  spawnAdd(type, x, z) {
    const e = new Enemy(type, x, z, { level: 2 });
    e.setAlert();
    G.enemies.push(e);
    this.adds.push(e);
  }

  update(dt) {
    const b = this.active;
    if (!b) return;
    if (this.fog) this.fog.material.uniforms.uTime.value = G.time;
    // keep the player inside the arena
    const P = G.player;
    if (!b.dead) {
      const dx = P.pos.x - b.arena.x, dz = P.pos.z - b.arena.z;
      const d = Math.hypot(dx, dz);
      const R = b.arena.r;
      if (d > R && d < R + 15) {
        P.pos.x = b.arena.x + (dx / d) * R;
        P.pos.z = b.arena.z + (dz / d) * R;
      }
    }
  }

  onPlayerDeath() {
    const b = this.active;
    if (!b) return;
    b.remove();
    const i = G.enemies.indexOf(b);
    if (i >= 0) G.enemies.splice(i, 1);
    for (const a of this.adds) if (!a.removed) a.remove();
    this.adds = [];
    this.active = null;
    G.game.bossActive = null;
    G.hud.setBoss(null);
    this.clearFog();
    G.combat.clearProjectiles();
    G.audio?.setMusic?.(null);
    this.cool = 5;
    if (b.id === 'chronarch') G.epochs.setInstant(this.startEpoch);
  }

  onBossDefeated(b) {
    const S = G.game.state;
    G.hud.setBoss(null);
    G.audio?.setMusic?.('victory');
    for (const a of this.adds) if (!a.dead && !a.removed) a.die(null);
    this.adds = [];
    G.combat.clearProjectiles();
    G.player.gainXP(b.def.xp);
    G.after(2.6, () => {
      this.clearFog();
      this.active = null;
      G.game.bossActive = null;
      if (b.def.shard) {
        G.game.give(b.def.shard, 1);
        G.hud.banner(b.def.shard === 'shardDawn' ? 'Shard of Dawn' : b.def.shard === 'shardEmber' ? 'Shard of Embers' : 'Shard of Stars', `${b.name} has fallen`, 'boss done');
        G.world.drop(b.pos.x, b.pos.y, b.pos.z, 'starShard', 4);
        G.world.drop(b.pos.x, b.pos.y, b.pos.z, b.id === 'varok' ? 'iron' : b.id === 'morgrath' ? 'ember' : 'crystal', 5);
        G.game.save(true);
      }
      if (b.id === 'chronarch') {
        S.flags.chronarch_defeated = true;
        G.epochs.setInstant(this.startEpoch === undefined ? 0 : this.startEpoch);
        G.after(1.2, () => G.dialogue.start('chronarch', null));
      }
      G.audio?.setMusic?.(null);
    });
  }
}
