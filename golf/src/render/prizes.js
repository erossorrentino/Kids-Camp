// Prizes you can see: the hole-in-one car on its turntable by a par-3 tee,
// with a ribbon and a sign.
import * as THREE from '../../vendor/three.module.min.js';

function signTexture(lines) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 192;
  const g = cv.getContext('2d');
  g.fillStyle = '#f2c230';
  g.fillRect(0, 0, 512, 192);
  g.fillStyle = '#10241a';
  g.fillRect(8, 8, 496, 176);
  g.textAlign = 'center';
  g.fillStyle = '#f2c230';
  g.font = '800 58px "Barlow Condensed", Arial, sans-serif';
  g.fillText(lines[0], 256, 80);
  g.fillStyle = '#ffffff';
  g.font = '700 40px "Barlow Condensed", Arial, sans-serif';
  g.fillText(lines[1], 256, 140);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A low, sporty coupe about 4.4 m long, facing +x
export function buildCar(color = '#c1121f') {
  const car = new THREE.Group();
  const paint = new THREE.MeshPhongMaterial({ color, shininess: 110, specular: 0x777777 });
  const glass = new THREE.MeshPhongMaterial({ color: '#16202b', shininess: 140, specular: 0xaaaaaa });
  const dark = new THREE.MeshLambertMaterial({ color: '#141414' });
  const chrome = new THREE.MeshPhongMaterial({ color: '#d6dadf', shininess: 120, specular: 0xffffff });
  // body: a side profile pushed out to the car's width, with rounded edges
  const s = new THREE.Shape();
  s.moveTo(-2.2, 0.32);
  s.lineTo(2.15, 0.32);
  s.quadraticCurveTo(2.3, 0.35, 2.28, 0.6);
  s.quadraticCurveTo(1.9, 0.8, 1.2, 0.86);
  s.lineTo(0.55, 0.92);
  s.quadraticCurveTo(0.1, 1.3, -0.5, 1.3);
  s.quadraticCurveTo(-1.3, 1.28, -1.75, 0.98);
  s.lineTo(-2.2, 0.9);
  s.lineTo(-2.2, 0.32);
  const bodyGeo = new THREE.ExtrudeGeometry(s, { depth: 1.62, bevelEnabled: true, bevelSize: 0.09, bevelThickness: 0.12, bevelSegments: 3, curveSegments: 10 });
  bodyGeo.translate(0, 0, -0.81);
  const body = new THREE.Mesh(bodyGeo, paint);
  car.add(body);
  // windows: the cabin outline, a touch wider than the body so it shows on the sides
  const w = new THREE.Shape();
  w.moveTo(0.5, 0.95);
  w.quadraticCurveTo(0.08, 1.24, -0.5, 1.25);
  w.quadraticCurveTo(-1.2, 1.23, -1.62, 0.98);
  w.lineTo(0.5, 0.95);
  const winGeo = new THREE.ExtrudeGeometry(w, { depth: 1.66, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.1, bevelSegments: 2 });
  winGeo.translate(0, 0.01, -0.83);
  car.add(new THREE.Mesh(winGeo, glass));
  // wheels with chrome rims
  for (const [x, z] of [[1.38, 0.86], [1.38, -0.86], [-1.36, 0.86], [-1.36, -0.86]]) {
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.3, 20), dark);
    tyre.rotation.x = Math.PI / 2;
    tyre.position.set(x, 0.37, z);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.31, 14), chrome);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, 0.37, z + Math.sign(z) * 0.01);
    car.add(tyre, rim);
  }
  // lights and grille
  const head = new THREE.MeshBasicMaterial({ color: '#fffbe6' });
  const tail = new THREE.MeshBasicMaterial({ color: '#ff2a2a' });
  for (const z of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.34), head);
    hl.position.set(2.32, 0.64, z);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.4), tail);
    tl.position.set(-2.3, 0.8, z);
    car.add(hl, tl);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.9), dark);
  grille.position.set(2.33, 0.45, 0);
  car.add(grille);
  // a big red bow on the roof
  const ribbon = new THREE.MeshLambertMaterial({ color: '#e0162b' });
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 1.95), ribbon);
  band.position.set(-0.45, 1.33, 0);
  car.add(band);
  for (const side of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 8, 18), ribbon);
    loop.position.set(-0.45, 1.5, side * 0.2);
    loop.rotation.set(0, Math.PI / 2, side * 0.5);
    car.add(loop);
  }
  car.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return car;
}

/**
 * The hole-in-one car on a turntable beside the tee.
 * prize: { name, color, value }
 */
export function buildPrizeCar(hole, prize) {
  const grp = new THREE.Group();
  const h = hole.tee.heading;
  const f = { x: Math.sin(h), z: -Math.cos(h) }, r = { x: Math.cos(h), z: Math.sin(h) };
  const side = hole.cartPath ? -hole.cartPath.side : 1;
  const x = f.x * 5 + r.x * side * 13, z = f.z * 5 + r.z * side * 13;
  const y = hole.heightAt(x, z);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.1, 0.24, 40), new THREE.MeshPhongMaterial({ color: '#2b2f36', shininess: 60 }));
  stand.position.set(x, y + 0.12, z);
  stand.receiveShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.02, 0.05, 6, 48), new THREE.MeshBasicMaterial({ color: '#f2c230' }));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(x, y + 0.25, z);
  grp.add(stand, ring);
  const car = buildCar(prize.color);
  car.position.set(x, y + 0.24, z);
  // parked at an angle, nose toward the tee
  car.rotation.y = Math.atan2(-(0 - z), 0 - x) + side * 0.7;
  grp.add(car);
  // sign on two posts in front of the car
  const sx = x - r.x * side * 3.6 - f.x * 1.2, sz = z - r.z * side * 3.6 - f.z * 1.2;
  const sy = hole.heightAt(sx, sz);
  const sign = new THREE.Group();
  const post = new THREE.MeshLambertMaterial({ color: '#2d2d2d' });
  for (const dx of [-0.8, 0.8]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.4, 0.07), post);
    p.position.set(dx, 0.7, 0);
    sign.add(p);
  }
  const face = new THREE.MeshLambertMaterial({ map: signTexture(['HOLE-IN-ONE PRIZE', prize.name]) });
  const edge = new THREE.MeshLambertMaterial({ color: '#f2c230' });
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.8, 0.05), [edge, edge, edge, edge, face, face]);
  board.position.set(0, 1.35, 0.04);
  sign.add(board);
  sign.position.set(sx, sy, sz);
  sign.rotation.y = Math.atan2(-sx, -sz);
  sign.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  grp.add(sign);
  return grp;
}

export const PRIZE_CARS = [
  { name: 'Meridian GT', value: 85000 },
  { name: 'Apex Roadster', value: 110000 },
  { name: 'Summit Coupe', value: 72000 },
  { name: 'Northwind EV', value: 64000 },
  { name: 'Crestline Sport', value: 95000 },
  { name: 'Vantage R', value: 140000 },
];
export const CAR_COLORS = ['#c1121f', '#1d4ed8', '#f2c230', '#111111', '#f4f4f0', '#0f766e', '#ff6b00'];
