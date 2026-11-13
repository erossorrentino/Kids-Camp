// Sky, sun, ambient/IBL lighting and fog. The sky is a physically based
// (Preetham) atmosphere extended with animated volumetric-looking clouds,
// a starfield and moon for night races, and a horizon blend into the fog
// colour so distant scenery melts into haze. The same sky is rendered into
// a prefiltered environment map that every PBR material (car paint, glass,
// chrome) reflects.
import * as THREE from 'three';
import { gradientSky } from './lite.js';

// Zenith colours for the simple Lite sky
const LITE_ZENITH = { noon: 0x3f86d6, morning: 0x5c9be0, golden: 0x5a88c4, sunset: 0x4d5f9c, desert: 0x4590dc, snow: 0x74a8e4, night: 0x02040c, overcast: 0x808a96 };

export const ENV_PRESETS = {
  noon: {
    sunElev: 58, sunAzim: 150, turbidity: 3.2, rayleigh: 2.4, mie: 0.003, mieG: 0.82,
    exposure: 0.56, sunColor: 0xfff4e6, sunIntensity: 3.6, hemiSky: 0xbcd8ff, hemiGround: 0x5a6a3a, hemiIntensity: 0.35,
    envIntensity: 1.0, fogColor: 0xb9d0e6, fogDensity: 0.000260, clouds: 0.42, cloudLit: [1.0, 1.0, 1.0], cloudDark: [0.55, 0.6, 0.7],
    groundColor: 0x3d4a2c, night: 0, bloom: 0.16,
  },
  morning: {
    sunElev: 19, sunAzim: 95, turbidity: 3.8, rayleigh: 2.6, mie: 0.005, mieG: 0.85,
    exposure: 0.7, sunColor: 0xffe2c0, sunIntensity: 3.2, hemiSky: 0xc4d6f0, hemiGround: 0x4f5a38, hemiIntensity: 0.4,
    envIntensity: 1.0, fogColor: 0xc8d4e2, fogDensity: 0.000310, clouds: 0.38, cloudLit: [1.0, 0.92, 0.84], cloudDark: [0.5, 0.52, 0.62],
    groundColor: 0x3a4630, night: 0, bloom: 0.2,
  },
  golden: {
    sunElev: 9, sunAzim: 250, turbidity: 5.5, rayleigh: 2.8, mie: 0.006, mieG: 0.88,
    exposure: 0.85, sunColor: 0xffc58a, sunIntensity: 3.4, hemiSky: 0xa9bce0, hemiGround: 0x5a4a32, hemiIntensity: 0.38,
    envIntensity: 1.0, fogColor: 0xe0b896, fogDensity: 0.000322, clouds: 0.35, cloudLit: [1.0, 0.75, 0.5], cloudDark: [0.42, 0.36, 0.42],
    groundColor: 0x4a3a28, night: 0, bloom: 0.26,
  },
  sunset: {
    sunElev: 3.2, sunAzim: 265, turbidity: 7, rayleigh: 3.2, mie: 0.008, mieG: 0.9,
    exposure: 1.05, sunColor: 0xff9a5a, sunIntensity: 2.6, hemiSky: 0x8d93c8, hemiGround: 0x4a3428, hemiIntensity: 0.45,
    envIntensity: 1.1, fogColor: 0xd99a7a, fogDensity: 0.000360, clouds: 0.45, cloudLit: [1.0, 0.55, 0.35], cloudDark: [0.3, 0.22, 0.32],
    groundColor: 0x3a2a22, night: 0, bloom: 0.32,
  },
  desert: {
    sunElev: 34, sunAzim: 210, turbidity: 5.5, rayleigh: 2.0, mie: 0.006, mieG: 0.8,
    exposure: 0.6, sunColor: 0xfff0d8, sunIntensity: 4.0, hemiSky: 0xd4dcec, hemiGround: 0x9a6a44, hemiIntensity: 0.38,
    envIntensity: 1.0, fogColor: 0xe6d2b8, fogDensity: 0.000236, clouds: 0.12, cloudLit: [1.0, 0.98, 0.95], cloudDark: [0.7, 0.66, 0.65],
    groundColor: 0x8a5a3a, night: 0, bloom: 0.16,
  },
  snow: {
    sunElev: 14, sunAzim: 200, turbidity: 3.0, rayleigh: 2.6, mie: 0.004, mieG: 0.85,
    exposure: 0.55, sunColor: 0xfff0e0, sunIntensity: 3.0, hemiSky: 0xcfe0ff, hemiGround: 0xc8d4e8, hemiIntensity: 0.45,
    envIntensity: 1.0, fogColor: 0xd6e2f0, fogDensity: 0.000372, clouds: 0.5, cloudLit: [1.0, 0.97, 0.95], cloudDark: [0.6, 0.65, 0.75],
    groundColor: 0xdfe6f0, night: 0, bloom: 0.16,
  },
  night: {
    sunElev: -18, sunAzim: 120, turbidity: 2, rayleigh: 1, mie: 0.004, mieG: 0.8,
    exposure: 0.9, sunColor: 0x9db4ff, sunIntensity: 0.35, hemiSky: 0x223355, hemiGround: 0x111018, hemiIntensity: 0.5,
    envIntensity: 0.55, fogColor: 0x0b1020, fogDensity: 0.000434, clouds: 0.25, cloudLit: [0.05, 0.06, 0.1], cloudDark: [0.01, 0.012, 0.02],
    groundColor: 0x07080c, night: 1, bloom: 0.75, moonElev: 34, moonAzim: 140,
  },
  overcast: {
    sunElev: 40, sunAzim: 160, turbidity: 10, rayleigh: 3, mie: 0.02, mieG: 0.6,
    exposure: 0.62, sunColor: 0xdfe4ea, sunIntensity: 1.5, hemiSky: 0xb8c0cc, hemiGround: 0x4a5040, hemiIntensity: 0.75,
    envIntensity: 1.0, fogColor: 0x9aa4ae, fogDensity: 0.000682, clouds: 0.92, cloudLit: [0.62, 0.65, 0.7], cloudDark: [0.3, 0.32, 0.36],
    groundColor: 0x3a4232, night: 0, bloom: 0.25, rain: true,
  },
};

const skyVertex = /* glsl */`
uniform vec3 sunPosition;
uniform float rayleigh;
uniform float turbidity;
uniform float mieCoefficient;
varying vec3 vWorldPosition;
varying vec3 vSunDirection;
varying float vSunfade;
varying vec3 vBetaR;
varying vec3 vBetaM;
varying float vSunE;
const vec3 up = vec3(0.0, 1.0, 0.0);
const float e = 2.71828182845904523536028747135266249775724709369995957;
const float pi = 3.141592653589793238462643383279502884197169;
const vec3 totalRayleigh = vec3(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5);
const float v = 4.0;
const vec3 K = vec3(0.686, 0.678, 0.666);
const vec3 MieConst = vec3(1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14);
const float cutoffAngle = 1.6110731556870734;
const float steepness = 1.5;
const float EE = 1000.0;
float sunIntensity(float zenithAngleCos) {
  zenithAngleCos = clamp(zenithAngleCos, -1.0, 1.0);
  return EE * max(0.0, 1.0 - pow(e, -((cutoffAngle - acos(zenithAngleCos)) / steepness)));
}
vec3 totalMie(float T) {
  float c = (0.2 * T) * 10E-18;
  return 0.434 * c * MieConst;
}
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w;
  vSunDirection = normalize(sunPosition);
  vSunE = sunIntensity(dot(vSunDirection, up));
  vSunfade = 1.0 - clamp(1.0 - exp((sunPosition.y / 450000.0)), 0.0, 1.0);
  float rayleighCoefficient = rayleigh - (1.0 * (1.0 - vSunfade));
  vBetaR = totalRayleigh * rayleighCoefficient;
  vBetaM = totalMie(turbidity) * mieCoefficient;
}`;

const skyFragment = /* glsl */`
varying vec3 vWorldPosition;
varying vec3 vSunDirection;
varying float vSunfade;
varying vec3 vBetaR;
varying vec3 vBetaM;
varying float vSunE;
uniform float mieDirectionalG;
uniform float time;
uniform float cloudCover;
uniform vec3 cloudLit;
uniform vec3 cloudDark;
uniform vec3 horizonColor;
uniform vec3 groundColor;
uniform float nightAmount;
uniform vec3 moonDir;
uniform float skyBoost;
uniform float cloudBright;
uniform float skySat;
const vec3 up = vec3(0.0, 1.0, 0.0);
const float pi = 3.141592653589793238462643383279502884197169;
const float rayleighZenithLength = 8.4E3;
const float mieZenithLength = 1.25E3;
const float sunAngularDiameterCos = 0.99993;
const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
const float ONE_OVER_FOURPI = 0.07957747154594767;
float rayleighPhase(float cosTheta) { return THREE_OVER_SIXTEENPI * (1.0 + pow(cosTheta, 2.0)); }
float hgPhase(float cosTheta, float g) {
  float g2 = pow(g, 2.0);
  float inverse = 1.0 / pow(1.0 - 2.0 * g * cosTheta + g2, 1.5);
  return ONE_OVER_FOURPI * ((1.0 - g2) * inverse);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 6; i++) { s += a * vnoise(p); p = r * p * 2.03 + 11.7; a *= 0.5; }
  return s;
}
void main() {
  vec3 direction = normalize(vWorldPosition - cameraPosition);
  float zenithAngle = acos(max(0.0, dot(up, direction)));
  float inverse = 1.0 / (cos(zenithAngle) + 0.15 * pow(93.885 - ((zenithAngle * 180.0) / pi), -1.253));
  float sR = rayleighZenithLength * inverse;
  float sM = mieZenithLength * inverse;
  vec3 Fex = exp(-(vBetaR * sR + vBetaM * sM));
  float cosTheta = dot(direction, vSunDirection);
  float rPhase = rayleighPhase(cosTheta * 0.5 + 0.5);
  vec3 betaRTheta = vBetaR * rPhase;
  float mPhase = hgPhase(cosTheta, mieDirectionalG);
  vec3 betaMTheta = vBetaM * mPhase;
  vec3 Lin = pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * (1.0 - Fex), vec3(1.5));
  Lin *= mix(vec3(1.0), pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * Fex, vec3(1.0 / 2.0)), clamp(pow(1.0 - dot(up, vSunDirection), 5.0), 0.0, 1.0));
  vec3 L0 = vec3(0.1) * Fex;
  float sundisk = smoothstep(sunAngularDiameterCos, sunAngularDiameterCos + 0.00004, cosTheta);
  L0 += (vSunE * 19000.0 * Fex) * sundisk * (1.0 - cloudCover * 0.6);
  vec3 texColor = (Lin + L0) * 0.04 + vec3(0.0, 0.0003, 0.00075);
  vec3 col = pow(texColor, vec3(1.0 / (1.2 + (1.2 * vSunfade)))) * skyBoost;
  float lum0 = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(lum0), col, skySat), 0.0);

  // ---- night sky: gradient, stars, moon
  if (nightAmount > 0.0) {
    float h = max(direction.y, 0.0);
    vec3 night = mix(vec3(0.020, 0.030, 0.060), vec3(0.002, 0.004, 0.012), pow(h, 0.5));
    vec3 sd = direction * 420.0;
    vec3 cell = floor(sd);
    float hs = hash13(cell);
    float star = 0.0;
    if (hs > 0.9965) {
      vec3 fp = fract(sd) - 0.5;
      float tw = 0.65 + 0.35 * sin(time * (2.0 + hs * 6.0) + hs * 100.0);
      star = (1.0 - smoothstep(0.0, 0.32, length(fp))) * (hs - 0.9965) * 900.0 * tw;
    }
    night += vec3(0.9, 0.95, 1.0) * star * smoothstep(0.0, 0.25, direction.y);
    // milky band
    float band = exp(-pow(dot(direction, normalize(vec3(0.3, 0.6, 0.74))) * 3.5, 2.0));
    night += vec3(0.02, 0.022, 0.03) * band * fbm(direction.xz * 9.0) * smoothstep(0.0, 0.3, direction.y);
    float md = dot(direction, moonDir);
    night += vec3(1.2, 1.18, 1.1) * smoothstep(0.99955, 0.9997, md) * 8.0;
    night += vec3(0.08, 0.1, 0.16) * pow(max(md, 0.0), 64.0);
    col = mix(col, night, nightAmount);
  }

  // ---- clouds (2D raymarched-looking layer projected on a dome)
  if (direction.y > 0.0 && cloudCover > 0.01) {
    vec2 uv = direction.xz / (direction.y + 0.12);
    vec2 wind = vec2(time * 0.006, time * 0.0025);
    vec2 q = uv * 0.55 + wind;
    float warp = fbm(q * 0.6 + 3.1);
    float n = fbm(q + warp * 0.7);
    float n2 = fbm(q * 2.2 - warp * 0.5 + 7.0);
    float base = 1.0 - cloudCover;
    float dens = smoothstep(base, base + 0.22, n * 0.75 + n2 * 0.35);
    // thicker parts get self-shadowed bottoms
    float shade = smoothstep(base, base + 0.6, n * 0.8 + n2 * 0.3);
    float sunAmt = pow(max(cosTheta, 0.0), 6.0);
    float silver = pow(max(cosTheta, 0.0), 40.0) * (1.0 - shade);
    vec3 cc = mix(cloudLit, cloudDark, shade * 0.85);
    cc += cloudLit * (sunAmt * 0.6 + silver * 2.5);
    float fade = smoothstep(0.0, 0.09, direction.y);
    col = mix(col, cc * skyBoost * cloudBright, dens * fade * 0.97);
  }

  // ---- horizon haze -> fog colour; below horizon -> ground colour
  float hz = 1.0 - smoothstep(-0.02, 0.11, direction.y);
  col = mix(col, horizonColor, hz * 0.8);
  float below = 1.0 - smoothstep(-0.06, 0.0, direction.y);
  col = mix(col, groundColor, below);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class SkyDome extends THREE.Mesh {
  constructor() {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        turbidity: { value: 2 }, rayleigh: { value: 1 }, mieCoefficient: { value: 0.005 }, mieDirectionalG: { value: 0.8 },
        sunPosition: { value: new THREE.Vector3() }, time: { value: 0 }, cloudCover: { value: 0.4 },
        cloudLit: { value: new THREE.Vector3(1, 1, 1) }, cloudDark: { value: new THREE.Vector3(0.5, 0.5, 0.6) },
        horizonColor: { value: new THREE.Color() }, groundColor: { value: new THREE.Color() },
        nightAmount: { value: 0 }, moonDir: { value: new THREE.Vector3(0, 1, 0) }, skyBoost: { value: 1 }, cloudBright: { value: 2.4 }, skySat: { value: 1.3 },
      },
      vertexShader: skyVertex, fragmentShader: skyFragment,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    super(new THREE.BoxGeometry(1, 1, 1), mat);
    this.frustumCulled = false;
    this.renderOrder = -1000;
  }
}

function dirFromAngles(elevDeg, azimDeg) {
  const phi = THREE.MathUtils.degToRad(90 - elevDeg);
  const theta = THREE.MathUtils.degToRad(azimDeg);
  return new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
}

export class Environment {
  constructor(scene, renderer, presetName, quality) {
    this.scene = scene;
    this.renderer = renderer;
    this.preset = { ...(ENV_PRESETS[presetName] || ENV_PRESETS.noon) };
    const P = this.preset;
    this.quality = quality;

    this.sunDir = dirFromAngles(P.sunElev, P.sunAzim);
    this.moonDir = P.night ? dirFromAngles(P.moonElev || 30, P.moonAzim || 120) : new THREE.Vector3(0, 1, 0);

    this.presetName = ENV_PRESETS[presetName] ? presetName : 'noon';
    this.lite = !!quality.lite;
    // ---- sky
    this.sky = new SkyDome();
    this.sky.scale.setScalar(9000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = P.turbidity;
    u.rayleigh.value = P.rayleigh;
    u.mieCoefficient.value = P.mie;
    u.mieDirectionalG.value = P.mieG;
    u.sunPosition.value.copy(this.sunDir).multiplyScalar(450000);
    u.cloudCover.value = P.clouds;
    u.cloudLit.value.set(...P.cloudLit);
    u.cloudDark.value.set(...P.cloudDark);
    u.horizonColor.value.set(P.fogColor);
    u.groundColor.value.set(P.groundColor);
    u.nightAmount.value = P.night;
    u.cloudBright.value = P.night ? 1 : (P.cloudBright ?? 2.4);
    u.skySat.value = P.skySat ?? 1.35;
    u.skyBoost.value = P.skyBoost ?? 0.85;
    u.moonDir.value.copy(this.moonDir);
    if (!this.lite) scene.add(this.sky);

    // ---- fog: exponential haze tinted to the horizon
    scene.fog = new THREE.FogExp2(P.fogColor, P.fogDensity);

    // ---- lights
    const lightDir = P.night ? this.moonDir : this.sunDir;
    this.lightDir = lightDir.clone();
    this.sun = new THREE.DirectionalLight(P.sunColor, P.sunIntensity);
    this.sun.position.copy(lightDir).multiplyScalar(300);
    this.sun.castShadow = quality.shadows > 0 && !this.lite;
    const sm = quality.shadowMapSize;
    this.sun.shadow.mapSize.set(sm, sm);
    const ext = quality.shadowExtent;
    const cam = this.sun.shadow.camera;
    cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext;
    cam.near = 1; cam.far = 900;
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 2.5;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(P.hemiSky, P.hemiGround, P.hemiIntensity);
    scene.add(this.hemi);

    renderer.toneMappingExposure = P.exposure;
    const extras = [];
    if (P.night) {
      // floodlights + city glow so car paint has something bright to reflect
      const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.92, 0.8).multiplyScalar(14) });
      const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.6, 0.35).multiplyScalar(0.5), side: THREE.BackSide });
      const groundMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.16, 0.15, 0.14) });
      const lampG = new THREE.SphereGeometry(2.2, 8, 6);
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2;
        const m = new THREE.Mesh(lampG, lampMat);
        m.position.set(Math.cos(a) * 40, 18 + (k % 3) * 6, Math.sin(a) * 40);
        extras.push(m);
      }
      const band = new THREE.Mesh(new THREE.CylinderGeometry(90, 90, 14, 32, 1, true), glowMat);
      band.position.y = 4;
      extras.push(band);
      const ground = new THREE.Mesh(new THREE.CircleGeometry(95, 32), groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -2;
      extras.push(ground);
      // overhead "floodlight" key light instead of the moon
      this.lightDir = new THREE.Vector3(0.25, 1, 0.35).normalize();
      this.sun.color.set(0xfff1e0);
      this.sun.intensity = 1.25;
      this.hemi.intensity = 0.35;
    }
    if (this.lite) this.goLite();
    else this.buildEnvMap(extras);
    for (const e of extras) { e.geometry.dispose(); }
  }

  // Switch to the simple Lite look: gradient sky, no reflections, no shadows.
  goLite() {
    const P = this.preset;
    this.lite = true;
    if (this.sky && this.sky.parent) this.scene.remove(this.sky);
    if (!this.liteSky) {
      this.liteSky = gradientSky(LITE_ZENITH[this.presetName] ?? 0x3f86d6, P.fogColor, P.groundColor);
      this.liteSky.scale.setScalar(9000);
    }
    if (!this.liteSky.parent) this.scene.add(this.liteSky);
    if (this.envRT) { this.envRT.dispose(); this.envRT = null; }
    this.scene.environment = null;
    this.sun.castShadow = false;
    // without image-based lighting the sky fill comes from the hemisphere light
    this.hemi.intensity = P.night ? 1.5 : 2.1;
    this.hemi.color.set(P.night ? 0x8fa0c8 : 0xffffff);
    this.sun.intensity = P.night ? 1.6 : P.sunIntensity * 0.85;
  }

  // Render sky (+ a ground plane colour) into a PMREM cube for reflections/IBL.
  buildEnvMap(extraObjects = []) {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const sky = new SkyDome();
    sky.material.uniforms = THREE.UniformsUtils.clone(this.sky.material.uniforms);
    sky.material.uniforms.skyBoost.value = this.preset.skyBoost ?? 0.85;
    sky.scale.setScalar(100);
    envScene.add(sky);
    for (const o of extraObjects) envScene.add(o);
    const rt = pmrem.fromScene(envScene, 0, 0.1, 1000);
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = this.preset.envIntensity;
    pmrem.dispose();
    sky.geometry.dispose();
    sky.material.dispose();
  }

  // Keep shadow frustum centred on the focus point, snapped to texels to avoid shimmer.
  update(dt, focus, time) {
    this.sky.material.uniforms.time.value = time;
    if (this.lite) { if (focus && this.liteSky) this.liteSky.position.set(focus.x, 0, focus.z); return; }
    if (focus) {
      const ext = this.quality.shadowExtent;
      const texel = (ext * 2) / this.quality.shadowMapSize;
      // snap in light space
      const ld = this.lightDir;
      const tmp = Environment._tmp || (Environment._tmp = new THREE.Vector3());
      tmp.copy(focus);
      const m = Environment._m || (Environment._m = new THREE.Matrix4());
      m.lookAt(new THREE.Vector3(0, 0, 0), ld.clone().negate(), new THREE.Vector3(0, 1, 0));
      const inv = m.clone().invert();
      tmp.applyMatrix4(inv);
      tmp.x = Math.round(tmp.x / texel) * texel;
      tmp.y = Math.round(tmp.y / texel) * texel;
      tmp.applyMatrix4(m);
      this.sun.target.position.copy(tmp);
      this.sun.position.copy(tmp).addScaledVector(ld, 400);
      this.sun.target.updateMatrixWorld();
    }
  }

  dispose() {
    if (this.liteSky) { this.scene.remove(this.liteSky); this.liteSky.geometry.dispose(); this.liteSky.material.dispose(); }
    this.scene.remove(this.sky, this.sun, this.sun.target, this.hemi);
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.sun.shadow.map?.dispose();
    if (this.envRT) this.envRT.dispose();
    this.scene.environment = null;
    this.scene.fog = null;
  }
}
