// People around the course: detailed spectators (legs, torso, arms, head,
// hair or hats, the odd umbrella) that cheer with raised arms, marshals with
// "Quiet please" paddles, a TV camera tower, the caddie with your bag and a
// name bib, and golf carts driving the cart path.
import * as THREE from '../../vendor/three.module.min.js';
import { RNG } from '../util/rng.js';
import { mergeGeos } from './trees.js';

const UP = new THREE.Vector3(0, 1, 0);

function cyl(r0, r1, h, x, y, z, seg = 7) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg);
  g.translate(x, y + h / 2, z);
  return g;
}
function cylBetween(a, b, r0, r1, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a);
  const L = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, L, seg);
  g.translate(0, L / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}
function white(g) {
  const n = g.index ? g.toNonIndexed() : g;
  if (n.attributes.uv) n.deleteAttribute('uv');
  const c = new Float32Array(n.attributes.position.count * 3).fill(1);
  n.setAttribute('color', new THREE.BufferAttribute(c, 3));
  n.computeVertexNormals();
  return n;
}
const M = (...gs) => mergeGeos(gs.map(white));
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Person parts, standing at the origin facing +z, about 1.75 m tall
const PARTS = (() => {
  const legs = M(cyl(0.075, 0.065, 0.84, -0.09, 0, 0), cyl(0.075, 0.065, 0.84, 0.09, 0, 0), new THREE.BoxGeometry(0.34, 0.16, 0.2).translate(0, 0.86, 0));
  const shoes = M(new THREE.BoxGeometry(0.11, 0.07, 0.25).translate(-0.09, 0.035, 0.04), new THREE.BoxGeometry(0.11, 0.07, 0.25).translate(0.09, 0.035, 0.04));
  const torso = M(new THREE.CapsuleGeometry(0.17, 0.34, 3, 8).scale(1.15, 1, 0.8).translate(0, 1.2, 0));
  const armsDown = M(cylBetween(V(-0.23, 1.44, 0), V(-0.27, 0.95, 0.03), 0.055, 0.045), cylBetween(V(0.23, 1.44, 0), V(0.27, 0.95, 0.03), 0.055, 0.045));
  const armsUp = M(cylBetween(V(-0.23, 1.44, 0), V(-0.34, 1.95, 0.05), 0.055, 0.045), cylBetween(V(0.23, 1.44, 0), V(0.34, 1.95, 0.05), 0.055, 0.045));
  const head = M(new THREE.SphereGeometry(0.11, 10, 8).scale(1, 1.12, 1).translate(0, 1.62, 0), new THREE.CylinderGeometry(0.045, 0.05, 0.08, 6).translate(0, 1.5, 0),
    new THREE.SphereGeometry(0.035, 6, 4).translate(-0.028, 0.93, 0.03), new THREE.SphereGeometry(0.035, 6, 4).translate(0.028, 0.93, 0.03));
  const handsUp = M(new THREE.SphereGeometry(0.04, 6, 4).translate(-0.34, 1.97, 0.05), new THREE.SphereGeometry(0.04, 6, 4).translate(0.34, 1.97, 0.05));
  const handsDown = M(new THREE.SphereGeometry(0.04, 6, 4).translate(-0.27, 0.93, 0.03), new THREE.SphereGeometry(0.04, 6, 4).translate(0.27, 0.93, 0.03));
  const cap = M(new THREE.SphereGeometry(0.118, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.66, 0), new THREE.CylinderGeometry(0.09, 0.09, 0.012, 10, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 1.3).translate(0, 1.67, 0.08));
  const sunhat = M(new THREE.CylinderGeometry(0.1, 0.12, 0.1, 10).translate(0, 1.72, 0), new THREE.CylinderGeometry(0.24, 0.24, 0.015, 14).translate(0, 1.68, 0));
  const hair = M(new THREE.SphereGeometry(0.118, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.6).translate(0, 1.64, -0.01));
  // clapping: forearms forward, hands in front of the chest (open / together)
  const armsClap = M(cylBetween(V(-0.23, 1.44, 0), V(-0.25, 1.17, 0.1), 0.055, 0.05), cylBetween(V(-0.25, 1.17, 0.1), V(-0.07, 1.3, 0.3), 0.05, 0.045),
    cylBetween(V(0.23, 1.44, 0), V(0.25, 1.17, 0.1), 0.055, 0.05), cylBetween(V(0.25, 1.17, 0.1), V(0.07, 1.3, 0.3), 0.05, 0.045));
  const handsOpen = M(new THREE.SphereGeometry(0.04, 6, 4).translate(-0.08, 1.31, 0.31), new THREE.SphereGeometry(0.04, 6, 4).translate(0.08, 1.31, 0.31));
  const handsShut = M(new THREE.SphereGeometry(0.04, 6, 4).translate(-0.03, 1.32, 0.32), new THREE.SphereGeometry(0.04, 6, 4).translate(0.03, 1.32, 0.32));
  // one arm down, the other pointing up at the ball
  const armsPoint = M(cylBetween(V(0.23, 1.44, 0), V(0.27, 0.95, 0.03), 0.055, 0.045), cylBetween(V(-0.23, 1.44, 0), V(-0.3, 1.8, 0.5), 0.055, 0.045));
  const handsPoint = M(new THREE.SphereGeometry(0.04, 6, 4).translate(0.27, 0.93, 0.03), new THREE.SphereGeometry(0.04, 6, 4).translate(-0.31, 1.82, 0.54), new THREE.CylinderGeometry(0.012, 0.012, 0.09, 4).rotateX(Math.PI / 2 - 0.6).translate(-0.32, 1.85, 0.6));
  const umbrella = M(new THREE.ConeGeometry(0.62, 0.3, 10, 1, true).translate(0, 2.25, 0), new THREE.CylinderGeometry(0.012, 0.012, 1.2, 5).translate(0.02, 1.62, 0.1));
  return { legs, shoes, torso, armsDown, armsUp, head, handsUp, handsDown, cap, sunhat, hair, umbrella, armsClap, handsOpen, handsShut, armsPoint, handsPoint };
})();

const SHIRTS = ['#e63946', '#1d3557', '#f1faee', '#2a9d8f', '#e9c46a', '#264653', '#ffffff', '#8ac926', '#ff006e', '#3a86ff', '#ffca3a', '#6a4c93', '#f4a261', '#b5e48c', '#90e0ef', '#ffafcc'];
const PANTS = ['#1b1b1b', '#2b2d42', '#e9e4d8', '#8d99ae', '#3d405b', '#6b705c', '#1d3557', '#c9ada7', '#403d39'];
const SKIN = ['#f1c7a5', '#e8b996', '#d49a73', '#b87d56', '#8d5a3b', '#6b4029', '#f5d0b5'];
const HAIR = ['#1a1a1a', '#3b2a1f', '#6b4423', '#a0703a', '#d9b36c', '#8f8f8f', '#e8e8e8'];
const HATS = ['#ffffff', '#1d3557', '#e63946', '#f2c230', '#2a9d8f', '#1b1b1b', '#e9e4d8'];
const UMBRELLAS = ['#c1121f', '#1d3557', '#f2c230', '#2a9d8f', '#ffffff', '#6a4c93'];

/**
 * Spectators at the given spots [{x,y,z,face}] -> { group, cheer(strength),
 * clap(strength), watch(point, pointing), flash(n), update(dt) }. They cheer
 * with raised arms, clap, turn to follow the ball (some point at it) and take
 * photos.
 * opts.vest: marshal-style yellow shirts
 */
export function buildPeople(spots, seed = 1, opts = {}) {
  const rng = new RNG(seed);
  const group = new THREE.Group();
  const n = spots.length;
  if (!n) return { group, cheer() {}, clap() {}, watch() {}, flash() {}, update() {} };
  const mat = () => new THREE.MeshLambertMaterial({ vertexColors: true });
  const people = spots.map((sp) => {
    const kid = rng.chance(0.1);
    const s = (kid ? rng.float(0.62, 0.78) : rng.float(0.92, 1.08));
    const headwear = rng.next();
    return {
      ...sp, s, ph: rng.float(0, 6.28),
      shirt: opts.vest ? '#e8ff3a' : rng.pick(SHIRTS), pants: rng.pick(PANTS), skin: rng.pick(SKIN), hair: rng.pick(HAIR),
      hat: headwear < 0.42 ? 'cap' : headwear < 0.55 ? 'sunhat' : 'hair', hatColor: rng.pick(HATS),
      umbrella: !opts.vest && rng.chance(opts.umbrellas ?? 0.05) ? rng.pick(UMBRELLAS) : null,
    };
  });
  const mk = (geo, list, colorOf) => {
    const m = new THREE.InstancedMesh(geo, mat(), Math.max(1, list.length));
    m.count = list.length;
    m.frustumCulled = false;
    const c = new THREE.Color();
    list.forEach((p, i) => m.setColorAt(i, c.set(colorOf(p))));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    group.add(m);
    return { m, list };
  };
  const all = people;
  const parts = [
    mk(PARTS.legs, all, (p) => p.pants),
    mk(PARTS.shoes, all, () => '#f2f2f2'),
    mk(PARTS.torso, all, (p) => p.shirt),
    mk(PARTS.head, all, (p) => p.skin),
    mk(PARTS.cap, all.filter((p) => p.hat === 'cap'), (p) => p.hatColor),
    mk(PARTS.sunhat, all.filter((p) => p.hat === 'sunhat'), (p) => p.hatColor),
    mk(PARTS.hair, all.filter((p) => p.hat === 'hair'), (p) => p.hair),
    mk(PARTS.umbrella, all.filter((p) => p.umbrella), (p) => p.umbrella),
  ];
  // arm poses: every pose mesh holds everyone, and people not in that pose
  // are scaled to nothing, so each spectator can do their own thing
  const skin = (p) => p.skin, shirt = (p) => p.shirt;
  const poses = {
    down: [mk(PARTS.armsDown, all, shirt), mk(PARTS.handsDown, all, skin)],
    up: [mk(PARTS.armsUp, all, shirt), mk(PARTS.handsUp, all, skin)],
    clap: [mk(PARTS.armsClap, all, shirt)],
    point: [mk(PARTS.armsPoint, all, shirt), mk(PARTS.handsPoint, all, skin)],
  };
  const clapOpen = mk(PARTS.handsOpen, all, skin);
  const clapShut = mk(PARTS.handsShut, all, skin);
  parts[0].m.castShadow = true;
  parts[2].m.castShadow = true;
  for (const p of people) {
    p.yaw = p.face;
    p.pose = 'down';
    p.pointer = rng.chance(0.22);
    p.clapper = rng.chance(0.85);
    p.rate = rng.float(5.5, 8);
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  let t = 0;
  const write = (entry, show = null) => {
    entry.list.forEach((p, i) => {
      q.setFromAxisAngle(UP, p.yaw);
      const s = show && !show(p) ? 0 : p.s;
      sc.set(s, s, s);
      pos.set(p.x, p.y + (p.lift || 0), p.z);
      m4.compose(pos, q, sc);
      entry.m.setMatrixAt(i, m4);
    });
    entry.m.instanceMatrix.needsUpdate = true;
  };
  const shut = (p) => Math.sin(t * p.rate + p.ph) > 0;
  const writeAll = () => {
    for (const e of parts) write(e);
    for (const [name, list] of Object.entries(poses)) for (const e of list) write(e, (p) => p.pose === name);
    write(clapOpen, (p) => p.pose === 'clap' && !shut(p));
    write(clapShut, (p) => p.pose === 'clap' && shut(p));
  };
  writeAll();

  // camera flashes from the gallery
  const NF = 16;
  const fpos = new Float32Array(NF * 3), fcol = new Float32Array(NF * 3);
  const fgeo = new THREE.BufferGeometry();
  fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  fgeo.setAttribute('color', new THREE.BufferAttribute(fcol, 3));
  const flashPts = new THREE.Points(fgeo, new THREE.PointsMaterial({ size: 10, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: flashTexture() }));
  flashPts.frustumCulled = false;
  flashPts.renderOrder = 7;
  group.add(flashPts);
  const flashes = [];
  let queued = [];

  let cheerT = 0, strength = 0, clapT = 0, target = null, pointing = false, wasBusy = true;
  const tmp = new THREE.Vector3();
  return {
    group,
    cheer(str = 1) { cheerT = 2.6; strength = str; },
    clap(str = 1) { if (cheerT <= 0) clapT = Math.max(clapT, 1.6 + str * 1.6); },
    // Face a point in the world (the golfer, then the ball in flight); some point at it
    watch(v, point = false) {
      if (!v) { target = null; pointing = false; return; }
      group.updateWorldMatrix(true, false);
      target = group.worldToLocal(tmp.copy(v));
      target = { x: target.x, z: target.z };
      pointing = point;
    },
    flash(n = 4, over = 1.2) {
      for (let i = 0; i < n; i++) queued.push(t + Math.random() * over);
    },
    update(dt) {
      t += dt;
      let moving = false;
      if (target) {
        for (const p of people) {
          // turn head and shoulders to follow, but never right round
          const rel = Math.max(-1.7, Math.min(1.7, wrapA(Math.atan2(target.x - p.x, target.z - p.z) - p.face)));
          const d = wrapA(p.face + rel - p.yaw);
          if (Math.abs(d) > 0.003) { p.yaw += d * Math.min(1, dt * 3.2); moving = true; }
        }
      }
      if (cheerT > 0) cheerT -= dt;
      if (clapT > 0) clapT -= dt;
      // flashes: a bright pop at a random spectator's face
      if (queued.length) {
        const due = queued.filter((q0) => q0 <= t);
        queued = queued.filter((q0) => q0 > t);
        for (const _ of due) {
          if (flashes.length >= NF) break;
          const p = people[Math.floor(Math.random() * n)];
          flashes.push({ x: p.x + Math.sin(p.yaw) * 0.25 * p.s, y: p.y + 1.62 * p.s, z: p.z + Math.cos(p.yaw) * 0.25 * p.s, life: 0.11 });
        }
      }
      for (let i = flashes.length - 1; i >= 0; i--) { flashes[i].life -= dt; if (flashes[i].life <= 0) flashes.splice(i, 1); }
      flashes.forEach((f, i) => {
        fpos[i * 3] = f.x; fpos[i * 3 + 1] = f.y; fpos[i * 3 + 2] = f.z;
        const k = Math.min(1, f.life / 0.06);
        fcol[i * 3] = k; fcol[i * 3 + 1] = k; fcol[i * 3 + 2] = k;
      });
      fgeo.attributes.position.needsUpdate = true;
      fgeo.attributes.color.needsUpdate = true;
      fgeo.setDrawRange(0, flashes.length);
      const busy = cheerT > 0 || clapT > 0 || (pointing && target);
      if (!busy && !moving && !wasBusy) return;
      wasBusy = busy;
      for (const p of people) {
        p.pose = cheerT > 0 ? 'up' : clapT > 0 ? (p.clapper ? 'clap' : 'down') : pointing && p.pointer ? 'point' : 'down';
        p.lift = cheerT > 0 ? Math.max(0, Math.sin(t * 11 + p.ph)) * 0.12 * strength * p.s : 0;
      }
      writeAll();
    },
  };
}

function wrapA(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

let flashTex = null;
function flashTexture() {
  if (flashTex) return flashTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(235,245,255,0.8)');
  gr.addColorStop(1, 'rgba(200,220,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  flashTex = new THREE.CanvasTexture(cv);
  return flashTex;
}

// ---------------------------------------------------------------- marshals
export function buildMarshals(spots, seed) {
  const ppl = buildPeople(spots, seed, { vest: true });
  const paddleGeo = M(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5).translate(0.3, 1.4, 0.12), new THREE.BoxGeometry(0.34, 0.2, 0.02).translate(0.3, 1.78, 0.12));
  const pm = new THREE.InstancedMesh(paddleGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), spots.length);
  const m4 = new THREE.Matrix4();
  const c = new THREE.Color('#f5f5f0');
  spots.forEach((sp, i) => {
    m4.compose(new THREE.Vector3(sp.x, sp.y, sp.z), new THREE.Quaternion().setFromAxisAngle(UP, sp.face), new THREE.Vector3(1, 1, 1));
    pm.setMatrixAt(i, m4);
    pm.setColorAt(i, c);
  });
  pm.frustumCulled = false;
  ppl.group.add(pm);
  return ppl;
}

// ---------------------------------------------------------------- TV tower
export function buildCameraTower(x, y, z, face) {
  const grp = new THREE.Group();
  const steel = new THREE.MeshLambertMaterial({ color: '#7b848c' });
  const H = 7;
  for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, H, 0.1), steel);
    leg.position.set(dx, H / 2, dz);
    grp.add(leg);
  }
  for (let h = 1.5; h < H; h += 1.8) {
    const ring = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.06, 2.5), steel);
    ring.position.y = h;
    ring.scale.set(1, 1, 1);
    grp.add(ring);
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.12, 2.8), new THREE.MeshLambertMaterial({ color: '#3a3f44' }));
  deck.position.y = H;
  grp.add(deck);
  const cam = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.7), new THREE.MeshLambertMaterial({ color: '#1b1b1b' }));
  body.position.set(0, 1.35, 0.2);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.35, 10).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#2a2a2a' }));
  lens.position.set(0, 1.35, 0.7);
  const tripod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), steel);
  tripod.position.set(0, 0.6, 0.2);
  cam.add(body, lens, tripod);
  cam.position.y = H + 0.06;
  grp.add(cam);
  const op = buildPeople([{ x: -0.45, y: H + 0.06, z: -0.1, face: 0 }], 77);
  grp.add(op.group);
  grp.position.set(x, y, z);
  grp.rotation.y = face;
  grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return grp;
}

// ---------------------------------------------------------------- caddie
function bibTexture(name) {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#fbfbf6';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#123524';
  g.font = 'bold 26px "Barlow Condensed", Arial, sans-serif';
  g.textAlign = 'center';
  const last = (name || 'PLAYER').split(' ').slice(-1)[0].toUpperCase().slice(0, 10);
  g.fillText(last, 64, 72);
  g.fillStyle = '#c8322c';
  g.fillRect(0, 100, 128, 8);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Caddie {
  constructor(golferLook = {}, golferName = '') {
    this.group = new THREE.Group();
    const ppl = buildPeople([{ x: 0, y: 0, z: 0, face: 0 }], 4242);
    this.group.add(ppl.group);
    // bib over the shirt
    // tour caddie vest with the player's name front and back
    const bibMat = new THREE.MeshLambertMaterial({ map: bibTexture(golferName) });
    const plain = new THREE.MeshLambertMaterial({ color: '#fbfbf6' });
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.44, 0.3), [plain, plain, plain, plain, bibMat, bibMat]);
    vest.position.set(0, 1.2, 0);
    this.group.add(vest);
    // tour bag with the golfer's colors, clubs sticking out
    const bag = new THREE.Group();
    const bodyC = golferLook.shirt || '#1d3557';
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.95, 12), new THREE.MeshLambertMaterial({ color: bodyC }));
    tube.position.y = 0.475;
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.152, 0.152, 0.08, 12), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
    stripe.position.y = 0.8;
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.08), new THREE.MeshLambertMaterial({ color: golferLook.cap || '#ffffff' }));
    pocket.position.set(0, 0.4, 0.15);
    bag.add(tube, stripe, pocket);
    const covers = ['#1b1b1b', '#c8322c', '#f2f2f2'];
    for (let i = 0; i < 3; i++) {
      const hc = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshLambertMaterial({ color: covers[i] }));
      hc.scale.set(1, 1.3, 1);
      hc.position.set(-0.06 + i * 0.06, 1.02, -0.03 + (i % 2) * 0.05);
      bag.add(hc);
    }
    for (let i = 0; i < 6; i++) {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.25, 4), new THREE.MeshLambertMaterial({ color: '#c9ccd1' }));
      shaft.position.set(-0.08 + (i % 3) * 0.08, 1.05, 0.05 - Math.floor(i / 3) * 0.08);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.07), new THREE.MeshLambertMaterial({ color: '#b8bec6' }));
      head.position.set(shaft.position.x, 1.18, shaft.position.z);
      bag.add(shaft, head);
    }
    if (golferLook.bagLogo) {
      // the bag sponsor's name down the front of the bag
      const lg = golferLook.bagLogo;
      const cv = document.createElement('canvas');
      cv.width = 64; cv.height = 160;
      const g = cv.getContext('2d');
      g.fillStyle = lg.bg; g.fillRect(0, 0, 64, 160);
      g.fillStyle = lg.fg;
      g.font = '800 30px "Barlow Condensed", Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.save(); g.translate(32, 80); g.rotate(-Math.PI / 2); g.fillText(lg.text, 0, 2, 150); g.restore();
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.34), new THREE.MeshLambertMaterial({ map: t }));
      panel.position.set(0, 0.5, 0.152);
      bag.add(panel);
    }
    bag.position.set(0.35, 0, 0.05);
    bag.rotation.z = -0.12;
    this.group.add(bag);
    this.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  // Stand a few steps behind and to the right of the golfer, facing the target
  place(ball, heading, putting, heightAt) {
    const f = { x: Math.sin(heading), z: -Math.cos(heading) };
    const r = { x: Math.cos(heading), z: Math.sin(heading) };
    // Off to the side, out of the player's camera, watching down the line
    const back = putting ? 2 : 1.4, side = putting ? 5 : 4.6;
    const x = ball.x - f.x * back + r.x * side, z = ball.z - f.z * back + r.z * side;
    this.group.position.set(x, heightAt(x, z), z);
    const lx = ball.x + f.x * 12 - x, lz = ball.z + f.z * 12 - z;
    this.group.rotation.y = Math.atan2(lx, lz);
  }
}

// ---------------------------------------------------------------- carts
function cartGeometry() {
  const w = (h) => new THREE.Color(h);
  const parts = [];
  const add = (geo, color) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g.attributes.uv) g.deleteAttribute('uv');
    const c = w(color);
    const arr = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.computeVertexNormals();
    parts.push(g);
  };
  add(new THREE.BoxGeometry(1.2, 0.35, 2.3).translate(0, 0.45, 0), '#f4f4f0');
  add(new THREE.BoxGeometry(1.15, 0.5, 0.55).translate(0, 0.85, 0.55), '#f4f4f0');
  add(new THREE.BoxGeometry(1.1, 0.12, 0.6).translate(0, 0.7, -0.1), '#2b2d42');
  add(new THREE.BoxGeometry(1.1, 0.5, 0.1).translate(0, 0.95, -0.42), '#2b2d42');
  add(new THREE.BoxGeometry(1.3, 0.06, 1.7).translate(0, 1.95, 0), '#f4f4f0');
  for (const [x, z] of [[-0.55, 0.75], [0.55, 0.75], [-0.55, -0.6], [0.55, -0.6]]) add(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 5).translate(x, 1.3, z), '#9aa0a8');
  for (const [x, z] of [[-0.62, 0.8], [0.62, 0.8], [-0.62, -0.8], [0.62, -0.8]]) add(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 12).rotateZ(Math.PI / 2).translate(x, 0.2, z), '#1b1b1b');
  add(new THREE.CylinderGeometry(0.16, 0.14, 0.8, 10).rotateX(-0.5).translate(0, 1.0, -1.0), '#1d3557');
  return mergeGeos(parts);
}

export class Cart {
  constructor(hole, seed) {
    this.hole = hole;
    const cp = hole.cartPath;
    this.ok = !!cp;
    this.group = new THREE.Group();
    if (!cp) return;
    const body = new THREE.Mesh(cartGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    body.castShadow = true;
    this.group.add(body);
    const riders = buildPeople([{ x: -0.28, y: 0.35, z: -0.1, face: 0 }, { x: 0.28, y: 0.35, z: -0.1, face: 0 }], seed, { umbrellas: 0 });
    riders.group.scale.set(1, 0.72, 1);
    this.group.add(riders.group);
    const rng = new RNG(seed);
    this.s = rng.float(cp.s0, cp.s1);
    this.dir = rng.sign();
    this.speed = rng.float(3.5, 5);
    this.pause = 0;
  }
  update(dt) {
    if (!this.ok) return;
    const cp = this.hole.cartPath;
    if (this.pause > 0) { this.pause -= dt; return; }
    this.s += this.dir * this.speed * dt;
    if (this.s > cp.s1 || this.s < cp.s0) { this.dir *= -1; this.pause = 6; this.s = Math.max(cp.s0, Math.min(cp.s1, this.s)); }
    const pt = this.hole.pointAtS(this.s);
    const r = { x: Math.cos(pt.heading), z: Math.sin(pt.heading) };
    const x = pt.x + r.x * cp.side * (cp.lat + 0.1), z = pt.z + r.z * cp.side * (cp.lat + 0.1);
    this.group.position.set(x, this.hole.heightAt(x, z) + 0.02, z);
    this.group.rotation.y = -pt.heading + (this.dir > 0 ? Math.PI : 0);
  }
}
