// A low-poly golfer with a real swing: arms and club rotate on a tilted
// swing plane around a hub between the shoulders, wrists hinge and release,
// shoulders and hips turn, and the arms are solved with two-bone IK.
//
// Local space: the golfer faces +x (the ball), the target is along -z
// (the golfer's left, for a right-hander), y is up. The root sits at the feet.
import * as THREE from '../../vendor/three.module.min.js';

const UP = new THREE.Vector3(0, 1, 0);
const tmpQ = new THREE.Quaternion();

function limb(radius, color) {
  const g = new THREE.CylinderGeometry(radius, radius * 0.9, 1, 8);
  g.translate(0, 0.5, 0);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color }));
  m.castShadow = true;
  return m;
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
    };
    const L = this.look;
    // legs (static)
    this.legs = [];
    for (const side of [-1, 1]) {
      const thigh = limb(0.075, L.pants);
      const shin = limb(0.06, L.pants);
      // two-tone golf shoe: white upper, dark sole, rounded toe
      const shoe = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.075, 0.105), new THREE.MeshLambertMaterial({ color: '#f4f4f4' }));
      upper.position.set(-0.02, 0.045, 0);
      const toe = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.075, 10, 1, false, 0, Math.PI), new THREE.MeshLambertMaterial({ color: '#f4f4f4' }));
      toe.position.set(0.09, 0.045, 0);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.018, 0.112), new THREE.MeshLambertMaterial({ color: '#2b2b2b' }));
      sole.position.set(0.01, 0.009, 0);
      const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.078, 0.108), new THREE.MeshLambertMaterial({ color: L.shoe || '#1b1b1b' }));
      saddle.position.set(0.02, 0.046, 0);
      for (const m of [upper, toe, sole, saddle]) { m.castShadow = true; shoe.add(m); }
      this.root.add(thigh, shin, shoe);
      this.legs.push({ side, thigh, shin, shoe });
    }
    // pelvis + torso chain
    this.pelvis = new THREE.Group();
    this.pelvis.position.set(0, 0.93, 0);
    this.root.add(this.pelvis);
    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.36), new THREE.MeshLambertMaterial({ color: L.pants }));
    hips.castShadow = true;
    this.pelvis.add(hips);
    // belt with a buckle
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.045, 0.38), new THREE.MeshLambertMaterial({ color: L.belt || '#1b1b1b' }));
    belt.position.y = 0.11;
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.05), new THREE.MeshLambertMaterial({ color: '#c9ccd1' }));
    buckle.position.set(0.13, 0.11, 0);
    this.pelvis.add(belt, buckle);
    this.spine = new THREE.Group();
    this.pelvis.add(this.spine);
    this.chest = new THREE.Group();
    this.spine.add(this.chest);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 4, 10), new THREE.MeshLambertMaterial({ color: L.shirt }));
    torso.scale.set(0.95, 1, 1.22);
    torso.position.y = 0.3;
    torso.castShadow = true;
    this.chest.add(torso);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8), new THREE.MeshLambertMaterial({ color: L.skin }));
    neck.position.y = 0.6;
    this.chest.add(neck);
    // polo collar and button placket
    const shirtC = new THREE.Color(L.shirt);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 14), new THREE.MeshLambertMaterial({ color: shirtC.clone().lerp(new THREE.Color('#ffffff'), 0.15) }));
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.57;
    const placket = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.12, 0.035), new THREE.MeshLambertMaterial({ color: shirtC.clone().multiplyScalar(0.8) }));
    placket.position.set(0.19, 0.49, 0);
    const logo = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.04, 0.05), new THREE.MeshLambertMaterial({ color: L.cap }));
    logo.position.set(0.18, 0.44, -0.11);
    this.chest.add(collar, placket, logo);
    this.headGroup = new THREE.Group();
    this.headGroup.position.y = 0.73;
    this.chest.add(this.headGroup);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 10), new THREE.MeshLambertMaterial({ color: L.skin }));
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
      this.headGroup.add(shades);
    }
    // hair showing under the cap at the back and sides
    // phi = 0 is the back of the head (the face looks along +x)
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.112, 12, 8, -Math.PI * 0.62, Math.PI * 1.24, Math.PI * 0.35, Math.PI * 0.38), hairMat);
    hair.position.y = 0.005;
    this.headGroup.add(hair);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
    cap.position.y = 0.03;
    this.headGroup.add(cap);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.012, 12, 1, false, -Math.PI / 2, Math.PI), capMat);
    brim.scale.set(1.3, 1, 1);
    brim.position.set(0.09, 0.035, 0);
    const capLogo = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.03, 0.045), new THREE.MeshLambertMaterial({ color: L.shirt }));
    capLogo.position.set(0.105, 0.07, 0);
    capLogo.rotation.z = -0.5;
    this.headGroup.add(brim, capLogo);
    if (L.gender === 'f') {
      const tail = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), hairMat);
      tail.scale.set(1, 1.9, 1);
      tail.position.set(-0.12, -0.05, 0);
      this.headGroup.add(tail);
    }
    // anchors
    this.hubAnchor = new THREE.Object3D();
    this.hubAnchor.position.set(0.02, 0.5, 0);
    this.chest.add(this.hubAnchor);
    this.shL = new THREE.Object3D();
    this.shL.position.set(0.0, 0.5, -0.2);
    this.shR = new THREE.Object3D();
    this.shR.position.set(0.0, 0.5, 0.2);
    this.chest.add(this.shL, this.shR);
    // arms
    this.arms = [];
    for (const side of [-1, 1]) {
      const upper = limb(0.045, L.skin);
      const sleeve = limb(0.058, L.shirt);
      const fore = limb(0.04, L.skin);
      // glove on the lead hand, bare trail hand
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshLambertMaterial({ color: side < 0 ? '#f4f4f4' : L.skin }));
      this.root.add(upper, sleeve, fore, hand);
      this.arms.push({ side, upper, sleeve, fore, hand });
    }
    // club
    this.club = new THREE.Group();
    this.root.add(this.club);
    this.clubKind = null;
    this.setClub('iron', 0.94);

    // swing state
    this.a = 0; this.hinge = 0; this.turn = 0;
    this.anim = null;
    this.finishFrac = 0;
    this.putting = false;
    this.pose();
  }

  setClub(kind, length, look = null) {
    const key = `${kind}|${length}|${look ? JSON.stringify(look) : ''}`;
    if (this.clubKey === key) return;
    this.clubKey = key;
    this.clubKind = kind;
    this.clubLen = length;
    while (this.club.children.length) this.club.remove(this.club.children[0]);
    const lk = look || {};
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.0045, length, 6), new THREE.MeshLambertMaterial({ color: kind === 'wood' || kind === 'hybrid' ? '#2a2d33' : '#c9ccd1' }));
    shaft.position.y = -length / 2;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.011, 0.26, 8), new THREE.MeshLambertMaterial({ color: '#1b1b1b' }));
    grip.position.y = -0.1;
    const parts = [shaft, grip];
    const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
    const headY = -length;
    if (kind === 'wood' || kind === 'hybrid') {
      const size = (lk.size || 1) * (kind === 'wood' && length > 1.1 ? 1 : 0.78);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.062 * size, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(lk.crown || '#23262b'));
      crown.scale.set(1.3, 0.62, 1.05);
      crown.position.set(0.035, headY + 0.004, 0);
      const sole = new THREE.Mesh(new THREE.SphereGeometry(0.062 * size, 16, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(lk.head || '#23262b'));
      sole.scale.set(1.3, 0.28, 1.05);
      sole.position.copy(crown.position);
      const face = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.036 * size, 0.1 * size), mat('#9aa0a8'));
      face.position.set(0.035 + 0.078 * size, headY + 0.012, 0);
      parts.push(crown, sole, face);
    } else if (kind === 'putter') {
      if (lk.style === 'mallet') {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.028, 16, 1, false, -Math.PI / 2, Math.PI), mat(lk.head || '#1b1b1b'));
        body.rotation.z = Math.PI / 2;
        body.rotation.y = Math.PI / 2;
        body.position.set(-0.01, headY, 0);
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.006), mat(lk.accent || '#ffffff'));
        line.position.set(-0.02, headY + 0.003, 0);
        parts.push(body, line);
      } else {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.028, 0.11), mat(lk.head || '#8f959c'));
        body.position.set(0.01, headY, 0);
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.029, 0.004), mat(lk.accent || '#ffffff'));
        line.position.set(0.005, headY + 0.001, 0);
        parts.push(body, line);
      }
    } else {
      const size = lk.size || 1;
      const thick = lk.style === 'blade' ? 0.012 : lk.style === 'wedge' ? 0.016 : 0.022;
      const head = new THREE.Mesh(new THREE.BoxGeometry(thick, 0.05 * size, 0.082 * size), mat(lk.head || '#b8bec6'));
      head.position.set(0.01, headY + 0.01, 0);
      parts.push(head);
      if (lk.style === 'cavity') {
        const badge = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.02 * size, 0.04 * size), mat(lk.accent || '#c1121f'));
        badge.position.set(0.01 - thick / 2 - 0.002, headY + 0.008, 0.004);
        parts.push(badge);
      }
      const hosel = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.05, 6), mat(lk.head || '#b8bec6'));
      hosel.position.set(0.004, headY + 0.035, -0.035);
      parts.push(hosel);
    }
    for (const m of parts) { m.castShadow = true; this.club.add(m); }
    const setup = CLUB_SETUP[kind] || CLUB_SETUP.iron;
    this.setup = setup;
    this.putting = kind === 'putter';
    this.computeAddress();
  }

  // Ball distance from the feet (the root should sit this far left of the ball)
  get ballDist() {
    return this.setup.ball;
  }

  computeAddress() {
    const s = this.setup;
    this.spineTilt = s.tilt;
    this.applyBody(0, 0, 0);
    this.root.updateMatrixWorld(true);
    const hub = this.localOf(this.hubAnchor);
    const B = new THREE.Vector3(s.ball, 0.025, 0);
    const lie = (s.lie * Math.PI) / 180;
    const u = new THREE.Vector3(-Math.cos(lie), Math.sin(lie), -0.04).normalize();
    const A0 = B.clone().addScaledVector(u, this.clubLen);
    this.hub = hub;
    this.v0 = A0.clone().sub(hub);
    this.d0 = B.clone().sub(A0).normalize();
    this.n = new THREE.Vector3().crossVectors(this.v0, new THREE.Vector3(0, 0, 1)).normalize();
  }

  localOf(obj) {
    const v = new THREE.Vector3();
    obj.getWorldPosition(v);
    return this.root.worldToLocal(v);
  }

  applyBody(turn, hip, finish) {
    this.pelvis.rotation.y = hip;
    this.spine.rotation.z = -this.spineTilt * (1 - 0.55 * finish);
    this.chest.rotation.y = turn - hip;
    // keep the eyes on the ball until after impact
    this.headGroup.rotation.y = -(turn - hip) * (1 - finish) * 0.7;
  }

  pose() {
    const a = this.a, h = this.hinge;
    const putt = this.putting;
    const turn = putt ? -a * 0.25 : -a * 0.6;
    const hip = putt ? 0 : turn * 0.45;
    this.applyBody(turn, hip, this.finishFrac);
    this.root.updateMatrixWorld(true);
    const hands = rotateAbout(this.v0, this.n, a, new THREE.Vector3()).add(this.hub);
    const dir = rotateAbout(this.d0, this.n, a + h, new THREE.Vector3());
    // club: grip at the hands, shaft along dir
    this.club.position.copy(hands);
    tmpQ.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    this.club.quaternion.copy(tmpQ);
    // arms by IK: lead (left) hand at the top of the grip, trail hand just below
    const shL = this.localOf(this.shL), shR = this.localOf(this.shR);
    const tL = hands.clone();
    const tR = hands.clone().addScaledVector(dir, 0.09);
    this.solveArm(this.arms[0], shL, tL, new THREE.Vector3(0.2, -1, -0.8));
    this.solveArm(this.arms[1], shR, tR, new THREE.Vector3(0.2, -1, 0.8));
    // legs
    for (const leg of this.legs) {
      const z = leg.side * 0.15;
      const hipP = new THREE.Vector3(-0.02, 0.9, leg.side * 0.1);
      const knee = new THREE.Vector3(0.12 + (leg.side > 0 && this.finishFrac > 0.3 ? 0.1 * this.finishFrac : 0), 0.5, z * 1.05 + (leg.side > 0 ? -0.08 * this.finishFrac : 0));
      const ankle = new THREE.Vector3(0.0, 0.09, z * 1.12);
      place(leg.thigh, hipP, knee);
      place(leg.shin, knee, ankle);
      leg.shoe.position.set(0.02, 0, z * 1.12);
    }
  }

  solveArm(arm, S, T, pole) {
    const l1 = 0.3, l2 = 0.3;
    const dv = new THREE.Vector3().subVectors(T, S);
    let d = dv.length();
    const dir = dv.clone().normalize();
    let E;
    if (d >= l1 + l2 - 0.002) {
      E = S.clone().addScaledVector(dir, l1 * (d / (l1 + l2)));
    } else {
      d = Math.max(d, 0.05);
      const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
      const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
      const perp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
      E = S.clone().addScaledVector(dir, l1 * cosA).addScaledVector(perp, l1 * sinA);
    }
    place(arm.upper, S, E);
    place(arm.sleeve, S, new THREE.Vector3().lerpVectors(S, E, 0.55));
    place(arm.fore, E, T);
    arm.hand.position.copy(T);
  }

  placeAt(ballPos, heading) {
    // stand to the left of the ball (for a right-hander) facing it
    const r = { x: Math.cos(heading), z: Math.sin(heading) };
    this.root.position.set(ballPos.x - r.x * this.ballDist, ballPos.y, ballPos.z - r.z * this.ballDist);
    this.root.rotation.y = -heading;
    this.heading = heading;
  }

  // Backswing depth follows the player's drag directly (0..1.1)
  setBackswing(p) {
    this.anim = null;
    this.finishFrac = 0;
    if (this.putting) {
      this.a = 0.42 * p;
      this.hinge = 0;
    } else {
      this.a = 2.25 * p;
      this.hinge = 1.95 * Math.min(1, p * 1.4);
    }
    this.pose();
  }

  address() {
    this.anim = null;
    this.a = 0; this.hinge = 0; this.finishFrac = 0;
    this.pose();
  }

  // Downswing to impact, then follow through. onImpact fires at contact.
  swing(power, onImpact) {
    const a0 = this.a, h0 = this.hinge;
    const putt = this.putting;
    const down = putt ? 0.32 + 0.1 * power : 0.2 + 0.06 * (1 - Math.min(1, power));
    const follow = putt ? 0.45 : 0.6;
    const aEnd = putt ? -0.42 * Math.max(0.35, power) : -2.55 * Math.max(0.45, Math.min(1, power));
    const hEnd = putt ? 0 : -1.5 * Math.max(0.4, Math.min(1, power));
    this.anim = { t: 0, down, follow, a0, h0, aEnd, hEnd, onImpact, impacted: false };
  }

  update(dt) {
    const an = this.anim;
    this.idleT = (this.idleT || 0) + dt;
    // gentle breathing when standing over the ball
    this.chest.scale.set(1, 1 + Math.sin(this.idleT * 1.6) * 0.008, 1 + Math.sin(this.idleT * 1.6) * 0.012);
    if (!an) return;
    an.t += dt;
    if (an.t < an.down) {
      const k = an.t / an.down;
      const e = k * k; // accelerate into the ball
      this.a = an.a0 * (1 - e);
      this.hinge = an.h0 * (1 - Math.pow(k, 3)); // late release
      this.finishFrac = 0;
    } else {
      if (!an.impacted) { an.impacted = true; if (an.onImpact) an.onImpact(); }
      const k = Math.min(1, (an.t - an.down) / an.follow);
      const e = 1 - Math.pow(1 - k, 3);
      this.a = an.aEnd * e;
      this.hinge = an.hEnd * e;
      this.finishFrac = this.putting ? 0 : e;
      if (k >= 1) this.anim = null;
    }
    this.pose();
  }

  get swinging() {
    return !!this.anim;
  }
}
