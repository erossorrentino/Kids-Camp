import * as THREE from 'three';
import { VLight } from '../core/lights.js';
import { G } from '../core/G.js';
import { Rig, Anim, newPose, blendUpper, buildCombatClips, setJ, addJ } from './rig.js';

const _v = new THREE.Vector3();
let CLIPS = null;

// Living-world villager / companion with a daily schedule, reactions to the
// player, ambient barks and optional follower combat behaviour.
export class NPC {
  constructor(def) {
    if (!CLIPS) CLIPS = buildCombatClips();
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.title = def.title || '';
    this.epochs = def.epochs;
    this.home = new THREE.Vector3(def.x, 0, def.z);
    this.home.y = G.terrain.heightAt(def.x, def.z);
    this.pos = this.home.clone();
    this.vel = new THREE.Vector3();
    this.yaw = def.yaw || 0;
    this.radius = 0.35;
    this.height = 1.75;
    this.state = 'idle';
    this.target = null;
    this.barkT = 3 + Math.random() * 5;
    this.lookAtPlayer = 0;
    this.activity = 'idle';
    this.phase = Math.random() * 10;
    this.visible = true;
    this.following = false;
    this.attackT = 0;
    this.orb = def.orb;
    if (def.orb) this.buildOrb(def.orb);
    else {
      this.rig = new Rig({ ...def.rig, name: def.id });
      if (def.rig.weapon) this.rig.setWeapon(def.rig.weapon, def.rig.weaponOpts || {});
      this.pose = newPose();
      this.tmp = newPose();
      this.rig.addTo(G.scene);
      if (def.rig.weapon && !def.armed) this.rig.sheathe(true);
    }
    this.interact = G.world.addInteractable({
      getPos: () => this.pos,
      pos: this.pos,
      r: 2.6,
      label: this.name,
      verb: 'Talk to ',
      epochs: this.epochs,
      cond: () => this.visible && !this.hiddenInside && (!def.talkCond || def.talkCond()),
      action: () => this.talk(),
    });
    this.resolveOut = {};
  }

  buildOrb(color) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 4 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 6, 32), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 2 }));
    const ring2 = ring.clone();
    ring2.rotation.x = Math.PI / 2;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.glowTex, color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(1.8);
    const light = new VLight(color, 4, 10, 2);
    g.add(core, ring, ring2, glow, light);
    this.orbRings = [ring, ring2];
    this.rig = { root: g, setVisible: (v) => (g.visible = v), removeFrom: (s) => s.remove(g) };
    G.scene.add(g);
  }

  get active() {
    return this.epochs.includes(G.epochs.current) && (!this.def.cond || this.def.cond());
  }

  talk() {
    const dlg = typeof this.def.dialogue === 'function' ? this.def.dialogue() : this.def.dialogue;
    if (!dlg) {
      const lines = this.def.barks || ['…'];
      G.hud.toast(`${this.name}: “${lines[Math.floor(Math.random() * lines.length)]}”`, 'bark');
      return;
    }
    this.facePlayer = true;
    G.dialogue.start(dlg, this);
  }

  scheduleEntry() {
    const sch = this.def.schedule;
    if (!sch) return null;
    const t = G.atmo.timeOfDay;
    for (const s of sch) {
      if (s.from <= s.to ? t >= s.from && t < s.to : t >= s.from || t < s.to) return s;
    }
    return null;
  }

  update(dt) {
    const on = this.active;
    if (!on) {
      if (this.visible) { this.rig.setVisible(false); this.visible = false; }
      return;
    }
    const P = G.player;
    const d2p = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
    const far = d2p > 160;
    if (!this.visible) { this.rig.setVisible(true); this.visible = true; }
    if (far && !this.following) {
      this.rig.setVisible(false);
      return;
    }
    if (this.orb) return this.updateOrb(dt, P, d2p);
    const inDialogue = G.dialogue?.active && G.dialogue.npc === this;
    let goal = null, act = 'idle', speed = 1.4;
    // threats nearby -> flee home
    let threat = false;
    if (!this.def.brave && !this.following) {
      for (const e of G.enemies) if (!e.dead && e.state !== 'idle' && e.distTo(this.pos) < 18) { threat = true; break; }
    }
    if (inDialogue) {
      act = 'talk';
    } else if (this.following) {
      const res = this.followLogic(dt, P);
      goal = res.goal; act = res.act; speed = res.speed;
    } else if (threat) {
      goal = this.home; act = 'run'; speed = 4.5;
      if (Math.random() < dt * 0.5) this.say(this.def.fearBarks || ['Monsters! Get inside!', 'Run!', 'Help us, traveler!']);
    } else {
      const s = this.scheduleEntry();
      if (s) {
        if (s.act === 'sleep') {
          goal = this.home;
          act = 'walk';
          if (this.pos.distanceTo(this.home) < 1.2) { this.hiddenInside = true; this.rig.setVisible(false); return; }
        } else {
          this.hiddenInside = false;
          goal = s.at ? _v.set(s.at.x, 0, s.at.z) : this.home;
          act = s.act || 'idle';
          if (s.act === 'wander') {
            if (!this.wander || this.wanderT <= 0 || this.pos.distanceTo(this.wander) < 1) {
              const a = Math.random() * Math.PI * 2, r = Math.random() * (s.r || 8);
              this.wander = new THREE.Vector3((s.at?.x ?? this.home.x) + Math.cos(a) * r, 0, (s.at?.z ?? this.home.z) + Math.sin(a) * r);
              this.wanderT = 5 + Math.random() * 8;
            }
            this.wanderT -= dt;
            goal = this.wander;
            act = 'idle';
          }
        }
      } else {
        this.hiddenInside = false;
        goal = this.home;
      }
    }
    if (this.hiddenInside) { this.hiddenInside = false; this.rig.setVisible(true); }
    // move toward goal
    let moving = false;
    if (goal && !inDialogue) {
      const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      const stopAt = this.following ? 0.5 : 0.6;
      if (dist > stopAt) {
        const sp = Math.min(speed, dist * 2);
        this.vel.x += ((dx / dist) * sp - this.vel.x) * Math.min(1, dt * 5);
        this.vel.z += ((dz / dist) * sp - this.vel.z) * Math.min(1, dt * 5);
        this.turnTo(Math.atan2(dx, dz), dt, 6);
        moving = true;
      }
    }
    if (!moving) {
      this.vel.multiplyScalar(Math.pow(0.001, dt));
      if (this.def.faceDir !== undefined && !inDialogue && d2p > 5) this.turnTo(this.def.faceDir, dt, 2);
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    G.collision.resolve(this.pos, this.radius, this.height, 0.5, this.resolveOut);
    const g = G.collision.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6, this.radius);
    if (this.following && G.water && G.water.level > g.h + 1.1) {
      this.pos.y = G.water.level - 1.1;
    } else this.pos.y += (g.h - this.pos.y) * Math.min(1, dt * 15);
    // react to the player
    if ((d2p < 5 && !moving) || inDialogue) {
      const want = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
      this.turnTo(want, dt, inDialogue ? 6 : 3);
      if (!inDialogue && !this.following) {
        this.barkT -= dt;
        if (this.barkT <= 0 && d2p < 4.5) {
          this.barkT = 12 + Math.random() * 10;
          this.say(this.contextBarks());
        }
      }
    }
    // startled by weapons drawn
    if (!this.following && d2p < 6 && P.action && P.action.type === 'attack' && !this.startled) {
      this.startled = true;
      this.say(this.def.startleBarks || ['Hey! Watch that blade!', 'Easy with that sword!', 'Mind where you swing that!']);
      G.after(6, () => (this.startled = false));
    }
    this.animate(dt, moving ? Math.hypot(this.vel.x, this.vel.z) : 0, act);
  }

  followLogic(dt, P) {
    // pick an enemy near the player
    let foe = null, bd = 16;
    for (const e of G.enemies) {
      if (e.dead) continue;
      const d = e.distTo(P.pos);
      if (d < bd && e.state !== 'idle') { bd = d; foe = e; }
    }
    this.attackT -= dt;
    const d2p = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
    if (d2p > 45 || (P.mode === 'glide' && d2p > 25)) {
      // catch up by fading in near the player
      const a = P.yaw + Math.PI * 0.75;
      this.pos.set(P.pos.x + Math.sin(a) * 2.5, P.pos.y, P.pos.z + Math.cos(a) * 2.5);
      this.pos.y = G.collision.groundAt(this.pos.x, this.pos.z, this.pos.y + 3, 0.3, 6).h;
      G.fx.motes(this.pos.x, this.pos.y, this.pos.z, 15, 0xbfe8ff);
    }
    if (foe) {
      this.foe = foe;
      const d = foe.distTo(this.pos);
      const range = this.def.ranged ? 12 : 2.2;
      if (d > range) return { goal: foe.pos, act: 'run', speed: 5.5 };
      this.turnTo(Math.atan2(foe.pos.x - this.pos.x, foe.pos.z - this.pos.z), dt, 8);
      if (this.attackT <= 0) {
        this.attackT = this.def.ranged ? 2.2 : 1.4;
        this.strikeT = 0.01;
        this.rig.sheathe?.(false);
        const dmg = (this.def.power || 10) * (1 + (G.player.level - 1) * 0.08);
        if (this.def.ranged) {
          const from = new THREE.Vector3(this.pos.x, this.pos.y + 1.4, this.pos.z);
          const to = new THREE.Vector3(foe.pos.x, foe.pos.y + foe.height * 0.6, foe.pos.z);
          G.combat.spawnProjectile({ from, to, owner: this, dmg, el: this.def.element ?? 1, color: this.def.boltColor || 0x8fe8ff, size: 0.25, speed: 26, target: foe });
          G.audio?.sfx('frostCast', { pos: this.pos, volume: 0.5 });
        } else {
          G.after(0.25, () => {
            if (!foe.dead && foe.distTo(this.pos) < 3) {
              G.combat.damageEnemy(foe, dmg, { source: G.player, poise: 14, melee: false, kind: 'ally' });
              G.audio?.sfx('hit', { pos: foe.pos });
            }
          });
          G.audio?.sfx('swing', { pos: this.pos });
        }
      }
      return { goal: null, act: 'combat', speed: 0 };
    }
    this.foe = null;
    const side = this.def.followSide || 1;
    const a = P.yaw + Math.PI + side * 0.7;
    const gx = P.pos.x + Math.sin(a) * 2.6, gz = P.pos.z + Math.cos(a) * 2.6;
    const dist = Math.hypot(gx - this.pos.x, gz - this.pos.z);
    return { goal: _v.set(gx, 0, gz), act: 'walk', speed: dist > 6 ? 7.5 : dist > 2 ? 4.5 : 2 };
  }

  updateOrb(dt, P, d2p) {
    const r = this.rig.root;
    let tx, ty, tz;
    if (this.following) {
      const a = G.time * 0.6;
      tx = P.pos.x + Math.sin(P.yaw + 2.3) * 1.3 + Math.sin(a) * 0.3;
      tz = P.pos.z + Math.cos(P.yaw + 2.3) * 1.3;
      ty = P.pos.y + 2.1 + Math.sin(G.time * 2) * 0.15;
      this.attackT -= dt;
      if (this.attackT <= 0) {
        let foe = null, bd = 14;
        for (const e of G.enemies) if (!e.dead && e.state !== 'idle') { const d = e.distTo(P.pos); if (d < bd) { bd = d; foe = e; } }
        if (foe) {
          this.attackT = 1.8;
          const from = r.position.clone();
          const to = new THREE.Vector3(foe.pos.x, foe.pos.y + foe.height * 0.6, foe.pos.z);
          G.fx.bolt(from, to, 0x9fd8ff, 0.6, 0.15);
          G.combat.damageEnemy(foe, 8 * (1 + (P.level - 1) * 0.08), { source: P, el: 2, poise: 6, kind: 'ally' });
        }
      }
    } else {
      tx = this.home.x; tz = this.home.z; ty = this.home.y + 2 + Math.sin(G.time * 1.5) * 0.3;
    }
    this.pos.set(tx, ty - 2, tz);
    r.position.x += (tx - r.position.x) * Math.min(1, dt * 4);
    r.position.y += (ty - r.position.y) * Math.min(1, dt * 4);
    r.position.z += (tz - r.position.z) * Math.min(1, dt * 4);
    this.orbRings[0].rotation.y += dt * 2;
    this.orbRings[1].rotation.x += dt * 1.5;
    this.pos.copy(r.position);
    this.pos.y -= 1.8;
  }

  turnTo(target, dt, rate) {
    let d = target - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const s = rate * dt;
    this.yaw += Math.abs(d) < s ? d : Math.sign(d) * s;
  }

  contextBarks() {
    const P = G.player;
    const out = [...(this.def.barks || [])];
    const A = G.atmo;
    const w = G.weather?.state;
    if (A.timeOfDay < 10 && A.timeOfDay > 5) out.push(...(this.def.morning || ['Morning, traveler.']));
    if (A.isNight) out.push(...(this.def.night || ['Late to be wandering, isn’t it?']));
    if (w && w.rain > 0.3) out.push('This rain gets into everything.');
    if (P.hp < P.maxHp * 0.4) out.push('You look hurt. Rest by a fire before you go on.');
    if (P.combatT > 0) out.push('Put that blade away, would you? You’re frightening the hens.');
    if (G.game.state.flags.shard_count >= 1) out.push(...(this.def.lateBarks || []));
    return out.length ? out : ['…'];
  }

  say(lines) {
    if (!lines || !lines.length) return;
    const l = lines[Math.floor(Math.random() * lines.length)];
    G.hud.toast(`<b>${this.name}</b> ${l}`, 'bark');
  }

  animate(dt, speed, act) {
    const P = this.pose;
    const t = G.time + this.phase;
    if (speed > 0.15) {
      this.phase += (speed / (speed > 3 ? 1.6 : 1.05)) * dt * Math.PI;
      Anim.locomote(P, this.phase, speed / 8, t, { armed: this.following && this.foe });
    } else if (act === 'talk') Anim.talk(P, t);
    else if (act === 'wave') Anim.wave(P, t);
    else if (['hammer', 'hoe', 'sit', 'sweep', 'pray'].includes(act)) Anim.work(P, t, act);
    else if (act === 'combat') Anim.idle(P, t, true);
    else Anim.idle(P, t, false);
    if (this.strikeT !== undefined && this.strikeT > 0) {
      this.strikeT += dt;
      const clip = this.def.ranged ? CLIPS.cast : CLIPS.slash1;
      clip.sample(this.strikeT, this.tmp);
      blendUpper(P, this.tmp, 1);
      if (this.strikeT > clip.duration) this.strikeT = 0;
    }
    if (this.def.elder) { addJ(P, 'spine', 0.25, 0, 0); addJ(P, 'head', -0.15, 0, 0); }
    this.rig.apply(P);
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
    this.rig.groundY = this.pos.y;
    this.rig.updateCape?.(dt, { x: 0.5, y: 0.2 }, 0);
  }
}

export class NPCManager {
  constructor() {
    this.list = [];
    this.byId = {};
  }
  add(def) {
    const n = new NPC(def);
    this.list.push(n);
    this.byId[def.id] = n;
    return n;
  }
  get(id) {
    return this.byId[id];
  }
  update(dt) {
    for (const n of this.list) n.update(dt);
  }
  setFollower(id, on) {
    const n = this.byId[id];
    if (!n) return;
    n.following = on;
    if (on) n.rig.sheathe?.(true);
  }
  currentCompanion() {
    for (const n of this.list) if (n.following && n.active) return n;
    return null;
  }
}
