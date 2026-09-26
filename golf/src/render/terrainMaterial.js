// Terrain shading. Each vertex carries signed distances to the fairway,
// green, bunkers, tee and rough edge (the same fields the physics uses), and
// the fragment shader turns them into crisp surface boundaries with mowing
// stripes and grass grain, whatever the mesh resolution.
import * as THREE from '../../vendor/three.module.min.js';

export function makeTerrainMaterial(style, holeHeading, opts = {}) {
  const c = style.colors;
  const col = (h) => new THREE.Color(h);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const fairway = col(c.fairway);
  const rough = col(c.rough);
  const first = fairway.clone().lerp(rough, 0.5);
  const beach = col('#e9dcb4');
  const uniforms = {
    uFairway: { value: fairway },
    uFirst: { value: first },
    uRough: { value: rough },
    uDeep: { value: col(c.deep) },
    uGreen: { value: col(c.green) },
    uFringe: { value: col(c.fringe) },
    uSand: { value: col(c.sand) },
    uTee: { value: col(c.tee) },
    uBeach: { value: beach },
    uStripeDir: { value: new THREE.Vector2(Math.cos(holeHeading), Math.sin(holeHeading)) },
    uAlongDir: { value: new THREE.Vector2(Math.sin(holeHeading), -Math.cos(holeHeading)) },
    uHasOcean: { value: opts.ocean && !opts.ocean.cliff ? 1 : 0 },
    uWaste: { value: style.waste ? 1 : 0 },
    uHeather: { value: style.heather ? 1 : 0 },
    uFescue: { value: style.fescue ? 1 : 0 },
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aF;
attribute vec2 aR;
varying vec4 vF;
varying vec2 vR;
varying vec3 vWorld;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vF = aF;
vR = aR;
vWorld = (modelMatrix * vec4(position, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uFairway, uFirst, uRough, uDeep, uGreen, uFringe, uSand, uTee, uBeach;
uniform vec2 uStripeDir, uAlongDir;
uniform float uHasOcean, uWaste, uHeather, uFescue;
varying vec4 vF;
varying vec2 vR;
varying vec3 vWorld;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float band(float d, float w) { return 1.0 - smoothstep(-w, w, d); }
`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
float dF = vF.x, dG = vF.y, dB = vF.z, dT = vF.w;
float dR = vR.x, dO = vR.y;
vec2 wp = vWorld.xz;
float big = vnoise(wp * 0.035);
float mid = vnoise(wp * 0.21);
float fine = vnoise(wp * 2.7);
float aaF = max(fwidth(dF), 0.02);
// Beyond the rough: deep grass / fescue / heather / desert waste
vec3 deep = uDeep * (0.82 + 0.3 * mid + 0.12 * big);
if (uFescue > 0.5) deep = mix(uDeep, uDeep * vec3(1.12, 1.08, 0.86), mid) * (0.86 + 0.2 * fine);
if (uHeather > 0.5) deep = mix(uDeep, vec3(0.36, 0.42, 0.22), smoothstep(0.35, 0.75, mid)) * (0.85 + 0.25 * fine);
if (uWaste > 0.5) deep = mix(uDeep, uDeep * 0.82, smoothstep(0.4, 0.8, mid)) * (0.9 + 0.12 * fine) + vec3(0.03, 0.05, 0.0) * step(0.8, vnoise(wp * 0.9));
vec3 col = deep;
float grain = vnoise(wp * 7.3) * 0.5 + vnoise(wp * 1.3) * 0.5;
vec3 rough = uRough * (0.8 + 0.16 * big + 0.22 * grain) * mix(vec3(1.0), vec3(1.06, 1.04, 0.9), step(0.78, vnoise(wp * 0.6)));
col = mix(col, rough, band(dR, 1.6));
if (uHasOcean > 0.5) col = mix(col, uBeach * (0.92 + 0.1 * fine), band(dO - 8.0, 0.8));
col = mix(col, uFirst * (0.93 + 0.1 * fine), band(dF - 2.2, max(fwidth(dF), 0.05)));
// Fairway mowing stripes across the hole, with a soft cross-cut
float s1 = smoothstep(0.35, 0.65, abs(fract(dot(wp, uAlongDir) / 18.0) * 2.0 - 1.0));
float s2 = smoothstep(0.4, 0.6, abs(fract(dot(wp, uStripeDir) / 22.0) * 2.0 - 1.0));
vec3 fw = uFairway * (0.9 + 0.13 * s1 + 0.04 * s2 + 0.06 * big + 0.05 * fine);
col = mix(col, fw, band(dF, aaF));
vec3 tee = uTee * (0.94 + 0.1 * smoothstep(0.4, 0.6, abs(fract(dot(wp, uAlongDir) / 3.0) * 2.0 - 1.0)) + 0.04 * fine);
col = mix(col, tee, band(dT, max(fwidth(dT), 0.02)));
// Bunkers: raked sand with a darker, firmer lip
vec3 sand = uSand * (0.93 + 0.05 * fine + 0.04 * sin(dot(wp, uStripeDir) * 9.0));
sand = mix(sand * 0.88, sand, smoothstep(-0.9, -0.3, dB));
col = mix(col, sand, band(dB, max(fwidth(dB), 0.02)));
// Fringe and green (fine diagonal cut on the green)
vec3 fringe = uFringe * (0.95 + 0.06 * fine);
col = mix(col, fringe, band(dG - 1.4, max(fwidth(dG), 0.02)));
float gs = smoothstep(0.3, 0.7, abs(fract(dot(wp, normalize(uAlongDir + uStripeDir)) / 2.4) * 2.0 - 1.0));
vec3 green = uGreen * (0.95 + 0.07 * gs + 0.025 * fine);
col = mix(col, green, band(dG, max(fwidth(dG), 0.02)));
vec4 diffuseColor = vec4(col, opacity);`);
  };
  mat.customProgramCacheKey = () => 'terrain-v1';
  if (opts.polygonOffset) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -4;
  }
  return mat;
}
