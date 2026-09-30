// Renderer, sky, lights, camera rig and per-hole scene management.
import * as THREE from '../../vendor/three.module.min.js';
import { HoleScene } from './holeScene.js';
import { Golfer } from './golfer.js';
import { Caddie } from './people.js';
import { Ball, Tracer, AimRing, DotLine, GreenGrid, Particles, Marks, BallMarkers, Celebration, Rain } from './effects.js';

function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uZenith: { value: new THREE.Color('#3f76b8') },
      uHorizon: { value: new THREE.Color('#d3e6f2') },
      uGround: { value: new THREE.Color('#9fb5a4') },
      uSunDir: { value: new THREE.Vector3(0.3, 0.6, -0.5).normalize() },
      uSunColor: { value: new THREE.Color('#fff4d6') },
      uSunSize: { value: 1 },
      uTime: { value: 0 },
      uCloud: { value: 0.45 },
      uCloudDark: { value: 0 },
      uNight: { value: 0 },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 uZenith, uHorizon, uGround, uSunDir, uSunColor; uniform float uSunSize, uTime, uCloud, uCloudDark, uNight; varying vec3 vDir;
      float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0 ? mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHorizon, uGround, clamp(-h * 6.0, 0.0, 1.0));
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunColor * (pow(s, 900.0) * 3.0 * uSunSize + (pow(s, 12.0) * 0.25 + pow(s, 3.0) * 0.08) * (1.0 - 0.8 * uNight));
        if (uNight > 0.0 && h > 0.0) {
          // stars: one bright point in a few of the cells of a fine sky grid
          vec2 g = floor(vec2(atan(d.z, d.x) * 160.0, asin(clamp(d.y, -1.0, 1.0)) * 160.0));
          float r = hash(g);
          vec2 f = fract(vec2(atan(d.z, d.x) * 160.0, asin(clamp(d.y, -1.0, 1.0)) * 160.0)) - 0.5;
          float star = step(0.992, r) * smoothstep(0.35, 0.0, length(f)) * smoothstep(0.02, 0.3, h);
          float tw = 0.65 + 0.35 * sin(uTime * (1.5 + r * 3.0) + r * 40.0);
          col += vec3(0.95, 0.97, 1.0) * star * tw * uNight * (0.5 + hash(g + 3.1));
          // a faint band of the milky way
          float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.2, 1.0))) * 3.2, 2.0)) * fbm(d.xz * 6.0 + 3.0);
          col += vec3(0.18, 0.2, 0.3) * band * uNight * smoothstep(0.0, 0.4, h);
        }
        if (h > 0.0) {
          // clouds on a flat layer, thinning toward the horizon
          vec2 uv = d.xz / (h + 0.12) * 0.9 + vec2(uTime * 0.006, uTime * 0.002);
          float n = fbm(uv);
          float cov = smoothstep(1.0 - uCloud, 1.0 - uCloud + 0.28, n);
          float lit = fbm(uv + normalize(uSunDir.xz) * 0.08);
          vec3 cc = mix(vec3(1.0, 0.99, 0.97), vec3(0.62, 0.66, 0.72), clamp((lit - n) * 3.0 + 0.35 + uCloudDark, 0.0, 1.0));
          cc += uSunColor * pow(s, 8.0) * 0.35;
          cc *= 1.0 - 0.86 * uNight;
          col = mix(col, cc, cov * smoothstep(0.0, 0.18, h) * 0.95);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

export class World {
  constructor(container, settings) {
    this.container = container;
    this.settings = settings;
    this.quality = this.pickQuality(settings.quality);
    this.renderer = new THREE.WebGLRenderer({ antialias: this.quality !== 'low', powerPreference: this.quality === 'high' ? 'high-performance' : 'default' });
    // Phones get a lighter pixel budget; the frame-rate governor below can
    // lower it further if the device still struggles
    this.maxPR = Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1.25);
    this.pr = this.maxPR;
    this.renderer.setPixelRatio(this.pr);
    this.renderer.setClearColor(0x16281d, 1);
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.renderer.shadowMap.type = this.quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.domElement.className = 'gl';
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
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 32, 16), skyMaterial());
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
    this.scene.fog = new THREE.Fog(0xcfe0ea, 300, 5200);

    this.ball = new Ball();
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
    this.markers = new BallMarkers();
    this.markers.addTo(this.scene);
    this.party = new Celebration();
    this.scene.add(this.party.points);
    this.rain = new Rain(this.quality === 'low' ? 1100 : 2200);
    this.scene.add(this.rain.mesh);
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
  // weather ('sunny' | 'cloudy' | 'rain' | 'fog'), overcast (older saves)
  setConditions(cond, style, headingOffset = 0) {
    const t = cond.timeOfDay ?? 0.45;
    const night = !!cond.night;
    const wx = cond.weather || (cond.overcast ? 'cloudy' : 'sunny');
    const grey = wx === 'cloudy' || wx === 'rain' || wx === 'fog';
    const elev = night ? 0.75 : Math.max(0.12, Math.sin(Math.PI * t)) * 1.05;
    const az = headingOffset + (night ? 0.9 : (t - 0.5) * 2.6 + 0.6);
    this.sunDir.set(Math.sin(az) * Math.cos(elev), Math.sin(elev), -Math.cos(az) * Math.cos(elev)).normalize();
    const u = this.sky.material.uniforms;
    const golden = night ? 0 : Math.max(0, 1 - Math.sin(Math.PI * t) * 1.6);
    const fog = this.scene.fog;
    fog.near = 300; fog.far = 5200;
    this.hemi.color.set('#cfe3ff');
    this.hemi.groundColor.set('#4a5a3a');
    this.sun.color.set('#fff1dc');
    u.uNight.value = night ? 1 : 0;
    u.uSunColor.value.set('#fff4d6');
    u.uCloud.value = grey ? 0.9 : 0.28 + ((cond.windMph || 5) % 7) * 0.04;
    u.uCloudDark.value = grey ? 0.35 : 0;
    if (night) {
      u.uZenith.value.set('#050a1c'); u.uHorizon.value.set('#1a2645'); u.uSunSize.value = 0.4;
      u.uSunColor.value.set('#dfe8ff');
      u.uCloud.value = grey ? 0.8 : 0.18;
      this.hemi.color.set('#8ea6dc'); this.hemi.groundColor.set('#1a2433'); this.hemi.intensity = 0.55;
      this.sun.color.set('#b8c8ff'); this.sun.intensity = 0.6;
      fog.color.set('#0e1629'); fog.near = 200; fog.far = 2400;
    } else if (grey) {
      const rain = wx === 'rain';
      u.uZenith.value.set(rain ? '#5d6873' : '#8793a0'); u.uHorizon.value.set(rain ? '#9ba4ab' : '#cdd3d8'); u.uSunSize.value = 0.15;
      u.uCloudDark.value = rain ? 0.62 : 0.35;
      u.uCloud.value = rain ? 0.98 : 0.9;
      this.hemi.intensity = rain ? 1.3 : 1.6; this.sun.intensity = rain ? 0.55 : 1.1;
      fog.color.set(rain ? '#8f989f' : '#c9cfd4');
      if (rain) { fog.near = 70; fog.far = 1500; }
    } else {
      u.uZenith.value.set('#3b72b6'); u.uHorizon.value.set('#d4e6f1').lerp(new THREE.Color('#f5b37a'), golden * 0.85); u.uSunSize.value = 1;
      if (golden > 0.45) u.uZenith.value.lerp(new THREE.Color('#5a5f9e'), (golden - 0.45) * 0.9);
      this.hemi.intensity = 1.15 - golden * 0.25; this.sun.intensity = 2.5 - golden * 0.9;
      this.sun.color.set('#fff1dc').lerp(new THREE.Color('#ff9f5a'), golden * 0.75);
      u.uSunColor.value.set('#fff4d6').lerp(new THREE.Color('#ffb070'), golden);
      fog.color.copy(u.uHorizon.value);
    }
    if (wx === 'fog') {
      fog.color.set(night ? '#1b2335' : '#c7ced3'); fog.near = 12; fog.far = 330;
      u.uHorizon.value.copy(fog.color);
      this.sun.intensity *= 0.7;
    }
    if (style && style.fog && !night && wx !== 'fog') fog.color.lerp(new THREE.Color(style.fog), 0.5);
    u.uSunDir.value.copy(this.sunDir);
    u.uGround.value.copy(fog.color).multiplyScalar(0.85);
    this.rain.setLevel(wx === 'rain' ? (cond.rainLevel ?? 0.8) : 0);
    this.night = night;
    // the ball glows a little under the lights so it's easy to follow
    this.ball.mesh.material.emissive.set(night ? '#8a8a7a' : '#222222');
    this.tracer.mat.uniforms.uColor.value.set(night ? '#7ff0ff' : '#ffc93c');
  }

  loadHole(hole, opts = {}) {
    if (this.holeScene) {
      this.scene.remove(this.holeScene.group);
      this.holeScene.dispose();
    }
    this.holeScene = new HoleScene(hole, { quality: this.quality, crowd: opts.crowd, board: opts.board, night: this.night });
    this.scene.add(this.holeScene.group);
    this.grid.build(hole);
    this.grid.setVisible(false);
    this.marks.reset();
    this.markers.reset();
    this.tracer.reset();
    this.preview.clear();
    this.puttLine.clear();
  }

  setGolfer(look, name = '') {
    this.clearGolfers();
    if (this.golfer) this.scene.remove(this.golfer.root);
    this.golfer = new Golfer(look);
    this.scene.add(this.golfer.root);
    if (this.caddie) this.scene.remove(this.caddie.group);
    this.caddie = new Caddie(look, name);
    this.scene.add(this.caddie.group);
  }

  // Several golfers sharing a round: build each once, show the one to play
  useGolfer(key, look, name = '') {
    if (!this.golfers) this.golfers = new Map();
    let e = this.golfers.get(key);
    if (!e) {
      e = { golfer: new Golfer(look), caddie: new Caddie(look, name) };
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
    this.tracer.update(this.camera);
    if (!this.lost) this.renderer.render(this.scene, this.camera);
  }
}
