import * as THREE from 'three';
import { clamp, rand } from './noise.js';
import { SEA_Y } from './world.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const ELEMENTS = [
  { id: 'normal', name: 'Arrow', color: 0xe8e0d0, key: '1' },
  { id: 'fire', name: 'Fire', color: 0xff7a2a, key: '2' },
  { id: 'shock', name: 'Shock', color: 0x6ad8ff, key: '3', requires: 'volta' },
];
const BOW_DMG = [1, 1.35, 1.8];

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
function segPointDist2(a, b, p, out) {
  _v.subVectors(b, a); const l2 = _v.lengthSq();
  let t = l2 > 0 ? _w.subVectors(p, a).dot(_v) / l2 : 0;
  t = clamp(t, 0, 1);
  out.copy(a).addScaledVector(_v, t);
  return out.distanceToSquared(p);
}

// ---------- enemy meshes
const wispCoreMat = new THREE.MeshStandardMaterial({ color: 0xc070ff, emissive: 0xa040ff, emissiveIntensity: 3 });
const wispShellMat = new THREE.MeshStandardMaterial({ color: 0x1a1428, roughness: 0.4, metalness: 0.3, flatShading: true });
const huskMat = new THREE.MeshStandardMaterial({ color: 0x3a3438, roughness: 0.9, flatShading: true });
const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff5a2a, emissive: 0xff3a10, emissiveIntensity: 3 });
const boltMat = new THREE.MeshBasicMaterial({ color: 0xd090ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
const hpBg = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthTest: false });
const hpFg = new THREE.MeshBasicMaterial({ color: 0xff4a4a, depthTest: false });

let wispSpikeGeo = null;
function makeWisp() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), wispCoreMat);
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), wispShellMat);
  shell.scale.set(1, 1, 1);
  if (!wispSpikeGeo) {
    const parts = [];
    const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0.6, 0.6, 0.5], [-0.6, -0.5, 0.6]];
    for (const d of dirs) {
      const v = new THREE.Vector3(...d).normalize();
      const g = new THREE.ConeGeometry(0.16, 0.9, 5);
      g.translate(0, 0.95, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v));
      parts.push(g.toNonIndexed());
    }
    wispSpikeGeo = mergeGeometries(parts, false);
    wispSpikeGeo.computeVertexNormals();
  }
  const spikes = new THREE.Mesh(wispSpikeGeo, wispShellMat);
  g.add(core, shell, spikes);
  shell.castShadow = true;
  g.userData = { core, shell, spikes };
  return g;
}
function makeHusk() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 0), huskMat);
  body.scale.set(1, 0.8, 1.3); body.position.y = 1.0; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), huskMat);
  head.position.set(0, 1.25, -1.1); head.castShadow = true;
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), eyeMat); e1.position.set(0.2, 1.35, -1.52);
  const e2 = e1.clone(); e2.position.x = -0.2;
  const legs = [];
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.9, 0.22), huskMat);
    l.geometry.translate(0, -0.45, 0);
    l.position.set(i % 2 ? 0.6 : -0.6, 0.9, i < 2 ? -0.5 : 0.6);
    l.castShadow = true;
    legs.push(l); g.add(l);
  }
  for (let i = 0; i < 4; i++) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.7, 4), huskMat);
    sp.position.set((i - 1.5) * 0.3, 1.75, 0.2 - i * 0.15); sp.rotation.x = -0.4;
    g.add(sp);
  }
  g.add(body, head, e1, e2);
  g.userData = { legs, body, head };
  return g;
}
function makeHpBar() {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.16), hpBg);
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.11), hpFg.clone());
  fg.geometry.translate(0.68, 0, 0); fg.position.x = -0.68; fg.position.z = 0.01;
  bg.renderOrder = 10; fg.renderOrder = 11;
  g.add(bg, fg);
  g.userData.fg = fg;
  g.visible = false;
  return g;
}

export class Combat {
  constructor(G) {
    this.G = G;
    this.arrows = [];
    this.stuck = [];
    this.enemies = [];
    this.bolts = [];
    this.clouds = [];       // oil clouds
    this.burning = [];      // {isl, node}
    this.element = 0;
    this.charge = 0;
    this.drawing = false;
    this.ray = new THREE.Raycaster();
    this.spreadTimer = 0;
    this.fireLight = new THREE.PointLight(0xff8a3a, 0, 40, 1.4);
    G.scene.add(this.fireLight);
    // arrow template
    const shaft = new THREE.CylinderGeometry(0.03, 0.03, 1.1, 4); shaft.rotateX(Math.PI / 2);
    const head = new THREE.ConeGeometry(0.07, 0.22, 5); head.rotateX(-Math.PI / 2); head.translate(0, 0, -0.62);
    const fl = new THREE.BoxGeometry(0.16, 0.01, 0.22); fl.translate(0, 0, 0.45);
    this.arrowGeos = [shaft, head, fl];
    this.arrowMats = ELEMENTS.map((e) => new THREE.MeshStandardMaterial({ color: e.color, emissive: e.id === 'normal' ? 0x000000 : e.color, emissiveIntensity: e.id === 'normal' ? 0 : 2.5 }));
    this.woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6a42 });
    this.boltGeo = new THREE.SphereGeometry(0.3, 10, 8);
  }

  canShoot() { const m = this.G.player.mode; return m !== 'helm'; }
  elementUnlocked(i) { const e = ELEMENTS[i]; return !e.requires || this.G.save.rescued.includes(e.requires); }

  makeArrow(el) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(this.arrowGeos[0], this.woodMat));
    g.add(new THREE.Mesh(this.arrowGeos[1], this.arrowMats[el]));
    g.add(new THREE.Mesh(this.arrowGeos[2], this.arrowMats[el]));
    this.G.scene.add(g);
    return g;
  }

  // ---------- input / bow
  updateBow(dt) {
    const G = this.G, inp = G.input;
    if (inp.hit('Digit1')) this.selectElement(0);
    if (inp.hit('Digit2')) this.selectElement(1);
    if (inp.hit('Digit3')) this.selectElement(2);
    if (inp.mouse.wheel && G.player.mode !== 'helm') {
      let e = this.element;
      for (let k = 0; k < 3; k++) { e = (e + (inp.mouse.wheel > 0 ? 1 : 2)) % 3; if (this.elementUnlocked(e)) break; }
      this.selectElement(e);
    }
    if (!this.canShoot()) { this.drawing = false; this.charge = 0; return; }
    if (inp.mouse.left) {
      if (!this.drawing) { this.drawing = true; this.charge = 0; G.audio.play('draw'); }
      this.charge = Math.min(1, this.charge + dt / 0.55);
    } else if (this.drawing) {
      this.drawing = false;
      this.fire(Math.max(0.25, this.charge));
      this.charge = 0;
    }
  }
  selectElement(i) {
    if (!this.elementUnlocked(i)) { this.G.ui.toast('Shock arrows: rescue Volta the Tinker to unlock', 2.5); this.G.audio.play('error'); return; }
    this.element = i; this.G.audio.play('click');
  }

  fire(charge) {
    const G = this.G;
    const cam = G.camera;
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    const hand = G.player.pos.clone().add(new THREE.Vector3(0, 1.5, 0)).addScaledVector(dir, 0.6);
    // aim point: what the crosshair is over
    const meshes = G.islands.meshesNear(G.player.pos, 120);
    if (G.storm && G.storm.active) meshes.push(...G.storm.raycastMeshes());
    this.ray.set(cam.position, dir); this.ray.far = 300;
    let aim = cam.position.clone().addScaledVector(dir, 200);
    const hits = this.ray.intersectObjects(meshes, false);
    for (const h of hits) if (h.distance > cam.position.distanceTo(hand) + 0.5) { aim = h.point; break; }
    // enemies under the crosshair
    let bestE = null, bestT = 1e9;
    for (const e of this.enemies) {
      _v.subVectors(e.pos, cam.position);
      const t = _v.dot(dir);
      if (t < 0 || t > 250) continue;
      const d2 = _v.lengthSq() - t * t;
      if (d2 < (e.radius + 0.3) ** 2 && t < bestT) { bestT = t; bestE = e; }
    }
    if (bestE && bestT < cam.position.distanceTo(aim)) aim = bestE.pos.clone();
    const v = aim.sub(hand).normalize().multiplyScalar(45 + 55 * charge);
    const el = this.element;
    const mesh = this.makeArrow(el);
    mesh.position.copy(hand);
    this.arrows.push({ pos: hand, vel: v, el, mesh, life: 4, dmg: (12 + 22 * charge) * BOW_DMG[G.save.upg.bow - 1], hitSet: new Set() });
    G.audio.play('bow');
    if (el === 1) G.audio.play('fire', 0.4);
    if (el === 2) G.audio.play('zap', 0.4);
  }

  // ---------- spawning
  onIslandAdded(isl) { isl.enemiesSpawned = false; }
  removeIslandEnemies(isl) {
    for (const e of this.enemies) if (e.island === isl && e.type === 'husk') e.dead = true;
  }

  spawn(type, pos, island) {
    const G = this.G;
    const tier = island ? island.tier : 3;
    const mesh = type === 'wisp' ? makeWisp() : makeHusk();
    mesh.position.copy(pos);
    G.scene.add(mesh);
    const bar = makeHpBar(); G.scene.add(bar);
    const hpMul = 1 + tier * 0.35;
    const e = {
      type, mesh, bar, island, pos: mesh.position, vel: new THREE.Vector3(), home: pos.clone(),
      local: island ? pos.clone().sub(island.pos) : null,
      hp: (type === 'wisp' ? 40 : 65) * hpMul, maxHp: (type === 'wisp' ? 40 : 65) * hpMul,
      radius: type === 'wisp' ? 1.0 : 1.3, dmgMul: 1 + tier * 0.25,
      burn: 0, stun: 0, oiled: 0, cd: rand(1.5, 3), orbit: Math.random() * 6.28, state: 'idle', windup: 0,
      airborne: false, dead: false, phase: Math.random() * 10, hitFlash: 0,
    };
    this.enemies.push(e);
    return e;
  }

  // ---------- damage model
  hitEnemy(e, dmg, el, from) {
    const G = this.G;
    if (e.dead) return;
    const wet = G.world.isRaining();
    let total = dmg;
    if (el === 1) { e.burn = G.world.isRaining() ? 2 : 4.5; if (e.oiled > 0) { this.explode(e.pos.clone(), 7, 70); } }
    if (el === 2) {
      total *= wet ? 1.6 : 1;
      e.stun = 1.3;
      this.chain(e, total * 0.6, wet);
      G.audio.play('shock');
    }
    e.hp -= total;
    e.hitFlash = 0.15;
    G.ui.popText(e.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), Math.round(total), el === 1 ? '#ffa050' : el === 2 ? '#7ee0ff' : '#ffffff');
    G.audio.play('hit', 0.6);
    if (from) { const k = e.pos.clone().sub(from).setY(0).normalize(); e.vel.addScaledVector(k, e.type === 'wisp' ? 6 : 2); }
    if (e.hp <= 0) this.kill(e);
  }

  chain(src, dmg, wet) {
    const G = this.G;
    const range = wet ? 13 : 7.5;
    const maxN = wet ? 99 : (G.save.questDone.includes('volta') ? 4 : 2);
    let from = src, n = 0;
    const done = new Set([src]);
    while (n < maxN) {
      let best = null, bd = range * range;
      for (const e of this.enemies) {
        if (done.has(e) || e.dead) continue;
        const d = e.pos.distanceToSquared(from.pos);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) break;
      this.arc(from.pos, best.pos);
      done.add(best);
      best.stun = 1.0;
      best.hp -= dmg; best.hitFlash = 0.15;
      G.ui.popText(best.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), Math.round(dmg), '#7ee0ff');
      if (best.hp <= 0) this.kill(best);
      from = best; n++;
    }
    if (wet && n > 0 && !G.save.flags.wetChain) { G.save.flags.wetChain = true; G.ui.toast('⚡ The rain conducts! Shock arcs through every soaked foe', 3); }
  }

  arc(a, b) {
    const G = this.G;
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const p = a.clone().lerp(b, i / 8);
      if (i > 0 && i < 8) p.add(new THREE.Vector3(rand(-0.6, 0.6), rand(-0.6, 0.6), rand(-0.6, 0.6)));
      pts.push(p);
    }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x9aeaff, transparent: true, blending: THREE.AdditiveBlending }));
    G.scene.add(l);
    G.world.bolts.push({ objs: [l], t: 0.2 });
    G.particles.burst(b, 8, { color: [0.6, 0.9, 1], speed: 6, size: 0.35, life: 0.3 });
  }

  kill(e) {
    const G = this.G;
    if (e.dead) return;
    e.dead = true;
    G.particles.burst(e.pos, 30, { color: e.type === 'wisp' ? [0.8, 0.4, 1] : [1, 0.5, 0.2], color2: [0.2, 0.1, 0.3], speed: 9, size: 0.7, life: 0.9 });
    G.particles.burst(e.pos, 10, { additive: false, color: [0.2, 0.18, 0.22], speed: 4, size: 1.2, size1: 3, alpha: 0.6, life: 1.2 });
    G.audio.play('explode', 0.35);
    const tier = e.island ? e.island.tier : 2;
    const shards = Math.round((e.type === 'wisp' ? 4 : 6) * (1 + tier * 0.6));
    const scrap = Math.random() < 0.6 ? 1 + tier : 0;
    G.progress.gain({ shards, scrap }, e.pos);
    G.save.stats.kills = (G.save.stats.kills || 0) + 1;
    if (G.storm && G.storm.active && e.storm) G.storm.onKill(e);
  }

  // ---------- fire system
  ignite(isl, node) {
    if (node.state !== 0) return;
    node.state = 1; node.t = node.kind === 'tree' ? rand(6, 9) : rand(2.5, 4);
    if (this.G.world.isRaining()) node.t *= 0.4;
    this.burning.push({ isl, node });
  }
  igniteAt(p, radius) {
    const G = this.G;
    let n = 0;
    for (const isl of G.islands.near(p, radius + 5)) {
      const lx = p.x - isl.pos.x, ly = p.y - isl.pos.y, lz = p.z - isl.pos.z;
      for (const f of isl.fuel) {
        if (f.state === 0 && (f.x - lx) ** 2 + (f.z - lz) ** 2 < radius * radius && Math.abs(f.y - ly) < radius + f.h) { this.ignite(isl, f); n++; }
      }
    }
    for (const c of this.clouds) if (c.pos.distanceTo(p) < c.radius + radius) c.ignite = true;
    for (const e of this.enemies) if (e.pos.distanceTo(p) < radius + 1) e.burn = Math.max(e.burn, 3);
    for (const isl of G.islands.near(p, radius + 2)) for (const b of isl.barrels) {
      if (b.alive && _v.set(isl.pos.x + b.x, isl.pos.y + b.y + 0.6, isl.pos.z + b.z).distanceTo(p) < radius + 0.6) this.detonateBarrel(b);
    }
    return n;
  }
  fireLiftAt(p) {
    let lift = 0;
    for (const b of this.burning) {
      const f = b.node, isl = b.isl;
      const dx = p.x - (isl.pos.x + f.x), dz = p.z - (isl.pos.z + f.z), dy = p.y - (isl.pos.y + f.y);
      if (dx * dx + dz * dz < 9 && dy > 0 && dy < 30) lift = Math.max(lift, f.kind === 'tree' ? 34 : 22);
    }
    return lift;
  }
  setFuelVisual(isl, f) {
    const mesh = f.kind === 'tree' ? isl.trees : isl.grass;
    if (!mesh) return;
    const c = new THREE.Color();
    if (f.state === 1) c.setRGB(1.05, 0.5, 0.28);
    else if (f.state === 2) c.setRGB(0.12, 0.11, 0.1);
    else c.setRGB(f.tint, f.tint, f.tint);
    mesh.setColorAt(f.idx, c);
    mesh.instanceColor.needsUpdate = true;
    if (f.kind === 'tree') {
      const m = f.matrix.clone();
      if (f.state === 2) m.multiply(new THREE.Matrix4().makeScale(0.8, 0.75, 0.8));
      mesh.setMatrixAt(f.idx, m); mesh.instanceMatrix.needsUpdate = true;
    }
  }

  updateFire(dt) {
    const G = this.G;
    const rain = G.world.isRaining();
    this.spreadTimer -= dt;
    const doSpread = this.spreadTimer <= 0;
    if (doSpread) this.spreadTimer = 0.45;
    const wind = G.world.wind;
    const cam = G.camera.position;
    let lightPos = null, lightN = 0, bestD = 1e9;
    const pp = G.player.pos;
    for (let i = this.burning.length - 1; i >= 0; i--) {
      const { isl, node: f } = this.burning[i];
      if (!isl.group.parent) { this.burning.splice(i, 1); continue; }
      if (f.state === 1 && f.t === undefined) f.t = 3;
      f.t -= dt * (rain ? 1.8 : 1);
      if (f.visualState !== 1) { f.visualState = 1; this.setFuelVisual(isl, f); }
      const wx = isl.pos.x + f.x, wy = isl.pos.y + f.y, wz = isl.pos.z + f.z;
      const dc = (wx - cam.x) ** 2 + (wz - cam.z) ** 2;
      const rate = dc < 80 * 80 ? 1 : dc < 200 * 200 ? 0.3 : 0.05;
      if (Math.random() < rate * (f.kind === 'tree' ? 0.9 : 0.5)) G.particles.fire({ x: wx, y: wy + (f.kind === 'tree' ? Math.random() * f.h : 0.2), z: wz }, f.kind === 'tree' ? 1.3 : 0.8);
      if (dc < bestD) { bestD = dc; lightPos = _w.set(wx, wy + 2, wz).clone(); }
      lightN++;
      // damage things standing in fire
      const pd = (pp.x - wx) ** 2 + (pp.z - wz) ** 2;
      if (pd < 2.6 && Math.abs(pp.y - wy) < f.h + 0.5) {
        if (!this._lastBurnHurt || G.time - this._lastBurnHurt > 0.5) { this._lastBurnHurt = G.time; G.player.damage(6); }
      }
      for (const e of this.enemies) if ((e.pos.x - wx) ** 2 + (e.pos.z - wz) ** 2 < 3 && Math.abs(e.pos.y - wy) < f.h + 1) e.burn = Math.max(e.burn, 2.5);
      for (const c of this.clouds) if (_v.set(wx, wy, wz).distanceTo(c.pos) < c.radius) c.ignite = true;
      if (doSpread) {
        for (const j of f.nb) {
          const g = isl.fuel[j];
          if (g.state !== 0) continue;
          let p = g.kind === 'grass' ? 0.32 : 0.16;
          const dx = g.x - f.x, dz = g.z - f.z, dl = Math.hypot(dx, dz) || 1;
          const along = (dx * wind.x + dz * wind.z) / dl;
          p *= 1 + Math.max(-0.7, along * 0.25);
          if (rain) p *= 0.12;
          if (Math.random() < p) this.ignite(isl, g);
        }
        for (const b of isl.barrels) if (b.alive && (b.x - f.x) ** 2 + (b.z - f.z) ** 2 < 5) this.detonateBarrel(b);
      }
      if (f.t <= 0) {
        f.state = 2; f.regrow = rand(60, 110); f.visualState = 2;
        this.setFuelVisual(isl, f);
        this.burning.splice(i, 1);
        if (!isl.burnt) isl.burnt = [];
        isl.burnt.push(f);
      }
    }
    // regrowth (the world heals)
    for (const isl of G.islands.list) {
      if (!isl.burnt || !isl.burnt.length) continue;
      for (let k = isl.burnt.length - 1; k >= 0; k--) {
        const f = isl.burnt[k];
        f.regrow -= dt;
        if (f.regrow <= 0) { f.state = 0; f.visualState = 0; this.setFuelVisual(isl, f); isl.burnt.splice(k, 1); }
      }
    }
    if (lightPos && bestD < 120 * 120) {
      this.fireLight.position.copy(lightPos);
      this.fireLight.intensity = Math.min(1, lightN / 6) * (70 + Math.random() * 40);
    } else this.fireLight.intensity = 0;
  }

  // ---------- oil & explosions
  detonateBarrel(b) {
    if (!b.alive) return;
    b.alive = false;
    b.mesh.visible = false;
    const isl = b.island;
    const p = new THREE.Vector3(isl.pos.x + b.x, isl.pos.y + b.y + 0.6, isl.pos.z + b.z);
    this.explode(p, 7, 75);
  }
  burstBarrel(b) {
    if (!b.alive) return;
    b.alive = false; b.mesh.visible = false;
    const isl = b.island;
    const p = new THREE.Vector3(isl.pos.x + b.x, isl.pos.y + b.y + 1.2, isl.pos.z + b.z);
    this.clouds.push({ pos: p, radius: 5, life: 16, ignite: false, island: isl, local: p.clone().sub(isl.pos) });
    this.G.audio.play('thud');
    this.G.particles.burst(p, 30, { additive: false, color: [0.12, 0.1, 0.08], color2: [0.25, 0.2, 0.15], speed: 5, size: 1.5, size1: 4, alpha: 0.7, life: 1.5, drag: 3 });
    if (!this.G.save.flags.oil) { this.G.save.flags.oil = true; this.G.ui.toast('🛢 An oil cloud! Send a fire arrow through it…', 3.5); }
  }

  explode(p, radius, dmg) {
    const G = this.G;
    G.particles.burst(p, 55, { color: [1, 0.7, 0.3], color2: [0.9, 0.2, 0.03], speed: radius * 2.4, size: 1.5, size1: 0.3, life: 0.8, drag: 3, alpha: 0.6 });
    G.particles.burst(p, 30, { additive: false, color: [0.25, 0.2, 0.18], color2: [0.45, 0.42, 0.4], speed: radius * 1.2, size: 3, size1: 7, alpha: 0.55, life: 2.2, drag: 2, up: 2 });
    G.particles.burst(p, 25, { color: [1, 0.9, 0.6], speed: radius * 4, size: 0.3, life: 1.2, grav: 12, drag: 0.5 });
    G.audio.play('explode', clamp(1.3 - p.distanceTo(G.camera.position) / 120, 0.2, 1));
    G.world.flash = Math.max(G.world.flash, 0.12);
    G.world.flashPos.copy(p);
    this.fireLight.position.copy(p); this.fireLight.intensity = 450;
    const pd = p.distanceTo(G.player.pos.clone().add(new THREE.Vector3(0, 1, 0)));
    G.cameraShake = Math.max(G.cameraShake, clamp(1.5 - pd / 30, 0, 1.2));
    if (pd < radius) {
      const k = 1 - pd / radius;
      G.player.damage(dmg * 0.35 * k);
      // rocket-jump
      const push = G.player.pos.clone().sub(p).normalize();
      G.player.vel.addScaledVector(push, 18 * k); G.player.vel.y += 14 * k;
      G.player.onGround = false; G.player.platform = null;
      if (G.player.mode === 'grapple') G.player.cancelGrapple();
    }
    for (const e of this.enemies) {
      const d = e.pos.distanceTo(p);
      if (d < radius + e.radius) {
        const k = 1 - d / (radius + e.radius);
        const push = e.pos.clone().sub(p).normalize();
        e.vel.addScaledVector(push, 16 * k); e.vel.y += 12 * k;
        if (e.type === 'husk') e.airborne = true;
        e.burn = Math.max(e.burn, 4);
        this.hitEnemy(e, dmg * (0.4 + 0.6 * k), 0, null);
      }
    }
    if (G.ship && G.ship.pos.distanceTo(p) < radius + 8) G.ship.damage(dmg * 0.2);
    // chain reactions: oil, barrels, fuel
    setTimeout(() => { if (G.state !== 'title') this.igniteAt(p, radius * 0.8); }, 60);
    if (!G.save.flags.boom) { G.save.flags.boom = true; G.ui.toast('💥 Fire + oil = boom. Blasts can launch you skyward too!', 3.5); }
  }

  lightningHit(p) {
    const G = this.G;
    G.particles.burst(p, 40, { color: [0.8, 0.9, 1], speed: 12, size: 0.5, life: 0.5 });
    const pd = G.player.pos.distanceTo(p);
    if (pd < 4.5) { G.player.damage(28, p); G.ui.toast('Struck by lightning! Watch for the crackling glow', 2.5, 'warn'); }
    for (const e of this.enemies) if (e.pos.distanceTo(p) < 5) { this.hitEnemy(e, 50, 2, p); }
    if (G.ship && G.ship.pos.distanceTo(p) < 12) G.ship.damage(15);
    this.igniteAt(p, 3);
  }

  // ---------- per-frame
  update(dt) {
    const G = this.G;
    this.updateBow(dt);
    // spawn enemies on islands that come near
    const pp = G.player.pos;
    for (const isl of G.islands.list) {
      if (isl.enemiesSpawned || !isl.enemySpawns.length || isl.rising) continue;
      if (isl.pos.distanceToSquared(pp) < 170 * 170) {
        isl.enemiesSpawned = true;
        for (const s of isl.enemySpawns) this.spawn(s.type, new THREE.Vector3(isl.pos.x + s.x, isl.pos.y + s.y, isl.pos.z + s.z), isl);
      }
    }
    this.updateArrows(dt);
    this.updateEnemies(dt);
    this.updateBolts(dt);
    this.updateClouds(dt);
    this.updateFire(dt);
    // stuck arrows
    for (let i = this.stuck.length - 1; i >= 0; i--) {
      const s = this.stuck[i];
      s.t -= dt;
      if (s.obj) s.mesh.position.copy(s.obj.localToWorld(s.local.clone()));
      if (s.t <= 0 || (s.obj && !s.obj.parent)) { G.scene.remove(s.mesh); this.stuck.splice(i, 1); }
    }
  }

  updateArrows(dt) {
    const G = this.G;
    const prev = new THREE.Vector3(), closest = new THREE.Vector3();
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.life -= dt;
      prev.copy(a.pos);
      a.vel.y -= 11 * dt;
      a.pos.addScaledVector(a.vel, dt);
      a.mesh.position.copy(a.pos);
      a.mesh.lookAt(_v.copy(a.pos).sub(a.vel));
      if (a.el === 1) G.particles.add.emit({ x: a.pos.x, y: a.pos.y, z: a.pos.z, vy: 1, color: [1, 0.7, 0.2], color2: [1, 0.2, 0], size: 0.6, size1: 0.1, life: 0.35 });
      else if (a.el === 2) G.particles.add.emit({ x: a.pos.x + rand(-0.2, 0.2), y: a.pos.y + rand(-0.2, 0.2), z: a.pos.z + rand(-0.2, 0.2), color: [0.6, 0.95, 1], size: 0.35, life: 0.2 });
      else if (Math.random() < 0.5) G.particles.add.emit({ x: a.pos.x, y: a.pos.y, z: a.pos.z, color: [0.9, 0.9, 1], size: 0.2, life: 0.25, alpha: 0.5 });
      let done = false;
      // oil clouds: fire passing through detonates
      if (a.el === 1) for (const c of this.clouds) if (segPointDist2(prev, a.pos, c.pos, closest) < c.radius * c.radius) { c.ignite = true; }
      // enemies
      for (const e of this.enemies) {
        if (e.dead || a.hitSet.has(e)) continue;
        if (segPointDist2(prev, a.pos, e.pos, closest) < (e.radius + 0.25) ** 2) {
          this.hitEnemy(e, a.dmg, a.el, prev);
          a.hitSet.add(e);
          if (!G.save.questDone.includes('ash')) { done = true; break; }
        }
      }
      // barrels
      if (!done) for (const isl of G.islands.near(a.pos, 20)) {
        for (const b of isl.barrels) {
          if (!b.alive) continue;
          const bp = _w.set(isl.pos.x + b.x, isl.pos.y + b.y + 0.6, isl.pos.z + b.z);
          if (segPointDist2(prev, a.pos, bp, closest) < 0.8) {
            if (a.el === 1) this.detonateBarrel(b); else this.burstBarrel(b);
            done = true; break;
          }
        }
        if (done) break;
      }
      // terrain & ship
      if (!done) {
        const seg = a.pos.clone().sub(prev);
        const len = seg.length();
        if (len > 0) {
          const meshes = G.islands.meshesNear(a.pos, 10).concat(G.ship.raycastMeshes);
          if (G.storm && G.storm.active) meshes.push(...G.storm.raycastMeshes());
          this.ray.set(prev, seg.divideScalar(len)); this.ray.far = len;
          const hit = this.ray.intersectObjects(meshes, false)[0];
          if (hit) {
            done = true;
            a.pos.copy(hit.point);
            if (a.el === 1) {
              const n = this.igniteAt(hit.point, 2.8);
              G.particles.burst(hit.point, 16, { color: [1, 0.6, 0.2], speed: 4, size: 0.6, life: 0.5 });
              if (n && !G.save.flags.fire) { G.save.flags.fire = true; G.ui.toast('🔥 Fire spreads through grass & trees — with the wind, slower in rain', 3.5); }
            } else if (a.el === 2) {
              G.particles.burst(hit.point, 14, { color: [0.6, 0.9, 1], speed: 6, size: 0.4, life: 0.35 });
            } else G.particles.burst(hit.point, 6, { additive: false, color: [0.6, 0.55, 0.5], speed: 2, size: 0.4, life: 0.4 });
            G.audio.play('thud', 0.3);
            const obj = hit.object;
            this.stuck.push({ mesh: a.mesh, obj, local: obj.worldToLocal(hit.point.clone()), t: 8 });
            a.mesh.position.copy(hit.point);
            this.arrows.splice(i, 1);
            continue;
          }
        }
      }
      if (done || a.life <= 0 || a.pos.y < SEA_Y - 10) {
        G.scene.remove(a.mesh);
        this.arrows.splice(i, 1);
      }
    }
  }

  updateEnemies(dt) {
    const G = this.G;
    const p = G.player;
    const target = p.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
    const rain = G.world.isRaining();
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) {
        G.scene.remove(e.mesh); G.scene.remove(e.bar);
        this.enemies.splice(i, 1);
        continue;
      }
      const dist = e.pos.distanceTo(target);
      // despawn very far enemies (they respawn when you return)
      if (dist > 320 && e.island && !e.storm) {
        e.island.enemiesSpawned = false;
        G.scene.remove(e.mesh); G.scene.remove(e.bar);
        this.enemies.splice(i, 1);
        continue;
      }
      e.phase += dt;
      e.stun = Math.max(0, e.stun - dt);
      e.oiled = Math.max(0, e.oiled - dt);
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      if (e.burn > 0) {
        e.burn -= dt * (rain ? 2 : 1);
        e.hp -= 7 * dt;
        if (Math.random() < 0.6) G.particles.fire(e.pos.clone().add(new THREE.Vector3(0, e.type === 'husk' ? 0.8 : -0.3, 0)), 0.9);
        if (e.hp <= 0) { this.kill(e); continue; }
        for (const c of this.clouds) if (e.pos.distanceTo(c.pos) < c.radius) c.ignite = true;
        if (e.type === 'husk' && e.island && Math.random() < dt * 2) this.igniteAt(e.pos, 1.5);
      }
      const slow = (e.oiled > 0 ? 0.5 : 1) * (e.stun > 0 ? 0 : 1);
      if (e.type === 'wisp') this.updateWisp(e, dt, target, dist, slow);
      else this.updateHusk(e, dt, target, dist, slow);
      // hp bar
      const show = e.hp < e.maxHp && dist < 60;
      e.bar.visible = show;
      if (show) {
        e.bar.position.copy(e.pos).add(new THREE.Vector3(0, e.type === 'wisp' ? 1.6 : 2.4, 0));
        e.bar.quaternion.copy(G.camera.quaternion);
        e.bar.userData.fg.scale.x = Math.max(0.001, e.hp / e.maxHp);
      }
      const s = 1 + e.hitFlash * 2;
      if (e.type === 'wisp') e.mesh.userData.core.scale.setScalar(s);
    }
  }

  updateWisp(e, dt, target, dist, slow) {
    const G = this.G;
    const u = e.mesh.userData;
    u.shell.rotation.y += dt * 0.8; u.shell.rotation.x += dt * 0.5;
    u.spikes.rotation.y -= dt * 1.2;
    const aggro = dist < (e.storm ? 90 : 48);
    let desired;
    if (aggro) {
      e.orbit += dt * 0.6;
      const r = 13;
      desired = target.clone().add(new THREE.Vector3(Math.cos(e.orbit) * r, 4 + Math.sin(e.phase * 0.7) * 2, Math.sin(e.orbit) * r));
      e.cd -= dt * slow;
      if (e.cd <= 0 && dist < 50) {
        e.cd = rand(2.0, 3.4);
        const mesh = new THREE.Mesh(this.boltGeo, boltMat);
        mesh.position.copy(e.pos);
        G.scene.add(mesh);
        const lead = G.player.vel.clone().multiplyScalar(dist / 24 * 0.5);
        const v = target.clone().add(lead).sub(e.pos).normalize().multiplyScalar(24);
        this.bolts.push({ mesh, pos: mesh.position, vel: v, life: 3.5, dmg: 9 * e.dmgMul });
        G.audio.play('zap', 0.25);
      }
    } else {
      desired = e.home.clone().add(new THREE.Vector3(Math.sin(e.phase * 0.3) * 5, Math.sin(e.phase * 0.5) * 2, Math.cos(e.phase * 0.3) * 5));
      if (e.island) desired.y += e.island.pos.y - (e.island._spawnY ?? e.island.pos.y);
    }
    const to = desired.sub(e.pos);
    e.vel.addScaledVector(to, dt * 1.2 * slow);
    e.vel.multiplyScalar(Math.exp(-1.5 * dt));
    if (e.vel.length() > 12) e.vel.setLength(12);
    e.pos.addScaledVector(e.vel, dt);
    // stay out of the rock
    const g = G.physics.groundAt(e.pos.x, e.pos.y + 1, e.pos.z, 0.5);
    if (g && e.pos.y < g.h + 1.5) e.pos.y = g.h + 1.5;
    if (e.pos.y < SEA_Y + 5 && !e.storm) e.pos.y = SEA_Y + 5;
    if (Math.random() < 0.4) G.particles.add.emit({ x: e.pos.x + rand(-0.4, 0.4), y: e.pos.y + rand(-0.4, 0.4), z: e.pos.z + rand(-0.4, 0.4), vy: -0.5, color: [0.7, 0.3, 1], color2: [0.2, 0.05, 0.4], size: 0.6, size1: 0.1, life: 0.6 });
  }

  updateHusk(e, dt, target, dist, slow) {
    const G = this.G;
    const isl = e.island;
    const u = e.mesh.userData;
    if (e.airborne) {
      e.vel.y -= 26 * dt;
      e.pos.addScaledVector(e.vel, dt);
      const g = G.physics.groundAt(e.pos.x, e.pos.y + 0.5, e.pos.z, 0.3);
      if (g && e.pos.y <= g.h && e.vel.y <= 0) { e.pos.y = g.h; e.airborne = false; e.vel.set(0, 0, 0); }
      if (e.pos.y < SEA_Y) {
        G.ui.popText(e.pos.clone().setY(SEA_Y + 20), 'Into the Storm!', '#d0a0ff');
        this.kill(e);
      }
      e.mesh.rotation.x += dt * 3;
      return;
    }
    e.mesh.rotation.x = 0;
    if (!isl || !isl.group.parent) { e.dead = true; return; }
    const sameIsland = G.player.platform === isl || (dist < 22 && Math.abs(target.y - e.pos.y) < 6);
    let moveDir = new THREE.Vector3();
    let speed = 0;
    if (sameIsland && dist < 40) {
      moveDir.subVectors(target, e.pos).setY(0);
      const d = moveDir.length();
      moveDir.normalize();
      if (e.state === 'windup') {
        e.windup -= dt * (slow > 0 ? 1 : 0);
        u.head.position.z = -1.1 - (0.5 - Math.max(0, e.windup)) * 0.5;
        if (e.windup <= 0) {
          e.state = 'idle';
          e.cd = 1.4;
          u.head.position.z = -1.1;
          e.vel.addScaledVector(moveDir, 14);
          if (dist < 3.4) G.player.damage(15 * e.dmgMul, e.pos);
        }
      } else if (d < 2.6 && e.cd <= 0 && slow > 0) {
        e.state = 'windup'; e.windup = 0.5;
      } else speed = 5.2;
      e.cd -= dt;
    } else {
      // wander
      const wt = e.phase * 0.2;
      moveDir.set(Math.cos(wt * 1.3 + e.orbit), 0, Math.sin(wt + e.orbit));
      speed = 1.5;
    }
    speed *= slow;
    if (e.burn > 0) { speed = Math.max(speed, 4); moveDir.set(Math.cos(e.phase * 3), 0, Math.sin(e.phase * 2.3)); }
    e.vel.x = e.vel.x * Math.exp(-4 * dt) + moveDir.x * speed * (1 - Math.exp(-4 * dt)) * 4;
    e.vel.z = e.vel.z * Math.exp(-4 * dt) + moveDir.z * speed * (1 - Math.exp(-4 * dt)) * 4;
    const nx = e.pos.x + e.vel.x * dt, nz = e.pos.z + e.vel.z * dt;
    const lu = isl.uAt(nx - isl.pos.x, nz - isl.pos.z);
    if (lu < 0.88 || e.vel.length() > 9) { e.pos.x = nx; e.pos.z = nz; }
    const top = isl.worldTop(e.pos.x, e.pos.z);
    if (top === null) { e.airborne = true; }
    else e.pos.y = top;
    if (moveDir.lengthSq() > 0.01 && speed > 0) e.mesh.rotation.y = Math.atan2(-moveDir.x, -moveDir.z);
    const ph = e.phase * 10 * Math.min(1, speed / 4);
    u.legs.forEach((l, k) => { l.rotation.x = Math.sin(ph + (k % 2 ? Math.PI : 0) + (k < 2 ? 0 : Math.PI / 2)) * 0.6; });
    u.body.position.y = 1.0 + Math.abs(Math.sin(ph)) * 0.08;
    // ground fire / oil status
    for (const c of this.clouds) if (e.pos.distanceTo(c.pos) < c.radius + 1) e.oiled = 3;
  }

  updateBolts(dt) {
    const G = this.G;
    const tp = G.player.pos.clone().add(new THREE.Vector3(0, 1.1, 0));
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      b.pos.addScaledVector(b.vel, dt);
      if (Math.random() < 0.6) G.particles.add.emit({ x: b.pos.x, y: b.pos.y, z: b.pos.z, color: [0.8, 0.5, 1], size: 0.5, size1: 0.1, life: 0.3 });
      let gone = b.life <= 0;
      if (!gone && b.pos.distanceTo(tp) < 1.1) { G.player.damage(b.dmg, b.pos); gone = true; }
      if (!gone && G.player.mode === 'helm' && b.pos.distanceTo(G.ship.pos) < 8) { G.ship.damage(b.dmg * 0.6); gone = true; }
      if (!gone) {
        const g = G.physics.groundAt(b.pos.x, b.pos.y + 0.2, b.pos.z, 0);
        if (g && b.pos.y < g.h + 0.1) gone = true;
      }
      if (gone) {
        G.particles.burst(b.pos, 10, { color: [0.8, 0.5, 1], speed: 4, size: 0.4, life: 0.3 });
        G.scene.remove(b.mesh);
        this.bolts.splice(i, 1);
      }
    }
  }

  updateClouds(dt) {
    const G = this.G;
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.life -= dt;
      if (c.island) c.pos.copy(c.island.pos).add(c.local);
      if (Math.random() < 0.7) G.particles.norm.emit({
        x: c.pos.x + rand(-c.radius, c.radius) * 0.7, y: c.pos.y + rand(-1, 1.5), z: c.pos.z + rand(-c.radius, c.radius) * 0.7,
        vx: rand(-0.3, 0.3), vy: rand(-0.1, 0.3), vz: rand(-0.3, 0.3), color: [0.12, 0.1, 0.07], color2: [0.2, 0.16, 0.1], size: 2.5, size1: 4, alpha: 0.55, life: 2, drag: 1,
      });
      if (c.ignite) {
        this.clouds.splice(i, 1);
        this.explode(c.pos.clone(), c.radius + 4, 95);
        continue;
      }
      if (c.life <= 0) this.clouds.splice(i, 1);
    }
  }

  clearAll() {
    const G = this.G;
    for (const e of this.enemies) { G.scene.remove(e.mesh); G.scene.remove(e.bar); }
    for (const a of this.arrows) G.scene.remove(a.mesh);
    for (const b of this.bolts) G.scene.remove(b.mesh);
    for (const s of this.stuck) G.scene.remove(s.mesh);
    this.enemies = []; this.arrows = []; this.bolts = []; this.stuck = []; this.clouds = [];
    for (const isl of G.islands.list) isl.enemiesSpawned = false;
  }
}
