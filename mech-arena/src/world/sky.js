/**
 * SKY & WEATHER
 * ------------------------------------------------------------------
 * A shader skydome (gradient, sun disc, cloud band, stars) plus a
 * camera-locked weather volume for snow, ash, rain and dust.
 *
 * The dome is drawn first with depth writing off, so it is effectively
 * free, and the weather particles live in a box that follows the camera
 * and wraps — a few thousand points give the impression of weather across
 * a 600 metre arena.
 */
import * as THREE from 'three';
import { makeRng, clamp } from '../core/rng.js';

const SkyShader = {
  uniforms: {
    uTop: { value: new THREE.Color(0x2a3340) },
    uHorizon: { value: new THREE.Color(0x55708c) },
    uGround: { value: new THREE.Color(0x201c18) },
    uSunDir: { value: new THREE.Vector3(0.5, 0.6, 0.35).normalize() },
    uSunColor: { value: new THREE.Color(0xffe8cc) },
    uSunSize: { value: 0.0016 },
    uStars: { value: 0.0 },
    uClouds: { value: 0.35 },
    uCloudColor: { value: new THREE.Color(0xdfe8f0) },
    uTime: { value: 0 },
    uHaze: { value: 1.0 },
  },
  vertexShader: /* glsl */`
    varying vec3 vDir;
    void main(){
      vDir = position;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_Position.z = gl_Position.w;   // always on the far plane
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uTop, uHorizon, uGround, uSunColor, uCloudColor;
    uniform vec3 uSunDir;
    uniform float uSunSize, uStars, uClouds, uTime, uHaze;
    varying vec3 vDir;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                 mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
    }
    float fbm(vec2 p){
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.03; a *= 0.5; }
      return v;
    }

    void main(){
      vec3 d = normalize(vDir);
      float h = d.y;

      vec3 col = h > 0.0
        ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.42 * uHaze))
        : mix(uHorizon, uGround, pow(clamp(-h, 0.0, 1.0), 0.5));

      // Stars, only above the horizon and only where the sky is dark.
      if (uStars > 0.001 && h > 0.0){
        vec2 sp = d.xz / max(0.08, abs(d.y)) * 26.0;
        float s = hash(floor(sp));
        float twinkle = 0.6 + 0.4 * sin(uTime * 2.0 + s * 40.0);
        float star = smoothstep(0.9965, 1.0, s) * twinkle;
        col += vec3(star) * uStars * smoothstep(0.0, 0.25, h);
      }

      // A drifting cloud band near the horizon.
      if (uClouds > 0.001 && h > -0.05){
        vec2 cp = d.xz / max(0.10, d.y + 0.12) * 1.25 + vec2(uTime * 0.008, uTime * 0.004);
        float c = fbm(cp * 1.6);
        c = smoothstep(0.48, 0.85, c) * smoothstep(0.0, 0.32, h) * uClouds;
        col = mix(col, uCloudColor, c);
      }

      // Sun disc plus a wide glow so the key light has a visible source.
      float sd = max(0.0, dot(d, normalize(uSunDir)));
      col += uSunColor * pow(sd, 900.0) * 3.0;
      col += uSunColor * pow(sd, 16.0) * 0.22;

      gl_FragColor = vec4(col, 1.0);
    }`,
};

/* Per-hazard weather presets. */
const WEATHER = {
  blizzard: { count: 2600, color: 0xeaf4fa, size: 0.3, fall: 5.5, drift: 9, swirl: 2.2, alpha: 0.7, fogMul: 0.45 },
  ash:      { count: 1800, color: 0x9a9088, size: 0.36, fall: 3.4, drift: 3.2, swirl: 1.4, fogMul: 0.7 },
  rain:     { count: 3200, color: 0xa8c4d8, size: 0.16, fall: 46, drift: 5, swirl: 0.2, streak: 3.4, fogMul: 0.75 },
  dust:     { count: 1100, color: 0xd8c49a, size: 0.22, fall: 0.6, drift: 14, swirl: 1.0, alpha: 0.4, fogMul: 0.8 },
  lightning:{ count: 3000, color: 0xa8c4d8, size: 0.16, fall: 52, drift: 8, swirl: 0.3, streak: 4.0, fogMul: 0.7 },
  ember:    { count: 900,  color: 0xff8a3d, size: 0.22, fall: -2.2, drift: 2.4, swirl: 1.8, alpha: 0.75, fogMul: 1.0 },
};

/** Which weather a map gets, from its biome and declared hazard. */
export function weatherFor(mapDef) {
  if (mapDef.hazard === 'blizzard' || mapDef.biome === 'arctic') return 'blizzard';
  if (mapDef.hazard === 'ash') return 'ash';
  if (mapDef.hazard === 'lightning') return 'lightning';
  if (mapDef.biome === 'storm') return 'rain';
  if (mapDef.biome === 'volcanic') return 'ember';
  if (mapDef.biome === 'desert' || mapDef.biome === 'wasteland') return 'dust';
  if (mapDef.biome === 'jungle') return 'rain';
  return null;
}

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 20),
      new THREE.ShaderMaterial({
        ...SkyShader,
        uniforms: THREE.UniformsUtils.clone(SkyShader.uniforms),
        side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      }),
    );
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
    this.mesh.scale.setScalar(3000);
    this.weather = null;
    this.flash = 0;
  }

  attach() { if (!this.mesh.parent) this.scene.add(this.mesh); }
  detach() {
    if (this.mesh.parent) this.scene.remove(this.mesh);
    this._removeWeather();
  }

  /** Configure dome + weather for a biome/map pair. */
  apply(biome, mapDef, sunDir) {
    this.attach();
    const u = this.mesh.material.uniforms;
    u.uTop.value.setHex(biome.sky);
    u.uHorizon.value.setHex(biome.hazeCol);
    u.uGround.value.setHex(biome.ground).multiplyScalar(0.55);
    u.uSunColor.value.setHex(biome.sun);
    u.uSunDir.value.copy(sunDir).normalize();

    const night = biome.label === 'ORBITAL' || biome.label === 'NIGHT CITY';
    u.uStars.value = night ? 1.0 : 0.0;
    u.uClouds.value = biome.label === 'ORBITAL' ? 0.0
      : biome.label === 'STORM' ? 0.85
      : biome.label === 'ARCTIC' ? 0.55
      : biome.label === 'DESERT' ? 0.12
      : 0.34;
    u.uCloudColor.value.setHex(biome.hazeCol).multiplyScalar(biome.label === 'STORM' ? 0.55 : 1.15);
    u.uHaze.value = biome.label === 'ORBITAL' ? 1.6 : 1.0;

    this._removeWeather();
    const kind = weatherFor(mapDef);
    if (kind) this._buildWeather(kind, mapDef);
    return kind;
  }

  _buildWeather(kind, mapDef) {
    const preset = WEATHER[kind];
    if (!preset) return;
    const n = preset.count;
    const rng = makeRng(mapDef.seed ^ 0xbeef);
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    this.box = { w: 160, h: 110 };
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rng() - 0.5) * this.box.w;
      pos[i * 3 + 1] = rng() * this.box.h;
      pos[i * 3 + 2] = (rng() - 0.5) * this.box.w;
      seed[i] = rng();
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(preset.color) },
        uSize: { value: preset.size },
        uTime: { value: 0 },
        uFall: { value: preset.fall },
        uDrift: { value: preset.drift },
        uSwirl: { value: preset.swirl },
        uBox: { value: new THREE.Vector2(this.box.w, this.box.h) },
        uOrigin: { value: new THREE.Vector3() },
        uStreak: { value: preset.streak || 0 },
        uAlpha: { value: preset.alpha ?? 0.85 },
        uScale: { value: innerHeight },
      },
      vertexShader: /* glsl */`
        attribute float aSeed;
        uniform float uTime, uFall, uDrift, uSwirl, uSize, uScale;
        uniform vec2 uBox;
        uniform vec3 uOrigin;
        varying float vFade;
        void main(){
          vec3 p = position;
          // Fall and drift, wrapped inside the box, then offset to the camera.
          p.y = mod(p.y - uTime * uFall + aSeed * 13.0, uBox.y);
          p.x = mod(p.x + uTime * uDrift * (0.6 + aSeed * 0.8) + uBox.x * 0.5, uBox.x) - uBox.x * 0.5;
          p.x += sin(uTime * uSwirl + aSeed * 31.0) * uSwirl;
          p.z += cos(uTime * uSwirl * 0.8 + aSeed * 17.0) * uSwirl;
          p.z = mod(p.z + uBox.x * 0.5, uBox.x) - uBox.x * 0.5;
          vec3 world = p + vec3(uOrigin.x, uOrigin.y - uBox.y * 0.35, uOrigin.z);
          vec4 mv = modelViewMatrix * vec4(world, 1.0);
          // Fade out at the edges of the volume so there is no hard boundary.
          float r = length(p.xz) / (uBox.x * 0.5);
          float edge = 1.0 - smoothstep(0.55, 1.0, r);
          // Anything within a few metres of the lens would render as a
          // screen-filling blob, so fade it out instead.
          float nearFade = smoothstep(1.5, 7.0, -mv.z);
          vFade = edge * nearFade;
          gl_PointSize = uSize * uScale / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform float uStreak, uAlpha;
        varying float vFade;
        void main(){
          vec2 d = gl_PointCoord - 0.5;
          if (uStreak > 0.0) d.y /= uStreak;    // rain reads as a streak, not a dot
          float r = dot(d, d);
          if (r > 0.25) discard;
          gl_FragColor = vec4(uColor, smoothstep(0.25, 0.0, r) * vFade * uAlpha);
        }`,
      transparent: true, depthWrite: false, fog: false,
      blending: kind === 'ember' ? THREE.AdditiveBlending : THREE.NormalBlending,
    });

    this.weather = new THREE.Points(geo, mat);
    this.weather.frustumCulled = false;
    this.weather.renderOrder = 900;
    this.scene.add(this.weather);
    this.weatherKind = kind;
    this.fogMul = preset.fogMul;
  }

  _removeWeather() {
    if (!this.weather) return;
    this.scene.remove(this.weather);
    this.weather.geometry.dispose();
    this.weather.material.dispose();
    this.weather = null;
    this.weatherKind = null;
  }

  /** Called when a lightning strike happens, to flash the sky. */
  strike() { this.flash = 1; }

  update(dt, camera) {
    this.time += dt;
    this.mesh.position.copy(camera.position);
    const u = this.mesh.material.uniforms;
    u.uTime.value = this.time;

    this.flash = Math.max(0, this.flash - dt * 2.6);
    if (this.flash > 0) {
      u.uCloudColor.value.setRGB(1, 1, 1).multiplyScalar(0.6 + this.flash * 2.4);
    }

    if (this.weather) {
      const wu = this.weather.material.uniforms;
      wu.uTime.value = this.time;
      wu.uOrigin.value.copy(camera.position);
      wu.uScale.value = innerHeight;
    }
  }

  dispose() {
    this.detach();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
