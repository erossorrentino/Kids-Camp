/**
 * WEAPON MODELS
 * ------------------------------------------------------------------
 * A weapon's silhouette is derived from its data record, not hand-made:
 * class picks the family (barrel, emitter, launch cells, pod), size picks
 * the scale, and the damage-per-shot nudges bore diameter. Two weapons
 * with similar stats look similar, which is exactly what a player needs
 * to read an enemy loadout at a glance.
 */
import * as THREE from 'three';
import { makeRng } from '../core/rng.js';

const SIZE_SCALE = { S: 0.62, M: 0.85, L: 1.12, XL: 1.45 };

const cache = new Map();
function g(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

function box(w, h, d) { return g(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)); }
function cyl(rt, rb, h, s = 10) { return g(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s)); }

/**
 * @returns {{group:THREE.Group, muzzle:THREE.Object3D, kind:string}}
 */
export function buildWeaponModel(w, mats, scaleRef) {
  const group = new THREE.Group();
  const S = SIZE_SCALE[w.size] * (scaleRef ? scaleRef.w * 1.4 : 1);
  const rng = makeRng(hash(w.id));
  const bore = Math.min(0.42, 0.10 + (w.dmg / 260)) * S;
  const muzzle = new THREE.Object3D();
  let kind = 'barrel';

  const add = (geo, mat, pos, rot) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    if (pos) m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    group.add(m);
    return m;
  };

  if (w.cls === 'ballistic') {
    const len = S * (w.opt > 500 ? 2.3 : w.opt > 280 ? 1.75 : 1.2);
    add(box(S * 0.7, S * 0.62, S * 0.9), mats.dark, [0, 0, -S * 0.15]);
    if ((w.flags || []).includes('pierce')) {
      // Rail/gauss: coil rings along the rod.
      kind = 'rail';
      add(cyl(bore * 0.6, bore * 0.6, len, 8), mats.trim, [0, 0, len / 2], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 5; i++) {
        add(cyl(bore * 1.5, bore * 1.5, S * 0.12, 8), mats.accent, [0, 0, S * 0.3 + i * (len - S * 0.4) / 5], [Math.PI / 2, 0, 0]);
      }
    } else if (w.rpm > 350) {
      // Rotary: a visible barrel cluster.
      kind = 'rotary';
      const cluster = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const b = new THREE.Mesh(cyl(bore * 0.42, bore * 0.42, len, 6), mats.trim);
        b.rotation.x = Math.PI / 2;
        b.position.set(Math.cos(a) * bore * 0.9, Math.sin(a) * bore * 0.9, len / 2);
        b.castShadow = true;
        cluster.add(b);
      }
      group.add(cluster);
      group.userData.spinner = cluster;
      add(cyl(bore * 1.5, bore * 1.5, S * 0.2, 10), mats.dark, [0, 0, S * 0.1], [Math.PI / 2, 0, 0]);
    } else if ((w.pellets || 1) > 4) {
      kind = 'scatter';
      add(cyl(bore * 1.8, bore * 1.2, len, 10), mats.trim, [0, 0, len / 2], [Math.PI / 2, 0, 0]);
    } else {
      add(cyl(bore, bore * 0.92, len, 10), mats.trim, [0, 0, len / 2], [Math.PI / 2, 0, 0]);
      add(cyl(bore * 1.35, bore * 1.35, S * 0.16, 10), mats.dark, [0, 0, len * 0.72], [Math.PI / 2, 0, 0]);
    }
    // Ammo feed box reads as "this one runs out".
    if (w.ammo > 0) add(box(S * 0.42, S * 0.5, S * 0.55), mats.hull, [S * 0.5, -S * 0.1, -S * 0.2]);
    muzzle.position.set(0, 0, len + S * 0.06);

  } else if (w.cls === 'energy') {
    kind = 'emitter';
    const len = S * (w.mode === 'beam' ? 1.5 : 1.25);
    add(box(S * 0.72, S * 0.66, S * 1.0), mats.dark, [0, 0, -S * 0.1]);
    add(cyl(bore * 1.25, bore * 0.85, len, 12), mats.trim, [0, 0, len / 2], [Math.PI / 2, 0, 0]);
    // Focusing lens: the glowing bit.
    const lens = add(cyl(bore * 0.9, bore * 0.9, S * 0.08, 12), mats.accent, [0, 0, len], [Math.PI / 2, 0, 0]);
    group.userData.lens = lens;
    // Heat fins scale with how hot the gun runs.
    const fins = Math.min(6, 2 + Math.round(w.heat / 4));
    for (let i = 0; i < fins; i++) {
      add(box(S * 0.9, S * 0.05, S * 0.18), mats.hull, [0, S * 0.36, -S * 0.36 + i * S * 0.14]);
    }
    muzzle.position.set(0, 0, len + S * 0.08);

  } else if (w.cls === 'missile') {
    kind = 'launcher';
    const tubes = Math.min(20, w.pellets || 4);
    const cols = Math.ceil(Math.sqrt(tubes * 1.6));
    const rows = Math.ceil(tubes / cols);
    const cell = S * 0.24;
    add(box(cols * cell + S * 0.18, rows * cell + S * 0.18, S * 0.9), mats.hull, [0, 0, 0]);
    for (let i = 0; i < tubes; i++) {
      const cx = (i % cols - (cols - 1) / 2) * cell;
      const cy = (Math.floor(i / cols) - (rows - 1) / 2) * cell;
      add(cyl(cell * 0.4, cell * 0.4, S * 0.22, 6), mats.dark, [cx, cy, S * 0.46], [Math.PI / 2, 0, 0]);
    }
    if ((w.flags || []).includes('arcing')) {
      group.rotation.x = -0.22; // indirect launchers tilt up; it reads at a glance
    }
    muzzle.position.set(0, 0, S * 0.6);

  } else {
    kind = 'pod';
    add(box(S * 0.8, S * 0.8, S * 0.8), mats.hull);
    const dishGeo = g(`d${S}`, () => new THREE.SphereGeometry(S * 0.34, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2));
    const dish = new THREE.Mesh(dishGeo, mats.accent);
    dish.rotation.x = Math.PI / 2;
    dish.position.z = S * 0.42;
    dish.castShadow = true;
    group.add(dish);
    group.userData.lens = dish;
    for (let i = 0; i < 3; i++) {
      add(box(S * 0.08, S * 0.5, S * 0.08), mats.trim, [(i - 1) * S * 0.24, S * 0.52, 0]);
    }
    muzzle.position.set(0, 0, S * 0.7);
  }

  group.add(muzzle);
  group.userData.kind = kind;
  return { group, muzzle, kind };
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
