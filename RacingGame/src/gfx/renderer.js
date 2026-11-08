// Renderer + post-processing stack.
//   Scene (HDR, MSAA) -> Bloom -> Cinematic pass (speed blur, chromatic
//   aberration, vignette, grading, grain) -> Output (ACES tonemap + sRGB) -> FXAA (low only)
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { setMaxAnisotropy } from './textures.js';

export const QUALITY = {
  low: { name: 'Low', pixelRatio: 0.75, shadows: 1, shadowMapSize: 1024, shadowExtent: 45, msaa: 0, bloom: false, post: false, scenery: 0.35, carDetail: 0, maxDpr: 1 },
  medium: { name: 'Medium', pixelRatio: 1, shadows: 1, shadowMapSize: 2048, shadowExtent: 60, msaa: 2, bloom: true, post: true, scenery: 0.65, carDetail: 1, maxDpr: 1.25 },
  high: { name: 'High', pixelRatio: 1, shadows: 2, shadowMapSize: 4096, shadowExtent: 70, msaa: 4, bloom: true, post: true, scenery: 1, carDetail: 2, maxDpr: 1.5 },
  ultra: { name: 'Ultra', pixelRatio: 1, shadows: 2, shadowMapSize: 4096, shadowExtent: 85, msaa: 4, bloom: true, post: true, scenery: 1.4, carDetail: 2, maxDpr: 2 },
};

const CinematicShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    speed: { value: 0 },
    time: { value: 0 },
    vignette: { value: 0.32 },
    aberration: { value: 0.0012 },
    saturation: { value: 1.08 },
    contrast: { value: 1.04 },
    tint: { value: new THREE.Vector3(1, 1, 1) },
    grain: { value: 0.025 },
    flash: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float speed, time, vignette, aberration, saturation, contrast, grain, flash;
    uniform vec3 tint;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float d = length(c * vec2(resolution.x / resolution.y, 1.0));
      // radial speed blur, strongest at screen edges
      float blur = speed * speed * 0.055 * smoothstep(0.18, 0.9, d);
      vec3 col = vec3(0.0);
      float ab = aberration * (1.0 + speed * 2.0) * d;
      const int TAPS = 8;
      for (int i = 0; i < TAPS; i++) {
        float t = float(i) / float(TAPS - 1);
        vec2 off = c * blur * t;
        vec2 uv = vUv - off;
        col.r += texture2D(tDiffuse, uv - c * ab).r;
        col.g += texture2D(tDiffuse, uv).g;
        col.b += texture2D(tDiffuse, uv + c * ab).b;
      }
      col /= float(TAPS);
      // grading in linear HDR
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);
      col = pow(max(col, 0.0) / 0.18, vec3(contrast)) * 0.18;
      col *= tint;
      // vignette
      float v = smoothstep(0.95, 0.25, d * (1.0 + vignette * 0.4));
      col *= mix(1.0, v, vignette * 1.6);
      // film grain
      col += (hash(vUv * resolution + fract(time) * 100.0) - 0.5) * grain * (0.25 + l);
      col += vec3(flash);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Graphics {
  constructor(container) {
    this.container = container;
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: false });
    renderer.setClearColor(0x000000);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.6;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    renderer.domElement.className = 'gl';
    this.renderer = renderer;
    setMaxAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
    this.renderScale = 1;
    this.setQuality('high');
    window.addEventListener('resize', () => this.resize());
    this._frameTimes = [];
  }

  setQuality(name) {
    this.qualityName = QUALITY[name] ? name : 'high';
    this.quality = QUALITY[this.qualityName];
    this.renderer.shadowMap.enabled = this.quality.shadows > 0;
    this.renderer.shadowMap.type = this.quality.shadows > 1 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderScale = 1;
    this.composer = null; // rebuilt lazily for current scene/camera
    this.resize();
  }

  pixelRatio() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality.maxDpr);
    return dpr * this.quality.pixelRatio * this.renderScale;
  }

  buildComposer(scene, camera, bloomStrength = 0.35) {
    const q = this.quality;
    const size = this.renderer.getSize(new THREE.Vector2());
    const pr = this.pixelRatio();
    const rt = new THREE.WebGLRenderTarget(Math.floor(size.x * pr), Math.floor(size.y * pr), {
      type: THREE.HalfFloatType,
      samples: q.msaa,
    });
    const composer = new EffectComposer(this.renderer, rt);
    composer.setPixelRatio(pr);
    composer.setSize(size.x, size.y);
    this.renderPass = new RenderPass(scene, camera);
    composer.addPass(this.renderPass);
    this.bloomPass = null;
    if (q.bloom) {
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), bloomStrength, 0.5, 1.0);
      composer.addPass(this.bloomPass);
    }
    this.cinePass = null;
    if (q.post) {
      this.cinePass = new ShaderPass(CinematicShader);
      composer.addPass(this.cinePass);
    }
    composer.addPass(new OutputPass());
    this.fxaaPass = null;
    if (!q.msaa) {
      this.fxaaPass = new FXAAPass();
      composer.addPass(this.fxaaPass);
    }
    this.composer = composer;
    this.scene = scene;
    this.camera = camera;
    this.resize();
    return composer;
  }

  setGrade({ saturation = 1.08, contrast = 1.04, tint = [1, 1, 1], vignette = 0.32 } = {}) {
    if (!this.cinePass) return;
    const u = this.cinePass.uniforms;
    u.saturation.value = saturation;
    u.contrast.value = contrast;
    u.tint.value.set(...tint);
    u.vignette.value = vignette;
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const pr = this.pixelRatio();
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
      if (this.cinePass) this.cinePass.uniforms.resolution.value.set(w * pr, h * pr);
    }
  }

  // Adaptive resolution: keep the game smooth on slower machines.
  trackFrame(dt) {
    const ft = this._frameTimes;
    ft.push(dt);
    if (ft.length < 90) return;
    const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
    ft.length = 0;
    let s = this.renderScale;
    if (avg > 1 / 40 && s > 0.55) s = Math.max(0.55, s - 0.1);
    else if (avg < 1 / 58 && s < 1) s = Math.min(1, s + 0.05);
    if (s !== this.renderScale) { this.renderScale = s; this.resize(); }
  }

  render(dt, effects = {}) {
    if (this.cinePass) {
      const u = this.cinePass.uniforms;
      u.time.value += dt;
      u.speed.value = effects.speed || 0;
      u.flash.value = effects.flash || 0;
    }
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.composer) {
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
      this.composer = null;
    }
  }
}
