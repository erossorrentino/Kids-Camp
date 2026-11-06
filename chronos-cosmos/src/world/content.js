import * as THREE from 'three';
import { VLight } from '../core/lights.js';
import { G } from '../core/G.js';
import { mulberry32 } from '../core/noise.js';
import { Spawner } from '../actors/enemies.js';
import { POIS, poi, VOLCANO, ISLAND, LAKE } from './worldmap.js';
import { initMaterials, MATS, Builder, Site, house, tent, campfire, well, stall, fence, lamppost, barrelsCrates, banner, rubble, pillar } from './structures.js';

const H = (x, z) => G.terrain.heightAt(x, z);
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

export const content = {
  sites: [],
  anims: [], // per-frame animated things
  fires: [], // {x,y,z,size,light}
  chimneys: [],
  beacons: [],
  chests: [],
  pillars: [],
  rifts: [],
  campfires: [],
  update: null,
};

function addFireFx(e, epochs) {
  const light = new VLight(0xff9a4a, 0, 14, 2);
  light.position.set(e.x, e.y + 0.8, e.z);
  G.scene.add(light);
  content.fires.push({ ...e, light, epochs });
}

function finishSite(site, built, epochs) {
  site.set(epochs, built);
  for (const ex of built.extras) {
    if (ex.type === 'fire') addFireFx(ex, epochs);
    else if (ex.type === 'chimney') content.chimneys.push({ ...ex, epochs });
    else if (ex.type === 'beacon') content.beacons.push({ ...ex, epochs });
    else if (ex.type === 'lamp') content.chimneys.push({ ...ex, lamp: true, epochs });
  }
  return built;
}

// ---------------------------------------------------------------------------
// Hearthmere
// ---------------------------------------------------------------------------
function buildHearthmere() {
  const p = poi('hearthmere');
  const cx = p.x, cz = p.z;
  const y0 = H(cx, cz);
  const site = new Site('Hearthmere', cx, cz);
  const rng0 = () => mulberry32(77);
  const roadAngles = [Math.atan2(38, -34), Math.atan2(-60, -80), Math.atan2(90, 50)];
  const spots = [];
  const r1 = rng0();
  const ring = [[26, 9], [40, 12]];
  for (const [rad, n] of ring) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (rad === 40 ? 0.13 : 0) + (r1() - 0.5) * 0.12;
      let bad = false;
      for (const ra of roadAngles) {
        let d = Math.abs(a - ra) % (Math.PI * 2);
        if (d > Math.PI) d = Math.PI * 2 - d;
        if (d < 0.32) bad = true;
      }
      if (bad) continue;
      const hx = cx + Math.sin(a) * rad, hz = cz + Math.cos(a) * rad;
      spots.push({ x: hx, z: hz, ry: Math.atan2(cx - hx, cz - hz), seed: 100 + i + rad, a });
    }
  }
  // reserve the northernmost spot for Lyra's observatory and one for the tavern
  spots.sort((a, b) => a.z - b.z);
  const obs = spots.shift();
  const tav = spots.find((s) => Math.hypot(s.x - cx, s.z - cz) < 30 && s.x > cx);
  const homes = spots.filter((s) => s !== tav);
  content.hearthmere = { cx, cz, y0, obs, tav, homes };
  const towerX = obs.x, towerZ = obs.z - 4;

  // ---- Age of Bloom
  {
    const b = new Builder('hearthmere-bloom');
    const rng = mulberry32(5);
    for (const s of homes) house(b, s.x, H(s.x, s.z), s.z, s.ry, { seed: s.seed, roof: rng() < 0.35 ? MATS.slate : MATS.roof, wall: rng() < 0.2 ? MATS.plasterBlue : MATS.plaster });
    if (tav) {
      house(b, tav.x, H(tav.x, tav.z), tav.z, tav.ry, { seed: 9, w: 11, d: 7.5, h: 5, roof: MATS.slate, wall: MATS.brick });
      const c = Math.cos(tav.ry), s2 = Math.sin(tav.ry);
      banner(b, tav.x + s2 * 4.5 + c * 3, H(tav.x, tav.z), tav.z + c * 4.5 - s2 * 3, tav.ry, MATS.cloth, 4.5);
    }
    // observatory tower
    const ty = H(towerX, towerZ);
    b.cyl(MATS.stone, 3.4, 3.8, 14, towerX, ty - 0.5, towerZ, 16, { tag: 'stone' });
    b.cyl(MATS.stone, 3.9, 3.9, 0.6, towerX, ty + 13.5, towerZ, 16);
    b.sphere(MATS.bronze, 3.3, towerX, ty + 14, towerZ, { half: true, seg: 20 });
    b.cyl(MATS.bronze, 0.35, 0.5, 4, towerX + 1.5, ty + 15.5, towerZ, 10, { rz: -0.9, collide: false });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      b.box(MATS.window, 0.7, 1.2, 0.2, towerX + Math.sin(a) * 3.55, ty + 4 + i * 2.5, towerZ + Math.cos(a) * 3.55, a, { collide: false });
    }
    b.box(MATS.woodDark, 1.2, 2.2, 0.3, towerX + Math.sin(obs.ry) * 3.6, ty, towerZ + Math.cos(obs.ry) * 3.6, obs.ry, { collide: false });
    // plaza
    const plaza = new THREE.CircleGeometry(17, 40);
    plaza.rotateX(-Math.PI / 2);
    const uv = plaza.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 6);
    b.geo(MATS.cobble, plaza, cx, y0 + 0.06, cz);
    well(b, cx, y0, cz);
    stall(b, cx + 8, y0, cz - 6, -0.9, MATS.cloth);
    stall(b, cx - 9, y0, cz - 4, 0.9, MATS.clothBlue);
    stall(b, cx + 3, y0, cz + 10, Math.PI + 0.3, MATS.clothGreen);
    campfire(b, cx - 6, y0, cz + 7);
    for (const a of [0.5, 1.6, 2.7, 3.8, 4.9, 6.0]) lamppost(b, cx + Math.sin(a) * 15, H(cx + Math.sin(a) * 15, cz + Math.cos(a) * 15), cz + Math.cos(a) * 15);
    barrelsCrates(b, cx + 11, y0, cz + 3, rng, 4);
    barrelsCrates(b, cx - 12, y0, cz - 9, rng, 3);
    // smithy (open forge)
    const sx = cx - 20, sz = cz + 16, sy = H(sx, sz);
    for (const [px, pz] of [[-2.5, -2], [2.5, -2], [-2.5, 2], [2.5, 2]]) b.box(MATS.woodDark, 0.3, 3.2, 0.3, sx + px, sy, sz + pz, 0, { collide: false });
    b.roof(MATS.slate, 6, 5, 1.4, sx, sy + 3.2, sz, 0, 0.4);
    b.box(MATS.brick, 1.8, 1.0, 1.4, sx - 1, sy, sz - 0.5, 0);
    b.box(MATS.lava, 1.2, 0.08, 0.8, sx - 1, sy + 1.0, sz - 0.5, 0, { collide: false });
    b.box(MATS.iron, 0.8, 0.5, 0.35, sx + 1.2, sy + 0.6, sz + 0.5, 0.3);
    b.box(MATS.stone, 0.5, 0.6, 0.5, sx + 1.2, sy, sz + 0.5, 0.3);
    b.extras.push({ type: 'fire', x: sx - 1, y: sy + 1.0, z: sz - 0.5, size: 0.5 });
    // fields to the south-west
    for (let f = 0; f < 3; f++) {
      const fx = cx - 50 + f * 16, fz = cz + 52 + (f % 2) * 6;
      const fy = H(fx, fz);
      for (let r = 0; r < 7; r++) {
        const g = new THREE.BoxGeometry(12, 0.5, 0.6);
        b.geo(MATS.hay, g, fx, fy + 0.2 + Math.sin(r) * 0.05, fz - 6 + r * 1.8, 0, 0.1, 0);
      }
      fence(b, fx - 7, fz - 8, fx + 7, fz - 8, H);
      fence(b, fx - 7, fz + 6, fx + 7, fz + 6, H);
    }
    // hay bales
    for (let i = 0; i < 5; i++) b.cyl(MATS.hay, 0.7, 0.7, 1.1, cx - 30 + rng() * 20, H(cx - 30, cz + 40) - 0.1, cz + 38 + rng() * 8, 12, { rz: Math.PI / 2, ry: rng() * 3 });
    // windmill base
    const wx = cx + 62, wz = cz - 28, wy = H(wx, wz);
    b.cyl(MATS.plaster, 2.2, 3.2, 11, wx, wy - 0.5, wz, 12, { tag: 'stone' });
    b.cone(MATS.thatch, 3.0, 3.2, wx, wy + 10.5, wz, 12);
    b.box(MATS.woodDark, 1.0, 2.0, 0.2, wx, wy, wz + 3.0, 0, { collide: false });
    const built = b.build();
    finishSite(site, built, [0]);
    // windmill sails (animated)
    const sails = new THREE.Group();
    sails.position.set(wx, wy + 9, wz + 3.0);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 8, 0.15), MATS.woodDark);
      arm.position.y = 4;
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 6.5), MATS.clothCream);
      sail.position.set(1.0, 4.4, 0.05);
      const g = new THREE.Group();
      g.add(arm, sail);
      g.rotation.z = (i / 4) * Math.PI * 2;
      sails.add(g);
    }
    sails.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    built.group.add(sails);
    content.anims.push((dt) => { if (built.group.visible) sails.rotation.z += dt * 0.6; });
  }
  // ---- Age of Ash
  {
    const b = new Builder('hearthmere-ash');
    const rng = mulberry32(6);
    for (const s of homes) house(b, s.x, H(s.x, s.z), s.z, s.ry, { seed: s.seed, state: 'ruined' });
    if (tav) house(b, tav.x, H(tav.x, tav.z), tav.z, tav.ry, { seed: 9, w: 11, d: 7.5, h: 5, state: 'ruined' });
    const ty = H(towerX, towerZ);
    b.cyl(MATS.charred, 3.4, 3.8, 6.5, towerX, ty - 0.5, towerZ, 16, { tag: 'stone' });
    rubble(b, towerX + 4, ty, towerZ + 3, rng, 10, MATS.charred);
    // survivor camp in the plaza
    campfire(b, cx, y0, cz, { size: 1.6 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const tx = cx + Math.sin(a) * 9, tz = cz + Math.cos(a) * 9;
      tent(b, tx, H(tx, tz), tz, a + Math.PI / 2, i % 3 === 0 ? MATS.clothCovenant : MATS.clothCream);
    }
    // palisade ring with gaps
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      if (i % 7 === 3) continue;
      const px = cx + Math.sin(a) * 17, pz = cz + Math.cos(a) * 17;
      for (let k = 0; k < 4; k++) {
        const ox = Math.cos(a) * (k - 1.5) * 0.45, oz = -Math.sin(a) * (k - 1.5) * 0.45;
        b.cyl(MATS.woodDark, 0.2, 0.22, 3.4 + rng() * 0.6, px + ox, H(px, pz) - 0.3, pz + oz, 6, { collide: false });
        b.cone(MATS.woodDark, 0.2, 0.5, px + ox, H(px, pz) + 3.2, pz + oz, 6);
      }
      b.collider({ type: 'box', x: px, y: H(px, pz) + 1.6, z: pz, hx: 1.0, hy: 1.8, hz: 0.3, ry: a + Math.PI / 2, climbable: true, tag: 'wood' });
    }
    banner(b, cx + 3, y0, cz - 3, 0.5, MATS.clothCovenant, 5);
    barrelsCrates(b, cx + 6, y0, cz - 6, rng, 5);
    barrelsCrates(b, cx - 7, y0, cz + 5, rng, 4);
    const built = b.build();
    finishSite(site, built, [1]);
  }
  // ---- Age of Stars
  {
    const b = new Builder('hearthmere-stars');
    const rng = mulberry32(7);
    for (const s of homes) house(b, s.x, H(s.x, s.z), s.z, s.ry, { seed: s.seed, state: 'ancient' });
    const ty = H(towerX, towerZ);
    b.cyl(MATS.stone, 3.4, 3.8, 2.5, towerX, ty - 0.5, towerZ, 16, { tag: 'stone' });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.geo(i % 2 ? MATS.crystal : MATS.crystalPink, new THREE.OctahedronGeometry(0.8 + rng() * 0.6, 0), towerX + Math.sin(a) * 2, ty + 3 + rng() * 2, towerZ + Math.cos(a) * 2, rng(), rng(), 0, 1);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.6;
      const tx = cx + Math.sin(a) * 8, tz = cz + Math.cos(a) * 8;
      tent(b, tx, H(tx, tz), tz, a, MATS.clothWhite, 1.1);
    }
    campfire(b, cx, y0, cz, { seats: true });
    for (const a of [0.2, 1.8, 3.4, 5.0]) lamppost(b, cx + Math.sin(a) * 13, H(cx + Math.sin(a) * 13, cz + Math.cos(a) * 13), cz + Math.cos(a) * 13);
    const built = b.build();
    finishSite(site, built, [2]);
  }
  site.register();
  content.sites.push(site);
  return site;
}

// ---------------------------------------------------------------------------
// Kestrel's Rest / Iron Covenant fort
// ---------------------------------------------------------------------------
function buildKestrel() {
  const p = poi('kestrel');
  const cx = p.x, cz = p.z, y0 = H(cx, cz);
  const site = new Site("Kestrel's Rest", cx, cz);
  const spots = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    const rad = 18 + (i % 2) * 6;
    const hx = cx + Math.sin(a) * rad, hz = cz + Math.cos(a) * rad;
    spots.push({ x: hx, z: hz, ry: Math.atan2(cx - hx, cz - hz), seed: 300 + i });
  }
  content.kestrel = { cx, cz, y0 };
  {
    const b = new Builder('kestrel-bloom');
    const rng = mulberry32(31);
    for (const s of spots) house(b, s.x, H(s.x, s.z), s.z, s.ry, { seed: s.seed, roof: MATS.thatch, wall: rng() < 0.5 ? MATS.wood : MATS.plaster, w: 6, d: 5 });
    campfire(b, cx, y0, cz);
    // lumber piles
    for (let i = 0; i < 3; i++) for (let k = 0; k < 4; k++) b.cyl(MATS.wood, 0.3, 0.3, 4, cx + 8 + i * 0.65, y0 + 0.3 + (k % 2) * 0.5, cz - 8 + k * 0.6, 8, { rz: Math.PI / 2, collide: false });
    b.collider({ type: 'box', x: cx + 8.6, y: y0 + 0.6, z: cz - 7, hx: 1.2, hy: 0.6, hz: 2, ry: 0 });
    // drying racks
    for (let i = 0; i < 2; i++) {
      b.box(MATS.woodDark, 0.12, 2.2, 0.12, cx - 9 + i * 3, y0, cz + 6, 0, { collide: false });
      b.box(MATS.woodDark, 0.12, 2.2, 0.12, cx - 9 + i * 3, y0, cz + 8, 0, { collide: false });
      b.box(MATS.woodDark, 0.1, 0.1, 2.2, cx - 9 + i * 3, y0 + 2.1, cz + 7, 0, { collide: false });
      b.box(MATS.hay, 0.05, 1.0, 1.6, cx - 9 + i * 3, y0 + 1.1, cz + 7, 0, { collide: false });
    }
    const built = b.build();
    finishSite(site, built, [0]);
  }
  {
    // Iron Covenant fort
    const b = new Builder('kestrel-ash');
    const rng = mulberry32(32);
    const S = 22;
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i < 22; i++) {
        const t = (i + 0.5) / 22 - 0.5;
        let px, pz;
        if (side === 0) { px = cx + t * S * 2; pz = cz - S; }
        else if (side === 1) { px = cx + S; pz = cz + t * S * 2; }
        else if (side === 2) { px = cx - t * S * 2; pz = cz + S; }
        else { px = cx - S; pz = cz - t * S * 2; }
        if (side === 3 && Math.abs(t) < 0.08) continue; // gate facing west
        const h = 4.2 + rng() * 0.5;
        b.cyl(MATS.woodDark, 0.28, 0.3, h, px, H(px, pz) - 0.5, pz, 6, { collide: false });
        b.cone(MATS.woodDark, 0.28, 0.6, px, H(px, pz) + h - 0.5, pz, 6);
      }
      const mx = side === 1 ? cx + S : side === 3 ? cx - S : cx;
      const mz = side === 0 ? cz - S : side === 2 ? cz + S : cz;
      if (side === 3) {
        for (const off of [-0.55, 0.55]) b.collider({ type: 'box', x: mx, y: y0 + 2, z: cz + off * S, hx: 0.4, hy: 2.6, hz: S * 0.42, ry: 0, climbable: true, tag: 'wood' });
      } else b.collider({ type: 'box', x: mx, y: y0 + 2, z: mz, hx: side % 2 ? 0.4 : S, hy: 2.6, hz: side % 2 ? S : 0.4, ry: 0, climbable: true, tag: 'wood' });
    }
    // watchtowers
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const tx = cx + sx * S, tz = cz + sz * S, ty = H(tx, tz);
      for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(MATS.woodDark, 0.3, 8, 0.3, tx + ox * 1.2, ty - 0.5, tz + oz * 1.2, 0, { collide: false });
      b.box(MATS.wood, 3.2, 0.3, 3.2, tx, ty + 7, tz, 0);
      b.roof(MATS.woodDark, 3.4, 3.4, 1.2, tx, ty + 9, tz, 0, 0.2);
      b.collider({ type: 'box', x: tx, y: ty + 3.5, z: tz, hx: 1.3, hy: 3.6, hz: 1.3, ry: 0, climbable: true, tag: 'wood' });
    }
    for (let i = 0; i < 6; i++) {
      const tx = cx - 12 + (i % 3) * 9, tz = cz - 10 + Math.floor(i / 3) * 20;
      tent(b, tx, H(tx, tz), tz, 0, MATS.clothCovenant, 1.2);
    }
    campfire(b, cx, y0, cz, { size: 1.4 });
    banner(b, cx - S - 1, H(cx - S, cz - 3), cz - 3, -Math.PI / 2, MATS.clothCovenant, 6);
    banner(b, cx - S - 1, H(cx - S, cz + 3), cz + 3, -Math.PI / 2, MATS.clothCovenant, 6);
    barrelsCrates(b, cx + 10, y0, cz + 2, rng, 6);
    // weapon rack
    for (let i = 0; i < 4; i++) b.box(MATS.iron, 0.06, 1.6, 0.06, cx + 6 + i * 0.4, y0 + 0.2, cz + 6, 0, { rz: 0.15, collide: false });
    const built = b.build();
    finishSite(site, built, [1]);
  }
  {
    const b = new Builder('kestrel-stars');
    const rng = mulberry32(33);
    for (const s of spots) house(b, s.x, H(s.x, s.z), s.z, s.ry, { seed: s.seed, state: 'ancient', w: 6, d: 5 });
    campfire(b, cx, y0, cz);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      tent(b, cx + Math.sin(a) * 7, H(cx + Math.sin(a) * 7, cz + Math.cos(a) * 7), cz + Math.cos(a) * 7, a, MATS.clothWhite);
    }
    for (let i = 0; i < 5; i++) b.geo(MATS.crystal, new THREE.OctahedronGeometry(0.6 + rng(), 0), cx + (rng() - 0.5) * 30, y0 + 2 + rng() * 3, cz + (rng() - 0.5) * 30, rng(), rng(), 0);
    const built = b.build();
    finishSite(site, built, [2]);
  }
  site.register();
  content.sites.push(site);
}

// ---------------------------------------------------------------------------
// The Chrono Spire
// ---------------------------------------------------------------------------
function buildSpire() {
  const x = ISLAND.x, z = ISLAND.z, y = 15;
  content.spire = { x, z, y };
  const site = new Site('Spire', x, z);
  const base = (b, mat, trim) => {
    b.cyl(mat, 20, 21, 1.2, x, y - 1, z, 48, { tag: 'stone' });
    b.cyl(trim, 20.4, 20.4, 0.3, x, y + 0.15, z, 48, { collide: false });
    // stairs down to the shore on four sides
    for (let a = 0; a < 4; a++) {
      const ang = (a / 4) * Math.PI * 2 + Math.PI / 4;
      for (let s = 0; s < 6; s++) {
        const r = 21 + s * 0.9;
        const sy = y - 1 - s * 0.7;
        b.box(mat, 6, 0.7, 1.0, x + Math.sin(ang) * r, sy - 0.7 + 0.5, z + Math.cos(ang) * r, ang);
      }
    }
    // ring of columns
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      if (i % 4 === 2) continue;
      b.cyl(mat, 0.6, 0.7, 7, x + Math.sin(a) * 18, y, z + Math.cos(a) * 18, 12, { tag: 'stone' });
      b.box(trim, 1.6, 0.5, 1.6, x + Math.sin(a) * 18, y + 7, z + Math.cos(a) * 18, a);
    }
  };
  {
    const b = new Builder('spire-bloom');
    base(b, MATS.marble, MATS.gold);
    b.cyl(MATS.marble, 7.5, 8.5, 8, x, y, z, 24, { tag: 'stone' });
    b.cyl(MATS.gold, 7.7, 7.7, 0.6, x, y + 8, z, 24, { collide: false });
    b.cyl(MATS.marble, 4.0, 7.0, 84, x, y + 8.5, z, 24, { tag: 'stone' });
    for (let i = 0; i < 8; i++) b.cyl(MATS.gold, 6.9 - i * 0.36, 6.9 - i * 0.36, 0.6, x, y + 16 + i * 10, z, 24, { collide: false });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.box(MATS.runeGold, 0.18, 60, 0.5, x + Math.sin(a) * 5.75, y + 14, z + Math.cos(a) * 5.75, a, { collide: false, rz: 0 });
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      b.box(MATS.marble, 2.2, 30, 2.2, x + Math.sin(a) * 7.5, y + 8, z + Math.cos(a) * 7.5, a, { tag: 'stone' });
      b.cone(MATS.gold, 1.6, 5, x + Math.sin(a) * 7.5, y + 38, z + Math.cos(a) * 7.5, 4);
    }
    b.cone(MATS.gold, 4.2, 14, x, y + 92.5, z, 24);
    // archway
    b.box(MATS.gold, 3.6, 5.5, 0.6, x, y, z + 8.3, 0, { collide: false });
    b.box(MATS.window, 2.6, 4.4, 0.65, x, y, z + 8.35, 0, { collide: false });
    const built = b.build();
    finishSite(site, built, [0]);
    // floating rings + heart
    const crown = new THREE.Group();
    crown.position.set(x, y + 118, z);
    const heart = new THREE.Mesh(new THREE.IcosahedronGeometry(3.6, 2), MATS.heart);
    crown.add(heart);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(8 + i * 3.5, 0.5, 8, 64), MATS.gold);
      ring.rotation.x = Math.PI / 2 + i * 0.5;
      ring.castShadow = true;
      crown.add(ring);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.glowTex, color: 0xffd890, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(40);
    crown.add(glow);
    const light = new VLight(0xffd890, 60, 160, 1.5);
    crown.add(light);
    built.group.add(crown);
    content.anims.push((dt, t) => {
      if (!built.group.visible) return;
      crown.children.forEach((c, i) => { if (c.geometry && c.geometry.type === 'TorusGeometry') { c.rotation.z += dt * (0.3 + i * 0.15) * (i % 2 ? -1 : 1); c.rotation.x += dt * 0.1 * (i - 1); } });
      heart.rotation.y += dt * 0.5;
      heart.scale.setScalar(1 + Math.sin(t * 2) * 0.05);
      crown.position.y = y + 118 + Math.sin(t * 0.6) * 0.8;
    });
  }
  {
    const b = new Builder('spire-ash');
    base(b, MATS.stoneDark, MATS.bronze);
    b.cyl(MATS.stoneDark, 7.5, 8.5, 8, x, y, z, 24, { tag: 'stone' });
    b.cyl(MATS.stoneDark, 5.0, 7.0, 52, x, y + 8.5, z, 24, { tag: 'stone' });
    // jagged broken top
    const rng = mulberry32(44);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const h = 2 + rng() * 7;
      b.box(MATS.stoneDark, 2.2, h, 1.2, x + Math.sin(a) * 4.5, y + 60.5, z + Math.cos(a) * 4.5, a, { tag: 'stone' });
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      b.box(MATS.lava, 0.25, 30 + rng() * 20, 0.4, x + Math.sin(a) * 6.1, y + 9, z + Math.cos(a) * 6.1, a, { collide: false });
    }
    rubble(b, x + 10, y, z + 6, rng, 14, MATS.stoneDark);
    rubble(b, x - 8, y, z - 9, rng, 10, MATS.stoneDark);
    b.box(MATS.bronze, 3.6, 5.5, 0.6, x, y, z + 8.3, 0, { collide: false });
    b.box(MATS.runeEmber, 2.6, 4.4, 0.65, x, y, z + 8.35, 0, { collide: false });
    const built = b.build();
    finishSite(site, built, [1]);
    const shards = new THREE.Group();
    shards.position.set(x, y + 70, z);
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + rng() * 1.5, 0), i % 3 ? MATS.stoneDark : MATS.lava);
      const a = (i / 9) * Math.PI * 2;
      m.position.set(Math.sin(a) * (8 + rng() * 4), rng() * 10, Math.cos(a) * (8 + rng() * 4));
      m.castShadow = true;
      shards.add(m);
    }
    const heart = new THREE.Mesh(new THREE.IcosahedronGeometry(2, 1), MATS.heartAsh);
    heart.position.y = 6;
    shards.add(heart);
    const light = new VLight(0xff4a1a, 25, 80, 1.6);
    light.position.y = 6;
    shards.add(light);
    built.group.add(shards);
    content.anims.push((dt, t) => {
      if (!built.group.visible) return;
      shards.rotation.y += dt * 0.08;
      shards.children.forEach((c, i) => { if (c.isMesh) c.rotation.x += dt * 0.2 * (i % 3); });
      heart.scale.setScalar(1 + Math.sin(t * 5) * 0.08 + Math.sin(t * 13) * 0.03);
    });
  }
  {
    const b = new Builder('spire-stars');
    base(b, MATS.marbleStar, MATS.crystal);
    b.cyl(MATS.marbleStar, 7.5, 8.5, 6, x, y, z, 24, { tag: 'stone' });
    const rng = mulberry32(45);
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2, r = 9 + rng() * 9;
      b.geo(i % 2 ? MATS.crystal : MATS.crystalPink, new THREE.OctahedronGeometry(0.8 + rng() * 1.4, 0), x + Math.sin(a) * r, y + 1 + rng(), z + Math.cos(a) * r, rng() * 0.5, rng() * 3, 0, 1);
    }
    b.box(MATS.crystal, 3.6, 5.5, 0.6, x, y, z + 8.3, 0, { collide: false });
    b.box(MATS.rune, 2.6, 4.4, 0.65, x, y, z + 8.35, 0, { collide: false });
    const built = b.build();
    finishSite(site, built, [2]);
    // floating tower segments + cosmic heart
    const segs = new THREE.Group();
    segs.position.set(x, y, z);
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(6.2 - i * 0.3, 6.6 - i * 0.3, 7, 24), MATS.marbleStar);
      m.position.y = 12 + i * 10.5;
      m.castShadow = true;
      m.userData.baseY = m.position.y;
      segs.add(m);
    }
    const vortex = new THREE.Mesh(new THREE.SphereGeometry(5, 32, 16), MATS.heartStar);
    vortex.position.y = 116;
    segs.add(vortex);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.glowTex, color: 0x8aa0ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(44);
    glow.position.y = 116;
    segs.add(glow);
    built.group.add(segs);
    content.anims.push((dt, t) => {
      if (!built.group.visible) return;
      segs.children.forEach((c, i) => {
        if (c.userData.baseY !== undefined) {
          c.position.y = c.userData.baseY + Math.sin(t * 0.5 + i) * 1.2;
          c.rotation.y += dt * 0.1 * (i % 2 ? 1 : -1);
          c.rotation.z = Math.sin(t * 0.3 + i) * 0.04;
        }
      });
      vortex.rotation.y += dt * 0.4;
    });
    // starlight bridge from the west shore to the island (Stars only)
    const bb = new Builder('starbridge');
    const sx = -165, sz = 60;
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const px = sx + (x - 20 - sx) * t, pz = sz + (z - sz) * t;
      const py = 1.2 + Math.sin(t * Math.PI) * 6;
      bb.box(i % 2 ? MATS.crystal : MATS.marbleStar, 3.2, 0.3, 3.4, px, py, pz, Math.atan2(x - sx, z - sz), { tag: 'stone' });
    }
    const bridge = bb.build();
    site.set([2], { group: bridge.group, cols: bridge.cols, extras: [], epochs: [2] });
    // keep both star variants visible together
    const v = site.variants[2];
    site.variants[2] = { group: new THREE.Group(), cols: [...v.cols, ...built.cols], epochs: [2] };
    site.variants[2].group.add(built.group, bridge.group);
    G.scene.add(site.variants[2].group);
    built.group.visible = true;
    bridge.group.visible = true;
  }
  site.register();
  content.sites.push(site);
}

// ---------------------------------------------------------------------------
// The Gilded Ring (colosseum)
// ---------------------------------------------------------------------------
function buildColosseum() {
  const p = poi('colosseum');
  const x = p.x, z = p.z, y = p.h;
  content.colosseum = { x, z, y };
  const site = new Site('Gilded Ring', x, z);
  const make = (style) => {
    const b = new Builder('colosseum-' + style);
    const rng = mulberry32(55);
    const mat = style === 'ash' ? MATS.charred : style === 'stars' ? MATS.stone : MATS.marble;
    const trim = style === 'ash' ? MATS.bronze : style === 'stars' ? MATS.crystal : MATS.gold;
    const floor = new THREE.CircleGeometry(31, 48);
    floor.rotateX(-Math.PI / 2);
    const uv = floor.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 9, uv.getY(i) * 9);
    b.geo(MATS.sand, floor, x, y + 0.05, z);
    const N = 28, R = 34;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const gate = i % 14 === 0;
      let h = 13;
      if (style === 'ash') h = 4 + rng() * 9;
      if (style === 'stars') h = 3 + rng() * 6;
      const px = x + Math.sin(a) * R, pz = z + Math.cos(a) * R;
      const seg = (2 * Math.PI * R) / N;
      if (gate) {
        b.box(mat, seg, 3, 3, px, y + 10, pz, a, { tag: 'stone' });
        continue;
      }
      b.box(mat, seg + 0.1, h, 3, px, y, pz, a, { tag: 'stone' });
      // arches (dark recesses)
      if (h > 6) b.box(MATS.stoneDark, seg * 0.55, 4, 0.2, x + Math.sin(a) * (R - 1.55), y + 1, z + Math.cos(a) * (R - 1.55), a, { collide: false });
      if (h > 10) b.box(MATS.stoneDark, seg * 0.45, 3, 0.2, x + Math.sin(a) * (R - 1.55), y + 7, z + Math.cos(a) * (R - 1.55), a, { collide: false });
      b.box(trim, seg + 0.2, 0.4, 3.3, px, y + h, pz, a, { collide: false });
      if (style === 'bloom' && i % 7 === 3) {
        b.box(MATS.gold, 1, 1, 1, px, y + h + 0.4, pz, a);
        b.cyl(MATS.gold, 0.4, 0.6, 3, px, y + h + 1.4, pz, 8);
        b.sphere(MATS.gold, 0.6, px, y + h + 5, pz);
      }
      if (style === 'stars' && rng() < 0.4) b.geo(MATS.crystal, new THREE.OctahedronGeometry(1 + rng(), 0), px, y + h + 1, pz, rng(), rng(), 0);
    }
    // tiered seating ring inside
    for (let t = 0; t < 3; t++) {
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        if (i % 14 === 0) continue;
        if (style !== 'bloom' && rng() < 0.4) continue;
        const r = R - 2.8 - t * 1.4;
        b.box(mat, (2 * Math.PI * r) / N + 0.1, 1.2 + t * 1.2, 1.4, x + Math.sin(a) * r, y, z + Math.cos(a) * r, a, { tag: 'stone' });
      }
    }
    if (style === 'bloom') {
      for (const a of [0, Math.PI]) {
        banner(b, x + Math.sin(a + 0.3) * (R - 6), y, z + Math.cos(a + 0.3) * (R - 6), a, MATS.cloth, 7);
        banner(b, x + Math.sin(a - 0.3) * (R - 6), y, z + Math.cos(a - 0.3) * (R - 6), a, MATS.cloth, 7);
      }
    }
    if (style === 'ash') rubble(b, x + 10, y, z - 8, rng, 16, MATS.charred);
    return b.build();
  };
  finishSite(site, make('bloom'), [0]);
  finishSite(site, make('ash'), [1]);
  finishSite(site, make('stars'), [2]);
  site.register();
  content.sites.push(site);
}

// ---------------------------------------------------------------------------
// Sun Pillars
// ---------------------------------------------------------------------------
function buildPillars() {
  for (const id of ['pillar1', 'pillar2', 'pillar3']) {
    const p = poi(id);
    const y = H(p.x, p.z);
    const site = new Site(p.name, p.x, p.z);
    for (const [style, ep] of [['bloom', 0], ['ash', 1], ['stars', 2]]) {
      const b = new Builder(id + style);
      pillar(b, p.x, y, p.z, style);
      finishSite(site, b.build(), [ep]);
    }
    site.register();
    content.sites.push(site);
    content.pillars.push({ id, x: p.x, z: p.z, y, top: y + 39.5, name: p.name });
  }
}

// ---------------------------------------------------------------------------
// Trials
// ---------------------------------------------------------------------------
function courtyard(b, x, y, z, r, mat, rng, gap = 0) {
  const N = 20;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    if (Math.abs(((a - gap + Math.PI) % (Math.PI * 2)) - Math.PI) < 0.3) continue;
    const h = 3 + rng() * 2.5;
    b.box(mat, (2 * Math.PI * r) / N + 0.2, h, 1.2, x + Math.sin(a) * r, y - 0.2, z + Math.cos(a) * r, a, { tag: 'stone' });
  }
}

function buildTrials() {
  // Trial of Embers: three braziers to light with fire
  {
    const p = poi('trial1');
    const y = H(p.x, p.z);
    const site = new Site(p.name, p.x, p.z);
    const make = (ep) => {
      const b = new Builder('trial1-' + ep);
      const rng = mulberry32(61);
      courtyard(b, p.x, y, p.z, 16, ep === 1 ? MATS.charred : MATS.stone, rng, Math.atan2(100 - p.x, 300 - p.z));
      const floor = new THREE.CircleGeometry(15, 32);
      floor.rotateX(-Math.PI / 2);
      b.geo(MATS.cobble, floor, p.x, y + 0.05, p.z);
      b.box(MATS.marble, 3.5, 0.6, 3.5, p.x, y, p.z, 0);
      return b.build();
    };
    finishSite(site, make(0), [0, 2]);
    finishSite(site, make(1), [1]);
    site.register();
    content.sites.push(site);
    content.trial1 = { x: p.x, z: p.z, y, braziers: [] };
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      content.trial1.braziers.push({ x: p.x + Math.sin(a) * 9, z: p.z + Math.cos(a) * 9, y: H(p.x + Math.sin(a) * 9, p.z + Math.cos(a) * 9) });
    }
  }
  // Trial of Ages: route that needs all three timelines
  {
    const p = poi('trial2');
    const y = H(p.x, p.z);
    const site = new Site(p.name, p.x, p.z);
    const shared = new Builder('trial2-shared');
    const rng = mulberry32(62);
    courtyard(shared, p.x, y, p.z, 20, MATS.stone, rng, 0);
    // start plinth -> high platform A -> [bloom bridge] -> platform B -> [ash gate open] -> C -> [stars steps] -> D (chest)
    const px = p.x, pz = p.z;
    shared.box(MATS.stone, 4, 4, 4, px - 10, y, pz + 6, 0, { tag: 'stone' });
    shared.box(MATS.stone, 2, 1, 2, px - 7, y, pz + 6, 0, { tag: 'stone' });
    shared.box(MATS.stone, 2, 2.2, 2, px - 8.2, y, pz + 6, 0, { tag: 'stone' });
    shared.box(MATS.marble, 4, 8, 4, px + 2, y, pz + 6, 0, { tag: 'stone', climbable: false });
    shared.box(MATS.marble, 4, 8, 6, px + 2, y, pz + 1, 0, { tag: 'stone', climbable: false });
    shared.box(MATS.marble, 4, 14, 4, px + 2, y, pz - 12, 0, { tag: 'stone', climbable: false });
    const sb = shared.build();
    site.setAlways(sb);
    const bloom = new Builder('trial2-bloom');
    for (let i = 0; i < 6; i++) bloom.box(MATS.wood, 1.9, 0.3, 2.2, px - 6.5 + i * 1.9, y + 3.75 + i * 0.75, pz + 6, 0, { tag: 'wood' });
    finishSite(site, bloom.build(), [0]);
    const ash = new Builder('trial2-ash');
    rubble(ash, px + 2, y + 8, pz + 3.5, mulberry32(9), 4, MATS.iron);
    finishSite(site, ash.build(), [1]);
    const gate = new Builder('trial2-gate');
    gate.box(MATS.iron, 4, 3.2, 0.5, px + 2, y + 8, pz + 3.6, 0, { tag: 'stone', climbable: false });
    for (let i = 0; i < 5; i++) gate.box(MATS.runeGold, 0.12, 2.8, 0.55, px + 0.4 + i * 0.8, y + 8.1, pz + 3.6, 0, { collide: false });
    finishSite(site, gate.build(), [0, 2]);
    const stars = new Builder('trial2-stars');
    for (let i = 0; i < 5; i++) stars.box(MATS.crystal, 2.2, 0.35, 2.2, px + 2 + (i % 2 ? 0.6 : -0.6), y + 8.05 + i * 1.1, pz - 3 - i * 1.5, 0, { tag: 'stone' });
    finishSite(site, stars.build(), [2]);
    site.register();
    content.sites.push(site);
    content.trial2 = { x: px + 2, z: pz - 12, y: y + 14, base: y };
  }
  // Trial of Frost: islet in the lake, freeze the water to cross
  {
    const p = poi('trial3');
    const ix = 178, iz = 46;
    const iy = H(ix, iz);
    const site = new Site(p.name, ix, iz);
    const b = new Builder('trial3');
    const rng = mulberry32(63);
    const yb = Math.min(iy, -2) - 1, top = 4.5;
    b.cyl(MATS.rock, 5, 6.5, top - yb, ix, yb, iz, 12, { tag: 'stone', climbable: false });
    b.cyl(MATS.marble, 4.2, 4.2, 0.4, ix, top, iz, 16);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.box(MATS.marble, 0.6, 3 + rng(), 0.6, ix + Math.sin(a) * 3.8, top, iz + Math.cos(a) * 3.8, a);
    }
    // shore shrine
    const sx = p.x, sz = p.z, sy = H(sx, sz);
    b.box(MATS.marble, 6, 0.5, 6, sx, sy - 0.2, sz, 0);
    b.box(MATS.marble, 0.8, 4, 0.8, sx - 2.5, sy, sz - 2.5, 0);
    b.box(MATS.marble, 0.8, 4, 0.8, sx - 2.5, sy, sz + 2.5, 0);
    b.box(MATS.marble, 0.8, 0.6, 6, sx - 2.5, sy + 4, sz, 0);
    b.box(MATS.rune, 0.1, 1.5, 1.5, sx - 2.9, sy + 1.5, sz, 0, { collide: false });
    site.setAlways(b.build());
    content.sites.push(site);
    content.trial3 = { x: ix, z: iz, y: top + 0.4, shore: { x: sx, z: sz, y: sy } };
  }
}

// ---------------------------------------------------------------------------
// Cinderpeak crater arena
// ---------------------------------------------------------------------------
function buildCrater() {
  const x = VOLCANO.x, z = VOLCANO.z, y = VOLCANO.floor;
  content.crater = { x, z, y };
  const site = new Site('Crater', x, z);
  {
    const b = new Builder('crater-ash');
    const rng = mulberry32(71);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + rng() * 0.2;
      const r = 40 + rng() * 6;
      const h = 6 + rng() * 10;
      b.cone(MATS.obsidian, 1.5 + rng(), h, x + Math.sin(a) * r, H(x + Math.sin(a) * r, z + Math.cos(a) * r) - 1, z + Math.cos(a) * r, 5, { rx: (rng() - 0.5) * 0.3 });
    }
    b.cyl(MATS.stoneDark, 4, 5, 1.2, x, y - 0.3, z, 12);
    b.box(MATS.lava, 1.5, 0.1, 1.5, x, y + 0.92, z, 0.7, { collide: false });
    b.extras.push({ type: 'fire', x, y: y + 1, z, size: 1.5 });
    finishSite(site, b.build(), [1]);
  }
  {
    const b = new Builder('crater-bloom');
    const rng = mulberry32(72);
    b.cyl(MATS.marble, 4, 5, 1.2, x, y - 0.3, z, 12);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.cyl(MATS.marble, 0.5, 0.6, 4 + rng() * 2, x + Math.sin(a) * 9, y, z + Math.cos(a) * 9, 10);
    }
    finishSite(site, b.build(), [0]);
  }
  {
    const b = new Builder('crater-stars');
    const rng = mulberry32(73);
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2, r = 8 + rng() * 30;
      b.geo(i % 2 ? MATS.crystal : MATS.crystalPink, new THREE.OctahedronGeometry(1 + rng() * 2, 0), x + Math.sin(a) * r, H(x + Math.sin(a) * r, z + Math.cos(a) * r) + 1, z + Math.cos(a) * r, rng() * 0.6, rng() * 3, 0);
    }
    finishSite(site, b.build(), [2]);
  }
  site.register();
  content.sites.push(site);
}

// ---------------------------------------------------------------------------
// Astral Isles (Age of Stars only)
// ---------------------------------------------------------------------------
function islandGeo(r, depth, seed) {
  const g = new THREE.CylinderGeometry(r, r * 0.12, depth, 18, 6);
  const rng = mulberry32(seed);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const yy = p.getY(i);
    if (yy < depth / 2 - 0.01) {
      const k = 1 + (rng() - 0.5) * 0.35;
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
      p.setY(i, yy + (rng() - 0.5) * 0.6);
    }
  }
  g.computeVertexNormals();
  g.translate(0, -depth / 2, 0);
  return g;
}
function buildAstral() {
  const base = poi('astral');
  const by = H(base.x, base.z);
  const site = new Site('Astral Isles', base.x, base.z);
  const b = new Builder('astral');
  const rng = mulberry32(81);
  const isles = [
    { x: 405, z: -95, y: 60, r: 7 },
    { x: 428, z: -128, y: 74, r: 6 },
    { x: 452, z: -150, y: 84, r: 5 },
    { x: 440, z: -185, y: 95, r: 24, arena: true },
    { x: 385, z: -150, y: 70, r: 6 },
    { x: 470, z: -110, y: 66, r: 5 },
  ];
  content.astral = { base: { x: base.x, z: base.z, y: by }, isles };
  for (const is of isles) {
    b.geo(MATS.rockStar, islandGeo(is.r, is.r * 1.6, Math.floor(is.x)), is.x, is.y, is.z);
    const top = new THREE.CircleGeometry(is.r * 0.98, 24);
    top.rotateX(-Math.PI / 2);
    b.geo(MATS.moss, top, is.x, is.y + 0.03, is.z);
    b.collider({ type: 'cyl', x: is.x, z: is.z, y0: is.y - is.r * 1.2, y1: is.y, r: is.r * 0.95, climbable: true, tag: 'stone' });
    for (let k = 0; k < Math.ceil(is.r / 3); k++) {
      const a = rng() * Math.PI * 2, rr = rng() * is.r * 0.7;
      b.geo(k % 2 ? MATS.crystal : MATS.crystalPink, new THREE.OctahedronGeometry(0.4 + rng() * 0.8, 0), is.x + Math.sin(a) * rr, is.y + 0.6, is.z + Math.cos(a) * rr, rng(), rng(), 0);
    }
    if (is.arena) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        b.cyl(MATS.marbleStar, 0.6, 0.7, 6 + (i % 3) * 2, is.x + Math.sin(a) * (is.r - 2), is.y, is.z + Math.cos(a) * (is.r - 2), 10);
      }
      const floor = new THREE.CircleGeometry(is.r * 0.7, 32);
      floor.rotateX(-Math.PI / 2);
      b.geo(MATS.marbleStar, floor, is.x, is.y + 0.06, is.z);
    }
  }
  // the Starwell: a ring of stones at the base with an updraft column
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    b.box(MATS.marbleStar, 1, 2 + (i % 2), 1, base.x + Math.sin(a) * 7, by - 0.3, base.z + Math.cos(a) * 7, a);
  }
  b.cyl(MATS.rune, 6, 6, 0.1, base.x, by + 0.05, base.z, 24, { collide: false });
  const built = b.build();
  finishSite(site, built, [2]);
  // updraft column visual
  const colGeo = new THREE.CylinderGeometry(5.5, 5.5, 110, 24, 1, true);
  const colMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float uTime; varying vec2 vUv; void main(){ float s = sin(vUv.x * 60.0) * 0.5 + 0.5; float f = fract(vUv.y * 6.0 - uTime * 0.6); float a = pow(s, 6.0) * f * (1.0 - vUv.y) * 0.5 + 0.06 * (1.0 - vUv.y); gl_FragColor = vec4(vec3(0.5, 0.8, 1.4) * a * 3.0, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const col = new THREE.Mesh(colGeo, colMat);
  col.position.set(base.x, by + 55, base.z);
  built.group.add(col);
  content.anims.push((dt, t) => { colMat.uniforms.uTime.value = t; });
  site.register();
  content.sites.push(site);
  const u = G.world.addUpdraft(base.x, base.z, 6.5, by + 108, 14);
  u.epochs = [2];
  content.starwell = u;
}

// ---------------------------------------------------------------------------
// Rifts & campfires (present in every Age)
// ---------------------------------------------------------------------------
const RIFT_FRAG = `uniform float uTime; varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
void main(){ vec2 c = vUv * 2.0 - 1.0; float r = length(c); float a = atan(c.y, c.x);
  float sw = n(vec2(a * 3.0 + uTime * 0.8 - r * 6.0, r * 4.0 - uTime)) ;
  vec3 col = mix(vec3(0.4, 0.1, 0.8), vec3(0.2, 0.8, 1.0), sw) * (1.6 - r) * 2.0;
  col += vec3(1.0, 0.9, 1.0) * pow(max(0.0, 1.0 - r * 3.0), 3.0) * 3.0;
  float alpha = smoothstep(1.0, 0.85, r);
  gl_FragColor = vec4(col, alpha); }`;

function buildRiftsAndCamps() {
  const riftMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: RIFT_FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  content.anims.push((dt, t) => { riftMat.uniforms.uTime.value = t; });
  for (const id of ['rift1', 'rift2', 'rift3']) {
    const p = poi(id);
    const y = H(p.x, p.z);
    const b = new Builder(id);
    const rng = mulberry32(id.charCodeAt(4));
    b.box(MATS.stoneDark, 7, 0.6, 3, p.x, y - 0.3, p.z, 0);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      b.box(MATS.stoneDark, 1.0, 0.9, 0.8, p.x + Math.cos(a) * 3.4, y + 3.8 + Math.sin(a) * 3.4, p.z, 0, { rz: -a, collide: false });
    }
    b.collider({ type: 'box', x: p.x, y: y + 3.8, z: p.z, hx: 4, hy: 4, hz: 0.4, ry: 0, climbable: false });
    const built = b.build();
    G.scene.add(built.group);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(3.1, 40), riftMat);
    disc.position.set(p.x, y + 3.8, p.z);
    built.group.add(disc);
    const rocks = new THREE.Group();
    rocks.position.copy(disc.position);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + rng() * 0.4, 0), MATS.obsidian);
      m.userData.a = rng() * Math.PI * 2;
      m.userData.r = 5 + rng() * 2;
      m.userData.h = (rng() - 0.5) * 6;
      rocks.add(m);
    }
    built.group.add(rocks);
    const light = new VLight(0xa070ff, 10, 20, 2);
    light.position.copy(disc.position);
    built.group.add(light);
    content.anims.push((dt, t) => {
      rocks.children.forEach((m) => {
        m.userData.a += dt * 0.4;
        m.position.set(Math.cos(m.userData.a) * m.userData.r, m.userData.h + Math.sin(t + m.userData.a) * 0.5, Math.sin(m.userData.a) * m.userData.r * 0.4);
        m.rotation.x += dt;
      });
      if (Math.random() < dt * 8) G.fx?.add.emit({ x: p.x + (Math.random() - 0.5) * 6, y: y + 3.8 + (Math.random() - 0.5) * 6, z: p.z + (Math.random() - 0.5) * 1, vx: 0, vy: 0.5, vz: 0, life: 1.5, size: 0.15, color: [1.5, 0.8, 3] });
    });
    content.rifts.push({ id, x: p.x, z: p.z, y, name: p.name });
  }
  for (const p of POIS.filter((q) => q.type === 'camp')) {
    const y = H(p.x, p.z);
    const b = new Builder(p.id);
    campfire(b, p.x, y, p.z);
    tent(b, p.x + 3.5, H(p.x + 3.5, p.z - 2), p.z - 2, 0.6, MATS.clothCream, 0.9);
    const built = b.build();
    G.scene.add(built.group);
    for (const ex of built.extras) if (ex.type === 'fire') addFireFx(ex, [0, 1, 2]);
    content.campfires.push({ id: p.id, x: p.x, z: p.z, y, name: p.name });
    G.world.addUpdraft(p.x, p.z, 2.2, y + 25, 8);
  }
  // villages also have a hearth to rest at
  const h = content.hearthmere;
  content.campfires.push({ id: 'hearth_bloom', x: h.cx - 6, z: h.cz + 7, y: H(h.cx - 6, h.cz + 7), name: 'Hearthmere Hearth', epochs: [0] });
  content.campfires.push({ id: 'hearth_ash', x: h.cx, z: h.cz, y: H(h.cx, h.cz), name: 'Survivor Bonfire', epochs: [1, 2] });
  const k = content.kestrel;
  content.campfires.push({ id: 'kestrel_fire', x: k.cx, z: k.cz, y: H(k.cx, k.cz), name: "Kestrel's Fire" });
}

// ---------------------------------------------------------------------------
// Enemy camps per Age
// ---------------------------------------------------------------------------
function camps() {
  const C = [];
  const add = (x, z, epochs, types, count, level = 1, r = 6) => C.push({ x, z, epochs, types, count, level, r, reward: true });
  // Age of Bloom
  add(-120, 300, [0], ['wolf'], 3, 1);
  add(-60, 170, [0], ['thornling', 'thornling'], 3, 1);
  add(290, 120, [0], ['wolf', 'wolf', 'thornling'], 4, 2);
  add(300, -150, [0], ['thornling'], 4, 2);
  add(-420, 60, [0], ['sentinel'], 2, 2);
  add(-470, -60, [0], ['sentinel'], 2, 2, 10);
  add(150, -420, [0], ['wolf'], 4, 3);
  add(-500, 420, [0], ['thornling', 'wolf'], 4, 2);
  add(520, 380, [0], ['wolf', 'wolf', 'thornling'], 4, 3);
  add(-250, -250, [0], ['sentinel', 'thornling'], 3, 3);
  add(100, 480, [0], ['wolf'], 3, 1);
  // Age of Ash
  add(-240, 280, [1], ['husk'], 3, 1);
  add(-300, 390, [1], ['husk', 'archer'], 3, 1);
  add(-100, -120, [1], ['husk', 'husk', 'archer'], 4, 2);
  add(300, -150, [1], ['hound', 'hound'], 3, 2);
  add(60, -380, [1], ['husk', 'archer', 'hound'], 5, 3);
  add(-420, 60, [1], ['archer', 'husk'], 4, 2);
  add(150, 330, [1], ['hound'], 3, 2);
  add(0, 120, [1], ['husk', 'husk'], 4, 2);
  add(-40, -20, [1], ['husk', 'archer'], 4, 3);
  add(420, 300, [1], ['husk', 'hound'], 4, 3);
  add(-480, -260, [1], ['archer', 'husk'], 4, 3);
  // Age of Stars
  add(-380, -100, [2], ['wisp', 'wisp'], 3, 2);
  add(-300, 120, [2], ['wraith'], 3, 2);
  add(360, -20, [2], ['wisp', 'wraith'], 3, 2);
  add(200, -260, [2], ['golem'], 1, 2);
  add(-150, -300, [2], ['wraith', 'wisp'], 4, 3);
  add(80, 420, [2], ['wisp'], 3, 1);
  add(-460, -330, [2], ['golem', 'wisp'], 3, 3);
  add(480, 200, [2], ['wraith', 'wraith'], 3, 3);
  add(-220, 260, [2], ['wisp'], 2, 1);
  add(420, -80, [2], ['golem'], 1, 3);
  return C;
}

// ---------------------------------------------------------------------------
export function buildWorld() {
  initMaterials();
  buildHearthmere();
  buildKestrel();
  buildSpire();
  buildColosseum();
  buildPillars();
  buildTrials();
  buildCrater();
  buildAstral();
  buildRiftsAndCamps();
  G.spawner = new Spawner(camps());
  G.content = content;
  let smokeT = 0;
  content.update = (dt, scale = 1) => {
    const t = G.time;
    for (const a of content.anims) a(dt, t);
    const ep = G.epochs.current;
    const cam = G.camera.position;
    smokeT += dt;
    for (const f of content.fires) {
      const on = !f.epochs || f.epochs.includes(ep);
      const d = Math.hypot(cam.x - f.x, cam.z - f.z);
      const near = d < 90;
      f.light.visible = on && d < 60;
      if (!on || !near) continue;
      f.light.intensity = (5 + Math.sin(t * 17 + f.x) * 1.2 + Math.sin(t * 7.3) * 0.8) * (f.size || 1);
      if (Math.random() < dt * 30 * (f.size || 1)) G.fx.fire(f.x, f.y, f.z, f.size || 1);
      if (Math.random() < dt * 2) G.fx.smoke(f.x, f.y + 1.5, f.z, f.size || 1);
    }
    if (smokeT > 0.25) {
      smokeT = 0;
      for (const c of content.chimneys) {
        if (c.lamp) continue;
        if (c.epochs && !c.epochs.includes(ep)) continue;
        if (Math.hypot(cam.x - c.x, cam.z - c.z) > 150) continue;
        G.fx.smoke(c.x, c.y, c.z, 0.8, [0.55, 0.55, 0.58]);
      }
    }
    for (const bc of content.beacons) {
      if (bc.epochs && !bc.epochs.includes(ep)) continue;
      if (Math.random() < dt * 3) G.fx.add.emit({ x: bc.x, y: bc.y, z: bc.z, vx: (Math.random() - 0.5) * 0.5, vy: 1.5, vz: (Math.random() - 0.5) * 0.5, life: 2, size: 0.4, size1: 0, color: bc.style === 'ash' ? [3, 1, 0.3] : bc.style === 'stars' ? [1, 2, 3.5] : [3, 2.5, 1.2], shape: 2 });
    }
    // Starwell only exists in the Age of Stars
    if (content.starwell) content.starwell.strength = ep === 2 ? 14 : -99;
    G.story?.update?.(dt);
    G.npcs?.update?.(dt * scale);
  };
}
