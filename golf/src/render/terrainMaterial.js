// Terrain shading. Each vertex carries signed distances to the fairway,
// green, bunkers, tee, rough edge, ocean and water (the same fields the
// physics uses) plus baked shade from nearby trees, and the fragment shader
// turns them into crisp surfaces whatever the mesh resolution:
//   - natural, slightly muted grass colours that vary in patches
//   - mowing stripes that swap light and dark as your viewing direction
//     changes, the way real mown grass does (blades lean one way per pass)
//   - fine grass, sand ripples and rough clumps lit through bump normals
//   - a sheen on the grass at low angles, muddy banks round the water
//   - drifting cloud shadows, ambient occlusion under trees, and the
//     shadows of far-away trees (the live shadow map only covers ~70 m)
import * as THREE from '../../vendor/three.module.min.js';
import { CLOUD_UNIFORMS, CLOUD_GLSL } from './atmosphere.js';

// Course colours are picked in sRGB for the UI; as surface albedos they're
// a touch too saturated and bright, so they're tamed for the 3D view
export function albedo(hex, sat = 0.78, k = 0.74) {
  const c = new THREE.Color(hex);
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return new THREE.Color(l + (c.r - l) * sat, l + (c.g - l) * sat, l + (c.b - l) * sat).multiplyScalar(k);
}

export function makeTerrainMaterial(style, holeHeading, opts = {}) {
  const c = style.colors;
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const fairway = albedo(c.fairway);
  const rough = albedo(c.rough, 0.75, 0.7);
  const first = fairway.clone().lerp(rough, 0.5);
  const uniforms = {
    uFairway: { value: fairway },
    uFirst: { value: first },
    uRough: { value: rough },
    uDeep: { value: albedo(c.deep, 0.7, 0.66) },
    uGreen: { value: albedo(c.green, 0.8, 0.76) },
    uFringe: { value: albedo(c.fringe, 0.8, 0.74) },
    uSand: { value: albedo(c.sand, 0.85, 0.82) },
    uTee: { value: albedo(c.tee) },
    uBeach: { value: albedo('#e9dcb4', 0.85, 0.82) },
    uMud: { value: new THREE.Color(0.075, 0.06, 0.04) },
    uStripeDir: { value: new THREE.Vector2(Math.cos(holeHeading), Math.sin(holeHeading)) },
    uAlongDir: { value: new THREE.Vector2(Math.sin(holeHeading), -Math.cos(holeHeading)) },
    uHasOcean: { value: opts.ocean && !opts.ocean.cliff ? 1 : 0 },
    uWaste: { value: style.waste ? 1 : 0 },
    uHeather: { value: style.heather ? 1 : 0 },
    uFescue: { value: style.fescue ? 1 : 0 },
    uCross: { value: opts.crossCut ? 1 : 0 },
    uDetail: { value: opts.detail ?? 1 },
    ...CLOUD_UNIFORMS,
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aF;
attribute vec3 aR;
attribute vec2 aS;
varying vec4 vF;
varying vec3 vR;
varying vec2 vS;
varying vec3 vWorld;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vF = aF;
vR = aR;
vS = aS;
vWorld = (modelMatrix * vec4(position, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uFairway, uFirst, uRough, uDeep, uGreen, uFringe, uSand, uTee, uBeach, uMud;
uniform vec2 uStripeDir, uAlongDir;
uniform float uHasOcean, uWaste, uHeather, uFescue, uCross, uDetail;
varying vec4 vF;
varying vec3 vR;
varying vec2 vS;
varying vec3 vWorld;
${CLOUD_GLSL}
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
// value noise with its gradient (for bump lighting)
vec3 noised(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 du = 6.0 * f * (1.0 - f);
  float a = hash12(i), b = hash12(i + vec2(1, 0)), c = hash12(i + vec2(0, 1)), d = hash12(i + vec2(1, 1));
  float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
  return vec3(a + k1 * u.x + k2 * u.y + k4 * u.x * u.y, du * vec2(k1 + k4 * u.y, k2 + k4 * u.x));
}
float band(float d, float w) { return 1.0 - smoothstep(-w, w, d); }
// +1 / -1 alternating stripes of width w along direction dir, anti-aliased
float stripes(vec2 wp, vec2 dir, float w) {
  float ph = dot(wp, dir) / w;
  float m = sin(ph * 3.14159);
  return clamp(m / (fwidth(ph) * 3.14159 * 1.5 + 0.12), -1.0, 1.0);
}
float sTerrainMask = 0.0;
float sGrassSheen = 0.0;
vec2 sBump = vec2(0.0);
`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
float dF = vF.x, dG = vF.y, dB = vF.z, dT = vF.w;
float dR = vR.x, dO = vR.y, dW = vR.z;
vec2 wp = vWorld.xz;
vec3 toFrag = vWorld - cameraPosition;
float camDist = length(toFrag);
vec3 V = toFrag / max(camDist, 1e-3);
vec2 vxz = normalize(V.xz + vec2(1e-5));
float near = 1.0 - smoothstep(25.0, 140.0, camDist); // fine detail fades with distance
float grazing = pow(1.0 - abs(V.y), 2.0);
float macro = vnoise(wp * 0.006) * 0.6 + vnoise(wp * 0.023) * 0.4;
float big = vnoise(wp * 0.035);
float mid = vnoise(wp * 0.21);
float fine = mix(0.5, vnoise(wp * 2.7), near);
float micro = mix(0.5, vnoise(wp * 11.0), 1.0 - smoothstep(4.0, 30.0, camDist));
float aaF = max(fwidth(dF), 0.02);
// patches of slightly different grass, as on any real course
vec3 tone = mix(vec3(0.92, 1.0, 0.86), vec3(1.06, 1.0, 1.08), macro);
// Beyond the rough: deep grass / fescue / heather / desert waste
vec3 deep = uDeep * (0.78 + 0.34 * mid + 0.14 * big) * tone;
if (uFescue > 0.5) deep = mix(uDeep, uDeep * vec3(1.22, 1.12, 0.72), smoothstep(0.3, 0.8, mid)) * (0.82 + 0.26 * fine);
if (uHeather > 0.5) deep = mix(uDeep, vec3(0.13, 0.15, 0.06), smoothstep(0.35, 0.75, mid)) * (0.82 + 0.3 * fine) + vec3(0.05, 0.0, 0.04) * step(0.82, vnoise(wp * 1.7)) * (1.0 - smoothstep(0.0, 1.0, fine));
if (uWaste > 0.5) deep = mix(uDeep, uDeep * 0.8, smoothstep(0.4, 0.8, mid)) * (0.88 + 0.16 * fine) + vec3(0.02, 0.03, 0.0) * step(0.8, vnoise(wp * 0.9));
vec3 col = deep;
float roughMask = 1.0;
float grain = vnoise(wp * 7.3) * 0.5 + vnoise(wp * 1.3) * 0.5;
vec3 rough = uRough * (0.78 + 0.18 * big + 0.24 * mix(0.5, grain, near) + 0.08 * micro) * tone;
rough *= mix(vec3(1.0), vec3(1.1, 1.06, 0.82), smoothstep(0.72, 0.9, vnoise(wp * 0.45))); // dry tufts
col = mix(col, rough, band(dR, 1.6));
if (uHasOcean > 0.5) { float bm = band(dO - 8.0, 0.8); col = mix(col, uBeach * (0.92 + 0.1 * fine), bm); roughMask *= 1.0 - bm; }
col = mix(col, uFirst * (0.92 + 0.12 * fine) * tone, band(dF - 2.2, max(fwidth(dF), 0.05)));
// Fairway mowing: lengthwise passes (and a cross cut on some courses).
// A pass looks light when you look the way its blades lean, dark against.
float lane = stripes(wp, uStripeDir, 7.5);
float cross = stripes(wp, uAlongDir, 9.0) * uCross;
float look = dot(vxz, uAlongDir) * lane * 0.75 + dot(vxz, uStripeDir) * cross * 0.45;
float mowAmt = 0.1 * (0.35 + 0.65 * grazing);
float fwMask = band(dF, aaF);
vec3 fw = uFairway * (0.92 + mowAmt * (look + 0.35 * lane) + 0.05 * big + 0.05 * fine + 0.04 * micro) * tone;
col = mix(col, fw, fwMask);
float teeMask = band(dT, max(fwidth(dT), 0.02));
vec3 tee = uTee * (0.93 + 0.08 * stripes(wp, uStripeDir, 1.6) * dot(vxz, uAlongDir) + 0.04 * fine);
col = mix(col, tee, teeMask);
// Bunkers: bright sand with fine grain and rake lines, darker damp lip
float sandMask = band(dB, max(fwidth(dB), 0.02));
vec3 sand = uSand * (0.9 + 0.06 * fine + 0.05 * micro + 0.03 * sin(dot(wp, uStripeDir) * 9.0) * near);
sand = mix(sand * 0.78, sand, smoothstep(-1.1, -0.3, dB));
col = mix(col, sand, sandMask);
// Fringe, then the green: fine two-way stripes from the greens mower
float frMask = band(dG - 1.4, max(fwidth(dG), 0.02));
vec3 fringe = uFringe * (0.94 + 0.06 * fine + 0.05 * stripes(wp, uStripeDir, 1.0) * dot(vxz, uAlongDir) * grazing);
col = mix(col, fringe, frMask);
float gMask = band(dG, max(fwidth(dG), 0.02));
vec2 gd = normalize(uAlongDir + uStripeDir);
float gl = stripes(wp, gd, 1.25);
vec3 green = uGreen * (0.95 + 0.07 * gl * dot(vxz, gd) * (0.3 + 0.7 * grazing) + 0.02 * fine + 0.02 * micro);
col = mix(col, green, gMask);
// muddy, darker banks round ponds and creeks
float bank = smoothstep(2.2, 0.0, dW) * (1.0 - sandMask);
col = mix(col, col * vec3(0.72, 0.8, 0.66), smoothstep(7.0, 1.5, dW));
col = mix(col, uMud * (0.85 + 0.3 * fine), bank * 0.85);
// bump lighting: clumpy rough, fine lawn, rippled sand (close up only)
float lawn = max(fwMask, max(teeMask, max(gMask, frMask)));
vec3 nb = noised(wp * 1.6) * 0.5 + noised(wp * 4.2) * 0.25;
float bumpAmt = mix(0.55, 0.08, lawn) * (1.0 - sandMask) * near;
vec2 rip = vec2(0.0);
{ float rp = dot(wp, uStripeDir) * 9.0; rip = uStripeDir * cos(rp) * 0.06 * near * sandMask; }
sBump = nb.yz * bumpAmt * 0.35 + rip;
sGrassSheen = (1.0 - sandMask) * (1.0 - bank) * mix(0.5, 1.0, lawn);
vec4 diffuseColor = vec4(col, opacity);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize(normal - (viewMatrix * vec4(sBump.x, 0.0, sBump.y, 0.0)).xyz);`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{
  // cloud shadows and the baked shade of trees beyond the live shadow map
  float far = smoothstep(55.0, 85.0, camDist);
  float treeShadow = mix(1.0, vS.y, far);
  reflectedLight.directDiffuse *= cloudShadow(vWorld.xz) * treeShadow;
  reflectedLight.indirectDiffuse *= vS.x;
  reflectedLight.directDiffuse *= mix(1.0, vS.x, 0.5);
}`)
      .replace('#include <opaque_fragment>', `
{
  // grass catches the sky at low angles
  vec3 skySheen = vec3(0.55, 0.62, 0.7);
  #if NUM_HEMI_LIGHTS > 0
    skySheen = hemisphereLights[ 0 ].skyColor;
  #endif
  outgoingLight += skySheen * diffuseColor.rgb * sGrassSheen * pow(1.0 - abs(V.y), 5.0) * 0.55;
}
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'terrain-v2';
  if (opts.polygonOffset) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -4;
  }
  return mat;
}
