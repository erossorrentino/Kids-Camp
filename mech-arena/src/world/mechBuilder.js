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

/**
 * A chamfered slab: an eight-sided prism scaled to w x h x d. Cut corners
 * catch a highlight along every edge, which is most of the difference
 * between a box and a piece of armour.
 */
function chamfer(w, h, d, cut = 0.22) {
  const k = `ch${w}_${h}_${d}_${cut}`;
  if (geoCache.has(k)) return geoCache.get(k);
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1);
  g.rotateY(Math.PI / 8);            // flats face front and side, not corners
  // An octagon inscribed in a unit circle is narrower than the box it stands
  // in, so scale it back out and then pull the chamfer in by `cut`.
  const k8 = 1 / Math.cos(Math.PI / 8);
  g.scale(w * 0.5 * k8 * (1 - cut * 0.10), h, d * 0.5 * k8 * (1 - cut * 0.10));
  g.computeVertexNormals();
  geoCache.set(k, g);
  return g;
}

/**
 * A rocket plume: an open cone whose vertex colours run from `hot` at the
 * base, through `cool`, to black at the tip. Drawn additively, so the black
 * end simply disappears.
 */
function plumeGeometry(radius, len, hot, cool) {
  const geo = new THREE.ConeGeometry(radius, len, 16, 6, true);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Color(hot), b = new THREE.Color(cool), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) + len / 2) / len;            // 0 at the base, 1 at the apex
    c.copy(a).lerp(b, Math.min(1, t * 1.6)).multiplyScalar(Math.pow(1 - t, 1.6));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
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
      parts.push({ geo: chamfer(w, h, d), pos: [0, 0, 0] });
      parts.push({ geo: box(w * 1.06, h * 0.2, d * 1.04), pos: [0, h * 0.36, 0] });
      parts.push({ geo: chamfer(w * 0.7, h * 0.34, d * 0.4, 0.3), pos: [0, -h * 0.1, d * 0.52] });
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
      parts.push({ geo: chamfer(w * 1.2, h * 0.86, d), pos: [0, 0, 0] });
      parts.push({ geo: box(w * 1.3, h * 0.24, d * 1.05), pos: [0, h * 0.34, 0] });
      parts.push({ geo: plate(w * 0.9, h * 0.34, d * 0.5, 1.4), pos: [0, -h * 0.42, d * 0.2] });
      break;
  }
  /* Shared over every style: a raised chest brow above the glow strip, a
   * collar that carries the shoulders, and a spine down the back. They are
   * what make the torso read as built rather than extruded. */
  parts.push({ geo: chamfer(w * 0.78, h * 0.17, d * 0.34, 0.34), pos: [0, h * 0.16, d * 0.46] });
  parts.push({ geo: chamfer(w * 1.18, h * 0.13, d * 0.62, 0.3), pos: [0, h * 0.42, -d * 0.04] });
  parts.push({ geo: chamfer(w * 0.3, h * 0.72, d * 0.3, 0.3), pos: [0, -h * 0.02, -d * 0.52] });
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
      // A lit visor, not a dark window: it is what makes a head read as a
      // cockpit with somebody in it at fifty metres.
      const vis = mesh(box(s * 1.36, s * 0.26, s * 0.16), mats.accent, false);
      vis.position.set(0, s * 0.06, s * 0.6);
      g.add(vis);
      g.add(mesh(box(s * 1.56, s * 0.16, s * 0.3), mats.trim)).position.set(0, s * 0.34, s * 0.5);
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
      g.add(mesh(chamfer(s * 1.25, s * 0.85, s * 1.05, 0.3), mats.dark));
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
      // A brow that overhangs the eyes, not a wedge that flares away from
      // them: the overhang is what makes a head look like a face.
      g.add(mesh(plate(s * 1.25, s * 1.0, s * 1.1, 0.82), mats.dark));
      const brow = mesh(plate(s * 1.45, s * 0.26, s * 1.15, 0.86), mats.trim);
      brow.position.set(0, s * 0.42, s * 0.04);
      g.add(brow);
      for (let i = -1; i <= 1; i += 2) {
        const eye = mesh(box(s * 0.32, s * 0.24, s * 0.1), mats.accent, false);
        eye.position.set(i * s * 0.28, s * 0.1, s * 0.56);
        g.add(eye);
      }
      const jaw = mesh(chamfer(s * 0.9, s * 0.34, s * 0.8, 0.3), mats.dark);
      jaw.position.set(0, -s * 0.44, s * 0.14);
      g.add(jaw);
      break;
    }
    case 'none':
      return g;
    case 'head':
    default: {
      g.add(mesh(chamfer(s * 1.25, s * 1.0, s * 1.1, 0.3), mats.dark));
      const vis = mesh(box(s * 1.0, s * 0.3, s * 0.14), mats.accent, false);
      vis.position.set(0, s * 0.14, s * 0.58);
      g.add(vis);
      const brow = mesh(plate(s * 1.3, s * 0.22, s * 0.9, 0.8), mats.trim);
      brow.position.set(0, s * 0.46, s * 0.06);
      g.add(brow);
      const fin = mesh(box(s * 0.12, s * 0.5, s * 0.7), mats.trim);
      fin.position.set(0, s * 0.68, -s * 0.1);
      g.add(fin);
      // Whip antenna: a small thing that reads as a machine with a radio.
      const ant = mesh(cyl(s * 0.03, s * 0.04, s * 1.1, 6), mats.trim);
      ant.position.set(s * 0.42, s * 0.86, -s * 0.2);
      ant.rotation.z = -0.18;
      g.add(ant);
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
      // Flared outward and down: the wide shoulder line is the single most
      // recognisable thing about a heavy mech's silhouette.
      const parts = [
        { geo: plate(w * 1.7, h * 1.45, d * 1.35, 0.66), pos: [side * w * 0.16, h * 0.12, 0], rot: [0, 0, -side * 0.18] },
        { geo: chamfer(w * 1.2, h * 0.34, d * 1.15, 0.3), pos: [side * w * 0.22, h * 0.72, 0], rot: [0, 0, -side * 0.18] },
        { geo: box(w * 0.5, h * 0.44, d * 0.5), pos: [side * w * 0.52, -h * 0.34, 0] },
      ];
      g.add(mesh(mergeParts(parts), mats.hull2));
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
      const parts = [{ geo: plate(w * 1.45, h * 1.25, d * 1.2, 0.76), pos: [side * w * 0.12, 0, 0], rot: [0, 0, -side * 0.16] }];
      for (let i = 0; i < 3; i++) {
        parts.push({ geo: cyl(0.02, w * 0.16, h * 0.9, 6), pos: [side * w * 0.55, h * 0.42, (i - 1) * d * 0.35], rot: [0, 0, -side * 0.55] });
      }
      g.add(mesh(mergeParts(parts), mats.hull2));
      break;
    }
    case 'slim':
    default:
      g.add(mesh(mergeParts([
        { geo: plate(w * 1.15, h * 1.15, d * 1.0, 0.8), pos: [side * w * 0.1, 0, 0], rot: [0, 0, -side * 0.14] },
        { geo: chamfer(w * 0.8, h * 0.26, d * 0.9, 0.3), pos: [side * w * 0.12, h * 0.58, 0] },
      ]), mats.hull2));
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
    ]), mats.hull2));
  } else if (style === 'hybrid') {
    lower.add(mesh(mergeParts([
      { geo: box(r * 1.9, lowerLen, r * 1.9), pos: [0, -lowerLen / 2, 0] },
      { geo: plate(r * 2.6, lowerLen * 0.8, r * 0.7, 1.2), pos: [side * r * 1.2, -lowerLen * 0.45, 0] },
    ]), mats.hull2));
  } else {
    lower.add(mesh(mergeParts([
      { geo: chamfer(r * 2.2, lowerLen, r * 2.2, 0.24), pos: [0, -lowerLen / 2, 0] },
      { geo: chamfer(r * 2.5, r * 1.2, r * 2.5, 0.3), pos: [0, -lowerLen * 0.86, 0] },
      // A shroud over the outside of the forearm, where the gun hangs.
      { geo: plate(r * 0.8, lowerLen * 0.7, r * 2.4, 1.15), pos: [side * r * 1.25, -lowerLen * 0.42, 0] },
    ]), mats.hull2));
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
    { geo: chamfer(r * 2.5, thighLen * 0.82, r * 1.8, 0.26), pos: [0, -thighLen * 0.42, 0] },
    // A hip skirt over the joint, which is what stops a leg reading as a pipe.
    { geo: plate(r * 2.0, thighLen * 0.34, r * 1.9, 1.2), pos: [0, -thighLen * 0.08, 0] },
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
    { geo: chamfer(r * 2.0, shinLen * 0.62, r * 1.7, 0.26), pos: [0, -shinLen * 0.4, -r * 0.1] },
    // Shin guard: a flared plate down the front of the calf.
    { geo: plate(r * 1.8, shinLen * 0.7, r * 0.7, 1.25), pos: [0, -shinLen * 0.46, r * 0.8] },
  ]), mats.hull2));

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
      { geo: chamfer(r * 2.4, r * 0.7, r * 3.8, 0.24), pos: [0, -r * 0.25, r * 0.55] },
      { geo: plate(r * 2.2, r * 0.9, r * 1.3, 0.8), pos: [0, r * 0.22, -r * 0.85] },
      // Toe plates: a wide, planted foot carries the tonnage.
      { geo: box(r * 0.7, r * 0.42, r * 1.0), pos: [-r * 0.7, -r * 0.3, r * 1.9] },
      { geo: box(r * 0.7, r * 0.42, r * 1.0), pos: [r * 0.7, -r * 0.3, r * 1.9] },
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
  const quad = b.legs === 'quad';

  const pelvis = mesh(mergeParts(quad
    ? [
      // A quad's body is a long chassis slung between four hips rather than
      // a pelvis under a torso.
      { geo: box(S.w * 1.25, S.h * 0.34, S.d * 2.0), pos: [0, 0, 0] },
      { geo: plate(S.w * 1.0, S.h * 0.24, S.d * 1.6, 1.25), pos: [0, -S.h * 0.22, 0] },
    ]
    : [
      { geo: box(S.w * 1.0, S.h * 0.3, S.d * 0.9), pos: [0, 0, 0] },
      { geo: plate(S.w * 0.8, S.h * 0.22, S.d * 0.6, 1.3), pos: [0, -S.h * 0.2, 0] },
    ]), mats.hull);
  pelvis.position.y = S.legLen;
  legs.add(pelvis);

  // Bipeds swing their legs in antiphase; quads use a diagonal trot, so the
  // front-left and rear-right feet move together.
  const legType = quad ? 'digitigrade' : b.legs;
  const layout = quad
    ? [
      { sx: -1, sz: 1, phase: 0 },          // front left
      { sx: 1, sz: 1, phase: Math.PI },     // front right
      { sx: -1, sz: -1, phase: Math.PI },   // rear left
      { sx: 1, sz: -1, phase: 0 },          // rear right
    ]
    : [
      { sx: -1, sz: 0, phase: 0 },
      { sx: 1, sz: 0, phase: Math.PI },
    ];

  const legParts = layout.map(spec => {
    const leg = buildLeg(legType, S, mats, spec.sx, rng);
    leg.group.position.set(
      spec.sx * S.w * (quad ? 0.52 : 0.36),
      S.legLen,
      spec.sz * S.d * 0.78,
    );
    // Rear legs of a quad face slightly outward, which reads as a stance.
    if (quad) leg.group.rotation.y = spec.sx * (spec.sz > 0 ? 0.12 : -0.12);
    leg.phase = spec.phase;
    legs.add(leg.group);
    return leg;
  });

  const legL = legParts[0];
  const legR = legParts[1];

  /* ---- torso ---- */
  const torsoYaw = new THREE.Group();
  // A quad carries its turret low and forward over the front hips.
  torsoYaw.position.set(0, S.legLen + S.h * (quad ? 0.20 : 0.28), quad ? S.d * 0.45 : 0);
  root.add(torsoYaw);

  const torsoPitch = new THREE.Group();
  torsoYaw.add(torsoPitch);

  const torsoMesh = mesh(buildTorso(b.torso, S, rng), mats.hull);
  torsoPitch.add(torsoMesh);
  addAccents(torsoPitch, S, mats, b.accents, rng);

  /* A lit chest strip and a reactor pack on the back with glowing ports.
   * These two are what read as "powered" at any range and in any paint,
   * and they give the silhouette something behind the shoulders. */

  const pack = mesh(mergeParts([
    { geo: chamfer(S.w * 1.05, S.h * 0.46, S.d * 0.44, 0.28), pos: [0, S.h * 0.08, -S.d * 0.64] },
    { geo: cyl(S.w * 0.17, S.w * 0.21, S.h * 0.22, 10), pos: [-S.w * 0.36, -S.h * 0.14, -S.d * 0.7], rot: [0.32, 0, 0] },
    { geo: cyl(S.w * 0.17, S.w * 0.21, S.h * 0.22, 10), pos: [S.w * 0.36, -S.h * 0.14, -S.d * 0.7], rot: [0.32, 0, 0] },
  ]), mats.hull);
  torsoPitch.add(pack);

  // Chest strip and reactor ports share the accent material: one draw.
  const glows = mesh(mergeParts([
    { geo: box(S.w * 0.52, S.h * 0.075, 0.06), pos: [0, S.h * 0.03, S.d * 0.64] },
    { geo: cyl(S.w * 0.125, S.w * 0.125, 0.06, 10), pos: [-S.w * 0.36, -S.h * 0.25, -S.d * 0.76], rot: [Math.PI / 2 + 0.32, 0, 0] },
    { geo: cyl(S.w * 0.125, S.w * 0.125, 0.06, 10), pos: [S.w * 0.36, -S.h * 0.25, -S.d * 0.76], rot: [Math.PI / 2 + 0.32, 0, 0] },
  ]), mats.accent, false);
  torsoPitch.add(glows);

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

  /* ---- jump-jet pack ----
   * Two engine pods either side of the reactor pack, each a painted housing
   * over a collar, a bell nozzle with vanes round its lip, a throat that
   * glows while the engine is lit, and a flame that grows out of the bell
   * when it fires. The flame is two nested cones, additive and unshadowed:
   * a white-hot core inside a blue-to-amber sheath, which is what a real
   * rocket plume looks like and what reads as thrust at a glance. */
  const jets = [];
  let jetFx = null;
  if (chassis.jets.thrust > 0) {
    const r = S.w * 0.125;
    mats.jetBell = mats.dark.clone();
    mats.jetBell.side = THREE.DoubleSide;
    mats.jetCore = new THREE.MeshStandardMaterial({
      color: 0x0a0f18, emissive: new THREE.Color(0xffa24a), emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.2,
    });
    // Vertex colours carry the fade: bright at the nozzle, black at the tip.
    // With additive blending black is invisible, so the plume tapers into
    // nothing instead of ending in a hard-edged cone.
    mats.jetFlame = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    mats.jetFlameCore = mats.jetFlame.clone();
    const flames = [];
    const pods = [];
    const bellLen = r * 1.4;
    const exitY = -r * 1.0 - bellLen;

    for (const sx of [-1, 1]) {
      const pod = new THREE.Group();
      pod.position.set(sx * S.w * 0.52, -S.h * 0.16, -S.d * 0.8);
      pod.rotation.x = 0.32;               // exhaust angled down and back
      pod.rotation.z = sx * 0.06;
      torsoPitch.add(pod);
      pods.push(pod);

      pod.add(mesh(mergeParts([
        { geo: chamfer(r * 2.2, r * 2.2, r * 2.0, 0.3), pos: [0, r * 0.4, 0] },
        { geo: plate(r * 1.9, r * 0.55, r * 1.8, 0.78), pos: [0, r * 1.75, 0] },  // intake cowl
      ]), mats.hull2));
      pod.add(mesh(mergeParts([
        // Collar and a bracket bolting the pod to the pack.
        { geo: cyl(r * 0.95, r * 1.0, r * 0.3, 16), pos: [0, -r * 0.9, 0] },
        { geo: box(r * 0.5, r * 1.6, r * 0.8), pos: [-sx * r * 1.2, r * 0.7, r * 0.3] },
        // Heat vanes round the lip of the bell.
        ...[0, 1, 2, 3].map(i => {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          return { geo: box(r * 0.08, r * 0.7, r * 0.5), pos: [Math.cos(a) * r * 1.12, exitY + r * 0.35, Math.sin(a) * r * 1.12], rot: [0, -a, 0] };
        }),
      ]), mats.trim));

      // Bell nozzle: open-ended, flaring toward the exit.
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r * 1.12, bellLen, 18, 1, true), mats.jetBell);
      bell.position.y = -r * 1.0 - bellLen / 2;
      bell.castShadow = true;
      pod.add(bell);
      // Throat: the glowing disc up inside the bell.
      const throat = new THREE.Mesh(new THREE.CircleGeometry(r * 0.7, 16), mats.jetCore);
      throat.rotation.x = Math.PI / 2;
      throat.position.y = -r * 1.05;
      pod.add(throat);

      // Flames hang from a pivot at the exit so scaling grows them outward.
      const pivot = new THREE.Object3D();
      pivot.position.y = exitY;
      pod.add(pivot);
      const sheathLen = r * 7.5, coreLen = r * 3.8;
      const sheath = new THREE.Mesh(plumeGeometry(r * 1.0, sheathLen, 0x3f9dff, 0xff8a2d), mats.jetFlame);
      sheath.rotation.x = Math.PI;
      sheath.position.y = -sheathLen / 2;
      const core = new THREE.Mesh(plumeGeometry(r * 0.55, coreLen, 0xfff6e0, 0xffb060), mats.jetFlameCore);
      core.rotation.x = Math.PI;
      core.position.y = -coreLen / 2;
      for (const f of [sheath, core]) { f.castShadow = false; f.receiveShadow = false; f.renderOrder = 5; pivot.add(f); }
      pivot.visible = false;
      flames.push(pivot);

      // Particle port just past the exit.
      const port = new THREE.Object3D();
      port.position.y = exitY - r * 0.3;
      pod.add(port);
      jets.push(port);
    }
    /* The pods never move on their own, so their housings, collars, bells
     * and throats are baked into torsoPitch space and merged across both
     * pods: four draws for the pair instead of eight. Only the flame pivots
     * stay separate, because they scale -- and they are hidden, and cost
     * nothing, unless the jets are lit. */
    torsoPitch.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(torsoPitch.matrixWorld).invert();
    const byMat = new Map();
    for (const pod of pods) {
      const statics = [];
      pod.traverse(o => { if (o.isMesh && !flames.some(f => f === o.parent)) statics.push(o); });
      for (const o of statics) {
        const geo = o.geometry.clone();
        geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
        if (!byMat.has(o.material)) byMat.set(o.material, []);
        byMat.get(o.material).push(geo);
        o.parent.remove(o);
      }
    }
    for (const [mat, geos] of byMat) {
      const merged = geos.length > 1 ? BGU.mergeGeometries(geos, false) : geos[0];
      if (geos.length > 1) geos.forEach(g => g.dispose());
      if (!merged) continue;
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = mat !== mats.jetCore;
      m.receiveShadow = true;
      torsoPitch.add(m);
    }
    jetFx = { flames, level: 0 };
  }

  // Section -> the meshes that should change material as it takes damage.
  // Only meshes currently wearing the hull material take part, so trim,
  // glass and glow strips keep their look.
  const collectHull = (root) => {
    const out = [];
    root.traverse(o => { if (o.isMesh && (o.material === mats.hull || o.material === mats.hull2)) out.push(o); });
    return out;
  };
  const sectionMeshes = {
    CT: [torsoMesh, pack],
    LT: [sideTorso.LT],
    RT: [sideTorso.RT],
    HD: collectHull(cockpit),
    LA: collectHull(armL.group),
    RA: collectHull(armR.group),
    LL: legParts.filter((_, i) => i % 2 === 0).flatMap(l => collectHull(l.group)),
    RL: legParts.filter((_, i) => i % 2 === 1).flatMap(l => collectHull(l.group)),
  };

  root.userData.height = H;

  return {
    root, materials: mats, mounts, jets, jetFx, height: H, scaleRef: S,
    rig: {
      legs, pelvis, legL, legR, legParts, quad,
      torsoYaw, torsoPitch, cockpit,
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
