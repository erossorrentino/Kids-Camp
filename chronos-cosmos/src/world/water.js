import * as THREE from 'three';
import { G, WORLD_SIZE, HALF_WORLD } from '../core/G.js';
import { GLSL_NOISE, fogUniforms, TIME_UNIFORM, PLAYER_UNIFORM, NIGHT_UNIFORM, SHARED } from '../core/shaderlib.js';
import { N as HN } from './terrain.js';

const VERT = /* glsl */ `
uniform float uTime; uniform float uLevel;
varying vec3 vWPos;
#include <fog_pars_vertex>
void main(){
  vec3 p = position;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  float w = sin(wp.x * 0.11 + uTime * 1.1) * 0.08 + sin(wp.z * 0.09 - uTime * 0.9) * 0.08 + sin((wp.x + wp.z) * 0.23 + uTime * 1.7) * 0.03;
  wp.y = uLevel + w;
  vWPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
uniform float uTime; uniform float uLevel; uniform sampler2D uHeight; uniform float uHN; uniform vec4 uWorld;
uniform vec3 uDeep; uniform vec3 uShallow; uniform float uGlow; uniform vec3 uSunDir; uniform vec3 uSunCol;
uniform vec3 uSkyZen; uniform vec3 uSkyHor; uniform float uNight; uniform vec3 uPlayer; uniform float uRain;
uniform float uIce; uniform vec3 uIceCenters[8]; uniform float uIceRadii[8];
varying vec3 vWPos;
${GLSL_NOISE}
#include <fog_pars_fragment>
float terrainH(vec2 xz){
  vec2 g = (xz - uWorld.xy) / uWorld.z * (uHN - 1.0);
  g = clamp(g, vec2(0.0), vec2(uHN - 1.001));
  ivec2 i = ivec2(floor(g)); vec2 f = fract(g);
  float a = texelFetch(uHeight, i, 0).r, b = texelFetch(uHeight, i + ivec2(1,0), 0).r;
  float c = texelFetch(uHeight, i + ivec2(0,1), 0).r, d = texelFetch(uHeight, i + ivec2(1,1), 0).r;
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
vec2 waveGrad(vec2 p, float t){
  vec2 g = vec2(0.0);
  float e = 0.05;
  for (int i = 0; i < 3; i++) {
    float s = pow(2.1, float(i));
    vec2 q = p * 0.35 * s + vec2(t * 0.35, t * 0.21) * (1.0 + float(i) * 0.4);
    float h0 = vnoise(q), hx = vnoise(q + vec2(e, 0.0)), hz = vnoise(q + vec2(0.0, e));
    g += vec2(hx - h0, hz - h0) / e / s;
  }
  return g;
}
void main(){
  vec3 V = normalize(cameraPosition - vWPos);
  float dist = length(cameraPosition - vWPos);
  float th = terrainH(vWPos.xz);
  float depth = max(uLevel - th, 0.0);
  vec2 g = waveGrad(vWPos.xz, uTime) * 0.11 + waveGrad(vWPos.xz * 3.1, uTime * 1.3) * 0.035;
  // rain ripples
  if (uRain > 0.01) {
    vec2 cell = floor(vWPos.xz * 1.5);
    vec2 f = fract(vWPos.xz * 1.5) - 0.5;
    float ph = fract(uTime * 0.9 + hash12(cell));
    float r = length(f - (hash22(cell) - 0.5) * 0.5);
    float ring = sin((r - ph * 0.5) * 60.0) * (1.0 - ph) * smoothstep(0.5 * ph + 0.05, 0.5 * ph, r);
    g += normalize(f + 1e-4) * ring * 0.3 * uRain;
  }
  // player wake rings
  float pd = distance(vWPos.xz, uPlayer.xz);
  float near = (1.0 - smoothstep(0.0, 6.0, pd)) * (1.0 - smoothstep(0.5, 2.5, abs(uPlayer.y - uLevel)));
  g += normalize(vWPos.xz - uPlayer.xz + 1e-4) * sin(pd * 6.0 - uTime * 6.0) * near * 0.25;
  float fade = 1.0 - smoothstep(80.0, 600.0, dist);
  vec3 N = normalize(vec3(-g.x * fade, 1.0, -g.y * fade));
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N);
  float ry = max(R.y, 0.0);
  vec3 sky = mix(uSkyHor, uSkyZen, pow(ry, 0.5));
  float spec = pow(max(dot(R, uSunDir), 0.0), 600.0) * 60.0 + pow(max(dot(R, uSunDir), 0.0), 60.0) * 1.5;
  spec *= smoothstep(-0.05, 0.1, uSunDir.y);
  vec3 body = mix(uShallow, uDeep, 1.0 - exp(-depth * 0.18));
  // sub-surface scatter toward the sun on wave crests
  body += uShallow * 0.4 * pow(max(dot(V, -uSunDir) * 0.5 + 0.5, 0.0), 4.0) * (1.0 - uNight);
  vec3 col = mix(body * (0.1 + 0.9 * (1.0 - uNight)), sky, fres);
  col += uSunCol * spec;
  // shoreline foam
  float foamN = vnoise(vWPos.xz * 1.8 + uTime * 0.4) * 0.6 + vnoise(vWPos.xz * 5.0 - uTime * 0.6) * 0.4;
  float foam = (1.0 - smoothstep(0.0, 0.9 + foamN * 0.7, depth)) * smoothstep(0.35, 0.65, foamN + 0.25 * sin(uTime * 1.5 + depth * 8.0));
  col = mix(col, vec3(0.9, 0.95, 1.0) * (0.4 + 0.6 * (1.0 - uNight)), foam * 0.75);
  // bioluminescence (Age of Stars)
  if (uGlow > 0.01) {
    float bl = pow(vnoise(vWPos.xz * 0.8 + uTime * 0.15) * vnoise(vWPos.xz * 2.3 - uTime * 0.1), 2.0);
    float sparkle = step(0.97, hash12(floor(vWPos.xz * 3.0) + floor(uTime * 2.0)));
    col += vec3(0.1, 0.6, 1.0) * (bl * 1.6 + sparkle * 0.6 + near * 2.0) * uGlow * (0.4 + uNight);
  }
  // frost-magic ice floes
  float ice = 0.0;
  for (int i = 0; i < 8; i++) {
    float rr = uIceRadii[i];
    if (rr > 0.0) {
      float d = distance(vWPos.xz, uIceCenters[i].xz);
      float edge = rr + vnoise(vWPos.xz * 1.5) * 0.8;
      ice = max(ice, 1.0 - smoothstep(edge - 0.3, edge, d));
    }
  }
  if (ice > 0.0) {
    float cr = cracks(vWPos.xz * 0.9);
    vec3 icec = mix(vec3(0.75, 0.88, 0.98), vec3(0.45, 0.7, 0.9), smoothstep(0.0, 0.1, cr)) * (0.6 + 0.4 * (1.0 - uNight));
    col = mix(col, icec + uSunCol * pow(max(dot(R, uSunDir), 0.0), 30.0) * 0.6, ice);
  }
  float alpha = clamp(1.0 - exp(-depth * 1.4), 0.0, 1.0);
  alpha = max(alpha, fres * 0.8);
  alpha = max(alpha, foam * 0.8);
  alpha = max(alpha, ice);
  gl_FragColor = vec4(col, alpha * smoothstep(0.0, 0.08, depth + ice));
  #include <fog_fragment>
}`;

export class Water {
  constructor(scene, terrain) {
    this.level = 0;
    this.targetLevel = 0;
    this.iceFloes = []; // {x,z,r,life}
    const centers = [];
    const radii = [];
    for (let i = 0; i < 8; i++) {
      centers.push(new THREE.Vector3(0, 0, 0));
      radii.push(0);
    }
    this.uniforms = {
      uTime: TIME_UNIFORM,
      uLevel: { value: 0 },
      uHeight: { value: terrain.heightTex },
      uHN: { value: HN },
      uWorld: { value: new THREE.Vector4(-HALF_WORLD, -HALF_WORLD, WORLD_SIZE, 1 / WORLD_SIZE) },
      uDeep: { value: new THREE.Vector3(0.02, 0.1, 0.15) },
      uShallow: { value: new THREE.Vector3(0.1, 0.35, 0.35) },
      uGlow: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Vector3(1, 1, 1) },
      uSkyZen: { value: new THREE.Vector3() },
      uSkyHor: { value: new THREE.Vector3() },
      uNight: NIGHT_UNIFORM,
      uPlayer: PLAYER_UNIFORM,
      uRain: { value: 0 },
      uIce: { value: 0 },
      uIceCenters: { value: centers },
      uIceRadii: { value: radii },
      ...THREE.UniformsLib.fog,
      ...fogUniforms(),
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    // Dense near the lake, the far parts of the plane are cheap.
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 220, 220);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.terrain = terrain;
  }

  depthAt(x, z) {
    return this.level - this.terrain.heightAt(x, z);
  }

  isIce(x, z) {
    for (const f of this.iceFloes) if (Math.hypot(x - f.x, z - f.z) < f.r) return true;
    return false;
  }

  addIce(x, z, r = 4.5) {
    if (this.iceFloes.length >= 8) this.iceFloes.shift();
    this.iceFloes.push({ x, z, r: 0.1, target: r, life: 40 });
  }

  update(dt, atmosphere, weather) {
    this.level += (this.targetLevel - this.level) * Math.min(1, dt * 0.8);
    const u = this.uniforms;
    u.uLevel.value = this.level;
    u.uSunDir.value.copy(atmosphere.uniforms.uSunDir.value);
    u.uSunCol.value.copy(atmosphere.uniforms.uSunColor.value);
    u.uSkyZen.value.copy(atmosphere.uniforms.uZenith.value);
    u.uSkyHor.value.copy(atmosphere.uniforms.uHorizon.value);
    u.uRain.value = weather ? weather.rain : 0;
    for (let i = this.iceFloes.length - 1; i >= 0; i--) {
      const f = this.iceFloes[i];
      f.life -= dt;
      f.r += (f.target - f.r) * Math.min(1, dt * 6);
      if (f.life < 3) f.r *= 1 - dt * 0.6;
      if (f.life <= 0) this.iceFloes.splice(i, 1);
    }
    for (let i = 0; i < 8; i++) {
      const f = this.iceFloes[i];
      if (f) {
        u.uIceCenters.value[i].set(f.x, 0, f.z);
        u.uIceRadii.value[i] = f.r;
      } else u.uIceRadii.value[i] = 0;
    }
    u.uIce.value = this.iceFloes.length ? 1 : 0;
    this.mesh.position.x = 0;
    void SHARED;
  }

  setEpochColors(deep, shallow, glow) {
    this.uniforms.uDeep.value.fromArray(deep);
    this.uniforms.uShallow.value.fromArray(shallow);
    this.uniforms.uGlow.value = glow;
  }
}
