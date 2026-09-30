// Mini-game furniture: ringed target greens with flags and distance signs,
// distance boards down the long-drive grid, the range hitting bays (mats,
// ball pyramids, buckets) and numbered putting stations.
import * as THREE from '../../vendor/three.module.min.js';
import { YD } from '../sim/hole.js';

function textTexture(lines, { w = 256, h = 128, bg = '#1b3a2a', fg = '#ffffff', accent = '#f2c230', border = '#f4f4f0' } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = border;
  g.fillRect(0, 0, w, h);
  g.fillStyle = bg;
  g.fillRect(6, 6, w - 12, h - 12);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const [big, small] = lines;
  g.fillStyle = fg;
  g.font = `800 ${Math.round(h * (small ? 0.56 : 0.7))}px "Barlow Condensed", Arial, sans-serif`;
  g.fillText(big, w / 2, small ? h * 0.42 : h * 0.54);
  if (small) {
    g.fillStyle = accent;
    g.font = `700 ${Math.round(h * 0.22)}px "Barlow Condensed", Arial, sans-serif`;
    g.fillText(small, w / 2, h * 0.8);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function distLabel(yd, units) {
  return units === 'meters' ? [String(Math.round(yd * YD)), 'METERS'] : [String(yd), 'YARDS'];
}

// A painted disc that follows the ground: concentric colored bands
function ringDisc(hole, cx, cz, bands, lift = 0.045) {
  const pos = [], col = [], idx = [];
  const SEG = 64;
  for (const [r0, r1, color] of bands) {
    const steps = Math.max(1, Math.ceil((r1 - r0) / 1.6));
    const base = pos.length / 3;
    for (let k = 0; k <= steps; k++) {
      const r = r0 + ((r1 - r0) * k) / steps;
      for (let a = 0; a < SEG; a++) {
        const ang = (a / SEG) * Math.PI * 2;
        const x = cx + Math.cos(ang) * r, z = cz + Math.sin(ang) * r;
        pos.push(x, hole.heightAt(x, z) + lift, z);
        col.push(color.r, color.g, color.b);
      }
    }
    for (let k = 0; k < steps; k++) {
      for (let a = 0; a < SEG; a++) {
        const i0 = base + k * SEG + a, i1 = base + k * SEG + ((a + 1) % SEG);
        const j0 = i0 + SEG, j1 = i1 + SEG;
        idx.push(i0, j0, i1, i1, j0, j1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }));
  m.receiveShadow = true;
  return m;
}

// Signboard on two posts, its face turned toward (fx, fz)
function signBoard(text, x, y, z, faceX, faceZ, { w = 1.5, h = 0.75, postH = 0.9, colors } = {}) {
  const grp = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: '#4a3a2c' });
  for (const dx of [-w * 0.38, w * 0.38]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, postH + h * 0.5, 0.07), wood);
    post.position.set(dx, (postH + h * 0.5) / 2, 0);
    post.castShadow = true;
    grp.add(post);
  }
  const face = new THREE.MeshLambertMaterial({ map: textTexture(text, colors || {}) });
  const edge = new THREE.MeshLambertMaterial({ color: '#f4f4f0' });
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), [edge, edge, edge, edge, face, face]);
  board.position.set(0, postH + h * 0.35, 0.04);
  board.castShadow = true;
  grp.add(board);
  grp.position.set(x, y, z);
  grp.rotation.y = Math.atan2(faceX - x, faceZ - z);
  return grp;
}

/**
 * A target green: bullseye, white ring, outer ring and a flag in the middle.
 * t: {x, z, y, yd, color, mult}
 */
export function buildTarget(hole, t, { rings = [3.5, 8, 13], units = 'yards', scoring = true } = {}) {
  const grp = new THREE.Group();
  const col = new THREE.Color(t.color);
  const dark = col.clone().lerp(new THREE.Color('#123524'), 0.35);
  const white = new THREE.Color('#f2f2ec');
  const bands = [
    [0, rings[0] - 0.18, col],
    [rings[0] - 0.18, rings[0], white],
    [rings[0], rings[1], scoring ? white.clone().lerp(col, 0.12) : new THREE.Color('#79b84c')],
    [rings[1], rings[1] + 0.2, col],
    [rings[1] + 0.2, rings[2], scoring ? dark : new THREE.Color('#6aad43')],
    [rings[2], rings[2] + 0.3, white],
  ];
  grp.add(ringDisc(hole, t.x, t.z, bands));
  // raised rims so the rings read from the tee, which sees them edge-on
  for (const [r, c] of [[rings[0], col], [rings[1], white], [rings[2], col]]) {
    const pts = [];
    for (let a = 0; a <= 72; a++) {
      const ang = (a / 72) * Math.PI * 2;
      const x = t.x + Math.cos(ang) * r, z = t.z + Math.sin(ang) * r;
      pts.push(new THREE.Vector3(x, hole.heightAt(x, z) + 0.1, z));
    }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, r === rings[2] ? 0.11 : 0.08, 5, true), new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.25 }));
    tube.castShadow = false;
    grp.add(tube);
  }
  // tall flag in the middle
  const H = scoring ? 4.2 : 3.2;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, H, 8), new THREE.MeshLambertMaterial({ color: '#f5f5f0' }));
  pole.position.set(t.x, t.y + H / 2, t.z);
  pole.castShadow = true;
  const fw = scoring ? 1.5 : 1.1;
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, fw, -fw * 0.32, 0, 0, -fw * 0.64, 0], 3));
  flagGeo.computeVertexNormals();
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshLambertMaterial({ color: t.color, side: THREE.DoubleSide, emissive: t.color, emissiveIntensity: 0.2 }));
  flag.position.set(t.x, t.y + H, t.z);
  flag.rotation.y = Math.atan2(-t.x, -t.z) + Math.PI / 2;
  flag.castShadow = true;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshLambertMaterial({ color: '#f2c230' }));
  cap.position.set(t.x, t.y + H + 0.04, t.z);
  grp.add(pole, flag, cap);
  // a distance sign at the front edge, facing the tee
  const toTee = Math.hypot(t.x, t.z) || 1;
  const off = rings[2] + 1.6;
  const sx = t.x - (t.x / toTee) * off + (t.z / toTee) * 3, sz = t.z - (t.z / toTee) * off - (t.x / toTee) * 3;
  const [big, small] = distLabel(t.yd, units);
  grp.add(signBoard([big, scoring && t.mult > 1 ? `${small} · ×${t.mult}` : small], sx, hole.heightAt(sx, sz), sz, 0, 0, { colors: { bg: t.color, accent: '#ffffff', fg: '#ffffff' }, w: 1.7, h: 0.85, postH: 0.55 }));
  return grp;
}

// Distance boards on both sides of the fairway at the given yardages
export function buildDistanceBoards(hole, yards, { units = 'yards', sideOff = 5 } = {}) {
  const grp = new THREE.Group();
  const tee = hole.teeSpot();
  for (const yd of yards) {
    const s = yd * YD;
    if (s > hole.length - 10) continue;
    const p = hole.pointAtS(s);
    const r = { x: Math.cos(p.heading), z: Math.sin(p.heading) };
    for (const side of [-1, 1]) {
      const lat = side * (hole.fairwayHalfWidth(s, side) + sideOff);
      const x = p.x + r.x * lat, z = p.z + r.z * lat;
      grp.add(signBoard(distLabel(yd, units), x, hole.heightAt(x, z), z, tee.x, tee.z, { w: 2.2, h: 1.1, postH: 0.8 }));
    }
    // a white line across the fairway
    const line = [];
    const hw = hole.fairwayHalfWidth(s, 1) + 1;
    for (let k = -hw; k <= hw; k += 1) {
      const x = p.x + r.x * k, z = p.z + r.z * k;
      line.push(new THREE.Vector3(x, hole.heightAt(x, z) + 0.06, z));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(line);
    grp.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 })));
  }
  return grp;
}

// Hitting bays: mats, ball pyramids and buckets either side of the player
export function buildRangeBay(hole, tee) {
  const grp = new THREE.Group();
  const h = hole.teeHeading;
  const f = { x: Math.sin(h), z: -Math.cos(h) }, r = { x: Math.cos(h), z: Math.sin(h) };
  const matMat = new THREE.MeshLambertMaterial({ color: '#2f6b2a' });
  const stripe = new THREE.MeshLambertMaterial({ color: '#3f8a36' });
  const ballGeo = new THREE.SphereGeometry(0.0214, 8, 6);
  const balls = [];
  const bucketMat = new THREE.MeshLambertMaterial({ color: '#c8322c' });
  for (const lat of [-16, -8, 0, 8, 16]) {
    const cx = tee.x + r.x * (lat - 0.5) - f.x * 0.2, cz = tee.z + r.z * (lat - 0.5) - f.z * 0.2;
    const y = hole.heightAt(cx, cz);
    const mat = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.012, 1.8), matMat);
    mat.position.set(cx, y + 0.004, cz);
    mat.rotation.y = -h;
    mat.receiveShadow = true;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.014, 1.8), stripe);
    band.position.set(cx + r.x * 0.5, y + 0.005, cz + r.z * 0.5);
    band.rotation.y = -h;
    band.receiveShadow = true;
    grp.add(mat, band);
    // a pyramid of balls and a bucket beside every mat
    const px = tee.x + r.x * (lat + 1.2) - f.x * 0.9, pz = tee.z + r.z * (lat + 1.2) - f.z * 0.9;
    const py = hole.heightAt(px, pz);
    for (let layer = 0; layer < 4; layer++) {
      const n = 4 - layer;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const ox = (i - (n - 1) / 2) * 0.044, oz = (j - (n - 1) / 2) * 0.044;
        balls.push([px + ox, py + 0.021 + layer * 0.034, pz + oz]);
      }
    }
    const bx = tee.x + r.x * (lat + 1.6) - f.x * 1.5, bz = tee.z + r.z * (lat + 1.6) - f.z * 1.5;
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.26, 14, 1, true), bucketMat);
    bucket.material.side = THREE.DoubleSide;
    bucket.position.set(bx, hole.heightAt(bx, bz) + 0.13, bz);
    bucket.castShadow = true;
    grp.add(bucket);
    for (let k = 0; k < 7; k++) balls.push([bx + (k % 3 - 1) * 0.07, hole.heightAt(bx, bz) + 0.24 + Math.floor(k / 3) * 0.03, bz + ((k * 7) % 3 - 1) * 0.06]);
    // divider between bays
    if (lat !== 16) {
      const dx = tee.x + r.x * (lat + 4) - f.x * 0.6, dz = tee.z + r.z * (lat + 4) - f.z * 0.6;
      const div = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 2.4), new THREE.MeshLambertMaterial({ color: '#1f3a2b' }));
      div.position.set(dx, hole.heightAt(dx, dz) + 0.45, dz);
      div.rotation.y = -h;
      div.castShadow = true;
      grp.add(div);
    }
  }
  const im = new THREE.InstancedMesh(ballGeo, new THREE.MeshLambertMaterial({ color: '#fbfbf7' }), balls.length);
  const m4 = new THREE.Matrix4();
  balls.forEach((b, i) => { m4.makeTranslation(b[0], b[1], b[2]); im.setMatrixAt(i, m4); });
  im.castShadow = true;
  grp.add(im);
  return grp;
}

// Numbered discs on the green where each putt starts
export function buildStationDiscs(hole, stations) {
  const grp = new THREE.Group();
  stations.forEach((s, i) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1b3a2a';
    g.font = '800 40px "Barlow Condensed", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(i + 1), 32, 35);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex, transparent: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
    // just behind the ball, away from the hole
    const dx = s.x - hole.pin.x, dz = s.z - hole.pin.z, l = Math.hypot(dx, dz) || 1;
    const x = s.x + (dx / l) * 0.28, z = s.z + (dz / l) * 0.28;
    disc.position.set(x, hole.heightAt(x, z) + 0.012, z);
    grp.add(disc);
  });
  return grp;
}
