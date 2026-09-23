/**
 * WEAPON MODELS
 * ------------------------------------------------------------------
 * A weapon's silhouette is derived from its data record, not hand-made:
 * class and mode pick the family, size picks the scale, damage per shot
 * sets the bore. Two weapons with similar stats look similar, which is
 * exactly what a player needs to read an enemy loadout at a glance.
 *
 * Each family is built the way the real thing would be put together --
 * a receiver, a barrel with a jacket and a brake, a feed, a mount -- because
 * a gun that is one tube on a box reads as a toy however well it is lit.
 *
 *   autocannon   receiver, cooling jacket, muzzle brake, box magazine + chute
 *   machine gun  twin or quad ventilated barrels, belt box
 *   rotary       spinning barrel cluster between collars, motor drum, drum mag
 *   scatter      short bore with a flared choke, pump slide, shell box
 *   rail/gauss   twin conductor rails around a glowing coil stack, capacitors
 *   laser        painted housing, heat-sink fins, focusing rings, lit lens
 *   PPC/plasma   fat barrel wrapped in glowing coils, three-prong emitter
 *   beam         long lens tube with a lit slit
 *   flamer       nozzle, fuel tank, pilot light
 *   launchers    armoured pod, tube grid with dark bores and lit rims
 *   support      scope, dish, bay or chute depending on the job
 */
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng } from '../core/rng.js';

const SIZE_SCALE = { S: 0.62, M: 0.85, L: 1.12, XL: 1.45 };

const cache = new Map();
function g(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

const r3 = (v) => Math.round(v * 1000) / 1000;
function box(w, h, d) { return g(`b${r3(w)},${r3(h)},${r3(d)}`, () => new THREE.BoxGeometry(w, h, d)); }
function cyl(rt, rb, h, s = 12) { return g(`c${r3(rt)},${r3(rb)},${r3(h)},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s)); }
/** Eight-sided prism: a machined block with its corners broken. */
function chamfer(w, h, d) {
  return g(`ch${r3(w)},${r3(h)},${r3(d)}`, () => {
    const geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1);
    geo.rotateY(Math.PI / 8);
    geo.rotateX(Math.PI / 2);                       // long axis along Z
    const k = 1 / Math.cos(Math.PI / 8);
    geo.scale(w * 0.5 * k * 0.97, h * 0.5 * k * 0.97, d);
    geo.computeVertexNormals();
    return geo;
  });
}
function torus(r, t, seg = 14) { return g(`t${r3(r)},${r3(t)},${seg}`, () => new THREE.TorusGeometry(r, t, 6, seg)); }

const Z = [Math.PI / 2, 0, 0];        // rotate a Y-up cylinder to point down the barrel

/**
 * @returns {{group:THREE.Group, muzzle:THREE.Object3D, kind:string}}
 */
export function buildWeaponModel(w, mats, scaleRef) {
  const group = new THREE.Group();
  // Scale against the chassis's own torso width so a gun looks proportionate
  // on a 20-ton Locust and on a 100-ton Atlas alike.
  const S = SIZE_SCALE[w.size] * (scaleRef ? scaleRef.w * 0.38 : 1);
  const rng = makeRng(hash(w.id));
  const bore = Math.min(0.34, 0.09 + (w.dmg / 320)) * S;
  const flags = w.flags || [];
  const muzzle = new THREE.Object3D();
  let kind = 'barrel';

  const M = {
    dark: mats.dark,
    trim: mats.trim,
    paint: mats.hull,
    paint2: mats.hull2 || mats.hull,
    glow: mats.accent,
  };

  // Parts are accumulated per material and merged at the end. A missile
  // launcher is twenty tubes; emitting twenty meshes per weapon per mech is
  // how a scene quietly ends up with two thousand draw calls.
  const batches = new Map();
  const add = (geo, mat, pos, rot, scale) => {
    const part = geo.clone();
    const m4 = new THREE.Matrix4().compose(
      new THREE.Vector3(...(pos || [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot || [0, 0, 0]))),
      new THREE.Vector3(...(scale || [1, 1, 1])),
    );
    part.applyMatrix4(m4);
    if (!part.attributes.uv) {
      part.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(part.attributes.position.count * 2), 2));
    }
    let list = batches.get(mat);
    if (!list) { list = []; batches.set(mat, list); }
    list.push(part);
    return part;
  };

  /** Emit a mesh that must stay independent (it animates or glows). */
  const addLive = (geo, mat, pos, rot, parent = group) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    if (pos) m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    parent.add(m);
    return m;
  };

  /* ---- shared pieces ------------------------------------------------ */

  /** A barrel along +Z from z0, with a jacket of rings over its breech end. */
  const barrel = (r, z0, len, { jacket = 0.45, rings = 5, mat = M.trim, x = 0, y = 0 } = {}) => {
    add(cyl(r, r * 0.94, len, 12), mat, [x, y, z0 + len / 2], Z);
    const jl = len * jacket;
    for (let i = 0; i < rings; i++) {
      add(cyl(r * 1.45, r * 1.45, len * 0.035, 12), M.dark, [x, y, z0 + len * 0.06 + (i / Math.max(1, rings - 1)) * jl], Z);
    }
  };

  /** Muzzle brake: a slotted block at the tip. */
  const brake = (r, z, x = 0, y = 0) => {
    add(chamfer(r * 3.0, r * 2.4, r * 2.2), M.dark, [x, y, z]);
    // Side ports: the gaps the gas comes out of.
    add(box(r * 3.3, r * 0.5, r * 0.34), M.trim, [x, y, z - r * 0.35]);
    add(box(r * 3.3, r * 0.5, r * 0.34), M.trim, [x, y, z + r * 0.35]);
  };

  /** Receiver: the machined body the barrel screws into. */
  const receiver = (w0, h0, d0, z) => {
    add(chamfer(w0, h0, d0), M.dark, [0, 0, z]);
    // Painted top cover and a spine rail, so it picks up the mech's colours.
    add(box(w0 * 0.86, h0 * 0.18, d0 * 0.9), M.paint2, [0, h0 * 0.52, z]);
    add(box(w0 * 0.2, h0 * 0.12, d0 * 0.8), M.trim, [0, h0 * 0.66, z]);
    // Side ribs.
    for (let i = -1; i <= 1; i += 2) {
      add(box(w0 * 0.08, h0 * 0.62, d0 * 0.7), M.trim, [i * w0 * 0.52, 0, z]);
    }
  };

  /** Box magazine with a feed chute running into the receiver. */
  const magazine = (z, big = false) => {
    const mw = S * (big ? 0.52 : 0.4), mh = S * (big ? 0.62 : 0.48), md = S * (big ? 0.7 : 0.52);
    add(chamfer(mw, mh, md), M.paint, [S * 0.62, -S * 0.12, z]);
    add(box(mw * 1.04, mh * 0.12, md * 1.04), M.dark, [S * 0.62, mh * 0.34 - S * 0.12, z]);
    add(cyl(S * 0.07, S * 0.07, S * 0.36, 8), M.dark, [S * 0.34, S * 0.08, z], [0, 0, Math.PI / 2 - 0.5]);
  };

  /** The mount: a clamp and a trunnion so the gun is visibly held on. */
  const mount = (z) => {
    add(cyl(S * 0.16, S * 0.16, S * 0.62, 10), M.dark, [0, -S * 0.34, z], [0, 0, Math.PI / 2]);
    add(box(S * 0.3, S * 0.26, S * 0.3), M.trim, [0, -S * 0.28, z]);
  };

  /* ---- families ----------------------------------------------------- */

  if (w.cls === 'ballistic' && flags.includes('pierce')) {
    // Rail / gauss: two conductor rails either side of a lit coil stack,
    // a capacitor bank behind, and a scope, because this is a sniper gun.
    kind = 'rail';
    const len = S * (flags.includes('shred') ? 3.4 : flags.includes('overpen') ? 2.9 : 2.3);
    receiver(S * 0.8, S * 0.7, S * 1.1, -S * 0.2);
    // Capacitor bank: three cells with a charge strip.
    for (let i = -1; i <= 1; i++) {
      add(cyl(S * 0.13, S * 0.13, S * 0.62, 10), M.paint, [i * S * 0.24, -S * 0.38, -S * 0.36], Z);
    }
    add(box(S * 0.62, S * 0.05, S * 0.5), M.glow, [0, -S * 0.2, -S * 0.34]);
    // Rails.
    for (let i = -1; i <= 1; i += 2) {
      add(box(S * 0.09, S * 0.3, len), M.trim, [i * bore * 1.7, 0, len / 2]);
      add(box(S * 0.05, S * 0.36, len * 0.9), M.dark, [i * bore * 2.3, 0, len * 0.48]);
    }
    // The coil stack: the glowing heart you can see between the rails.
    const coils = Math.round(len / (S * 0.24));
    for (let i = 0; i < coils; i++) {
      add(torus(bore * 0.9, bore * 0.15, 12), M.glow, [0, 0, S * 0.2 + i * (len - S * 0.4) / coils], [0, 0, 0]);
    }
    add(cyl(bore * 0.5, bore * 0.5, len, 8), M.dark, [0, 0, len / 2], Z);
    // Top bracket + scope.
    add(box(S * 0.12, S * 0.18, S * 0.3), M.dark, [0, S * 0.5, S * 0.2]);
    add(cyl(S * 0.1, S * 0.1, S * 0.7, 10), M.dark, [0, S * 0.64, S * 0.25], Z);
    const scopeLens = addLive(cyl(S * 0.08, S * 0.08, S * 0.02, 10), M.glow, [0, S * 0.64, S * 0.61], Z);
    scopeLens.castShadow = false;
    // Muzzle cap tying the rails together.
    add(chamfer(bore * 5.2, S * 0.46, S * 0.16), M.dark, [0, 0, len]);
    mount(-S * 0.1);
    muzzle.position.set(0, 0, len + S * 0.1);

  } else if (w.cls === 'ballistic' && w.spinUp) {
    // Rotary: a real barrel cluster that spins up, held between collars,
    // driven by a motor drum, fed from a drum magazine.
    kind = 'rotary';
    const len = S * (w.opt > 280 ? 1.9 : 1.55);
    receiver(S * 0.78, S * 0.72, S * 0.8, -S * 0.3);
    add(cyl(S * 0.36, S * 0.36, S * 0.42, 14), M.dark, [0, 0, -S * 0.02], Z);      // motor
    add(torus(S * 0.36, S * 0.04, 16), M.trim, [0, 0, S * 0.18]);
    const cluster = new THREE.Group();
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      addLive(cyl(bore * 0.42, bore * 0.42, len, 8), M.trim,
        [Math.cos(a) * bore * 1.05, Math.sin(a) * bore * 1.05, len / 2], Z, cluster);
    }
    // Collars clamp the barrels at the breech, the middle and the muzzle.
    for (const t of [0.12, 0.55, 0.94]) {
      addLive(cyl(bore * 1.75, bore * 1.75, S * 0.08, 14), M.dark, [0, 0, len * t], Z, cluster);
    }
    addLive(cyl(bore * 0.35, bore * 0.35, len, 8), M.dark, [0, 0, len / 2], Z, cluster);
    group.add(cluster);
    group.userData.spinner = cluster;
    // Drum magazine: the unmistakable "this thing eats ammunition" shape.
    add(cyl(S * 0.36, S * 0.36, S * 0.34, 16), M.paint, [S * 0.62, -S * 0.1, -S * 0.3], [0, 0, Math.PI / 2]);
    add(torus(S * 0.36, S * 0.035, 16), M.dark, [S * 0.62 + S * 0.18, -S * 0.1, -S * 0.3], [0, Math.PI / 2, 0]);
    add(cyl(S * 0.06, S * 0.06, S * 0.4, 8), M.dark, [S * 0.34, S * 0.08, -S * 0.1], [0, 0, Math.PI / 2 - 0.4]);
    mount(-S * 0.3);
    muzzle.position.set(0, 0, len + S * 0.06);

  } else if (w.cls === 'ballistic' && (flags.includes('ams') || (w.rpm >= 600 && w.dmg < 12))) {
    // Machine gun / flak: two or four short ventilated barrels and a belt.
    kind = 'mg';
    const quad = flags.includes('ams');
    const len = S * (quad ? 1.1 : 1.3);
    receiver(S * 0.8, S * 0.58, S * 0.8, -S * 0.15);
    const offs = quad ? [[-1, 1], [1, 1], [-1, -1], [1, -1]] : [[-1, 0], [1, 0]];
    for (const [ox, oy] of offs) {
      const x = ox * bore * 1.5, y = oy * bore * 1.35;
      add(cyl(bore * 0.52, bore * 0.5, len, 10), M.trim, [x, y, len / 2], Z);
      // Ventilated jacket: a perforated sleeve over most of the barrel.
      add(cyl(bore * 0.8, bore * 0.8, len * 0.62, 10), M.dark, [x, y, len * 0.36], Z);
      for (let i = 0; i < 4; i++) {
        add(torus(bore * 0.8, bore * 0.09, 10), M.trim, [x, y, len * 0.1 + i * len * 0.16]);
      }
      add(cyl(bore * 0.68, bore * 0.6, S * 0.12, 10), M.dark, [x, y, len], Z);   // flash hider
    }
    // Belt box and a belt running into the feed.
    add(chamfer(S * 0.44, S * 0.52, S * 0.6), M.paint, [S * 0.6, -S * 0.08, -S * 0.2]);
    for (let i = 0; i < 5; i++) {
      add(box(S * 0.2, S * 0.05, S * 0.08), M.trim, [S * 0.36 - i * 0.02 * S, S * 0.12 + i * S * 0.03, -S * 0.2 + i * S * 0.07]);
    }
    mount(-S * 0.15);
    muzzle.position.set(0, 0, len + S * 0.1);

  } else if (w.cls === 'ballistic' && (w.pellets || 1) > 4) {
    // Scatter: short heavy bore, flared choke, pump slide, shell box.
    kind = 'scatter';
    const len = S * 1.25;
    receiver(S * 0.86, S * 0.72, S * 0.9, -S * 0.2);
    add(cyl(bore * 1.55, bore * 1.35, len, 14), M.trim, [0, 0, len / 2], Z);
    add(cyl(bore * 2.1, bore * 1.55, S * 0.22, 14), M.dark, [0, 0, len], Z);        // choke bell
    add(torus(bore * 2.05, bore * 0.16, 14), M.trim, [0, 0, len + S * 0.1]);
    // Pump slide under the barrel.
    add(chamfer(bore * 2.4, bore * 1.5, len * 0.42), M.paint2, [0, -bore * 2.1, len * 0.42]);
    for (let i = 0; i < 4; i++) add(box(bore * 2.5, bore * 0.18, S * 0.04), M.dark, [0, -bore * 2.1, len * 0.28 + i * S * 0.08]);
    // Shell box with the brass visible along its top.
    add(chamfer(S * 0.38, S * 0.46, S * 0.5), M.paint, [S * 0.6, -S * 0.1, -S * 0.2]);
    for (let i = 0; i < 4; i++) add(cyl(S * 0.05, S * 0.05, S * 0.3, 8), M.trim, [S * 0.5 + i * S * 0.07, S * 0.16, -S * 0.2], Z);
    mount(-S * 0.2);
    muzzle.position.set(0, 0, len + S * 0.18);

  } else if (w.cls === 'ballistic') {
    // Autocannon: the standard gun. Bigger calibre, longer barrel, bigger brake.
    kind = 'barrel';
    const heavy = w.dmg > 60;
    const len = S * (w.opt > 500 ? 2.5 : w.opt > 280 ? 2.0 : heavy ? 1.5 : 1.55);
    receiver(S * (heavy ? 1.0 : 0.82), S * (heavy ? 0.84 : 0.66), S * (heavy ? 1.2 : 1.0), -S * 0.2);
    // Recoil buffer cylinders either side of the barrel root.
    for (let i = -1; i <= 1; i += 2) {
      add(cyl(S * 0.07, S * 0.07, S * 0.7, 8), M.trim, [i * bore * 2.2, -bore * 0.6, S * 0.1], Z);
    }
    barrel(bore, S * 0.1, len, { jacket: heavy ? 0.35 : 0.5, rings: heavy ? 4 : 6 });
    brake(bore, len + S * 0.05);
    // A heat-shield plate along the top of the barrel.
    add(box(bore * 1.6, bore * 0.18, len * 0.5), M.paint2, [0, bore * 1.35, S * 0.1 + len * 0.3]);
    magazine(-S * 0.25, heavy);
    mount(-S * 0.2);
    muzzle.position.set(0, 0, len + S * 0.2);

  } else if (w.cls === 'energy' && w.mode === 'stream') {
    // Flamer: nozzle, fuel tank, pilot light.
    kind = 'flamer';
    const len = S * 0.95;
    receiver(S * 0.66, S * 0.56, S * 0.7, -S * 0.2);
    add(cyl(bore * 0.9, bore * 1.3, len, 12), M.dark, [0, 0, len / 2], Z);
    add(cyl(bore * 1.6, bore * 1.0, S * 0.16, 12), M.trim, [0, 0, len], Z);
    add(cyl(S * 0.22, S * 0.22, S * 0.8, 14), M.paint, [0, -S * 0.46, -S * 0.1], Z);            // tank
    add(torus(S * 0.22, S * 0.03, 14), M.trim, [0, -S * 0.46, S * 0.3]);
    add(cyl(S * 0.03, S * 0.03, S * 0.5, 6), M.dark, [0, -S * 0.22, S * 0.25], [Math.PI / 2 - 0.5, 0, 0]);
    const pilot = addLive(g('pl', () => new THREE.SphereGeometry(bore * 0.45, 8, 6)), M.glow, [0, -bore * 1.3, len + S * 0.02]);
    pilot.castShadow = false;
    group.userData.lens = pilot;
    mount(-S * 0.2);
    muzzle.position.set(0, 0, len + S * 0.12);

  } else if (w.cls === 'energy' && flags.includes('emp')) {
    // PPC / plasma / disruptor: a fat barrel wrapped in lit coils, ending in
    // three prongs. Nothing else on a battlefield looks like this.
    kind = 'ppc';
    const len = S * (w.opt > 500 ? 2.2 : 1.7);
    receiver(S * 0.96, S * 0.84, S * 1.1, -S * 0.25);
    add(cyl(bore * 1.3, bore * 1.15, len, 14), M.dark, [0, 0, len / 2], Z);
    const coils = 5;
    for (let i = 0; i < coils; i++) {
      add(torus(bore * 1.55, bore * 0.24, 16), M.glow, [0, 0, S * 0.2 + i * len * 0.15]);
      add(torus(bore * 1.62, bore * 0.1, 16), M.trim, [0, 0, S * 0.26 + i * len * 0.15]);
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      add(box(bore * 0.34, bore * 0.34, S * 0.5), M.trim,
        [Math.cos(a) * bore * 1.6, Math.sin(a) * bore * 1.6, len + S * 0.12], [0, 0, a]);
    }
    const lens = addLive(cyl(bore * 0.95, bore * 0.95, S * 0.05, 14), M.glow, [0, 0, len], Z);
    lens.castShadow = false;
    group.userData.lens = lens;
    // Cooling jacket vents on the sides of the receiver.
    for (let i = 0; i < 4; i++) {
      add(box(S * 1.02, S * 0.05, S * 0.12), M.trim, [0, -S * 0.1 + i * S * 0.12, -S * 0.25]);
    }
    mount(-S * 0.25);
    muzzle.position.set(0, 0, len + S * 0.28);

  } else if (w.cls === 'energy') {
    // Laser: a painted housing with heat-sink fins, a focusing tube with
    // rings, and a lens that glows. Pulse lasers carry twin tubes.
    kind = w.mode === 'beam' ? 'beam' : 'emitter';
    const twin = w.mode === 'auto';
    const len = S * (w.mode === 'beam' ? 1.9 : w.opt > 500 ? 1.8 : w.opt > 280 ? 1.5 : 1.15);
    // Housing: tapered and painted, so a laser reads as a precise instrument.
    add(chamfer(S * 0.78, S * 0.62, S * 1.1), M.paint2, [0, 0, -S * 0.15]);
    add(box(S * 0.82, S * 0.06, S * 1.0), M.trim, [0, S * 0.3, -S * 0.15]);
    const fins = Math.min(7, 3 + Math.round(w.heat / 4));
    for (let i = 0; i < fins; i++) {
      add(box(S * 0.9, S * 0.04, S * 0.16), M.dark, [0, S * 0.38 + (i % 2) * S * 0.02, -S * 0.55 + i * (S * 0.8 / fins)]);
      add(box(S * 0.04, S * 0.5, S * 0.16), M.dark, [S * 0.44, 0, -S * 0.55 + i * (S * 0.8 / fins)]);
    }
    const tubes = twin ? [-1, 1] : [0];
    for (const t of tubes) {
      const x = t * bore * 1.35;
      const r = twin ? bore * 0.72 : bore;
      add(cyl(r * 1.2, r * 0.9, len, 14), M.trim, [x, 0, len / 2], Z);
      for (let i = 0; i < 3; i++) add(torus(r * 1.25, r * 0.14, 14), M.dark, [x, 0, len * (0.3 + i * 0.22)]);
      add(cyl(r * 1.45, r * 1.25, S * 0.1, 14), M.dark, [x, 0, len], Z);
    }
    if (w.mode === 'beam') {
      // A lit slit along the tube: the beam's power is visible before it fires.
      add(box(bore * 0.3, bore * 0.2, len * 0.7), M.glow, [0, bore * 1.15, len * 0.45]);
    }
    const lens = addLive(cyl(bore * (twin ? 0.66 : 0.9), bore * (twin ? 0.66 : 0.9), S * 0.04, 14), M.glow,
      [twin ? -bore * 1.35 : 0, 0, len + S * 0.04], Z);
    lens.castShadow = false;
    group.userData.lens = lens;
    if (twin) addLive(cyl(bore * 0.66, bore * 0.66, S * 0.04, 14), M.glow, [bore * 1.35, 0, len + S * 0.04], Z).castShadow = false;
    mount(-S * 0.15);
    muzzle.position.set(0, 0, len + S * 0.1);

  } else if (w.cls === 'missile') {
    // Launchers: an armoured pod, a grid of tubes with dark bores and lit
    // rims, armour cheeks and a frame around the face.
    kind = 'launcher';
    const tubes = Math.min(20, w.pellets || 4);
    const arcing = flags.includes('arcing');
    const big = tubes <= 2 || (w.dmg > 60 && tubes <= 3);
    const cols = big ? tubes : Math.ceil(Math.sqrt(tubes * 1.6));
    const rows = Math.ceil(tubes / cols);
    const cell = big ? S * 0.5 : S * 0.24;
    const pw = cols * cell + S * 0.22, ph = rows * cell + S * 0.22, pd = S * (arcing ? 1.2 : 0.95);
    add(chamfer(pw, ph, pd), M.paint, [0, 0, 0]);
    // Face frame and a dark recess the tubes sit in.
    add(box(pw * 1.04, S * 0.06, S * 0.1), M.trim, [0, ph * 0.5, pd * 0.5]);
    add(box(pw * 1.04, S * 0.06, S * 0.1), M.trim, [0, -ph * 0.5, pd * 0.5]);
    add(box(pw * 0.94, ph * 0.9, S * 0.04), M.dark, [0, 0, pd * 0.5 - S * 0.01]);
    for (let i = 0; i < tubes; i++) {
      const cx = (i % cols - (cols - 1) / 2) * cell;
      const cy = (Math.floor(i / cols) - (rows - 1) / 2) * cell;
      add(cyl(cell * 0.4, cell * 0.4, S * 0.08, 10), M.dark, [cx, cy, pd * 0.52], Z);
      // A lit rim on each tube: loaded and live.
      add(torus(cell * 0.36, cell * 0.06, 10), M.glow, [cx, cy, pd * 0.56]);
    }
    // Armour cheeks and a sighting sensor.
    for (let i = -1; i <= 1; i += 2) add(chamfer(S * 0.12, ph * 1.08, pd * 1.02), M.paint2, [i * (pw * 0.5 + S * 0.05), 0, 0]);
    add(box(S * 0.2, S * 0.14, S * 0.2), M.dark, [pw * 0.3, ph * 0.5 + S * 0.08, pd * 0.3]);
    addLive(cyl(S * 0.05, S * 0.05, S * 0.02, 8), M.glow, [pw * 0.3, ph * 0.5 + S * 0.08, pd * 0.41], Z).castShadow = false;
    if (arcing) {
      // Indirect launchers tilt up and carry a hinged cover: reads at a glance.
      add(box(pw * 1.02, S * 0.05, pd * 0.5), M.paint2, [0, ph * 0.5 + S * 0.14, pd * 0.16], [-0.5, 0, 0]);
      group.rotation.x = -0.24;
    }
    mount(-S * 0.1);
    muzzle.position.set(0, 0, pd * 0.62);

  } else {
    // Support gear: what it is depends on what it does.
    kind = 'pod';
    if (flags.includes('tag')) {
      add(chamfer(S * 0.46, S * 0.4, S * 0.8), M.dark, [0, 0, 0]);
      add(cyl(S * 0.12, S * 0.14, S * 0.5, 12), M.trim, [0, 0, S * 0.5], Z);
      group.userData.lens = addLive(cyl(S * 0.1, S * 0.1, S * 0.02, 12), M.glow, [0, 0, S * 0.76], Z);
      muzzle.position.set(0, 0, S * 0.8);
    } else if (flags.includes('drone') || flags.includes('mine')) {
      add(chamfer(S * 0.9, S * 0.7, S * 0.9), M.paint, [0, 0, 0]);
      add(box(S * 0.7, S * 0.06, S * 0.7), M.dark, [0, S * 0.37, 0]);                 // hatch
      for (let i = -1; i <= 1; i += 2) add(box(S * 0.05, S * 0.08, S * 0.72), M.trim, [i * S * 0.3, S * 0.42, 0]);
      group.userData.lens = addLive(box(S * 0.5, S * 0.05, S * 0.02), M.glow, [0, S * 0.2, S * 0.46]);
      muzzle.position.set(0, S * 0.4, S * 0.3);
    } else if (flags.includes('ams')) {
      add(g(`dome${r3(S)}`, () => new THREE.SphereGeometry(S * 0.4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), M.paint, [0, 0, 0]);
      for (let i = -1; i <= 1; i += 2) add(cyl(S * 0.05, S * 0.05, S * 0.6, 8), M.trim, [i * S * 0.1, S * 0.24, S * 0.3], Z);
      muzzle.position.set(0, S * 0.24, S * 0.62);
    } else {
      // Repair beam, shield projector, EMP lance: an emitter dish.
      add(chamfer(S * 0.8, S * 0.8, S * 0.8), M.paint, [0, 0, 0]);
      const dish = new THREE.Mesh(
        g(`d${r3(S)}`, () => new THREE.SphereGeometry(S * 0.34, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
        M.glow,
      );
      dish.rotation.x = Math.PI / 2;
      dish.position.z = S * 0.42;
      group.add(dish);
      group.userData.lens = dish;
      for (let i = 0; i < 3; i++) add(box(S * 0.06, S * 0.5, S * 0.06), M.trim, [(i - 1) * S * 0.24, S * 0.56, 0]);
      add(torus(S * 0.38, S * 0.04, 16), M.trim, [0, 0, S * 0.44]);
      muzzle.position.set(0, 0, S * 0.7);
    }
  }

  // Flush the batches: at most one mesh per material.
  for (const [mat, geos] of batches) {
    if (!geos.length) continue;
    const merged = geos.length === 1 ? geos[0] : BGU.mergeGeometries(geos, false);
    if (geos.length > 1) geos.forEach(p => p.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = mat !== M.glow;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  group.add(muzzle);
  group.userData.kind = kind;
  // How far a shot kicks the gun back along its own axis. Heavy single shots
  // kick hard; a machine gun buzzes.
  group.userData.kick = S * (w.dmg > 60 ? 0.34 : w.dmg > 20 ? 0.22 : 0.1);
  return { group, muzzle, kind };
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
