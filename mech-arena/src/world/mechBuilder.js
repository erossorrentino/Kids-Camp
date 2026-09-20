/**
 * PROCEDURAL MECH MODELS
 * ------------------------------------------------------------------
 * No imported art. Every machine is assembled from boxes, cylinders and
 * bevelled plates according to its chassis `build` block, then rigged
 * with a small skeleton the animator drives.
 *
 * Hierarchy produced:
 *   root
 *     legs
 *       hip
 *       legL: thigh -> shin -> foot     (knee direction depends on leg type)
 *       legR: ...
 *     torsoYaw            <- torso twist relative to the hips
 *       torsoPitch        <- aim elevation
 *         chassisMesh, cockpit, shoulders
 *         armL: upper -> lower -> mount
 *         armR: ...
 *   mounts: { LA, RA, LT, RT, CT, HD }  Object3D muzzle anchors
 *
 * Damage state is expressed by swapping section materials and by hiding
 * limbs that have been blown off.
 */
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { skinMaterials } from './skinTexture.js';
import { makeRng } from '../core/rng.js';

/* ---------- small geometry helpers ---------- */

const geoCache = new Map();
function box(w, h, d, key) {
  const k = key || `b${w}_${h}_${d}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(k);
}
function cyl(rt, rb, h, seg = 12) {
  const k = `c${rt}_${rb}_${h}_${seg}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.CylinderGeometry(rt, rb, h, seg));
  return geoCache.get(k);
}

/** A tapered plate: the basic armour panel shape used all over the mech. */
function plate(w, h, d, taper = 0.75) {
  const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > 0) { p.setX(i, p.getX(i) * taper); p.setZ(i, p.getZ(i) * taper); }
  }
  g.computeVertexNormals();
  return g;
}

/** Merge a list of {geo, pos, rot, scale} into one buffer geometry. */
function mergeParts(parts) {
  const geos = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const p of parts) {
    const g = p.geo.clone();
    e.set(p.rot?.[0] || 0, p.rot?.[1] || 0, p.rot?.[2] || 0);
    q.setFromEuler(e);
    m.compose(
      new THREE.Vector3(p.pos?.[0] || 0, p.pos?.[1] || 0, p.pos?.[2] || 0),
      q,
      new THREE.Vector3(p.scale?.[0] ?? 1, p.scale?.[1] ?? 1, p.scale?.[2] ?? 1),
    );
    g.applyMatrix4(m);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    geos.push(g);
  }
  const merged = BGU.mergeGeometries(geos, false);
  geos.forEach(g => g.dispose());
  return merged;
}

function mesh(geo, mat, castShadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = castShadow;
  m.receiveShadow = true;
  return m;
}

/* ---------- greebles: the surface detail that sells scale ---------- */
function greebleParts(w, h, d, rng, count = 10) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const face = rng.int(0, 3);
    const gw = rng.range(0.08, 0.3) * w;
    const gh = rng.range(0.06, 0.24) * h;
    const gd = rng.range(0.04, 0.12) * d + 0.03;
    const x = rng.range(-0.4, 0.4) * w;
    const y = rng.range(-0.4, 0.4) * h;
    const z = (face < 2 ? 1 : -1) * (d / 2 + gd / 2);
    if (face < 2) parts.push({ geo: box(gw, gh, gd * 2), pos: [x, y, z] });
    else parts.push({ geo: box(gd * 2, gh, gw), pos: [(rng.sign()) * (w / 2 + gd / 2), y, rng.range(-0.4, 0.4) * d] });
  }
  return parts;
}

/* ---------- torso shapes ---------- */

function buildTorso(style, S, rng) {
  const w = S.w, h = S.h, d = S.d;
  const parts = [];
  switch (style) {
    case 'slim':
      parts.push({ geo: plate(w * 0.82, h, d * 0.78, 0.82), pos: [0, 0, 0] });
      parts.push({ geo: box(w * 0.95, h * 0.24, d * 0.86), pos: [0, h * 0.30, 0] });
      break;
    case 'boxy':
      parts.push({ geo: box(w, h, d), pos: [0, 0, 0] });
      parts.push({ geo: box(w * 1.06, h * 0.2, d * 1.04), pos: [0, h * 0.36, 0] });
      parts.push({ geo: box(w * 0.7, h * 0.34, d * 0.4), pos: [0, -h * 0.1, d * 0.52] });
      break;
    case 'round':
      parts.push({ geo: cyl(w * 0.52, w * 0.46, h, 14), pos: [0, 0, 0] });
      parts.push({ geo: cyl(w * 0.56, w * 0.56, h * 0.16, 14), pos: [0, h * 0.34, 0] });
      break;
    case 'angular': {
      parts.push({ geo: plate(w, h * 0.7, d, 0.7), pos: [0, h * 0.12, 0] });
      parts.push({ geo: plate(w * 0.9, h * 0.42, d * 0.9, 1.5), pos: [0, -h * 0.3, 0] });
      parts.push({ geo: box(w * 0.34, h * 0.5, d * 0.34), rot: [0, Math.PI / 4, 0], pos: [0, h * 0.05, d * 0.46] });
      break;
    }
    case 'hunched':
      parts.push({ geo: plate(w, h * 0.9, d, 0.88), pos: [0, 0, -d * 0.08], rot: [0.22, 0, 0] });
      parts.push({ geo: box(w * 1.02, h * 0.3, d * 0.7), pos: [0, h * 0.34, -d * 0.24] });
      parts.push({ geo: box(w * 0.62, h * 0.3, d * 0.5), pos: [0, h * 0.05, d * 0.5] });
      break;
    case 'wide':
    default:
      parts.push({ geo: box(w * 1.2, h * 0.86, d), pos: [0, 0, 0] });
      parts.push({ geo: box(w * 1.3, h * 0.24, d * 1.05), pos: [0, h * 0.34, 0] });
      parts.push({ geo: plate(w * 0.9, h * 0.34, d * 0.5, 1.4), pos: [0, -h * 0.42, d * 0.2] });
      break;
  }
  parts.push(...greebleParts(w, h, d, rng, 14));
  return mergeParts(parts);
}

/* ---------- cockpit / head ---------- */

function buildCockpit(style, S, mats, rng) {
  const g = new THREE.Group();
  const s = S.w * 0.36;
  switch (style) {
    case 'visor': {
      g.add(mesh(box(s * 1.5, s * 0.7, s * 1.1), mats.dark));
      const vis = mesh(box(s * 1.36, s * 0.26, s * 0.16), mats.glass);
      vis.position.set(0, s * 0.06, s * 0.58);
      g.add(vis);
      break;
    }
    case 'dome': {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(s * 0.8, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), mats.glass);
      dome.castShadow = true;
      g.add(dome);
      g.add(mesh(cyl(s * 0.85, s * 0.9, s * 0.3, 14), mats.dark));
      break;
    }
    case 'sensor': {
      g.add(mesh(box(s * 1.2, s * 0.8, s * 1.0), mats.dark));
      for (let i = -1; i <= 1; i += 2) {
        const eye = mesh(cyl(s * 0.16, s * 0.16, s * 0.2, 10), mats.accent);
        eye.rotation.x = Math.PI / 2;
        eye.position.set(i * s * 0.34, s * 0.06, s * 0.55);
        g.add(eye);
      }
      const dish = mesh(cyl(s * 0.5, s * 0.1, s * 0.16, 12), mats.trim);
      dish.rotation.set(-0.7, 0, 0);
      dish.position.set(s * 0.6, s * 0.5, -s * 0.2);
      g.add(dish);
      break;
    }
    case 'skull': {
      g.add(mesh(plate(s * 1.5, s * 1.1, s * 1.2, 1.25), mats.dark));
      for (let i = -1; i <= 1; i += 2) {
        const eye = mesh(box(s * 0.34, s * 0.3, s * 0.12), mats.accent);
        eye.position.set(i * s * 0.36, s * 0.16, s * 0.6);
        g.add(eye);
      }
      const jaw = mesh(box(s * 1.0, s * 0.3, s * 0.7), mats.trim);
      jaw.position.set(0, -s * 0.48, s * 0.18);
      g.add(jaw);
      break;
    }
    case 'none':
      return g;
    case 'head':
    default: {
      g.add(mesh(box(s * 1.2, s * 1.0, s * 1.05), mats.dark));
      const vis = mesh(box(s * 1.0, s * 0.3, s * 0.14), mats.glass);
      vis.position.set(0, s * 0.14, s * 0.56);
      g.add(vis);
      const fin = mesh(box(s * 0.12, s * 0.5, s * 0.7), mats.trim);
      fin.position.set(0, s * 0.68, -s * 0.1);
      g.add(fin);
      break;
    }
  }
  return g;
}

/* ---------- shoulders ---------- */

function buildShoulder(style, S, mats, side, rng) {
  const g = new THREE.Group();
  const w = S.w * 0.46, h = S.h * 0.34, d = S.d * 0.62;
  switch (style) {
    case 'pauldron': {
      const parts = [
        { geo: plate(w * 1.35, h * 1.2, d * 1.2, 0.72), pos: [0, h * 0.1, 0] },
        { geo: box(w * 0.5, h * 0.4, d * 0.5), pos: [side * w * 0.5, -h * 0.3, 0] },
      ];
      g.add(mesh(mergeParts(parts), mats.hull));
      break;
    }
    case 'boxlauncher': {
      g.add(mesh(box(w * 1.1, h * 1.1, d * 1.25), mats.hull));
      // Launch cells read instantly as "this thing shoots missiles".
      const cells = [];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++)
        cells.push({ geo: cyl(w * 0.12, w * 0.12, d * 0.2, 6), rot: [Math.PI / 2, 0, 0],
                     pos: [(i - 1) * w * 0.3, (j - 0.5) * h * 0.42, d * 0.66] });
      g.add(mesh(mergeParts(cells), mats.dark));
      break;
    }
    case 'spiked': {
      const parts = [{ geo: plate(w * 1.25, h * 1.1, d * 1.1, 0.8), pos: [0, 0, 0] }];
      for (let i = 0; i < 3; i++) {
        parts.push({ geo: cyl(0.02, w * 0.16, h * 0.9, 6), pos: [side * w * 0.45, h * 0.4, (i - 1) * d * 0.35], rot: [0, 0, -side * 0.5] });
      }
      g.add(mesh(mergeParts(parts), mats.hull));
      break;
    }
    case 'slim':
    default:
      g.add(mesh(plate(w * 0.9, h * 0.95, d * 0.9, 0.85), mats.hull));
      break;
  }
  return g;
}

/* ---------- limbs ---------- */

function buildArm(style, S, mats, side, rng) {
  const g = new THREE.Group();
  const upperLen = S.h * 0.46, lowerLen = S.h * 0.48;
  const r = S.w * 0.17;

  const upper = new THREE.Group();
  upper.add(mesh(mergeParts([
    { geo: cyl(r, r * 0.92, upperLen, 10), pos: [0, -upperLen / 2, 0] },
    { geo: box(r * 2.1, upperLen * 0.4, r * 2.0), pos: [0, -upperLen * 0.3, 0] },
    ...greebleParts(r * 2, upperLen, r * 2, rng, 4).map(p => ({ ...p, pos: [p.pos[0], p.pos[1] - upperLen / 2, p.pos[2]] })),
  ]), mats.hull));
  g.add(upper);

  const elbow = new THREE.Group();
  elbow.position.y = -upperLen;
  upper.add(elbow);

  const lower = new THREE.Group();
  elbow.add(lower);

  if (style === 'hand') {
    lower.add(mesh(mergeParts([
      { geo: cyl(r * 0.9, r * 0.8, lowerLen, 10), pos: [0, -lowerLen / 2, 0] },
      { geo: box(r * 1.8, r * 1.6, r * 1.5), pos: [0, -lowerLen - r * 0.7, 0] },
      { geo: box(r * 0.5, r * 1.3, r * 0.5), pos: [r * 0.7, -lowerLen - r * 1.3, r * 0.3] },
      { geo: box(r * 0.5, r * 1.3, r * 0.5), pos: [-r * 0.7, -lowerLen - r * 1.3, r * 0.3] },
    ]), mats.hull));
  } else if (style === 'hybrid') {
    lower.add(mesh(mergeParts([
      { geo: box(r * 1.9, lowerLen, r * 1.9), pos: [0, -lowerLen / 2, 0] },
      { geo: plate(r * 2.6, lowerLen * 0.8, r * 0.7, 1.2), pos: [side * r * 1.2, -lowerLen * 0.45, 0] },
    ]), mats.hull));
  } else {
    lower.add(mesh(mergeParts([
      { geo: box(r * 2.0, lowerLen, r * 2.0), pos: [0, -lowerLen / 2, 0] },
      { geo: box(r * 2.3, r * 1.1, r * 2.3), pos: [0, -lowerLen * 0.86, 0] },
    ]), mats.hull));
  }

  const mount = new THREE.Object3D();
  mount.position.set(0, -lowerLen - r * 0.8, r * 0.6);
  lower.add(mount);

  return { group: g, upper, elbow, lower, mount, length: upperLen + lowerLen };
}

function buildLeg(type, S, mats, side, rng) {
  const g = new THREE.Group();
  const thighLen = S.legLen * 0.46;
  const shinLen = S.legLen * 0.44;
  const r = S.w * 0.2;
  const reverse = (type === 'digitigrade' || type === 'chicken' || type === 'spider');

  const hip = new THREE.Group();
  g.add(hip);
  hip.add(mesh(mergeParts([
    { geo: cyl(r * 1.1, r * 1.1, r * 1.2, 10), rot: [0, 0, Math.PI / 2], pos: [0, 0, 0] },
  ]), mats.dark));

  const thigh = new THREE.Group();
  hip.add(thigh);
  thigh.add(mesh(mergeParts([
    { geo: cyl(r * 0.95, r * 0.8, thighLen, 10), pos: [0, -thighLen / 2, 0] },
    { geo: plate(r * 2.2, thighLen * 0.8, r * 1.5, 0.9), pos: [0, -thighLen * 0.42, 0] },
    ...greebleParts(r * 2, thighLen, r * 2, rng, 4).map(p => ({ ...p, pos: [p.pos[0], p.pos[1] - thighLen / 2, p.pos[2]] })),
  ]), mats.hull));

  const knee = new THREE.Group();
  knee.position.y = -thighLen;
  thigh.add(knee);
  const kneeCap = mesh(cyl(r * 0.75, r * 0.75, r * 1.5, 10), mats.dark);
  kneeCap.rotation.z = Math.PI / 2;
  knee.add(kneeCap);

  const shin = new THREE.Group();
  knee.add(shin);
  shin.add(mesh(mergeParts([
    { geo: cyl(r * 0.78, r * 0.62, shinLen, 10), pos: [0, -shinLen / 2, 0] },
    { geo: box(r * 1.5, shinLen * 0.55, r * 1.3), pos: [0, -shinLen * 0.4, -r * 0.2] },
  ]), mats.hull));

  const ankle = new THREE.Group();
  ankle.position.y = -shinLen;
  shin.add(ankle);

  const foot = new THREE.Group();
  ankle.add(foot);
  if (type === 'spider') {
    const toes = [];
    for (let i = -1; i <= 1; i++) {
      toes.push({ geo: box(r * 0.5, r * 0.4, r * 2.6), pos: [i * r * 0.8, -r * 0.2, r * 0.7], rot: [0, i * 0.35, 0] });
    }
    foot.add(mesh(mergeParts(toes), mats.dark));
  } else if (reverse) {
    foot.add(mesh(mergeParts([
      { geo: box(r * 1.5, r * 0.5, r * 3.0), pos: [0, -r * 0.2, r * 0.8] },
      { geo: box(r * 1.2, r * 0.45, r * 1.0), pos: [0, -r * 0.2, -r * 0.8] },
    ]), mats.dark));
  } else {
    foot.add(mesh(mergeParts([
      { geo: box(r * 1.8, r * 0.6, r * 3.2), pos: [0, -r * 0.25, r * 0.5] },
      { geo: plate(r * 1.9, r * 0.8, r * 1.2, 0.8), pos: [0, r * 0.2, -r * 0.8] },
    ]), mats.dark));
  }

  return { group: g, hip, thigh, knee, shin, ankle, foot, thighLen, shinLen, reverse };
}

/* ---------- accents ---------- */
/** Glow strips, merged into a single unlit mesh -- they never cast shadows. */
function addAccents(group, S, mats, count, rng) {
  if (count <= 0) return;
  const parts = [];
  for (let i = 0; i < count; i++) {
    const w = S.w * rng.range(0.1, 0.4);
    parts.push({
      geo: box(w, S.h * 0.035, 0.06),
      pos: [rng.range(-0.4, 0.4) * S.w, rng.range(-0.3, 0.35) * S.h, S.d * 0.51],
    });
  }
  const m = new THREE.Mesh(mergeParts(parts), mats.accent);
  m.castShadow = false;
  m.receiveShadow = false;
  group.add(m);
}

/**
 * Collapse a group's direct mesh children into one mesh per material.
 * Anything that has to move on its own should not be passed here.
 */
function flattenByMaterial(group) {
  const batches = new Map();
  const keep = [];
  for (const child of [...group.children]) {
    if (!child.isMesh) { keep.push(child); continue; }
    const g = child.geometry.clone();
    child.updateMatrix();
    g.applyMatrix4(child.matrix);
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    let list = batches.get(child.material);
    if (!list) { list = []; batches.set(child.material, list); }
    list.push(g);
    group.remove(child);
  }
  for (const [mat, geos] of batches) {
    const merged = geos.length === 1 ? geos[0] : mergeGeoms(geos);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

function mergeGeoms(geos) {
  const merged = BGU.mergeGeometries(geos, false);
  geos.forEach(g => g.dispose());
  return merged;
}

/* ================================================================== *
 * Public builder
 * ================================================================== */

/**
 * @param {object} chassis  a record from data/mechs.js
 * @param {string} skinId
 * @param {number|null} teamColor  hex, tints the accent strips
 * @returns {{root:THREE.Group, rig:object, mounts:object, materials:object, height:number}}
 */
export function buildMech(chassis, skinId, teamColor = null) {
  const b = chassis.build;
  const rng = makeRng(hashOf(chassis.id));
  const mats = skinMaterials(skinId, teamColor);

  const H = b.height;
  const S = {
    h: H * 0.26 * (b.torso === 'wide' ? 1.12 : 1),
    w: H * 0.22 * b.width,
    d: H * 0.18 * b.width,
    legLen: H * 0.46,
  };

  const root = new THREE.Group();
  root.name = chassis.id;

  /* ---- legs ---- */
  const legs = new THREE.Group();
  root.add(legs);

  const pelvis = mesh(mergeParts([
    { geo: box(S.w * 1.0, S.h * 0.3, S.d * 0.9), pos: [0, 0, 0] },
    { geo: plate(S.w * 0.8, S.h * 0.22, S.d * 0.6, 1.3), pos: [0, -S.h * 0.2, 0] },
  ]), mats.hull);
  pelvis.position.y = S.legLen;
  legs.add(pelvis);

  const legL = buildLeg(b.legs, S, mats, -1, rng);
  const legR = buildLeg(b.legs, S, mats, 1, rng);
  legL.group.position.set(-S.w * 0.36, S.legLen, 0);
  legR.group.position.set(S.w * 0.36, S.legLen, 0);
  legs.add(legL.group, legR.group);

  /* ---- torso ---- */
  const torsoYaw = new THREE.Group();
  torsoYaw.position.y = S.legLen + S.h * 0.28;
  root.add(torsoYaw);

  const torsoPitch = new THREE.Group();
  torsoYaw.add(torsoPitch);

  const torsoMesh = mesh(buildTorso(b.torso, S, rng), mats.hull);
  torsoPitch.add(torsoMesh);
  addAccents(torsoPitch, S, mats, b.accents, rng);

  // Side torso blisters double as the LT/RT hardpoint anchors.
  const sideTorso = {};
  for (const [key, sx] of [['LT', -1], ['RT', 1]]) {
    const st = mesh(plate(S.w * 0.34, S.h * 0.56, S.d * 0.8, 0.85), mats.hull);
    st.position.set(sx * S.w * 0.58, S.h * 0.02, 0);
    torsoPitch.add(st);
    sideTorso[key] = st;
  }

  const cockpit = flattenByMaterial(buildCockpit(b.cockpit, S, mats, rng));
  cockpit.position.set(0, S.h * 0.62, S.d * 0.08);
  torsoPitch.add(cockpit);

  const shoulderL = buildShoulder(b.shoulders, S, mats, -1, rng);
  const shoulderR = buildShoulder(b.shoulders, S, mats, 1, rng);
  shoulderL.position.set(-S.w * 0.86, S.h * 0.3, 0);
  shoulderR.position.set(S.w * 0.86, S.h * 0.3, 0);
  torsoPitch.add(shoulderL, shoulderR);

  const armL = buildArm(b.arms, S, mats, -1, rng);
  const armR = buildArm(b.arms, S, mats, 1, rng);
  armL.group.position.set(-S.w * 0.92, S.h * 0.18, 0);
  armR.group.position.set(S.w * 0.92, S.h * 0.18, 0);
  torsoPitch.add(armL.group, armR.group);

  /* ---- hardpoint mounts ---- */
  const mkMount = (parent, x, y, z) => {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };
  const mounts = {
    LA: armL.mount,
    RA: armR.mount,
    LT: mkMount(sideTorso.LT, 0, S.h * 0.1, S.d * 0.5),
    RT: mkMount(sideTorso.RT, 0, S.h * 0.1, S.d * 0.5),
    CT: mkMount(torsoPitch, 0, -S.h * 0.02, S.d * 0.6),
    HD: mkMount(cockpit, S.w * 0.2, S.h * 0.1, S.d * 0.3),
    LS: mkMount(shoulderL, 0, S.h * 0.18, S.d * 0.3),
    RS: mkMount(shoulderR, 0, S.h * 0.18, S.d * 0.3),
  };

  /* ---- jump jet nozzles ---- */
  const jets = [];
  if (chassis.jets.thrust > 0) {
    for (const sx of [-1, 1]) {
      const n = mesh(cyl(S.w * 0.16, S.w * 0.22, S.h * 0.26, 10), mats.dark);
      n.position.set(sx * S.w * 0.5, -S.h * 0.3, -S.d * 0.62);
      n.rotation.x = -0.35;
      torsoPitch.add(n);
      const port = new THREE.Object3D();
      port.position.set(sx * S.w * 0.5, -S.h * 0.42, -S.d * 0.72);
      torsoPitch.add(port);
      jets.push(port);
    }
  }

  // Section -> the meshes that should change material as it takes damage.
  // Only meshes currently wearing the hull material take part, so trim,
  // glass and glow strips keep their look.
  const collectHull = (root) => {
    const out = [];
    root.traverse(o => { if (o.isMesh && o.material === mats.hull) out.push(o); });
    return out;
  };
  const sectionMeshes = {
    CT: [torsoMesh],
    LT: [sideTorso.LT],
    RT: [sideTorso.RT],
    HD: collectHull(cockpit),
    LA: collectHull(armL.group),
    RA: collectHull(armR.group),
    LL: collectHull(legL.group),
    RL: collectHull(legR.group),
  };

  root.userData.height = H;

  return {
    root, materials: mats, mounts, jets, height: H, scaleRef: S,
    rig: {
      legs, pelvis, legL, legR, torsoYaw, torsoPitch, cockpit,
      shoulderL, shoulderR, armL, armR, sideTorso, torsoMesh, sectionMeshes,
    },
  };
}

function hashOf(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function disposeMech(model) {
  model.root.traverse(o => {
    if (o.isMesh) {
      o.geometry?.dispose?.();
    }
  });
  for (const m of Object.values(model.materials)) m?.dispose?.();
}
