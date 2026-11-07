import * as THREE from 'three';
import { clamp, lerp, smoothstep, rand } from './noise.js';
import { makeCloudTexture } from './geom.js';

export const SEA_Y = -38;

const NOISE_GLSL = `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for(int i=0;i<5;i++){ s += a*vnoise(p); p = p*2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
`;

const SKY_VERT = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;
const SKY_FRAG = `
varying vec3 vDir;
uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSunColor, uMoonDir, uCloudLit, uCloudShade;
uniform float uTime, uNight, uFlash, uCloudCover;
${NOISE_GLSL}
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
  col = mix(col, uBottom, smoothstep(0.0, -0.3, h));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 1600.0) * 30.0 + pow(sd, 18.0) * 0.45 + pow(sd, 4.0) * 0.18) * (1.0 - uNight * 0.9);
  // stars + moon
  if (uNight > 0.01) {
    vec3 sp = floor(d * 380.0);
    float s = step(0.9975, hash13(sp)) * smoothstep(0.0, 0.25, h);
    col += vec3(0.9, 0.95, 1.0) * s * uNight * (0.5 + 0.5 * sin(uTime * 3.0 + hash13(sp + 1.0) * 30.0));
    float md = dot(d, uMoonDir);
    col += uNight * vec3(0.85, 0.9, 1.0) * (smoothstep(0.9990, 0.9994, md) * 2.5 + pow(max(md, 0.0), 60.0) * 0.25);
  }
  // high stylized clouds
  if (h > -0.05) {
    vec2 uv = d.xz / (h + 0.12) * 0.9 + vec2(uTime * 0.004, uTime * 0.002);
    float c = fbm(uv * 1.3);
    float cov = mix(0.62, 0.38, uCloudCover);
    float m = smoothstep(cov, cov + 0.22, c) * smoothstep(-0.05, 0.25, h);
    float lit = clamp(0.5 + (fbm(uv * 1.3 + uSunDir.xz * 0.08) - c) * 6.0, 0.0, 1.0);
    vec3 cc = mix(uCloudShade, uCloudLit, lit) + uSunColor * pow(sd, 6.0) * 0.5 * (1.0 - uNight);
    col = mix(col, cc, m * 0.85);
  }
  col += vec3(0.6, 0.65, 1.0) * uFlash * 0.6;
  gl_FragColor = vec4(col, 1.0);
}`;

const SEA_VERT = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const SEA_FRAG = `
varying vec3 vW;
uniform float uTime, uFlash, uFogDensity, uNight;
uniform vec3 uFogColor, uLight, uDark, uGlow, uFlashPos, uCam, uSunColor;
uniform vec4 uRifts[3];
${NOISE_GLSL}
void main(){
  vec2 p = vW.xz * 0.0035;
  vec2 q = vec2(fbm(p + uTime * 0.012), fbm(p + vec2(5.2, 1.3) - uTime * 0.01));
  float n = fbm(p * 1.4 + q * 2.2 + uTime * 0.006);
  float n2 = fbm(p * 6.0 + q * 3.0 - uTime * 0.02);
  float v = clamp(n * 0.75 + n2 * 0.35, 0.0, 1.0);
  vec3 col = mix(uDark, uLight, smoothstep(0.3, 0.85, v));
  col += uSunColor * smoothstep(0.65, 0.95, v) * 0.25 * (1.0 - uNight);
  col += uGlow * pow(1.0 - v, 5.0) * 1.4;
  float fd = length(vW.xz - uFlashPos.xz);
  col += vec3(0.65, 0.7, 1.0) * uFlash * exp(-fd * 0.004) * (0.4 + v) * 2.0;
  for (int i = 0; i < 3; i++) {
    vec2 dd = vW.xz - uRifts[i].xy;
    float r = length(dd);
    float a = atan(dd.y, dd.x);
    float sw = sin(a * 4.0 + r * 0.09 - uTime * 2.5) * 0.5 + 0.5;
    float m = smoothstep(uRifts[i].z, 0.0, r);
    col = mix(col, vec3(0.08, 0.0, 0.15), m * 0.6 * uRifts[i].w);
    col += vec3(0.9, 0.3, 1.0) * m * m * (0.4 + sw * 1.2) * 1.6 * uRifts[i].w;
  }
  float dist = length(vW - uCam);
  float f = 1.0 - exp(-pow(dist * uFogDensity * 0.85, 2.0));
  col = mix(col, uFogColor, f);
  gl_FragColor = vec4(col, 1.0);
}`;

const CLOUD_VERT = `
attribute vec3 aOffset; attribute float aScale; attribute float aRot;
varying vec2 vUv; varying float vFog; varying float vH;
uniform float uFogDensity;
void main(){
  vUv = uv;
  vec4 mv = viewMatrix * vec4(aOffset, 1.0);
  float c = cos(aRot), s = sin(aRot);
  vec2 pp = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
  mv.xy += pp * aScale;
  vH = position.y;
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  vFog = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
  // fade out when very close to the camera
  vFog = max(vFog, 1.0 - smoothstep(aScale * 0.2, aScale * 0.9, dist));
}`;
const CLOUD_FRAG = `
varying vec2 vUv; varying float vFog; varying float vH;
uniform sampler2D uMap; uniform vec3 uLit, uShade, uFogColor; uniform float uOpacity;
void main(){
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * uOpacity;
  if (a < 0.01) discard;
  vec3 c = mix(uShade, uLit, smoothstep(-0.4, 0.5, vH));
  c = mix(c, uFogColor, vFog);
  gl_FragColor = vec4(c, a * (1.0 - vFog * 0.7));
}`;

function C(hex) { return new THREE.Color(hex); }
const PAL = {
  day:    { top: C(0x2e6fd8), hor: C(0xa9d3f2), bot: C(0x6a7fa8), sun: C(0xfff1d8), sunI: 3.0, hemiS: C(0xbfdcff), hemiG: C(0x5d6a4a), hemiI: 0.9, cLit: C(0xffffff), cShade: C(0xb3c3dc), seaL: C(0x8d8fb8), seaD: C(0x2a2950), glow: C(0x3a1d5a) },
  dusk:   { top: C(0x324a96), hor: C(0xff9b5e), bot: C(0x5a4a78), sun: C(0xff8a45), sunI: 2.0, hemiS: C(0xffb98a), hemiG: C(0x4a3a4a), hemiI: 0.7, cLit: C(0xffc09a), cShade: C(0x8a6a8a), seaL: C(0xa07a9a), seaD: C(0x2a1d40), glow: C(0x5a1d5a) },
  night:  { top: C(0x060b24), hor: C(0x1e2a58), bot: C(0x101530), sun: C(0x8ea6ff), sunI: 0.55, hemiS: C(0x5a6ab0), hemiG: C(0x1a1a2a), hemiI: 0.55, cLit: C(0x6a7ab0), cShade: C(0x2a3050), seaL: C(0x3a3d6a), seaD: C(0x0d0c22), glow: C(0x4a1d7a) },
  storm:  { top: C(0x2a3346), hor: C(0x6a7484), bot: C(0x30354a), sun: C(0xc8d0e0), sunI: 1.0, hemiS: C(0x8a96aa), hemiG: C(0x3a3a40), hemiI: 0.75, cLit: C(0x8a929e), cShade: C(0x4a505c), seaL: C(0x5a5a78), seaD: C(0x161628), glow: C(0x3a1d6a) },
  realm:  { top: C(0x1a0630), hor: C(0x7a2a8a), bot: C(0x200830), sun: C(0xff7ae8), sunI: 1.4, hemiS: C(0xb070ff), hemiG: C(0x301040), hemiI: 0.8, cLit: C(0xc080e0), cShade: C(0x401858), seaL: C(0x6a2a8a), seaD: C(0x10041c), glow: C(0xff40c0) },
};
function mixPal(out, a, b, t) {
  for (const k in a) {
    if (a[k] instanceof THREE.Color) out[k].copy(a[k]).lerp(b[k], t);
    else out[k] = lerp(a[k], b[k], t);
  }
}
function clonePal(p) { const o = {}; for (const k in p) o[k] = p[k] instanceof THREE.Color ? p[k].clone() : p[k]; return o; }

export class World {
  constructor(G) {
    this.G = G;
    const scene = G.scene;
    this.dayLength = 600;
    this.timeOfDay = 0.28;   // 0..1, 0.25 = sunrise-ish
    this.pal = clonePal(PAL.day);
    this.tmpPal = clonePal(PAL.day);
    this.realmMode = false;
    this.flash = 0;
    this.flashPos = new THREE.Vector3();
    this.bolts = [];
    this.pendingStrikes = [];
    this.sunDir = new THREE.Vector3(0.4, 0.6, 0.3).normalize();
    // weather
    this.weather = 'clear';
    this.weatherTimer = 70;
    this.rain = 0; this.rainTarget = 0;
    this.windAngle = 0.6; this.windStrength = 2; this.windTarget = 2;
    this.wind = new THREE.Vector3();
    this.lightningTimer = 5;
    this.stormFactor = 0;   // smoothed 0..1 darkness

    // Lights
    this.hemi = new THREE.HemisphereLight(0xbfdcff, 0x5d6a4a, 0.9);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 500;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);
    this.flashLight = new THREE.PointLight(0xb0c0ff, 0, 160, 1.5);
    scene.add(this.flashLight);

    // Sky
    this.skyU = {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() }, uMoonDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() },
      uCloudLit: { value: new THREE.Color() }, uCloudShade: { value: new THREE.Color() },
      uTime: { value: 0 }, uNight: { value: 0 }, uFlash: { value: 0 }, uCloudCover: { value: 0 },
    };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    }));
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    // Storm sea
    this.seaU = {
      uTime: { value: 0 }, uFlash: { value: 0 }, uFogDensity: { value: 0.0016 }, uNight: { value: 0 },
      uFogColor: { value: new THREE.Color() }, uLight: { value: new THREE.Color() }, uDark: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() }, uFlashPos: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() },
      uSunColor: { value: new THREE.Color() },
      uRifts: { value: [new THREE.Vector4(0, 0, 1, 0), new THREE.Vector4(0, 0, 1, 0), new THREE.Vector4(0, 0, 1, 0)] },
    };
    const seaGeo = new THREE.PlaneGeometry(7000, 7000, 1, 1); seaGeo.rotateX(-Math.PI / 2);
    this.sea = new THREE.Mesh(seaGeo, new THREE.ShaderMaterial({ vertexShader: SEA_VERT, fragmentShader: SEA_FRAG, uniforms: this.seaU, fog: false }));
    this.sea.position.y = SEA_Y;
    this.sea.frustumCulled = false;
    scene.add(this.sea);

    // Billboard clouds (two layers: storm surface + mid-air wisps)
    this.cloudU = {
      uMap: { value: makeCloudTexture() }, uLit: { value: new THREE.Color() }, uShade: { value: new THREE.Color() },
      uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.0016 }, uOpacity: { value: 0.75 },
    };
    const N = 260;
    const quad = new THREE.PlaneGeometry(1, 1);
    const ig = new THREE.InstancedBufferGeometry();
    ig.index = quad.index; ig.attributes.position = quad.attributes.position; ig.attributes.uv = quad.attributes.uv;
    this.cOff = new Float32Array(N * 3); this.cScale = new Float32Array(N); this.cRot = new Float32Array(N);
    this.cloudN = N;
    for (let i = 0; i < N; i++) this.placeCloud(i, true, new THREE.Vector3());
    this.cOffAttr = new THREE.InstancedBufferAttribute(this.cOff, 3).setUsage(THREE.DynamicDrawUsage);
    ig.setAttribute('aOffset', this.cOffAttr);
    ig.setAttribute('aScale', new THREE.InstancedBufferAttribute(this.cScale, 1));
    ig.setAttribute('aRot', new THREE.InstancedBufferAttribute(this.cRot, 1));
    ig.instanceCount = N;
    this.clouds = new THREE.Mesh(ig, new THREE.ShaderMaterial({
      vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, uniforms: this.cloudU, transparent: true, depthWrite: false, fog: false,
    }));
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = 1;
    scene.add(this.clouds);

    // Rain
    this.rainN = 2600;
    this.rainPos = new Float32Array(this.rainN * 6);
    for (let i = 0; i < this.rainN; i++) this.resetDrop(i, new THREE.Vector3(), true);
    const rg = new THREE.BufferGeometry();
    this.rainAttr = new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage);
    rg.setAttribute('position', this.rainAttr);
    this.rainMat = new THREE.LineBasicMaterial({ color: 0xaab8d0, transparent: true, opacity: 0, depthWrite: false });
    this.rainMesh = new THREE.LineSegments(rg, this.rainMat);
    this.rainMesh.frustumCulled = false;
    scene.add(this.rainMesh);

    // Wind streaks
    this.streakN = 70;
    this.streakPos = new Float32Array(this.streakN * 6);
    this.streakLife = new Float32Array(this.streakN);
    const sg = new THREE.BufferGeometry();
    this.streakAttr = new THREE.BufferAttribute(this.streakPos, 3).setUsage(THREE.DynamicDrawUsage);
    sg.setAttribute('position', this.streakAttr);
    this.streakMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.streaks = new THREE.LineSegments(sg, this.streakMat);
    this.streaks.frustumCulled = false;
    scene.add(this.streaks);

    this.boltMat = new THREE.LineBasicMaterial({ color: 0xe8ecff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.boltGlowMat = new THREE.MeshBasicMaterial({ color: 0xa0b0ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });

    scene.fog = new THREE.FogExp2(0xa9d3f2, 0.0016);
    this.rifts = [];
  }

  placeCloud(i, init, center) {
    const a = Math.random() * Math.PI * 2;
    const r = init ? Math.sqrt(Math.random()) * 900 : 700 + Math.random() * 200;
    const low = i < this.cloudN * 0.7;
    this.cOff[i * 3] = center.x + Math.cos(a) * r;
    this.cOff[i * 3 + 1] = low ? SEA_Y + 2 + Math.random() * 10 : -10 + Math.random() * 90;
    this.cOff[i * 3 + 2] = center.z + Math.sin(a) * r;
    this.cScale[i] = low ? 70 + Math.random() * 90 : 30 + Math.random() * 50;
    this.cRot[i] = (Math.random() - 0.5) * 0.4;
  }

  resetDrop(i, c, init) {
    const x = c.x + (Math.random() - 0.5) * 70, z = c.z + (Math.random() - 0.5) * 70;
    const y = c.y + (init ? (Math.random() - 0.5) * 50 : 25 + Math.random() * 10);
    const o = i * 6;
    this.rainPos[o] = x; this.rainPos[o + 1] = y; this.rainPos[o + 2] = z;
    this.rainPos[o + 3] = x; this.rainPos[o + 4] = y - 1.2; this.rainPos[o + 5] = z;
  }

  setRealm(on) {
    this.realmMode = on;
    this.sea.visible = !on;
    this.clouds.visible = !on;
  }

  isRaining() { return this.rain > 0.45; }
  isNight() { return this.skyU.uNight.value > 0.5; }

  // Schedule a lightning strike with a telegraph glow; damage is applied by combat.
  strike(target, warn = 0.9) {
    this.pendingStrikes.push({ pos: target.clone(), t: warn });
  }

  spawnBolt(target) {
    const G = this.G;
    const pts = [];
    const top = target.clone().add(new THREE.Vector3(rand(-40, 40), 220, rand(-40, 40)));
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const p = top.clone().lerp(target, t);
      if (i > 0 && i < steps) { p.x += rand(-1, 1) * 9 * (1 - t * 0.6); p.z += rand(-1, 1) * 9 * (1 - t * 0.6); }
      pts.push(p);
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, this.boltMat.clone());
    G.scene.add(line);
    const branch = [];
    const bi = 6 + Math.floor(Math.random() * 6);
    let bp = pts[bi].clone();
    branch.push(bp.clone());
    for (let i = 0; i < 6; i++) { bp = bp.clone().add(new THREE.Vector3(rand(-8, 8), -rand(6, 12), rand(-8, 8))); branch.push(bp); }
    const bl = new THREE.Line(new THREE.BufferGeometry().setFromPoints(branch), this.boltMat.clone());
    G.scene.add(bl);
    this.bolts.push({ objs: [line, bl], t: 0.35 });
    this.flash = 1;
    this.flashPos.copy(target);
    this.flashLight.position.copy(target).add(new THREE.Vector3(0, 10, 0));
    const d = target.distanceTo(G.camera.position);
    if (G.audio) G.audio.play('thunder', clamp(1.4 - d / 500, 0.15, 1));
  }

  setRifts(rifts) { this.rifts = rifts; }

  update(dt, focus) {
    const G = this.G;
    const time = G.time;
    // --- time of day
    if (!this.realmMode) this.timeOfDay = (this.timeOfDay + dt / this.dayLength) % 1;
    const ang = this.timeOfDay * Math.PI * 2 - Math.PI / 2;
    const elev = Math.sin(ang);
    this.sunDir.set(Math.cos(ang) * 0.75, elev, Math.cos(ang) * 0.35 + 0.35).normalize();
    // --- weather state machine
    if (!this.realmMode) {
      this.weatherTimer -= dt;
      if (this.weatherTimer <= 0) {
        const r = Math.random();
        if (this.weather === 'storm') this.weather = r < 0.6 ? 'clear' : 'windy';
        else if (this.weather === 'windy') this.weather = r < 0.55 ? 'storm' : 'clear';
        else this.weather = r < 0.5 ? 'windy' : r < 0.8 ? 'storm' : 'clear';
        this.weatherTimer = this.weather === 'storm' ? rand(50, 80) : rand(60, 110);
        this.windAngle += rand(-1.5, 1.5);
        if (G.ui) G.ui.toast(this.weather === 'storm' ? '⛈ A thunderstorm rolls in — rain conducts shock, dampens fire'
          : this.weather === 'windy' ? '🌬 Strong winds — gliders and ships drift with the gusts' : '☀ The skies clear', 3.5);
      }
    }
    const storm = this.realmMode || this.weather === 'storm';
    this.rainTarget = this.realmMode ? (G.storm && G.storm.mods.thunder ? 0.5 : 0) : (this.weather === 'storm' ? 1 : 0);
    this.rain = THREE.MathUtils.damp(this.rain, this.rainTarget, 0.4, dt);
    this.windTarget = this.realmMode ? (G.storm && G.storm.mods.gale ? 11 : 5) : this.weather === 'windy' ? 9 : this.weather === 'storm' ? 6 : 2;
    this.windStrength = THREE.MathUtils.damp(this.windStrength, this.windTarget, 0.3, dt);
    this.windAngle += Math.sin(time * 0.05) * dt * 0.05 + (this.realmMode && G.storm && G.storm.mods.gale ? dt * 0.15 : 0);
    this.wind.set(Math.cos(this.windAngle), 0, Math.sin(this.windAngle)).multiplyScalar(this.windStrength);
    this.stormFactor = THREE.MathUtils.damp(this.stormFactor, storm ? 1 : 0, 0.35, dt);

    // --- palette
    const dayT = smoothstep(-0.12, 0.35, elev);
    const duskT = 1 - smoothstep(0.0, 0.35, Math.abs(elev + 0.03));
    if (this.realmMode) {
      mixPal(this.pal, PAL.realm, PAL.realm, 0);
    } else {
      mixPal(this.tmpPal, PAL.night, PAL.day, dayT);
      mixPal(this.pal, this.tmpPal, PAL.dusk, duskT * 0.85);
      mixPal(this.tmpPal, this.pal, PAL.storm, this.stormFactor * (0.4 + dayT * 0.5));
      mixPal(this.pal, this.tmpPal, this.tmpPal, 0);
    }
    const p = this.pal;
    const night = this.realmMode ? 0 : 1 - smoothstep(-0.25, 0.05, elev);
    const s = this.skyU;
    s.uTop.value.copy(p.top); s.uHorizon.value.copy(p.hor); s.uBottom.value.copy(p.bot);
    s.uSunColor.value.copy(p.sun);
    s.uSunDir.value.copy(this.realmMode ? new THREE.Vector3(0.3, 0.2, 0.9).normalize() : this.sunDir);
    s.uMoonDir.value.copy(this.sunDir).negate();
    if (s.uMoonDir.value.y < 0.15) s.uMoonDir.value.y = 0.15;
    s.uMoonDir.value.normalize();
    s.uCloudLit.value.copy(p.cLit); s.uCloudShade.value.copy(p.cShade);
    s.uTime.value = time; s.uNight.value = night; s.uCloudCover.value = this.stormFactor;
    // lights
    const lightDir = elev > -0.05 || this.realmMode ? s.uSunDir.value : s.uMoonDir.value;
    const lit = this.realmMode ? 1 : Math.max(smoothstep(-0.08, 0.12, elev), night * 0.9);
    this.sun.color.copy(p.sun);
    this.sun.intensity = p.sunI * lit * (1 - this.stormFactor * 0.45);
    this.hemi.color.copy(p.hemiS); this.hemi.groundColor.copy(p.hemiG);
    this.hemi.intensity = p.hemiI + (G.save && G.save.has && G.save.has('lumen') ? night * 0.25 : 0);
    if (focus) {
      // snap the shadow frustum to texels to avoid shimmering
      const texel = 140 / 2048;
      const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
      this.sun.target.position.set(fx, focus.y, fz);
      this.sun.position.set(fx, focus.y, fz).addScaledVector(lightDir, 200);
    }
    // fog
    const fogCol = p.hor.clone().lerp(p.top, 0.12);
    const density = this.realmMode ? (G.storm && G.storm.mods.fog ? 0.0075 : 0.0042) : 0.00115 + this.stormFactor * 0.0009;
    G.scene.fog.color.copy(fogCol);
    G.scene.fog.density = density;
    // sea
    const su = this.seaU;
    su.uTime.value = time; su.uFogColor.value.copy(fogCol); su.uFogDensity.value = density;
    su.uLight.value.copy(p.seaL); su.uDark.value.copy(p.seaD); su.uGlow.value.copy(p.glow);
    su.uSunColor.value.copy(p.sun); su.uNight.value = night;
    su.uCam.value.copy(G.camera.position);
    this.sea.position.x = G.camera.position.x; this.sea.position.z = G.camera.position.z;
    for (let i = 0; i < 3; i++) {
      const r = this.rifts[i];
      if (r && r.active) su.uRifts.value[i].set(r.pos.x, r.pos.z, r.radius * 2.2, 1);
      else su.uRifts.value[i].set(0, 0, 1, 0);
    }
    // clouds
    const cu = this.cloudU;
    cu.uLit.value.copy(p.cLit); cu.uShade.value.copy(p.cShade).lerp(p.seaD, 0.3); cu.uFogColor.value.copy(fogCol); cu.uFogDensity.value = density;
    const cam = G.camera.position;
    const wdx = this.wind.x * dt * 0.8, wdz = this.wind.z * dt * 0.8;
    for (let i = 0; i < this.cloudN; i++) {
      this.cOff[i * 3] += wdx; this.cOff[i * 3 + 2] += wdz;
      const dx = this.cOff[i * 3] - cam.x, dz = this.cOff[i * 3 + 2] - cam.z;
      if (dx * dx + dz * dz > 950 * 950) this.placeCloud(i, false, cam);
    }
    this.cOffAttr.needsUpdate = true;

    // rain
    this.rainMat.opacity = this.rain * 0.45;
    this.rainMesh.visible = this.rain > 0.02;
    if (this.rainMesh.visible) {
      const fall = 38 * dt, wx = this.wind.x * 0.06, wz = this.wind.z * 0.06;
      const rp = this.rainPos;
      for (let i = 0; i < this.rainN; i++) {
        const o = i * 6;
        rp[o + 1] -= fall; rp[o + 4] -= fall;
        rp[o] += wx * fall; rp[o + 3] = rp[o] - wx * 1.2;
        rp[o + 2] += wz * fall; rp[o + 5] = rp[o + 2] - wz * 1.2;
        if (rp[o + 1] < cam.y - 25 || Math.abs(rp[o] - cam.x) > 40 || Math.abs(rp[o + 2] - cam.z) > 40) this.resetDrop(i, cam, false);
      }
      this.rainAttr.needsUpdate = true;
    }
    // wind streaks
    const wAmt = smoothstep(3, 10, this.windStrength);
    this.streakMat.opacity = 0.05 + wAmt * 0.35;
    const wn = this.wind.clone().normalize();
    for (let i = 0; i < this.streakN; i++) {
      this.streakLife[i] -= dt;
      const o = i * 6;
      if (this.streakLife[i] <= 0) {
        this.streakLife[i] = rand(0.6, 1.6);
        const x = cam.x + rand(-35, 35), y = cam.y + rand(-12, 14), z = cam.z + rand(-35, 35);
        this.streakPos[o] = x; this.streakPos[o + 1] = y; this.streakPos[o + 2] = z;
      }
      const sp = (6 + this.windStrength * 3) * dt;
      this.streakPos[o] += wn.x * sp; this.streakPos[o + 2] += wn.z * sp;
      this.streakPos[o + 1] += Math.sin(G.time * 2 + i) * dt * 0.5;
      const len = 2 + this.windStrength * 0.5;
      this.streakPos[o + 3] = this.streakPos[o] - wn.x * len;
      this.streakPos[o + 4] = this.streakPos[o + 1];
      this.streakPos[o + 5] = this.streakPos[o + 2] - wn.z * len;
    }
    this.streakAttr.needsUpdate = true;

    // lightning
    const thunder = (this.weather === 'storm' && !this.realmMode) || (this.realmMode && G.storm && G.storm.active);
    if (thunder) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        const heavy = this.realmMode && G.storm && G.storm.mods.thunder;
        this.lightningTimer = heavy ? rand(1.5, 3.5) : this.realmMode ? rand(4, 8) : rand(3, 8);
        const f = focus || cam;
        if (Math.random() < (heavy ? 0.6 : 0.3)) {
          // near strike (telegraphed), lands on a surface if possible
          const a = Math.random() * Math.PI * 2, r = rand(8, 45);
          const tx = f.x + Math.cos(a) * r, tz = f.z + Math.sin(a) * r;
          const g = G.physics.groundAt(tx, f.y + 60, tz, 0);
          const ty = g ? g.h : (this.realmMode ? f.y - 30 : SEA_Y);
          this.strike(new THREE.Vector3(tx, ty, tz));
        } else {
          const a = Math.random() * Math.PI * 2, r = rand(150, 600);
          this.spawnBolt(new THREE.Vector3(f.x + Math.cos(a) * r, this.realmMode ? f.y - 120 : SEA_Y, f.z + Math.sin(a) * r));
        }
      }
    }
    for (let i = this.pendingStrikes.length - 1; i >= 0; i--) {
      const ps = this.pendingStrikes[i];
      ps.t -= dt;
      if (G.particles && Math.random() < 0.7) G.particles.add.emit({ x: ps.pos.x + rand(-1, 1), y: ps.pos.y + 0.3, z: ps.pos.z + rand(-1, 1), vy: rand(1, 4), color: [0.7, 0.8, 1], size: 0.6, life: 0.4 });
      if (ps.t <= 0) {
        this.pendingStrikes.splice(i, 1);
        this.spawnBolt(ps.pos);
        if (G.combat) G.combat.lightningHit(ps.pos);
      }
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t -= dt;
      const o = b.t > 0 ? (Math.random() < 0.3 ? 0.2 : 1) : 0;
      b.objs.forEach((l) => { l.material.opacity = o; });
      if (b.t <= 0) {
        b.objs.forEach((l) => { G.scene.remove(l); l.geometry.dispose(); l.material.dispose(); });
        this.bolts.splice(i, 1);
      }
    }
    this.flash = Math.max(0, this.flash - dt * 3.5);
    const fl = this.flash * (0.6 + Math.random() * 0.4);
    s.uFlash.value = fl * 0.5;
    su.uFlash.value = fl; su.uFlashPos.value.copy(this.flashPos);
    this.flashLight.intensity = fl * 4000;
    this.sky.position.copy(cam);
  }
}
