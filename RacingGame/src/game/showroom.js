// Menu backdrop: a studio with a glossy floor, light strips reflected in the
// paint, and the selected car on a slowly rotating turntable. Also renders
// thumbnails of catalogue cars for the dealership.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildCar, makeVisualSpec } from '../gfx/carModel.js';
import { visualOptionsFor } from '../data/cars.js';
import { clamp, damp } from '../core/rng.js';
import { liteSwap, liteRestore, disposeLite } from '../gfx/lite.js';

export class Showroom {
  constructor(gfx) {
    this.gfx = gfx;
    const scene = new THREE.Scene();
    this.scene = scene;
    scene.background = new THREE.Color(0x07090f);
    scene.fog = new THREE.Fog(0x07090f, 14, 34);
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    this.lite = !!gfx.quality.lite;
    this.liteCache = new Map();
    this.envRT = null;
    scene.environmentIntensity = 0.7;
    // floor
    const floorMat = new THREE.MeshPhysicalMaterial({ color: 0x0b0d12, roughness: 0.35, metalness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.15, envMapIntensity: 0.35 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    // turntable
    const tt = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.7, 0.08, 96), new THREE.MeshPhysicalMaterial({ color: 0x15181f, roughness: 0.25, metalness: 0.8, clearcoat: 1 }));
    tt.position.y = 0.04; tt.receiveShadow = true;
    scene.add(tt);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.66, 0.025, 8, 128), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.4, 1.1) }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.085;
    scene.add(ring);
    this.ring = ring;
    // light strips overhead (visible in reflections)
    const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3.2) });
    for (let i = -2; i <= 2; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 9), stripMat);
      s.position.set(i * 1.6, 6.2, 0);
      scene.add(s);
    }
    const accentMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.3, 0.6) });
    for (const sx of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.2, 0.06), accentMat);
      a.position.set(sx * 7.5, 1.6, -6);
      scene.add(a);
    }
    // back wall
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 12, 64, 1, true, Math.PI * 0.75, Math.PI * 1.5), new THREE.MeshStandardMaterial({ color: 0x0c0f16, roughness: 0.9, side: THREE.BackSide }));
    wall.position.y = 6;
    scene.add(wall);
    // lights
    const key = new THREE.SpotLight(0xffffff, 110, 30, 0.55, 0.6, 1.5);
    key.position.set(4, 9, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0002;
    key.shadow.radius = 4;
    scene.add(key, key.target);
    const rimL = new THREE.SpotLight(0x5ad1ff, 35, 30, 0.5, 0.7, 1.5);
    rimL.position.set(-7, 4, -5);
    const rimR = new THREE.SpotLight(0xff3d7a, 28, 30, 0.5, 0.7, 1.5);
    rimR.position.set(7, 4, -5);
    scene.add(rimL, rimR);
    scene.add(new THREE.HemisphereLight(0x8899bb, 0x111111, 0.3));
    this.key = key;
    // extra fill light used only in Lite (there are no reflections to light the car)
    this.liteFill = new THREE.HemisphereLight(0xffffff, 0x3a4050, 1.5);
    this.liteFill.visible = false;
    scene.add(this.liteFill);
    this.pivot = new THREE.Group();
    scene.add(this.pivot);
    this.car = null;
    this.angle = 0.6;
    this.camAngle = 0.5;
    this.camDist = 9.5;
    this.camTarget = { dist: 9.5, height: 1.7, look: 0.55, x: 0 };
    this.cur = { dist: 9.5, height: 1.7, look: 0.55, x: 0 };
    this.spin = 0.22;
    this.drag = null;
    this.thumbScene = this.makeThumbScene();
    this.thumbCam = new THREE.PerspectiveCamera(26, 240 / 140, 0.1, 100);
    this.thumbQueue = [];
    this.thumbCache = new Map();
    if (this.lite) { this.lite = false; this.setLite(true); } else this.ensureEnv();
  }

  // Studio reflections (not used in Lite)
  ensureEnv() {
    if (!this.envRT) {
      const pmrem = new THREE.PMREMGenerator(this.gfx.renderer);
      const room = new RoomEnvironment();
      this.envRT = pmrem.fromScene(room, 0.03);
      pmrem.dispose();
      room.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } });
    }
    this.scene.environment = this.envRT.texture;
    this.thumbScene.environment = this.envRT.texture;
  }

  // Lite graphics on/off for the menu backdrop and car thumbnails
  setLite(on) {
    on = !!on;
    if (on === this.lite) return;
    this.lite = on;
    for (const c of this.thumbCache.values()) { c.width = 0; c.height = 0; }
    this.thumbCache.clear();
    this.liteFill.visible = on;
    this.thumbFill.visible = on;
    this.key.castShadow = !on;
    if (on) {
      this.scene.environment = null;
      this.thumbScene.environment = null;
      liteSwap(this.scene, this.liteCache);
      liteSwap(this.thumbScene, this.liteCache);
      if (this.car) this.car.useLite(this.liteCache);
    } else {
      this.ensureEnv();
      liteRestore(this.scene);
      liteRestore(this.thumbScene);
      disposeLite(this.liteCache);
      // rebuild the car so its light materials are the real ones again
      if (this.lastCar) { this.carKey = null; this.setCar(...this.lastCar); }
    }
  }

  // The graphics context was lost and restored: reflections must be rebuilt
  contextRestored() {
    if (this.envRT) { this.envRT.dispose(); this.envRT = null; }
    if (!this.lite) this.ensureEnv();
  }

  // Lite copies of one car's own materials are not needed once the car is gone
  dropLite(car) {
    for (const d of car.disposables || []) {
      const l = this.liteCache.get(d);
      if (l) { l.dispose(); this.liteCache.delete(d); }
    }
  }

  makeThumbScene() {
    const s = new THREE.Scene();
    s.background = new THREE.Color(0x10141c);
    s.fog = new THREE.Fog(0x10141c, 7, 15);
    s.environmentIntensity = 1.0;
    const d = new THREE.DirectionalLight(0xffffff, 2.5);
    d.position.set(3, 6, 4);
    s.add(d);
    this.thumbFill = new THREE.HemisphereLight(0xffffff, 0x3a4050, 1.6);
    this.thumbFill.visible = false;
    s.add(this.thumbFill);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x151a24, roughness: 0.4, metalness: 0.3 }));
    fl.rotation.x = -Math.PI / 2;
    s.add(fl);
    return s;
  }

  setCar(carRecord, custom = {}, { offsetX = 0 } = {}) {
    const key = carRecord ? `${carRecord.id}_${JSON.stringify(custom)}` : '';
    if (key === this.carKey) { this.camTarget.x = offsetX; return; }
    this.carKey = key;
    this.lastCar = [carRecord, custom, { offsetX }];
    if (this.car) { this.dropLite(this.car); this.car.dispose(); this.car = null; }
    if (!carRecord) return;
    const vis = makeVisualSpec(carRecord.body, carRecord.seed, visualOptionsFor(carRecord, custom));
    this.car = buildCar(vis, { detail: this.lite ? 1 : 2 });
    this.car.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    this.pivot.add(this.car.root);
    if (this.lite) { liteSwap(this.car.root, this.liteCache); this.car.useLite(this.liteCache); }
    const L = this.car.dims.front - this.car.dims.rear;
    this.camTarget.dist = 6.5 + L * 1.05;
    this.camTarget.height = 1.2 + this.car.dims.H * 0.5;
    this.camTarget.look = this.car.dims.H * 0.42;
    this.camTarget.x = offsetX;
    this.car.root.position.z = -(this.car.dims.front + this.car.dims.rear) / 2;
    this.pop = 0;
  }

  setFrame(x) { this.camTarget.x = x; }

  attachControls(el) {
    const down = (e) => { this.drag = { x: e.clientX ?? e.touches?.[0]?.clientX, a: this.angle }; };
    const move = (e) => {
      if (!this.drag) return;
      const x = e.clientX ?? e.touches?.[0]?.clientX;
      this.angle = this.drag.a + (x - this.drag.x) * 0.01;
    };
    const up = () => { this.drag = null; };
    el.addEventListener('mousedown', down); window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    el.addEventListener('touchstart', down, { passive: true }); window.addEventListener('touchmove', move, { passive: true }); window.addEventListener('touchend', up);
  }

  update(dt) {
    if (!this.drag) this.angle += dt * this.spin;
    this.pivot.rotation.y = this.angle;
    this.ring.material.color.setHSL(0.47 + Math.sin(performance.now() / 2000) * 0.03, 1, 0.55);
    const c = this.cur, t = this.camTarget;
    c.dist = damp(c.dist, t.dist, 3, dt); c.height = damp(c.height, t.height, 3, dt); c.look = damp(c.look, t.look, 3, dt); c.x = damp(c.x, t.x, 4, dt);
    const ca = this.camAngle;
    this.camera.position.set(Math.sin(ca) * c.dist, c.height, Math.cos(ca) * c.dist);
    this.camera.lookAt(0, c.look, 0);
    // shift the framing so the car sits beside the menu panel
    this.camera.setViewOffset(1000, 1000, -c.x * 1000, 0, 1000, 1000);
    if (this.car) {
      this.pop = Math.min(1, (this.pop || 0) + dt * 2.5);
      const s = 0.85 + 0.15 * (1 - Math.pow(1 - this.pop, 3));
      this.pivot.scale.setScalar(s);
      this.car.update(dt, { steer: Math.sin(performance.now() / 3000) * 0.15, speed: 0 });
    }
  }

  // Render a thumbnail for a catalogue car into a 2D canvas (call before the main render)
  renderThumb(car, canvas) {
    const r = this.gfx.renderer;
    const vis = makeVisualSpec(car.body, car.seed, visualOptionsFor(car, {}));
    const model = buildCar(vis, { detail: 1 });
    model.blob.visible = true;
    model.root.rotation.y = 0.75;
    model.root.position.z = -(model.dims.front + model.dims.rear) / 2 * Math.cos(0.75);
    this.thumbScene.add(model.root);
    if (this.lite) liteSwap(model.root, this.liteCache);
    const L = model.dims.front - model.dims.rear;
    const cam = this.thumbCam;
    cam.position.set(0.7, 0.9 + model.dims.H * 0.45, 2.4 + L * 1.05);
    cam.lookAt(0, model.dims.H * 0.38, 0);
    const w = canvas.width, h = canvas.height;
    cam.aspect = w / h; cam.updateProjectionMatrix();
    const pr = r.getPixelRatio();
    const size = r.getSize(new THREE.Vector2());
    r.setScissorTest(true);
    r.setViewport(0, 0, w / pr, h / pr);
    r.setScissor(0, 0, w / pr, h / pr);
    r.render(this.thumbScene, cam);
    const ctx = canvas.getContext('2d');
    const bufH = r.domElement.height;
    ctx.drawImage(r.domElement, 0, bufH - h, w, h, 0, 0, w, h);
    r.setScissorTest(false);
    r.setViewport(0, 0, size.x, size.y);
    this.dropLite(model);
    model.dispose();
  }

  queueThumb(car, canvas) {
    const cached = this.thumbCache.get(car.id);
    if (cached) { canvas.getContext('2d').drawImage(cached, 0, 0, canvas.width, canvas.height); return; }
    this.thumbQueue = this.thumbQueue.filter((q) => q.canvas !== canvas);
    this.thumbQueue.push({ car, canvas });
  }

  processThumbs(budgetMs = 14) {
    const t0 = performance.now();
    while (this.thumbQueue.length && performance.now() - t0 < budgetMs) {
      const { car, canvas } = this.thumbQueue.shift();
      if (!canvas.isConnected) continue;
      this.renderThumb(car, canvas);
      const copy = document.createElement('canvas');
      copy.width = canvas.width; copy.height = canvas.height;
      copy.getContext('2d').drawImage(canvas, 0, 0);
      this.thumbCache.set(car.id, copy);
      if (this.thumbCache.size > 150) {
        const k = this.thumbCache.keys().next().value;
        const old = this.thumbCache.get(k);
        old.width = 0; old.height = 0; // free canvas memory right away (matters on iPhone)
        this.thumbCache.delete(k);
      }
    }
  }
}
