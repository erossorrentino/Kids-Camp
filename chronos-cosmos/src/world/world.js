import * as THREE from 'three';
import { G } from '../core/G.js';
import { ITEMS } from '../game/items.js';

const _v = new THREE.Vector3();

// Pickup visuals per item
function pickupMesh(id) {
  const c = new THREE.Color(ITEMS[id]?.color || '#ffffff');
  let geo, emissive = 0.25;
  switch (id) {
    case 'wood': geo = new THREE.CylinderGeometry(0.12, 0.12, 0.55, 7); geo.rotateZ(Math.PI / 2); break;
    case 'stone': geo = new THREE.DodecahedronGeometry(0.18, 0); break;
    case 'iron': geo = new THREE.BoxGeometry(0.32, 0.12, 0.16); emissive = 0.15; break;
    case 'crystal': geo = new THREE.OctahedronGeometry(0.2, 0); geo.scale(0.7, 1.3, 0.7); emissive = 1.6; break;
    case 'ember': geo = new THREE.IcosahedronGeometry(0.16, 1); emissive = 2.5; break;
    case 'herb': geo = new THREE.ConeGeometry(0.16, 0.25, 6); geo.rotateX(Math.PI); emissive = 1.2; break;
    case 'starShard': geo = new THREE.OctahedronGeometry(0.2, 0); emissive = 3; break;
    case 'hide': geo = new THREE.BoxGeometry(0.4, 0.05, 0.3); break;
    case 'fiber': geo = new THREE.TorusGeometry(0.13, 0.05, 5, 10); break;
    default: geo = new THREE.SphereGeometry(0.16, 10, 8); emissive = 1.2;
  }
  const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: emissive, roughness: 0.5, metalness: id === 'iron' ? 0.8 : 0 });
  const mesh = new THREE.Mesh(geo, m);
  mesh.castShadow = true;
  return mesh;
}

export class World {
  constructor() {
    this.zones = [];
    this.updrafts = [];
    this.staticUpdrafts = [];
    this.pickups = [];
    this.interactables = [];
    this.destructibles = []; // barrels, braziers etc {pos, r, onHit, onIgnite}
    this.fallingTrees = [];
    this.lights = [];
  }

  addUpdraft(x, z, r, top, strength, isStatic = true) {
    const u = { x, z, r, top, strength };
    (isStatic ? this.staticUpdrafts : this.updrafts).push(u);
    this.rebuildUpdrafts();
    return u;
  }
  rebuildUpdrafts() {
    this.updraftsAll = this.staticUpdrafts.concat(this.zones.filter((z) => z.type === 'fire').map((z) => ({ x: z.x, z: z.z, r: z.r * 1.4, top: z.y + 40, strength: 9 })));
  }
  get updraftList() {
    return this.updraftsAll || [];
  }

  addInteractable(o) {
    // o: {pos, r, label, verb, action, cond, epoch}
    this.interactables.push(o);
    return o;
  }
  removeInteractable(o) {
    const i = this.interactables.indexOf(o);
    if (i >= 0) this.interactables.splice(i, 1);
  }
  nearestInteractable(p) {
    let best = null, bd = 1e9;
    for (const o of this.interactables) {
      if (o.disabled) continue;
      if (o.epochs && !o.epochs.includes(G.epochs.current)) continue;
      if (o.cond && !o.cond()) continue;
      const pos = o.getPos ? o.getPos() : o.pos;
      const d = Math.hypot(p.x - pos.x, p.z - pos.z);
      if (d < (o.r || 2.2) && Math.abs(p.y - pos.y) < (o.dy || 3) && d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // ---------------------------------------------------------------- loot
  drop(x, y, z, id, n = 1) {
    for (let i = 0; i < n; i++) {
      const mesh = pickupMesh(id);
      mesh.position.set(x, y + 0.8, z);
      G.scene.add(mesh);
      const a = Math.random() * Math.PI * 2;
      this.pickups.push({ id, mesh, vel: new THREE.Vector3(Math.cos(a) * 2.5, 4 + Math.random() * 2, Math.sin(a) * 2.5), t: 0, settled: false });
    }
  }
  dropFrom(e) {
    for (const [id, a, b, p] of e.def.drops || []) {
      if (Math.random() > p) continue;
      const n = a + Math.floor(Math.random() * (b - a + 1));
      this.drop(e.pos.x, e.pos.y, e.pos.z, id, n);
    }
  }
  updatePickups(dt) {
    const P = G.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      k.t += dt;
      const m = k.mesh;
      const d = m.position.distanceTo(_v.set(P.pos.x, P.pos.y + 0.9, P.pos.z));
      if (k.t > 0.6 && d < 4.5 && !P.dead) {
        // magnet
        _v.sub(m.position).normalize().multiplyScalar(Math.min(18, 6 + k.t * 6));
        k.vel.lerp(_v, Math.min(1, dt * 8));
        m.position.addScaledVector(k.vel, dt);
        if (d < 0.7) {
          G.game?.give(k.id, 1, true);
          G.audio?.sfx('pickup', { pitch: 0.9 + Math.random() * 0.3 });
          G.fx?.add.emit({ x: m.position.x, y: m.position.y, z: m.position.z, life: 0.25, size: 0.8, size1: 0.1, color: [3, 3, 2], shape: 2 });
          G.scene.remove(m);
          m.geometry.dispose();
          m.material.dispose();
          this.pickups.splice(i, 1);
          continue;
        }
      } else if (!k.settled) {
        k.vel.y -= 18 * dt;
        m.position.addScaledVector(k.vel, dt);
        const gh = G.collision.groundAt(m.position.x, m.position.z, m.position.y + 0.5, 0.1).h + 0.2;
        if (m.position.y < gh) {
          m.position.y = gh;
          if (Math.abs(k.vel.y) < 2) k.settled = true;
          k.vel.y = -k.vel.y * 0.35;
          k.vel.x *= 0.5;
          k.vel.z *= 0.5;
        }
      } else {
        m.position.y += Math.sin(G.time * 3 + i) * 0.004;
      }
      m.rotation.y += dt * 2;
      if (k.t > 120) {
        G.scene.remove(m);
        this.pickups.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------ harvesting
  harvestTarget(x, z, r, y) {
    const V = G.veg;
    let best = null, bd = r;
    const ep = G.epochs.current;
    // trees only harvestable where they have wood (all ages) — dead trees give charwood
    for (const t of V.trees) {
      if (!t.alive) continue;
      if (Math.abs(t.x - x) > r + 1 || Math.abs(t.z - z) > r + 1) continue;
      const d = Math.hypot(t.x - x, t.z - z) - 0.4 * t.s;
      if (d < bd && Math.abs(t.y - y) < 3) { bd = d; best = { kind: 'tree', o: t }; }
    }
    for (const k of V.rocks) {
      if (!k.alive || k.s < 0.6 || k.s > 2.6) continue;
      if (Math.abs(k.x - x) > r + 3 || Math.abs(k.z - z) > r + 3) continue;
      const d = Math.hypot(k.x - x, k.z - z) - k.s * 0.8;
      if (d < bd && Math.abs(k.y - y) < 3) { bd = d; best = { kind: 'rock', o: k }; }
    }
    if (ep === 2) {
      for (const c of V.crystals) {
        if (!c.alive) continue;
        const d = Math.hypot(c.x - x, c.z - z) - 0.5;
        if (d < bd && Math.abs(c.y - y) < 3) { bd = d; best = { kind: 'crystal', o: c }; }
      }
    }
    for (const dz of this.destructibles) {
      if (dz.dead) continue;
      if (dz.epochs && !dz.epochs.includes(ep)) continue;
      const d = Math.hypot(dz.pos.x - x, dz.pos.z - z) - (dz.r || 0.5);
      if (d < bd && Math.abs(dz.pos.y - y) < 3) { bd = d; best = { kind: 'destructible', o: dz }; }
    }
    return best;
  }

  harvest(t, P) {
    const o = t.o;
    const ep = G.epochs.current;
    if (t.kind === 'tree') {
      o.hp -= 1;
      G.audio?.sfx('chop', { pos: o });
      G.fx?.sparks(o.x, o.y + 1.2, o.z, 6, 0xc8a070, 3);
      G.cam?.shake(0.08);
      if (o.hp <= 0) this.fellTree(o, P);
    } else if (t.kind === 'rock') {
      o.hp -= 1;
      G.audio?.sfx('mine', { pos: o });
      G.fx?.sparks(o.x, o.y + o.s * 0.5, o.z, 10, 0xffe0a0, 5);
      G.cam?.shake(0.1);
      if (o.hp <= 0) {
        o.alive = false;
        G.veg.refreshRock(o);
        G.fx?.dust(o.x, o.y, o.z, 1.5);
        for (let i = 0; i < 14; i++) G.fx?.norm.emit({ x: o.x, y: o.y + 0.5, z: o.z, vx: (Math.random() - 0.5) * 6, vy: 3 + Math.random() * 4, vz: (Math.random() - 0.5) * 6, life: 1, size: 0.25, color: [0.4, 0.38, 0.35], grav: 15, shape: 1 });
        this.drop(o.x, o.y, o.z, 'stone', 2 + Math.floor(o.s));
        if (Math.random() < 0.35 + (o.s > 1.5 ? 0.3 : 0)) this.drop(o.x, o.y, o.z, 'iron', 1);
        G.audio?.sfx('rockBreak', { pos: o });
        G.game?.markHarvest('r', o);
      }
    } else if (t.kind === 'crystal') {
      o.hp -= 1;
      G.audio?.sfx('crystalHit', { pos: o });
      G.fx?.elementBurst(o.x, o.y + 1, o.z, 1, 0.4);
      if (o.hp <= 0) {
        o.alive = false;
        G.veg.refreshCrystal(o);
        this.drop(o.x, o.y, o.z, 'crystal', 2 + Math.floor(Math.random() * 2));
        G.game?.markHarvest('c', o);
      }
    } else if (t.kind === 'destructible') {
      o.onHit?.(P);
    }
    void ep;
  }

  fellTree(t, P) {
    t.alive = false;
    G.veg.refreshTree(t);
    G.game?.markHarvest('t', t);
    const kind = G.veg.kinds[t.kind].lod0;
    const meshes = [];
    for (const [geo, mp] of [[kind.trunk, G.veg.mats[t.kind][0]], [kind.leaves, G.veg.mats[t.kind][1]]]) {
      const m = new THREE.InstancedMesh(geo, mp.mat, 1);
      m.customDepthMaterial = mp.depth;
      m.castShadow = true;
      m.frustumCulled = false;
      G.scene.add(m);
      meshes.push(m);
    }
    const dx = t.x - P.pos.x, dz = t.z - P.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    const axis = new THREE.Vector3(dz / l, 0, -dx / l);
    this.fallingTrees.push({ t, meshes, axis, ang: 0, vel: 0.2, done: false, life: 0 });
    G.audio?.sfx('treeCreak', { pos: t });
  }

  updateFallingTrees(dt) {
    const dummy = new THREE.Object3D();
    for (let i = this.fallingTrees.length - 1; i >= 0; i--) {
      const f = this.fallingTrees[i];
      f.life += dt;
      if (!f.done) {
        f.vel += dt * 2.2;
        f.ang += f.vel * dt;
        if (f.ang >= Math.PI / 2 - 0.08) {
          f.ang = Math.PI / 2 - 0.08;
          f.done = true;
          f.doneT = 0;
          G.audio?.sfx('treeFall', { pos: f.t });
          G.cam?.shake(0.25);
          const h = G.veg.kinds[f.t.kind].lod0.height * f.t.s * 0.6;
          const fx = -f.axis.z, fz = f.axis.x; // fall direction (away from the player)
          for (let k = 0; k < 3; k++) {
            const tt = 0.3 + k * 0.3;
            const px = f.t.x + fx * h * tt, pz = f.t.z + fz * h * tt;
            G.fx?.dust(px, G.terrain.heightAt(px, pz), pz, 1.2);
          }
          G.combat?.aoe(new THREE.Vector3(f.t.x + fx * h * 0.6, f.t.y, f.t.z + fz * h * 0.6), 2.5, 60, { source: G.player, poise: 40, kind: 'tree' });
        }
      } else {
        f.doneT += dt;
        if (f.doneT > 1.2) {
          const s = Math.max(0, 1 - (f.doneT - 1.2) * 2);
          for (const m of f.meshes) m.scale.setScalar(s);
          if (s <= 0) {
            for (const m of f.meshes) G.scene.remove(m);
            const n = 2 + Math.round(f.t.s * 1.5);
            this.drop(f.t.x, f.t.y + 0.5, f.t.z, 'wood', n);
            if (G.epochs.current === 0 && Math.random() < 0.3) this.drop(f.t.x, f.t.y, f.t.z, 'herb', 1);
            G.fx?.dust(f.t.x, f.t.y, f.t.z, 1);
            this.fallingTrees.splice(i, 1);
            continue;
          }
        }
      }
      dummy.position.set(f.t.x, f.t.y, f.t.z);
      dummy.quaternion.setFromAxisAngle(f.axis, f.ang);
      dummy.rotateY(f.t.rot);
      dummy.scale.setScalar(f.t.s);
      dummy.updateMatrix();
      for (const m of f.meshes) {
        if (m.scale.x < 1) {
          const sm = dummy.matrix.clone().multiply(new THREE.Matrix4().makeScale(m.scale.x, m.scale.x, m.scale.x));
          m.setMatrixAt(0, sm);
        } else m.setMatrixAt(0, dummy.matrix);
        m.instanceMatrix.needsUpdate = true;
      }
    }
  }

  // ----------------------------------------------------------------- zones
  addFirePatch(x, z, dur, r) {
    const y = G.terrain.heightAt(x, z);
    if (G.water && G.water.level > y + 0.1) return;
    const light = new THREE.PointLight(0xff7a2a, 8, r * 5, 2);
    light.position.set(x, y + 1, z);
    G.scene.add(light);
    this.zones.push({ type: 'fire', x, z, y, r, t: dur, dur, light, tick: 0 });
    this.rebuildUpdrafts();
  }
  igniteAt(pos, r) {
    for (const d of this.destructibles) {
      if (d.dead || !d.onIgnite) continue;
      if (d.epochs && !d.epochs.includes(G.epochs.current)) continue;
      if (Math.hypot(d.pos.x - pos.x, d.pos.z - pos.z) < r + (d.r || 0.5) && Math.abs(d.pos.y - pos.y) < 4) d.onIgnite();
    }
    G.build?.igniteAt?.(pos, r);
  }
  douseAt(pos, r) {
    for (const z of this.zones) if (z.type === 'fire' && Math.hypot(z.x - pos.x, z.z - pos.z) < r + z.r) z.t = Math.min(z.t, 0.3);
    for (const d of this.destructibles) if (d.onDouse && Math.hypot(d.pos.x - pos.x, d.pos.z - pos.z) < r) d.onDouse();
  }
  aoeHit(center, r, o) {
    for (const d of this.destructibles) {
      if (d.dead || !d.onHit) continue;
      if (Math.hypot(d.pos.x - center.x, d.pos.z - center.z) < r + (d.r || 0.5)) {
        if (o.el === 0 && d.onIgnite) d.onIgnite();
        else if (o.kind === 'plunge' || o.kind === 'spell') d.onHit(G.player, o);
      }
    }
  }
  updateZones(dt) {
    let changed = false;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.t -= dt;
      if (z.type === 'fire') {
        const k = Math.min(1, z.t / 1.5);
        for (let n = 0; n < z.r * 3; n++) if (Math.random() < 0.6) G.fx?.fire(z.x + (Math.random() - 0.5) * z.r * 1.6, z.y, z.z + (Math.random() - 0.5) * z.r * 1.6, 0.9 * k + 0.2);
        if (Math.random() < dt * 4) G.fx?.smoke(z.x, z.y + 2, z.z, 1.5, [0.2, 0.18, 0.17]);
        z.light.intensity = (6 + Math.sin(G.time * 20) * 2) * k;
        z.tick += dt;
        if (z.tick > 0.5) {
          z.tick = 0;
          for (const e of G.enemies) if (!e.dead && Math.hypot(e.pos.x - z.x, e.pos.z - z.z) < z.r + e.radius) G.combat.damageEnemy(e, 5, { el: 0, dot: true, source: G.player, noFlinch: true });
          const P = G.player;
          if (Math.hypot(P.pos.x - z.x, P.pos.z - z.z) < z.r && P.mode === 'ground' && Math.abs(P.pos.y - z.y) < 1) P.burnT = Math.max(P.burnT || 0, 1);
        }
        if (z.t <= 0) {
          G.scene.remove(z.light);
          this.zones.splice(i, 1);
          changed = true;
        }
      } else if (z.type === 'bubble') {
        const grow = Math.min(1, (z.dur - z.t) * 5) * Math.min(1, z.t * 2);
        z.mesh.scale.setScalar(Math.max(0.01, z.r * grow));
        for (const e of G.enemies) if (!e.dead && e.pos.distanceTo(z.pos) < z.r + e.radius) e.status.slow = Math.max(e.status.slow, 0.3);
        for (const p of G.combat.projectiles) if (p.hostile && p.pos.distanceTo(z.pos) < z.r) p.vel.multiplyScalar(Math.pow(0.15, dt));
        if (z.t <= 0) {
          G.scene.remove(z.mesh);
          z.mesh.geometry.dispose();
          this.zones.splice(i, 1);
        }
      }
    }
    if (changed) this.rebuildUpdrafts();
  }

  update(dt) {
    this.updatePickups(dt);
    this.updateFallingTrees(dt);
    if (!G.magic) this.updateZones(dt);
    for (const d of this.destructibles) d.update?.(dt);
  }
}
