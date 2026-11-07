import * as THREE from 'three';
import { clamp, damp, smoothstep } from './noise.js';
import { colored, merge, flatMat } from './geom.js';
import { SEA_Y } from './world.js';

export const PAINTS = [
  { name: 'Harbor Red', color: 0xd9483b, accent: 0xf3e6cf },
  { name: 'Sky Teal', color: 0x2fa59a, accent: 0xf6efd9 },
  { name: 'Sunflower', color: 0xf2b630, accent: 0x5a3a24 },
  { name: 'Midnight', color: 0x2a3a7a, accent: 0xd9c27a },
  { name: 'Meadow', color: 0x5aa84a, accent: 0xf3e6cf },
  { name: 'Storm Violet', color: 0x8a3ad9, accent: 0x1e1428, unlock: 'dive', hint: 'Complete a Storm Dive' },
  { name: 'Gilded', color: 0xe6c25a, accent: 0x6a1e1e, unlock: 'rescue4', hint: 'Rescue 4 survivors' },
];
export const ENGINE_SPEED = [20, 26, 33, 40, 48];
export const ENGINE_RANGE = [330, 520, 770, 1050, 1400];
export const HULL_HP = [100, 150, 210, 280];

const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, side: THREE.DoubleSide });
const lanternMat = new THREE.MeshStandardMaterial({ color: 0xffc070, emissive: 0xffa040, emissiveIntensity: 3 });
const glowMat = new THREE.MeshBasicMaterial({ color: 0xff9a40, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });

const L = 24;
export function hullHalfWidth(z) {
  const s = clamp((z + L / 2) / L, 0, 1);
  return s < 0.45 ? 3.5 * Math.pow(Math.sin((s / 0.45) * Math.PI / 2), 0.7) : 3.5 * (1 - 0.25 * Math.pow((s - 0.45) / 0.55, 2));
}
function hullDepth(z) {
  const s = clamp((z + L / 2) / L, 0, 1);
  return 3.2 * (0.3 + 0.7 * Math.pow(Math.sin(Math.PI * s), 0.5));
}

export class Ship {
  constructor(G) {
    this.G = G;
    this.root = new THREE.Group();
    this.visual = new THREE.Group();
    this.root.add(this.visual);
    G.scene.add(this.root);
    this.pos = this.root.position;
    this.yaw = 0; this.speed = 0; this.vy = 0; this.yawRate = 0; this.throttle = 0;
    this.hp = 100;
    this.boxes = [];
    this.raycastMeshes = [];
    this.prevMatrix = new THREE.Matrix4();
    this.delta = new THREE.Matrix4();
    this.deltaYaw = 0;
    this.autopilot = null;
    this.wings = false;
    this.lookout = false;
    this.garden = false;
    this.cabins = [];
    this.boostFuel = 1;
    this.outOfRange = 0;
    this.build();
  }

  get maxHp() { return HULL_HP[this.G.save.upg.hull - 1]; }
  get range() { return ENGINE_RANGE[this.G.save.upg.engine - 1]; }
  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  build() {
    const v = this.visual;
    // ---- hull
    const N = 26, M = 12;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const z = -L / 2 + (i / N) * L;
      const w = Math.max(0.02, hullHalfWidth(z)), d = hullDepth(z);
      const row = [];
      for (let j = 0; j <= M; j++) {
        const ph = (j / M) * Math.PI;
        row.push(new THREE.Vector3(-w * Math.cos(ph), 0.45 - (d + 0.45) * Math.pow(Math.sin(ph), 0.8), z));
      }
      pts.push(row);
    }
    const pos = [], colr = [];
    const plankA = new THREE.Color(0x8a5a32), plankB = new THREE.Color(0x744a2a), trim = new THREE.Color(0xd9a441), keel = new THREE.Color(0x4a3220);
    const tri = (a, b, c, color) => { pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); for (let k = 0; k < 3; k++) colr.push(color.r, color.g, color.b); };
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
      const a = pts[i][j], b = pts[i + 1][j], c = pts[i + 1][j + 1], d = pts[i][j + 1];
      const y = (a.y + c.y) / 2;
      let colc = (Math.floor(y * 2.2 + 10) % 2 === 0) ? plankA : plankB;
      if (y > 0.15) colc = trim;
      if (j === M / 2 || j === M / 2 - 1) colc = keel;
      tri(a, b, c, colc); tri(a, c, d, colc);
    }
    // transom (stern cap)
    const last = pts[N];
    const cen = new THREE.Vector3(0, -0.8, L / 2);
    for (let j = 0; j < M; j++) tri(last[j], last[j + 1], cen, plankB);
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    hg.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    hg.computeVertexNormals();
    this.hull = new THREE.Mesh(hg, hullMat);
    this.hull.castShadow = true; this.hull.receiveShadow = true;
    v.add(this.hull);
    this.raycastMeshes.push(this.hull);

    // ---- deck planks
    const dp = [], dc = [];
    const dA = new THREE.Color(0xc79a62), dB = new THREE.Color(0xb88a55);
    for (let i = 0; i < N; i++) {
      const z0 = -L / 2 + (i / N) * L, z1 = -L / 2 + ((i + 1) / N) * L;
      const w0 = Math.max(0.02, hullHalfWidth(z0)) - 0.08, w1 = Math.max(0.02, hullHalfWidth(z1)) - 0.08;
      const strips = 8;
      for (let k = 0; k < strips; k++) {
        const t0 = -1 + (2 * k) / strips, t1 = -1 + (2 * (k + 1)) / strips;
        const c = k % 2 ? dA : dB;
        const a = [w0 * t0, 0, z0], b = [w0 * t1, 0, z0], cc = [w1 * t1, 0, z1], d = [w1 * t0, 0, z1];
        dp.push(...a, ...cc, ...b, ...a, ...d, ...cc);
        for (let q = 0; q < 6; q++) dc.push(c.r, c.g, c.b);
      }
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
    dg.setAttribute('color', new THREE.Float32BufferAttribute(dc, 3));
    dg.computeVertexNormals();
    this.deck = new THREE.Mesh(dg, hullMat);
    this.deck.receiveShadow = true;
    v.add(this.deck);
    this.raycastMeshes.push(this.deck);

    // ---- rails
    const railParts = [];
    for (const side of [-1, 1]) {
      const cp = [];
      for (let z = -L / 2 + 0.6; z <= L / 2 - 0.2; z += 1.0) cp.push(new THREE.Vector3(side * (hullHalfWidth(z) - 0.12), 1.0, z));
      railParts.push(colored(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cp), 40, 0.07, 5), 0x5a3a20));
      for (let z = -L / 2 + 1.5; z <= L / 2 - 0.5; z += 2.0) {
        railParts.push(colored(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 5), 0x5a3a20, { pos: [side * (hullHalfWidth(z) - 0.12), 0.5, z] }));
      }
    }
    railParts.push(colored(new THREE.BoxGeometry(hullHalfWidth(L / 2) * 2 - 0.2, 0.14, 0.14), 0x5a3a20, { pos: [0, 1.0, L / 2 - 0.15] }));
    const rails = new THREE.Mesh(merge(railParts), flatMat);
    rails.castShadow = true;
    v.add(rails);

    // ---- mast & sail
    const mast = merge([
      colored(new THREE.CylinderGeometry(0.2, 0.28, 13, 8), 0x6a4a2a, { pos: [0, 6.5, -4] }),
      colored(new THREE.CylinderGeometry(0.1, 0.1, 6, 6), 0x6a4a2a, { pos: [0, 5.5, -4], rot: [0, 0, Math.PI / 2] }),
    ]);
    const mastM = new THREE.Mesh(mast, flatMat); mastM.castShadow = true;
    v.add(mastM);
    this.boxes.push({ min: new THREE.Vector3(-0.32, 0, -4.32), max: new THREE.Vector3(0.32, 13, -3.68) });
    const sailG = new THREE.PlaneGeometry(5.6, 4.6, 6, 4);
    const sp = sailG.attributes.position;
    for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), y = sp.getY(i); sp.setZ(i, (1 - (x / 2.8) ** 2) * 0.7 * (1 - ((y) / 2.3) ** 2 * 0.3)); }
    sailG.computeVertexNormals();
    this.sailMat = new THREE.MeshStandardMaterial({ color: 0xf3e6cf, roughness: 0.9, side: THREE.DoubleSide });
    this.sail = new THREE.Mesh(sailG, this.sailMat);
    this.sail.position.set(0, 3.0, -3.7); this.sail.castShadow = true;
    v.add(this.sail);

    // ---- balloon envelope
    const bg = new THREE.SphereGeometry(1, 40, 20);
    bg.scale(5.2, 4.6, 13);
    this.balloonGeo = bg;
    bg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(bg.attributes.position.count * 3), 3));
    this.balloon = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 }));
    this.balloon.position.set(0, 13.2, 0.5);
    this.balloon.castShadow = true;
    v.add(this.balloon);
    this.raycastMeshes.push(this.balloon);
    this.finMat = new THREE.MeshStandardMaterial({ color: 0xd9483b, roughness: 0.6, side: THREE.DoubleSide });
    const fins = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.2, 3.4), this.finMat);
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      fin.position.set(Math.cos(a) * 2.2, Math.sin(a) * 2.2, 0);
      fin.rotation.z = a - Math.PI / 2;
      fins.add(fin);
    }
    fins.position.set(0, 13.2, 12.2);
    v.add(fins);
    // band around the balloon
    const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 40), new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.6, roughness: 0.3 }));
    band.scale.set(5.25, 4.65, 1); band.position.set(0, 13.2, 0.5);
    v.add(band);
    // rigging
    const rp = [];
    for (const z of [-7, -1.5, 4, 9]) for (const side of [-1, 1]) {
      const w = hullHalfWidth(z) - 0.15;
      rp.push(side * w, 1.0, z, side * 3.6, 10.0, z * 0.95 + 0.5);
    }
    const rig = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)), new THREE.LineBasicMaterial({ color: 0x3a2a1a }));
    v.add(rig);

    // ---- engines & propellers
    this.props = [];
    this.engineGlows = [];
    for (const side of [-1, 1]) {
      const nac = new THREE.Mesh(merge([
        colored(new THREE.CylinderGeometry(0.55, 0.75, 3, 10), 0x6a6a72, { rot: [Math.PI / 2, 0, 0] }),
        colored(new THREE.CylinderGeometry(0.8, 0.8, 0.3, 10), 0xd9a441, { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 1.2] }),
        colored(new THREE.BoxGeometry(1.6, 0.2, 0.6), 0x5a3a20, { pos: [-side * 0.9, 0.3, 0] }),
      ]), flatMat);
      nac.position.set(side * 4.1, -0.3, 8);
      nac.castShadow = true;
      v.add(nac);
      const prop = new THREE.Group();
      for (let b = 0; b < 3; b++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.9, 0.08), new THREE.MeshStandardMaterial({ color: 0x4a3220 }));
        blade.position.y = 0.9; const piv = new THREE.Group(); piv.rotation.z = (b / 3) * Math.PI * 2; piv.add(blade); prop.add(piv);
      }
      prop.position.set(side * 4.1, -0.3, 9.7);
      v.add(prop);
      this.props.push(prop);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), glowMat.clone());
      glow.position.set(side * 4.1, -0.3, 9.55);
      v.add(glow);
      this.engineGlows.push(glow);
    }
    // ---- lanterns
    for (const p of [[0, 1.4, -11.4], [2.4, 1.5, 11.6], [-2.4, 1.5, 11.6], [0, 13.2, -4]]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lanternMat);
      l.position.set(...p); v.add(l);
    }
    // deck light for nights
    this.deckLight = new THREE.PointLight(0xffb070, 0, 30, 1.6);
    this.deckLight.position.set(0, 4, 2);
    v.add(this.deckLight);

    // ---- helm
    const helm = new THREE.Group();
    const wheel = new THREE.Mesh(merge([
      colored(new THREE.TorusGeometry(0.62, 0.06, 6, 20), 0x6a4a2a),
      ...[0, 1, 2, 3].map((i) => colored(new THREE.BoxGeometry(1.5, 0.07, 0.07), 0x6a4a2a, { rot: [0, 0, (i / 4) * Math.PI] })),
    ]), flatMat);
    wheel.position.set(0, 1.35, 0);
    this.wheel = wheel;
    const stand = new THREE.Mesh(colored(new THREE.BoxGeometry(0.4, 1.2, 0.4), 0x5a3a20, { pos: [0, 0.6, 0.15] }), flatMat);
    helm.add(wheel, stand);
    helm.position.set(0, 0, 9.4);
    v.add(helm);
    this.helmPos = new THREE.Vector3(0, 0, 10.4);
    this.boxes.push({ min: new THREE.Vector3(-0.25, 0, 9.35), max: new THREE.Vector3(0.25, 1.2, 9.85) });

    // ---- workbench
    const bench = new THREE.Mesh(merge([
      colored(new THREE.BoxGeometry(1.8, 0.9, 0.9), 0x7a5532, { pos: [0, 0.45, 0] }),
      colored(new THREE.BoxGeometry(0.5, 0.35, 0.3), 0x4a4a52, { pos: [0.4, 1.05, 0] }),
      colored(new THREE.BoxGeometry(0.2, 0.5, 0.2), 0x4a4a52, { pos: [0.4, 0.85, 0] }),
      colored(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 5), 0x8a6a42, { pos: [-0.4, 1.0, 0.1], rot: [0, 0, 0.6] }),
      colored(new THREE.BoxGeometry(0.3, 0.15, 0.3), 0xd9a441, { pos: [-0.5, 0.97, -0.2] }),
    ]), flatMat);
    bench.position.set(2.1, 0, 4.5); bench.rotation.y = Math.PI / 2;
    bench.castShadow = true;
    v.add(bench);
    this.benchPos = new THREE.Vector3(1.2, 0, 4.5);
    this.boxes.push({ min: new THREE.Vector3(1.65, 0, 3.6), max: new THREE.Vector3(2.55, 0.9, 5.4) });

    this.applyPaint();
  }

  applyPaint() {
    const p = PAINTS[this.G.save.paint] || PAINTS[0];
    const c = new THREE.Color(p.color), a = new THREE.Color(p.accent);
    const pos = this.balloonGeo.attributes.position, colA = this.balloonGeo.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / 5.2, y = pos.getY(i) / 4.6, z = pos.getZ(i) / 13;
      const ang = Math.atan2(y, x);
      const gore = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 10) % 2;
      let cc = gore ? c : a;
      if (Math.abs(z) > 0.93) cc = c;
      colA.setXYZ(i, cc.r, cc.g, cc.b);
    }
    colA.needsUpdate = true;
    this.finMat.color.copy(c);
    this.sailMat.color.copy(a).lerp(new THREE.Color(0xffffff), 0.3);
  }

  deckHalf(z) { return hullHalfWidth(z) - 0.3; }

  // Highest local walkable surface <= ly + tol at local (lx, lz), or null.
  surfaceAt(lx, lz, ly = 0, tol = 0.6) {
    let best = null;
    const lim = ly + tol;
    if (lz > -L / 2 + 0.5 && lz < L / 2 - 0.1 && Math.abs(lx) < this.deckHalf(lz)) best = 0;
    if (this.wings && Math.abs(lx) >= 2.5 && Math.abs(lx) < 7.9 && lz > -5.2 && lz < 8) best = 0;
    if (best !== null && best > lim) best = null;
    for (const b of this.boxes) {
      if (lx > b.min.x && lx < b.max.x && lz > b.min.z && lz < b.max.z && b.max.y <= lim && (best === null || b.max.y > best)) best = b.max.y;
    }
    if (this.lookout && Math.hypot(lx, lz + 4) < 1.9 && 9.2 <= lim && (best === null || 9.2 > best)) best = 9.2;
    return best;
  }

  buildWings() {
    if (this.wings) return;
    this.wings = true;
    const parts = [];
    for (const side of [-1, 1]) {
      parts.push(colored(new THREE.BoxGeometry(5.4, 0.35, 13.2), 0xb88a55, { pos: [side * 5.2, -0.175, 1.4] }));
      parts.push(colored(new THREE.BoxGeometry(0.3, 0.3, 13.2), 0x5a3a20, { pos: [side * 7.85, 1.0, 1.4] }));
      for (let z = -4.8; z <= 7.8; z += 2.1) {
        parts.push(colored(new THREE.CylinderGeometry(0.06, 0.06, 1, 5), 0x5a3a20, { pos: [side * 7.85, 0.5, z] }));
        parts.push(colored(new THREE.CylinderGeometry(0.09, 0.09, 4.5, 5), 0x5a3a20, { pos: [side * 5.2, -1.6, z], rot: [0, 0, side * 1.0] }));
      }
    }
    const m = new THREE.Mesh(merge(parts), flatMat);
    m.castShadow = true; m.receiveShadow = true;
    this.visual.add(m);
    this.raycastMeshes.push(m);
    // outer rail as a collider (walk-blocking), can still be jumped
    for (const side of [-1, 1]) this.boxes.push({ min: new THREE.Vector3(side > 0 ? 7.7 : -8.0, 0, -5.2), max: new THREE.Vector3(side > 0 ? 8.0 : -7.7, 1.0, 8), rail: true });
  }

  addCabin(slot, color, name) {
    this.buildWings();
    const side = slot % 2 ? 1 : -1;
    const z = -3.4 + Math.floor(slot / 2) * 3.2;
    const x = side * 6.3;
    const parts = [
      colored(new THREE.BoxGeometry(2.4, 2.4, 2.6), 0xe8dcc0, { pos: [0, 1.2, 0] }),
      colored(new THREE.BoxGeometry(2.5, 0.25, 2.7), 0x7a5532, { pos: [0, 0.12, 0] }),
      colored(new THREE.CylinderGeometry(1.75, 1.75, 2.9, 3), color, { pos: [0, 2.9, 0], rot: [Math.PI / 2, 0, Math.PI / 2], scale: [1, 1, 0.55] }),
      colored(new THREE.BoxGeometry(0.1, 1.5, 0.9), 0x6a4a2a, { pos: [-side * 1.22, 0.75, 0.5] }),
    ];
    const cab = new THREE.Mesh(merge(parts), flatMat);
    cab.position.set(x, 0, z);
    cab.castShadow = true; cab.receiveShadow = true;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.6), lanternMat);
    win.position.set(x - side * 1.21, 1.6, z - 0.6); win.rotation.y = -side * Math.PI / 2;
    this.visual.add(cab, win);
    this.raycastMeshes.push(cab);
    this.boxes.push({ min: new THREE.Vector3(x - 1.2, 0, z - 1.3), max: new THREE.Vector3(x + 1.2, 2.4, z + 1.3) });
    this.cabins.push(cab);
    return new THREE.Vector3(side * 4.3, 0, z);
  }

  buildGarden() {
    if (this.garden) return;
    this.garden = true;
    const parts = [colored(new THREE.BoxGeometry(2.6, 0.5, 2.2), 0x6a4a2a, { pos: [0, 0.25, -8] }), colored(new THREE.BoxGeometry(2.4, 0.1, 2.0), 0x4a3220, { pos: [0, 0.5, -8] })];
    for (let i = 0; i < 9; i++) {
      const x = -0.9 + (i % 3) * 0.9, z = -8.7 + Math.floor(i / 3) * 0.7;
      parts.push(colored(new THREE.IcosahedronGeometry(0.35, 0), i % 2 ? 0x4aa640 : 0x6cc650, { pos: [x, 0.85, z], jitter: 0.2 }));
    }
    const g = new THREE.Mesh(merge(parts), flatMat); g.castShadow = true;
    this.visual.add(g);
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff7a3a, emissive: 0xff5a1a, emissiveIntensity: 1.5 }));
      f.position.set(-0.8 + i * 0.4, 1.05, -8 + Math.sin(i) * 0.5);
      this.visual.add(f);
    }
    this.boxes.push({ min: new THREE.Vector3(-1.3, 0, -9.1), max: new THREE.Vector3(1.3, 0.5, -6.9) });
  }

  buildLookout() {
    if (this.lookout) return;
    this.lookout = true;
    const g = merge([
      colored(new THREE.CylinderGeometry(1.9, 1.6, 0.35, 12), 0x7a5532, { pos: [0, 9.02, -4] }),
      colored(new THREE.TorusGeometry(1.85, 0.07, 5, 20), 0x5a3a20, { pos: [0, 10.0, -4], rot: [Math.PI / 2, 0, 0] }),
    ]);
    const m = new THREE.Mesh(g, flatMat); m.castShadow = true;
    this.visual.add(m);
    this.raycastMeshes.push(m);
  }

  // ctrl: {throttle:-1..1, turn:-1..1, lift:-1..1, boost:bool} or null when nobody is at the helm
  update(dt, ctrl) {
    const G = this.G;
    this.root.updateMatrixWorld();
    this.prevMatrix.copy(this.root.matrixWorld);
    const prevYaw = this.yaw;
    const lvl = G.save.upg.engine;
    let maxSpeed = ENGINE_SPEED[lvl - 1];
    let boosting = false;
    if (ctrl && ctrl.boost && G.save.questDone.includes('pip') && this.boostFuel > 0.02) {
      boosting = true; maxSpeed *= 1.7; this.boostFuel = Math.max(0, this.boostFuel - dt * 0.25);
    } else this.boostFuel = Math.min(1, this.boostFuel + dt * 0.12);
    this.boosting = boosting;
    let turn = 0, lift = 0;
    if (ctrl) {
      this.autopilot = null;
      this.throttle = clamp(this.throttle + ctrl.throttle * dt * 0.8, -0.35, 1);
      turn = ctrl.turn; lift = ctrl.lift;
    } else if (this.autopilot) {
      const ap = this.autopilot;
      const to = ap.clone().sub(this.pos);
      const dist = Math.hypot(to.x, to.z);
      const desired = Math.atan2(-to.x, -to.z);
      let dyaw = desired - this.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      turn = clamp(-dyaw * 2, -1, 1);
      this.throttle = dist > 12 ? clamp(dist / 60, 0.25, 1) * (Math.abs(dyaw) < 1 ? 1 : 0.3) : 0;
      lift = clamp((ap.y - this.pos.y) / 6, -1, 1);
      if (dist < 12 && Math.abs(ap.y - this.pos.y) < 2) { this.autopilot = null; G.ui.toast('⚓ Your ship has arrived', 2); }
    } else {
      this.throttle = damp(this.throttle, 0, 1.5, dt);
    }
    const target = this.throttle * maxSpeed;
    this.speed = damp(this.speed, target, boosting ? 2 : 0.9, dt);
    const turnScale = 0.35 + 0.65 * Math.min(1, Math.abs(this.speed) / 12);
    this.yawRate = damp(this.yawRate, -turn * 0.7 * turnScale, 3, dt);
    this.yaw += this.yawRate * dt;
    this.vy = damp(this.vy, lift * 10, 2.2, dt);
    const f = this.forward();
    const wind = G.world.wind;
    const vel = f.multiplyScalar(this.speed);
    vel.y = this.vy;
    // wind pushes a ship under way; a parked ship drops anchor and holds position
    const underWay = !!ctrl || !!this.autopilot;
    if (underWay) { vel.x += wind.x * 0.4; vel.z += wind.z * 0.4; }
    // range limit: violent storm winds outside the engine's reach
    const inStorm = G.storm && G.storm.active;
    const rd = Math.hypot(this.pos.x, this.pos.z);
    this.outOfRange = 0;
    if (!inStorm && rd > this.range) {
      this.outOfRange = rd - this.range;
      const push = Math.min(30, 6 + this.outOfRange * 0.4);
      vel.x -= (this.pos.x / rd) * push; vel.z -= (this.pos.z / rd) * push;
      this.damage(dt * 4, true);
    }
    this.vel = vel;
    this.pos.addScaledVector(vel, dt);
    // altitude limits
    const top = inStorm ? G.storm.origin.y + 140 : 130;
    if (this.pos.y > top) { this.pos.y = top; this.vy = Math.min(this.vy, 0); }
    if (inStorm && this.pos.y < G.storm.origin.y - 110) { this.pos.y = G.storm.origin.y - 110; this.vy = Math.max(this.vy, 0); }
    if (!inStorm && this.pos.y < SEA_Y + 10) {
      const onRift = G.storm && G.storm.riftUnder(this.pos);
      if (!onRift) {
        this.pos.y = SEA_Y + 10; this.vy = Math.max(0, this.vy);
        if (lift < 0 && ctrl) { this.damage(dt * 6, true); if (Math.random() < dt * 2) G.ui.toast('The Storm tears at your hull — find a Rift to dive', 2, 'warn'); }
      }
    }
    // island collisions
    for (const isl of G.islands.near(this.pos, 30)) this.collideIsland(isl);
    // visual tilt + parts
    this.visual.rotation.z = clamp(this.yawRate * 0.35, -0.12, 0.12) + Math.sin(G.time * 0.8) * 0.012;
    this.visual.rotation.x = clamp(-this.vy * 0.01 + (target - this.speed) * -0.002, -0.08, 0.08) + Math.sin(G.time * 0.6) * 0.008;
    this.root.rotation.y = this.yaw;
    const spin = (0.6 + Math.abs(this.throttle) * 14 + (boosting ? 10 : 0)) * dt;
    this.props.forEach((p) => { p.rotation.z += spin; });
    this.engineGlows.forEach((g) => { g.material.opacity = 0.3 + Math.abs(this.throttle) * 0.6 + (boosting ? 0.4 : 0); g.scale.setScalar(1 + (boosting ? 0.5 : 0) + Math.random() * 0.1); });
    if (boosting && G.particles) for (const side of [-1, 1]) {
      const p = new THREE.Vector3(side * 4.1, -0.3, 10).applyMatrix4(this.root.matrixWorld);
      G.particles.add.emit({ x: p.x, y: p.y, z: p.z, vx: -this.vel.x * 0.2, vy: 0, vz: -this.vel.z * 0.2, color: [1, 0.7, 0.3], color2: [1, 0.2, 0.05], size: 1.4, size1: 0.2, life: 0.4 });
    }
    this.wheel.rotation.z = -this.yawRate * 3;
    this.deckLight.intensity = G.world.isNight() || inStorm ? 60 : 0;
    this.sail.scale.z = 1 + Math.sin(G.time * 2) * 0.08 + G.world.windStrength * 0.03;
    // regen hull out of storm
    if (!inStorm && this.outOfRange === 0) this.hp = Math.min(this.maxHp, this.hp + dt * 3);
    this.root.updateMatrixWorld();
    this.delta.copy(this.root.matrixWorld).multiply(new THREE.Matrix4().copy(this.prevMatrix).invert());
    this.deltaYaw = this.yaw - prevYaw;
  }

  collideIsland(isl) {
    const lx = this.pos.x - isl.pos.x, lz = this.pos.z - isl.pos.z;
    const rad = Math.hypot(lx, lz) || 0.001;
    const er = isl.edgeR(Math.atan2(lz, lx));
    const shipR = 9;
    const u = (rad - shipR * 0.6) / er;
    if (u >= 1.05) return;
    const top = isl.pos.y + isl.topHu(lx, lz, Math.max(0, u));
    const bottom = isl.pos.y + isl.undersideAt(Math.max(0, rad / er));
    const keel = this.pos.y - 3.6;
    if (keel > top - 2.5) {
      if (keel < top + 0.3 && u < 1) {
        this.pos.y = top + 3.9;
        this.vy = Math.max(0, this.vy);
        if (Math.abs(this.speed) > 14) { this.damage(Math.abs(this.speed) * 0.4); this.speed *= 0.4; this.G.cameraShake = 0.5; this.G.audio.play('thud'); }
      }
    } else if (this.pos.y + 14 > bottom) {
      const push = (1.05 - u) * er;
      this.pos.x += (lx / rad) * push; this.pos.z += (lz / rad) * push;
      if (Math.abs(this.speed) > 10) { this.damage(Math.abs(this.speed) * 0.5); this.G.cameraShake = 0.6; this.G.audio.play('thud'); }
      this.speed *= 0.3;
    }
  }

  damage(n, quiet) {
    const G = this.G;
    this.hp = Math.max(0, this.hp - n);
    if (!quiet) { G.ui.flashHull(); }
    if (this.hp <= 0 && G.storm && G.storm.active) G.storm.end('wrecked');
    if (this.hp <= 0 && !(G.storm && G.storm.active)) {
      // out of range or rammed: pull back to safety
      this.hp = this.maxHp * 0.3;
      const r = Math.hypot(this.pos.x, this.pos.z) || 1;
      if (r > this.range) { this.pos.x *= (this.range - 40) / r; this.pos.z *= (this.range - 40) / r; }
      G.ui.toast('Your hull buckled — the crew limped back to calmer skies', 3, 'warn');
    }
  }

  // world-space position of a local deck point
  toWorld(local, out = new THREE.Vector3()) { return out.copy(local).applyMatrix4(this.root.matrixWorld); }
}
