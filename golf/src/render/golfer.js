// A low-poly golfer with a real swing: arms and club rotate on a tilted
// swing plane around a hub between the shoulders, wrists hinge and release,
// shoulders and hips turn, and the arms are solved with two-bone IK.
//
// Local space: the golfer faces +x (the ball), the target is along -z
// (the golfer's left, for a right-hander), y is up. The root sits at the feet.
import * as THREE from '../../vendor/three.module.min.js';
import { buildClub, addressDir, BALL_Y } from './clubs.js';

const UP = new THREE.Vector3(0, 1, 0);
const tmpQ = new THREE.Quaternion();

function limb(radius, color) {
  const g = new THREE.CylinderGeometry(radius, radius * 0.9, 1, 8);
  g.translate(0, 0.5, 0);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color }));
  m.castShadow = true;
  return m;
}

const lam = (color) => new THREE.MeshLambertMaterial({ color });

// A body part turned on a lathe. profile is [radius, t] with t running 0..1
// along the part, so place() can stretch it between two joints while the
// radii (the muscle shape) stay true to size.
function lathe(profile, mat, segs = 12) {
  const g = new THREE.LatheGeometry(profile.map(([r, t]) => new THREE.Vector2(r, t)), segs);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

// Profiles in metres. Trousers hang looser and straighter than bare legs.
const PROFILE = {
  thighTrouser: [[0, 0], [0.086, 0], [0.089, 0.1], [0.082, 0.45], [0.07, 0.8], [0.064, 1]],
  thighSkin: [[0, 0], [0.08, 0], [0.083, 0.12], [0.072, 0.5], [0.057, 0.85], [0.05, 1]],
  shorts: [[0, 0], [0.09, 0], [0.093, 0.3], [0.089, 0.85], [0.087, 1], [0.07, 1]],
  shinTrouser: [[0.061, 0], [0.062, 0.2], [0.058, 0.62], [0.056, 0.94], [0.059, 1], [0, 1]],
  shinSkin: [[0.047, 0], [0.055, 0.22], [0.051, 0.45], [0.039, 0.8], [0.034, 1], [0, 1]],
  sock: [[0, 0], [0.042, 0], [0.044, 0.6], [0.047, 0.92], [0.046, 1], [0.036, 1]],
  upperArm: [[0, 0], [0.047, 0], [0.05, 0.16], [0.047, 0.42], [0.04, 0.8], [0.036, 1]],
  forearm: [[0.037, 0], [0.043, 0.2], [0.038, 0.6], [0.028, 0.95], [0.027, 1], [0, 1]],
  sleeve: [[0.057, 0], [0.058, 0.3], [0.055, 0.94], [0.054, 1], [0.043, 1]],
  // torso around the spine, from the waist (inside the belt) to the neck
  torsoM: [[0, 0.05], [0.12, 0.05], [0.129, 0.12], [0.14, 0.2], [0.152, 0.28], [0.162, 0.36], [0.166, 0.43], [0.158, 0.49], [0.136, 0.54], [0.096, 0.58], [0.062, 0.61], [0, 0.625]],
  torsoF: [[0, 0.05], [0.112, 0.05], [0.114, 0.12], [0.121, 0.2], [0.139, 0.3], [0.149, 0.36], [0.148, 0.43], [0.142, 0.48], [0.122, 0.53], [0.088, 0.575], [0.058, 0.605], [0, 0.62]],
};

// Half-width of a lathe profile at height y
function profileR(profile, y) {
  for (let i = 1; i < profile.length; i++) {
    const [r0, y0] = profile[i - 1], [r1, y1] = profile[i];
    if (y >= y0 && y <= y1 && y1 > y0) return r0 + ((y - y0) / (y1 - y0)) * (r1 - r0);
  }
  return 0;
}

function place(mesh, a, b) {
  const d = new THREE.Vector3().subVectors(b, a);
  const L = d.length();
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(UP, d.normalize());
  mesh.scale.set(1, L, 1);
}

function rotateAbout(v, axis, ang, out) {
  return out.copy(v).applyAxisAngle(axis, ang);
}

const lerp = (a, b, t) => a + (b - a) * t;
function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Two-bone reach: where the middle joint (elbow, knee) goes so segments of
// length l1 and l2 join S to T, bending towards `pole`
function bendJoint(S, T, l1, l2, pole) {
  const dv = new THREE.Vector3().subVectors(T, S);
  let d = dv.length();
  const dir = dv.normalize();
  if (d >= l1 + l2 - 0.002) return S.clone().addScaledVector(dir, l1 * (d / (l1 + l2)));
  d = Math.max(d, 0.05);
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const perp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  return S.clone().addScaledVector(dir, l1 * cosA).addScaledVector(perp, l1 * sinA);
}

// Finish position, in the chest's own frame (x out of the chest, y up the
// spine, z towards the trail side): hands up by the lead ear, the shaft
// wrapped behind the neck, elbows pointing down
const FIN_HANDS = new THREE.Vector3(0.02, 0.75, -0.2);
const FIN_CLUB = new THREE.Vector3(-0.6, -0.28, 0.75).normalize();
const FIN_POLE_L = new THREE.Vector3(-0.1, -1, -0.5);
const FIN_POLE_R = new THREE.Vector3(0.5, -1, 0.1);
const DOWN = new THREE.Vector3(0, -1, 0);
const THIGH = 0.45, SHIN = 0.427;
const shoeEuler = new THREE.Euler();
const finQ = new THREE.Quaternion();

// Shirt patterns are painted into a small repeating texture
function shirtTexture(base, accent, pattern) {
  if (!pattern || pattern === 'solid' || typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = accent;
  if (pattern === 'stripes') for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 5, 64);
  else if (pattern === 'hoops') for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 64, 6);
  else if (pattern === 'checks') {
    g.globalAlpha = 0.5;
    for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 8, 64);
    for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 64, 8);
  } else if (pattern === 'argyle') {
    for (const [cx, cy] of [[16, 16], [48, 48], [48, -16], [-16, 48], [16, 80], [80, 16]]) {
      g.beginPath(); g.moveTo(cx, cy - 16); g.lineTo(cx + 16, cy); g.lineTo(cx, cy + 16); g.lineTo(cx - 16, cy); g.closePath(); g.fill();
    }
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(pattern === 'argyle' ? 3 : 2, 2);
  return t;
}

const DEFAULT_LOFT = { DR: 10.5, '3W': 15, '5W': 18, '4H': 21, '5I': 25, '6I': 28, '7I': 32, '8I': 36, '9I': 40, PW: 45, GW: 50, SW: 56, LW: 60, PT: 3 };

const CLUB_SETUP = {
  wood: { lie: 57, ball: 1.02, tilt: 0.5 },
  hybrid: { lie: 59, ball: 0.94, tilt: 0.55 },
  iron: { lie: 62, ball: 0.86, tilt: 0.6 },
  wedge: { lie: 64, ball: 0.8, tilt: 0.64 },
  putter: { lie: 71, ball: 0.5, tilt: 0.78 },
};

export class Golfer {
  constructor(look = {}) {
    this.root = new THREE.Group();
    this.look = {
      shirt: look.shirt || '#1d3557', pants: look.pants || '#2b2d42', cap: look.cap || '#f1faee',
      skin: look.skin || '#e8b996', hair: look.hair || '#3b2a1f', gender: look.gender || 'm',
      hat: look.hat || 'cap', hairStyle: look.hairStyle || (look.gender === 'f' ? 'ponytail' : 'short'),
      beard: look.beard || 'none', pattern: look.pattern || 'solid', accent: look.accent || '#ffffff',
      vest: look.vest || null, shorts: !!look.shorts, socks: look.socks || '#ffffff',
      glove: look.glove || '#f4f4f4', shoe: look.shoe || '#1b1b1b', shades: !!look.shades, belt: look.belt || '#1b1b1b',
      logo: look.logo || null,
    };
    const L = this.look;
    const shirtMap = shirtTexture(L.shirt, L.accent, L.pattern);
    const shirtMat = () => new THREE.MeshLambertMaterial(shirtMap ? { color: '#ffffff', map: shirtMap } : { color: L.shirt });
    const female = L.gender === 'f';
    const skin = lam(L.skin);
    const pantsMat = lam(L.pants);
    // legs (posed every frame in poseLegs)
    this.legs = [];
    for (const side of [-1, 1]) {
      const thigh = lathe(L.shorts ? PROFILE.thighSkin : PROFILE.thighTrouser, L.shorts ? skin : pantsMat, 16);
      const shin = lathe(L.shorts ? PROFILE.shinSkin : PROFILE.shinTrouser, L.shorts ? skin : pantsMat, 16);
      // the knee sits just inside the leg: it only shows to fill the bend
      const knee = new THREE.Mesh(new THREE.SphereGeometry(L.shorts ? 0.045 : 0.06, 14, 10), L.shorts ? skin : pantsMat);
      knee.castShadow = true;
      // shorts over bare thighs, with socks above the shoe
      const shorts = L.shorts ? lathe(PROFILE.shorts, pantsMat) : null;
      const sock = L.shorts ? lathe(PROFILE.sock, lam(L.socks), 16) : null;
      for (const m of [shorts, sock]) if (m) this.root.add(m);
      // two-tone golf shoe: white upper, dark sole, rounded toe and heel
      const shoe = new THREE.Group();
      const white = lam('#f4f4f4');
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.1), white);
      upper.position.set(-0.01, 0.045, 0);
      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), white);
      toe.scale.set(1.2, 1.25, 1);
      toe.position.set(0.085, 0.018, 0);
      const heel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.075, 12, 1, false, Math.PI, Math.PI), white);
      heel.position.set(-0.11, 0.046, 0);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.02, 0.108), lam('#2b2b2b'));
      sole.position.set(0.0, 0.01, 0);
      const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.074, 0.104), lam(L.shoe));
      saddle.position.set(0.01, 0.047, 0);
      const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.06), white);
      tongue.position.set(0.03, 0.085, 0);
      tongue.rotation.z = -0.35;
      for (const m of [upper, toe, heel, sole, saddle, tongue]) { m.castShadow = true; shoe.add(m); }
      this.root.add(thigh, knee, shin, shoe);
      this.legs.push({ side, thigh, knee, shin, shoe, sock, shorts });
    }
    // pelvis + torso chain
    this.pelvis = new THREE.Group();
    this.pelvis.position.set(0, 0.93, 0);
    this.root.add(this.pelvis);
    // rounded hips and seat (wider on women)
    const hips = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), pantsMat);
    hips.scale.set(female ? 0.101 : 0.098, 0.104, female ? 0.166 : 0.158);
    hips.position.y = 0.022;
    hips.castShadow = true;
    this.pelvis.add(hips);
    this.spine = new THREE.Group();
    this.pelvis.add(this.spine);
    this.chest = new THREE.Group();
    this.spine.add(this.chest);
    // torso: shoulders broader than the waist, flatter front to back
    const prof = female ? PROFILE.torsoF : PROFILE.torsoM;
    const sx = female ? 0.9 : 0.82, sz = female ? 1.24 : 1.32;
    this.torsoShape = { prof, sx, sz };
    const torso = lathe(prof, shirtMat(), 20);
    torso.scale.set(sx, 1, sz);
    this.chest.add(torso);
    // belt with a buckle, snug at the waist
    const waistR = profileR(prof, 0.085);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.042, 22, 1, true), new THREE.MeshLambertMaterial({ color: L.belt, side: THREE.DoubleSide }));
    belt.scale.set(waistR * sx + 0.007, 1, waistR * sz + 0.007);
    belt.position.y = 0.085;
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.036, 0.048), lam('#c9ccd1'));
    buckle.position.set(waistR * sx + 0.01, 0.085, 0);
    this.chest.add(belt, buckle);
    // the shoulder joints sit inside the torso so the sleeves grow out of it
    const shoulderZ = profileR(prof, 0.49) * sz - 0.036;
    if (L.vest) {
      // sweater vest over the shirt: the sleeves and collar still show
      const vprof = prof.filter(([, y]) => y <= 0.5).map(([r, y]) => [r * 1.045, y]);
      vprof.push([profileR(prof, 0.53) * 1.03, 0.53], [0.075, 0.56]);
      const vest = lathe(vprof, lam(L.vest), 20);
      vest.scale.set(sx, 1, sz);
      const vtrim = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.02, 22, 1, true), lam(L.accent));
      const vr = profileR(prof, 0.12) * 1.06;
      vtrim.scale.set(vr * sx, 1, vr * sz);
      vtrim.position.y = 0.12;
      this.chest.add(vest, vtrim);
    }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(female ? 0.044 : 0.049, female ? 0.052 : 0.058, 0.13, 10), skin);
    neck.position.y = 0.64;
    this.chest.add(neck);
    // polo collar and button placket
    const shirtC = new THREE.Color(L.shirt);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(female ? 0.056 : 0.062, 0.017, 6, 16), lam(shirtC.clone().lerp(new THREE.Color('#ffffff'), 0.15)));
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.597;
    const frontX = (y, z = 0) => {
      const r = profileR(prof, y);
      return r * sx * Math.sqrt(Math.max(0, 1 - (z / (r * sz)) ** 2));
    };
    const placket = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.1, 0.032), lam(shirtC.clone().multiplyScalar(0.8)));
    placket.position.set(frontX(0.52) - 0.001, 0.52, 0);
    placket.rotation.z = -0.35;
    const logo = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.036, 0.046), lam(L.cap));
    logo.position.set(frontX(0.43, -0.09) + 0.002, 0.43, -0.09);
    this.chest.add(collar, placket, logo);
    this.chestLogo = logo;
    this.chestLogoPos = logo.position.clone();
    this.headGroup = new THREE.Group();
    this.headGroup.position.y = 0.73;
    this.chest.add(this.headGroup);
    // one mesh for the head: a narrower jaw, the chin a little forward
    const headGeo = new THREE.SphereGeometry(0.105, 18, 14);
    const hp = headGeo.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
      const low = Math.max(0, -y / 0.105); // 0 at the middle, 1 at the chin
      const zk = 1 - (female ? 0.3 : 0.24) * low * low;
      const xk = x > 0 ? 1 + 0.12 * low : 1 - 0.08 * low;
      hp.setXYZ(i, x * xk, y, z * zk);
    }
    headGeo.computeVertexNormals();
    const head = new THREE.Mesh(headGeo, new THREE.MeshLambertMaterial({ color: L.skin }));
    head.scale.set(1, 1.12, 0.95);
    head.castShadow = true;
    this.headGroup.add(head);
    const hairMat = new THREE.MeshLambertMaterial({ color: L.hair });
    const capMat = new THREE.MeshLambertMaterial({ color: L.cap });
    const skinMat = new THREE.MeshLambertMaterial({ color: L.skin });
    const dark = new THREE.MeshLambertMaterial({ color: '#1e1a18' });
    // face: eyes, brows, nose, ears
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 4), dark);
      eye.position.set(0.094, 0.012, side * 0.036);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.008, 0.035), hairMat);
      brow.position.set(0.096, 0.036, side * 0.036);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 5), skinMat);
      ear.scale.set(0.6, 1.2, 0.5);
      ear.position.set(0, 0.0, side * 0.1);
      this.headGroup.add(eye, brow, ear);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.04, 6), skinMat);
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(0.112, -0.005, 0);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.04), new THREE.MeshLambertMaterial({ color: '#8a4a3a' }));
    mouth.position.set(0.1, -0.05, 0);
    this.headGroup.add(nose, mouth);
    if (L.shades) {
      const shades = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.13), new THREE.MeshLambertMaterial({ color: '#121212' }));
      shades.position.set(0.1, 0.012, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.008, 0.006), new THREE.MeshLambertMaterial({ color: '#121212' }));
      for (const side of [-1, 1]) { const a = arm.clone(); a.position.set(0.05, 0.016, side * 0.1); this.headGroup.add(a); }
      this.headGroup.add(shades);
    }
    this.buildHair(L, hairMat);
    this.buildBeard(L, hairMat);
    this.buildHat(L, capMat);
    if (L.logo) this.buildSponsor(L.logo, L.hat);
    // anchors
    this.hubAnchor = new THREE.Object3D();
    this.hubAnchor.position.set(0.02, 0.5, 0);
    this.chest.add(this.hubAnchor);
    this.shL = new THREE.Object3D();
    this.shL.position.set(0.0, 0.5, -shoulderZ);
    this.shR = new THREE.Object3D();
    this.shR.position.set(0.0, 0.5, shoulderZ);
    this.chest.add(this.shL, this.shR);
    // arms: shaped upper arm and forearm, elbow joint, short sleeve, hand
    this.arms = [];
    for (const side of [-1, 1]) {
      const upper = lathe(PROFILE.upperArm, skin);
      const sleeve = lathe(PROFILE.sleeve, shirtMat());
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), skin);
      const fore = lathe(PROFILE.forearm, skin);
      // glove on the lead hand, bare trail hand; a mitten shape with a thumb
      const handMat = side < 0 ? lam(L.glove) : skin;
      const hand = new THREE.Group();
      const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), handMat);
      palm.scale.set(0.03, 0.05, 0.036);
      palm.position.y = 0.03;
      const thumb = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 5), handMat);
      thumb.scale.set(0.014, 0.03, 0.014);
      thumb.position.set(0.02, 0.03, -side * 0.02);
      for (const m of [palm, thumb]) { m.castShadow = true; hand.add(m); }
      this.root.add(upper, sleeve, elbow, fore, hand);
      this.arms.push({ side, upper, sleeve, elbow, fore, hand });
    }
    // club
    this.club = new THREE.Group();
    this.root.add(this.club);
    this.clubKind = null;
    this.setClub('iron', 0.94);

    // swing state
    this.anim = null;
    this.top = null;
    this.preK = 0;
    this.st = this.swingState('back', 0, 0);
    this.pose();
  }

  // Hair shows around the hat, or all over the head without one
  buildHair(L, hairMat) {
    const H = this.headGroup;
    const style = L.hairStyle;
    const open = L.hat === 'none' || L.hat === 'visor';
    const add = (geo, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, hairMat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); H.add(m); return m; };
    if (style === 'bald') {
      if (!open) add(new THREE.SphereGeometry(0.108, 12, 6, -Math.PI * 0.5, Math.PI, Math.PI * 0.5, Math.PI * 0.18), 0, 0.01, 0);
      return;
    }
    // back and sides under the hat (phi = 0 is the back of the head; the face looks along +x)
    add(new THREE.SphereGeometry(0.112, 12, 8, -Math.PI * 0.62, Math.PI * 1.24, Math.PI * 0.35, Math.PI * 0.38), 0, 0.005, 0);
    if (open && style !== 'mohawk') add(new THREE.SphereGeometry(0.114, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), -0.004, 0.012, 0, 1, 1.08, 1);
    if (style === 'mohawk') add(new THREE.BoxGeometry(0.2, 0.06, 0.035), -0.01, 0.115, 0);
    if (style === 'ponytail') add(new THREE.SphereGeometry(0.05, 8, 6), -0.12, -0.05, 0, 1, 1.9, 1);
    if (style === 'bun') add(new THREE.SphereGeometry(0.048, 10, 8), -0.1, open ? 0.08 : 0.02, 0);
    if (style === 'long') {
      add(new THREE.BoxGeometry(0.05, 0.22, 0.19), -0.085, -0.11, 0);
      for (const side of [-1, 1]) add(new THREE.BoxGeometry(0.1, 0.16, 0.03), -0.03, -0.08, side * 0.1);
    }
    if (style === 'curly') {
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI * 0.55 + (i / 8) * Math.PI * 1.1;
        add(new THREE.SphereGeometry(0.04, 7, 5), -Math.cos(a) * 0.1, -0.02 + (i % 2) * 0.04, Math.sin(a) * 0.1);
      }
      if (open) for (let i = 0; i < 5; i++) add(new THREE.SphereGeometry(0.045, 7, 5), -0.05 + i * 0.03, 0.1 - Math.abs(i - 2) * 0.012, (i % 2 ? 1 : -1) * 0.03);
    }
  }

  buildBeard(L, hairMat) {
    const H = this.headGroup;
    const b = L.beard;
    if (!b || b === 'none') return;
    // phi = PI faces forward (+x); theta runs from the crown down
    if (b === 'stubble' || b === 'beard') {
      const mat = b === 'stubble' ? new THREE.MeshLambertMaterial({ color: L.hair, transparent: true, opacity: 0.45 }) : hairMat;
      const r = b === 'stubble' ? 0.107 : 0.114;
      const jaw = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 6, Math.PI * 0.55, Math.PI * 0.9, Math.PI * 0.55, Math.PI * 0.32), mat);
      jaw.scale.set(1, 1.12, 0.95);
      H.add(jaw);
      if (b === 'beard') {
        const chin = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), hairMat);
        chin.scale.set(0.9, 1.3, 1.2);
        chin.position.set(0.07, -0.1, 0);
        H.add(chin);
      }
    }
    if (b === 'mustache' || b === 'beard' || b === 'goatee') {
      const mus = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.016, b === 'mustache' ? 0.07 : 0.055), hairMat);
      mus.position.set(0.108, -0.03, 0);
      H.add(mus);
    }
    if (b === 'goatee') {
      const g = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), hairMat);
      g.scale.set(1, 1.4, 1);
      g.position.set(0.09, -0.095, 0);
      H.add(g);
    }
  }

  buildHat(L, capMat) {
    const H = this.headGroup;
    const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; H.add(m); return m; };
    const accent = new THREE.MeshLambertMaterial({ color: L.accent });
    const brim = (r, w) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.012, 12, 1, false, -Math.PI / 2, Math.PI), capMat); b.scale.set(w, 1, 1); return b; };
    switch (L.hat) {
      case 'none': break;
      case 'visor': {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.109, 0.109, 0.035, 18, 1, true), new THREE.MeshLambertMaterial({ color: L.cap, side: THREE.DoubleSide }));
        add(band, 0, 0.05, 0);
        add(brim(0.085, 1.35), 0.09, 0.04, 0);
        break;
      }
      case 'bucket': {
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.113, 0.09, 16), capMat), 0, 0.085, 0);
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.117, 0.175, 0.035, 18, 1, true), new THREE.MeshLambertMaterial({ color: L.cap, side: THREE.DoubleSide })), 0, 0.03, 0);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.114, 0.114, 0.018, 16, 1, true), accent);
        add(band, 0, 0.05, 0);
        break;
      }
      case 'flat': {
        const top = new THREE.Mesh(new THREE.SphereGeometry(0.118, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
        top.scale.set(1.18, 0.74, 1.05);
        add(top, 0.015, 0.035, 0);
        add(brim(0.07, 1.2), 0.1, 0.038, 0);
        const btn = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), capMat);
        add(btn, 0.02, 0.122, 0);
        break;
      }
      case 'cowboy': {
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.1, 0.14, 14), capMat);
        crown.scale.set(1.08, 1, 0.9);
        add(crown, 0, 0.12, 0);
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.215, 0.012, 22), capMat);
        b.scale.set(1.05, 1, 0.82);
        add(b, 0, 0.05, 0);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.101, 0.101, 0.022, 14, 1, true), accent);
        band.scale.set(1.08, 1, 0.9);
        add(band, 0, 0.066, 0);
        // curled-up sides
        for (const side of [-1, 1]) {
          const c = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.05), capMat);
          c.rotation.x = side * 0.7;
          add(c, 0, 0.07, side * 0.19);
        }
        break;
      }
      case 'beanie': {
        const top = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.56), capMat);
        top.scale.set(1, 1.18, 1);
        add(top, 0, 0.02, 0);
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.118, 0.045, 16, 1, true), new THREE.MeshLambertMaterial({ color: L.cap, side: THREE.DoubleSide })), 0, 0.005, 0);
        add(new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 6), accent), 0, 0.15, 0);
        break;
      }
      default: {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
        add(cap, 0, 0.03, 0);
        add(brim(0.08, 1.3), 0.09, 0.035, 0);
        const capLogo = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.03, 0.045), new THREE.MeshLambertMaterial({ color: L.shirt }));
        capLogo.rotation.z = -0.5;
        add(capLogo, 0.105, 0.07, 0);
      }
    }
  }

  // A sponsor's name on the front of the cap and on the chest
  buildSponsor(logo, hat) {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 48;
    const g = cv.getContext('2d');
    g.fillStyle = logo.bg;
    g.fillRect(0, 0, 128, 48);
    g.fillStyle = logo.fg;
    g.font = '800 30px "Barlow Condensed", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(logo.text, 64, 26, 120);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    // chest patch replaces the little logo
    const chest = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.037), mat);
    chest.position.copy(this.chestLogoPos).add(new THREE.Vector3(0.004, 0, 0));
    chest.rotation.y = Math.PI / 2;
    this.chest.add(chest);
    this.chestLogo.visible = false;
    if (hat === 'cap' || hat === 'visor' || hat === 'flat' || hat === 'bucket') {
      const holder = new THREE.Group();
      const front = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.026), mat);
      front.rotation.y = Math.PI / 2;
      holder.add(front);
      const y = hat === 'visor' ? 0.05 : hat === 'bucket' ? 0.09 : 0.072;
      const x = hat === 'visor' ? 0.111 : hat === 'bucket' ? 0.104 : 0.108;
      holder.position.set(x, y, 0);
      holder.rotation.z = hat === 'visor' || hat === 'bucket' ? -0.1 : -0.5;
      this.headGroup.add(holder);
    }
  }

  // spec (optional): { id, loft, bounce } of the club in the bag
  setClub(kind, length, look = null, spec = null) {
    const id = (spec && spec.id) || (kind === 'wood' ? (length > 1.1 ? 'DR' : '3W') : kind === 'hybrid' ? '4H' : kind === 'wedge' ? 'SW' : kind === 'putter' ? 'PT' : '7I');
    const loft = spec && spec.loft != null ? spec.loft : DEFAULT_LOFT[id] ?? 30;
    const key = JSON.stringify([kind, length, id, loft, spec && spec.bounce, look]);
    if (this.clubKey === key) return;
    this.clubKey = key;
    this.clubKind = kind;
    this.clubLen = length;
    const setup = CLUB_SETUP[kind] || CLUB_SETUP.iron;
    this.setup = setup;
    this.putting = kind === 'putter';
    // the head is placed so its face centre meets the ball at address and
    // the shaft leaves the heel toward the hands
    const B = new THREE.Vector3(setup.ball, BALL_Y, 0);
    const A0 = B.clone().addScaledVector(addressDir(setup.lie), length);
    const built = buildClub({ kind, id, loft, lie: setup.lie, bounce: spec && spec.bounce, length, look: look || {} }, { ball: B, grip: A0 });
    while (this.club.children.length) this.club.remove(this.club.children[0]);
    this.club.add(built.group);
    this.hoselAt = built.hosel;
    this.computeAddress();
  }

  // Ball distance from the feet (the root should sit this far left of the ball)
  get ballDist() {
    return this.setup.ball;
  }

  computeAddress() {
    const s = this.setup;
    this.spineTilt = s.tilt;
    this.applyBody(this.swingState('back', 0, 0));
    this.root.updateMatrixWorld(true);
    const hub = this.localOf(this.hubAnchor);
    const B = new THREE.Vector3(s.ball, BALL_Y, 0);
    const A0 = B.clone().addScaledVector(addressDir(s.lie), this.clubLen);
    // the shaft runs from the hands to the top of the hosel (the head hangs
    // below it with its face centre on the ball)
    const H = this.hoselAt || B;
    this.hub = hub;
    this.ballLocal = H;
    this.v0 = A0.clone().sub(hub);
    this.d0 = H.clone().sub(A0).normalize();
    this.n = new THREE.Vector3().crossVectors(this.v0, new THREE.Vector3(0, 0, 1)).normalize();
  }

  localOf(obj) {
    const v = new THREE.Vector3();
    obj.getWorldPosition(v);
    return this.root.worldToLocal(v);
  }

  // Where every part of the body is at one moment of the swing. Three
  // phases: 'back' (k unused; `top` is how far back, 0..1.1, straight from
  // the drag), 'down' (k: 0 at the top .. 1 at impact) and 'through' (k: 0
  // at impact .. 1 in the finish). The downswing works from the ground up:
  // the weight shifts and the hips unwind first, the chest follows, the
  // arms drop, and the wrists hold their angle until late so the clubhead
  // whips through the ball.
  swingState(phase, k, top, power = top) {
    const S = { a: 0, h: 0, turn: 0, hip: 0, shift: 0, bend: 0, drop: 0, fin: 0, head: 0.85, look: 0, hands: 0, knee: 0, heel: 0 };
    const p = Math.max(0, top || 0), pp = Math.min(1, p);
    if (this.putting) {
      // a pendulum from the shoulders; the head stays perfectly still
      const a0 = 0.42 * p;
      if (phase === 'back') S.a = a0;
      else if (phase === 'down') S.a = a0 * (1 - k * k);
      else S.a = -0.42 * Math.max(0.35, power) * (1 - Math.pow(1 - k, 3));
      S.turn = -S.a * 0.25;
      S.head = 1;
      return S;
    }
    // backswing: the arms swing up the plane, the wrists set gradually, the
    // shoulders turn about twice as far as the hips, the weight moves onto
    // the trail side and the lead knee points in behind the ball
    const T = { a: 2.25 * p, h: 1.95 * smooth(0.04, 0.72, p), shift: 0.03 * smooth(0, 0.8, p), bend: 0.05 * pp, knee: pp };
    T.turn = -T.a * 0.66;
    T.hip = T.turn * 0.42;
    if (phase === 'back') return Object.assign(S, T);
    if (phase === 'down') {
      const club = (T.a + T.h) * (1 - Math.pow(k, 3));
      S.a = T.a * (1 - k * k);
      S.h = club - S.a; // the lag: the clubhead trails the hands until late
      S.hip = lerp(T.hip, 0.7 * pp, 1 - Math.pow(1 - k, 1.6));
      S.turn = lerp(T.turn, 0.3 * pp, Math.pow(k, 1.15));
      S.shift = lerp(T.shift, -0.07 * pp, smooth(0, 0.7, k));
      S.bend = lerp(T.bend, 0.13 * pp, smooth(0.1, 0.9, k));
      S.drop = -0.02 * pp * Math.sin(Math.PI * k);
      S.knee = lerp(T.knee, -0.35 * pp, smooth(0, 0.65, k));
      S.heel = 0.25 * pp * smooth(0.6, 1, k);
      return S;
    }
    // through the ball to a balanced finish: chest past the target, weight
    // on the lead side, trail foot up on its toe, eyes following the ball
    const I = this.swingState('down', 1, top);
    const e = 1 - Math.pow(1 - k, 2.6);
    const pw = Math.max(0.45, Math.min(1, power));
    S.a = -2.55 * pw * e;
    S.h = -1.5 * pw * e;
    S.hip = lerp(I.hip, 1.45 * pp, e);
    S.turn = lerp(I.turn, 1.75 * pp, e);
    S.shift = lerp(I.shift, -0.11 * pp, e);
    S.bend = lerp(I.bend, 0.03 * pp, e);
    S.drop = 0.03 * pp * e;
    S.fin = e * pp;
    S.knee = lerp(I.knee, -0.5 * pp, e);
    S.heel = lerp(I.heel, pp, smooth(0, 0.75, k));
    S.look = smooth(0.06, 0.5, k);
    S.hands = smooth(0.3, 1, e) * smooth(0.55, 0.9, pp);
    return S;
  }

  applyBody(S) {
    this.pelvis.position.set(0, 0.93 + S.drop, S.shift);
    // hips turn, then the whole upper body tilts about the target line
    // (away from the target through impact, keeping the head behind the ball)
    this.pelvis.rotation.set(S.bend, S.hip, 0);
    this.spine.rotation.z = -this.spineTilt * (1 - 0.55 * S.fin);
    this.chest.rotation.y = S.turn - S.hip;
    // eyes on the ball until after impact, then the head turns to watch it
    const hold = -S.turn * S.head;
    const watch = (1.25 * Math.min(1, S.fin + 0.3) - S.turn) * 0.9;
    this.headGroup.rotation.set(0, lerp(hold, watch, S.look), 0.35 * S.look);
  }

  // A point (or direction) in the chest's frame, in the golfer's own frame
  chestPoint(v) {
    return this.root.worldToLocal(this.chest.localToWorld(v.clone()));
  }
  chestDir(v) {
    return this.chestPoint(v).sub(this.chestPoint(new THREE.Vector3())).normalize();
  }

  pose() {
    const S = this.st;
    this.applyBody(S);
    this.root.updateMatrixWorld(true);
    // hands on the swing plane, carried along a little by the weight shift
    const hands = rotateAbout(this.v0, this.n, S.a, new THREE.Vector3()).add(this.hub);
    hands.y += S.drop;
    hands.z += S.shift * 0.6;
    const dir = rotateAbout(this.d0, this.n, S.a + S.h, new THREE.Vector3());
    // through impact the shaft points at the ball, so the hands lead it
    const c = S.a + S.h;
    const wBall = Math.exp(-(c * c) / 0.08);
    if (wBall > 0.001) dir.lerp(this.ballLocal.clone().sub(hands).normalize(), wBall).normalize();
    tmpQ.setFromUnitVectors(DOWN, dir);
    const poleL = new THREE.Vector3(0.2, -1, -0.8), poleR = new THREE.Vector3(0.2, -1, 0.8);
    if (S.hands > 0) {
      // ease into the finish: hands high, club wrapped behind the neck
      hands.lerp(this.chestPoint(FIN_HANDS), S.hands);
      finQ.setFromUnitVectors(DOWN, this.chestDir(FIN_CLUB));
      tmpQ.slerp(finQ, S.hands);
      dir.copy(DOWN).applyQuaternion(tmpQ);
      poleL.lerp(this.chestDir(FIN_POLE_L), S.hands);
      poleR.lerp(this.chestDir(FIN_POLE_R), S.hands);
    }
    // club: grip at the hands, shaft along dir
    this.club.position.copy(hands);
    this.club.quaternion.copy(tmpQ);
    // arms by IK: lead (left) hand at the top of the grip, trail hand just below
    const shL = this.localOf(this.shL), shR = this.localOf(this.shR);
    const tL = hands.clone();
    const tR = hands.clone().addScaledVector(dir, 0.09);
    this.solveArm(this.arms[0], shL, tL, poleL);
    this.solveArm(this.arms[1], shR, tR, poleR);
    this.legsSwing(S);
  }

  // Legs through the swing: hips follow the pelvis, knees by IK, the lead
  // foot planted, the trail heel rising until that foot turns onto its toe
  legsSwing(S) {
    for (const leg of this.legs) {
      const lead = leg.side < 0;
      const z = leg.side * 0.165;
      const hipP = this.root.worldToLocal(this.pelvis.localToWorld(new THREE.Vector3(-0.012, -0.005, leg.side * 0.088)));
      const heel = lead ? 0 : S.heel;
      shoeEuler.set(0, 0.5 * heel, -1.05 * heel);
      leg.shoe.quaternion.setFromEuler(shoeEuler);
      // pivot about the ball of the foot
      const pivot = new THREE.Vector3(0.13, 0, z);
      leg.shoe.position.copy(pivot).sub(new THREE.Vector3(0.11, 0, 0).applyQuaternion(leg.shoe.quaternion));
      const ankle = leg.shoe.position.clone().add(new THREE.Vector3(-0.02, 0.09, 0).applyQuaternion(leg.shoe.quaternion));
      // knees flex forward; the lead knee points in behind the ball at the
      // top, then out towards the target; the trail knee kicks in at the end
      const pole = lead ? new THREE.Vector3(1, 0, 0.55 * S.knee - 0.1) : new THREE.Vector3(1, 0, 0.12 - 1.3 * heel);
      const knee = bendJoint(hipP, ankle, THIGH, SHIN, pole);
      place(leg.thigh, hipP, knee);
      leg.knee.position.copy(knee);
      place(leg.shin, knee, ankle);
      if (leg.shorts) place(leg.shorts, hipP.clone().add(new THREE.Vector3(0, 0.03, 0)), hipP.clone().lerp(knee, 0.6));
      if (leg.sock) place(leg.sock, ankle, ankle.clone().lerp(knee, 0.3));
    }
  }

  // Standing legs (reactions and portraits)
  poseLegs(finish, kneeX, stance = 1) {
    for (const leg of this.legs) {
      const z = leg.side * 0.15 * stance;
      const hipP = new THREE.Vector3(-0.012, 0.925, leg.side * 0.088);
      const knee = new THREE.Vector3(kneeX + (leg.side > 0 && finish > 0.3 ? 0.1 * finish : 0), 0.5, z * 1.02 + (leg.side > 0 ? -0.08 * finish : 0));
      const ankle = new THREE.Vector3(0.0, 0.09, z * 1.1);
      place(leg.thigh, hipP, knee);
      leg.knee.position.copy(knee);
      place(leg.shin, knee, ankle);
      if (leg.shorts) place(leg.shorts, hipP.clone().add(new THREE.Vector3(0, 0.03, 0)), hipP.clone().lerp(knee, 0.6));
      if (leg.sock) place(leg.sock, ankle, ankle.clone().lerp(knee, 0.3));
      leg.shoe.position.set(0.02, 0, z * 1.1);
      // trail heel comes up and the foot rolls in the finish
      leg.shoe.rotation.set(0, 0, leg.side > 0 ? -0.9 * Math.max(0, finish - 0.4) : 0);
      if (leg.side > 0 && finish > 0.4) leg.shoe.position.y = 0.06 * (finish - 0.4) / 0.6;
    }
  }

  // After holing out: 'arms' (eagle or better), 'fist' (birdie),
  // 'tip' (tip of the cap for a par) or 'sad' (hands on hips)
  react(kind) {
    this.anim = null;
    this.reaction = { kind, t: 0 };
  }

  poseReaction() {
    const r = this.reaction;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const k = Math.min(1, r.t / 0.35);
    const e = k * k * (3 - 2 * k);
    this.pelvis.rotation.set(0, 0, 0);
    this.pelvis.position.set(0, 0.93, 0);
    this.chest.rotation.y = 0;
    this.headGroup.rotation.y = 0;
    this.spine.rotation.z = -this.spineTilt * (1 - e) - (r.kind === 'sad' ? 0.14 : 0.03) * e;
    this.headGroup.rotation.z = (r.kind === 'sad' ? -0.5 : r.kind === 'arms' ? 0.3 : 0.08) * e;
    this.root.updateMatrixWorld(true);
    const shL = this.localOf(this.shL), shR = this.localOf(this.shR);
    const pump = r.kind === 'fist' && r.t < 1.8 ? Math.max(0, Math.sin(r.t * 11)) * 0.09 : 0;
    const jump = r.kind === 'arms' && r.t < 1.6 ? Math.max(0, Math.sin(r.t * 9)) * 0.06 : 0;
    let tL, tR, dir;
    if (r.kind === 'arms') {
      tL = shL.clone().add(V(0.06, 0.56, -0.18)); tR = shR.clone().add(V(0.06, 0.56, 0.18)); dir = V(0.1, 1, -0.35).normalize();
    } else if (r.kind === 'fist') {
      tL = shL.clone().add(V(0.14, 0.46 + pump, -0.05)); tR = shR.clone().add(V(0.14, -0.4, 0.04)); dir = V(0.25, 1, -0.2).normalize();
    } else if (r.kind === 'tip') {
      const hp = this.localOf(this.headGroup);
      tR = hp.clone().add(V(0.1, 0.1, 0.11)); tL = shL.clone().add(V(0.14, -0.5, -0.02)); dir = V(0.3, -1, 0.05).normalize();
    } else {
      tL = shL.clone().add(V(0.02, -0.33, -0.15)); tR = shR.clone().add(V(0.02, -0.33, 0.15)); dir = V(0.35, -1, -0.1).normalize();
    }
    const hangL = shL.clone().add(V(0.12, -0.55, 0.02)), hangR = shR.clone().add(V(0.12, -0.55, -0.02));
    tL = hangL.lerp(tL, e);
    tR = hangR.lerp(tR, e);
    this.solveArm(this.arms[0], shL, tL, V(-0.4, -0.6, -1));
    this.solveArm(this.arms[1], shR, tR, V(-0.4, -0.6, 1));
    this.club.position.copy(tL);
    tmpQ.setFromUnitVectors(V(0, -1, 0), dir);
    this.club.quaternion.copy(tmpQ);
    this.poseLegs(0, 0.04, 0.72);
    this.root.position.y = this.baseY + jump;
  }

  solveArm(arm, S, T, pole) {
    const E = bendJoint(S, T, 0.3, 0.3, pole);
    const dir = new THREE.Vector3();
    place(arm.upper, S, E);
    place(arm.sleeve, S, new THREE.Vector3().lerpVectors(S, E, 0.5));
    arm.elbow.position.copy(E);
    place(arm.fore, E, T);
    // the hand continues the line of the forearm from the wrist
    arm.hand.position.copy(T).addScaledVector(dir.copy(T).sub(E).normalize(), -0.012);
    arm.hand.quaternion.copy(arm.fore.quaternion);
  }

  placeAt(ballPos, heading) {
    // stand to the left of the ball (for a right-hander) facing it
    const r = { x: Math.cos(heading), z: Math.sin(heading) };
    this.root.position.set(ballPos.x - r.x * this.ballDist, ballPos.y, ballPos.z - r.z * this.ballDist);
    this.baseY = ballPos.y;
    this.root.rotation.y = -heading;
    this.heading = heading;
  }

  // Backswing depth follows the player's drag directly (0..1.1)
  setBackswing(p) {
    this.anim = null;
    this.reaction = null;
    this.top = p;
    this.preK = 0;
    this.st = this.swingState('back', 0, p);
    this.pose();
  }

  // While the player pushes forward, the downswing starts with them: the
  // hips unwind and the arms drop into the slot (f: 0..1 of the push)
  setDownswing(f) {
    if (this.anim || this.reaction || this.top == null) return;
    this.preK = 0.45 * Math.min(1, Math.max(0, f));
    this.st = this.swingState('down', this.preK, this.top);
    this.pose();
  }

  address() {
    this.anim = null;
    if (this.reaction) { this.reaction = null; this.headGroup.rotation.z = 0; if (this.baseY != null) this.root.position.y = this.baseY; }
    this.top = null;
    this.preK = 0;
    this.st = this.swingState('back', 0, 0);
    this.pose();
  }

  // Downswing to impact, then follow through. onImpact fires at contact.
  swing(power, onImpact) {
    const putt = this.putting;
    const top = this.top != null ? this.top : power;
    const down = putt ? 0.32 + 0.1 * power : 0.24 + 0.06 * (1 - Math.min(1, power));
    const follow = putt ? 0.45 : 0.75;
    // carry on from wherever the forward push already took the downswing
    this.anim = { t: (this.preK || 0) * down, down, follow, top, power, onImpact, impacted: false };
    return down - this.anim.t; // seconds until the club meets the ball
  }

  update(dt) {
    const an = this.anim;
    this.idleT = (this.idleT || 0) + dt;
    // gentle breathing when standing over the ball
    this.chest.scale.set(1, 1 + Math.sin(this.idleT * 1.6) * 0.008, 1 + Math.sin(this.idleT * 1.6) * 0.012);
    if (this.reaction) {
      this.reaction.t += dt;
      this.poseReaction();
      return;
    }
    if (!an) return;
    an.t += dt;
    if (an.t < an.down) {
      this.st = this.swingState('down', an.t / an.down, an.top, an.power);
    } else {
      if (!an.impacted) { an.impacted = true; if (an.onImpact) an.onImpact(); }
      const k = Math.min(1, (an.t - an.down) / an.follow);
      this.st = this.swingState('through', k, an.top, an.power);
      if (k >= 1) this.anim = null;
    }
    this.pose();
  }

  get swinging() {
    return !!this.anim;
  }
}
