import * as THREE from 'three';
import { Graphics } from '../gfx/renderer.js';
import { Environment } from '../gfx/environment.js';
import { buildCar, makeVisualSpec } from '../gfx/carModel.js';
import { buildTrackScene } from '../gfx/trackBuilder.js';
import { Track } from '../sim/track.js';
import { trackById } from '../data/tracks.js';

const params = new URLSearchParams(location.search);
const app = document.getElementById('app');
const gfx = new Graphics(app);
gfx.setQuality(params.get('q') || 'high');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(+(params.get('fov') || 55), 1, 0.3, 30000);
const def = trackById(params.get('t') || 'kingsbridge');
let t0 = performance.now();
const track = new Track(def);
console.log('track', (performance.now() - t0).toFixed(0), 'ms');
const env = new Environment(scene, gfx.renderer, params.get('env') || def.env, gfx.quality);
t0 = performance.now();
const ts = buildTrackScene(track, env, gfx.quality);
scene.add(ts.group);
console.log('trackScene', (performance.now() - t0).toFixed(0), 'ms');
let tris = 0; ts.group.traverse((o) => { if (o.isMesh && o.geometry.index) tris += o.geometry.index.count / 3 * (o.isInstancedMesh ? o.count : 1); });
console.log('tris', tris, 'children', ts.group.children.length);
const types = ['sports', 'gt', 'wedge', 'coupe', 'muscle', 'sedan', 'hatch', 'proto'];
const nCars = +(params.get('cars') || 8);
for (let k = 0; k < nCars; k++) {
  const slot = track.gridSlot(k);
  const spec = makeVisualSpec(params.get('body') || types[k % types.length], 50 + k, { race: true, livery: 'race', wing: 3 });
  const car = buildCar(spec, { detail: 2, night: !!env.preset.night });
  car.root.position.set(slot.x, slot.y, slot.z);
  car.root.rotation.y = slot.heading;
  scene.add(car.root);
}
ts.setStartLights(+(params.get('lights') || 3));
// camera
const s = +(params.get('s') ?? -110);
const f = track.frameAt(s);
const back = +(params.get('back') || 14), up = +(params.get('up') || 4.5), side = +(params.get('side') || 0);
const ahead = track.frameAt(s + +(params.get('ahead') || 60));
if (params.get('aerial')) {
  camera.position.set(f.x + f.lx * 300, f.y + 350, f.z + f.lz * 300);
  camera.lookAt(track.bounds.cx, 0, track.bounds.cz);
} else {
  camera.position.set(f.x - f.tx * back + f.lx * side, f.y + up, f.z - f.tz * back + f.lz * side);
  camera.lookAt(ahead.x, ahead.y + 1, ahead.z);
}
gfx.buildComposer(scene, camera, env.preset.bloom);
gfx.resize();
env.update(0, camera.position.clone().add(new THREE.Vector3(f.tx * 30, 0, f.tz * 30)), 10);
ts.update(0, 10);
let n = 0;
const maxFrames = +(params.get('frames') || 2);
function frame() {
  const t0 = performance.now();
  gfx.render(1 / 60, { speed: +(params.get('speed') || 0) });
  gfx.renderer.getContext().finish();
  console.log('frame', n, (performance.now() - t0).toFixed(0), 'ms');
  if (++n >= maxFrames) { window.__ready = true; return; }
  setTimeout(frame, 0);
}
frame();
