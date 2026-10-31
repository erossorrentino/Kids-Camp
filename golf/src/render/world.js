// Renderer, sky, lights, camera rig and per-hole scene management.
import * as THREE from '../../vendor/three.module.min.js';
import { setClubMaterials } from './clubs.js';
import { HoleScene } from './holeScene.js';
import { sfx } from '../audio.js';
import { Golfer } from './golfer.js';
import { Caddie } from './people.js';
import { Post } from './post.js';
import { makeSkyMaterial, skyRadiance, sunTransmittance } from './sky.js';
import { installAtmosphere, CLOUD_UNIFORMS } from './atmosphere.js';

installAtmosphere();
import { Ball, Tracer, AimRing, DotLine, GreenGrid, Particles, Marks, BallMarkers, Celebration, Rain, TrailSparks, SandPrints } from './effects.js';

export class World {
  constructor(container, settings) {
    this.container = container;
    this.settings = settings;
    this.quality = this.pickQuality(settings.quality);
    // Medium and high draw through the HDR post-processing chain (which
    // does its own multisampling); low draws straight to the screen
    this.usePost = this.quality !== 'low' && settings.post !== false;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: this.quality === 'high' ? 'high-performance' : 'default' });
    this.renderer.toneMapping = this.usePost ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    this.exposure = 1;
    this.bloom = 0.06;
    this.glare = 1;
    // Phones get a lighter pixel budget; the frame-rate governor below can
    // lower it further if the device still struggles
    this.maxPR = Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1.25);
    this.pr = this.maxPR;
    this.renderer.setPixelRatio(this.pr);
    this.renderer.setClearColor(0x16281d, 1);
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.renderer.shadowMap.type = this.quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.domElement.className = 'gl';
    this.post = this.usePost ? new Post(this.renderer, this.quality) : null;
    this.dbSize = new THREE.Vector2();
    container.appendChild(this.renderer.domElement);
    // The browser can drop the GPU context (low memory, app switching).
    // Keep the game alive and redraw once the context comes back.
    this.lost = false;
    this.onContextLost = null;
    this.onContextRestored = null;
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
      if (this.onContextLost) this.onContextLost();
    });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.setPixelRatio(Math.max(0.75, this.pr - 0.25));
      if (this.onContextRestored) this.onContextRestored();
    });
    this.perf = { t: 0, n: 0, slow: 0, active: false };

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 12000);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24), makeSkyMaterial());
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    this.sky.material.depthTest = false;
    this.scene.add(this.sky);
    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a5a3a, 1.25);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    this.sun.castShadow = this.quality !== 'low';
    const sm = this.quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 600;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.sunDir = new THREE.Vector3(0.3, 0.7, -0.4).normalize();
    this.scene.fog = new THREE.Fog(0xcfe0ea, 120, 9000);

    setClubMaterials(this.quality !== 'low');
    this.ball = new Ball({ pbr: this.quality !== 'low' });
    this.ball.addTo(this.scene);
    this.tracer = new Tracer();
    this.scene.add(this.tracer.mesh);
    this.aim = new AimRing();
    this.aim.addTo(this.scene);
    this.preview = new DotLine(0xffffff, 0.45, 300);
    this.scene.add(this.preview.points);
    this.puttLine = new DotLine(0xfff3b0, 0.06, 300);
    this.scene.add(this.puttLine.points);
    this.grid = new GreenGrid();
    this.scene.add(this.grid.group);
    this.particles = new Particles();
    this.scene.add(this.particles.points);
    this.marks = new Marks();
    this.marks.addTo(this.scene);
    this.markers = new BallMarkers(14, { pbr: this.quality !== 'low' });
    this.markers.addTo(this.scene);
    this.party = new Celebration();
    this.scene.add(this.party.points);
    this.rain = new Rain(this.quality === 'low' ? 1100 : 2200);
    this.scene.add(this.rain.mesh);
    this.sand = new SandPrints();
    this.sand.addTo(this.scene);
    this.sparks = new TrailSparks();
    this.scene.add(this.sparks.points);
    this.trail = null;
    this.night = false;
    this.golfer = null;
    this.holeScene = null;

    // camera rig
    this.cam = { pos: new THREE.Vector3(0, 20, 30), look: new THREE.Vector3(0, 0, 0), fov: 50 };
    this.camGoal = { pos: new THREE.Vector3(0, 20, 30), look: new THREE.Vector3(0, 0, 0), fov: 50, k: 4 };
    this.focus = new THREE.Vector3();
    this.wind = { x: 0, z: 0 };
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  pickQuality(q) {
    if (q && q !== 'auto') return q;
    const small = Math.min(window.innerWidth, window.innerHeight);
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (touch && small < 540) return 'low'; // phones
    return touch || small < 700 ? 'medium' : 'high';
  }

  // Camera shots are framed for a landscape screen. On a tall (portrait)
  // screen widen the vertical angle so the sides (the golfer, the target)
  // stay in the picture.
  fovFor(f) {
    const a = this.camera.aspect;
    if (!(a < 0.75)) return f;
    const k = 0.75 / a;
    const r = (Math.PI / 180) * f * 0.5;
    return Math.min(92, (2 * Math.atan(Math.tan(r) * k) * 180) / Math.PI);
  }

  setPixelRatio(pr) {
    this.pr = pr;
    this.renderer.setPixelRatio(pr);
    this.resize();
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth || window.innerWidth);
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    // Never ask for a giant drawing buffer (some webviews report huge sizes)
    const cap = Math.sqrt(3.2e6 / (w * h));
    if (this.pr > cap) this.renderer.setPixelRatio(Math.max(0.5, cap));
    else this.renderer.setPixelRatio(this.pr);
    this.renderer.setSize(w, h, false);
    if (this.post) {
      this.renderer.getDrawingBufferSize(this.dbSize);
      this.post.setSize(this.dbSize.x, this.dbSize.y);
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Frame-rate governor: while playing, if the device can't keep up,
  // render fewer pixels rather than stutter (or run out of memory)
  governor(realDt) {
    const p = this.perf;
    if (!p.active || realDt <= 0 || realDt > 1) return;
    p.t += realDt; p.n++;
    if (p.t < 2.5) return;
    const fps = p.n / p.t;
    p.t = 0; p.n = 0;
    if (fps < 24 && this.pr > 0.75) {
      p.slow++;
      if (p.slow >= 2) { p.slow = 0; this.setPixelRatio(Math.max(0.75, Math.round((this.pr - 0.25) * 100) / 100)); }
    } else p.slow = 0;
  }

  // Sky, sun, fog and weather. cond: timeOfDay (0 dawn .. 1 dusk), night,
  // weather ('sunny' | 'cloudy' | 'rain' | 'fog'), overcast (older saves).
  // The sky is a physical atmosphere model; the sunlight colour, the light
  // from the sky, the haze and the camera exposure all come from it, so the
  // course is lit the way the sky looks.
  setConditions(cond, style, headingOffset = 0) {
    const t = cond.timeOfDay ?? 0.45;
    const night = !!cond.night;
    const wx = cond.weather || (cond.overcast ? 'cloudy' : 'sunny');
    const rain = wx === 'rain';
    const grey = wx === 'cloudy' || rain || wx === 'fog';
    // the sun climbs quickly after dawn and sinks low for sunset (about 8°
    // up at the sunset setting), so evening light is properly golden
    const st = Math.sin(Math.PI * t);
    const elev = night ? 0.75 : Math.max(0.06, (st >= 0.5 ? st : st ** 1.6 / 0.5 ** 0.6) * 1.05);
    const az = headingOffset + (night ? 0.9 : (t - 0.5) * 2.6 + 0.6);
    this.sunDir.set(Math.sin(az) * Math.cos(elev), Math.sin(elev), -Math.cos(az) * Math.cos(elev)).normalize();
    const u = this.sky.material.uniforms;
    const golden = night ? 0 : Math.max(0, 1 - Math.sin(Math.PI * t) * 1.6);
    const hazy = style && style.scenery === 'mesas' ? 1.5 : style && style.scenery === 'ocean' ? 1 : 0;
    const atm = { rayleigh: 1.7 + golden * 1.0, turbidity: (grey ? 14 : 3.6 + hazy) + golden * 2, mie: 0.0035 + golden * 0.002, mieG: 0.8, scale: 0.36 };
    u.uRayleigh.value = atm.rayleigh; u.uTurbidity.value = atm.turbidity; u.uMie.value = atm.mie; u.uMieG.value = atm.mieG;
    u.uSunDir.value.copy(this.sunDir);
    u.uMoonDir.value.set(-this.sunDir.x, Math.max(0.35, this.sunDir.y * 0.7), -this.sunDir.z).normalize();
    const sd = night ? { x: this.sunDir.x, y: -0.25, z: this.sunDir.z } : this.sunDir;
    // what the sky looks like straight up and along the horizon
    const rad = (x, y, z) => skyRadiance({ x, y, z }, sd, atm);
    const hd = Math.hypot(this.sunDir.x, this.sunDir.z) || 1;
    const sx = this.sunDir.x / hd, sz = this.sunDir.z / hd;
    const zen = rad(0, 1, 0);
    const hSun = rad(sx, 0.04, sz), hAnti = rad(-sx, 0.04, -sz), hSide = rad(-sz, 0.04, sx);
    const C = (a) => new THREE.Color(a[0], a[1], a[2]);
    const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const skyAvg = C(zen).multiplyScalar(0.4).add(C(hSide).multiplyScalar(0.35)).add(C(hSun).multiplyScalar(0.12)).add(C(hAnti).multiplyScalar(0.13));
    const tr = sunTransmittance(this.sunDir, atm);
    // golden-hour warmth on top of what the atmosphere already filters out
    const sunCol = new THREE.Color(tr.color[0], tr.color[1], tr.color[2]).lerp(new THREE.Color(1, 0.6, 0.3), golden * 0.35);
    let fog = C(hAnti).lerp(C(hSun), 0.3).lerp(C(hSide), 0.3);
    let sunI = 3.1 * Math.min(1, tr.strength * 1.15) * (0.35 + 0.65 * Math.min(1, this.sunDir.y / 0.35));
    // more fill from the glowing sky when the sun is low
    let hemiI = 1.0 + golden * 0.4;
    const sky = skyAvg.clone();
    // haze picks up the sky's colour (a bit more saturated, like the sky)
    { const fl = lum(fog); fog.setRGB(fl + (fog.r - fl) * 1.3, fl + (fog.g - fl) * 1.3, fl + (fog.b - fl) * 1.3); }
    let vis = style && style.scenery === 'mesas' ? 11000 : 15000, clear = 150;
    u.uNight.value = 0; u.uOver.value = 0; u.uCloudDark.value = 0;
    u.uCloud.value = 0.3 + ((cond.windMph || 5) % 7) * 0.035;
    u.uScale.value = atm.scale;
    if (night) {
      u.uNight.value = 1;
      u.uCloud.value = grey ? 0.75 : 0.15;
      sunCol.set('#9fb4ff'); sunI = 0.35;
      sky.setRGB(0.02, 0.03, 0.06); hemiI = 1.0;
      fog.setRGB(0.016, 0.022, 0.04); vis = 2600; clear = 60;
    } else if (grey) {
      const over = rain ? 0.95 : 0.85;
      u.uOver.value = over;
      const g = rain ? 0.42 : 0.68;
      u.uOvercast.value.setRGB(g * 0.97, g, g * 1.04);
      u.uCloud.value = rain ? 0.95 : 0.85; u.uCloudDark.value = rain ? 0.6 : 0.3;
      sunI = rain ? 0.35 : 0.8;
      sky.setRGB(g * 0.97, g, g * 1.03); hemiI = rain ? 1.1 : 1.35;
      fog.setRGB(g * 0.96, g * 0.99, g * 1.02); vis = rain ? 1400 : 4200; clear = rain ? 30 : 80;
    }
    if (wx === 'fog') {
      fog.setRGB(0.62, 0.65, 0.68).multiplyScalar(night ? 0.06 : 1); vis = 340; clear = 8;
      sunI *= 0.7;
    }
    if (style && style.fog && !night && wx !== 'fog') fog.lerp(new THREE.Color(style.fog).convertSRGBToLinear().multiplyScalar(lum(fog) / 0.6), 0.25);
    // lights
    this.sun.color.copy(sunCol);
    this.sun.intensity = sunI;
    const skyN = sky.clone().multiplyScalar(1 / Math.max(1e-4, Math.max(sky.r, sky.g, sky.b)));
    this.hemi.color.copy(skyN);
    this.hemi.groundColor.set(night ? '#0d140e' : '#56603c').lerp(sunCol, 0.15);
    this.hemi.intensity = hemiI * (night ? 0.35 : Math.min(1.6, 0.55 + lum(sky) * 1.1));
    // haze
    this.scene.fog.color.copy(fog);
    this.scene.fog.near = clear;
    this.scene.fog.far = vis;
    u.uHazeColor.value.copy(fog);
    u.uHaze.value = grey ? 0.6 : 0.22;
    // clouds lit by the sun, shaded by the sky
    u.uCloudLit.value.copy(sunCol).multiplyScalar(night ? 0.04 : grey ? lum(sky) * 1.1 : 0.9 + sunI * 0.22);
    u.uCloudShade.value.copy(sky).multiplyScalar(night ? 0.6 : 0.72).lerp(new THREE.Color(0.35, 0.37, 0.42).multiplyScalar(night ? 0.05 : grey ? lum(sky) : 1), 0.4);
    // exposure follows the brightness of the sky, like a camera would
    const L = lum(skyAvg);
    this.exposure = night ? 1.9 : grey ? 1.15 : Math.max(0.85, Math.min(2.0, 1.12 * (0.5 / Math.max(0.05, L)) ** 0.35));
    this.bloom = night ? 0.12 : grey ? 0.04 : 0.06;
    this.glare = night || grey ? 0 : 1;
    // shadows of the clouds on the ground (none without direct sunlight)
    CLOUD_UNIFORMS.uCloudCover.value = u.uCloud.value;
    CLOUD_UNIFORMS.uCloudShadow.value = night || grey ? 0 : 1;
    this.rain.setLevel(rain ? (cond.rainLevel ?? 0.8) : 0);
    this.night = night;
    // the ball glows a little under the lights so it's easy to follow
    this.ball.mesh.material.emissive.set(night ? '#8a8a7a' : '#000000');
    this.applyTrail();
    this.updateEnvironment();
  }

  // Reflections for shiny things (the ball, clubs, water): the sky itself
  updateEnvironment() {
    if (this.quality === 'low') return;
    if (!this.pmrem) {
      this.pmrem = new THREE.PMREMGenerator(this.renderer);
      this.envScene = new THREE.Scene();
      this.envSky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), this.sky.material);
      this.envScene.add(this.envSky);
      // the land below the horizon
      const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2f3d22 }));
      ground.position.y = -2;
      this.envGround = ground;
      this.envScene.add(ground);
    }
    this.envGround.material.color.copy(this.scene.fog.color).multiplyScalar(0.3).lerp(new THREE.Color(0.06, 0.09, 0.035), 0.6);
    const prev = this.envRT;
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 100);
    this.scene.environment = this.envRT.texture;
    if (prev) prev.dispose();
  }

  // The player's tracer style and ball colour (cosmetic)
  setTrail(trail, ballColor = '#ffffff', fallbackColor = null) {
    this.trail = trail || null;
    this.trailFallback = fallbackColor;
    this.ball.mesh.material.color.set(ballColor || '#ffffff');
    this.applyTrail();
  }

  applyTrail() {
    const t = this.trail;
    const plain = this.trailFallback || (this.night ? '#7ff0ff' : '#ffc93c');
    this.tracer.setStyle(t && t.id !== 'classic' ? t : null, plain);
    this.sparks.setKind(t && t.particles ? t.particles : null);
  }

  loadHole(hole, opts = {}) {
    if (this.holeScene) {
      this.scene.remove(this.holeScene.group);
      this.holeScene.dispose();
    }
    this.holeScene = new HoleScene(hole, { quality: this.quality, crowd: opts.crowd, board: opts.board, night: this.night, rain: this.rain.level > 0, sunDir: this.sunDir.clone() });
    this.scene.add(this.holeScene.group);
    this.grid.build(hole);
    this.grid.setVisible(false);
    this.marks.reset();
    this.sand.reset();
    this.markers.reset();
    this.tracer.reset();
    this.preview.clear();
    this.puttLine.clear();
  }

  // Swap simple shading on a figure for physically based materials: cloth,
  // skin and shoes pick up soft light from the sky and a little sheen
  pbrify(obj) {
    if (this.quality === 'low') return obj;
    const swap = new Map();
    obj.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.material || !o.material.isMeshLambertMaterial) return;
      const m = o.material;
      let s = swap.get(m);
      if (!s) {
        s = new THREE.MeshStandardMaterial({
          color: m.color, map: m.map, emissive: m.emissive, vertexColors: m.vertexColors, side: m.side,
          transparent: m.transparent, opacity: m.opacity, roughness: 0.68, metalness: 0, envMapIntensity: 0.45,
        });
        swap.set(m, s);
      }
      o.material = s;
    });
    return obj;
  }

  setGolfer(look, name = '') {
    this.clearGolfers();
    if (this.golfer) this.scene.remove(this.golfer.root);
    this.golfer = new Golfer(look);
    this.pbrify(this.golfer.root);
    this.scene.add(this.golfer.root);
    if (this.caddie) this.scene.remove(this.caddie.group);
    this.caddie = new Caddie(look, name);
    this.pbrify(this.caddie.group);
    this.scene.add(this.caddie.group);
  }

  // Several golfers sharing a round: build each once, show the one to play
  useGolfer(key, look, name = '') {
    if (!this.golfers) this.golfers = new Map();
    let e = this.golfers.get(key);
    if (!e) {
      e = { golfer: new Golfer(look), caddie: new Caddie(look, name) };
      this.pbrify(e.golfer.root); this.pbrify(e.caddie.group);
      this.golfers.set(key, e);
    }
    if (this.golfer && this.golfer !== e.golfer) this.scene.remove(this.golfer.root);
    if (this.caddie && this.caddie !== e.caddie) this.scene.remove(this.caddie.group);
    this.golfer = e.golfer;
    this.caddie = e.caddie;
    this.golfer.root.visible = true;
    this.scene.add(this.golfer.root);
    this.scene.add(this.caddie.group);
  }

  clearGolfers() {
    if (!this.golfers) return;
    for (const e of this.golfers.values()) {
      this.scene.remove(e.golfer.root);
      this.scene.remove(e.caddie.group);
      for (const o of [e.golfer.root, e.caddie.group]) {
        o.traverse((m) => { if (m.geometry) m.geometry.dispose(); });
      }
    }
    this.golfers = null;
  }

  hidePlayers() {
    if (this.golfer) this.golfer.root.visible = false;
    if (this.caddie) this.caddie.group.visible = false;
  }

  // A ball landed or splashed at x,z: nearby animals scatter
  scare(x, z, radius = 18, quiet = false) {
    const w = this.holeScene && this.holeScene.wildlife;
    if (!w) return null;
    const r = w.scare(x, z, radius);
    if (!quiet && r.flew) { sfx.quack(Math.min(4, 1 + r.flew)); sfx.flap(); }
    else if (!quiet && r.swam) sfx.quack(2);
    return r;
  }

  // The gallery: polite applause, turning to follow the ball, photos
  // grow the patch of real grass blades round the ball
  grassAt(x, z) { if (this.holeScene && this.holeScene.grass) this.holeScene.grass.place(x, z); }
  clap(strength = 1) { if (this.holeScene) this.holeScene.clap(strength); }
  crowdWatch(x, y, z, pointing = false) {
    if (!this.holeScene) return;
    this.watchV = this.watchV || new THREE.Vector3();
    this.holeScene.watch(x == null ? null : this.watchV.set(x, y, z), pointing);
  }
  flashes(n = 4, over = 1.2) { if (this.holeScene) this.holeScene.flash(n, over); }

  cheer(strength) {
    if (this.holeScene) this.holeScene.cheer(strength);
  }

  // Confetti and fireworks at a spot
  celebrate(p, color = null, big = true) {
    this.party.celebrate(p, color, big);
  }

  // camera goals: the rig eases toward them
  setCamera(pos, look, fov = 50, k = 4) {
    this.camGoal.pos.copy(pos);
    this.camGoal.look.copy(look);
    this.camGoal.fov = fov;
    this.camGoal.k = k;
  }
  snapCamera() {
    this.cam.pos.copy(this.camGoal.pos);
    this.cam.look.copy(this.camGoal.look);
    this.cam.fov = this.camGoal.fov;
  }

  frame(dt, realDt = dt) {
    this.governor(realDt);
    const g = this.camGoal;
    const a = 1 - Math.exp(-g.k * dt);
    this.cam.pos.lerp(g.pos, a);
    this.cam.look.lerp(g.look, a);
    this.cam.fov += (g.fov - this.cam.fov) * a;
    this.camera.position.copy(this.cam.pos);
    this.camera.lookAt(this.cam.look);
    const fov = this.fovFor(this.cam.fov);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.sky.position.copy(this.camera.position);
    this.sky.material.uniforms.uTime.value += dt;
    // cloud shadows drift with the wind
    const co = CLOUD_UNIFORMS.uCloudOffset.value;
    co.x -= (this.wind.x * 0.8 + 1.2) * dt;
    co.y -= (this.wind.z * 0.8 + 0.4) * dt;
    // shadows follow what we're looking at
    const f = this.focus;
    this.sun.target.position.copy(f);
    this.sun.position.copy(f).addScaledVector(this.sunDir, 250);
    if (this.holeScene) this.holeScene.update(dt, this.wind);
    if (this.golfer) this.golfer.update(dt);
    this.particles.update(dt);
    this.party.update(dt);
    this.rain.update(dt, this.camera, this.wind);
    this.markers.update(dt, this.camera);
    this.tracer.update(this.camera, dt);
    this.sparks.update(dt);
    if (this.lost) return;
    if (this.post) {
      this.post.render(this.scene, this.camera, { exposure: this.exposure, bloom: this.bloom, sunDir: this.sunDir, sunColor: this.sun.color, glare: this.glare }, realDt);
    } else {
      this.renderer.toneMappingExposure = this.exposure;
      this.renderer.render(this.scene, this.camera);
    }
  }
}
