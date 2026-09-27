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
    };
    const L = this.look;
    const shirtMap = shirtTexture(L.shirt, L.accent, L.pattern);
    const shirtMat = () => new THREE.MeshLambertMaterial(shirtMap ? { color: '#ffffff', map: shirtMap } : { color: L.shirt });
    // legs (static)
    this.legs = [];
    for (const side of [-1, 1]) {
      const thigh = limb(0.075, L.pants);
      // shorts show the shins, with socks above the shoe
      const shin = limb(0.06, L.shorts ? L.skin : L.pants);
      const sock = L.shorts ? limb(0.064, L.socks) : null;
      if (sock) this.root.add(sock);
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
      this.legs.push({ side, thigh, shin, shoe, sock });
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
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 4, 12), shirtMat());
    torso.scale.set(0.95, 1, 1.22);
    torso.position.y = 0.3;
    torso.castShadow = true;
    this.chest.add(torso);
    if (L.vest) {
      // sweater vest over the shirt: the sleeves and collar still show
      const vest = new THREE.Mesh(new THREE.CapsuleGeometry(0.1715, 0.16, 4, 12), new THREE.MeshLambertMaterial({ color: L.vest }));
      vest.scale.set(0.955, 1, 1.225);
      vest.position.y = 0.31;
      vest.castShadow = true;
      const vtrim = new THREE.Mesh(new THREE.TorusGeometry(0.166, 0.008, 6, 20), new THREE.MeshLambertMaterial({ color: L.accent }));
      vtrim.rotation.x = Math.PI / 2;
      vtrim.scale.set(0.955, 1.225, 1);
      vtrim.position.y = 0.11;
      this.chest.add(vest, vtrim);
    }
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
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.008, 0.006), new THREE.MeshLambertMaterial({ color: '#121212' }));
      for (const side of [-1, 1]) { const a = arm.clone(); a.position.set(0.05, 0.016, side * 0.1); this.headGroup.add(a); }
      this.headGroup.add(shades);
    }
    this.buildHair(L, hairMat);
    this.buildBeard(L, hairMat);
    this.buildHat(L, capMat);
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
      const sleeve = new THREE.Mesh(limb(0.058, L.shirt).geometry, shirtMat());
      sleeve.castShadow = true;
      const fore = limb(0.04, L.skin);
      // glove on the lead hand, bare trail hand
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshLambertMaterial({ color: side < 0 ? L.glove : L.skin }));
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
        top.scale.set(1.18, 0.55, 1.03);
        add(top, 0.015, 0.04, 0);
        add(brim(0.07, 1.2), 0.1, 0.038, 0);
        const btn = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), capMat);
        add(btn, 0.02, 0.105, 0);
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
    this.poseLegs(this.finishFrac, 0.12);
  }

  poseLegs(finish, kneeX) {
    for (const leg of this.legs) {
      const z = leg.side * 0.15;
      const hipP = new THREE.Vector3(-0.02, 0.9, leg.side * 0.1);
      const knee = new THREE.Vector3(kneeX + (leg.side > 0 && finish > 0.3 ? 0.1 * finish : 0), 0.5, z * 1.05 + (leg.side > 0 ? -0.08 * finish : 0));
      const ankle = new THREE.Vector3(0.0, 0.09, z * 1.12);
      place(leg.thigh, hipP, knee);
      place(leg.shin, knee, ankle);
      if (leg.sock) place(leg.sock, ankle, ankle.clone().lerp(knee, 0.3));
      leg.shoe.position.set(0.02, 0, z * 1.12);
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
    this.pelvis.rotation.y = 0;
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
    this.poseLegs(0, 0.04);
    this.root.position.y = this.baseY + jump;
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
    this.baseY = ballPos.y;
    this.root.rotation.y = -heading;
    this.heading = heading;
  }

  // Backswing depth follows the player's drag directly (0..1.1)
  setBackswing(p) {
    this.anim = null;
    this.reaction = null;
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
    if (this.reaction) { this.reaction = null; this.headGroup.rotation.z = 0; if (this.baseY != null) this.root.position.y = this.baseY; }
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
    if (this.reaction) {
      this.reaction.t += dt;
      this.poseReaction();
      return;
    }
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
