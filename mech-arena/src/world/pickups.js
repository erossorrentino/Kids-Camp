/**
 * BATTLEFIELD PICKUPS
 * ------------------------------------------------------------------
 * Resupply pads scattered around the arena. They exist to pull fights out
 * of a stalemate: a mech that is out of ammo, cooking, or down to
 * structure has somewhere specific to go, and the enemy knows where.
 *
 * Pads are permanent map features that go dormant for a while after use,
 * so their positions are worth learning.
 */
import * as THREE from 'three';
import { clamp } from '../core/rng.js';

export const PICKUP_TYPES = {
  coolant: {
    id:'coolant', label:'COOLANT', color:0x7cd8ff, icon:'❄',
    respawn:22, radius:5.5,
    desc:'Flushes 55% of your current heat.',
    apply(mech) {
      if (mech.heat < mech.heatCapacity * 0.08) return false;
      mech.heat *= 0.45;
      if (mech.shutdown) mech.shutdownTimer = Math.min(mech.shutdownTimer, 0.35);
      return true;
    },
  },
  ammo: {
    id:'ammo', label:'AMMO', color:0xffb454, icon:'▣',
    respawn:26, radius:5.5,
    desc:'Restores 45% of every magazine-fed weapon\'s reserve.',
    apply(mech) {
      let used = false;
      for (const w of mech.weapons) {
        if (!w || w.destroyed || w.def.ammo < 0) continue;
        const max = Math.round(w.def.ammo * (1 + (mech.mods.ammo || 0)));
        if (w.ammo >= max) continue;
        w.ammo = Math.min(max, w.ammo + Math.round(max * 0.45));
        used = true;
      }
      return used;
    },
  },
  repair: {
    id:'repair', label:'FIELD REPAIR', color:0x5df2a0, icon:'✚',
    respawn:34, radius:5.5,
    desc:'Welds back 22% of your maximum structure.',
    apply(mech) {
      if (mech.healthFraction > 0.985) return false;
      mech.repair(mech.maxTotal * 0.22);
      return true;
    },
  },
  shield: {
    id:'shield', label:'SHIELD CELL', color:0xb47cff, icon:'◈',
    respawn:30, radius:5.5,
    desc:'Charges a 260-point energy shield.',
    apply(mech) {
      const amount = 260 * (1 + mech.shieldBonus);
      if (mech.shield >= amount * 0.95) return false;
      mech.maxShield = Math.max(mech.maxShield, amount);
      mech.shield = mech.maxShield;
      mech.shieldRegenDelay = 0;
      return true;
    },
  },
};

const TYPE_LIST = Object.values(PICKUP_TYPES);

export class Pickups {
  /**
   * @param {Arena} world
   * @param {FX} fx
   * @param {Audio} audio
   * @param {number} count how many pads to place
   */
  constructor(world, fx, audio, count = 8) {
    this.world = world;
    this.fx = fx;
    this.audio = audio;
    this.pads = [];
    this.group = new THREE.Group();
    this.group.name = 'pickups';
    world.group.add(this.group);
    this._build(count);
  }

  _build(count) {
    const rng = this.world.rng;
    const ringGeo = new THREE.RingGeometry(3.4, 5.2, 28);
    ringGeo.rotateX(-Math.PI / 2);
    const coreGeo = new THREE.OctahedronGeometry(1.5, 0);
    const beamGeo = new THREE.CylinderGeometry(3.2, 3.2, 22, 18, 1, true);

    const placed = [];
    for (let i = 0; i < count; i++) {
      const type = TYPE_LIST[i % TYPE_LIST.length];
      let pos = null;
      for (let tries = 0; tries < 26; tries++) {
        const a = rng.range(0, Math.PI * 2);
        const r = rng.range(this.world.half * 0.12, this.world.half * 0.78);
        const p = this.world.findStandable(Math.cos(a) * r, Math.sin(a) * r, 60, 9);
        if (placed.some(q => q.distanceTo(p) < 55)) continue;
        pos = p;
        break;
      }
      if (!pos) continue;
      placed.push(pos);

      const holder = new THREE.Group();
      holder.position.copy(pos).setY(pos.y + 0.3);

      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: type.color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false,
      }));
      holder.add(ring);

      const core = new THREE.Mesh(coreGeo, new THREE.MeshStandardMaterial({
        color: type.color, emissive: type.color, emissiveIntensity: 2.2, roughness: 0.3, metalness: 0.4,
      }));
      core.position.y = 3.2;
      core.castShadow = true;
      holder.add(core);

      const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
        color: type.color, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false,
      }));
      beam.position.y = 11;
      holder.add(beam);

      this.group.add(holder);
      this.pads.push({
        type, pos: pos.clone(), holder, ring, core, beam,
        cooldown: 0, phase: rng.range(0, 6.28),
      });
    }
  }

  /** @returns {{pad:object, mech:Mech}|null} whatever was collected this tick */
  update(dt, mechs, onCollect) {
    for (const pad of this.pads) {
      pad.phase += dt;
      const live = pad.cooldown <= 0;

      if (!live) {
        pad.cooldown -= dt;
        if (pad.cooldown <= 0) {
          pad.cooldown = 0;
          this.fx.ring(pad.pos.clone().setY(pad.pos.y + 0.4), 1, pad.type.radius * 1.6, pad.type.color, 0.5);
        }
      }

      // Dormant pads dim rather than vanish, so their position stays learnable.
      const lit = live ? 1 : 0.16;
      pad.ring.material.opacity = (0.45 + Math.sin(pad.phase * 2.2) * 0.15) * lit;
      pad.beam.material.opacity = 0.09 * lit;
      pad.core.material.emissiveIntensity = (live ? 2.2 : 0.3) + Math.sin(pad.phase * 3) * 0.3 * lit;
      pad.core.rotation.y += dt * 1.3;
      pad.core.rotation.x += dt * 0.7;
      pad.core.position.y = 3.2 + Math.sin(pad.phase * 1.6) * 0.45;
      pad.core.visible = live || pad.cooldown < 3;

      if (!live) continue;

      for (const m of mechs) {
        if (!m.alive) continue;
        if (Math.abs(m.position.y - pad.pos.y) > 12) continue;
        if (Math.hypot(m.position.x - pad.pos.x, m.position.z - pad.pos.z) > pad.type.radius + m.radius) continue;
        if (!pad.type.apply(m)) continue;     // no effect: leave it for someone who needs it
        pad.cooldown = pad.type.respawn;
        this.fx.ring(pad.pos.clone().setY(pad.pos.y + 0.4), pad.type.radius, 1, pad.type.color, 0.4);
        this.fx.burst(m.position.clone().setY(m.position.y + m.height * 0.4), 18, {
          speed: 7, life: 0.6, size: 0.5, size1: 0, color: pad.type.color, color1: 0x101820, drag: 2, grav: -2,
        });
        this.audio.play('deploy', m.position);
        onCollect?.(pad, m);
        break;
      }
    }
  }

  /** Nearest live pad of any type, for bots and for the HUD compass. */
  nearestLive(pos, typeId = null) {
    let best = null, bestD = Infinity;
    for (const pad of this.pads) {
      if (pad.cooldown > 0) continue;
      if (typeId && pad.type.id !== typeId) continue;
      const d = pad.pos.distanceTo(pos);
      if (d < bestD) { bestD = d; best = pad; }
    }
    return best;
  }

  dispose() {
    this.group.traverse(o => {
      if (o.isMesh) { o.geometry?.dispose?.(); o.material?.dispose?.(); }
    });
    this.group.parent?.remove(this.group);
    this.pads.length = 0;
  }
}
