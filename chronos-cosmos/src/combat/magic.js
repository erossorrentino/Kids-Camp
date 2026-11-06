import * as THREE from 'three';
import { G } from '../core/G.js';
import { ELEMENTS } from './combat.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3();

export const SPELLS = [
  { el: 0, name: 'Ember Bolt', big: 'Starfire Meteor', cost: 12, bigCost: 38, desc: 'Sets foes ablaze. Fire on the ground lifts your glider.' },
  { el: 1, name: 'Frost Lance', big: 'Glacial Nova', cost: 12, bigCost: 34, desc: 'Chills, then freezes. Turns water into walkable ice.' },
  { el: 2, name: 'Chain Lightning', big: 'Thunder Call', cost: 16, bigCost: 40, desc: 'Arcs between foes. Detonates burning targets.' },
  { el: 3, name: 'Time Bubble', big: 'Stasis', cost: 28, bigCost: 45, desc: 'Slows everything inside. Stasis freezes one foe in time.' },
];

// Elemental spellcasting: tap to cast, hold to channel a greater spell,
// weave to imbue the blade. Mana regenerates quickly and is refunded by
// aggression (melee hits, parries) rather than gated by cooldowns.
export class Magic {
  constructor() {
    this.castHold = 0;
    this.bubbleMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xffe08a) } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5); float rings = 0.5 + 0.5 * sin(vP.y * 6.0 - uTime * 3.0); gl_FragColor = vec4(uColor * (1.5 + rings), f * 0.55 + 0.04); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
  }

  unlocked(el) {
    const u = G.game?.state?.elements;
    return !u || u[el];
  }

  aimPoint(P, range = 30) {
    const t = P.lockTarget || G.combat.autoTarget(P.pos, G.cam ? Math.atan2(-Math.sin(G.cam.yaw), -Math.cos(G.cam.yaw)) : P.yaw, range);
    if (t) return { point: new THREE.Vector3(t.pos.x, t.pos.y + t.height * 0.6, t.pos.z), target: t };
    // aim along the camera's view
    const cam = G.camera;
    cam.getWorldDirection(_d);
    const o = cam.position.clone();
    const hit = G.collision.raycast(o, _d, range + 10, { step: 1 });
    const pt = hit ? o.clone().addScaledVector(_d, hit.t) : o.clone().addScaledVector(_d, range);
    // water surface counts as a target for frost
    if (G.water && _d.y < 0) {
      const tw = (G.water.level - o.y) / _d.y;
      if (tw > 0 && (!hit || tw < hit.t) && tw < range + 10) return { point: o.clone().addScaledVector(_d, tw), water: true };
    }
    return { point: pt, target: null };
  }

  update(dt) {
    const P = G.player;
    const inp = G.input;
    this.bubbleMat.uniforms.uTime.value = G.time;
    if (P.dead || P.mode === 'locked' || G.ui?.blocking || G.build?.active) {
      this.castHold = 0;
      return;
    }
    // element select
    for (let i = 0; i < 4; i++) if (inp.hit('el' + (i + 1)) && this.unlocked(i)) this.select(i);
    if (inp.mouse.wheel && !G.build?.active) {
      let e = P.element;
      for (let k = 0; k < 4; k++) {
        e = (e + (inp.mouse.wheel > 0 ? 1 : 3)) % 4;
        if (this.unlocked(e)) break;
      }
      this.select(e);
    }
    if (inp.hit('nextEl') || inp.hit('prevEl')) {
      let e = P.element;
      for (let k = 0; k < 4; k++) {
        e = (e + (inp.hit('nextEl') ? 1 : 3)) % 4;
        if (this.unlocked(e)) break;
      }
      this.select(e);
    }
    const busy = P.action && !['parry'].includes(P.action.type);
    const canCast = (P.mode === 'ground' || P.mode === 'air' || P.mode === 'glide') && !busy;
    if (inp.down('cast') && canCast) {
      this.castHold += dt;
      if (this.castHold > 0.45 && !this.channelFx) {
        this.channelFx = true;
        G.audio?.sfx('charge', { pos: P.pos });
      }
      if (this.castHold > 0.45 && Math.random() < dt * 30) {
        const c = new THREE.Color(ELEMENTS[P.element].color);
        const a = Math.random() * Math.PI * 2;
        G.fx?.add.emit({ x: P.pos.x + Math.cos(a) * 1.2, y: P.pos.y + 0.3 + Math.random(), z: P.pos.z + Math.sin(a) * 1.2, vx: -Math.cos(a) * 2, vy: 1, vz: -Math.sin(a) * 2, life: 0.5, size: 0.15, size1: 0, color: [c.r * 3, c.g * 3, c.b * 3] });
      }
    }
    if (inp.up('cast')) {
      const held = this.castHold;
      this.castHold = 0;
      this.channelFx = false;
      if (canCast || (P.action && P.action.type === 'parry')) {
        if (held > 0.45) this.castBig(P);
        else this.cast(P);
      }
    }
    if (inp.hit('weave') && canCast) this.weave(P);
    // persistent zones
    G.world?.updateZones?.(dt);
  }

  select(i) {
    const P = G.player;
    if (P.element === i) return;
    P.element = i;
    G.audio?.sfx('select');
    G.hud?.elementChanged(i);
  }

  spend(P, cost) {
    const c = cost * (P.skills.has('weaver') ? 0.85 : 1);
    if (P.mana < c) {
      G.hud?.toast('Not enough aether', 'warn');
      G.audio?.sfx('fizzle');
      return false;
    }
    P.mana -= c;
    return true;
  }

  castOrigin(P) {
    return new THREE.Vector3(P.pos.x + Math.sin(P.yaw) * 0.5 + Math.cos(P.yaw) * 0.25, P.pos.y + 1.35, P.pos.z + Math.cos(P.yaw) * 0.5 - Math.sin(P.yaw) * 0.25);
  }

  cast(P) {
    const el = P.element;
    const sp = SPELLS[el];
    if (!this.spend(P, sp.cost)) return;
    const aim = this.aimPoint(P);
    const dx = aim.point.x - P.pos.x, dz = aim.point.z - P.pos.z;
    if (Math.hypot(dx, dz) > 0.5) P.yaw = Math.atan2(dx, dz);
    P.startAction({ type: 'cast', clip: P.clips.cast, dur: 0.42, allowMove: true, moveMul: 0.35 });
    P.combatT = 6;
    const from = this.castOrigin(P);
    G.game?.stat('spells');
    if (el === 0) {
      G.audio?.sfx('fireCast', { pos: P.pos });
      G.combat.spawnProjectile({
        from, to: aim.point, speed: 30, el: 0, color: 0xff7a2a, size: 0.32, dmg: P.attackPower * 1.1, poise: 10, target: aim.target, life: 2.5,
        onExplode: (p) => {
          G.fx.elementBurst(p.pos.x, p.pos.y, p.pos.z, 0, 0.7);
          G.audio?.sfx('fireHit', { pos: p.pos });
          G.combat.aoe(p.pos, 2.2, P.attackPower * 0.5, { source: P, el: 0, poise: 5, kind: 'spell' });
          const gh = G.terrain.heightAt(p.pos.x, p.pos.z);
          if (p.pos.y - gh < 1.5) G.world?.addFirePatch(p.pos.x, p.pos.z, 7, 2.2);
          G.world?.igniteAt?.(p.pos, 2.5);
        },
      });
    } else if (el === 1) {
      G.audio?.sfx('frostCast', { pos: P.pos });
      if (aim.water && !aim.target) {
        G.combat.spawnProjectile({ from, to: aim.point, speed: 32, el: 1, color: 0x8fe8ff, size: 0.26, dmg: 0, life: 2,
          onExplode: (p) => {
            G.water.addIce(p.pos.x, p.pos.z, 4.5);
            G.fx.elementBurst(p.pos.x, G.water.level, p.pos.z, 1, 0.8);
            G.audio?.sfx('freeze', { pos: p.pos });
          } });
        return;
      }
      G.combat.spawnProjectile({ from, to: aim.point, speed: 34, el: 1, color: 0x8fe8ff, size: 0.26, dmg: P.attackPower * 1.0, poise: 8, target: aim.target, life: 2.5, pierce: 1,
        onExplode: (p) => {
          G.fx.elementBurst(p.pos.x, p.pos.y, p.pos.z, 1, 0.6);
          if (G.water && Math.abs(p.pos.y - G.water.level) < 1) G.water.addIce(p.pos.x, p.pos.z, 4);
          G.world?.douseAt?.(p.pos, 3);
        } });
    } else if (el === 2) {
      G.audio?.sfx('thunder', { pos: P.pos, volume: 0.6 });
      // instant chain lightning
      let cur = aim.target || G.combat.autoTarget(P.pos, P.yaw, 18);
      let from2 = from;
      const hit = new Set();
      if (!cur) {
        G.fx.bolt(from, aim.point, 0xc39bff, 1, 0.2);
        G.combat.aoe(aim.point, 1.8, P.attackPower * 0.6, { source: P, el: 2, kind: 'spell' });
        G.world?.igniteAt?.(aim.point, 1.5, 'storm');
        return;
      }
      for (let k = 0; k < 3 && cur; k++) {
        hit.add(cur);
        const to = new THREE.Vector3(cur.pos.x, cur.pos.y + cur.height * 0.6, cur.pos.z);
        G.fx.bolt(from2, to, 0xc39bff, 1, 0.22);
        G.combat.damageEnemy(cur, P.attackPower * (1.15 - k * 0.2), { source: P, el: 2, poise: 10, kind: 'spell' });
        from2 = to;
        let nxt = null, nd = 7;
        for (const e of G.enemies) {
          if (e.dead || hit.has(e)) continue;
          const d = e.distTo(cur.pos);
          if (d < nd) { nd = d; nxt = e; }
        }
        cur = nxt;
      }
    } else if (el === 3) {
      G.audio?.sfx('chrono', { pos: P.pos });
      const pt = aim.target ? aim.target.pos.clone() : P.pos.clone();
      if (!aim.target && aim.point.distanceTo(P.pos) < 25) pt.copy(aim.point);
      pt.y = G.terrain.heightAt(pt.x, pt.z);
      this.addBubble(pt, 5.5, 6);
    }
  }

  castBig(P) {
    const el = P.element;
    const sp = SPELLS[el];
    if (!this.spend(P, sp.bigCost)) return;
    const aim = this.aimPoint(P, 35);
    const dx = aim.point.x - P.pos.x, dz = aim.point.z - P.pos.z;
    if (Math.hypot(dx, dz) > 0.5) P.yaw = Math.atan2(dx, dz);
    P.startAction({ type: 'castBig', clip: P.clips.castBig, dur: 0.8 });
    P.combatT = 6;
    G.game?.stat('spells');
    if (el === 0) {
      // meteor falls from the sky onto the aim point
      const tgt = aim.point.clone();
      tgt.y = Math.max(G.terrain.heightAt(tgt.x, tgt.z), tgt.y - 2);
      const from = tgt.clone().add(new THREE.Vector3(-8, 30, -6));
      G.fx.telegraph(tgt.x, G.terrain.heightAt(tgt.x, tgt.z), tgt.z, 5, 0.9, 0xff7a2a);
      G.audio?.sfx('meteor', { pos: tgt });
      G.after(0.35, () => {
        G.combat.spawnProjectile({ from, to: tgt, speed: 38, el: 0, color: 0xff6a1a, size: 1.1, dmg: 0, life: 3,
          onExplode: (p) => {
            G.fx.elementBurst(p.pos.x, p.pos.y, p.pos.z, 0, 2.2);
            G.fx.shockwave(p.pos.x, G.terrain.heightAt(p.pos.x, p.pos.z) + 0.2, p.pos.z, 6, 0xff8a3a);
            G.cam.shake(0.7);
            G.audio?.sfx('explosion', { pos: p.pos });
            G.combat.aoe(p.pos, 5.5, P.attackPower * 3.2, { source: P, el: 0, poise: 40, knock: 10, kind: 'spell' });
            G.world?.addFirePatch(p.pos.x, p.pos.z, 9, 4.5);
            G.world?.igniteAt?.(p.pos, 5);
          } });
      });
    } else if (el === 1) {
      G.audio?.sfx('nova', { pos: P.pos });
      G.fx.elementBurst(P.pos.x, P.pos.y + 0.5, P.pos.z, 1, 2);
      G.fx.ring(P.pos.x, P.pos.y + 0.2, P.pos.z, 7, 0x9fe6ff, 1, 0.6);
      for (const e of G.enemies) {
        if (e.dead) continue;
        if (e.distTo(P.pos) < 7) {
          G.combat.damageEnemy(e, P.attackPower * 1.6, { source: P, el: 1, poise: 25, kind: 'spell' });
          e.status.frozen = e.boss ? 1.5 : 4;
          e.chillStacks = 0;
        }
      }
      if (G.water && Math.abs(P.pos.y + 1.2 - G.water.level) < 2.5) G.water.addIce(P.pos.x, P.pos.z, 8);
      G.world?.douseAt?.(P.pos, 7);
    } else if (el === 2) {
      const tgt = aim.point.clone();
      const gh = G.terrain.heightAt(tgt.x, tgt.z);
      G.fx.telegraph(tgt.x, gh, tgt.z, 4.5, 0.6, 0xc39bff);
      G.after(0.6, () => {
        const top = new THREE.Vector3(tgt.x + 3, gh + 40, tgt.z - 2);
        const bot = new THREE.Vector3(tgt.x, gh, tgt.z);
        G.fx.bolt(top, bot, 0xd8c0ff, 2.5, 0.35, 20);
        G.fx.bolt(top.clone().add(new THREE.Vector3(-2, 0, 1)), bot, 0xd8c0ff, 1.5, 0.3, 16);
        G.fx.shockwave(bot.x, bot.y + 0.1, bot.z, 5, 0xc39bff);
        G.atmo.flash = 0.6;
        G.cam.shake(0.6);
        G.audio?.sfx('thunderBig', { pos: bot });
        G.combat.aoe(bot, 4.8, P.attackPower * 3, { source: P, el: 2, poise: 45, knock: 6, kind: 'spell' });
        G.world?.igniteAt?.(bot, 4, 'storm');
      });
    } else if (el === 3) {
      G.audio?.sfx('stasis', { pos: P.pos });
      const t = aim.target || G.combat.autoTarget(P.pos, P.yaw, 25);
      if (t) {
        t.status.frozen = t.boss ? 2 : 5;
        t.rig.setFlash(0.5, 0xffe08a);
        G.fx.elementBurst(t.pos.x, t.pos.y + 1, t.pos.z, 3, 1.5);
        G.fx.damageNumber(t.pos.x, t.pos.y + t.height + 0.8, t.pos.z, 0, '#ffe48a', true, 'STASIS');
        this.addBubble(t.pos.clone(), 2.2, t.boss ? 2 : 5);
      } else {
        this.addBubble(P.pos.clone(), 9, 6);
      }
    }
  }

  weave(P) {
    if (!this.spend(P, 25)) return;
    const el = P.element;
    P.imbue = { el, t: P.skills.has('weaver') ? 16 : 11 };
    G.audio?.sfx('weave', { pos: P.pos });
    const c = ELEMENTS[el].color;
    G.fx.elementBurst(P.pos.x, P.pos.y + 1.2, P.pos.z, el, 0.5);
    G.fx.healBurst(P.pos, c);
    G.hud?.toast(`${ELEMENTS[el].name} woven into your blade`, 'el' + el);
    P.rig.sheathe(false);
    P.combatT = 6;
  }

  addBubble(pos, r, dur) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.bubbleMat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(0.1);
    mesh.renderOrder = 7;
    G.scene.add(mesh);
    G.world?.zones.push({ type: 'bubble', pos: pos.clone(), r, t: dur, dur, mesh });
    G.fx.elementBurst(pos.x, pos.y + 1, pos.z, 3, 1);
  }
}
