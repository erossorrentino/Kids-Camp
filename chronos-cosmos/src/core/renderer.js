import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { G } from './G.js';

// Linear HDR grade: god rays, chromatic aberration, epoch ripple, slow-mo
// tint, damage vignette, saturation/contrast. Runs before tone mapping.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uCA: { value: 0 },
    uRipple: { value: new THREE.Vector4(0.5, 0.5, -1, 0) },
    uSat: { value: 1.08 },
    uContrast: { value: 1.04 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uLift: { value: new THREE.Vector3(0, 0, 0) },
    uVignette: { value: 0.35 },
    uDamage: { value: 0 },
    uSlow: { value: 0 },
    uSun: { value: new THREE.Vector3(0.5, 0.5, 0) },
    uRays: { value: 0.0 },
    uRayColor: { value: new THREE.Vector3(1, 0.9, 0.7) },
    uFade: { value: 0 },
    uExposure: { value: 1 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; uniform float uCA;
    uniform vec4 uRipple; uniform float uSat; uniform float uContrast; uniform vec3 uTint; uniform vec3 uLift;
    uniform float uVignette; uniform float uDamage; uniform float uSlow; uniform vec3 uSun; uniform float uRays;
    uniform vec3 uRayColor; uniform float uFade; uniform float uExposure;
    varying vec2 vUv;
    float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
    void main(){
      vec2 uv = vUv;
      vec2 aspect = vec2(uRes.x/uRes.y, 1.0);
      // epoch ripple ring distortion
      if (uRipple.z > 0.0) {
        vec2 d = (uv - uRipple.xy) * aspect;
        float r = length(d);
        float w = uRipple.z;
        float ring = exp(-pow((r - w) * 9.0, 2.0));
        uv -= normalize(d + 1e-5) / aspect * ring * uRipple.w * 0.06;
      }
      vec2 cd = (uv - 0.5);
      float ca = uCA + uSlow * 0.004 + uDamage * 0.003;
      vec3 col;
      if (ca > 0.0001) {
        col.r = texture2D(tDiffuse, uv + cd * ca * 2.0).r;
        col.g = texture2D(tDiffuse, uv).g;
        col.b = texture2D(tDiffuse, uv - cd * ca * 2.0).b;
      } else col = texture2D(tDiffuse, uv).rgb;
      // radial light shafts from bright pixels around the sun
      if (uRays > 0.001) {
        vec2 delta = (uv - uSun.xy) / 36.0;
        vec2 suv = uv;
        float illum = 1.0;
        vec3 acc = vec3(0.0);
        for (int i = 0; i < 36; i++) {
          suv -= delta;
          vec3 s = texture2D(tDiffuse, clamp(suv, 0.001, 0.999)).rgb;
          float b = max(luma(s) - 2.2, 0.0);
          acc += min(b, 6.0) * illum;
          illum *= 0.955;
        }
        float fall = 1.0 - smoothstep(0.0, 0.9, length((uv - uSun.xy) * aspect));
        col += uRayColor * acc * (uRays / 36.0) * fall;
      }
      // epoch ring glow
      if (uRipple.z > 0.0) {
        vec2 d = (vUv - uRipple.xy) * aspect;
        float ring = exp(-pow((length(d) - uRipple.z) * 14.0, 2.0));
        col += vec3(0.6, 0.85, 1.0) * ring * uRipple.w * 0.8;
      }
      col *= uExposure;
      // grade
      float l = luma(col);
      col = mix(vec3(l), col, uSat * (1.0 - uSlow * 0.6));
      col = col * uTint + uLift;
      col = mix(col, col * vec3(0.75, 0.9, 1.25), uSlow * 0.6);
      col = max(vec3(0.0), (col - 0.18) * uContrast + 0.18);
      // vignette
      float v = smoothstep(0.85, 0.2, length(cd * vec2(1.0, 0.85)));
      col *= mix(1.0, v, uVignette);
      // damage
      float edge = smoothstep(0.25, 0.75, length(cd * 1.2));
      col = mix(col, vec3(0.35, 0.0, 0.02) * (0.6 + 0.4 * sin(uTime * 6.0)), edge * uDamage * 0.7);
      col *= 1.0 - uFade;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// Film grain after tone mapping (in display space), applied in the FXAA pass
// would be cleaner, but keeping it separate keeps FXAA untouched.
const GrainShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAmount: { value: 0.035 } },
  vertexShader: GradeShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uAmount; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime*13.17) * 43758.5453); }
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float n = h(vUv * 1000.0) - 0.5; c.rgb += n * uAmount * (1.0 - c.rgb*0.6); gl_FragColor = c; }
  `,
};

// post: run the HDR post-processing chain (bloom, rays, grading). Without it
// the scene renders straight to the screen with tone mapping, which is far
// cheaper and works on GPUs that cannot render to half-float buffers.
// maxDpr caps the device pixel ratio before the pixelRatio scale applies.
export const QUALITY = {
  mobile: { pixelRatio: 0.62, maxDpr: 1.6, shadows: false, shadowSize: 512, bloom: false, rays: false, grass: 0.14, trees: 0.45, fxaa: false, drawDist: 0.55, post: false, lights: 2 },
  low: { pixelRatio: 0.8, maxDpr: 1.5, shadows: false, shadowSize: 1024, bloom: false, rays: false, grass: 0.3, trees: 0.6, fxaa: false, drawDist: 0.7, post: false, lights: 3 },
  medium: { pixelRatio: 1, maxDpr: 1.5, shadows: true, shadowSize: 1024, bloom: true, rays: false, grass: 0.55, trees: 0.8, fxaa: true, drawDist: 0.85, post: true, lights: 4 },
  high: { pixelRatio: 1, maxDpr: 2, shadows: true, shadowSize: 2048, bloom: true, rays: true, grass: 1, trees: 1, fxaa: true, drawDist: 1, post: true, lights: 6 },
  ultra: { pixelRatio: 1.5, maxDpr: 2, shadows: true, shadowSize: 4096, bloom: true, rays: true, grass: 1.5, trees: 1, fxaa: true, drawDist: 1, post: true, lights: 8 },
};
export const QUALITY_ORDER = ['mobile', 'low', 'medium', 'high', 'ultra'];

export function createRenderer(container) {
  const q0 = QUALITY[G.settings.quality] || QUALITY.high;
  const renderer = new THREE.WebGLRenderer({
    antialias: !q0.post && G.settings.quality !== 'mobile',
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
    preserveDrawingBuffer: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.id = 'game-canvas';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 6000);

  // Half-float render targets need an extension some phone GPUs lack.
  const ext = renderer.extensions;
  G.postOK = renderer.capabilities.isWebGL2 && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'));
  G.webgl2 = renderer.capabilities.isWebGL2;
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.55, 0.6, 0.92);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  const output = new OutputPass();
  composer.addPass(output);
  const fxaa = new ShaderPass(FXAAShader);
  composer.addPass(fxaa);
  const grain = new ShaderPass(GrainShader);
  composer.addPass(grain);

  const post = { composer, renderPass, bloom, grade, output, fxaa, grain };

  // G.resScale (0.6..1) is set by the dynamic-resolution governor in main.js
  function resize() {
    const q = QUALITY[G.settings.quality] || QUALITY.high;
    const pr = Math.min(Math.min(window.devicePixelRatio || 1, q.maxDpr || 2) * q.pixelRatio, 2) * (G.resScale || 1);
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
    grade.uniforms.uRes.value.set(w * pr, h * pr);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 300));
  resize();
  G.usePost = q0.post && G.postOK;

  function applyQuality() {
    const q = QUALITY[G.settings.quality] || QUALITY.high;
    renderer.shadowMap.enabled = q.shadows;
    G.usePost = q.post && G.postOK;
    bloom.enabled = q.bloom;
    fxaa.enabled = q.fxaa;
    resize();
    scene.traverse((o) => {
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.needsUpdate = true;
      }
    });
  }

  G.resize = resize;
  G.renderer = renderer;
  G.scene = scene;
  G.camera = camera;
  G.post = post;
  return { renderer, scene, camera, post, resize, applyQuality };
}
