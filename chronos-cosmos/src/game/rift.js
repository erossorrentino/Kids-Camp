import * as THREE from 'three';
import { G } from '../core/G.js';
import { MATS } from '../world/structures.js';

const ARENA = { x: 4000, y: 600, z: 4000, r: 52 };
const MAX = 600;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

const TYPES = {
  mite: { hp: 12, speed: 4.6, r: 0.45, dmg: 6, xp: 1, color: 0x5a2a8a, eye: 0xff4aff, scale: 0.55 },
  brute: { hp: 70, speed: 2.4, r: 0.9, dmg: 14, xp: 4, color: 0x2a1a4a, eye: 0xffaa22, scale: 1.25 },
  spitter: { hp: 24, speed: 3.0, r: 0.55, dmg: 8, xp: 2, color: 0x1a3a5a, eye: 0x4affff, scale: 0.75, ranged: true },
  warden: { hp: 2600, speed: 2.8, r: 2.4, dmg: 26, xp: 60, color: 0x3a0a5a, eye: 0xffffff, scale: 3.4 },
};

const UPGRADES = [
  { id: 'blades', name: 'Chrono Blades', desc: '+1 blade orbiting you, slicing anything it touches.', max: 6 },
  { id: 'bolt', name: 'Aether Bolt', desc: 'Fire bolts at the nearest foe, faster each level.', max: 6 },
  { id: 'nova', name: 'Ember Nova', desc: 'Periodic rings of fire burst outward.', max: 5 },
  { id: 'frost', name: 'Frost Shards', desc: 'Volleys of ice shards in every direction, slowing foes.', max: 5 },
  { id: 'storm', name: 'Storm Call', desc: 'Lightning strikes random foes.', max: 5 },
  { id: 'might', name: 'Might', desc: '+15% damage.', max: 5 },
  { id: 'haste', name: 'Haste', desc: 'Weapons cycle 12% faster.', max: 5 },
  { id: 'swift', name: 'Swiftness', desc: '+10% movement speed.', max: 3 },
  { id: 'magnet', name: 'Starpull', desc: 'Collect shards from much further away.', max: 3 },
  { id: 'vital', name: 'Vitality', desc: '+25 max health and heal fully.', max: 4 },
];

export class Rift {
  constructor() {
    this.active = false;
    this.boonDefs = [
      { id: 'might', name: 'Rift Might', desc: '+10% damage in rifts', max: 5, cost: 3 },
      { id: 'vitality', name: 'Rift Vitality', desc: '+20 health in rifts', max: 5, cost: 3 },
      { id: 'arsenal', name: 'Arsenal', desc: 'Start with +1 Chrono Blade', max: 2, cost: 6 },
      { id: 'magnet', name: 'Gravity Well', desc: '+30% pickup range', max: 3, cost: 2 },
      { id: 'swift', name: 'Fleetfoot', desc: '+6% move speed in rifts', max: 3, cost: 2 },
    ];
    this.built = false;
  }

  build() {
    this.built = true;
    const g = new THREE.Group();
    // floating arena disc
    const top = new THREE.CircleGeometry(ARENA.r, 64);
    top.rotateX(-Math.PI / 2);
    const uv = top.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 18, uv.getY(i) * 18);
    const floor = new THREE.Mesh(top, MATS.marbleDark);
    floor.position.set(ARENA.x, ARENA.y, ARENA.z);
    floor.receiveShadow = true;
    g.add(floor);
    const under = new THREE.Mesh(new THREE.ConeGeometry(ARENA.r, 60, 48, 4, true), MATS.rockStar);
    under.rotation.x = Math.PI;
    under.position.set(ARENA.x, ARENA.y - 30.05, ARENA.z);
    g.add(under);
    // glowing rune rings
    for (const r of [12, 26, 40, ARENA.r - 0.6]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.25, r, 96), MATS.rune);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(ARENA.x, ARENA.y + 0.03, ARENA.z);
      g.add(ring);
    }
    // floating debris
    this.debris = [];
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + Math.random() * 4, 0), MATS.rockStar);
      const a = Math.random() * Math.PI * 2, r = ARENA.r + 10 + Math.random() * 80;
      m.position.set(ARENA.x + Math.cos(a) * r, ARENA.y - 20 + Math.random() * 60, ARENA.z + Math.sin(a) * r);
      m.userData = { a, r, s: (Math.random() - 0.5) * 0.05, y: m.position.y };
      g.add(m);
      this.debris.push(m);
    }
    this.group = g;
    g.visible = false;
    G.scene.add(g);
    this.floorCol = G.collision.addCyl(ARENA.x, ARENA.z, ARENA.y - 4, ARENA.y, ARENA.r, { climbable: false });
    this.floorCol.active = false;
    // enemy instancing
    this.meshes = {};
    for (const k in TYPES) {
      const t = TYPES[k];
      const body = new THREE.IcosahedronGeometry(1, 1);
      const p = body.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        p.setY(i, y * (k === 'brute' ? 0.8 : 1.1));
        if (k === 'mite') p.setZ(i, p.getZ(i) * 1.3);
      }
      body.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.5, emissive: t.eye, emissiveIntensity: 0.15 });
      const m = new THREE.InstancedMesh(body, mat, k === 'warden' ? 1 : MAX);
      m.count = 0;
      m.castShadow = true;
      m.frustumCulled = false;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array((k === 'warden' ? 1 : MAX) * 3).fill(1), 3);
      g.add(m);
      const eyes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(t.eye).multiplyScalar(4) }), (k === 'warden' ? 1 : MAX) * 2);
      eyes.count = 0;
      eyes.frustumCulled = false;
      g.add(eyes);
      this.meshes[k] = { body: m, eyes };
    }
    // xp gems
    this.gemMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7fe8ff).multiplyScalar(2.5) }), 1500);
    this.gemMesh.count = 0;
    this.gemMesh.frustumCulled = false;
    g.add(this.gemMesh);
    // orbit blades
    this.bladeMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.08, 1.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe08a).multiplyScalar(3) }), 8);
    this.bladeMesh.count = 0;
    this.bladeMesh.frustumCulled = false;
    g.add(this.bladeMesh);
    // exit portal
    this.portal = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.25, 12, 48), MATS.rune);
    this.portal.visible = false;
    g.add(this.portal);
    this.buildUI();
  }

  buildUI() {
    const root = document.getElementById('ui-root');
    const hud = document.createElement('div');
    hud.className = 'rift-hud';
    hud.hidden = true;
    hud.innerHTML = '<div class="rh-time"></div><div class="rh-xp"><div class="fill"></div></div><div class="rh-lv"></div><div class="rh-kills"></div><div class="rh-warden" hidden><span>Rift Warden</span><div class="bar"><div class="fill"></div></div></div>';
    root.appendChild(hud);
    this.hud = hud;
    const pick = document.createElement('div');
    pick.className = 'rift-pick';
    pick.hidden = true;
    root.appendChild(pick);
    this.pickEl = pick;
  }

  enter(fromRift) {
    if (!this.built) this.build();
    const S = G.game.state;
    const P = G.player;
    this.from = { x: P.pos.x, y: P.pos.y, z: P.pos.z, rift: fromRift };
    this.active = true;
    G.game.inPocket = 'rift';
    this.group.visible = true;
    this.floorCol.active = true;
    G.spawner.despawnAll();
    for (const n of G.npcs.list) n.rig.setVisible(false);
    G.fx.screenFade(1);
    P.spawn(ARENA.x, ARENA.y + 0.1, ARENA.z);
    P.lockTarget = null;
    G.atmo.rift = 1;
    G.cam.topDown = 1;
    G.cam.yaw = Math.PI * 0.25;
    G.cam.smoothTarget.copy(P.pos);
    this.hud.hidden = false;
    G.hud.root.classList.add('in-rift');
    // run state
    const b = S.riftBoons;
    this.tier = S.riftTier;
    this.t = 0;
    this.dur = 180;
    this.enemies = [];
    this.gems = [];
    this.kills = 0;
    this.level = 1;
    this.xp = 0;
    this.xpNext = 5;
    this.up = { blades: 1 + (b.arsenal || 0), bolt: 1 };
    this.cd = { bolt: 0, nova: 3, frost: 2, storm: 2 };
    this.spawnT = 0;
    this.warden = null;
    this.done = false;
    this.exitOpen = false;
    this.hurtT = 0;
    this.baseMaxHp = P.maxHp;
    this.baseSpeedMul = P.speedMul;
    P.maxHp = this.baseMaxHp + (b.vitality || 0) * 20;
    P.hp = P.maxHp;
    this.dmgMul = 1 + (b.might || 0) * 0.1;
    this.magnet = 3.2 * (1 + (b.magnet || 0) * 0.3);
    P.speedMul = 1 + (b.swift || 0) * 0.06;
    G.audio?.sfx('epochShift');
    G.hud.banner('The Rift', `Tier ${this.tier} · Survive 3:00 and defeat the Warden`, 'epoch e2');
  }

  exit(won) {
    const S = G.game.state;
    const P = G.player;
    this.active = false;
    this.group.visible = false;
    this.floorCol.active = false;
    this.hud.hidden = true;
    this.pickEl.hidden = true;
    G.ui.timeScale = 1;
    G.hud.root.classList.remove('in-rift');
    G.game.inPocket = null;
    G.atmo.rift = 0;
    G.cam.topDown = 0;
    P.maxHp = this.baseMaxHp;
    P.hp = Math.min(P.hp, P.maxHp);
    P.speedMul = this.baseSpeedMul || 1;
    const shards = Math.floor(this.kills / 35) + Math.floor(this.level / 2) + (won ? 6 + this.tier * 2 : 0);
    S.riftBest = Math.max(S.riftBest || 0, this.t);
    if (won) {
      S.riftTier++;
      G.game.stat('rifts');
    }
    for (const m of [this.meshes]) void m;
    for (const k in this.meshes) { this.meshes[k].body.count = 0; this.meshes[k].eyes.count = 0; }
    this.enemies = [];
    this.gems = [];
    const f = this.from;
    P.spawn(f.x, f.y + 0.2, f.z + 4);
    if (P.dead) P.revive(f.x, f.y + 0.2, f.z + 4);
    G.cam.smoothTarget.copy(P.pos);
    G.fx.screenFade(1);
    G.after(0.6, () => {
      if (shards) G.game.give('starShard', shards);
      if (won) { G.game.give('crystal', 3); G.game.give('ember', 2); }
      G.hud.banner(won ? 'Rift Sealed' : 'Cast Out of the Rift', `${this.kills} foes · Level ${this.level} · ${shards} Star Shards`, won ? 'quest done' : '');
      G.game.save(true);
    });
  }

  spawn(type, near) {
    const t = TYPES[type];
    let x, z;
    const P = G.player.pos;
    if (near) { x = near.x; z = near.z; }
    else {
      const a = Math.random() * Math.PI * 2;
      const r = 22 + Math.random() * 8;
      x = P.x + Math.cos(a) * r;
      z = P.z + Math.sin(a) * r;
      const dx = x - ARENA.x, dz = z - ARENA.z, d = Math.hypot(dx, dz);
      if (d > ARENA.r - 1) { x = ARENA.x + dx / d * (ARENA.r - 1); z = ARENA.z + dz / d * (ARENA.r - 1); }
    }
    const hpMul = 1 + (this.tier - 1) * 0.5 + this.t / 120;
    const e = { type, t, x, z, vx: 0, vz: 0, hp: t.hp * (type === 'warden' ? 1 + (this.tier - 1) * 0.4 : hpMul), maxHp: 0, flash: 0, slow: 0, shootT: 2 + Math.random() * 2, spawnT: 0.5, phase: Math.random() * 6 };
    e.maxHp = e.hp;
    this.enemies.push(e);
    G.fx.motes(x, ARENA.y, z, 6, t.eye, 0.4);
    return e;
  }

  damage(e, d, color) {
    if (e.hp <= 0) return;
    const dmg = d * this.dmgMul * (1 + (this.up.might || 0) * 0.15);
    e.hp -= dmg;
    e.flash = 1;
    if (Math.random() < 0.5 || dmg > 30) G.fx.damageNumber(e.x, ARENA.y + e.t.scale * 1.8 + 0.5, e.z, dmg, color || '#ffffff', dmg > 40);
    if (e.hp <= 0) {
      this.kills++;
      G.fx.motes(e.x, ARENA.y + 0.3, e.z, e.type === 'warden' ? 80 : 5, e.t.eye, e.t.r);
      for (let i = 0; i < e.t.xp; i++) this.gems.push({ x: e.x + (Math.random() - 0.5) * e.t.r, z: e.z + (Math.random() - 0.5) * e.t.r, v: e.type === 'warden' ? 5 : 1 });
      if (e.type === 'warden') {
        this.wardenDead = true;
        G.cam.shake(0.8);
        G.audio?.sfx('bossDie');
        this.openExit();
      }
    }
  }

  openExit() {
    this.exitOpen = true;
    this.portal.visible = true;
    this.portal.position.set(ARENA.x, ARENA.y + 2.4, ARENA.z);
    G.hud.banner('The Rift is sealing', 'Step into the light to leave', 'quest done');
    G.audio?.sfx('questDone');
  }

  levelUp() {
    this.level++;
    this.xp -= this.xpNext;
    this.xpNext = Math.round(this.xpNext * 1.35 + 3);
    const pool = UPGRADES.filter((u) => (this.up[u.id] || 0) < u.max);
    const picks = [];
    while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    G.ui.timeScale = 0.0001;
    G.input.exitLock();
    G.audio?.sfx('levelup');
    const el = this.pickEl;
    el.innerHTML = `<h3>Level ${this.level}</h3><div class="cards">${picks.map((p, i) => `<button class="card" data-i="${i}"><span class="lvl">${(this.up[p.id] || 0) ? 'Lv ' + ((this.up[p.id] || 0) + 1) : 'New'}</span><b>${p.name}</b><span>${p.desc}</span><em>${i + 1}</em></button>`).join('')}</div>`;
    el.hidden = false;
    this.picking = picks;
    el.querySelectorAll('.card').forEach((b) => (b.onclick = () => this.choose(+b.dataset.i)));
  }
  choose(i) {
    const p = this.picking[i];
    if (!p) return;
    this.up[p.id] = (this.up[p.id] || 0) + 1;
    if (p.id === 'vital') { G.player.maxHp += 25; G.player.hp = G.player.maxHp; }
    if (p.id === 'swift') G.player.speedMul += 0.1;
    if (p.id === 'magnet') this.magnet *= 1.5;
    this.pickEl.hidden = true;
    this.picking = null;
    G.ui.timeScale = 1;
    G.input.requestLock();
    G.audio?.sfx('levelPick');
    if (this.xp >= this.xpNext) this.levelUp();
  }

  update(dt, pdt) {
    if (!this.active) return;
    const P = G.player;
    const inp = G.input;
    if (this.picking) {
      for (let i = 0; i < 3; i++) if (inp.hit('el' + (i + 1))) this.choose(i);
      return;
    }
    if (!dt) return;
    this.t += dt;
    // debris drift
    for (const m of this.debris) { m.userData.a += m.userData.s * dt; m.position.x = ARENA.x + Math.cos(m.userData.a) * m.userData.r; m.position.z = ARENA.z + Math.sin(m.userData.a) * m.userData.r; m.rotation.x += dt * 0.1; }
    // keep the player on the platform
    const dx = P.pos.x - ARENA.x, dz = P.pos.z - ARENA.z, dr = Math.hypot(dx, dz);
    if (dr > ARENA.r - 0.5) { P.pos.x = ARENA.x + dx / dr * (ARENA.r - 0.5); P.pos.z = ARENA.z + dz / dr * (ARENA.r - 0.5); }
    if (P.pos.y < ARENA.y - 5) P.spawn(ARENA.x, ARENA.y + 0.2, ARENA.z);
    // spawning
    if (!this.exitOpen && !P.dead) {
      this.spawnT -= dt;
      const rate = 1.4 + this.t / 18 + (this.tier - 1) * 0.6;
      if (this.spawnT <= 0 && this.enemies.length < MAX - 40) {
        this.spawnT = 1 / rate;
        const r = Math.random();
        const type = this.t > 40 && r < 0.12 ? 'brute' : this.t > 20 && r < 0.3 ? 'spitter' : 'mite';
        const n = this.t > 90 ? 3 : this.t > 45 ? 2 : 1;
        for (let i = 0; i < n; i++) this.spawn(type);
        if (Math.random() < 0.04 + this.t / 3000) { const a = Math.random() * Math.PI * 2; for (let i = 0; i < 14; i++) this.spawn('mite', { x: P.pos.x + Math.cos(a + i * 0.45) * 20, z: P.pos.z + Math.sin(a + i * 0.45) * 20 }); }
      }
      if (this.t > this.dur - 30 && !this.warden) {
        this.warden = this.spawn('warden');
        G.hud.banner('The Rift Warden', 'It hungers for your time', 'boss');
        G.audio?.sfx('roar');
        this.hud.querySelector('.rh-warden').hidden = false;
      }
      if (this.t >= this.dur && !this.exitOpen && (!this.warden || this.wardenDead)) this.openExit();
    }
    if (this.exitOpen && Math.hypot(P.pos.x - ARENA.x, P.pos.z - ARENA.z) < 2.5) return this.exit(true);
    if (P.dead && !this.deadT) this.deadT = 2.5;
    if (this.deadT) { this.deadT -= dt; if (this.deadT <= 0) { this.deadT = 0; this.exit(false); } return; }
    this.updateWeapons(pdt);
    this.updateEnemies(dt);
    this.updateGems(pdt);
    this.render();
    // hud
    const left = Math.max(0, this.dur - this.t);
    this.hud.querySelector('.rh-time').textContent = this.exitOpen ? 'Seal the rift!' : `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    this.hud.querySelector('.rh-xp .fill').style.width = (this.xp / this.xpNext * 100) + '%';
    this.hud.querySelector('.rh-lv').textContent = 'Lv ' + this.level;
    this.hud.querySelector('.rh-kills').textContent = this.kills + ' foes';
    if (this.warden) this.hud.querySelector('.rh-warden .fill').style.width = Math.max(0, this.warden.hp / this.warden.maxHp * 100) + '%';
  }

  nearest(x, z, range = 30) {
    let best = null, bd = range;
    for (const e of this.enemies) { if (e.hp <= 0) continue; const d = Math.hypot(e.x - x, e.z - z); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  updateWeapons(dt) {
    const P = G.player;
    const px = P.pos.x, pz = P.pos.z;
    const haste = 1 + (this.up.haste || 0) * 0.12;
    const base = 10 + G.player.level * 1.5;
    // orbit blades
    const nb = this.up.blades || 0;
    this.bladeAng = (this.bladeAng || 0) + dt * 3.2;
    this.blades = [];
    for (let i = 0; i < nb; i++) {
      const a = this.bladeAng + (i / nb) * Math.PI * 2;
      const r = 2.6 + nb * 0.15;
      this.blades.push({ x: px + Math.cos(a) * r, z: pz + Math.sin(a) * r, a });
    }
    this.bladeHitT = (this.bladeHitT || 0) - dt;
    if (this.bladeHitT <= 0) {
      this.bladeHitT = 0.18;
      for (const b of this.blades) for (const e of this.enemies) if (e.hp > 0 && Math.hypot(e.x - b.x, e.z - b.z) < e.t.r + 0.8) { this.damage(e, base * 0.9, '#ffe08a'); e.vx += (e.x - px) * 0.8; e.vz += (e.z - pz) * 0.8; }
    }
    // bolts
    if (this.up.bolt) {
      this.cd.bolt -= dt * haste;
      if (this.cd.bolt <= 0) {
        this.cd.bolt = 1.1 / (1 + this.up.bolt * 0.3);
        const n = 1 + Math.floor(this.up.bolt / 3);
        for (let k = 0; k < n; k++) {
          const t = this.nearest(px + (Math.random() - 0.5) * k * 6, pz + (Math.random() - 0.5) * k * 6, 28);
          if (!t) break;
          G.combat.spawnProjectile({ from: new THREE.Vector3(px, ARENA.y + 1.2, pz), to: new THREE.Vector3(t.x, ARENA.y + 0.8, t.z), speed: 30, color: 0x9fe0ff, size: 0.22, dmg: 0, life: 1.4, riftTarget: t, pierce: this.up.bolt >= 4 ? 2 : 0 });
        }
        G.audio?.sfx('frostCast', { volume: 0.25 });
      }
    }
    // nova
    if (this.up.nova) {
      this.cd.nova -= dt * haste;
      if (this.cd.nova <= 0) {
        this.cd.nova = 4.5 - this.up.nova * 0.5;
        const R = 5 + this.up.nova * 1.2;
        G.fx.ring(px, ARENA.y + 0.2, pz, R, 0xff8a3a, 1, 0.5);
        G.fx.elementBurst(px, ARENA.y + 0.5, pz, 0, 0.8);
        for (const e of this.enemies) if (e.hp > 0 && Math.hypot(e.x - px, e.z - pz) < R) this.damage(e, base * (1 + this.up.nova * 0.4), '#ffa45c');
        G.audio?.sfx('fireHit', { volume: 0.5 });
      }
    }
    // frost shards
    if (this.up.frost) {
      this.cd.frost -= dt * haste;
      if (this.cd.frost <= 0) {
        this.cd.frost = 3.2 - this.up.frost * 0.3;
        const n = 6 + this.up.frost * 2;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          G.combat.spawnProjectile({ from: new THREE.Vector3(px, ARENA.y + 1, pz), to: new THREE.Vector3(px + Math.cos(a) * 10, ARENA.y + 1, pz + Math.sin(a) * 10), speed: 18, color: 0x8fe8ff, size: 0.18, dmg: 0, life: 0.9, riftFrost: true, pierce: 3 });
        }
        G.audio?.sfx('freeze', { volume: 0.4 });
      }
    }
    // storm
    if (this.up.storm) {
      this.cd.storm -= dt * haste;
      if (this.cd.storm <= 0) {
        this.cd.storm = 2.6 - this.up.storm * 0.3;
        for (let k = 0; k < this.up.storm; k++) {
          const alive = this.enemies.filter((e) => e.hp > 0 && Math.hypot(e.x - px, e.z - pz) < 26);
          const t = alive[Math.floor(Math.random() * alive.length)];
          if (!t) break;
          G.fx.bolt(new THREE.Vector3(t.x + 1, ARENA.y + 22, t.z), new THREE.Vector3(t.x, ARENA.y, t.z), 0xc39bff, 1.2, 0.2);
          for (const e of this.enemies) if (e.hp > 0 && Math.hypot(e.x - t.x, e.z - t.z) < 2.5) this.damage(e, base * 2.2, '#d4b6ff');
        }
        G.audio?.sfx('thunder', { volume: 0.4 });
      }
    }
    // rift projectiles hit rift enemies
    for (const p of G.combat.projectiles) {
      if (!(p.riftTarget || p.riftFrost)) continue;
      for (const e of this.enemies) {
        if (e.hp <= 0 || (p.hitSet && p.hitSet.has(e))) continue;
        if (Math.hypot(e.x - p.pos.x, e.z - p.pos.z) < e.t.r + 0.4) {
          if (p.riftFrost) { this.damage(e, base * 0.7, '#a6eaff'); e.slow = 2; }
          else this.damage(e, base * 1.3, '#bfe8ff');
          (p.hitSet = p.hitSet || new Set()).add(e);
          if (!p.pierce) { p.life = 0; break; }
          p.pierce--;
        }
      }
    }
    // manual melee also hits rift foes
    const a = P.action;
    if (a && a.type === 'attack' && a.t >= a.hit[0] && a.t <= a.hit[1]) {
      const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
      for (const e of this.enemies) {
        if (e.hp <= 0 || a.hitSet.has(e)) continue;
        const ex = e.x - px, ez = e.z - pz, d = Math.hypot(ex, ez);
        if (d - e.t.r < a.reach && (ex * fx + ez * fz) / (d || 1) > Math.cos(a.arc)) { a.hitSet.add(e); this.damage(e, P.attackPower * a.dmg, '#ffffff'); }
      }
    }
  }

  updateEnemies(dt) {
    const P = G.player;
    const px = P.pos.x, pz = P.pos.z;
    // spatial hash for separation
    const cell = 1.6;
    const hash = new Map();
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const k = Math.floor(e.x / cell) * 73856093 ^ Math.floor(e.z / cell) * 19349663;
      let a = hash.get(k);
      if (!a) hash.set(k, (a = []));
      a.push(e);
    }
    this.hurtT -= dt;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.hp <= 0) { this.enemies.splice(i, 1); continue; }
      e.spawnT -= dt;
      e.flash = Math.max(0, e.flash - dt * 6);
      e.slow = Math.max(0, e.slow - dt);
      const t = e.t;
      const dx = px - e.x, dz = pz - e.z, d = Math.hypot(dx, dz) || 1;
      let sp = t.speed * (e.slow > 0 ? 0.45 : 1) * (1 + this.t / 400);
      if (t.ranged && d < 9) sp *= -0.6;
      e.vx += ((dx / d) * sp - e.vx) * Math.min(1, dt * 4);
      e.vz += ((dz / d) * sp - e.vz) * Math.min(1, dt * 4);
      // separation
      const kx = Math.floor(e.x / cell), kz = Math.floor(e.z / cell);
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
        const a = hash.get((kx + ox) * 73856093 ^ (kz + oz) * 19349663);
        if (!a) continue;
        for (const o of a) {
          if (o === e) continue;
          const sx = e.x - o.x, sz = e.z - o.z, sd = Math.hypot(sx, sz);
          const min = t.r + o.t.r;
          if (sd < min && sd > 1e-4) { e.x += (sx / sd) * (min - sd) * 0.5; e.z += (sz / sd) * (min - sd) * 0.5; }
        }
      }
      if (e.spawnT <= 0) { e.x += e.vx * dt; e.z += e.vz * dt; }
      // contact damage
      if (d < t.r + P.radius + 0.2 && this.hurtT <= 0 && e.spawnT <= 0 && !P.dead) {
        const r = P.receiveAttack(t.dmg * (1 + (this.tier - 1) * 0.3), { pos: new THREE.Vector3(e.x, ARENA.y, e.z) }, { parryable: false });
        if (r === 'hit' || r === 'block') this.hurtT = 0.55;
      }
      if (t.ranged && e.spawnT <= 0) {
        e.shootT -= dt;
        if (e.shootT <= 0 && d < 22) {
          e.shootT = 3 + Math.random() * 2;
          G.combat.spawnProjectile({ from: new THREE.Vector3(e.x, ARENA.y + 0.8, e.z), to: new THREE.Vector3(px, ARENA.y + 1, pz), speed: 10, color: 0x4affff, size: 0.3, dmg: t.dmg, hostile: true, parryable: true, owner: null, life: 4 });
        }
      }
      if (e.type === 'warden' && Math.random() < dt * 0.4) {
        G.fx.ring(e.x, ARENA.y + 0.2, e.z, 8, 0xa060ff, 1, 0.7);
        if (d < 8.5) P.receiveAttack(t.dmg, { pos: new THREE.Vector3(e.x, ARENA.y, e.z) }, { parryable: false, unblockable: true, heavy: true });
      }
    }
  }

  updateGems(dt) {
    const P = G.player;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      const d = Math.hypot(g.x - P.pos.x, g.z - P.pos.z);
      if (d < this.magnet * (1 + (this.up.magnet || 0) * 0.5)) {
        const k = Math.min(1, dt * (8 + 20 / Math.max(0.5, d)));
        g.x += (P.pos.x - g.x) * k;
        g.z += (P.pos.z - g.z) * k;
        if (d < 0.7) {
          this.gems.splice(i, 1);
          this.xp += g.v;
          if (Math.random() < 0.3) G.audio?.sfx('pickup', { pitch: 1.2 + Math.random() * 0.4, volume: 0.4 });
          if (this.xp >= this.xpNext) this.levelUp();
        }
      }
    }
  }

  render() {
    const counts = {};
    for (const k in this.meshes) counts[k] = 0;
    const col = new THREE.Color();
    for (const e of this.enemies) {
      const M = this.meshes[e.type];
      const i = counts[e.type]++;
      const s = e.t.scale * (e.spawnT > 0 ? 1 - e.spawnT * 2 : 1);
      const bob = Math.abs(Math.sin(G.time * 8 + e.phase)) * 0.15 * e.t.scale;
      const yaw = Math.atan2(G.player.pos.x - e.x, G.player.pos.z - e.z);
      _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      _p.set(e.x, ARENA.y + s * 0.95 + bob, e.z);
      _m.compose(_p, _q, _s.set(s, s, s));
      M.body.setMatrixAt(i, _m);
      col.setRGB(1 + e.flash * 3, 1 + e.flash * 3, 1 + e.flash * 3);
      M.body.setColorAt(i, col);
      for (const side of [-1, 1]) {
        const ex = e.x + Math.sin(yaw) * s * 0.85 + Math.cos(yaw) * side * s * 0.35;
        const ez = e.z + Math.cos(yaw) * s * 0.85 - Math.sin(yaw) * side * s * 0.35;
        _m.compose(_p.set(ex, ARENA.y + s * 1.2 + bob, ez), _q, _s.set(s, s, s));
        M.eyes.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), _m);
      }
    }
    for (const k in this.meshes) {
      const M = this.meshes[k];
      M.body.count = counts[k];
      M.eyes.count = counts[k] * 2;
      M.body.instanceMatrix.needsUpdate = true;
      if (M.body.instanceColor) M.body.instanceColor.needsUpdate = true;
      M.eyes.instanceMatrix.needsUpdate = true;
    }
    const n = Math.min(1500, this.gems.length);
    for (let i = 0; i < n; i++) {
      const g = this.gems[i];
      _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), G.time * 3 + i);
      _m.compose(_p.set(g.x, ARENA.y + 0.4 + Math.sin(G.time * 4 + i) * 0.1, g.z), _q, _s.set(g.v > 1 ? 2 : 1, g.v > 1 ? 2 : 1, g.v > 1 ? 2 : 1));
      this.gemMesh.setMatrixAt(i, _m);
    }
    this.gemMesh.count = n;
    this.gemMesh.instanceMatrix.needsUpdate = true;
    const bl = this.blades || [];
    for (let i = 0; i < bl.length; i++) {
      _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -bl[i].a);
      _m.compose(_p.set(bl[i].x, ARENA.y + 1, bl[i].z), _q, _s.set(1, 1, 1));
      this.bladeMesh.setMatrixAt(i, _m);
      if (Math.random() < 0.3) G.fx.add.emit({ x: bl[i].x, y: ARENA.y + 1, z: bl[i].z, life: 0.25, size: 0.4, size1: 0, color: [3, 2.6, 1.2] });
    }
    this.bladeMesh.count = bl.length;
    this.bladeMesh.instanceMatrix.needsUpdate = true;
    if (this.portal.visible) { this.portal.rotation.y += 0.02; if (Math.random() < 0.5) G.fx.motes(ARENA.x, ARENA.y, ARENA.z, 2, 0xffe08a, 1.5); }
  }
}
