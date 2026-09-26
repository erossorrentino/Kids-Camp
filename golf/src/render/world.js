// Renderer, sky, lights, camera rig and per-hole scene management.
import * as THREE from '../../vendor/three.module.min.js';
import { HoleScene } from './holeScene.js';
import { Golfer } from './golfer.js';
import { Caddie } from './people.js';
import { Ball, Tracer, AimRing, DotLine, GreenGrid, Particles, Marks } from './effects.js';

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
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 uZenith, uHorizon, uGround, uSunDir, uSunColor; uniform float uSunSize, uTime, uCloud, uCloudDark; varying vec3 vDir;
      float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0 ? mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHorizon, uGround, clamp(-h * 6.0, 0.0, 1.0));
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunColor * (pow(s, 900.0) * 3.0 * uSunSize + pow(s, 12.0) * 0.25 + pow(s, 3.0) * 0.08);
        if (h > 0.0) {
          // clouds on a flat layer, thinning toward the horizon
          vec2 uv = d.xz / (h + 0.12) * 0.9 + vec2(uTime * 0.006, uTime * 0.002);
          float n = fbm(uv);
          float cov = smoothstep(1.0 - uCloud, 1.0 - uCloud + 0.28, n);
          float lit = fbm(uv + normalize(uSunDir.xz) * 0.08);
          vec3 cc = mix(vec3(1.0, 0.99, 0.97), vec3(0.62, 0.66, 0.72), clamp((lit - n) * 3.0 + 0.35 + uCloudDark, 0.0, 1.0));
          cc += uSunColor * pow(s, 8.0) * 0.35;
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
    this.renderer = new THREE.WebGLRenderer({ antialias: this.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1));
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'gl';
    container.appendChild(this.renderer.domElement);

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
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    return touch || small ? 'medium' : 'high';
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setConditions(cond, style, headingOffset = 0) {
    const t = cond.timeOfDay ?? 0.45;
    const elev = Math.max(0.12, Math.sin(Math.PI * t)) * 1.05;
    const az = headingOffset + (t - 0.5) * 2.6 + 0.6;
    this.sunDir.set(Math.sin(az) * Math.cos(elev), Math.sin(elev), -Math.cos(az) * Math.cos(elev)).normalize();
    const u = this.sky.material.uniforms;
    const golden = Math.max(0, 1 - Math.sin(Math.PI * t) * 1.6);
    u.uCloud.value = cond.overcast ? 0.9 : 0.28 + ((cond.windMph || 5) % 7) * 0.04;
    u.uCloudDark.value = cond.overcast ? 0.35 : 0;
    if (cond.overcast) {
      u.uZenith.value.set('#8793a0'); u.uHorizon.value.set('#cdd3d8'); u.uSunSize.value = 0.15;
      this.hemi.intensity = 1.6; this.sun.intensity = 1.1;
      this.scene.fog.color.set('#c9cfd4');
    } else {
      u.uZenith.value.set('#3b72b6'); u.uHorizon.value.set('#d4e6f1').lerp(new THREE.Color('#f5d6a8'), golden * 0.7); u.uSunSize.value = 1;
      this.hemi.intensity = 1.15; this.sun.intensity = 2.5 - golden * 0.6;
      this.sun.color.set('#fff1dc').lerp(new THREE.Color('#ffc58a'), golden * 0.6);
      this.scene.fog.color.copy(u.uHorizon.value);
    }
    if (style && style.fog) this.scene.fog.color.lerp(new THREE.Color(style.fog), 0.5);
    u.uSunDir.value.copy(this.sunDir);
    u.uGround.value.copy(this.scene.fog.color).multiplyScalar(0.85);
  }

  loadHole(hole, opts = {}) {
    if (this.holeScene) {
      this.scene.remove(this.holeScene.group);
      this.holeScene.dispose();
    }
    this.holeScene = new HoleScene(hole, { quality: this.quality, crowd: opts.crowd, board: opts.board });
    this.scene.add(this.holeScene.group);
    this.grid.build(hole);
    this.grid.setVisible(false);
    this.marks.reset();
    this.tracer.reset();
    this.preview.clear();
    this.puttLine.clear();
  }

  setGolfer(look, name = '') {
    if (this.golfer) this.scene.remove(this.golfer.root);
    this.golfer = new Golfer(look);
    this.scene.add(this.golfer.root);
    if (this.caddie) this.scene.remove(this.caddie.group);
    this.caddie = new Caddie(look, name);
    this.scene.add(this.caddie.group);
  }

  hidePlayers() {
    if (this.golfer) this.golfer.root.visible = false;
    if (this.caddie) this.caddie.group.visible = false;
  }

  cheer(strength) {
    if (this.holeScene) this.holeScene.cheer(strength);
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

  frame(dt) {
    const g = this.camGoal;
    const a = 1 - Math.exp(-g.k * dt);
    this.cam.pos.lerp(g.pos, a);
    this.cam.look.lerp(g.look, a);
    this.cam.fov += (g.fov - this.cam.fov) * a;
    this.camera.position.copy(this.cam.pos);
    this.camera.lookAt(this.cam.look);
    if (Math.abs(this.camera.fov - this.cam.fov) > 0.01) {
      this.camera.fov = this.cam.fov;
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
    this.tracer.update(this.camera);
    this.renderer.render(this.scene, this.camera);
  }
}
