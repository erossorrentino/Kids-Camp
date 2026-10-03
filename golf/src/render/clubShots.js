// Product shots of club heads for the club store: each head is rendered once
// with the game's own renderer into an offscreen target and kept as an image
// (like the golfer portraits), so no extra WebGL context is needed.
import * as THREE from '../../vendor/three.module.min.js';
import { buildClub, addressDir, BALL_Y } from './clubs.js';

const cache = new Map();
let scene = null, cam = null, rt = null;

const LUT = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  const l = i / 255;
  const s = l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  LUT[i] = Math.round(Math.min(1, Math.max(0, s)) * 255);
}

function setup() {
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xeef4ff, 0x4a5240, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(1.5, 2.5, -2);
  const rim = new THREE.DirectionalLight(0xbfd8ff, 1.4);
  rim.position.set(-2, 1.2, 2);
  const low = new THREE.DirectionalLight(0xfff0dc, 0.8);
  low.position.set(0.5, -1, -1.5);
  scene.add(key, rim, low);
  cam = new THREE.PerspectiveCamera(22, 1, 0.01, 10);
}

// Where to look and how far back to stand for each kind of head
// (heights are above the ground; the ball centre sits BALL_Y up)
const FRAME = {
  driver: { at: [0.004, 0.026, 0.05], dist: 0.37 },
  wood: { at: [0.004, 0.018, 0.035], dist: 0.3 },
  hybrid: { at: [0.004, 0.02, 0.025], dist: 0.27 },
  iron: { at: [0.008, 0.024, 0.008], dist: 0.24 },
  wedge: { at: [0.01, 0.028, 0.01], dist: 0.25 },
  putter: { at: [0.0, 0.014, 0.02], dist: 0.28 },
};
const LIE = { wood: 57, hybrid: 59, iron: 62, wedge: 64, putter: 71 };

/** spec: { kind, id, loft, length, bounce, look } -> PNG data URL */
export function clubShot(renderer, spec, { w = 240, h = 150 } = {}) {
  const k = JSON.stringify([spec, w, h]);
  if (cache.has(k)) return cache.get(k);
  if (!renderer || (renderer.getContext && renderer.getContext().isContextLost())) return '';
  if (!scene) setup();
  const S = 2;
  const W = w * S, H = h * S;
  if (!rt || rt.width !== W || rt.height !== H) {
    if (rt) rt.dispose();
    rt = new THREE.WebGLRenderTarget(W, H);
  }
  const lie = LIE[spec.kind] || 62;
  const ball = new THREE.Vector3(0, BALL_Y, 0);
  const grip = ball.clone().addScaledVector(addressDir(lie), spec.length || 0.94);
  const built = buildClub({ ...spec, lie }, { ball, grip });
  const g = built.group;
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), built.hosel.clone().sub(grip).normalize());
  g.position.copy(grip);
  scene.add(g);
  const f = FRAME[spec.kind === 'wood' && spec.id === 'DR' ? 'driver' : spec.kind] || FRAME.iron;
  const at = new THREE.Vector3(...f.at);
  // a three-quarter view from the target side, toe end, slightly above
  const dir = new THREE.Vector3(0.62, 0.42, -1).normalize();
  cam.aspect = w / h;
  cam.position.copy(at).addScaledVector(dir, f.dist);
  cam.lookAt(at);
  cam.updateProjectionMatrix();
  const prevRT = renderer.getRenderTarget();
  const prevColor = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevShadow = renderer.shadowMap.enabled;
  const buf = new Uint8Array(W * H * 4);
  try {
    renderer.shadowMap.enabled = false;
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  } finally {
    renderer.setRenderTarget(prevRT);
    renderer.setClearColor(prevColor, prevAlpha);
    renderer.shadowMap.enabled = prevShadow;
    scene.remove(g);
  }
  const big = document.createElement('canvas');
  big.width = W; big.height = H;
  const bctx = big.getContext('2d');
  const img = bctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const src = (H - 1 - y) * W * 4, dst = y * W * 4;
    for (let x = 0; x < W * 4; x += 4) {
      img.data[dst + x] = LUT[buf[src + x]];
      img.data[dst + x + 1] = LUT[buf[src + x + 1]];
      img.data[dst + x + 2] = LUT[buf[src + x + 2]];
      img.data[dst + x + 3] = buf[src + x + 3];
    }
  }
  bctx.putImageData(img, 0, 0);
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const octx = out.getContext('2d');
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(big, 0, 0, w, h);
  const url = out.toDataURL('image/png');
  cache.set(k, url);
  return url;
}

// Fill every <img data-club="key"> under root, a few per frame. specs: { key: spec }
export function fillClubShots(renderer, root, specs, opts = {}) {
  const imgs = [...root.querySelectorAll('img[data-club]')];
  let i = 0;
  const step = () => {
    const t0 = performance.now();
    while (i < imgs.length && performance.now() - t0 < 24) {
      const im = imgs[i++];
      const spec = specs[im.dataset.club];
      if (!spec || !im.isConnected) continue;
      const url = clubShot(renderer, spec, { w: +im.dataset.w || opts.w || 240, h: +im.dataset.h || opts.h || 150 });
      if (url) { im.src = url; im.classList.add('ready'); }
    }
    if (i < imgs.length) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
