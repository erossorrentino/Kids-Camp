// Golf clubs in 3D, shaped like the real thing: a pear-shaped driver with a
// domed crown, a lofted face with score lines, an adjustable hosel and a
// sole weight; smaller fairway woods and hybrids; irons that taper from a
// thin top line to a wide sole, as muscle-back blades or cavity backs with a
// badge; wedges with a rounded toe and a bounced sole; Anser-style blade and
// fang mallet putters; chrome step-pattern steel or painted graphite shafts;
// and tapered rubber grips.
//
// Heads are designed in the golfer's address frame, measured from the
// centre of the ball: x runs from the heel out to the toe (away from the
// golfer), y is up and the target is along -z. The sole sits on the ground,
// the face touches the back of the ball at its loft, and the shaft leaves
// the heel along the club's lie angle. `buildClub` turns that into the
// club's own frame (grip end at the origin, shaft down -y) for the swing.
import * as THREE from '../../vendor/three.module.min.js';

export const BALL_Y = 0.025; // ball centre above the ground at address
const RB = 0.021335; // ball radius
const DEG = Math.PI / 180;
const DOWN = new THREE.Vector3(0, -1, 0);

// Shaft direction at address, from the head up to the hands
export function addressDir(lieDeg) {
  const lie = lieDeg * DEG;
  return new THREE.Vector3(-Math.cos(lie), Math.sin(lie), -0.04).normalize();
}

const col = (() => {
  const cache = new Map();
  return (hex) => {
    if (!cache.has(hex)) cache.set(hex, new THREE.Color(hex));
    return cache.get(hex);
  };
})();

// Collects triangles for one material, with a colour per vertex
class Bucket {
  constructor() { this.pos = []; this.col = []; this.idx = []; }
  vert(x, y, z, hex) {
    const c = col(hex);
    this.pos.push(x, y, z);
    this.col.push(c.r, c.g, c.b);
    return this.pos.length / 3 - 1;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  // Merge a three.js geometry, transformed by `m`, in one colour
  add(geo, hex, m = null) {
    const g = geo;
    if (m) g.applyMatrix4(m);
    const p = g.attributes.position;
    const base = this.pos.length / 3;
    const c = col(hex);
    for (let i = 0; i < p.count; i++) { this.pos.push(p.getX(i), p.getY(i), p.getZ(i)); this.col.push(c.r, c.g, c.b); }
    if (g.index) for (const i of g.index.array) this.idx.push(base + i);
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    geo.dispose();
  }
  // A lathe (around y) with a colour per profile point
  lathe(profile, seg, colorAt) {
    const rows = profile.map(([r, y]) => {
      const out = [];
      for (let s = 0; s <= seg; s++) {
        const a = (s / seg) * Math.PI * 2;
        out.push(this.vert(Math.sin(a) * r, y, Math.cos(a) * r, colorAt(y)));
      }
      return out;
    });
    for (let i = 0; i < rows.length - 1; i++) {
      for (let s = 0; s < seg; s++) {
        const a = rows[i][s], b = rows[i][s + 1], c = rows[i + 1][s + 1], d = rows[i + 1][s];
        this.tri(a, b, c); this.tri(a, c, d);
      }
    }
  }
  // A shape swept from heel to toe: each station is a closed ring of
  // [y, z, colour] points at one x. Repeat a point to get a crisp edge.
  sweep(stations, capStart = true, capEnd = true) {
    const n = stations[0].pts.length;
    const rows = stations.map((st) => st.pts.map(([y, z, c]) => this.vert(st.x, y, z, c)));
    for (let s = 0; s < rows.length - 1; s++) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const a = rows[s][i], b = rows[s][j], c = rows[s + 1][j], d = rows[s + 1][i];
        this.tri(a, b, c); this.tri(a, c, d);
      }
    }
    const cap = (st) => {
      let cy = 0, cz = 0;
      for (const [y, z] of st.pts) { cy += y; cz += z; }
      cy /= n; cz /= n;
      const ring = st.pts.map(([y, z, c]) => this.vert(st.x, y, z, c));
      const mid = this.vert(st.x, cy, cz, st.pts[0][2]);
      for (let i = 0; i < n; i++) this.tri(mid, ring[i], ring[(i + 1) % n]);
    };
    if (capStart) cap(stations[0]);
    if (capEnd) cap(stations[stations.length - 1]);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
  get empty() { return this.idx.length === 0; }
}

// A cylinder from a to b (address frame)
function tube(a, b, r0, r1, seg = 10) {
  const d = new THREE.Vector3().subVectors(b, a);
  const L = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, L, seg, 1);
  g.translate(0, L / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// Where the face must be so it touches the back of the ball: returns the
// z shift for a face plane z = (y - y0) * tan(loft) built with the sole at y = 0
function faceShift(loftDeg, y0 = 0) {
  const L = loftDeg * DEG;
  const cy = -RB * Math.sin(L) + BALL_Y; // contact point height above the ground
  const cz = RB * Math.cos(L); // and its distance behind the ball centre
  return cz - (cy - y0) * Math.tan(L);
}

// ---------------------------------------------------------------- irons
function ironHead(metal, paint, o) {
  const { loft, style, size = 1 } = o;
  const wedge = style === 'wedge';
  const blade = style === 'blade';
  const tanL = Math.tan(loft * DEG);
  const len = (wedge ? 0.079 : blade ? 0.073 : 0.08) * size;
  const x0 = -0.034 * size, x1 = x0 + len;
  const Hh = (wedge ? 0.037 : 0.034) * size; // face height at the heel
  const Ht = (wedge ? 0.058 : blade ? 0.047 : 0.05) * size; // and out at the toe
  // longer irons have narrower soles; wedges the widest, with bounce
  const soleW = (wedge ? 0.029 : blade ? 0.014 + loft * 0.00012 : 0.018 + loft * 0.00016) * size;
  const topW = blade ? 0.0055 : wedge ? 0.0068 : 0.008;
  const bounce = wedge ? Math.max(4, o.bounce ?? 10) : 2;
  const lead = soleW * Math.tan(bounce * DEG) * 0.55; // leading edge sits up off the ground
  const face = o.face || '#aeb4bb';
  const head = o.head || '#c9ced5';
  const dark = o.back || head;
  const us = [0, 0.03, 0.07, 0.12, 0.135, 0.2, 0.3, 0.4, 0.5, 0.6, 0.66, 0.72, 0.77, 0.82, 0.855, 0.87, 0.9, 0.93, 0.955, 0.975, 0.99, 1];
  const uR = wedge ? 0.6 : 0.7; // where the toe starts to round off
  const stations = us.map((u) => {
    const x = lerp(x0, x1, u);
    const camber = 0.0022 * ((u - 0.45) / 0.55) ** 2;
    let top = lerp(Hh, Ht, smooth(0, uR + 0.12, u));
    let bot = camber;
    const mid = Ht * (wedge ? 0.42 : 0.36);
    let taper = 1; // the sole and back thin out into the rounded toe
    if (u > uR) {
      const e = Math.min(1, (u - uR) / (1 - uR));
      const r = Math.sqrt(Math.max(0, 1 - e * e));
      top = mid + (top - mid) * r;
      bot = mid - (mid - bot) * Math.pow(r, 0.55);
      taper = Math.max(0.18, Math.pow(r, 0.7));
    }
    const h = Math.max(0.0005, top - bot);
    const fz = (y) => y * tanL; // the face plane
    const edge = bot + lead * (1 - smooth(0.85, 1, u));
    const cav = style === 'cavity' && u > 0.13 && u < 0.86;
    const pts = [
      [edge, fz(edge), face], // leading edge
      [top, fz(top), face], // top of the face
      [top, fz(top), head],
      [top - 0.0012, fz(top) + topW, head], // back of the top line
    ];
    if (cav) {
      // perimeter weighting round a hollow cavity
      const lip = top - Math.min(h * 0.28, 0.009);
      const floor = bot + Math.min(h * 0.42, 0.017);
      pts.push([lip, fz(lip) + topW + 0.0006, dark], [lip - 0.0005, fz(lip) + 0.0035, dark], [floor, fz(floor) + 0.0035, dark], [floor + 0.0005, soleW * 0.95, head]);
    } else if (wedge) {
      const m1 = bot + h * 0.55, m2 = bot + h * 0.25;
      pts.push([m1, fz(m1) + topW + 0.003, head], [m2, fz(m2) + 0.0115, head], [bot + 0.006, soleW * 0.92, head]);
    } else {
      // a muscle back: thicker low down behind the sweet spot
      const m1 = bot + h * 0.6, m2 = bot + h * 0.28;
      pts.push([m1, fz(m1) + topW + 0.0015, head], [m2, fz(m2) + (blade ? 0.0085 : 0.01), head], [bot + 0.006, soleW * 0.96, head]);
    }
    pts.push(
      [bot + (wedge ? 0.0012 : 0.0016), soleW, head], // trailing edge
      [bot, soleW * 0.55, head], // sole (the lowest point for a bounced wedge)
      [edge, fz(edge) + 0.0012, head],
    );
    if (taper < 1) for (const p of pts) p[1] = fz(p[0]) + (p[1] - fz(p[0])) * taper;
    return { x, pts };
  });
  // the heel end is under the hosel; leave the toe tip open-free
  metal.sweep(stations, true, true);
  // grooves across the face
  const gx0 = x0 + 0.007 * size, gx1 = x1 - (wedge ? 0.014 : 0.016) * size;
  const L = loft * DEG;
  for (let y = 0.0045; y < Hh + 0.004; y += wedge ? 0.0034 : 0.0036) {
    const g = new THREE.BoxGeometry(gx1 - gx0, 0.0009, 0.0006);
    g.rotateX(L);
    g.translate((gx0 + gx1) / 2, y, y * tanL - 0.00018);
    metal.add(g, o.groove || '#50565d');
  }
  if (style === 'cavity' && o.accent) {
    // the badge in the cavity
    const y = Hh * 0.62;
    const g = new THREE.BoxGeometry(len * 0.46, Math.min(0.013, Hh * 0.34), 0.0016);
    g.rotateX(L);
    g.translate(x0 + len * 0.47, y, y * tanL + 0.0046);
    paint.add(g, o.accent);
    const s = new THREE.BoxGeometry(len * 0.3, 0.0022, 0.0018);
    s.rotateX(L);
    s.translate(x0 + len * 0.47, y, y * tanL + 0.0048);
    paint.add(s, '#f4f4f0');
  }
  if (wedge && o.stamp) {
    // a painted loft number on the toe
    const g = new THREE.BoxGeometry(0.009, 0.0065, 0.0012);
    g.rotateX(L);
    const y = Ht * 0.5;
    g.translate(x1 - 0.019 * size, y, y * tanL + topW + 0.0035);
    paint.add(g, o.stamp);
  }
  // hosel rising from the heel along the lie, then the black ferrule
  const zs = faceShift(loft);
  const u = addressDir(o.lie);
  const hb = new THREE.Vector3(x0 + 0.003, 0.0022 * (0.45 / 0.55) ** 2 + 0.009, soleW * 0.32);
  const hLen = wedge ? 0.066 : 0.06;
  const ht = hb.clone().addScaledVector(u, hLen);
  metal.add(tube(hb.clone().addScaledVector(u, -0.006), ht, 0.0078, 0.0066, 12), head);
  const fer = ht.clone().addScaledVector(u, 0.013);
  paint.add(tube(ht, fer, 0.0066, 0.0061, 12), o.ferrule || '#141414');
  paint.add(tube(ht.clone().addScaledVector(u, 0.0045), ht.clone().addScaledVector(u, 0.006), 0.0068, 0.0068, 12), o.ferruleRing || '#c9a227');
  return { shift: new THREE.Vector3(0, -BALL_Y, zs), hosel: fer };
}

// ---------------------------------------------------------------- woods
const WOODS = {
  driver: { L: 0.118, D: 0.112, H: 0.058, rear: 0.36, rise: 0.007, round: 2.7 },
  mini: { L: 0.106, D: 0.094, H: 0.046, rear: 0.36, rise: 0.006, round: 2.5 },
  fairway: { L: 0.1, D: 0.082, H: 0.037, rear: 0.42, rise: 0.005, round: 2.3 },
  hybrid: { L: 0.088, D: 0.058, H: 0.04, rear: 0.5, rise: 0.004, round: 2.1 },
};

function woodHead(metal, paint, o) {
  const d = WOODS[o.wood] || WOODS.driver;
  const s = o.size || 1;
  const L = d.L * s, D = d.D * s, H = d.H * s;
  const tanL = Math.tan(o.loft * DEG);
  const x0 = -L * 0.44;
  const crown = o.crown || '#23262b';
  const sole = o.head || '#2b2f36';
  const face = o.face || '#50555d';
  const skirt = o.skirt || sole;
  const N = 28;
  const yc = H * 0.5; // face centre height
  const stations = [];
  for (let i = 0; i <= N; i++) {
    const u = 0.5 - 0.5 * Math.cos((Math.PI * i) / N); // more slices near the heel and toe
    const x = x0 + L * u;
    // seen from above the front corners curve back from the face
    const back = D * 0.2 * Math.pow(Math.abs(2 * u - 1), 3.2);
    // rounded outline from above and from the front; fuller toward the toe
    const sf = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * u - 1), 2.4)), 1 / 2.4);
    const sd = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * Math.pow(u, 0.9) - 1), d.round)), 1 / d.round);
    const hf = H * sf;
    const bot = (H * 0.5) * (1 - sf) + 0.0015 * (2 * u - 1) ** 2;
    const top = bot + hf;
    const depth = Math.max(back + 0.002, D * sd);
    // the face: lofted, with a little bulge and roll
    const fz = (y, k) => (y - yc) * tanL - 0.0022 * sf * (1 - k * k) + back;
    const pts = [];
    for (let j = 0; j <= 4; j++) {
      const k = j / 4 * 2 - 1;
      const y = lerp(bot, top, j / 4);
      pts.push([y, fz(y, k), face]);
    }
    const zTop = fz(top, 1);
    pts.push([top, zTop, crown]);
    // crown: domed a little above the face, down to the rear
    const rearY = bot + hf * d.rear;
    for (let j = 1; j <= 7; j++) {
      const t = j / 7;
      const y = rearY + (top - rearY) * Math.sqrt(1 - t * t) + d.rise * sf * Math.sin(Math.PI * Math.min(1, t * 1.25)) * 0.9;
      pts.push([y, lerp(zTop, depth, t), crown]);
    }
    pts.push([rearY, depth, skirt]);
    pts.push([bot + (rearY - bot) * 0.45, depth * 0.98, skirt]);
    // sole back to the leading edge, slightly rounded
    for (let j = 1; j <= 4; j++) {
      const t = j / 5;
      pts.push([bot + 0.0018 * Math.sin(Math.PI * t) * sf, lerp(depth * 0.94, fz(bot, -1) + 0.004, t), sole]);
    }
    pts.push([bot, fz(bot, -1) + 0.0012, sole]);
    stations.push({ x, pts });
  }
  paint.sweep(stations);
  // score lines across the middle of the face
  const Lr = o.loft * DEG;
  for (let y = yc - H * 0.28; y <= yc + H * 0.3; y += H * 0.085) {
    const g = new THREE.BoxGeometry(L * 0.46, 0.0007, 0.0005);
    g.rotateX(Lr);
    g.translate(x0 + L * 0.52, y, (y - yc) * tanL - 0.0024);
    metal.add(g, '#7c828a');
  }
  // an alignment mark on the crown just behind the face centre
  if (o.wood !== 'hybrid') {
    const g = new THREE.BoxGeometry(0.0016, 0.0008, 0.012 * s);
    const topC = H + d.rise * 0.5;
    g.translate(x0 + L * 0.5, topC + 0.0004, (H - yc) * tanL + 0.011 * s);
    paint.add(g, o.align || '#e8e8e8');
  }
  // a sliding weight in the sole
  const wz = D * 0.72;
  paint.add(tube(new THREE.Vector3(x0 + L * 0.3, 0.0012, wz), new THREE.Vector3(x0 + L * 0.72, 0.0012, wz), 0.0026, 0.0026, 8), '#3a3f46');
  metal.add(new THREE.BoxGeometry(0.012, 0.004, 0.008).translate(x0 + L * (o.weight ?? 0.5), 0.0025, wz), '#c9ced5');
  // the hosel and adjustable sleeve on top of the heel
  const u = addressDir(o.lie);
  const hb = new THREE.Vector3(x0 + L * 0.06, H * 0.62, D * 0.1);
  const ht = hb.clone().addScaledVector(u, o.wood === 'driver' || o.wood === 'mini' ? 0.03 : 0.036);
  paint.add(tube(hb.clone().addScaledVector(u, -0.012), ht, 0.0082, 0.0074, 12), sole);
  const sl = ht.clone().addScaledVector(u, 0.02);
  metal.add(tube(ht, sl, 0.0076, 0.0072, 12), '#b9bec5'); // adjustable sleeve
  const fer = sl.clone().addScaledVector(u, 0.012);
  paint.add(tube(sl, fer, 0.0072, 0.0064, 12), '#141414');
  // (the face bulges ~2 mm toward the target at its centre)
  return { shift: new THREE.Vector3(0, -BALL_Y, faceShift(o.loft, yc) + 0.0022), hosel: fer };
}

// ---------------------------------------------------------------- putters
function putterHead(metal, paint, o) {
  const tanL = Math.tan(3 * DEG);
  const head = o.head || '#8f959c';
  const face = o.face || head;
  const accent = o.accent || '#f4f4f0';
  const u = addressDir(o.lie);
  if (o.style === 'mallet') {
    // a fang mallet: rounded back with two wings and a slot between
    const W = 0.098, Dp = 0.058, Hh = 0.024;
    const shape = new THREE.Shape();
    shape.moveTo(-W / 2, 0);
    shape.lineTo(W / 2, 0);
    shape.bezierCurveTo(W / 2 + 0.004, Dp * 0.55, W / 2 - 0.004, Dp, W / 2 - 0.018, Dp);
    shape.lineTo(0.012, Dp);
    shape.lineTo(0.009, Dp * 0.48);
    shape.lineTo(-0.009, Dp * 0.48);
    shape.lineTo(-0.012, Dp);
    shape.lineTo(-W / 2 + 0.018, Dp);
    shape.bezierCurveTo(-W / 2 + 0.004, Dp, -W / 2 - 0.004, Dp * 0.55, -W / 2, 0);
    const g = new THREE.ExtrudeGeometry(shape, { depth: Hh, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 2, curveSegments: 10 });
    g.rotateX(Math.PI / 2); // shape plane -> ground; extrude down
    g.translate(0, Hh + 0.0015, 0);
    metal.add(g, head);
    // face insert and sight lines
    metal.add(new THREE.BoxGeometry(W * 0.7, Hh * 0.7, 0.0015).translate(0, Hh * 0.52, -0.0012), face);
    for (const x of [-0.021, 0, 0.021]) paint.add(new THREE.BoxGeometry(x ? 0.0022 : 0.0026, 0.0006, Dp * (x ? 0.75 : 0.42)).translate(x, Hh + 0.0033, Dp * (x ? 0.5 : 0.24)), accent);
    // single-bend shaft into the heel of the top
    const hb = new THREE.Vector3(-0.022, Hh + 0.002, 0.012);
    const bend = hb.clone().add(new THREE.Vector3(0, 0.05, 0));
    metal.add(tube(hb, bend, 0.0046, 0.0046, 10), '#d5d9de');
    const top = bend.clone().addScaledVector(u, 0.02);
    metal.add(tube(bend, top, 0.0046, 0.0047, 10), '#d5d9de');
    return { shift: new THREE.Vector3(0, -BALL_Y, faceShift(3)), hosel: top };
  }
  // Anser-style blade: thin top line, a flange behind, weighted heel and toe
  const W = 0.1, Hh = 0.026;
  const N = 16;
  const stations = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = -W / 2 + W * t;
    const end = t < 0.14 || t > 0.86; // heel and toe weights
    const round = Math.min(1, Math.min(t, 1 - t) / 0.05);
    const top = Hh * (0.86 + 0.14 * Math.sqrt(round));
    const fl = end ? 0.03 : 0.033;
    stations.push({ x, pts: [
      [0, 0, face], [top, top * tanL, face],
      [top, top * tanL, head], [top - 0.001, 0.006, head],
      [end ? top * 0.7 : 0.011, end ? 0.022 : 0.0065, head],
      [0.009, end ? 0.026 : 0.012, head],
      [0.009, fl - 0.002, head], [0.0065, fl, head], [0.001, fl - 0.002, head],
      [0, 0.003, head],
    ] });
  }
  metal.sweep(stations);
  paint.add(new THREE.BoxGeometry(0.0022, 0.0006, 0.011).translate(0, 0.0096, 0.022), accent); // sight line on the flange
  paint.add(new THREE.BoxGeometry(0.0016, 0.0005, 0.004).translate(0, Hh + 0.0002, 0.003), accent); // dot on the top line
  // plumber's neck: up from the heel, a jog forward, then the shaft
  const hb = new THREE.Vector3(-W / 2 + 0.014, Hh - 0.001, 0.004);
  const up = hb.clone().add(new THREE.Vector3(0, 0.014, 0));
  const jog = up.clone().add(new THREE.Vector3(-0.006, 0, -0.008));
  metal.add(tube(hb, up, 0.0048, 0.0048, 10), head);
  metal.add(tube(up, jog, 0.0048, 0.0048, 10), head);
  metal.add(new THREE.SphereGeometry(0.0048, 10, 6).translate(up.x, up.y, up.z), head);
  const top = jog.clone().addScaledVector(u, 0.024);
  metal.add(tube(jog, top, 0.0048, 0.0052, 10), head);
  return { shift: new THREE.Vector3(0, -BALL_Y, faceShift(3)), hosel: top };
}

// ---------------------------------------------------------------- shaft & grip
function shaftAndGrip(metal, paint, rubber, len, o) {
  const steel = o.shaft !== 'graphite';
  const tipR = o.kind === 'putter' ? 0.0047 : 0.0045;
  const buttR = 0.0074;
  if (steel) {
    const prof = [];
    // chrome steel with step-downs toward the tip
    const steps = 9;
    prof.push([buttR, -0.03]);
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const y = -0.03 - (len - 0.03) * (0.28 + 0.62 * t);
      const r = lerp(buttR, tipR + 0.0004, t);
      prof.push([r, y + 0.004], [r + 0.00035, y + 0.002], [r - 0.0002, y]);
    }
    prof.push([tipR, -len]);
    metal.lathe(prof, 10, () => o.shaftColor || '#dde1e6');
  } else {
    const band = o.shaftAccent || '#f2c230';
    paint.lathe([[buttR, -0.03], [buttR * 0.975, -0.29], [buttR * 0.97, -0.3], [buttR * 0.92, -0.36], [buttR * 0.915, -0.37], [lerp(buttR, tipR, 0.55), -len * 0.62], [tipR, -len]], 10,
      (y) => (y <= -0.295 && y >= -0.365 ? band : o.shaftColor || '#1e2126'));
  }
  // grip: a rounded butt cap, tapering down, with a coloured band at each end
  const putter = o.kind === 'putter';
  const gl = putter ? 0.26 : 0.265;
  const R = putter ? 0.0145 : 0.0122;
  const r1 = putter ? 0.0105 : 0.0093;
  const gc = o.grip || '#1c1d20', ga = o.gripAccent || '#c1121f';
  const gp = [[0, 0.001], [R * 0.78, 0.001], [R, -0.004], [R * 0.99, -0.012], [R * 0.985, -0.016], [R * 0.975, -0.02],
    [lerp(R, r1, 0.35), -gl * 0.35], [lerp(R, r1, 0.7), -gl * 0.7], [r1 * 1.01, -gl + 0.02], [r1, -gl + 0.012], [r1 * 0.98, -gl + 0.006], [r1 * 0.95, -gl]];
  rubber.lathe(gp, 12, (y) => (y > -0.016 && y < -0.011 ? ga : y < -gl + 0.016 ? ga : gc));
}

// ---------------------------------------------------------------- build
const cache = new Map();
const MATS = {};
function mats() {
  if (!MATS.metal) {
    MATS.metal = new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x8a8a8a, shininess: 70, side: THREE.DoubleSide });
    MATS.paint = new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x3a3a3a, shininess: 45, side: THREE.DoubleSide });
    MATS.rubber = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  }
  return MATS;
}

/**
 * Build a club. spec: { kind: 'wood'|'hybrid'|'iron'|'wedge'|'putter', id,
 * loft, lie, length (grip end to the ball), look }
 * placement: { ball: Vector3 (ball centre, golfer frame), grip: Vector3 (grip
 * end at address) } — used to express the club in its own frame.
 * Returns { group, hosel (golfer frame, where the shaft leaves the head), shaftLen }.
 */
export function buildClub(spec, placement) {
  const lk = spec.look || {};
  const key = JSON.stringify([spec.kind, spec.id, spec.loft, spec.lie, spec.length, lk, placement.ball.toArray(), placement.grip.toArray()]);
  let built = cache.get(key);
  if (!built) {
    built = make(spec, placement);
    cache.set(key, built);
    if (cache.size > 60) cache.delete(cache.keys().next().value);
  }
  const m = mats();
  const group = new THREE.Group();
  for (const [name, geo] of Object.entries(built.geos)) {
    const mesh = new THREE.Mesh(geo, m[name]);
    mesh.castShadow = true;
    group.add(mesh);
  }
  return { group, hosel: built.hosel.clone(), shaftLen: built.shaftLen };
}

// The look of a head (used by the shop renders too)
export function headLook(spec) {
  const lk = spec.look || {};
  const kind = spec.kind;
  if (kind === 'wood' || kind === 'hybrid') {
    const mini = spec.id === 'DR' && (lk.size || 1) < 0.9;
    const wood = kind === 'hybrid' ? 'hybrid' : spec.id === 'DR' ? (mini ? 'mini' : 'driver') : 'fairway';
    const size = mini ? 1 : (lk.size || 1) * (spec.id === '5W' ? 0.95 : 1);
    return { wood, loft: spec.loft, lie: spec.lie, size, crown: lk.crown, head: lk.head, face: lk.face, skirt: lk.skirt, align: lk.align, weight: lk.weight };
  }
  if (kind === 'putter') return { style: lk.style || 'blade', lie: spec.lie, head: lk.head, face: lk.face, accent: lk.accent };
  const style = kind === 'wedge' ? 'wedge' : lk.style === 'blade' ? 'blade' : 'cavity';
  return { style, loft: spec.loft, lie: spec.lie, size: lk.size || 1, head: lk.head, face: lk.faceColor, accent: lk.accent, back: lk.back, bounce: spec.bounce, stamp: kind === 'wedge' ? lk.stamp || '#c1121f' : null };
}

function make(spec, pl) {
  const metal = new Bucket(), paint = new Bucket(), rubber = new Bucket();
  const hl = headLook(spec);
  const res = spec.kind === 'wood' || spec.kind === 'hybrid' ? woodHead(metal, paint, hl)
    : spec.kind === 'putter' ? putterHead(metal, paint, hl) : ironHead(metal, paint, hl);
  // head: from its build frame to the golfer frame, then into the club frame
  const hosel = res.hosel.clone().add(res.shift).add(pl.ball);
  const axis = new THREE.Vector3().subVectors(hosel, pl.grip);
  const shaftLen = axis.length();
  const q = new THREE.Quaternion().setFromUnitVectors(DOWN, axis.normalize());
  const toClub = new THREE.Matrix4().compose(new THREE.Vector3(), q.clone().invert(), new THREE.Vector3(1, 1, 1))
    .multiply(new THREE.Matrix4().makeTranslation(res.shift.x + pl.ball.x - pl.grip.x, res.shift.y + pl.ball.y - pl.grip.y, res.shift.z + pl.ball.z - pl.grip.z));
  const headGeos = {};
  for (const [name, b] of [['metal', metal], ['paint', paint]]) {
    if (b.empty) continue;
    const g = b.geometry();
    g.applyMatrix4(toClub);
    headGeos[name] = g;
  }
  // shaft and grip are built straight down the club's own axis
  const sm = new Bucket(), sp = new Bucket(), sr = new Bucket();
  const lk = spec.look || {};
  shaftAndGrip(sm, sp, sr, shaftLen, { kind: spec.kind, shaft: lk.shaft || (spec.kind === 'wood' || spec.kind === 'hybrid' ? 'graphite' : 'steel'), shaftColor: lk.shaftColor, shaftAccent: lk.shaftAccent || lk.crown, grip: lk.grip, gripAccent: lk.gripAccent });
  const geos = {};
  const merge = (name, a, b) => {
    const list = [a, b].filter(Boolean);
    if (!list.length) return;
    if (list.length === 1) { geos[name] = list[0]; return; }
    geos[name] = mergeTwo(list[0], list[1]);
  };
  merge('metal', headGeos.metal, sm.empty ? null : sm.geometry());
  merge('paint', headGeos.paint, sp.empty ? null : sp.geometry());
  geos.rubber = sr.geometry();
  return { geos, hosel, shaftLen };
}

function mergeTwo(a, b) {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const A = a.attributes[name].array, B = b.attributes[name].array;
    const arr = new Float32Array(A.length + B.length);
    arr.set(A); arr.set(B, A.length);
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  const na = a.attributes.position.count;
  const ia = a.index.array, ib = b.index.array;
  const idx = new Uint32Array(ia.length + ib.length);
  idx.set(ia);
  for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + na;
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  a.dispose(); b.dispose();
  return out;
}
