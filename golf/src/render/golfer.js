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
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.08, 0.11), new THREE.MeshLambertMaterial({ color: '#f4f4f4' }));
      shoe.castShadow = true;
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
    this.headGroup = new THREE.Group();
    this.headGroup.position.y = 0.73;
    this.chest.add(this.headGroup);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 10), new THREE.MeshLambertMaterial({ color: L.skin }));
    head.scale.set(1, 1.12, 0.95);
    head.castShadow = true;
    this.headGroup.add(head);
    const hairMat = new THREE.MeshLambertMaterial({ color: L.hair });
    const capMat = new THREE.MeshLambertMaterial({ color: L.cap });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
    cap.position.y = 0.03;
    this.headGroup.add(cap);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.012, 12, 1, false, -Math.PI / 2, Math.PI), capMat);
    brim.scale.set(1.3, 1, 1);
    brim.position.set(0.09, 0.035, 0);
    this.headGroup.add(brim);
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
      const upper = limb(0.048, L.shirt);
      const fore = limb(0.04, L.skin);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshLambertMaterial({ color: side < 0 ? '#f4f4f4' : L.skin }));
      this.root.add(upper, fore, hand);
      this.arms.push({ side, upper, fore, hand });
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

  setClub(kind, length) {
    if (this.clubKind === kind && this.clubLen === length) return;
    this.clubKind = kind;
    this.clubLen = length;
    while (this.club.children.length) this.club.remove(this.club.children[0]);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.0045, length, 6), new THREE.MeshLambertMaterial({ color: '#c9ccd1' }));
    shaft.position.y = -length / 2;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.011, 0.26, 8), new THREE.MeshLambertMaterial({ color: '#1b1b1b' }));
    grip.position.y = -0.1;
    let head;
    if (kind === 'wood' || kind === 'hybrid') {
      head = new THREE.Mesh(new THREE.SphereGeometry(kind === 'wood' ? 0.062 : 0.045, 12, 8), new THREE.MeshLambertMaterial({ color: '#23262b' }));
      head.scale.set(1.25, 0.6, 1);
      head.position.set(0.035, -length, 0);
    } else if (kind === 'putter') {
      head = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.11), new THREE.MeshLambertMaterial({ color: '#8f959c' }));
      head.position.set(0.01, -length, 0);
    } else {
      head = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.05, 0.085), new THREE.MeshLambertMaterial({ color: '#b8bec6' }));
      head.position.set(0.01, -length + 0.01, 0);
    }
    for (const m of [shaft, grip, head]) { m.castShadow = true; this.club.add(m); }
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
      leg.shoe.position.set(0.05, 0.04, z * 1.12);
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
