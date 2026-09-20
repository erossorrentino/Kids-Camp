/**
 * RENDER ENGINE
 * ------------------------------------------------------------------
 * Owns the renderer, the scene, the camera rig and the post chain.
 * Quality presets scale shadow resolution, bloom and pixel ratio so the
 * same build runs on a laptop and on a workstation.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { damp, clamp } from './rng.js';

export const QUALITY = {
  low:    { shadow:0,    pixelRatio:0.75, bloom:0.0,  aniso:1, shadowDist:0,   particles:0.4, fogQuality:0 },
  medium: { shadow:1024, pixelRatio:1.0,  bloom:0.45, aniso:4, shadowDist:140, particles:0.7, fogQuality:1 },
  high:   { shadow:2048, pixelRatio:1.0,  bloom:0.7,  aniso:8, shadowDist:220, particles:1.0, fogQuality:1 },
  ultra:  { shadow:4096, pixelRatio:1.25, bloom:0.9,  aniso:16, shadowDist:320, particles:1.4, fogQuality:1 },
};

/* A light chromatic-aberration + scanline + damage-grade pass. Cheap, and it
 * does more for the "inside a cockpit" feeling than any amount of geometry. */
const CockpitShader = {
  uniforms: {
    tDiffuse: { value: null },
    uAberration: { value: 0.0012 },
    uVignette: { value: 0.72 },
    uScan: { value: 0.06 },
    uTime: { value: 0 },
    uDamage: { value: 0 },
    uHeat: { value: 0 },
    uGrain: { value: 0.035 },
    uEmp: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uAberration, uVignette, uScan, uTime, uDamage, uHeat, uGrain, uEmp;
    varying vec2 vUv;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);

      // EMP scrambles horizontal scanlines.
      if (uEmp > 0.001){
        float band = step(0.5, fract(uv.y * 40.0 + uTime * 6.0));
        uv.x += (hash(vec2(floor(uv.y * 80.0), floor(uTime * 22.0))) - 0.5) * 0.06 * uEmp * band;
      }

      // Chromatic aberration grows toward the edges and with damage.
      float ab = uAberration * (1.0 + r2 * 2.5) * (1.0 + uDamage * 4.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ab).b;

      // Heat haze: a slow vertical wobble that only shows when the reactor is hot.
      if (uHeat > 0.01){
        float w = sin(uv.y * 90.0 + uTime * 3.0) * 0.0012 * uHeat;
        col = mix(col, texture2D(tDiffuse, uv + vec2(w, 0.0)).rgb, 0.6);
        col.r += uHeat * 0.045;
      }

      // Scanlines + grain.
      col *= 1.0 - uScan * (0.5 + 0.5 * sin(uv.y * 1400.0));
      col += (hash(uv * 1024.0 + fract(uTime)) - 0.5) * uGrain;

      // Vignette, deepened and reddened by structural damage.
      float vig = smoothstep(0.86, 0.22, r2 * uVignette * 2.0);
      col *= vig;
      col.r += uDamage * (1.0 - vig) * 0.75;

      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Engine {
  constructor(canvas, quality = 'high') {
    this.canvas = canvas;
    this.quality = QUALITY[quality] ? quality : 'high';
    this.q = QUALITY[this.quality];

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: this.quality !== 'low', powerPreference:'high-performance', stencil:false,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.q.pixelRatio * 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = this.q.shadow > 0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.35, 4200);
    this.camera.position.set(0, 14, 24);

    this.clock = new THREE.Clock();
    this.time = 0;
    this._setupLights();
    this._setupComposer();
    this._onResize();
    addEventListener('resize', () => this._onResize());

    this.shakeAmp = 0;
    this.shakeFreq = 26;
    this._shakeT = 0;
    this.fovBase = 72;
    this.fovTarget = 72;
    this.stats = { fps:0, frames:0, acc:0, draw:0, tris:0 };
  }

  _setupLights() {
    this.hemi = new THREE.HemisphereLight(0x8fb2cc, 0x2a2622, 1.0);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffe8cc, 2.2);
    this.sun.position.set(120, 190, 80);
    this.sun.castShadow = this.q.shadow > 0;
    if (this.q.shadow > 0) {
      const s = this.q.shadowDist;
      this.sun.shadow.mapSize.set(this.q.shadow, this.q.shadow);
      this.sun.shadow.camera.near = 1;
      this.sun.shadow.camera.far = 720;
      this.sun.shadow.camera.left = -s; this.sun.shadow.camera.right = s;
      this.sun.shadow.camera.top = s;  this.sun.shadow.camera.bottom = -s;
      this.sun.shadow.bias = -0.0008;
      this.sun.shadow.normalBias = 0.05;
    }
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;
    this.scene.add(this.sun);

    // A cool rim light keeps silhouettes readable against dark skies.
    this.rim = new THREE.DirectionalLight(0x6fb6ff, 0.55);
    this.rim.position.set(-90, 60, -110);
    this.scene.add(this.rim);
  }

  _setupComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    if (this.q.bloom > 0) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), this.q.bloom, 0.62, 0.86);
      this.composer.addPass(this.bloom);
    }
    this.cockpitPass = new ShaderPass(CockpitShader);
    this.composer.addPass(this.cockpitPass);
    this.composer.addPass(new OutputPass());
  }

  setQuality(name) {
    if (!QUALITY[name] || name === this.quality) return;
    this.quality = name;
    this.q = QUALITY[name];
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.q.pixelRatio * 1.5));
    this.renderer.shadowMap.enabled = this.q.shadow > 0;
    this.sun.castShadow = this.q.shadow > 0;
    if (this.q.shadow > 0) {
      this.sun.shadow.mapSize.set(this.q.shadow, this.q.shadow);
      const s = this.q.shadowDist;
      this.sun.shadow.camera.left = -s; this.sun.shadow.camera.right = s;
      this.sun.shadow.camera.top = s; this.sun.shadow.camera.bottom = -s;
      this.sun.shadow.camera.updateProjectionMatrix();
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    if (this.bloom) this.bloom.strength = this.q.bloom;
    this._onResize();
  }

  /** Apply a biome's lighting/fog description to the scene. */
  applyBiome(b, opts = {}) {
    this.scene.background = new THREE.Color(b.sky);
    this.scene.fog = new THREE.Fog(b.fogCol, b.fog[0] * (opts.fogScale || 1), b.fog[1] * (opts.fogScale || 1));
    this.sun.color.setHex(b.sun);
    this.sun.intensity = b.sunI;
    this.hemi.color.setHex(b.amb);
    this.hemi.groundColor.setHex(b.ground);
    this.hemi.intensity = b.ambI;
    this.rim.color.setHex(b.accent);
    this.rim.intensity = b.sunI * 0.22 + 0.2;
  }

  _onResize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.bloom) this.bloom.resolution.set(w, h);
  }

  shake(amount, freq = 26) {
    this.shakeAmp = Math.min(2.6, this.shakeAmp + amount);
    this.shakeFreq = freq;
  }

  /** Per-frame camera post-processing: shake, FOV ease, HUD grade uniforms. */
  update(dt, grade = {}) {
    this.time += dt;
    this._shakeT += dt * this.shakeFreq;
    this.shakeAmp = damp(this.shakeAmp, 0, 7.5, dt);

    if (this.shakeAmp > 0.0005) {
      const a = this.shakeAmp;
      this.camera.position.x += Math.sin(this._shakeT * 1.7) * a * 0.22;
      this.camera.position.y += Math.sin(this._shakeT * 2.3 + 1.1) * a * 0.20;
      this.camera.position.z += Math.sin(this._shakeT * 1.3 + 2.4) * a * 0.18;
      this.camera.rotateZ(Math.sin(this._shakeT * 2.9) * a * 0.006);
    }

    const fov = damp(this.camera.fov, this.fovTarget, 9, dt);
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    const u = this.cockpitPass.uniforms;
    u.uTime.value = this.time;
    u.uDamage.value = damp(u.uDamage.value, grade.damage || 0, 6, dt);
    u.uHeat.value = damp(u.uHeat.value, grade.heat || 0, 4, dt);
    u.uEmp.value = damp(u.uEmp.value, grade.emp || 0, 8, dt);
    u.uScan.value = grade.cockpit ? 0.10 : 0.045;
    u.uVignette.value = grade.cockpit ? 0.95 : 0.7;

    // Keep the shadow frustum centred on the action.
    this.sun.position.copy(this.camera.position).add(new THREE.Vector3(120, 190, 80));
    this.sunTarget.position.copy(this.camera.position);
  }

  render() {
    this.composer.render();
    const info = this.renderer.info.render;
    this.stats.draw = info.calls;
    this.stats.tris = info.triangles;
  }

  tickStats(dt) {
    this.stats.frames++; this.stats.acc += dt;
    if (this.stats.acc >= 0.5) {
      this.stats.fps = Math.round(this.stats.frames / this.stats.acc);
      this.stats.frames = 0; this.stats.acc = 0;
    }
  }

  setZoom(z) { this.fovTarget = clamp(this.fovBase / z, 14, 96); }
}
