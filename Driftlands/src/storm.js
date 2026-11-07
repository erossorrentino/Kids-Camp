import * as THREE from 'three';
import { mulberry32, rand } from './noise.js';
import { Island, TIER_RINGS } from './islands.js';
import { SEA_Y } from './world.js';

export const MODS = [
  { id: 'thunder', name: 'Thunderhead', desc: 'Lightning strikes often — watch for the crackle' },
  { id: 'gale', name: 'Gale Force', desc: 'Howling, shifting winds push your ship and glider' },
  { id: 'swarm', name: 'Swarm', desc: 'Twice as many Storm Wisps' },
  { id: 'rich', name: 'Rich Veins', desc: '+50% Storm Cores spawn' },
  { id: 'fog', name: 'Blind Storm', desc: 'Thick fog — cores glow brighter' },
  { id: 'fragile', name: 'Fragile Hull', desc: 'Hull takes 50% more damage, loot ×1.5' },
];

const coreMat = new THREE.MeshStandardMaterial({ color: 0xff70e0, emissive: 0xff30c0, emissiveIntensity: 3, roughness: 0.2 });
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffb0f0, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
const exitMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
const riftBeamMat = new THREE.MeshBasicMaterial({ color: 0xc060ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
const vortexMat = new THREE.MeshBasicMaterial({ color: 0xd080ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

export class StormDive {
  constructor(G) {
    this.G = G;
    this.active = false;
    this.origin = new THREE.Vector3(0, -2600, 0);
    this.root = new THREE.Group();
    this.root.visible = false;
    G.scene.add(this.root);
    this.islands = [];
    this.cores = [];
    this.mods = {};
    this.rifts = [];
    this.cooldown = 0;
  }

  makeRifts(seed) {
    const G = this.G;
    this.rifts.forEach((r) => { G.scene.remove(r.group); });
    this.rifts = [];
    const rng = mulberry32(seed * 7 + 3);
    const rings = [[150, 260], [380, 470], [600, 720]];
    for (const [a, b] of rings) {
      for (let tries = 0; tries < 50; tries++) {
        const ang = rng() * Math.PI * 2, r = a + rng() * (b - a);
        const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
        if (G.islands.list.some((i) => Math.hypot(i.pos.x - x, i.pos.z - z) < i.R + 45)) continue;
        const group = new THREE.Group();
        group.position.set(x, SEA_Y, z);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(6, 14, 300, 16, 1, true), riftBeamMat);
        beam.position.y = 150;
        const vortex = new THREE.Mesh(new THREE.RingGeometry(4, 26, 40, 1, 0, Math.PI * 1.7), vortexMat);
        vortex.rotation.x = -Math.PI / 2; vortex.position.y = 1;
        const v2 = vortex.clone(); v2.scale.setScalar(0.6); v2.position.y = 1.5;
        group.add(beam, vortex, v2);
        G.scene.add(group);
        this.rifts.push({ pos: group.position, radius: 26, group, vortex, v2, active: true });
        break;
      }
    }
    G.world.setRifts(this.rifts);
  }

  riftUnder(p) {
    return this.rifts.find((r) => r.active && Math.hypot(p.x - r.pos.x, p.z - r.pos.z) < r.radius + 6) || null;
  }

  raycastMeshes() { return this.islands.flatMap((i) => i.raycastMeshes); }

  begin() {
    const G = this.G;
    if (this.active) return;
    const rng = Math.random;
    // pick 2 random modifiers
    const pool = MODS.slice();
    const chosen = [];
    for (let i = 0; i < 2; i++) chosen.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    this.mods = {}; chosen.forEach((m) => { this.mods[m.id] = true; });
    this.chosen = chosen;
    this.active = true;
    this.time = 150;
    this.collected = 0;
    this.kills = 0;
    this.waveTimer = 6;
    this.entryRift = this.riftUnder(G.ship.pos);
    G.ui.fadeFlash(1.2);
    G.audio.play('portal');
    // Build the realm (randomized every run)
    this.root.visible = true;
    G.islandRoot.visible = false;
    G.world.setRealm(true);
    G.combat.clearAll();
    G.particles.clear();
    const O = this.origin;
    const n = 12 + Math.floor(rng() * 6);
    const savedRoot = G.islandRoot;
    G.islandRoot = this.root;   // islands attach to the realm root
    for (let i = 0; i < n; i++) {
      for (let t = 0; t < 30; t++) {
        const a = rng() * Math.PI * 2, r = 50 + rng() * 230;
        const x = O.x + Math.cos(a) * r, z = O.z + Math.sin(a) * r, y = O.y + rand(-50, 60);
        const R = 8 + rng() * 18;
        if (this.islands.some((o) => Math.hypot(o.pos.x - x, o.pos.z - z) < o.R + R + 20)) continue;
        const isl = new Island(G, { x, y, z, R, tier: 3, seed: Math.floor(rng() * 1e9), storm: true, small: R < 11, name: 'Storm Shard' });
        this.islands.push(isl);
        break;
      }
    }
    G.islandRoot = savedRoot;
    // physics/combat see realm islands through the island manager while the dive runs
    this.savedList = G.islands.list;
    G.islands.list = this.islands;
    // cores
    const nc = Math.round((14 + rng() * 6) * (this.mods.rich ? 1.5 : 1));
    const coreGeo = new THREE.IcosahedronGeometry(0.7, 1);
    const ringGeo = new THREE.TorusGeometry(1.4, 0.06, 6, 24);
    for (let i = 0; i < nc; i++) {
      let p;
      const roll = rng();
      if (roll < 0.5 && this.islands.length) {
        const isl = this.islands[Math.floor(rng() * this.islands.length)];
        const pt = isl.samplePoint(0.7) || { x: 0, y: isl.topH(0, 0), z: 0 };
        p = new THREE.Vector3(isl.pos.x + pt.x, isl.pos.y + pt.y + 1.5, isl.pos.z + pt.z);
        if (roll < 0.12) p.set(isl.pos.x, isl.pos.y + isl.undersideAt(0) - 2, isl.pos.z);
      } else {
        const a = rng() * Math.PI * 2, r = 40 + rng() * 220;
        p = new THREE.Vector3(O.x + Math.cos(a) * r, O.y + rand(-40, 70), O.z + Math.sin(a) * r);
      }
      const g = new THREE.Group();
      g.position.copy(p);
      const core = new THREE.Mesh(coreGeo, coreMat);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      const ring2 = ring.clone(); ring2.rotation.x = Math.PI / 2;
      g.add(core, ring, ring2);
      if (this.mods.fog) g.scale.setScalar(1.6);
      this.root.add(g);
      this.cores.push({ group: g, pos: p, taken: false, phase: rng() * 6 });
    }
    // exit beacon
    this.exit = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 500, 20, 1, true), exitMat);
    this.exit.position.copy(O).add(new THREE.Vector3(0, 0, 0));
    this.root.add(this.exit);
    // move ship + player
    const off = G.player.pos.clone().applyMatrix4(new THREE.Matrix4().copy(G.ship.root.matrixWorld).invert());
    G.ship.pos.copy(O).add(new THREE.Vector3(0, 30, 60));
    G.ship.speed = 0; G.ship.throttle = 0; G.ship.vy = 0;
    G.ship.root.updateMatrixWorld();
    G.player.pos.copy(off.applyMatrix4(G.ship.root.matrixWorld));
    G.player.camInit = false;
    G.ship.update(0, null);
    G.save.data.dives++;
    G.ui.stormStart(chosen);
  }

  spawnWave() {
    const G = this.G;
    const n = (2 + Math.floor(Math.random() * 3)) * (this.mods.swarm ? 2 : 1);
    const c = G.player.pos;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = G.combat.spawn('wisp', new THREE.Vector3(c.x + Math.cos(a) * 45, c.y + rand(5, 20), c.z + Math.sin(a) * 45), null);
      e.storm = true;
      e.home = c.clone();
    }
  }
  onKill() { this.kills++; }

  update(dt) {
    const G = this.G;
    // animate rifts in the main world
    for (const r of this.rifts) { r.vortex.rotation.z += dt * 0.8; r.v2.rotation.z -= dt * 1.3; }
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!this.active) {
      // trigger: ship descends into a rift
      const s = G.ship;
      const r = this.riftUnder(s.pos);
      if (r && G.player.mode === 'helm' && this.cooldown <= 0) {
        if (s.pos.y < SEA_Y + 14) this.begin();
        else if (!this._hinted || G.time - this._hinted > 12) { this._hinted = G.time; G.ui.toast('🌀 A Storm Rift! Sink into it (Shift) to begin a Storm Dive — high risk, rare Storm Cores', 4.5); }
      }
      return;
    }
    this.time -= dt;
    // hull pressure
    G.ship.damage(dt * 0.8 * (this.mods.fragile ? 1.5 : 1), true);
    this.waveTimer -= dt;
    if (this.waveTimer <= 0) { this.waveTimer = rand(14, 20); this.spawnWave(); }
    // cores: collect by player or ship
    const pp = G.player.pos.clone().add(new THREE.Vector3(0, 1, 0));
    for (const c of this.cores) {
      if (c.taken) continue;
      c.phase += dt;
      c.group.rotation.y += dt * 1.5;
      c.group.children[1].rotation.x += dt * 2;
      c.group.position.y = c.pos.y + Math.sin(c.phase * 2) * 0.4;
      if (Math.random() < 0.3) G.particles.add.emit({ x: c.group.position.x + rand(-1, 1), y: c.group.position.y + rand(-1, 1), z: c.group.position.z + rand(-1, 1), vy: 1, color: [1, 0.4, 0.9], size: 0.4, life: 0.6 });
      const byPlayer = c.group.position.distanceTo(pp) < 2.2;
      const byShip = c.group.position.distanceTo(G.ship.pos.clone().add(new THREE.Vector3(0, 4, 0))) < 11;
      if (byPlayer || byShip) {
        c.taken = true; c.group.visible = false;
        this.collected++;
        G.audio.play('pickup', 1.2);
        G.particles.burst(c.group.position, 40, { color: [1, 0.5, 0.95], speed: 8, size: 0.6, life: 0.8 });
        G.ui.popText(c.group.position.clone(), '+1 ✦ Storm Core', '#ff90f0');
      }
    }
    this.exit.material.opacity = 0.25 + Math.sin(G.time * 3) * 0.08;
    // exit
    const toExit = Math.hypot(G.ship.pos.x - this.origin.x, G.ship.pos.z - this.origin.z);
    if (toExit < 10 && this.time < 145 && G.player.mode === 'helm') { this.end('escaped'); return; }
    if (this.time <= 0) this.end('collapsed');
    G.ui.stormHud(this);
  }

  end(result) {
    const G = this.G;
    if (!this.active) return;
    this.active = false;
    const mult = this.mods.fragile ? 1.5 : 1;
    let cores = 0;
    if (result === 'escaped') cores = Math.round(this.collected * mult);
    if (result === 'collapsed') cores = Math.floor(this.collected * mult * 0.5);
    const shards = result === 'wrecked' ? 0 : 20 + this.kills * 6;
    // tear down the realm
    G.combat.clearAll();
    G.particles.clear();
    for (const isl of this.islands) isl.dispose();
    this.islands = [];
    for (const c of this.cores) this.root.remove(c.group);
    this.cores = [];
    this.root.remove(this.exit);
    this.root.visible = false;
    G.islands.list = this.savedList;
    G.islandRoot.visible = true;
    G.world.setRealm(false);
    // return to the world above the entry rift
    const r = this.entryRift || this.rifts[0];
    const off = G.player.pos.clone().applyMatrix4(new THREE.Matrix4().copy(G.ship.root.matrixWorld).invert());
    G.ship.pos.set(r.pos.x, SEA_Y + 45, r.pos.z + 40);
    G.ship.speed = 0; G.ship.throttle = 0;
    if (result === 'wrecked') G.ship.hp = G.ship.maxHp * 0.3;
    G.ship.root.updateMatrixWorld();
    G.player.pos.copy(off.applyMatrix4(G.ship.root.matrixWorld));
    if (G.player.mode !== 'helm' && (result === 'wrecked' || G.player.platform !== G.ship)) G.player.respawnOnShip();
    G.player.camInit = false;
    G.ship.update(0, null);
    this.cooldown = 10;
    G.save.res.cores += cores;
    G.save.res.shards += shards;
    G.save.write();
    G.ui.fadeFlash(1.2);
    G.audio.play('portal');
    G.ui.stormSummary(result, { cores, collected: this.collected, shards, kills: this.kills, mods: this.chosen });
  }
}
