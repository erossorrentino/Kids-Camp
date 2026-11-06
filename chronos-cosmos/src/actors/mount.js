import * as THREE from 'three';
import { G } from '../core/G.js';
import { QuadRig } from './quadrig.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Duskhorn: a luminous-antlered steed. Sneak up, hold on through the
// bucking and it is yours; it follows you through every Age.
class Duskhorn {
  constructor(x, z, epochs, coat) {
    this.rig = new QuadRig({ scale: 1.55, length: 1.35, legLen: 0.95, girth: 1.1, color: coat, color2: 0x3a2a20, antlers: true, antlerColor: 0xf0e6d0, antlerGlow: 0x7fd8ff, tailLen: 0.3, ears: true, uniqueMats: true, mane: 0x2a1e18 });
    this.rig.addTo(G.scene);
    this.pos = V(x, G.terrain.heightAt(x, z), z);
    this.home = this.pos.clone();
    this.vel = V(0, 0, 0);
    this.yaw = Math.random() * Math.PI * 2;
    this.epochs = epochs;
    this.state = 'graze';
    this.t = Math.random() * 5;
    this.speed = 0;
    this.vy = 0;
    this.spur = 3;
    this.spurT = 0;
    this.resolveOut = {};
    this.name = 'Duskhorn';
  }
  visibleNow() {
    return this.tamed || this.epochs.includes(G.epochs.current);
  }
  turnTo(target, dt, rate) {
    let d = target - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += Math.abs(d) < rate * dt ? d : Math.sign(d) * rate * dt;
  }
  ground(dt, rider) {
    G.collision.resolve(this.pos, 0.8, 2.2, 0.7, this.resolveOut);
    const gh = G.collision.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.8, 0.6, 0.9).h;
    const wl = G.water ? G.water.level : -99;
    if (wl - gh > 1.4 && !G.water.isIce(this.pos.x, this.pos.z)) {
      // refuse deep water
      this.pos.x -= this.vel.x * dt * 1.5;
      this.pos.z -= this.vel.z * dt * 1.5;
      this.speed *= 0.3;
      if (rider) G.hud.toast('Your Duskhorn refuses to swim that deep.', 'warn');
    }
    const n = G.terrain.normalAt(this.pos.x, this.pos.z);
    if (n.y < 0.55 && gh > this.pos.y + 0.3) {
      this.pos.x -= this.vel.x * dt;
      this.pos.z -= this.vel.z * dt;
      this.speed *= 0.5;
    }
    if (this.pos.y > gh + 0.05 || this.vy > 0) {
      this.vy -= 24 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= gh) { this.pos.y = gh; if (this.vy < -6) { G.fx.dust(this.pos.x, gh, this.pos.z, 1); G.audio?.sfx('land', { pos: this.pos }); } this.vy = 0; }
    } else this.pos.y = gh;
  }
  update(dt) {
    const vis = this.visibleNow();
    this.rig.setVisible(vis);
    if (!vis) return;
    const P = G.player;
    const d2p = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
    if (d2p > 220 && !this.tamed) return;
    this.t += dt;
    let animState = 'move';
    let u = 0;
    if (this.state === 'ridden') {
      this.ride(dt);
      animState = this.buckT > 0 ? 'rear' : 'move';
      u = this.buckT > 0 ? (this.t % 0.8) / 0.8 : 0;
    } else if (this.state === 'flee') {
      const a = Math.atan2(this.pos.x - P.pos.x, this.pos.z - P.pos.z);
      this.turnTo(a, dt, 4);
      this.speed += (11 - this.speed) * Math.min(1, dt * 3);
      if (d2p > 45) this.state = 'graze';
    } else if (this.state === 'come') {
      const a = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
      this.turnTo(a, dt, 4);
      const want = d2p > 6 ? 12 : 0;
      this.speed += (want - this.speed) * Math.min(1, dt * 3);
      if (d2p < 5) this.state = 'idle';
    } else {
      // graze / wander
      if (this.t > 6) {
        this.t = 0;
        this.wanderA = Math.random() * Math.PI * 2;
        this.wanderGo = Math.random() < 0.5;
      }
      if (this.wanderGo) {
        const tx = (this.tamed ? this.pos.x : this.home.x) + Math.cos(this.wanderA) * 10, tz = (this.tamed ? this.pos.z : this.home.z) + Math.sin(this.wanderA) * 10;
        this.turnTo(Math.atan2(tx - this.pos.x, tz - this.pos.z), dt, 1.5);
        this.speed += (1.6 - this.speed) * Math.min(1, dt * 2);
      } else {
        this.speed += (0 - this.speed) * Math.min(1, dt * 3);
        animState = 'graze';
      }
      // spooked by the player unless sneaking (wild only)
      if (!this.tamed) {
        const spook = P.crouching ? 4 : 13;
        if (d2p < spook && P.mode !== 'mounted') { this.state = 'flee'; G.audio?.sfx('growl', { pos: this.pos, pitch: 1.6 }); }
      }
    }
    if (this.state !== 'ridden') {
      this.vel.set(Math.sin(this.yaw) * this.speed, 0, Math.cos(this.yaw) * this.speed);
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      this.ground(dt, false);
    }
    if (this.speed > 0.3 && animState === 'graze') animState = 'move';
    if (this.speed < 0.3 && animState === 'move' && this.state !== 'ridden') animState = 'idle';
    this.rig.animate(dt, Math.abs(this.speed), animState, u);
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
  }

  ride(dt) {
    const P = G.player;
    const inp = G.input;
    if (this.buckT > 0) {
      // taming: hold on!
      this.buckT -= dt;
      P.useStamina(32 * dt);
      this.yaw += Math.sin(this.t * 7) * dt * 3;
      this.speed = Math.sin(this.t * 5) * 3;
      G.cam.shake(0.05);
      if (P.stamina <= 0) {
        this.dismount(true);
        this.state = 'flee';
        G.hud.toast('Thrown off! Try again with more stamina.', 'warn');
        return;
      }
      if (this.buckT <= 0) {
        this.tamed = true;
        G.mounts.tamed = this;
        G.game.state.mount = { x: this.pos.x, z: this.pos.z };
        G.hud.banner('Duskhorn Tamed', 'Press H anywhere to call it. It follows you through every Age.', 'item');
        G.audio?.sfx('unlock');
        G.player.gainXP(50);
      }
    } else {
      const iv = inp.moveVec;
      let target = 0;
      if (iv.y < -0.1) target = 7 + (-iv.y) * 7;
      else if (iv.y > 0.1) target = -2.5;
      this.spurT = Math.max(0, this.spurT - dt);
      if (inp.up('sprint') && this.spur > 0 && this.speed > 3) { this.spur--; this.spurT = 1.4; G.audio?.sfx('dodge', { pos: this.pos }); G.fx.dust(this.pos.x, this.pos.y, this.pos.z, 1); }
      if (this.spurT > 0) target = 21;
      if (inp.down('sprint') && target > 0) target = Math.max(target, 15);
      this.spurRegen = (this.spurRegen || 0) + dt;
      if (this.spurRegen > 5) { this.spurRegen = 0; this.spur = Math.min(3, this.spur + 1); }
      this.speed += (target - this.speed) * Math.min(1, dt * (target > this.speed ? 1.6 : 3));
      this.turnTo(this.yaw - iv.x * 2, dt, 1.8 + 1 / (1 + Math.abs(this.speed) * 0.1));
      if (inp.hit('jump') && this.vy === 0) { this.vy = 10; G.audio?.sfx('jump', { pos: this.pos }); }
      if (inp.hit('interact') && !G.game.currentInteractable) { this.dismount(false); return; }
      if (G.input.attackHit()) {
        P.startAttack('slash1', 0);
      }
    }
    this.vel.set(Math.sin(this.yaw) * this.speed, 0, Math.cos(this.yaw) * this.speed);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.ground(dt, true);
    // the rider sits on the saddle
    const back = 0.15;
    P.pos.set(this.pos.x - Math.sin(this.yaw) * back, this.pos.y + 1.42 + this.rig.body.position.y - this.rig.hipH, this.pos.z - Math.cos(this.yaw) * back);
    P.yaw = this.yaw;
    P.vel.copy(this.vel);
    P.mountLean = Math.min(0.4, this.speed * 0.02);
    // trample small enemies at gallop
    if (this.speed > 12) for (const e of G.enemies) if (!e.dead && !e.boss && e.distTo(this.pos) < 1.8) G.combat.damageEnemy(e, 25, { source: P, poise: 40, knock: 10, kind: 'trample' });
  }

  mount() {
    const P = G.player;
    this.state = 'ridden';
    P.mode = 'mounted';
    P.action = null;
    P.lockTarget = null;
    if (!this.tamed) {
      this.buckT = 3.2;
      G.hud.toast('Hold on! Keep your stamina up…', 'quest');
      G.audio?.sfx('growl', { pos: this.pos, pitch: 1.4 });
    }
  }
  dismount(thrown) {
    const P = G.player;
    this.state = 'idle';
    this.speed = 0;
    P.mode = 'air';
    const a = this.yaw + Math.PI / 2;
    P.pos.set(this.pos.x + Math.sin(a) * 1.4, this.pos.y + 1.0, this.pos.z + Math.cos(a) * 1.4);
    P.vel.set(Math.sin(a) * (thrown ? 6 : 1), thrown ? 5 : 2, Math.cos(a) * (thrown ? 6 : 1));
    if (thrown) P.takeDamage(5, null, { fall: true });
  }
}

export class Mounts {
  constructor() {
    this.list = [];
    this.tamed = null;
    const coats = [0x8a6a4a, 0x6a5040, 0xb09070, 0x4a3a30, 0xd0c0a0];
    const herds = [[60, 420, [0]], [-150, 470, [0]], [180, 380, [0, 2]], [-80, 180, [2]], [430, 300, [0, 2]]];
    let i = 0;
    for (const [x, z, ep] of herds) for (let k = 0; k < 2; k++) {
      const m = new Duskhorn(x + (Math.random() - 0.5) * 16, z + (Math.random() - 0.5) * 16, ep, coats[i++ % coats.length]);
      this.list.push(m);
      G.world.addInteractable({
        getPos: () => m.pos, pos: m.pos, r: 3.2, label: 'Duskhorn', verb: 'Mount ', mountOk: false,
        cond: () => m.visibleNow() && m.state !== 'ridden' && G.player.mode !== 'mounted' && (!this.tamed || this.tamed === m),
        action: () => m.mount(),
      });
    }
  }
  get pos() {
    return this.tamed ? this.tamed.pos : new THREE.Vector3();
  }
  get rig() {
    return this.tamed ? this.tamed.rig : { root: { visible: false } };
  }
  get name() {
    return 'Duskhorn';
  }
  whistle() {
    G.audio?.sfx('glint');
    if (!this.tamed) return G.hud.toast('You have no mount yet. Sneak up on a wild Duskhorn in the meadows.', 'tip');
    const P = G.player;
    const m = this.tamed;
    if (m.state === 'ridden') return;
    if (m.pos.distanceTo(P.pos) > 80) {
      const a = P.yaw + Math.PI;
      m.pos.set(P.pos.x + Math.sin(a) * 30, P.pos.y, P.pos.z + Math.cos(a) * 30);
      m.pos.y = G.terrain.heightAt(m.pos.x, m.pos.z);
    }
    m.state = 'come';
    G.hud.toast('Your Duskhorn answers the call.', 'good');
  }
  restore(s) {
    // re-tame the first herd member and place it where it was left
    const m = this.list[0];
    m.tamed = true;
    m.state = 'idle';
    m.pos.set(s.x, G.terrain.heightAt(s.x, s.z), s.z);
    this.tamed = m;
  }
  update(dt) {
    for (const m of this.list) m.update(dt);
  }
}
