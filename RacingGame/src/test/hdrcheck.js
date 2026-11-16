// Renders a race-like scene and scans the HDR buffer for values that would
// overflow half-float (65504) on a real GPU.
import * as THREE from 'three';
import { Graphics } from '../gfx/renderer.js';
import { Environment } from '../gfx/environment.js';
import { buildCar, makeVisualSpec } from '../gfx/carModel.js';
const app = document.getElementById('app');
const gfx = new Graphics(app);
gfx.setQuality('high');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
const env = new Environment(scene, gfx.renderer, new URLSearchParams(location.search).get('env') || 'noon', gfx.quality);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);
['sports', 'wedge', 'sedan', 'gt'].forEach((t, i) => {
  const car = buildCar(makeVisualSpec(t, 7 + i, { finish: ['metallic', 'pearl', 'gloss', 'chrome'][i] }), { detail: 2 });
  car.root.position.set((i - 1.5) * 5, 0, 0); car.root.rotation.y = 2.4 + i * 0.7; scene.add(car.root);
});
camera.position.set(0, 2.2, 12); camera.lookAt(0, 0.6, 0);
gfx.buildComposer(scene, camera, 0.2);
env.update(0, new THREE.Vector3(), 0);
const rpass = gfx.renderPass;
// render only the scene pass into its target and read back
const rt = new THREE.WebGLRenderTarget(320, 180, { type: THREE.FloatType });
gfx.renderer.setRenderTarget(rt);
gfx.renderer.render(scene, camera);
const buf = new Float32Array(320 * 180 * 4);
gfx.renderer.readRenderTargetPixels(rt, 0, 0, 320, 180, buf);
let max = 0, over = 0, nan = 0;
for (let i = 0; i < buf.length; i += 4) for (let c = 0; c < 3; c++) { const v = buf[i + c]; if (v !== v) nan++; else { max = Math.max(max, v); if (v > 65504) over++; } }
console.log(JSON.stringify({ max, over, nan }));
window.__ready = true;
void rpass;
