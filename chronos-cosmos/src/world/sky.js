import * as THREE from 'three';
import { G } from '../core/G.js';
import { GLSL_NOISE, SHARED, NIGHT_UNIFORM, TIME_UNIFORM } from '../core/shaderlib.js';
import { EPOCHS } from './epochs.js';

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uSunDir; uniform vec3 uMoonDir; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround;
uniform vec3 uSunColor; uniform float uSunSize; uniform float uCloud; uniform vec3 uCloudColor; uniform float uTime;
uniform float uNight; uniform float uStars; uniform float uNebula; uniform float uPlanet; uniform float uAurora;
uniform float uHaze; uniform vec3 uHazeColor; uniform float uRift; uniform float uStorm; uniform float uFlash;
uniform float uEnv;
varying vec3 vDir;
${GLSL_NOISE}
vec3 starLayer(vec3 d, float scale, float thresh){
  vec3 sd = d * scale; vec3 cell = floor(sd); vec3 f = fract(sd);
  float h = hash13(cell);
  if (h < thresh) return vec3(0.0);
  vec3 c = hash33(cell + 3.1) * 0.6 + 0.2;
  float dist = length(f - c);
  float tw = 0.65 + 0.35 * sin(uTime * (1.5 + h * 4.0) + h * 80.0);
  float s = smoothstep(0.12, 0.0, dist) * tw;
  vec3 tint = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.85, 0.7), hash13(cell + 11.0));
  return tint * s * (h - thresh) / (1.0 - thresh) * 6.0;
}
void main(){
  vec3 d = normalize(vDir);
  float y = d.y;
  float up = max(y, 0.0);
  float hz = pow(1.0 - up, 5.0);
  vec3 col = mix(uZenith, uHorizon, hz);
  if (y < 0.0) col = mix(uHorizon, uGround, smoothstep(0.0, -0.3, y));
  float mu = dot(d, uSunDir);
  float sunUp = smoothstep(-0.15, 0.05, uSunDir.y);
  float low = 1.0 - smoothstep(0.0, 0.45, uSunDir.y);
  // mie glow + sunset band
  col += uSunColor * (pow(max(mu, 0.0), 5.0) * 0.18 + pow(max(mu, 0.0), 48.0) * 0.55) * sunUp;
  col += uSunColor * vec3(1.0, 0.45, 0.18) * pow(max(mu * 0.5 + 0.5, 0.0), 3.0) * hz * low * 0.85 * sunUp;
  // rift void sky
  if (uRift > 0.0) {
    vec3 v = vec3(0.01, 0.0, 0.03);
    float n = fbm3d(d * 2.5 + vec3(uTime * 0.01));
    float n2 = fbm3d(d * 5.0 - vec3(uTime * 0.02));
    v += vec3(0.35, 0.08, 0.5) * pow(n, 3.0) * 2.0 + vec3(0.05, 0.3, 0.5) * pow(n2, 4.0) * 2.0;
    float swirl = sin(atan(d.x, d.z) * 3.0 + y * 6.0 - uTime * 0.2) * 0.5 + 0.5;
    v += vec3(0.6, 0.2, 0.9) * pow(swirl, 8.0) * pow(1.0 - abs(y), 6.0) * 0.6;
    col = mix(col, v, uRift);
  }
  // night sky: stars, milky way, moon
  float nightVis = max(uNight, uRift) * uStars;
  float cloudCover = uCloud;
  if (nightVis > 0.01 && y > -0.1) {
    vec3 s = starLayer(d, 180.0, 0.985) + starLayer(d, 420.0, 0.992) * 0.6;
    vec3 bandN = normalize(vec3(0.3, 0.6, -0.74));
    float band = 1.0 - smoothstep(0.0, 0.32, abs(dot(d, bandN)));
    float mw = fbm3d(d * 6.0) * band;
    vec3 milky = mix(vec3(0.25, 0.3, 0.55), vec3(0.6, 0.45, 0.5), fbm3d(d * 3.0 + 5.0)) * pow(mw, 2.0) * 0.5;
    s += starLayer(d, 700.0, 0.97) * band * 0.8;
    col += (s + milky) * nightVis * smoothstep(-0.05, 0.15, y) * (1.0 - cloudCover * 0.7);
  }
  // moon
  float mm = dot(d, uMoonDir);
  float moonDisk = smoothstep(0.9993, 0.9996, mm);
  if (moonDisk > 0.0) {
    vec3 mq = d - uMoonDir * mm;
    float cr = fbm3d(mq * 900.0);
    col = mix(col, vec3(0.9, 0.92, 1.0) * (0.8 + cr * 0.4) * 2.5, moonDisk * uNight);
  }
  col += vec3(0.5, 0.6, 0.9) * pow(max(mm, 0.0), 300.0) * 0.4 * uNight;
  // nebula (Age of Stars)
  if (uNebula > 0.01) {
    float n = fbm3d(d * 2.2 + vec3(0.0, uTime * 0.004, 0.0));
    float n2 = fbm3d(d * 4.5 + 10.0);
    vec3 neb = mix(vec3(0.5, 0.15, 0.6), vec3(0.1, 0.45, 0.7), n2) * pow(smoothstep(0.35, 0.8, n), 2.0);
    neb += vec3(0.9, 0.4, 0.6) * pow(smoothstep(0.55, 0.9, n2), 3.0) * 0.5;
    col += neb * uNebula * smoothstep(-0.02, 0.3, y) * (0.5 + 0.8 * uNight);
  }
  // aurora curtains
  if (uAurora > 0.01 && y > 0.0) {
    float a = atan(d.x, d.z);
    float yy = y;
    float curtain = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float wave = sin(a * (3.0 + fi) + uTime * (0.1 + fi * 0.05) + fbm3(vec2(a * 2.0 + fi, uTime * 0.05)) * 3.0);
      float band = smoothstep(0.0, 0.08, yy - 0.08 - fi * 0.05 - wave * 0.05) * (1.0 - smoothstep(0.1, 0.45, yy - fi * 0.05));
      float streak = pow(vnoise(vec2(a * 40.0 + fi * 17.0, uTime * 0.2)), 3.0);
      curtain += band * (0.4 + streak);
    }
    vec3 ac = mix(vec3(0.1, 1.0, 0.6), vec3(0.6, 0.3, 1.0), smoothstep(0.1, 0.4, yy));
    col += ac * curtain * uAurora * 0.35 * (0.35 + uNight);
  }
  // ringed planet (Age of Stars)
  if (uPlanet > 0.01) {
    vec3 pd = normalize(vec3(-0.55, 0.32, -0.78));
    float pr = 0.16;
    vec3 t1 = normalize(cross(pd, vec3(0.0, 1.0, 0.0)));
    vec3 t2 = cross(t1, pd);
    float dp = dot(d, pd);
    if (dp > 0.0) {
      vec2 q = vec2(dot(d, t1), dot(d, t2)) / sin(pr);
      float r = length(q);
      // rings (tilted ellipse)
      float ca = cos(0.35), sa = sin(0.35);
      vec2 rq = vec2(ca * q.x - sa * q.y, sa * q.x + ca * q.y);
      float rr = length(vec2(rq.x, rq.y / 0.22));
      float ring = smoothstep(1.35, 1.45, rr) * (1.0 - smoothstep(2.15, 2.3, rr));
      ring *= 0.55 + 0.45 * sin(rr * 40.0) * sin(rr * 13.0);
      float behind = step(0.0, rq.y) * step(r, 1.0);
      vec3 ringCol = vec3(0.9, 0.8, 0.7) * ring * (1.0 - behind) * 0.9;
      if (r < 1.0) {
        vec3 nrm = normalize(q.x * t1 + q.y * t2 + sqrt(1.0 - r * r) * pd);
        float lat = dot(nrm, t2);
        float bands = sin(lat * 18.0 + fbm3(vec2(lat * 6.0, dot(nrm, t1) * 2.0)) * 4.0) * 0.5 + 0.5;
        vec3 pc = mix(vec3(0.55, 0.35, 0.6), vec3(0.95, 0.75, 0.55), bands);
        float lit = max(dot(nrm, normalize(uSunDir + vec3(0.3, 0.2, 0.0))), 0.0) * 0.9 + 0.12;
        float rim = pow(1.0 - sqrt(1.0 - r * r), 3.0);
        vec3 planet = pc * lit + vec3(0.5, 0.6, 1.0) * rim * 0.6;
        col = mix(col, planet * 1.4, uPlanet * smoothstep(1.0, 0.985, r));
      }
      col += ringCol * uPlanet * 1.3;
      col += vec3(0.4, 0.35, 0.7) * exp(-max(r - 1.0, 0.0) * 6.0) * 0.08 * uPlanet;
    }
  }
  // clouds
  if (y > 0.0 && cloudCover > 0.01) {
    vec2 p = d.xz / (y + 0.08) * 1.4 + vec2(uTime * 0.008, uTime * 0.003);
    float dn = fbm2(p * 1.3);
    float cov = cloudCover;
    float c = smoothstep(1.0 - cov * 0.95, 1.05 - cov * 0.5, dn);
    vec2 toSun = normalize(uSunDir.xz + 1e-4) * 0.08;
    float dn2 = fbm2((p + toSun) * 1.3);
    float shade = clamp((dn - dn2) * 4.0 + 0.55, 0.15, 1.0);
    vec3 lit = uCloudColor * mix(vec3(0.42, 0.44, 0.5) * (0.4 + uSunColor * 0.6), uSunColor * 1.15, shade) * (0.25 + 0.75 * sunUp);
    lit = mix(lit, uCloudColor * vec3(0.05, 0.06, 0.1), uNight * 0.9);
    lit += uSunColor * pow(max(mu, 0.0), 12.0) * (1.0 - c) * 1.5 * sunUp;
    lit *= 1.0 - uStorm * 0.6;
    float fadeH = smoothstep(0.0, 0.12, y);
    col = mix(col, lit, c * fadeH * (1.0 - uRift));
    cloudCover = c * fadeH;
  }
  // sun disk (hidden by clouds)
  float disk = smoothstep(cos(uSunSize), cos(uSunSize * 0.75), mu);
  col += uSunColor * disk * 60.0 * sunUp * (1.0 - cloudCover * 0.95) * (1.0 - uHaze * 0.6) * (1.0 - uRift);
  // haze (Age of Ash): smoky horizon and dimmed zenith
  if (uHaze > 0.01) {
    float hn = fbm3(vec2(atan(d.x, d.z) * 3.0, y * 4.0 + uTime * 0.01));
    col = mix(col, uHazeColor * (0.7 + hn * 0.6), uHaze * (0.35 + hz * 0.6));
  }
  col += vec3(0.8, 0.85, 1.0) * uFlash * 2.0;
  gl_FragColor = vec4(col, 1.0);
}`;

const tmpV = new THREE.Vector3();

function lerp3(out, a, b, t) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}
function lerpEpoch(a, b, t, path) {
  let va = a, vb = b;
  for (const k of path) { va = va[k]; vb = vb[k]; }
  if (Array.isArray(va)) return lerp3([0, 0, 0], va, vb, t);
  return va + (vb - va) * t;
}

export class Atmosphere {
  constructor(scene) {
    this.scene = scene;
    this.timeOfDay = 8.5; // hours
    this.dayLength = 24 * 60; // real seconds per game day
    this.day = 1;
    this.epochFrom = 0;
    this.epochTo = 0;
    this.epochMix = 1;
    this.weather = { cloud: 0, rain: 0, storm: 0, fog: 0, ash: 0, meteors: 0, aurora: 0 };
    this.flash = 0;
    this.rift = 0;
    this.interior = 0;

    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uZenith: { value: new THREE.Vector3() },
      uHorizon: { value: new THREE.Vector3() },
      uGround: { value: new THREE.Vector3() },
      uSunColor: { value: new THREE.Vector3(1, 1, 1) },
      uSunSize: { value: 0.02 },
      uCloud: { value: 0.4 },
      uCloudColor: { value: new THREE.Vector3(1, 1, 1) },
      uTime: TIME_UNIFORM,
      uNight: NIGHT_UNIFORM,
      uStars: { value: 1 },
      uNebula: { value: 0 },
      uPlanet: { value: 0 },
      uAurora: { value: 0 },
      uHaze: { value: 0 },
      uHazeColor: { value: new THREE.Vector3(0.6, 0.3, 0.2) },
      uRift: { value: 0 },
      uStorm: { value: 0 },
      uFlash: { value: 0 },
      uEnv: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });
    const geo = new THREE.SphereGeometry(4500, 48, 24);
    this.dome = new THREE.Mesh(geo, mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    // lights
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.near = 1; sc.far = 600;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xaaccff, 0x553322, 0.8);
    scene.add(this.hemi);
    scene.fog = new THREE.Fog(0x9ab, 1, 1000);

    // environment (reflections/IBL) from a sky-only scene
    this.envScene = new THREE.Scene();
    const envDome = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat);
    this.envScene.add(envDome);
    this.pmrem = null;
    this.envTimer = 0;
    this.envRT = null;

    this.state = {};
  }

  setEpochInstant(e) {
    this.epochFrom = this.epochTo = e;
    this.epochMix = 1;
  }
  beginEpochBlend(from, to) {
    this.epochFrom = from;
    this.epochTo = to;
    this.epochMix = 0;
  }

  sunDirection(t, out) {
    const th = ((t - 6) / 12) * Math.PI;
    out.set(Math.cos(th), Math.sin(th) * 0.92, 0.38).normalize();
    return out;
  }

  get isNight() {
    return this.uniforms.uNight.value > 0.6;
  }

  update(dt, frozen) {
    if (!frozen) {
      this.timeOfDay += (dt * 24) / this.dayLength;
      if (this.timeOfDay >= 24) {
        this.timeOfDay -= 24;
        this.day++;
      }
    }
    const u = this.uniforms;
    const sunDir = this.sunDirection(this.timeOfDay, u.uSunDir.value);
    u.uMoonDir.value.copy(sunDir).multiplyScalar(-1);
    u.uMoonDir.value.y = Math.max(0.15, u.uMoonDir.value.y);
    u.uMoonDir.value.normalize();
    const sunH = sunDir.y;
    const day = THREE.MathUtils.smoothstep(sunH, -0.18, 0.12);
    const night = 1 - day;
    u.uNight.value = night;
    const golden = 1 - THREE.MathUtils.smoothstep(sunH, 0.0, 0.35);

    const A = EPOCHS[this.epochFrom], B = EPOCHS[this.epochTo];
    const t = this.epochMix;
    const L = (p) => lerpEpoch(A, B, t, p);
    const W = this.weather;

    const zen = L(['sky', 'zenith']), hor = L(['sky', 'horizon']), gnd = L(['sky', 'ground']);
    const nz = L(['night', 'zenith']), nh = L(['night', 'horizon']);
    // golden hour warms the horizon
    const goldenHor = [hor[0] * 1.25 + 0.15, hor[1] * 0.85 + 0.05, hor[2] * 0.6];
    const dayHor = lerp3([0, 0, 0], hor, goldenHor, golden * day);
    const dayZen = lerp3([0, 0, 0], zen, [zen[0] * 0.8, zen[1] * 0.75, zen[2] * 0.9], golden);
    const zf = lerp3([0, 0, 0], nz, dayZen, day);
    const hf = lerp3([0, 0, 0], nh, dayHor, day);
    // overcast desaturates
    const grey = W.cloud * 0.7 + W.storm * 0.3;
    const gz = (zf[0] + zf[1] + zf[2]) / 3, gh = (hf[0] + hf[1] + hf[2]) / 3;
    for (let i = 0; i < 3; i++) {
      zf[i] = zf[i] + (gz * 0.95 - zf[i]) * grey;
      hf[i] = hf[i] + (gh * 0.95 - hf[i]) * grey;
    }
    u.uZenith.value.fromArray(zf);
    u.uHorizon.value.fromArray(hf);
    u.uGround.value.fromArray(lerp3([0, 0, 0], [0.01, 0.01, 0.02], gnd, day));
    const sc = L(['sky', 'sun']);
    const sunWarm = [sc[0], sc[1] * (1 - golden * 0.35), sc[2] * (1 - golden * 0.6)];
    u.uSunColor.value.fromArray(sunWarm);
    u.uSunSize.value = L(['sky', 'sunSize']);
    u.uCloud.value = Math.min(1, L(['sky', 'cloud']) * (1 - W.cloud) + W.cloud * 0.92 + W.storm * 0.2);
    u.uCloudColor.value.fromArray(L(['sky', 'cloudColor']));
    u.uStars.value = L(['sky', 'stars']);
    u.uNebula.value = L(['sky', 'nebula']);
    u.uPlanet.value = L(['sky', 'planet']);
    u.uAurora.value = Math.max(L(['sky', 'aurora']), W.aurora);
    u.uHaze.value = Math.min(1, L(['sky', 'haze']) + W.ash * 0.25);
    u.uHazeColor.value.set(0.62 * (0.25 + day * 0.75), 0.3 * (0.25 + day * 0.75), 0.18 * (0.3 + day * 0.7));
    u.uStorm.value = W.storm;
    this.flash = Math.max(0, this.flash - dt * 4);
    u.uFlash.value = this.flash;
    u.uRift.value = this.rift;

    // fog
    const fc = L(['fog', 'color']);
    const fogDay = [fc[0] * (0.8 + golden * 0.25), fc[1] * (0.85 - golden * 0.1), fc[2] * (0.9 - golden * 0.3)];
    const fogNight = [nh[0] * 1.6 + 0.01, nh[1] * 1.6 + 0.012, nh[2] * 1.6 + 0.02];
    const fogCol = lerp3([0, 0, 0], fogNight, fogDay, day);
    for (let i = 0; i < 3; i++) fogCol[i] = (fogCol[i] + ((fogCol[0] + fogCol[1] + fogCol[2]) / 3 - fogCol[i]) * grey * 0.8) * (1 - W.storm * 0.45 - W.rain * 0.15);
    if (this.rift > 0) lerp3(fogCol, fogCol, [0.04, 0.01, 0.08], this.rift);
    // sky values are authored in linear space, keep fog consistent with them
    this.scene.fog.color.setRGB(fogCol[0], fogCol[1], fogCol[2]);
    const dens = L(['fog', 'density']) * (1 + W.fog * 1.6 + W.rain * 0.45 + W.storm * 0.6 + W.ash * 0.6) * (1 + night * 0.3) * (G.quality === 'low' ? 1.3 : 1);
    SHARED.fogParams.x = this.rift > 0 ? 0.003 : dens;
    SHARED.fogParams.y = L(['fog', 'falloff']);
    SHARED.fogParams.z = 0;
    SHARED.fogParams.w = L(['fog', 'scatter']) * day * (1 - grey * 0.7);
    SHARED.sunDir.x = sunDir.x; SHARED.sunDir.y = sunDir.y; SHARED.sunDir.z = sunDir.z;
    SHARED.sunColor.x = Math.min(1.5, sunWarm[0] * 1.2);
    SHARED.sunColor.y = Math.min(1.5, sunWarm[1] * 1.0);
    SHARED.sunColor.z = Math.min(1.5, sunWarm[2] * 0.85);

    // lights: sun by day, moon by night (crossfade through zero at horizon)
    const sunVis = THREE.MathUtils.smoothstep(sunH, -0.04, 0.1);
    const moonVis = THREE.MathUtils.smoothstep(-sunH, -0.0, 0.15);
    const lightDir = tmpV;
    let inten;
    const dim = (1 - W.cloud * 0.55) * (1 - W.storm * 0.5) * (1 - W.rain * 0.3);
    if (sunVis > 0.001) {
      lightDir.copy(sunDir);
      inten = L(['light', 'sun']) * sunVis * dim * (1 - golden * 0.3);
      this.sun.color.setRGB(sunWarm[0], sunWarm[1], sunWarm[2]);
    } else {
      lightDir.copy(u.uMoonDir.value);
      inten = 0.28 * moonVis * dim;
      this.sun.color.setRGB(0.55, 0.65, 1.0);
    }
    if (this.rift > 0) {
      lightDir.set(0.3, 0.9, 0.2).normalize();
      inten = inten * (1 - this.rift) + 1.6 * this.rift;
      this.sun.color.lerp(new THREE.Color(0.8, 0.6, 1.0), this.rift);
    }
    this.sun.intensity = inten;
    this.lightDir = lightDir.clone();
    const sky = L(['light', 'sky']), grd = L(['light', 'ground']);
    const hemiI = L(['light', 'hemi']) * (0.18 + day * 0.82) * (1 - W.storm * 0.3);
    this.hemi.color.setRGB(sky[0] * (0.35 + day * 0.65), sky[1] * (0.4 + day * 0.6), sky[2] * (0.6 + day * 0.4));
    this.hemi.groundColor.setRGB(grd[0], grd[1], grd[2]);
    this.hemi.intensity = hemiI * (1 + this.rift * 0.4);

    // exposure: lift nights so they read as moonlit rather than black
    const exposure = 1.0 + night * 0.55 - golden * day * 0.05;
    G.renderer.toneMappingExposure = exposure;

    // grade
    const grade = G.post.grade.uniforms;
    grade.uSat.value = L(['grade', 'sat']) * (1 - grey * 0.2) * (1 - night * 0.15);
    grade.uContrast.value = L(['grade', 'contrast']);
    grade.uTint.value.fromArray(L(['grade', 'tint']));
    grade.uLift.value.fromArray(L(['grade', 'lift']));
    grade.uRayColor.value.set(sunWarm[0], sunWarm[1] * 0.92, sunWarm[2] * 0.8);

    this.state.day = day;
    this.state.night = night;
    this.state.golden = golden;
  }

  // Follow the camera: dome + shadow frustum (texel snapped to avoid swimming)
  follow(target, camera) {
    this.dome.position.copy(camera.position);
    const d = this.lightDir || this.sun.position;
    const ext = 80;
    const sm = this.sun.shadow.mapSize.x;
    const texel = (ext * 2) / sm;
    const tx = Math.round(target.x / texel) * texel;
    const tz = Math.round(target.z / texel) * texel;
    const ty = Math.round(target.y / texel) * texel;
    this.sun.target.position.set(tx, ty, tz);
    this.sun.position.set(tx + d.x * 300, ty + d.y * 300, tz + d.z * 300);
    this.sun.target.updateMatrixWorld();
  }

  updateEnvironment(renderer, force) {
    this.envTimer -= 1;
    if (!force && this.envTimer > 0) return;
    this.envTimer = 240;
    if (!this.pmrem) this.pmrem = new THREE.PMREMGenerator(renderer);
    const old = this.envRT;
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 200);
    this.scene.environment = this.envRT.texture;
    if (old) old.dispose();
  }
}
