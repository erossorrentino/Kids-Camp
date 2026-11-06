import * as THREE from 'three';
import { G } from '../core/G.js';
import { MATS } from '../world/structures.js';
import { icon } from '../ui/icons.js';
import { ITEMS } from './items.js';

export const BLOCKS = [
  { id: 'plank', name: 'Wood Plank', cost: { wood: 1 }, span: 5, mat: () => MATS.wood, icon: 'wood' },
  { id: 'stone', name: 'Stone Brick', cost: { stone: 1 }, span: 3, mat: () => MATS.stone, icon: 'stone', heavy: true },
  { id: 'glass', name: 'Crystal Glass', cost: { crystal: 1 }, span: 2, mat: () => MATS.crystal, icon: 'crystal' },
  { id: 'stairs', name: 'Wooden Stairs', cost: { wood: 1 }, span: 4, mat: () => MATS.wood, icon: 'wood', ramp: true },
  { id: 'lantern', name: 'Lantern', cost: { wood: 1, ember: 1 }, span: 3, mat: () => MATS.lamp, icon: 'ember' },
  { id: 'spikes', name: 'Spike Trap', cost: { iron: 1 }, span: 2, mat: () => MATS.iron, icon: 'iron', trap: true },
  { id: 'bounce', name: 'Bounce Pad', cost: { crystal: 1, fiber: 1 }, span: 2, mat: () => MATS.crystalPink, icon: 'crystal', bounce: true },
  { id: 'campfire', name: 'Campfire', cost: { wood: 3 }, span: 1, mat: () => MATS.woodBurnt, icon: 'ember', fire: true },
  { id: 'barrel', name: 'Ember Barrel', cost: { fiber: 2, ember: 1 }, span: 1, mat: () => MATS.wood, icon: 'ember', explosive: true },
];

const key = (i, j, k) => i + ',' + j + ',' + k;

function wedge() {
  // ramp rising toward local +z, occupying a unit cube centred at origin
  const g = new THREE.BufferGeometry();
  const v = [
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5, // bottom
    -0.5, -0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5, // slope
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5, // back
    -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, // sides
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  const uv = [];
  for (let i = 0; i < v.length / 3; i++) uv.push(v[i * 3] + 0.5, v[i * 3 + 1] + v[i * 3 + 2] + 0.5);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export class Building {
  constructor() {
    this.active = false;
    this.sel = 0;
    this.rot = 0;
    this.blocks = new Map(); // key -> {i,j,k,t,rot,col,extra}
    this.meshes = [];
    this.falling = [];
    this.trapT = 0;
    const box = new THREE.BoxGeometry(1, 1, 1);
    const spikes = (() => {
      const parts = [new THREE.BoxGeometry(1, 0.2, 1).translate(0, -0.4, 0)];
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) parts.push(new THREE.ConeGeometry(0.1, 0.55, 5).translate(-0.33 + a * 0.33, -0.05, -0.33 + b * 0.33));
      return mergeGeos(parts);
    })();
    const pad = new THREE.CylinderGeometry(0.48, 0.5, 0.3, 16).translate(0, -0.35, 0);
    const fire = mergeGeos([new THREE.CylinderGeometry(0.45, 0.5, 0.15, 10).translate(0, -0.42, 0), new THREE.CylinderGeometry(0.06, 0.06, 0.8, 5).rotateZ(1.1).translate(0, -0.25, 0), new THREE.CylinderGeometry(0.06, 0.06, 0.8, 5).rotateZ(-1.1).translate(0, -0.25, 0)]);
    const barrel = new THREE.CylinderGeometry(0.4, 0.42, 0.95, 12);
    const lantern = mergeGeos([new THREE.BoxGeometry(0.4, 0.5, 0.4).translate(0, -0.05, 0), new THREE.BoxGeometry(0.5, 0.06, 0.5).translate(0, 0.23, 0), new THREE.BoxGeometry(0.5, 0.06, 0.5).translate(0, -0.33, 0), new THREE.CylinderGeometry(0.06, 0.08, 0.2, 6).translate(0, -0.45, 0)]);
    const geos = { plank: box, stone: box, glass: box, stairs: wedge(), lantern, spikes, bounce: pad, campfire: fire, barrel };
    for (const b of BLOCKS) {
      const m = new THREE.InstancedMesh(geos[b.id], b.mat(), 1200);
      m.count = 0;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1200 * 3).fill(1), 3);
      G.scene.add(m);
      this.meshes.push(m);
    }
    // ghost preview
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.35, depthWrite: false });
    this.ghost = new THREE.Mesh(box, this.ghostMat);
    this.ghost.visible = false;
    this.ghostEdges = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: 0xbff4ff }));
    this.ghost.add(this.ghostEdges);
    G.scene.add(this.ghost);
    this.ghostGeos = geos;
    this.buildBar();
    this.fires = [];
    this.lights = [];
  }

  buildBar() {
    const bar = document.createElement('div');
    bar.className = 'buildbar';
    bar.hidden = true;
    bar.innerHTML = `<div class="bb-title">Build mode <span>LMB place · RMB remove · R rotate · 1–9 select · B exit</span></div><div class="bb-slots">${BLOCKS.map((b, i) => `<div class="bb-slot" data-i="${i}"><img alt="" src="${icon(b.icon)}"><b>${b.name}</b><em>${Object.entries(b.cost).map(([k, v]) => `${v} ${ITEMS[k].name}`).join(', ')}</em><span class="k">${i + 1}</span></div>`).join('')}</div><div class="bb-info"></div>`;
    document.getElementById('ui-root').appendChild(bar);
    this.bar = bar;
    bar.querySelectorAll('.bb-slot').forEach((s) => (s.onclick = () => { this.sel = +s.dataset.i; this.refreshBar(); }));
  }
  refreshBar() {
    this.bar.querySelectorAll('.bb-slot').forEach((s, i) => {
      s.classList.toggle('on', i === this.sel);
      s.classList.toggle('poor', !G.game.canAfford(BLOCKS[i].cost));
    });
    const b = BLOCKS[this.sel];
    const tips = { plank: 'Light and far-reaching: spans 5 blocks from a support.', stone: 'Sturdy but heavy: spans only 3 blocks. Falling stone crushes foes.', glass: 'Glowing crystal. Fragile: spans 2.', stairs: 'A walkable ramp. R to rotate.', lantern: 'Glows through the night.', spikes: 'Damages any enemy that walks over it.', bounce: 'Launches you high into the air. Glide from the apex!', campfire: 'A place to rest and save. Glide above it to ride the updraft.', barrel: 'Explodes when burned or struck. Blows nearby blocks apart.' };
    this.bar.querySelector('.bb-info').textContent = tips[b.id];
  }

  toggle(on) {
    const v = on ?? !this.active;
    if (v && (G.player.mode !== 'ground' || G.game.inPocket || G.game.bossActive)) {
      G.hud.toast('You can only build while standing on solid ground.', 'warn');
      return;
    }
    this.active = v;
    this.bar.hidden = !v;
    this.ghost.visible = false;
    if (v) this.refreshBar();
    this.updateStress();
    G.audio?.sfx(v ? 'menuOpen' : 'menuClose');
  }

  // ------------------------------------------------------------ placement
  target() {
    const cam = G.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const o = cam.position.clone();
    const hit = G.collision.raycast(o, dir, 16, { step: 0.25 });
    if (!hit) return null;
    const p = o.clone().addScaledVector(dir, hit.t);
    if (p.distanceTo(G.player.pos) > 8.5) return null;
    let i, j, k;
    if (hit.col && hit.col.owner && hit.col.owner.block) {
      const b = hit.col.owner;
      const n = hit.normal;
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      i = b.i; j = b.j; k = b.k;
      if (ay >= ax && ay >= az) j += Math.sign(n.y);
      else if (ax >= az) i += Math.sign(n.x);
      else k += Math.sign(n.z);
      return { i, j, k, removeTarget: b, p };
    }
    const q = p.clone().addScaledVector(hit.normal, 0.45);
    i = Math.floor(q.x); k = Math.floor(q.z);
    j = Math.floor(q.y + 0.25);
    return { i, j, k, p };
  }

  canPlace(t) {
    if (this.blocks.has(key(t.i, t.j, t.k))) return false;
    const cx = t.i + 0.5, cy = t.j + 0.5, cz = t.k + 0.5;
    const P = G.player.pos;
    if (Math.abs(P.x - cx) < 0.5 + G.player.radius && Math.abs(P.z - cz) < 0.5 + G.player.radius && cy + 0.5 > P.y + 0.05 && cy - 0.5 < P.y + G.player.height) return false;
    if (G.terrain.heightAt(cx, cz) > cy + 0.45) return false;
    const inside = G.collision.pointInside(cx, cy, cz, -0.15);
    if (inside && !(inside.owner && inside.owner.block)) return false;
    for (const e of G.enemies) if (!e.dead && Math.abs(e.pos.x - cx) < 0.8 && Math.abs(e.pos.z - cz) < 0.8 && Math.abs(e.pos.y + 0.8 - cy) < 1.5) return false;
    return true;
  }

  place(t, type, rot = 0, free = false) {
    const def = BLOCKS[type];
    if (!free && !G.game.pay(def.cost)) {
      G.hud.toast(`Not enough materials for ${def.name}`, 'warn');
      G.audio?.sfx('fizzle');
      return null;
    }
    const b = { i: t.i, j: t.j, k: t.k, t: type, rot, block: true };
    const ry = rot * Math.PI / 2;
    const cx = t.i + 0.5, cy = t.j + 0.5, cz = t.k + 0.5;
    if (def.ramp) b.col = G.collision.addBox(cx, cy, cz, 0.5, 0.5, 0.5, ry, { tag: 'wood', owner: b, ramp: 1 });
    else if (def.trap || def.bounce || def.fire) b.col = G.collision.addBox(cx, t.j + 0.15, cz, 0.5, 0.15, 0.5, 0, { tag: 'wood', owner: b, climbable: false });
    else b.col = G.collision.addBox(cx, cy, cz, def.id === 'barrel' ? 0.4 : def.id === 'lantern' ? 0.25 : 0.5, 0.5, def.id === 'barrel' ? 0.4 : def.id === 'lantern' ? 0.25 : 0.5, 0, { tag: def.id === 'stone' ? 'stone' : 'wood', owner: b });
    if (def.bounce) b.col.bounce = true;
    this.blocks.set(key(t.i, t.j, t.k), b);
    if (def.fire) {
      b.campfire = { id: 'built' + key(t.i, t.j, t.k), x: cx, z: cz, y: t.j, name: 'Your Campfire' };
      b.interact = G.world.addInteractable({ pos: new THREE.Vector3(cx, t.j, cz), r: 2.5, label: 'Your Campfire', verb: 'Rest at ', action: () => G.ui.openRest(b.campfire) });
      b.updraft = G.world.addUpdraft(cx, cz, 2.2, t.j + 25, 8);
      G.content.campfires.push(b.campfire);
    }
    if (def.explosive) {
      b.destructible = { pos: new THREE.Vector3(cx, cy, cz), r: 0.6, onIgnite: () => this.explode(b), onHit: () => this.explode(b) };
      G.world.destructibles.push(b.destructible);
    }
    if (!free) {
      G.audio?.sfx('place', { pos: new THREE.Vector3(cx, cy, cz) });
      G.fx.dust(cx, t.j, cz, 0.4);
      G.game.stat('built');
      this.checkSupport();
    }
    this.rebuild();
    return b;
  }

  remove(b, refund = true, silent = false) {
    const k = key(b.i, b.j, b.k);
    if (!this.blocks.has(k)) return;
    this.blocks.delete(k);
    G.collision.remove(b.col);
    const def = BLOCKS[b.t];
    if (refund) for (const m in def.cost) G.game.give(m, def.cost[m], true);
    if (b.interact) G.world.removeInteractable(b.interact);
    if (b.updraft) { const i = G.world.staticUpdrafts.indexOf(b.updraft); if (i >= 0) G.world.staticUpdrafts.splice(i, 1); G.world.rebuildUpdrafts(); }
    if (b.campfire) { const i = G.content.campfires.indexOf(b.campfire); if (i >= 0) G.content.campfires.splice(i, 1); }
    if (b.destructible) b.destructible.dead = true;
    if (!silent) {
      G.audio?.sfx('place', { pos: new THREE.Vector3(b.i + 0.5, b.j + 0.5, b.k + 0.5), pitch: 0.7 });
      this.checkSupport();
    }
    this.rebuild();
  }

  explode(b) {
    if (b.exploded) return;
    b.exploded = true;
    const c = new THREE.Vector3(b.i + 0.5, b.j + 0.5, b.k + 0.5);
    this.remove(b, false, true);
    G.fx.elementBurst(c.x, c.y, c.z, 0, 2);
    G.fx.shockwave(c.x, c.y, c.z, 5, 0xff8a3a);
    G.cam.shake(0.6);
    G.audio?.sfx('explosion', { pos: c });
    G.combat.aoe(c, 4, 90, { source: G.player, el: 0, poise: 60, knock: 10, kind: 'spell' });
    const P = G.player;
    if (P.pos.distanceTo(c) < 3.5) P.takeDamage(15, { pos: c }, { knock: 8 });
    // blast nearby blocks loose
    for (const o of [...this.blocks.values()]) {
      const d = Math.hypot(o.i + 0.5 - c.x, o.j + 0.5 - c.y, o.k + 0.5 - c.z);
      if (d < 2.6) {
        if (BLOCKS[o.t].explosive) G.after(0.15, () => this.explode(o));
        else this.dislodge(o, c);
      }
    }
    this.checkSupport();
  }

  igniteAt(pos, r) {
    for (const b of this.blocks.values()) {
      const def = BLOCKS[b.t];
      if (!def.explosive && def.id !== 'plank' && def.id !== 'stairs') continue;
      const d = Math.hypot(b.i + 0.5 - pos.x, b.j + 0.5 - pos.y, b.k + 0.5 - pos.z);
      if (d < r + 0.7) {
        if (def.explosive) this.explode(b);
        else if (!b.burning) b.burning = 4 + Math.random() * 2;
      }
    }
  }

  dislodge(b, from) {
    this.remove(b, false, true);
    const def = BLOCKS[b.t];
    const m = new THREE.Mesh(this.ghostGeos[def.id], def.mat());
    m.castShadow = true;
    m.position.set(b.i + 0.5, b.j + 0.5, b.k + 0.5);
    m.rotation.y = b.rot * Math.PI / 2;
    G.scene.add(m);
    const v = new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2);
    if (from) v.add(m.position.clone().sub(from).normalize().multiplyScalar(6)).add(new THREE.Vector3(0, 4, 0));
    this.falling.push({ m, v, spin: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6), def, t: 0 });
  }

  // Structural integrity: blocks need a path to the ground within their span.
  checkSupport() {
    const blocks = this.blocks;
    const dist = new Map();
    const dq = [];
    for (const [k, b] of blocks) {
      const cx = b.i + 0.5, cz = b.k + 0.5;
      const grounded = b.j <= G.terrain.heightAt(cx, cz) + 0.35 || (() => {
        const c = G.collision.pointInside(cx, b.j - 0.15, cz, 0.05);
        return c && !(c.owner && c.owner.block);
      })();
      if (grounded) { dist.set(k, 0); dq.push(b); }
    }
    // 0-1 BFS: vertical neighbours cost 0, horizontal cost 1
    let head = 0;
    const nb = [[0, 1, 0, 0], [0, -1, 0, 0], [1, 0, 0, 1], [-1, 0, 0, 1], [0, 0, 1, 1], [0, 0, -1, 1]];
    const queue = dq.slice();
    while (head < queue.length) {
      const b = queue[head++];
      const d = dist.get(key(b.i, b.j, b.k));
      for (const [di, dj, dk, cost] of nb) {
        const k2 = key(b.i + di, b.j + dj, b.k + dk);
        const o = blocks.get(k2);
        if (!o) continue;
        // can't hang below something via a vertical link (support flows up)
        if (dj === -1) continue;
        const nd = d + cost;
        if (nd > BLOCKS[o.t].span) continue;
        if (!dist.has(k2) || dist.get(k2) > nd) {
          dist.set(k2, nd);
          if (cost === 0) queue.splice(head, 0, o);
          else queue.push(o);
        }
      }
    }
    const loose = [];
    for (const [k, b] of blocks) if (!dist.has(k)) loose.push(b);
    for (const b of loose) this.dislodge(b);
    this.stress = dist;
    if (loose.length) G.audio?.sfx('rockBreak', { pos: new THREE.Vector3(loose[0].i, loose[0].j, loose[0].k) });
    this.updateStress();
  }

  updateStress() {
    // in build mode, tint by how close each block is to its span limit
    const col = new THREE.Color();
    const counts = new Array(BLOCKS.length).fill(0);
    for (const b of this.blocks.values()) {
      const m = this.meshes[b.t];
      const idx = b.idx;
      if (idx === undefined) continue;
      if (this.active && this.stress) {
        const d = this.stress.get(key(b.i, b.j, b.k)) ?? 0;
        const r = d / BLOCKS[b.t].span;
        col.setRGB(0.6 + r * 0.6, 1.1 - r * 0.7, 0.6 - r * 0.3);
      } else col.setRGB(1, 1, 1);
      m.setColorAt(idx, col);
      counts[b.t]++;
    }
    for (const m of this.meshes) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  rebuild() {
    const counts = new Array(BLOCKS.length).fill(0);
    const d = new THREE.Object3D();
    for (const b of this.blocks.values()) {
      const m = this.meshes[b.t];
      const i = counts[b.t]++;
      if (i >= 1200) continue;
      d.position.set(b.i + 0.5, b.j + 0.5, b.k + 0.5);
      d.rotation.set(0, b.rot * Math.PI / 2, 0);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      b.idx = i;
    }
    this.meshes.forEach((m, t) => { m.count = Math.min(1200, counts[t]); m.instanceMatrix.needsUpdate = true; });
    this.updateStress();
  }

  serialize() {
    return [...this.blocks.values()].map((b) => [b.i, b.j, b.k, b.t, b.rot]);
  }
  deserialize(arr) {
    for (const b of [...this.blocks.values()]) this.remove(b, false, true);
    for (const [i, j, k, t, rot] of arr || []) this.place({ i, j, k }, t, rot, true);
    this.rebuild();
  }

  update(dt) {
    // falling debris
    for (let n = this.falling.length - 1; n >= 0; n--) {
      const f = this.falling[n];
      f.t += dt;
      f.v.y -= 22 * dt;
      f.m.position.addScaledVector(f.v, dt);
      f.m.rotation.x += f.spin.x * dt;
      f.m.rotation.z += f.spin.z * dt;
      const gh = G.collision.groundAt(f.m.position.x, f.m.position.z, f.m.position.y - 0.3, 0.3, 0.2).h;
      if (f.m.position.y - 0.4 <= gh || f.t > 6) {
        const p = f.m.position;
        G.fx.dust(p.x, gh, p.z, 0.7);
        for (let i = 0; i < 8; i++) G.fx.norm.emit({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 5, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 5, life: 0.8, size: 0.2, color: f.def.id === 'stone' ? [0.45, 0.43, 0.4] : [0.45, 0.3, 0.18], grav: 15, shape: 1 });
        const impact = Math.min(1.5, Math.abs(f.v.y) / 12);
        const dmg = (f.def.heavy ? 70 : 25) * impact;
        if (dmg > 5) G.combat.aoe(p, 1.6, dmg, { source: G.player, poise: 30, kind: 'debris' });
        G.audio?.sfx(f.def.heavy ? 'rockBreak' : 'chop', { pos: p });
        if (Math.random() < 0.5) for (const m in f.def.cost) G.world.drop(p.x, gh, p.z, m, 1);
        G.scene.remove(f.m);
        this.falling.splice(n, 1);
      }
    }
    // traps & burning
    this.trapT -= dt;
    const doTrap = this.trapT <= 0;
    if (doTrap) this.trapT = 0.5;
    let changed = false;
    for (const b of [...this.blocks.values()]) {
      const def = BLOCKS[b.t];
      const cx = b.i + 0.5, cz = b.k + 0.5;
      if (def.trap && doTrap) {
        for (const e of G.enemies) if (!e.dead && Math.abs(e.pos.x - cx) < 0.9 && Math.abs(e.pos.z - cz) < 0.9 && Math.abs(e.pos.y - (b.j + 0.3)) < 1.2) {
          G.combat.damageEnemy(e, 18, { source: G.player, poise: 15, kind: 'trap' });
          G.fx.sparks(cx, b.j + 0.5, cz, 6, 0xffe0a0, 3);
        }
      }
      if (def.fire) {
        const d = Math.hypot(G.camera.position.x - cx, G.camera.position.z - cz);
        if (d < 80 && Math.random() < dt * 25) G.fx.fire(cx, b.j + 0.1, cz, 0.8);
      }
      if (def.id === 'lantern' && Math.random() < dt * 0.5) G.fx.add.emit({ x: cx, y: b.j + 0.6, z: cz, vy: 0.3, life: 1.5, size: 0.08, color: [3, 2.4, 1] });
      if (b.burning) {
        b.burning -= dt;
        if (Math.random() < dt * 20) G.fx.fire(cx, b.j + 0.8, cz, 0.7);
        if (b.burning <= 0) {
          this.remove(b, false, true);
          G.fx.smoke(cx, b.j + 0.5, cz, 1.5);
          changed = true;
          // spread
          for (const o of this.blocks.values()) if (!o.burning && (BLOCKS[o.t].id === 'plank' || BLOCKS[o.t].id === 'stairs') && Math.abs(o.i - b.i) + Math.abs(o.j - b.j) + Math.abs(o.k - b.k) === 1 && Math.random() < 0.6) o.burning = 3 + Math.random() * 3;
        }
      }
    }
    if (changed) this.checkSupport();
    if (!this.active) return;
    const inp = G.input;
    for (let i = 0; i < 9; i++) if (inp.hit('el' + (i + 1))) { this.sel = i; this.refreshBar(); }
    if (inp.mouse.wheel || inp.hit('nextEl')) { this.sel = (this.sel + (inp.mouse.wheel < 0 ? BLOCKS.length - 1 : 1)) % BLOCKS.length; this.refreshBar(); }
    if (inp.hit('rotate')) this.rot = (this.rot + 1) % 4;
    if (G.player.mode !== 'ground' && G.player.mode !== 'air') return this.toggle(false);
    const t = this.target();
    if (!t) { this.ghost.visible = false; return; }
    const ok = this.canPlace(t);
    const def = BLOCKS[this.sel];
    this.ghost.geometry = this.ghostGeos[def.id];
    this.ghostEdges.geometry.dispose();
    this.ghostEdges.geometry = new THREE.EdgesGeometry(this.ghostGeos[def.id]);
    this.ghost.visible = true;
    this.ghost.position.set(t.i + 0.5, t.j + 0.5, t.k + 0.5);
    this.ghost.rotation.y = this.rot * Math.PI / 2;
    const afford = G.game.canAfford(def.cost);
    this.ghostMat.color.setHex(ok && afford ? 0x7fe8ff : 0xff6a6a);
    this.ghostEdges.material.color.setHex(ok && afford ? 0xbff4ff : 0xffaaaa);
    if (inp.mousePressed.left && ok) {
      this.place(t, this.sel, this.rot);
      this.refreshBar();
    }
    if (inp.mousePressed.right && t.removeTarget) {
      this.remove(t.removeTarget, true);
      this.refreshBar();
    }
    if (!this.lightT || this.lightT < G.time) {
      this.lightT = G.time + 1;
      this.updateStress();
    }
  }
}

function mergeGeos(list) {
  const pos = [], nrm = [], uv = [];
  for (let g of list) {
    g = g.index ? g.toNonIndexed() : g;
    pos.push(...g.attributes.position.array);
    nrm.push(...g.attributes.normal.array);
    uv.push(...(g.attributes.uv ? g.attributes.uv.array : new Float32Array(g.attributes.position.count * 2)));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}
