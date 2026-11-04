// A physically based sky (Preetham's daylight model, as in three.js's Sky
// example) with drifting clouds lit by the sun, a sun disk that's far
// brighter than white (so it blooms), and stars, the Milky Way and a moon at
// night. A JavaScript copy of the same model gives the scene the matching
// sun colour, sky light, haze colour and exposure for any time of day.
import * as THREE from '../../vendor/three.module.min.js';

const PREETHAM_COMMON = `
const float e = 2.71828182845904523536;
const float pi = 3.141592653589793238;
const vec3 totalRayleigh = vec3(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5);
const vec3 MieConst = vec3(1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14);
const float cutoffAngle = 1.6110731556870734;
const float steepness = 1.5;
const float EE = 1000.0;
float sunIntensity(float zenithAngleCos) {
  zenithAngleCos = clamp(zenithAngleCos, -1.0, 1.0);
  return EE * max(0.0, 1.0 - pow(e, -((cutoffAngle - acos(zenithAngleCos)) / steepness)));
}
vec3 totalMie(float T) { float c = (0.2 * T) * 10E-18; return 0.434 * c * MieConst; }
`;

const VS = `uniform vec3 uSunDir; uniform float uRayleigh, uTurbidity, uMie;
varying vec3 vDir; varying vec3 vBetaR; varying vec3 vBetaM; varying float vSunE; varying float vSunfade;
${PREETHAM_COMMON}
void main(){
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
  vec3 sd = normalize(uSunDir);
  vSunE = sunIntensity(sd.y);
  vSunfade = 1.0 - clamp(1.0 - exp(sd.y), 0.0, 1.0);
  float rayleighCoefficient = uRayleigh - (1.0 * (1.0 - vSunfade));
  vBetaR = totalRayleigh * rayleighCoefficient;
  vBetaM = totalMie(uTurbidity) * uMie;
}`;

const FS = `uniform vec3 uSunDir, uMoonDir, uCloudLit, uCloudShade, uOvercast;
uniform float uMieG, uTime, uCloud, uCloudDark, uNight, uScale, uOver, uHaze, uSat;
uniform vec3 uHazeColor;
varying vec3 vDir; varying vec3 vBetaR; varying vec3 vBetaM; varying float vSunE; varying float vSunfade;
const float pi = 3.141592653589793238;
const float rayleighZenithLength = 8.4E3;
const float mieZenithLength = 1.25E3;
const float sunAngularDiameterCos = 0.99996;
const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
const float ONE_OVER_FOURPI = 0.07957747154594767;
float rayleighPhase(float cosTheta) { return THREE_OVER_SIXTEENPI * (1.0 + cosTheta * cosTheta); }
float hgPhase(float cosTheta, float g) { float g2 = g * g; return ONE_OVER_FOURPI * ((1.0 - g2) / pow(1.0 - 2.0 * g * cosTheta + g2, 1.5)); }
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++){ s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
vec3 atmosphere(vec3 direction) {
  vec3 sd = normalize(uSunDir);
  float zenithAngle = acos(max(0.0, direction.y));
  float inverse = 1.0 / (cos(zenithAngle) + 0.15 * pow(93.885 - ((zenithAngle * 180.0) / pi), -1.253));
  float sR = rayleighZenithLength * inverse;
  float sM = mieZenithLength * inverse;
  vec3 Fex = exp(-(vBetaR * sR + vBetaM * sM));
  float cosTheta = dot(direction, sd);
  float rPhase = rayleighPhase(cosTheta * 0.5 + 0.5);
  vec3 betaRTheta = vBetaR * rPhase;
  float mPhase = hgPhase(cosTheta, uMieG);
  vec3 betaMTheta = vBetaM * mPhase;
  vec3 Lin = pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * (1.0 - Fex), vec3(1.5));
  Lin *= mix(vec3(1.0), pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * Fex, vec3(0.5)), clamp(pow(1.0 - sd.y, 5.0), 0.0, 1.0));
  vec3 L0 = vec3(0.1) * Fex;
  float sundisk = smoothstep(sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta);
  L0 += (vSunE * 19000.0 * Fex) * sundisk * (1.0 - uOver);
  vec3 texColor = (Lin + L0) * 0.04 + vec3(0.0, 0.0003, 0.00075);
  return pow(texColor, vec3(1.0 / (1.2 + (1.2 * vSunfade))));
}
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 dd = vec3(d.x, max(h, 0.002), d.z);
  vec3 col = atmosphere(normalize(dd)) * uScale;
  // a touch more colour than the raw model (it reads pale once tone mapped)
  float al = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(al), col, uSat), vec3(0.0));
  // overcast: a flat, bright grey dome brighter toward the horizon
  vec3 grey = uOvercast * (0.75 + 0.35 * (1.0 - clamp(h, 0.0, 1.0)));
  col = mix(col, grey, uOver);
  // below the horizon: haze over the land
  if (h < 0.0) col = mix(col, uHazeColor, clamp(-h * 8.0, 0.0, 1.0));
  // a band of haze along the horizon matching the fog
  col = mix(col, uHazeColor, uHaze * exp(-max(h, 0.0) * 14.0));
  // night sky
  if (uNight > 0.0) {
    vec3 night = mix(vec3(0.012, 0.018, 0.04), vec3(0.002, 0.004, 0.012), clamp(h * 1.5, 0.0, 1.0));
    if (h > 0.0) {
      vec2 g = floor(vec2(atan(d.z, d.x) * 200.0, asin(clamp(h, -1.0, 1.0)) * 200.0));
      float r = hash(g);
      vec2 f = fract(vec2(atan(d.z, d.x) * 200.0, asin(clamp(h, -1.0, 1.0)) * 200.0)) - 0.5;
      float star = step(0.993, r) * smoothstep(0.35, 0.0, length(f)) * smoothstep(0.02, 0.3, h);
      float tw = 0.65 + 0.35 * sin(uTime * (1.5 + r * 3.0) + r * 40.0);
      night += vec3(0.9, 0.95, 1.0) * star * tw * (0.4 + 2.0 * hash(g + 3.1));
      float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.2, 1.0))) * 3.2, 2.0)) * fbm(d.xz * 7.0 + 3.0);
      night += vec3(0.05, 0.055, 0.08) * band * smoothstep(0.0, 0.4, h);
      // the moon, with a soft halo
      float cm = dot(d, normalize(uMoonDir));
      night += vec3(1.0, 0.98, 0.92) * smoothstep(0.99985, 0.99992, cm) * 6.0 * (0.85 + 0.15 * noise(d.xy * 900.0));
      night += vec3(0.25, 0.3, 0.42) * pow(max(cm, 0.0), 300.0) * 0.6 + vec3(0.04, 0.05, 0.08) * pow(max(cm, 0.0), 12.0);
    }
    col = mix(col, night, uNight);
  }
  // clouds on a flat layer, thinning toward the horizon
  if (h > 0.0 && uCloud > 0.01) {
    vec2 uv = d.xz / (h + 0.12) * 0.9 + vec2(uTime * 0.006, uTime * 0.002);
    vec2 warp = vec2(fbm(uv * 0.5 + 4.0), fbm(uv * 0.5 + 9.0)) - 0.5;
    uv += warp * 0.6;
    float n = fbm(uv);
    float cov = smoothstep(1.0 - uCloud, 1.0 - uCloud + 0.3, n);
    vec3 sd = normalize(uSunDir);
    float lit = fbm(uv + sd.xz * 0.12);
    float shade = clamp((lit - n) * 3.5 + 0.45 + uCloudDark, 0.0, 1.0);
    float cs = max(dot(d, sd), 0.0);
    vec3 cc = mix(uCloudLit, uCloudShade, shade);
    // bright silver linings when the sun is behind a thin edge
    cc += uCloudLit * pow(cs, 10.0) * (1.0 - cov) * 3.0 * (1.0 - uNight);
    col = mix(col, cc, cov * smoothstep(0.0, 0.16, h) * 0.97);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export function makeSkyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0.3, 0.6, -0.5).normalize() },
      uMoonDir: { value: new THREE.Vector3(-0.4, 0.5, 0.6).normalize() },
      uRayleigh: { value: 1.6 },
      uTurbidity: { value: 6 },
      uMie: { value: 0.004 },
      uMieG: { value: 0.8 },
      uScale: { value: 1 },
      uSat: { value: 1.35 },
      uTime: { value: 0 },
      uCloud: { value: 0.4 },
      uCloudDark: { value: 0 },
      uCloudLit: { value: new THREE.Color(1, 1, 1) },
      uCloudShade: { value: new THREE.Color(0.6, 0.65, 0.72) },
      uOver: { value: 0 },
      uOvercast: { value: new THREE.Color(0.7, 0.72, 0.75) },
      uNight: { value: 0 },
      uHaze: { value: 0.3 },
      uHazeColor: { value: new THREE.Color(0.7, 0.78, 0.86) },
    },
    vertexShader: VS,
    fragmentShader: FS,
  });
}

// ---------------------------------------------------------------- CPU twin
// The same Preetham model in JavaScript, to light the scene to match.
const totalRayleigh = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MieConst = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
const sunIntensity = (zc) => 1000 * Math.max(0, 1 - Math.exp(-((1.6110731556870734 - Math.acos(Math.max(-1, Math.min(1, zc)))) / 1.5)));

export function skyRadiance(dir, sun, p) {
  const sunE = sunIntensity(sun.y);
  const fade = 1 - Math.max(0, Math.min(1, 1 - Math.exp(sun.y)));
  const rc = p.rayleigh - (1 - fade);
  const c = 0.2 * p.turbidity * 10e-18;
  const bR = totalRayleigh.map((v) => v * rc);
  const bM = MieConst.map((v) => 0.434 * c * v * p.mie);
  const y = Math.max(0.002, dir.y);
  const za = Math.acos(y);
  const inv = 1 / (Math.cos(za) + 0.15 * Math.pow(93.885 - (za * 180) / Math.PI, -1.253));
  const sR = 8.4e3 * inv, sM = 1.25e3 * inv;
  const cosT = dir.x * sun.x + y * sun.y + dir.z * sun.z;
  const rPh = 0.05968310365946075 * (1 + ((cosT * 0.5 + 0.5) ** 2));
  const g = p.mieG, g2 = g * g;
  const mPh = 0.07957747154594767 * ((1 - g2) / Math.pow(1 - 2 * g * cosT + g2, 1.5));
  const out = [];
  for (let i = 0; i < 3; i++) {
    const Fex = Math.exp(-(bR[i] * sR + bM[i] * sM));
    const ratio = (bR[i] * rPh + bM[i] * mPh) / (bR[i] + bM[i]);
    let Lin = Math.pow(sunE * ratio * (1 - Fex), 1.5);
    Lin *= 1 + (Math.pow(sunE * ratio * Fex, 0.5) - 1) * Math.max(0, Math.min(1, Math.pow(1 - sun.y, 5)));
    const L0 = 0.1 * Fex;
    const t = (Lin + L0) * 0.04 + [0, 0.0003, 0.00075][i];
    out.push(Math.pow(t, 1 / (1.2 + 1.2 * fade)) * (p.scale || 1));
  }
  return out;
}

// Sunlight colour after passing through the atmosphere (relative, max 1)
export function sunTransmittance(sun, p) {
  const fade = 1 - Math.max(0, Math.min(1, 1 - Math.exp(sun.y)));
  const rc = p.rayleigh - (1 - fade);
  const c = 0.2 * p.turbidity * 10e-18;
  const y = Math.max(0.01, sun.y);
  const za = Math.acos(y);
  const inv = 1 / (Math.cos(za) + 0.15 * Math.pow(93.885 - (za * 180) / Math.PI, -1.253));
  const t = [0, 1, 2].map((i) => Math.exp(-(totalRayleigh[i] * rc * 8.4e3 * inv + 0.434 * c * MieConst[i] * p.mie * 1.25e3 * inv)));
  const m = Math.max(...t);
  return { color: t.map((v) => v / m), strength: m };
}
