import * as THREE from 'three';
import { G } from '../core/G.js';
import { QuadRig } from '../actors/quadrig.js';
import { START } from '../world/worldmap.js';
import { ITEMS } from './items.js';

// Pip, a fox napping near where you wake up. Once befriended Pip follows you
// across the Ages, sits and naps when you rest, digs up treasures and perks
// up when an Echo is close by.
const NAME = 'Pip';

export class Fox {
  constructor(scene) {
    this.rig = new QuadRig({
      scale: 0.62, color: 0xd0692c, color2: 0x2e1d14, snout: 0xd8753a, tailColor: 0xd0692c, tailTip: 0xf4eee2, chest: 0xf4eee2,
      legLen: 0.62, length: 0.62, girth: 0.7, tailLen: 0.5, tailR: 0.12, tailBase: -0.3, earScale: 1.55, snoutScale: 0.72, nose: 0x140c08,
    });
    this.rig.addTo(scene);
    this.home = { x: START.x + 9, z: START.z + 6 };
    this.pos = new THREE.Vector3(this.home.x, G.terrain.heightAt(this.home.x, this.home.z), this.home.z);
    this.yaw = 2.2;
    this.speed = 0;
    this.state = 'sleep';
    this.stateT = 0;
    this.idleT = 0;
    this.digT = 0;
    this.digNext = 70 + Math.random() * 60;
    this.senseT = 2;
    this.placed = false;
    this.zT = 0;
    this.interact = G.world.addInteractable({
      getPos: () => this.pos,
      r: 2.6,
      dy: 3,
      verb: 'Befriend',
      label: ' the fox',
      cond: () => this.rig.root.visible && !G.player.lockTarget && this.state !== 'dig',
      action: () => this.onInteract(),
    });
  }

  get S() {
    return G.game.state;
  }

  onInteract() {
    const S = this.S;
    if (!S.flags.fox) {
      S.flags.fox = true;
      this.state = 'happy';
      this.stateT = 1.8;
      G.audio?.sfx('yip', { pos: this.pos });
      this.hearts(8);
      G.hud.toast(`The fox wakes and sniffs your hand. ${NAME} will travel with you!`, 'good');
      G.after(2.2, () => G.hud.toast(`${NAME} digs up treasures as you explore, and perks up when an Echo is near.`, 'tip'));
      return;
    }
    // a pat on the head
    G.game.stat('pets');
    this.state = 'happy';
    this.stateT = 1.6;
    this.face(G.player.pos);
    G.audio?.sfx('yip', { pos: this.pos, pitch: 1.1 });
    this.hearts(5);
    const P = G.player;
    P.hp = Math.min(P.maxHp, P.hp + 3);
    const lines = [`${NAME} wags happily.`, `${NAME} nuzzles your hand.`, `${NAME} rolls over for a belly rub.`, `${NAME} chirps and spins in a circle.`];
    G.hud.toast(lines[Math.floor(Math.random() * lines.length)], '');
  }

  hearts(n) {
    for (let i = 0; i < n; i++) {
      G.fx?.add.emit({ x: this.pos.x + (Math.random() - 0.5) * 0.5, y: this.pos.y + 0.6 + Math.random() * 0.3, z: this.pos.z + (Math.random() - 0.5) * 0.5, vx: (Math.random() - 0.5) * 0.6, vy: 1 + Math.random(), vz: (Math.random() - 0.5) * 0.6, life: 1.1, size: 0.16, size1: 0.05, color: [3, 0.8, 1.4], shape: 2, drag: 0.97 });
    }
  }

  face(p, dt = 0) {
    const want = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    let d = want - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += dt ? d * Math.min(1, dt * 8) : d;
  }

  groundY(x, z) {
    let h = G.collision ? G.collision.groundAt(x, z, this.pos.y + 1.2, 0.25, 1.4).h : G.terrain.heightAt(x, z);
    const wl = G.water ? G.water.level : -1e9;
    this.swimming = wl - h > 0.55 && !G.water.isIce?.(x, z);
    if (this.swimming) h = wl - 0.32;
    return h;
  }

  teleportNearPlayer() {
    const P = G.player;
    const bx = P.pos.x - Math.sin(P.yaw) * 3 + Math.cos(P.yaw) * 1.2, bz = P.pos.z - Math.cos(P.yaw) * 3 - Math.sin(P.yaw) * 1.2;
    this.pos.set(bx, P.pos.y + 1, bz);
    this.pos.y = this.groundY(bx, bz);
    this.yaw = P.yaw;
    G.fx?.motes(this.pos.x, this.pos.y, this.pos.z, 12, 0xffd8a8, 0.4);
  }

  update(dt) {
    if (!G.player || !G.game?.state) return;
    const S = this.S;
    const P = G.player;
    const hidden = !!G.game.inPocket || G.state === 'title';
    this.rig.setVisible(!hidden);
    this.interact.verb = S.flags.fox ? 'Pet' : 'Befriend';
    this.interact.label = S.flags.fox ? ` ${NAME}` : ' the fox';
    if (hidden) return;
    if (dt <= 0) { this.animate(0); return; }
    if (this.stateT > 0) this.stateT -= dt;
    if (!S.flags.fox) {
      // asleep under the trees until you say hello
      this.pos.y = this.groundY(this.pos.x, this.pos.z);
      this.state = this.stateT > 0 ? this.state : 'sleep';
      this.zT -= dt;
      if (this.zT <= 0 && this.state === 'sleep' && this.pos.distanceTo(P.pos) < 25) {
        this.zT = 1.4;
        G.fx?.add.emit({ x: this.pos.x, y: this.pos.y + 0.5, z: this.pos.z, vx: 0.2, vy: 0.5, vz: 0, life: 1.6, size: 0.12, size1: 0.2, color: [1.6, 1.6, 2], alpha: 0.6, shape: 0 });
      }
      this.animate(dt);
      return;
    }
    if (!this.placed) { this.placed = true; if (this.pos.distanceTo(P.pos) > 30) this.teleportNearPlayer(); }

    // player speed from actual movement (covers riding, where the mount moves us)
    if (!this.lastP) this.lastP = P.pos.clone();
    const moved = Math.hypot(P.pos.x - this.lastP.x, P.pos.z - this.lastP.z) / dt;
    this.lastP.copy(P.pos);
    this.pspeed = (this.pspeed || 0) + (Math.min(30, moved) - (this.pspeed || 0)) * Math.min(1, dt * 6);
    const pspeed = this.pspeed;
    const dP = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
    if (dP > 45 || Math.abs(P.pos.y - this.pos.y) > 18) {
      if (P.grounded || P.mode === 'mounted' || P.mode === 'swim') this.teleportNearPlayer();
    }
    // danger nearby: keep further back
    let danger = false;
    for (const e of G.enemies) if (!e.dead && e.state !== 'idle' && e.distTo(this.pos) < 14) { danger = true; break; }
    const back = danger ? 5 : P.mode === 'mounted' ? 4 : 2.4;
    const tx = P.pos.x - Math.sin(P.yaw) * back + Math.cos(P.yaw) * 1.1;
    const tz = P.pos.z - Math.cos(P.yaw) * back - Math.sin(P.yaw) * 1.1;
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);

    // timed actions take priority
    if (this.stateT > 0 && (this.state === 'dig' || this.state === 'happy' || this.state === 'point')) {
      if (this.state === 'dig') {
        if (Math.random() < dt * 8) G.fx?.dust(this.pos.x + Math.sin(this.yaw) * 0.35, this.pos.y, this.pos.z + Math.cos(this.yaw) * 0.35, 0.12);
        if (this.stateT <= dt) this.finishDig();
      }
      if (this.state === 'point' && this.pointAt) this.face(this.pointAt, dt);
      this.speed = 0;
      this.animate(dt);
      return;
    }

    // resting with you
    if (pspeed < 0.3 && dP < 6) this.idleT += dt;
    else this.idleT = 0;

    let want = 0;
    if (d > 0.8 && this.idleT < 1) want = Math.min(Math.max(7, pspeed + 2.5), 16, d * 2.4);
    if (d > 9) want = Math.max(want, 9);
    this.speed += (want - this.speed) * Math.min(1, dt * 5);
    if (this.speed > 0.05) {
      const mx = (dx / (d || 1)) * this.speed * dt, mz = (dz / (d || 1)) * this.speed * dt;
      this.pos.x += mx;
      this.pos.z += mz;
      this.face({ x: this.pos.x + dx, z: this.pos.z + dz }, dt);
    } else if (this.idleT > 0.5) this.face(P.pos, dt * 0.5);
    const gy = this.groundY(this.pos.x, this.pos.z);
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 12);

    if (this.speed > 0.4) this.state = 'move';
    else if (this.idleT > 35) this.state = 'sleep';
    else if (this.idleT > 5) this.state = 'sit';
    else this.state = 'idle';

    // explore: dig now and then while you travel
    if (pspeed > 1 && !danger && P.mode !== 'mounted') this.digT += dt;
    if (this.digT > this.digNext && !danger && !this.swimming && G.state === 'play') {
      this.digT = 0;
      this.digNext = 90 + Math.random() * 90;
      this.state = 'dig';
      this.stateT = 2.4;
      G.audio?.sfx('yip', { pos: this.pos, pitch: 1.2 });
    }
    // sense Echoes
    this.senseT -= dt;
    if (this.senseT <= 0 && G.echoes) {
      this.senseT = 2.5;
      const e = G.echoes.nearestUnfound(this.pos, 45);
      if (e && !e.sensed) {
        e.sensed = true;
        this.pointAt = { x: e.x, z: e.z };
        this.state = 'point';
        this.stateT = 1.8;
        G.audio?.sfx('yip', { pos: this.pos, pitch: 1.35 });
        G.hud.toast(`${NAME}'s ears perk up. An Echo is close by!`, 'echo');
      }
    }
    this.animate(dt);
  }

  finishDig() {
    const ep = G.epochs.current;
    const table = [['wood', 3], ['stone', 3], ['fiber', 3], ['herb', 1], ['iron', 1], ['tonic', 1], ['hide', 1]];
    if (ep === 1) table.push(['ember', 1], ['ember', 1]);
    if (ep === 2) table.push(['crystal', 1], ['crystal', 1]);
    const [id, max] = table[Math.floor(Math.random() * table.length)];
    const n = 1 + Math.floor(Math.random() * max);
    G.game.give(id, n);
    G.game.stat('digs');
    G.audio?.sfx('pickup', { pos: this.pos });
    G.hud.toast(`${NAME} dug up ${n > 1 ? n + '× ' : ''}${ITEMS[id]?.name || id}!`, 'good');
    this.state = 'happy';
    this.stateT = 1.2;
  }

  animate(dt) {
    const r = this.rig;
    const st = this.state === 'move' ? 'move' : this.state;
    r.animate(dt, this.state === 'move' ? this.speed : 0, st);
    if (this.swimming) r.body.position.y -= 0.12;
    r.root.position.copy(this.pos);
    r.root.rotation.y = this.yaw;
  }
}
