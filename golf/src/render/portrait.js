// 3D portraits of golfers for the character shop and the create screen.
// Each one is rendered once with the game's own renderer into an offscreen
// target, then kept as an image, so no extra WebGL context is needed.
import * as THREE from '../../vendor/three.module.min.js';
import { Golfer } from './golfer.js';

const cache = new Map();
let scene = null, cam = null, rt = null;

// Render targets come back in linear light; convert to sRGB for display
const LUT = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  const l = i / 255;
  const s = l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  LUT[i] = Math.round(Math.min(1, Math.max(0, s)) * 255);
}

function setup() {
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe4efff, 0x5d6b4c, 1.7));
  const key = new THREE.DirectionalLight(0xfff3e0, 2.4);
  key.position.set(3, 4, 2.5);
  const rim = new THREE.DirectionalLight(0xbfd8ff, 1.1);
  rim.position.set(-2, 2, -3);
  scene.add(key, rim);
  cam = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
}

function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
  });
}

// Returns a data URL (cached per look). pose: 'tip' | 'fist' | 'arms' | 'stand'
export function portrait(renderer, look, { pose = 'tip', w = 168, h = 210, key = '' } = {}) {
  const k = `${key || JSON.stringify(look)}|${pose}|${w}x${h}`;
  if (cache.has(k)) return cache.get(k);
  if (!renderer || (renderer.getContext && renderer.getContext().isContextLost())) return '';
  if (!scene) setup();
  const S = 2; // supersample for smooth edges
  const W = w * S, H = h * S;
  if (!rt || rt.width !== W || rt.height !== H) {
    if (rt) rt.dispose();
    rt = new THREE.WebGLRenderTarget(W, H);
  }
  const g = new Golfer(look);
  g.setClub('wood', 1.12, { crown: '#23262b' });
  g.placeAt({ x: 0, y: 0, z: 0 }, 0);
  g.root.position.set(0, 0, 0);
  g.baseY = 0;
  if (pose === 'stand') { g.address(); } else { g.react(pose); g.reaction.t = 1.25; g.poseReaction(); }
  scene.add(g.root);
  // three-quarter view from the golfer's front (they face +x)
  // arms-up poses need more headroom than a tip of the cap
  const tall = pose === 'arms' || pose === 'fist';
  cam.aspect = w / h;
  cam.fov = tall ? 27 : 23;
  cam.position.set(3.9, 1.35, 1.85);
  cam.lookAt(0, tall ? 1.14 : 0.97, 0.02);
  cam.updateProjectionMatrix();
  const prevRT = renderer.getRenderTarget();
  const prevColor = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const buf = new Uint8Array(W * H * 4);
  try {
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  } finally {
    renderer.setRenderTarget(prevRT);
    renderer.setClearColor(prevColor, prevAlpha);
    scene.remove(g.root);
    disposeTree(g.root);
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

// Fill every <img data-portrait="key"> under root, a few per frame so the
// page stays responsive. looks: { key: look }
export function fillPortraits(renderer, root, looks, opts = {}) {
  const imgs = [...root.querySelectorAll('img[data-portrait]')];
  let i = 0;
  const step = () => {
    const t0 = performance.now();
    while (i < imgs.length && performance.now() - t0 < 24) {
      const im = imgs[i++];
      const look = looks[im.dataset.portrait];
      if (!look || !im.isConnected) continue;
      const url = portrait(renderer, look, { ...opts, key: im.dataset.portrait + JSON.stringify(look), pose: im.dataset.pose || opts.pose || 'tip' });
      if (url) { im.src = url; im.classList.add('ready'); }
    }
    if (i < imgs.length) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
