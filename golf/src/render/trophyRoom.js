// The trophy cabinet: every title you've won as a 3D trophy on wooden
// shelves (silver cups, gold jugs, a green jacket, crystal, the Legends
// Cup), with the cars you've won parked on the bottom shelf. Rendered once
// with the game's own renderer into an image, like the player portraits.
import * as THREE from '../../vendor/three.module.min.js';
import { buildCar } from './prizes.js';

const LUT = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  const l = i / 255;
  const s = l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  LUT[i] = Math.round(Math.min(1, Math.max(0, s)) * 255);
}

function lathe(points, mat, segs = 28) {
  const g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

const metal = (color, shininess = 120) => new THREE.MeshPhongMaterial({ color, shininess, specular: 0xffffff });

function base(h = 0.06, r = 0.11) {
  const b = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, h, 24), new THREE.MeshPhongMaterial({ color: '#1a1a1a', shininess: 60 }));
  b.position.y = h / 2;
  b.castShadow = true;
  return b;
}

// Trophy models, standing on y = 0, about 0.25-0.45 tall
function trophy(kind) {
  const g = new THREE.Group();
  if (kind === 'jacket') {
    // the green jacket on a hanger
    const cloth = new THREE.MeshLambertMaterial({ color: '#1f6b3a' });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.07), cloth);
    body.position.y = 0.2;
    const sl = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.26, 0.06), cloth);
    const sr = sl.clone();
    sl.position.set(-0.16, 0.21, 0); sl.rotation.z = 0.12;
    sr.position.set(0.16, 0.21, 0); sr.rotation.z = -0.12;
    const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.075), new THREE.MeshLambertMaterial({ color: '#f4f4f0' }));
    lapel.position.set(0, 0.28, 0.002);
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.018, 12), metal('#e2b53b'));
    badge.position.set(-0.07, 0.29, 0.037);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 12, Math.PI), metal('#cfd3d8'));
    hook.position.set(0, 0.38, 0);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.28, 6), metal('#8a5a2b', 30));
    bar.rotation.z = Math.PI / 2;
    bar.position.y = 0.355;
    g.add(body, sl, sr, lapel, badge, hook, bar);
    return g;
  }
  if (kind === 'car') {
    const car = buildCar('#c1121f');
    car.scale.setScalar(0.07);
    g.add(car);
    return g;
  }
  g.add(base(kind === 'cup' ? 0.08 : 0.06, kind === 'cup' ? 0.14 : 0.11));
  const y0 = kind === 'cup' ? 0.08 : 0.06;
  if (kind === 'ch') {
    const m = metal('#d6dadf');
    const cup = lathe([[0.015, 0], [0.02, 0.06], [0.012, 0.09], [0.06, 0.12], [0.075, 0.2], [0.07, 0.2], [0.052, 0.13], [0.0, 0.12]], m);
    cup.position.y = y0;
    g.add(cup);
  } else if (kind === 'wt') {
    const m = metal('#e3e6ea');
    const cup = lathe([[0.02, 0], [0.028, 0.09], [0.016, 0.14], [0.08, 0.2], [0.095, 0.32], [0.088, 0.32], [0.07, 0.22], [0, 0.2]], m);
    cup.position.y = y0;
    for (const s of [-1, 1]) {
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 8, 16, Math.PI), m);
      handle.position.set(s * 0.1, y0 + 0.26, 0);
      handle.rotation.z = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      g.add(handle);
    }
    g.add(cup);
  } else if (kind === 'maj') {
    // a claret-style jug in gold
    const m = metal('#e2b53b');
    const jug = lathe([[0.05, 0], [0.06, 0.02], [0.04, 0.05], [0.085, 0.14], [0.08, 0.26], [0.05, 0.33], [0.058, 0.36], [0.052, 0.36], [0.04, 0.33], [0, 0.33]], m);
    jug.position.y = y0;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.01, 8, 18, Math.PI * 1.1), m);
    handle.position.set(0.085, y0 + 0.22, 0);
    handle.rotation.z = -Math.PI / 2;
    g.add(jug, handle);
  } else if (kind === 'fin') {
    const glass = new THREE.MeshPhongMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.6, shininess: 160, specular: 0xffffff });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), glass);
    crystal.scale.set(0.8, 1.6, 0.8);
    crystal.position.y = y0 + 0.2;
    g.add(crystal);
  } else if (kind === 'cup') {
    const m = metal('#f2c230');
    const cup = lathe([[0.03, 0], [0.04, 0.1], [0.022, 0.16], [0.11, 0.24], [0.13, 0.4], [0.12, 0.4], [0.1, 0.26], [0, 0.24]], m);
    cup.position.y = y0;
    for (const s of [-1, 1]) {
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.011, 8, 18, Math.PI), m);
      handle.position.set(s * 0.14, y0 + 0.31, 0);
      handle.rotation.z = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      g.add(handle);
    }
    const lid = lathe([[0.12, 0], [0.06, 0.05], [0.015, 0.08], [0.03, 0.1], [0, 0.12]], m);
    lid.position.y = y0 + 0.4;
    g.add(cup, lid);
  }
  return g;
}

function plaqueTexture(text) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#c9a227';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#2b1d08';
  g.font = '700 34px "Barlow Condensed", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 34, 240);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * items: [{ kind: 'ch'|'wt'|'maj'|'jacket'|'fin'|'cup'|'car', color? }]
 * Returns a data URL of the cabinet.
 */
export function renderTrophyRoom(renderer, items, { w = 900, h = 560, name = '' } = {}) {
  if (!renderer || (renderer.getContext && renderer.getContext().isContextLost())) return '';
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1a120c');
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x2a1d12, 1.6));
  const key = new THREE.DirectionalLight(0xfff0d8, 2.2);
  key.position.set(1.2, 2.5, 3);
  scene.add(key);
  const fill = new THREE.PointLight(0xffd9a0, 1.4, 0, 0);
  fill.position.set(-1.4, 1.6, 1.4);
  scene.add(fill);
  const wood = new THREE.MeshLambertMaterial({ color: '#6b4226' });
  const dark = new THREE.MeshLambertMaterial({ color: '#3d2415' });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), new THREE.MeshLambertMaterial({ color: '#241812' }));
  back.position.set(0, 1.05, -0.3);
  scene.add(back);
  // cabinet frame and three shelves
  const W = 2.6;
  for (const x of [-W / 2, W / 2]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.1, 0.6), dark);
    side.position.set(x, 1.05, 0);
    scene.add(side);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(W + 0.16, 0.1, 0.62), dark);
  top.position.set(0, 2.1, 0);
  scene.add(top);
  const shelvesY = [0.12, 0.8, 1.45];
  for (const y of shelvesY) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, 0.55), wood);
    shelf.position.set(0, y - 0.025, 0);
    shelf.receiveShadow = true;
    scene.add(shelf);
  }
  // little spotlights along the top
  for (let k = 0; k < 4; k++) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.04, 12), new THREE.MeshBasicMaterial({ color: '#fff4d6' }));
    lamp.position.set(-0.95 + k * 0.63, 2.03, 0.2);
    scene.add(lamp);
  }
  // trophies on the top two shelves, cars on the bottom
  const cars = items.filter((i) => i.kind === 'car');
  const rest = items.filter((i) => i.kind !== 'car').slice(0, 18);
  // eye-level shelf first, then the top shelf
  const perShelf = 9;
  const firstRow = rest.length <= 5 ? rest.length : Math.min(perShelf, Math.ceil(rest.length / 2));
  rest.forEach((it, k) => {
    const shelf = k < firstRow ? 1 : 2;
    const n = shelf === 1 ? firstRow : rest.length - firstRow;
    const idx = shelf === 1 ? k : k - firstRow;
    const t = trophy(it.kind);
    const sc = it.kind === 'cup' ? 1.35 : 1.15;
    t.scale.setScalar(sc);
    t.position.set((idx - (n - 1) / 2) * 0.27, shelvesY[shelf], 0.02);
    t.rotation.y = -0.2;
    scene.add(t);
    if (it.plaque) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.05), new THREE.MeshLambertMaterial({ map: plaqueTexture(it.plaque) }));
      pl.position.set(t.position.x, shelvesY[shelf] - 0.02, 0.28);
      scene.add(pl);
    }
  });
  cars.slice(0, 6).forEach((it, k) => {
    const n = Math.min(6, cars.length);
    const car = buildCar(it.color || '#c1121f');
    car.scale.setScalar(0.085);
    car.position.set((k - (n - 1) / 2) * 0.42, shelvesY[0], 0.02);
    car.rotation.y = 0.5;
    scene.add(car);
  });
  if (!items.length) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshLambertMaterial({ map: plaqueTexture('Your first trophy goes here') }));
    sign.position.set(0, 1.62, 0.1);
    scene.add(sign);
  }
  const cam = new THREE.PerspectiveCamera(34, w / h, 0.1, 20);
  cam.position.set(0.25, 1.15, 4.35);
  cam.lookAt(0, 1.06, 0);
  const S = 2;
  const W2 = w * S, H2 = h * S;
  const rt = new THREE.WebGLRenderTarget(W2, H2);
  const buf = new Uint8Array(W2 * H2 * 4);
  const prevRT = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, W2, H2, buf);
  } finally {
    renderer.setRenderTarget(prevRT);
    rt.dispose();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { if (m.map) m.map.dispose(); m.dispose(); } }
    });
  }
  const big = document.createElement('canvas');
  big.width = W2; big.height = H2;
  const bctx = big.getContext('2d');
  const img = bctx.createImageData(W2, H2);
  for (let y = 0; y < H2; y++) {
    const src = (H2 - 1 - y) * W2 * 4, dst = y * W2 * 4;
    for (let x = 0; x < W2 * 4; x += 4) {
      img.data[dst + x] = LUT[buf[src + x]];
      img.data[dst + x + 1] = LUT[buf[src + x + 1]];
      img.data[dst + x + 2] = LUT[buf[src + x + 2]];
      img.data[dst + x + 3] = 255;
    }
  }
  bctx.putImageData(img, 0, 0);
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const o = out.getContext('2d');
  o.imageSmoothingQuality = 'high';
  o.drawImage(big, 0, 0, w, h);
  if (name) {
    o.fillStyle = 'rgba(0,0,0,0.35)';
    o.fillRect(0, 0, w, 40);
    o.fillStyle = '#f2c230';
    o.font = '700 22px "Barlow Condensed", Arial, sans-serif';
    o.fillText(name, 16, 28);
  }
  return out.toDataURL('image/jpeg', 0.9);
}
