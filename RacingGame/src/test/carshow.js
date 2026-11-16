import * as THREE from 'three';
import { Graphics } from '../gfx/renderer.js';
import { Environment } from '../gfx/environment.js';
import { buildCar, makeVisualSpec, BODY_TYPES } from '../gfx/carModel.js';
import { groundTextures, asphaltTextures } from '../gfx/textures.js';

const params = new URLSearchParams(location.search);
const app = document.getElementById('app');
const gfx = new Graphics(app);
gfx.setQuality(params.get('q') || 'high');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 5000);
const env = new Environment(scene, gfx.renderer, params.get('env') || 'golden', gfx.quality);
const at = asphaltTextures();
for (const k of ['map', 'normalMap', 'roughnessMap']) at[k].repeat.set(30, 30);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ map: at.map, normalMap: at.normalMap, roughnessMap: at.roughnessMap }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const types = (params.get('types') || 'hatch,sedan,coupe,muscle,sports,gt,wedge,suv,pickup,classic,proto,formula').split(',');
const seed = +(params.get('seed') || 1);
const race = params.get('race') === '1';
const cars = [];
types.forEach((t, i) => {
  const spec = makeVisualSpec(t, seed * 100 + i, { race, livery: params.get('livery') || (race ? 'race' : 'none'), wing: +(params.get('wing') || 0) });
  const t0 = performance.now();
  const car = buildCar(spec, { detail: 2 });
  console.log(t, 'built in', (performance.now() - t0).toFixed(1), 'ms');
  const cols = Math.min(types.length, +(params.get('cols') || 4));
  car.root.position.set(((i % cols) - (cols - 1) / 2) * 6, 0, -Math.floor(i / cols) * 7.5);
  car.root.rotation.y = +(params.get('rot') || 0.6);
  scene.add(car.root);
  cars.push(car);
});
const dist = +(params.get('dist') || 30);
const camH = +(params.get('h') || 6);
const look = new THREE.Vector3(+(params.get('lx') || 0), 0.6, +(params.get('lz') || -6));
camera.position.set(+(params.get('cx') || 0) , camH, dist);
camera.lookAt(look);
gfx.buildComposer(scene, camera, env.preset.bloom);
gfx.resize();
env.update(0, look, 0);
let t = 0;
const maxFrames = +(params.get('frames') || 2);
function frame() {
  const t0 = performance.now();
  gfx.render(1 / 60, {});
  gfx.renderer.getContext().finish();
  console.log('frame', t, (performance.now() - t0).toFixed(0), 'ms');
  t++;
  if (t >= maxFrames) { window.__ready = true; return; }
  setTimeout(frame, 0);
}
frame();
