// HDR post-processing. The scene is drawn into a high-precision,
// multisampled buffer, so the sun, glints on water and floodlights can be
// far brighter than "white". Then:
//   - bloom: bright parts glow (a mip chain of blurred copies added back)
//   - a glare around the sun when it's in view and not hidden by trees
//   - filmic (ACES) tone mapping and exposure
//   - a gentle colour grade: contrast, saturation, warm highlights and
//     cool shadows, a soft vignette, and fine dithering against banding.
import * as THREE from '../../vendor/three.module.min.js';

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const LUM = 'float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }';

// Bright-pass + first downsample (13 taps, with a soft knee threshold)
const PREFILTER = `uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold, uKnee, uExposure; varying vec2 vUv;
${LUM}
vec3 tap(vec2 o){ return texture2D(tSrc, vUv + o * uTexel).rgb; }
void main(){
  vec3 c = tap(vec2(0.0)) * 0.125;
  c += (tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0))) * 0.125;
  c += (tap(vec2(-2.0, 0.0)) + tap(vec2(2.0, 0.0)) + tap(vec2(0.0, -2.0)) + tap(vec2(0.0, 2.0))) * 0.0625;
  c += (tap(vec2(-2.0, -2.0)) + tap(vec2(2.0, -2.0)) + tap(vec2(-2.0, 2.0)) + tap(vec2(2.0, 2.0))) * 0.03125;
  c *= uExposure;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
  // keep fireflies (single blazing pixels) from blowing up the glow
  c = min(c * contrib, vec3(60.0));
  gl_FragColor = vec4(c, 1.0);
}`;

const DOWN = `uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
vec3 tap(vec2 o){ return texture2D(tSrc, vUv + o * uTexel).rgb; }
void main(){
  vec3 c = tap(vec2(0.0)) * 0.125;
  c += (tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0))) * 0.125;
  c += (tap(vec2(-2.0, 0.0)) + tap(vec2(2.0, 0.0)) + tap(vec2(0.0, -2.0)) + tap(vec2(0.0, 2.0))) * 0.0625;
  c += (tap(vec2(-2.0, -2.0)) + tap(vec2(2.0, -2.0)) + tap(vec2(-2.0, 2.0)) + tap(vec2(2.0, 2.0))) * 0.03125;
  gl_FragColor = vec4(c, 1.0);
}`;

// Upsample the smaller level with a tent filter and add the next level up
const UP = `uniform sampler2D tLow, tHigh; uniform vec2 uTexel; uniform float uRadius; varying vec2 vUv;
vec3 tap(vec2 o){ return texture2D(tLow, vUv + o * uTexel * uRadius).rgb; }
void main(){
  vec3 c = tap(vec2(0.0)) * 4.0;
  c += (tap(vec2(-1.0, 0.0)) + tap(vec2(1.0, 0.0)) + tap(vec2(0.0, -1.0)) + tap(vec2(0.0, 1.0))) * 2.0;
  c += tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0));
  gl_FragColor = vec4(c / 16.0 + texture2D(tHigh, vUv).rgb, 1.0);
}`;

const COMPOSITE = `uniform sampler2D tScene, tBloom;
uniform float uExposure, uBloom, uVignette, uSat, uContrast, uTime, uAspect, uGlare, uDither;
uniform vec3 uShadowTint, uHighTint, uSunColor;
uniform vec2 uSun;
varying vec2 vUv;
${LUM}
vec3 RRTAndODTFit(vec3 v){
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 aces(vec3 c){
  const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  c = IN * (c / 0.6);
  c = RRTAndODTFit(c);
  return clamp(OUT * c, 0.0, 1.0);
}
vec3 toSRGB(vec3 c){
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec3 col = texture2D(tScene, vUv).rgb;
  col += texture2D(tBloom, vUv).rgb * uBloom;
  // glare round the sun: only as much as can be seen through the trees
  if (uGlare > 0.0) {
    float vis = 0.0;
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5236;
      vec2 o = uSun + vec2(cos(a), sin(a) * uAspect) * 0.006 * (1.0 + mod(float(i), 3.0));
      vec3 s = texture2D(tScene, clamp(o, vec2(0.001), vec2(0.999))).rgb;
      vis += smoothstep(4.0, 12.0, lum(s));
    }
    vis /= 12.0;
    vec2 d = vUv - uSun;
    d.y /= uAspect;
    float r = length(d);
    float ang = atan(d.y, d.x);
    float halo = exp(-r * 9.0) * 0.55 + exp(-r * 40.0) * 1.6;
    float rays = pow(max(0.0, cos(ang * 6.0 + 0.4)), 24.0) * exp(-r * 7.0) * 0.6;
    // a couple of faint ghosts on the far side of the centre
    vec2 g = vUv - (vec2(1.0) - uSun);
    g.y /= uAspect;
    float ghost = smoothstep(0.07, 0.0, abs(length(g) - 0.05)) * 0.04 + exp(-length(vUv - mix(uSun, vec2(0.5), 1.6)) * 30.0) * 0.06;
    col += uSunColor * (halo + rays + ghost) * vis * uGlare;
  }
  col *= uExposure;
  col = aces(col);
  // grade in display space
  float l = lum(col);
  col = mix(vec3(l), col, uSat);
  col = mix(col, col * uShadowTint, (1.0 - smoothstep(0.0, 0.45, l)) * 0.5);
  col = mix(col, col * uHighTint, smoothstep(0.45, 1.0, l) * 0.5);
  col = clamp((col - 0.5) * uContrast + 0.5, 0.0, 1.0);
  vec2 v = vUv - 0.5;
  col *= 1.0 - uVignette * smoothstep(0.35, 0.95, length(v * vec2(1.0, 0.85)) * 1.25);
  col = toSRGB(col);
  col += (hash(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) * uDither;
  gl_FragColor = vec4(col, 1.0);
}`;

function target(type, samples = 0, depth = false) {
  const rt = new THREE.WebGLRenderTarget(1, 1, { type, depthBuffer: depth, samples, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
  rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
  return rt;
}

export class Post {
  constructor(renderer, quality) {
    this.r = renderer;
    this.quality = quality;
    const gl2 = renderer.capabilities.isWebGL2;
    const half = gl2 || renderer.extensions.has('OES_texture_half_float');
    this.type = half ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.samples = gl2 ? (quality === 'high' ? 4 : 2) : 0;
    this.main = target(this.type, this.samples, true);
    this.levels = quality === 'high' ? 6 : 5;
    this.down = [];
    this.up = [];
    for (let i = 0; i < this.levels; i++) {
      this.down.push(target(this.type));
      this.up.push(target(this.type));
    }
    const mk = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
    this.prefilter = mk(PREFILTER, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.6 }, uKnee: { value: 0.8 }, uExposure: { value: 1 } });
    this.downMat = mk(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.upMat = mk(UP, { tLow: { value: null }, tHigh: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 } });
    this.comp = mk(COMPOSITE, {
      tScene: { value: null }, tBloom: { value: null },
      uExposure: { value: 1 }, uBloom: { value: 0.06 }, uVignette: { value: 0.22 }, uSat: { value: 1.0 }, uContrast: { value: 1.04 },
      uTime: { value: 0 }, uAspect: { value: 1 }, uGlare: { value: 0 }, uDither: { value: 1 / 255 },
      uShadowTint: { value: new THREE.Color(0.94, 0.98, 1.06) }, uHighTint: { value: new THREE.Color(1.04, 1.01, 0.95) },
      uSunColor: { value: new THREE.Color(1, 0.95, 0.85) }, uSun: { value: new THREE.Vector2(-1, -1) },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.comp);
    this.quad.frustumCulled = false;
    this.qscene = new THREE.Scene();
    this.qscene.add(this.quad);
    this.qcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.w = 1; this.h = 1;
    this.tmp = new THREE.Vector3();
    this.t = 0;
  }

  setSize(w, h) {
    this.w = w; this.h = h;
    this.main.setSize(w, h);
    let lw = w, lh = h;
    for (let i = 0; i < this.levels; i++) {
      lw = Math.max(1, Math.floor(lw / 2)); lh = Math.max(1, Math.floor(lh / 2));
      this.down[i].setSize(lw, lh);
      this.up[i].setSize(lw, lh);
    }
    this.comp.uniforms.uAspect.value = w / h;
  }

  pass(mat, dst) {
    this.quad.material = mat;
    this.r.setRenderTarget(dst);
    this.r.render(this.qscene, this.qcam);
  }

  // p: { exposure, bloom, sunDir (world, toward the sun), sunColor, glare }
  render(scene, camera, p, dt) {
    const r = this.r;
    this.t += dt;
    r.setRenderTarget(this.main);
    r.render(scene, camera);
    // bloom chain
    const pf = this.prefilter.uniforms;
    pf.tSrc.value = this.main.texture;
    pf.uTexel.value.set(1 / this.w, 1 / this.h);
    pf.uExposure.value = p.exposure;
    this.pass(this.prefilter, this.down[0]);
    const du = this.downMat.uniforms;
    for (let i = 1; i < this.levels; i++) {
      du.tSrc.value = this.down[i - 1].texture;
      du.uTexel.value.set(1 / this.down[i - 1].width, 1 / this.down[i - 1].height);
      this.pass(this.downMat, this.down[i]);
    }
    const uu = this.upMat.uniforms;
    let low = this.down[this.levels - 1];
    for (let i = this.levels - 2; i >= 0; i--) {
      uu.tLow.value = low.texture;
      uu.tHigh.value = this.down[i].texture;
      uu.uTexel.value.set(1 / low.width, 1 / low.height);
      this.pass(this.upMat, this.up[i]);
      low = this.up[i];
    }
    // composite to the screen
    const cu = this.comp.uniforms;
    cu.tScene.value = this.main.texture;
    cu.tBloom.value = low.texture;
    cu.uExposure.value = p.exposure;
    cu.uBloom.value = p.bloom;
    cu.uTime.value = this.t;
    cu.uSat.value = p.sat ?? 1.0;
    cu.uContrast.value = p.contrast ?? 1.04;
    cu.uVignette.value = p.vignette ?? 0.22;
    // where the sun is on screen (and whether it's in front of us)
    let glare = 0;
    if (p.glare > 0 && p.sunDir) {
      const s = this.tmp.copy(camera.position).addScaledVector(p.sunDir, 1000).project(camera);
      const inFront = this.tmp.set(0, 0, -1).applyQuaternion(camera.quaternion).dot(p.sunDir) > 0;
      if (inFront && Math.abs(s.x) < 1.3 && Math.abs(s.y) < 1.3) {
        cu.uSun.value.set(s.x * 0.5 + 0.5, s.y * 0.5 + 0.5);
        glare = p.glare * (1 - Math.max(0, Math.max(Math.abs(s.x), Math.abs(s.y)) - 1) / 0.3);
      }
    }
    cu.uGlare.value = glare;
    if (p.sunColor) cu.uSunColor.value.copy(p.sunColor);
    this.quad.material = this.comp;
    r.setRenderTarget(null);
    r.render(this.qscene, this.qcam);
  }

  dispose() {
    for (const rt of [this.main, ...this.down, ...this.up]) rt.dispose();
    for (const m of [this.prefilter, this.downMat, this.upMat, this.comp]) m.dispose();
  }
}
