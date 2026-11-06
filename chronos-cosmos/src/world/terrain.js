import * as THREE from 'three';
import { G, WORLD_SIZE, HALF_WORLD } from '../core/G.js';
import { worldHeight, biomeMasks } from './worldmap.js';
import { GLSL_NOISE, GLSL_EPOCH, EPOCH_UNIFORMS, TIME_UNIFORM, WET_UNIFORM, NIGHT_UNIFORM, addCompileHook } from '../core/shaderlib.js';

export const SEG = 400; // cells per side
export const N = SEG + 1; // vertices per side
export const CELL = WORLD_SIZE / SEG; // 4 m
export const MASK_RES = 512;

export class Terrain {
  constructor() {
    this.heights = new Float32Array(N * N);
    this.masks = new Uint8Array(MASK_RES * MASK_RES * 4);
  }

  generate(progress) {
    const H = this.heights;
    for (let r = 0; r < N; r++) {
      const z = -HALF_WORLD + r * CELL;
      for (let c = 0; c < N; c++) {
        const x = -HALF_WORLD + c * CELL;
        H[r * N + c] = worldHeight(x, z);
      }
      if (progress && r % 40 === 0) progress(r / N);
    }
    const M = this.masks;
    const ms = WORLD_SIZE / MASK_RES;
    for (let r = 0; r < MASK_RES; r++) {
      const z = -HALF_WORLD + (r + 0.5) * ms;
      for (let c = 0; c < MASK_RES; c++) {
        const x = -HALF_WORLD + (c + 0.5) * ms;
        const m = biomeMasks(x, z);
        const i = (r * MASK_RES + c) * 4;
        // bake slope/altitude limits into grass density so the grass shader
        // needs a single height lookup per vertex
        const e = 1.5;
        const gx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
        const gz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
        const slope = Math.hypot(gx, gz) / (2 * e);
        const hh = this.heightAt(x, z);
        const sl = Math.min(1, Math.max(0, (slope - 0.55) / 0.35));
        const al = Math.min(1, Math.max(0, (hh - 130) / 20));
        m[0] *= (1 - sl * sl * (3 - 2 * sl)) * (1 - al * al * (3 - 2 * al));
        M[i] = m[0] * 255;
        M[i + 1] = m[1] * 255;
        M[i + 2] = m[2] * 255;
        M[i + 3] = m[3] * 255;
      }
    }
  }

  // Exact height matching the rendered triangles.
  heightAt(x, z) {
    let gx = (x + HALF_WORLD) / CELL, gz = (z + HALF_WORLD) / CELL;
    if (gx < 0) gx = 0; else if (gx > SEG - 0.0001) gx = SEG - 0.0001;
    if (gz < 0) gz = 0; else if (gz > SEG - 0.0001) gz = SEG - 0.0001;
    const c = Math.floor(gx), r = Math.floor(gz);
    const fx = gx - c, fz = gz - r;
    const H = this.heights;
    const a = H[r * N + c], d = H[r * N + c + 1], b = H[(r + 1) * N + c], cc = H[(r + 1) * N + c + 1];
    if (fx + fz <= 1) return a + (d - a) * fx + (b - a) * fz;
    return cc + (b - cc) * (1 - fx) + (d - cc) * (1 - fz);
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 1.5;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    out.set(hl - hr, 2 * e, hd - hu).normalize();
    return out;
  }

  maskAt(x, z) {
    const c = Math.max(0, Math.min(MASK_RES - 1, Math.floor(((x + HALF_WORLD) / WORLD_SIZE) * MASK_RES)));
    const r = Math.max(0, Math.min(MASK_RES - 1, Math.floor(((z + HALF_WORLD) / WORLD_SIZE) * MASK_RES)));
    const i = (r * MASK_RES + c) * 4;
    const M = this.masks;
    return [M[i] / 255, M[i + 1] / 255, M[i + 2] / 255, M[i + 3] / 255];
  }

  // March a ray against the heightfield. Returns distance or -1.
  raycast(o, d, maxDist = 200, step = 1.0) {
    let t = 0;
    let prevT = 0;
    let prevDiff = o.y - this.heightAt(o.x, o.z);
    if (prevDiff < 0) return 0;
    while (t < maxDist) {
      t += step * (t > 60 ? 2 : 1);
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      const diff = y - this.heightAt(x, z);
      if (diff < 0) {
        // refine
        let a = prevT, b = t;
        for (let i = 0; i < 8; i++) {
          const m = (a + b) * 0.5;
          const dm = o.y + d.y * m - this.heightAt(o.x + d.x * m, o.z + d.z * m);
          if (dm < 0) b = m; else a = m;
        }
        return (a + b) * 0.5;
      }
      prevT = t;
      prevDiff = diff;
    }
    return -1;
  }

  buildMesh() {
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.heights[i]);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    geo.computeBoundingBox();

    // GPU copies of height + biome masks (used by grass/water shaders)
    const ht = new THREE.DataTexture(this.heights, N, N, THREE.RedFormat, THREE.FloatType);
    ht.minFilter = ht.magFilter = THREE.NearestFilter;
    ht.needsUpdate = true;
    this.heightTex = ht;
    const mt = new THREE.DataTexture(this.masks, MASK_RES, MASK_RES, THREE.RGBAFormat, THREE.UnsignedByteType);
    mt.minFilter = THREE.LinearFilter;
    mt.magFilter = THREE.LinearFilter;
    mt.needsUpdate = true;
    this.maskTex = mt;

    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.0 });
    this.material = mat;
    this.uniforms = {
      uMask: { value: mt },
      uWorld: { value: new THREE.Vector4(-HALF_WORLD, -HALF_WORLD, WORLD_SIZE, 1 / WORLD_SIZE) },
      uTime: TIME_UNIFORM,
      uWet: WET_UNIFORM,
      uNight: NIGHT_UNIFORM,
      ...EPOCH_UNIFORMS,
    };
    addCompileHook(mat, (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWPos = (modelMatrix * vec4(transformed,1.0)).xyz; vWNrm = normalize(mat3(modelMatrix) * objectNormal);');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + TERRAIN_FRAG_PARS)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + TERRAIN_FRAG_COLOR)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;')
        .replace('#include <normal_fragment_maps>', TERRAIN_FRAG_NORMAL)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += tEmissive;');
    }, 'terrain');

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.name = 'terrain';
    this.mesh = mesh;
    return mesh;
  }
}

const TERRAIN_FRAG_PARS = /* glsl */ `
uniform sampler2D uMask; uniform vec4 uWorld; uniform float uTime; uniform float uWet; uniform float uNight;
varying vec3 vWPos; varying vec3 vWNrm;
${GLSL_NOISE}
${GLSL_EPOCH}
struct Surf { vec3 albedo; vec3 emissive; float rough; float bump; };
Surf terrainSurf(int ep, vec3 wp, vec3 wn, vec4 m, float n1, float n2, float n3){
  Surf s;
  float nearF = 1.0 - smoothstep(60.0, 220.0, length(wp - cameraPosition));
  float slope = 1.0 - wn.y;
  float h = wp.y;
  float rockT = smoothstep(0.27, 0.42, slope + (n1 - 0.5) * 0.2);
  rockT = max(rockT, m.b * smoothstep(0.10, 0.2, slope + (n2 - 0.5) * 0.12));
  float snowT = smoothstep(140.0, 172.0, h + (n1 - 0.5) * 46.0) * (1.0 - smoothstep(0.45, 0.66, slope));
  float sandT = (1.0 - smoothstep(1.0, 3.4, h + (n2 - 0.5) * 1.8)) * (1.0 - rockT);
  float pathT = m.g * (1.0 - rockT) * (1.0 - snowT);
  float forest = m.a;
  float bedT = 1.0 - smoothstep(-4.0, -0.6, h);
  float strata = sin(h * 0.38 + n1 * 7.0 + n2 * 1.5) * 0.5 + 0.5; strata = smoothstep(0.2, 0.8, strata);
  vec3 c; vec3 e = vec3(0.0); float rough = 0.93; float bump = 0.6;
  if (ep == 0) {
    vec3 g1 = srgb(vec3(0.29, 0.43, 0.15)), g2 = srgb(vec3(0.44, 0.50, 0.21)), g3 = srgb(vec3(0.19, 0.29, 0.11));
    vec3 grass = mix(mix(g1, g2, smoothstep(0.3, 0.7, n1)), g3, forest * 0.75) * (0.82 + n3 * 0.32);
    grass *= mix(1.0, 0.72, m.r * (1.0 - smoothstep(60.0, 120.0, length(wp - cameraPosition))));
    grass = mix(grass, srgb(vec3(0.42, 0.40, 0.18)), smoothstep(0.62, 0.8, n2) * 0.35 * (1.0 - forest));
    vec3 dirt = srgb(vec3(0.45, 0.35, 0.23)) * (0.8 + n3 * 0.35);
    vec3 greyRock = mix(srgb(vec3(0.36, 0.36, 0.38)), srgb(vec3(0.50, 0.47, 0.43)), n1) * (0.7 + n3 * 0.45);
    vec3 redRock = mix(srgb(vec3(0.62, 0.38, 0.25)), srgb(vec3(0.72, 0.50, 0.35)), strata) * (0.75 + n3 * 0.35);
    vec3 rock = mix(greyRock, redRock, m.b) * (0.8 + n2 * 0.3);
    vec3 snow = srgb(vec3(0.93, 0.95, 0.99));
    vec3 sand = srgb(vec3(0.78, 0.70, 0.52)) * (0.9 + n3 * 0.15);
    vec3 bed = srgb(vec3(0.34, 0.33, 0.24));
    c = grass; c = mix(c, dirt, pathT); c = mix(c, sand, sandT); c = mix(c, bed, bedT); c = mix(c, rock, rockT); c = mix(c, snow, snowT);
    rough = mix(mix(0.95, 0.88, rockT), 0.55, snowT);
    bump = mix(0.5, 1.4, rockT);
  } else if (ep == 1) {
    vec3 ash1 = srgb(vec3(0.27, 0.24, 0.22)), ash2 = srgb(vec3(0.40, 0.35, 0.30));
    vec3 ground = mix(ash1, ash2, n1) * (0.8 + n3 * 0.3);
    ground = mix(ground, srgb(vec3(0.33, 0.28, 0.18)), (1.0 - forest) * smoothstep(0.55, 0.75, n2) * 0.5);
    vec3 dirt = srgb(vec3(0.30, 0.22, 0.16)) * (0.8 + n3 * 0.3);
    vec3 rock = mix(srgb(vec3(0.16, 0.15, 0.15)), mix(srgb(vec3(0.36, 0.17, 0.10)), srgb(vec3(0.48, 0.25, 0.14)), strata), m.b) * (0.7 + n2 * 0.4);
    vec3 ashSnow = srgb(vec3(0.42, 0.40, 0.40));
    float cr = cracks(wp.xz * 0.35);
    vec3 dry = srgb(vec3(0.55, 0.47, 0.36)) * (0.85 + n3 * 0.2);
    dry *= mix(0.35, 1.0, smoothstep(0.02, 0.08, cr));
    c = ground; c = mix(c, dirt, pathT); c = mix(c, dry, max(sandT, bedT)); c = mix(c, rock, rockT); c = mix(c, ashSnow, snowT);
    // ember veins in rock and ground
    float vein = 1.0 - smoothstep(0.0, 0.05, cracks(wp.xz * 0.12 + n1 * 0.6));
    float hot = smoothstep(0.55, 0.8, n1) * (rockT * 0.8 + 0.25) * (1.0 - bedT);
    float pulse = 0.75 + 0.25 * sin(uTime * 1.7 + wp.x * 0.05 + wp.z * 0.04);
    e += vec3(1.0, 0.32, 0.06) * vein * hot * 2.2 * pulse * (0.15 + 0.85 * nearF);
    // crater glow near volcano floor
    float crater = (1.0 - smoothstep(30.0, 60.0, distance(wp.xz, vec2(60.0, -560.0)))) * smoothstep(160.0, 175.0, h);
    float lava = smoothstep(0.35, 0.6, fbm3(wp.xz * 0.06 + vec2(uTime * 0.03, 0.0)));
    c = mix(c, srgb(vec3(0.1, 0.03, 0.02)), crater);
    e += vec3(1.4, 0.4, 0.06) * crater * lava * 3.0 * pulse;
    rough = 0.96;
    bump = mix(0.7, 1.5, rockT);
  } else {
    vec3 m1 = srgb(vec3(0.10, 0.20, 0.30)), m2 = srgb(vec3(0.22, 0.16, 0.38));
    vec3 moss = mix(m1, m2, smoothstep(0.3, 0.7, n1)) * (0.8 + n3 * 0.35);
    moss = mix(moss, srgb(vec3(0.10, 0.28, 0.30)), forest * 0.5);
    vec3 dirt = srgb(vec3(0.24, 0.22, 0.30)) * (0.85 + n3 * 0.25);
    vec3 rock = mix(srgb(vec3(0.52, 0.50, 0.62)), mix(srgb(vec3(0.45, 0.40, 0.62)), srgb(vec3(0.62, 0.58, 0.78)), strata), m.b) * (0.72 + n2 * 0.38);
    vec3 snow = srgb(vec3(0.82, 0.88, 1.0));
    vec3 sand = srgb(vec3(0.55, 0.55, 0.70));
    c = moss; c = mix(c, dirt, pathT); c = mix(c, sand, max(sandT, bedT)); c = mix(c, rock, rockT); c = mix(c, snow, snowT);
    // bioluminescent specks + crystal veins
    vec2 cell = floor(wp.xz * 1.3);
    float sp = hash12(cell);
    vec2 fpos = fract(wp.xz * 1.3) - 0.5 - (hash22(cell) - 0.5) * 0.6;
    float speck = step(0.93, sp) * (1.0 - smoothstep(0.03, 0.09, length(fpos))) * (1.0 - rockT) * (1.0 - snowT) * (1.0 - pathT);
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + sp * 40.0);
    e += mix(vec3(0.2, 0.9, 1.0), vec3(0.8, 0.4, 1.0), hash12(cell + 7.0)) * speck * 2.5 * tw;
    float vein = 1.0 - smoothstep(0.0, 0.035, cracks(wp.xz * 0.2 + vec2(wp.y * 0.05)));
    e += vec3(0.25, 0.75, 1.0) * vein * rockT * 0.9 * nearF;
    float glitter = step(0.985, hash12(floor(wp.xz * 9.0))) * snowT;
    e += vec3(0.7, 0.85, 1.0) * glitter * 2.0 * nearF;
    rough = mix(0.85, 0.4, max(rockT * 0.5, snowT));
    bump = mix(0.5, 1.2, rockT);
  }
  // wet look in rain
  float wet = uWet * (1.0 - snowT);
  c *= mix(1.0, 0.62, wet * (1.0 - rockT * 0.4));
  rough = mix(rough, 0.32, wet);
  s.albedo = c; s.emissive = e; s.rough = rough; s.bump = bump;
  return s;
}
vec3 tEmissive; float tRough; float tBump;
`;

const TERRAIN_FRAG_COLOR = /* glsl */ `
{
  vec2 muv = (vWPos.xz - uWorld.xy) * uWorld.w;
  vec4 m = texture2D(uMask, muv);
  vec3 wn = normalize(vWNrm);
  float n1 = fbm3(vWPos.xz * 0.018);
  float n2 = vnoise(vWPos.xz * 0.14);
  float n3 = vnoise(vWPos.xz * 1.1) * 0.6 + vnoise(vWPos.xz * 4.3) * 0.4;
  float k = epochOldMix(vWPos);
  Surf sN, sO;
  if (k < 0.999) sN = terrainSurf(uEpochNew, vWPos, wn, m, n1, n2, n3);
  if (k > 0.001) sO = terrainSurf(uEpochOld, vWPos, wn, m, n1, n2, n3);
  if (k <= 0.001) sO = sN; if (k >= 0.999) sN = sO;
  diffuseColor.rgb = mix(sN.albedo, sO.albedo, k);
  tEmissive = mix(sN.emissive, sO.emissive, k);
  tRough = mix(sN.rough, sO.rough, k);
  tBump = mix(sN.bump, sO.bump, k);
  float ring = epochRing(vWPos);
  tEmissive += mix(vec3(1.0, 0.75, 0.3), vec3(0.3, 0.8, 1.0), 0.5 + 0.5 * sin(vWPos.x * 0.05)) * ring * 3.5;
}
`;

const TERRAIN_FRAG_NORMAL = /* glsl */ `
{
  float dist = length(vWPos - cameraPosition);
  float fade = 1.0 - smoothstep(40.0, 140.0, dist);
  vec3 wn = normalize(vWNrm);
  if (fade > 0.01) {
    vec2 p = vWPos.xz;
    float e = 0.08;
    float s1 = 0.9, s2 = 4.5;
    float h0 = vnoise(p * s1) * 0.55 + vnoise(p * s2) * 0.22;
    float hx = vnoise((p + vec2(e, 0.0)) * s1) * 0.55 + vnoise((p + vec2(e, 0.0)) * s2) * 0.22;
    float hz = vnoise((p + vec2(0.0, e)) * s1) * 0.55 + vnoise((p + vec2(0.0, e)) * s2) * 0.22;
    vec3 g = vec3(hx - h0, 0.0, hz - h0) / e;
    wn = normalize(wn - g * 0.22 * tBump * fade);
  }
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}
`;
