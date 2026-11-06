import * as THREE from 'three';
import { G } from '../core/G.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
export const ELEMENTS = [
  { id: 0, key: 'ember', name: 'Ember', color: 0xff7a2a, css: '#ff8a4c', glyph: '🜂' },
  { id: 1, key: 'frost', name: 'Frost', color: 0x8fe8ff, css: '#9fe6ff', glyph: '🜄' },
  { id: 2, key: 'storm', name: 'Storm', color: 0xc39bff, css: '#c9a8ff', glyph: '🜁' },
  { id: 3, key: 'chrono', name: 'Chrono', color: 0xffe08a, css: '#f6d77a', glyph: '⧗' },
];

export class Combat {
  constructor() {
    this.tokens = new Set();
    this.maxTokens = 2;
    this.projectiles = [];
    this.glints = [];
    this.slowT = 0;
    this.slowScale = 1;
    this.projGeo = new THREE.IcosahedronGeometry(1, 1);
  }

  // ------------------------------------------------------------ tokens
  requestToken(e) {
    if (this.tokens.has(e)) return true;
    const max = e.boss ? 99 : this.maxTokens;
    if (this.tokens.size >= max && !e.boss) return false;
    this.tokens.add(e);
    return true;
  }
  releaseToken(e) { this.tokens.delete(e); }
  hasToken(e) { return this.tokens.has(e); }
  tokensFull() {
    for (const e of this.tokens) if (e.dead || e.removed) this.tokens.delete(e);
    return this.tokens.size >= this.maxTokens;
  }
  alertNearby(src) {
    for (const e of G.enemies) {
      if (e !== src && !e.dead && e.state === 'idle' && e.distTo(src.pos) < 18) e.setAlert();
    }
  }

  glint(pos, kind, owner) {
    const color = kind === 'red' ? [5, 0.6, 0.4] : [5, 4, 1.6];
    G.fx?.add.emit({ x: pos.x, y: pos.y, z: pos.z, life: 0.35, size: 1.6, size1: 0.2, color, shape: 2 });
    G.fx?.add.emit({ x: pos.x, y: pos.y, z: pos.z, life: 0.2, size: 3, size1: 4, color: kind === 'red' ? [1, 0.1, 0.05] : [1, 0.8, 0.3], alpha: 0.5 });
    G.audio?.sfx(kind === 'red' ? 'danger' : 'glint', { pos });
  }

  // ------------------------------------------------------------ targeting
  autoTarget(pos, yaw, range) {
    let best = null, bs = -1;
    for (const e of G.enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > range) continue;
      const dot = (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / (d || 1);
      const score = dot * 2 - d / range;
      if (dot > 0.3 && score > bs) { bs = score; best = e; }
    }
    return best;
  }
  toggleLock() {
    const P = G.player;
    if (P.lockTarget) {
      P.lockTarget = null;
      return;
    }
    const camYaw = G.cam.yaw;
    const fyaw = Math.atan2(-Math.sin(camYaw), -Math.cos(camYaw));
    let best = null, bs = -1e9;
    for (const e of G.enemies) {
      if (e.dead) continue;
      const d = e.distTo(P.pos);
      if (d > (e.boss ? 60 : 28)) continue;
      const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
      const dot = (dx * Math.sin(fyaw) + dz * Math.cos(fyaw)) / (d || 1);
      const score = dot * 3 - d / 10 + (e.boss ? 5 : 0);
      if (score > bs) { bs = score; best = e; }
    }
    P.lockTarget = best;
    if (best) G.audio?.sfx('lock');
  }
  nextLock(fromDeath) {
    const P = G.player;
    const cur = P.lockTarget;
    let best = null, bd = 1e9;
    for (const e of G.enemies) {
      if (e.dead || e === cur) continue;
      const d = e.distTo(P.pos);
      if (d < 25 && d < bd) { bd = d; best = e; }
    }
    P.lockTarget = best || (fromDeath ? null : cur);
  }

  // ------------------------------------------------------------ player hits
  playerSwing(P, a) {
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
    for (const e of G.enemies) {
      if (e.dead || a.hitSet.has(e)) continue;
      const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
      const d = Math.hypot(dx, dz) - e.radius;
      if (d > a.reach) continue;
      if (Math.abs(e.pos.y + e.height * 0.5 - (P.pos.y + 1)) > e.height * 0.5 + 1.4) continue;
      const dot = (dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1);
      if (Math.acos(Math.max(-1, Math.min(1, dot))) > a.arc) continue;
      a.hitSet.add(e);
      const dmg = P.attackPower * a.dmg * (0.92 + Math.random() * 0.16);
      this.damageEnemy(e, dmg, { source: P, poise: 12 * a.poise, el: a.el, melee: true, kind: a.name, knock: a.name === 'heavy' || a.name === 'finisher' ? 6 : 2.5 });
      P.mana = Math.min(P.maxMana, P.mana + 4);
    }
    // destructibles (trees, rocks, crystals, barrels)
    if (!a.harvested) {
      const hx = P.pos.x + fx * 1.2, hz = P.pos.z + fz * 1.2;
      const t = G.world?.harvestTarget(hx, hz, 1.6, P.pos.y);
      if (t) {
        a.harvested = true;
        this.harvestHit(P, t, a);
      }
    }
  }

  harvestHit(P, t, a) {
    if (!t) return;
    G.world?.harvest(t, P, a);
  }

  damageEnemy(e, dmg, o = {}) {
    if (e.dead || e.invuln) return 0;
    let mult = 1;
    let label = null;
    const st = e.status;
    const el = o.el ?? -1;
    // elemental reactions
    if (el === 0 && st.frozen > 0) {
      mult *= 2.6;
      st.frozen = 0;
      label = 'THERMAL SHOCK';
      G.fx?.elementBurst(e.pos.x, e.pos.y + 1, e.pos.z, 1, 1.2);
      for (let i = 0; i < 12; i++) G.fx?.smoke(e.pos.x, e.pos.y + 1, e.pos.z, 1.2, [0.8, 0.85, 0.9]);
    } else if (el === 2 && st.burn > 0) {
      mult *= 1.5;
      label = 'PLASMA BURST';
      st.burn = 0;
      G.fx?.elementBurst(e.pos.x, e.pos.y + 1, e.pos.z, 0, 1.4);
      G.fx?.elementBurst(e.pos.x, e.pos.y + 1, e.pos.z, 2, 1.2);
      this.aoe(e.pos, 4.5, dmg * 1.2, { source: o.source, poise: 20, exclude: e, kind: 'reaction' });
    } else if (el === 2 && (st.chill > 0 || st.frozen > 0)) {
      mult *= 1.8;
      label = 'SHATTERSTORM';
      st.shock = 2.5;
    } else if (el === 3 && (st.burn > 0 || st.chill > 0 || st.shock > 0)) {
      mult *= 1.4;
      label = 'TIME FRACTURE';
      st.fracture = 6;
    }
    if (st.fracture > 0) mult *= 1.5;
    if (st.frozen > 0 && o.melee && (o.kind === 'heavy' || o.kind === 'slash3' || o.kind === 'plunge')) {
      mult *= 2;
      label = label || 'SHATTER';
      st.frozen = 0;
    }
    if (e.def?.weak !== undefined && e.def.weak === el) mult *= 1.5;
    if (e.staggered) mult *= 1.4;
    const armor = e.def?.armor || 0;
    if (!o.dot) mult *= 1 - armor * (o.melee && o.kind === 'heavy' ? 0.5 : 1);
    const final = dmg * mult;
    e.hp -= final;
    e.lastHitBy = o.source || null;
    // apply statuses
    if (el === 0) st.burn = Math.max(st.burn, 4);
    if (el === 1) {
      st.chill = 4;
      e.chillStacks = (e.chillStacks || 0) + 1;
      if (e.chillStacks >= (e.boss ? 6 : 2)) {
        st.frozen = e.boss ? 1.5 : 3.5;
        e.chillStacks = 0;
        G.audio?.sfx('freeze', { pos: e.pos });
      }
    }
    if (el === 2) {
      st.shock = Math.max(st.shock, 1.2);
      if (!e.boss && Math.random() < 0.5) e.stagger?.(0.5);
    }
    if (el === 3) st.slow = Math.max(st.slow, 4);
    // feedback
    const col = el >= 0 ? ['#ffa45c', '#a6eaff', '#d4b6ff', '#ffe48a'][el] : o.color || (mult > 1.3 ? '#ffd86b' : '#ffffff');
    const hp = new THREE.Vector3(e.pos.x, e.pos.y + e.height * 0.7, e.pos.z);
    G.fx?.damageNumber(hp.x, hp.y + 0.5, hp.z, final, col, mult > 1.3);
    if (label) {
      G.fx?.damageNumber(hp.x, hp.y + 1.1, hp.z, 0, '#fff2c0', true, label);
      G.audio?.sfx('reaction', { pos: e.pos });
    }
    if (!o.dot) {
      e.flash = 1;
      e.flashColor = 0xffffff;
      G.fx?.hitBurst(hp.x, hp.y, hp.z, el >= 0 ? ELEMENTS[el].color : 0xfff0d0, o.kind === 'heavy' ? 1.6 : 1);
      if (el >= 0) G.fx?.elementBurst(hp.x, hp.y, hp.z, el, 0.4);
      G.audio?.sfx(e.def?.kind === 'golem' || e.def?.armor ? 'hitMetal' : 'hit', { pos: e.pos, pitch: 0.85 + Math.random() * 0.3 });
      if (o.melee) {
        G.hitstop = Math.max(G.hitstop, o.kind === 'heavy' || o.kind === 'finisher' ? 0.11 : 0.055);
        G.cam?.shake(o.kind === 'heavy' || o.kind === 'finisher' ? 0.35 : 0.14);
      }
      // poise
      if (!o.noFlinch) {
        e.poise -= o.poise || 10;
        if (e.poise <= 0 && !e.staggered) {
          e.stagger?.(e.boss ? 3 : 2.2, true);
          if (!e.boss) G.fx?.damageNumber(hp.x, hp.y + 1.5, hp.z, 0, '#ffd86b', true, 'POSTURE BROKEN');
          else G.fx?.damageNumber(hp.x, hp.y + 2.5, hp.z, 0, '#ffd86b', true, 'STAGGERED');
          G.audio?.sfx('posture', { pos: e.pos });
        } else if (!e.boss && e.state !== 'attack' && final > e.maxHp * 0.08) {
          e.stagger?.(0.35, false);
        }
      }
      if (o.knock && !e.boss && o.source) {
        const kx = e.pos.x - o.source.pos.x, kz = e.pos.z - o.source.pos.z, kl = Math.hypot(kx, kz) || 1;
        e.vel.x += (kx / kl) * o.knock;
        e.vel.z += (kz / kl) * o.knock;
      }
      if (e.state === 'idle' || e.state === 'return') e.setAlert?.();
    }
    if (e.hp <= 0) {
      e.hp = 0;
      e.die(o.source || G.player);
      if (o.melee) {
        G.hitstop = Math.max(G.hitstop, 0.12);
        G.slowmo(0.4, 0.25);
      }
    }
    return final;
  }

  aoe(center, r, dmg, o = {}) {
    let n = 0;
    for (const e of G.enemies) {
      if (e.dead || e === o.exclude) continue;
      const d = Math.hypot(e.pos.x - center.x, e.pos.z - center.z) - e.radius;
      if (d > r || Math.abs(e.pos.y - center.y) > 4) continue;
      this.damageEnemy(e, dmg * (1 - (d / r) * 0.4), { ...o, melee: false });
      n++;
    }
    G.world?.aoeHit?.(center, r, o);
    return n;
  }

  applyElementToPlayer(el, chance = 1) {
    if (Math.random() > chance) return;
    const P = G.player;
    if (el === 0) {
      P.burnT = 2.5;
    } else if (el === 1) {
      P.speedMul = 0.6;
      G.after(2.5, () => (P.speedMul = 1));
    } else if (el === 2) {
      P.mana = Math.max(0, P.mana - 15);
    }
  }

  parrySuccess(P, src, opts) {
    G.audio?.sfx('parry', { pos: P.pos });
    const hx = (P.pos.x + src.pos.x) / 2, hz = (P.pos.z + src.pos.z) / 2;
    G.fx?.sparks(hx, P.pos.y + 1.3, hz, 30, 0xfff0b0, 9);
    G.fx?.flashLight(hx, P.pos.y + 1.5, hz, 0xfff0b0, 25, 0.25);
    G.cam?.shake(0.25);
    this.slowmo(0.15, 0.35);
    G.hitstop = 0.1;
    if (src && src.poise !== undefined && !opts?.projectile) {
      src.poise -= src.boss ? src.maxPoise * 0.25 : src.maxPoise * 0.75;
      if (src.poise <= 0) src.stagger(src.boss ? 2.5 : 2.4, true);
      else src.stagger?.(src.boss ? 0.6 : 1.0, false);
      if (P.skills.has('riposte')) this.damageEnemy(src, P.attackPower * 1.2, { source: P, poise: 10, melee: true, kind: 'riposte' });
    }
    G.fx?.damageNumber(hx, P.pos.y + 2.4, hz, 0, '#fff2c0', true, 'PARRY');
    G.game?.stat('parries');
  }

  perfectDodge(P, src) {
    G.audio?.sfx('timeslip');
    const dur = P.skills.has('timeslip') ? 3 : 2;
    G.worldSlow = { t: dur, scale: 0.25 };
    G.fx?.damageNumber(P.pos.x, P.pos.y + 2.2, P.pos.z, 0, '#bfe8ff', true, 'TIMESLIP');
    G.fx?.motes(P.pos.x, P.pos.y, P.pos.z, 30, 0xbfe8ff);
    G.game?.stat('timeslips');
  }

  slowmo(scale, dur) {
    this.slowT = dur;
    this.slowScale = scale;
  }

  // ------------------------------------------------------------ projectiles
  spawnProjectile(o) {
    const color = o.color || 0xffffff;
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3) });
    const mesh = new THREE.Mesh(this.projGeo, m);
    mesh.scale.setScalar(o.size || 0.3);
    mesh.position.copy(o.from);
    G.scene.add(mesh);
    const dir = new THREE.Vector3().subVectors(o.to, o.from).normalize();
    const p = { ...o, mesh, pos: o.from.clone(), vel: dir.multiplyScalar(o.speed || 20), life: o.life || 4, reflected: false };
    this.projectiles.push(p);
    return p;
  }

  updateProjectiles(dt) {
    const P = G.player;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.homing && p.hostile && !p.reflected) {
        _v.set(P.pos.x - p.pos.x, P.pos.y + 1.1 - p.pos.y, P.pos.z - p.pos.z).normalize().multiplyScalar(p.speed);
        p.vel.lerp(_v, Math.min(1, dt * p.homing));
      }
      if (p.target && !p.target.dead) {
        _v.set(p.target.pos.x - p.pos.x, p.target.pos.y + p.target.height * 0.6 - p.pos.y, p.target.pos.z - p.pos.z).normalize().multiplyScalar(p.speed);
        p.vel.lerp(_v, Math.min(1, dt * 6));
      }
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      const c = new THREE.Color(p.color || 0xffffff);
      if (Math.random() < 0.9) G.fx?.add.emit({ x: p.pos.x, y: p.pos.y, z: p.pos.z, vx: (Math.random() - 0.5), vy: (Math.random() - 0.5), vz: (Math.random() - 0.5), life: 0.35, size: (p.size || 0.3) * 2.2, size1: 0.05, color: [c.r * 3, c.g * 3, c.b * 3] });
      let done = p.life <= 0;
      // terrain
      if (!done && p.pos.y < G.terrain.heightAt(p.pos.x, p.pos.z)) done = true;
      if (!done && G.collision.pointInside(p.pos.x, p.pos.y, p.pos.z)) done = true;
      if (!done && p.hostile && !p.reflected) {
        const d = Math.hypot(P.pos.x - p.pos.x, P.pos.z - p.pos.z);
        if (d < 0.7 && p.pos.y > P.pos.y && p.pos.y < P.pos.y + 2) {
          const r = P.receiveAttack(p.dmg, p.owner, { parryable: p.parryable, projectile: true });
          if (r === 'parry') {
            // reflect back to sender
            p.reflected = true;
            p.target = p.owner;
            p.vel.multiplyScalar(-1.4);
            p.life = 3;
            G.fx?.damageNumber(P.pos.x, P.pos.y + 2.6, P.pos.z, 0, '#bfe8ff', true, 'DEFLECT');
            continue;
          }
          if (r === 'dodge' || r === 'perfect') continue;
          if (r === 'hit' && p.el !== undefined) this.applyElementToPlayer(p.el, 0.6);
          done = true;
        }
      }
      if (!done && (!p.hostile || p.reflected)) {
        for (const e of G.enemies) {
          if (e.dead || (e === p.owner && !p.reflected)) continue;
          const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
          if (d < e.radius + (p.size || 0.3) + 0.3 && p.pos.y > e.pos.y - 0.3 && p.pos.y < e.pos.y + e.height + 0.5) {
            const dm = p.reflected ? p.dmg * 2.5 : p.dmg;
            this.damageEnemy(e, dm, { source: G.player, el: p.el ?? -1, poise: p.poise || 8, kind: 'spell' });
            if (p.onHit) p.onHit(p, e);
            if (!p.pierce) { done = true; break; }
            p.pierce--;
          }
        }
      }
      if (done) {
        if (p.onExplode) p.onExplode(p);
        else G.fx?.hitBurst(p.pos.x, p.pos.y, p.pos.z, p.color || 0xffffff, 0.8);
        G.scene.remove(p.mesh);
        p.mesh.material.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  clearProjectiles() {
    for (const p of this.projectiles) {
      G.scene.remove(p.mesh);
      p.mesh.material.dispose();
    }
    this.projectiles.length = 0;
  }

  update(dt) {
    this.updateProjectiles(dt);
    // player burning
    const P = G.player;
    if (P.burnT > 0) {
      P.burnT -= dt;
      P._burnTick = (P._burnTick || 0) + dt;
      if (P._burnTick > 0.5) {
        P._burnTick = 0;
        P.takeDamage(2.5, null, { blocked: false, fall: true });
      }
      if (Math.random() < dt * 15) G.fx?.fire(P.pos.x, P.pos.y + Math.random() * 1.6, P.pos.z, 0.5);
      if (P.mode === 'swim') P.burnT = 0;
    }
    for (const e of this.tokens) if (e.dead || e.removed || e.state !== 'attack') this.tokens.delete(e);
  }
}
