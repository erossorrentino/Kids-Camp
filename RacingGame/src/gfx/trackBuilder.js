// Builds the full 3D venue for a Track: road surface (with painted lines,
// start/finish, grid boxes and rubbered-in racing line drawn in-shader),
// curbs, run-off, barriers (armco / sponsor walls / tyre stacks / catch
// fences), terrain + distant mountains, water, grandstands, pit building,
// start gantry with working lights, trees, rocks, buildings and night
// floodlighting.
import * as THREE from 'three';
import * as TX from './textures.js';
import { Noise, RNG, clamp, lerp, smoothstep } from '../core/rng.js';
import { DS } from '../sim/track.js';

export const SCENERY = {
  countryside: {
    ground: 'grass', slope: 'greyrock', hills: 26, hillScale: 420, mountains: 380, mountainTint: [0.55, 0.62, 0.62],
    trees: [['deciduous', 0.55], ['pine', 0.3], ['bush', 0.15]], treeCount: 3200, forest: 0.45, grandstands: 4, stands: true,
    groundTint: [1, 1, 1], rockCount: 0, wall: 'armco',
  },
  coastal: {
    ground: 'drygrass', near: 'pavement', slope: 'rock', hills: 30, hillScale: 300, mountains: 260, mountainTint: [0.62, 0.55, 0.5],
    trees: [['palm', 0.6], ['bush', 0.25], ['pine', 0.15]], treeCount: 1100, forest: 0.2, grandstands: 2, buildings: 'hotel', buildingCount: 160,
    sea: true, wall: 'concrete', rockCount: 30,
  },
  city: {
    ground: 'pavement', near: 'pavement', slope: 'greyrock', hills: 0, hillScale: 400, mountains: 120, mountainTint: [0.3, 0.32, 0.4],
    trees: [['deciduous', 0.7], ['bush', 0.3]], treeCount: 300, forest: 0.1, grandstands: 3, buildings: 'tower', buildingCount: 420,
    lamps: true, wall: 'concrete', rockCount: 0,
  },
  desert: {
    ground: 'sand', slope: 'rock', hills: 18, hillScale: 260, mountains: 340, mountainTint: [0.8, 0.5, 0.36],
    trees: [['cactus', 0.55], ['drybush', 0.45]], treeCount: 900, forest: 0.0, grandstands: 2, mesas: 16, wall: 'armco', rockCount: 220,
  },
  alpine: {
    ground: 'grass', slope: 'greyrock', hills: 70, hillScale: 380, mountains: 900, mountainTint: [0.55, 0.6, 0.68], snowCaps: 260,
    trees: [['pine', 0.85], ['deciduous', 0.15]], treeCount: 4200, forest: 0.7, grandstands: 2, wall: 'armco', rockCount: 120,
  },
  oval: {
    ground: 'drygrass', slope: 'dirt', hills: 6, hillScale: 600, mountains: 160, mountainTint: [0.6, 0.6, 0.62],
    trees: [['deciduous', 0.7], ['bush', 0.3]], treeCount: 700, forest: 0.15, grandstands: 0, ovalStands: true, wall: 'concrete', rockCount: 0,
  },
  sakura: {
    ground: 'grass', slope: 'greyrock', hills: 30, hillScale: 340, mountains: 420, mountainTint: [0.55, 0.58, 0.7],
    trees: [['blossom', 0.6], ['deciduous', 0.2], ['pine', 0.2]], treeCount: 2800, forest: 0.4, grandstands: 3, wall: 'armco', rockCount: 40,
  },
  snow: {
    ground: 'snow', slope: 'greyrock', hills: 50, hillScale: 360, mountains: 1000, mountainTint: [0.85, 0.88, 0.95], snowCaps: 0, allSnow: true,
    trees: [['snowpine', 0.9], ['pine', 0.1]], treeCount: 3000, forest: 0.6, grandstands: 2, wall: 'armco', rockCount: 120,
  },
};

// ---------------------------------------------------------------------------
// Shared shader snippets
// ---------------------------------------------------------------------------
const NOISE_GLSL = /* glsl */`
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
`;

function patchMaterial(mat, key, fn) {
  mat.onBeforeCompile = (shader) => { fn(shader); mat.userData.shader = shader; };
  mat.customProgramCacheKey = () => key;
  return mat;
}

function cloneTex(t, repeat) {
  const c = t.clone();
  c.needsUpdate = true;
  c.repeat.set(repeat, repeat);
  return c;
}

// ---------------------------------------------------------------------------
// Geometry batching helper: accumulate triangles per material
// ---------------------------------------------------------------------------
class Batch {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.idx = []; this.extra = {}; this.n = 0; }
  addGeometry(g, matrix) {
    const gg = g.index ? g : g;
    const p = gg.attributes.position, nn = gg.attributes.normal, u = gg.attributes.uv;
    const v = new THREE.Vector3(), nm = new THREE.Matrix3();
    if (matrix) nm.getNormalMatrix(matrix);
    const base = this.n;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); if (matrix) v.applyMatrix4(matrix);
      this.pos.push(v.x, v.y, v.z);
      if (nn) { v.fromBufferAttribute(nn, i); if (matrix) v.applyMatrix3(nm).normalize(); this.nor.push(v.x, v.y, v.z); } else this.nor.push(0, 1, 0);
      if (u) this.uv.push(u.getX(i), u.getY(i)); else this.uv.push(0, 0);
    }
    if (gg.index) for (const i of gg.index.array) this.idx.push(base + i);
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    this.n += p.count;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    for (const k in this.extra) g.setAttribute(k, new THREE.Float32BufferAttribute(this.extra[k].data, this.extra[k].size));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    return g;
  }
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------
export function buildTrackScene(track, env, quality, opts = {}) {
  const def = track.def;
  const SC = { ...SCENERY[def.scenery || 'countryside'], ...(def.sceneryOverrides || {}) };
  const group = new THREE.Group();
  group.name = 'track';
  const disposables = [];
  const rng = new RNG(def.id.length * 1013 + 7);
  const noise = new Noise(def.id.length * 31 + 5);
  const night = !!env.preset.night;
  const N = track.N, L = track.length;
  const uniforms = {
    uTime: { value: 0 },
    uLamp: { value: night ? 1 : 0 },
    uLampColor: { value: new THREE.Color(1.0, 0.9, 0.78).multiplyScalar(3.2) },
    uWet: { value: env.preset.rain ? 1 : 0 },
    uMacro: { value: TX.macroNoise() },
    uTrackLen: { value: L },
  };
  const scenery = quality.scenery ?? 1;
  const reg = (m) => { disposables.push(m); return m; };
  const addMesh = (geo, mat, { cast = false, receive = true, name = '' } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast && quality.shadows > 0;
    m.receiveShadow = receive && quality.shadows > 0;
    m.name = name;
    group.add(m);
    disposables.push(geo);
    return m;
  };

  // ---- lamp pools + macro variation shader chunk for ribbon materials
  const lampChunk = /* glsl */`
    #ifdef USE_LAMPS
    {
      float sp = 38.0;
      float sl = vRoad.y;
      float k0 = floor(sl / sp + 0.5);
      float a0 = sl - k0 * sp;
      float k1 = floor((sl - 0.5 * sp) / sp + 0.5);
      float a1 = sl - (k1 + 0.5) * sp;
      float off = vRoad.z + 3.5;
      float dl = vRoad.x - off, dr = vRoad.x + off;
      float pool = exp(-(a0 * a0 + dl * dl * 0.7) / 380.0) + exp(-(a1 * a1 + dr * dr * 0.7) / 380.0);
      pool = pool * 0.85 + 0.12;
      reflectedLight.directDiffuse += BRDF_Lambert(diffuseColor.rgb) * uLampColor * pool * uLamp;
      reflectedLight.directSpecular += uLampColor * pool * uLamp * 0.06 * (1.0 - roughnessFactor);
    }
    #endif`;

  function ribbonMaterial(kind, { lines = false, tile = 6, color = 0xffffff, rough = null, lampable = true, extraKey = '' } = {}) {
    const mow = kind === 'grass' || kind === 'drygrass';
    let maps;
    if (kind === 'asphalt') maps = TX.asphaltTextures();
    else maps = TX.groundTextures(kind);
    const m = new THREE.MeshStandardMaterial({
      color, map: cloneTex(maps.map, 1 / tile), normalMap: cloneTex(maps.normalMap, 1 / tile),
      roughness: rough ?? maps.roughness ?? 0.9, metalness: 0,
    });
    if (maps.roughnessMap) { m.roughnessMap = cloneTex(maps.roughnessMap, 1 / tile); m.roughness = 1; }
    m.normalScale.set(0.8, 0.8);
    disposables.push(m, m.map, m.normalMap, m.roughnessMap);
    if (lampable && night) m.defines = { USE_LAMPS: '' };
    return patchMaterial(m, `ribbon_${kind}_${lines}_${night}_${extraKey}_${mow}`, (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = 'attribute vec3 road;\nattribute float rubber;\nvarying vec3 vRoad;\nvarying float vRubber;\n' +
        shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoad = road; vRubber = rubber;');
      shader.fragmentShader = 'uniform float uLamp; uniform vec3 uLampColor; uniform float uWet; uniform sampler2D uMacro; uniform float uTrackLen;\nvarying vec3 vRoad;\nvarying float vRubber;\n' + NOISE_GLSL +
        shader.fragmentShader
          .replace('#include <map_fragment>', `#include <map_fragment>
            {
              vec3 mac = texture2D(uMacro, vRoad.xy / 70.0).rgb;
              vec3 mac2 = texture2D(uMacro, vRoad.xy / 13.0 + 0.37).rgb;
              diffuseColor.rgb *= 0.86 + mac.r * 0.22 + (mac2.g - 0.5) * 0.12;
              ${mow ? 'diffuseColor.rgb *= 0.93 + 0.12 * smoothstep(-0.15, 0.15, sin(vRoad.y * 0.4363));' : ''}
              ${lines ? `
              float d = vRoad.x, s = vRoad.y, hw = vRoad.z;
              float ad = abs(d);
              // rubbered racing line + tyre marks
              float marks = vRubber * smoothstep(0.55, 0.8, vn(vec2(d * 3.0, s * 0.04))) * 0.6;
              diffuseColor.rgb *= 1.0 - vRubber * 0.32 - marks * 0.25;
              // painted edge lines
              float edge = smoothstep(hw - 0.62, hw - 0.58, ad) * (1.0 - smoothstep(hw - 0.3, hw - 0.26, ad));
              float paint = edge;
              // start / finish: checkered band + solid line
              float sw = s < 6.0 ? s : s - uTrackLen;
              if (abs(sw) < 1.6) {
                vec2 c = floor(vec2(d, sw) / 0.8);
                float chk = mod(c.x + c.y, 2.0);
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(chk > 0.5 ? 0.85 : 0.04), 0.92 * step(ad, hw - 0.3));
              }
              // grid boxes
              float back = uTrackLen - s;
              if (back > 4.0 && back < 210.0) {
                float k = floor((back - 10.0 + 4.0) / 8.0);
                if (k >= 0.0) {
                  float slotBack = 10.0 + k * 8.0;
                  float side = mod(k, 2.0) < 0.5 ? 1.0 : -1.0;
                  float dc = side * min(3.2, hw - 2.2);
                  float frontLine = slotBack - 2.7;
                  float inX = step(abs(d - dc), 1.25);
                  float fl = (1.0 - smoothstep(0.08, 0.12, abs(back - frontLine))) * inX;
                  float sideL = (1.0 - smoothstep(0.06, 0.1, abs(abs(d - dc) - 1.2))) * step(frontLine, back) * step(back, frontLine + 1.4);
                  paint = max(paint, max(fl, sideL));
                }
              }
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86), paint * 0.95);
              ` : ''}
              // wet track: darker
              diffuseColor.rgb *= 1.0 - uWet * 0.35;
            }`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
            ${lines ? 'roughnessFactor *= 1.0 - vRubber * 0.12;' : ''}
            {
              float puddle = smoothstep(0.55, 0.7, texture2D(uMacro, vRoad.xy / 40.0).g);
              roughnessFactor = mix(roughnessFactor, mix(0.32, 0.05, puddle), uWet);
            }`)
          .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + lampChunk);
    });
  }

  // ---------------------------------------------------------------------------
  // Ribbon strips
  // ---------------------------------------------------------------------------
  // runs: list of [i0, count] (count rows, wrapping). lat(i) -> [d0, d1]
  function stripGeometry(runs, lat, nLat, { yOff = () => 0, rubberFn = null, skirt = 0, vergeEnd = null } = {}) {
    const pos = [], uv = [], road = [], rub = [], idx = [];
    let base = 0;
    for (const [i0, count] of runs) {
      const rowsN = count;
      const cols = nLat + 1 + (skirt ? 1 : 0);
      for (let r = 0; r < rowsN; r++) {
        const ii = i0 + r;
        const i = ((ii % N) + N) % N;
        const s = ii * DS;
        const [d0, d1] = lat(i);
        for (let c = 0; c <= nLat; c++) {
          const d = d0 + ((d1 - d0) * c) / nLat;
          let y = track.heightAt(i, 0, d) + yOff(i, d, c / nLat);
          if (vergeEnd && c === nLat) y = vergeEnd(i, d);
          pos.push(track.x[i] + track.lx[i] * d, y, track.z[i] + track.lz[i] * d);
          uv.push(d, s);
          road.push(d, s, track.hw[i]);
          rub.push(rubberFn ? rubberFn(i, d) : 0);
        }
        if (skirt) {
          const d = d1;
          const y = (vergeEnd ? vergeEnd(i, d) : track.heightAt(i, 0, d)) - skirt;
          pos.push(track.x[i] + track.lx[i] * d, y, track.z[i] + track.lz[i] * d);
          uv.push(d + (d > 0 ? skirt : -skirt), s);
          road.push(d, s, track.hw[i]);
          rub.push(0);
        }
      }
      for (let r = 0; r < rowsN - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const a = base + r * cols + c, b = base + (r + 1) * cols + c;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
      base += rowsN * cols;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('road', new THREE.Float32BufferAttribute(road, 3));
    g.setAttribute('rubber', new THREE.Float32BufferAttribute(rub, 1));
    g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.computeVertexNormals();
    // ensure normals point up (winding may be flipped depending on side)
    const nrm = g.attributes.normal;
    let up = 0;
    for (let i = 0; i < nrm.count; i += 7) up += nrm.getY(i);
    if (up < 0) {
      const ia = g.index.array;
      for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; }
      g.computeVertexNormals();
    }
    return g;
  }

  // contiguous runs of samples where pred(i) is true (wrapping); returns [[i0, count]]
  function runsWhere(pred) {
    const runs = [];
    let start = -1;
    for (let i = 0; i < N; i++) {
      if (pred(i)) { if (start < 0) start = i; }
      else if (start >= 0) { runs.push([start, i - start + 1]); start = -1; }
    }
    if (start >= 0) runs.push([start, N - start + 1]);
    // merge wrap-around
    if (runs.length > 1 && runs[0][0] === 0 && pred(N - 1)) {
      const last = runs.pop();
      runs[0] = [last[0], last[1] + runs[0][1] - 1];
    }
    if (runs.length === 1 && runs[0][1] >= N) return [[0, N + 1]];
    return runs;
  }

  // ---- asphalt
  const rubberFn = (i, d) => {
    const rl = track.raceLine[i];
    const x = (d - rl) / 2.2;
    return Math.exp(-x * x) * 0.9;
  };
  const asphaltMat = ribbonMaterial('asphalt', { lines: true, tile: 5, color: 0xffffff });
  addMesh(stripGeometry([[0, N + 1]], (i) => [-track.hw[i], track.hw[i]], 16, { rubberFn }), asphaltMat, { name: 'asphalt' });

  // ---- run-off surfaces by type (left and right)
  const runoffKinds = new Set([...track.runL, ...track.runR]);
  const runoffMat = {};
  for (const k of runoffKinds) {
    const tex = k === 'tarmac' ? 'asphalt' : k;
    runoffMat[k] = ribbonMaterial(tex, { tile: k === 'gravel' ? 3 : 6, color: k === 'tarmac' ? 0xb8b8b8 : 0xffffff, extraKey: k });
  }
  for (const side of [1, -1]) {
    const runArr = side > 0 ? track.runL : track.runR;
    const barr = side > 0 ? track.barrierL : track.barrierR;
    for (const k of runoffKinds) {
      const runs = runsWhere((i) => runArr[i] === k);
      if (!runs.length) continue;
      const g = stripGeometry(runs, (i) => side > 0 ? [track.hw[i] - 0.05, barr[i] + 0.3] : [-barr[i] - 0.3, -track.hw[i] + 0.05], 5, { yOff: () => -0.012 });
      addMesh(g, runoffMat[k], { name: 'runoff_' + k });
    }
  }
  // runoff tarmac stripes (blue/white painted borders on asphalt run-off) skipped for clarity

  // ---- curbs
  const curbMat = reg(new THREE.MeshStandardMaterial({ map: cloneTex(TX.curbTexture(def.curbColors?.[0] || '#d01818', def.curbColors?.[1] || '#f0f0f0'), 1), roughness: 0.55, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  curbMat.map.repeat.set(1, 1 / 6);
  if (night) curbMat.defines = { USE_LAMPS: '' };
  patchMaterial(curbMat, 'curb' + night, (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'attribute vec3 road;\nvarying vec3 vRoad;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoad = road;');
    shader.fragmentShader = 'uniform float uLamp; uniform vec3 uLampColor;\nvarying vec3 vRoad;\n' + shader.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + lampChunk);
  });
  const cw = track.curbW;
  for (const side of [1, -1]) {
    const flags = side > 0 ? track.curbL : track.curbR;
    const runs = runsWhere((i) => flags[i] === 1);
    if (!runs.length) continue;
    const g = stripGeometry(runs, (i) => side > 0 ? [track.hw[i] - 0.02, track.hw[i] + cw] : [-track.hw[i] - cw, -track.hw[i] + 0.02], 4,
      { yOff: (i, d, f) => { const t = side > 0 ? f : 1 - f; return 0.012 + Math.sin(Math.min(1, t * 1.25) * Math.PI) * 0.045; } });
    // curb uv: u across, v along metres (texture repeats every 6m)
    const uvA = g.attributes.uv, roadA = g.attributes.road;
    for (let i = 0; i < uvA.count; i++) uvA.setXY(i, (Math.abs(roadA.getX(i)) - track.hw[0]) / cw, roadA.getY(i));
    addMesh(g, curbMat, { name: 'curb' });
  }

  // ---------------------------------------------------------------------------
  // Terrain: distance field from the track, natural hills, far mountains
  // ---------------------------------------------------------------------------
  const B = track.bounds;
  const margin = 650;
  const cell = quality.carDetail >= 2 ? 6 : quality.carDetail === 1 ? 8 : 11;
  const tx0 = B.minx - margin, tz0 = B.minz - margin;
  const nx = Math.ceil((B.maxx - B.minx + margin * 2) / cell) + 1;
  const nz = Math.ceil((B.maxz - B.minz + margin * 2) / cell) + 1;
  const distF = new Float32Array(nx * nz).fill(1e9);
  const nearI = new Int32Array(nx * nz).fill(-1);
  const RMAX = 180;
  for (let i = 0; i < N; i++) {
    const cx = (track.x[i] - tx0) / cell, cz = (track.z[i] - tz0) / cell;
    const r = Math.ceil(RMAX / cell);
    const ix0 = Math.max(0, Math.floor(cx - r)), ix1 = Math.min(nx - 1, Math.ceil(cx + r));
    const iz0 = Math.max(0, Math.floor(cz - r)), iz1 = Math.min(nz - 1, Math.ceil(cz + r));
    for (let gz = iz0; gz <= iz1; gz++) for (let gx = ix0; gx <= ix1; gx++) {
      const wx = tx0 + gx * cell, wz = tz0 + gz * cell;
      const d = Math.hypot(wx - track.x[i], wz - track.z[i]);
      const k = gz * nx + gx;
      if (d < distF[k]) { distF[k] = d; nearI[k] = i; }
    }
  }
  const seaDir = def.seaDir ? new THREE.Vector2(...def.seaDir).normalize() : new THREE.Vector2(-1, 0.2).normalize();
  const hillsAt = (x, z) => {
    const h = noise.fbm(x / SC.hillScale, z / SC.hillScale, 4) * SC.hills;
    return h;
  };
  const centerX = B.cx, centerZ = B.cz;
  const trackRadius = Math.max(B.maxx - B.minx, B.maxz - B.minz) / 2;
  const mountainsAt = (x, z) => {
    const r = Math.hypot(x - centerX, z - centerZ);
    const w = smoothstep(trackRadius + 500, trackRadius + 2600, r);
    if (w <= 0) return 0;
    const m = noise.ridged(x / 1800 + 11, z / 1800 - 7, 5);
    return Math.pow(m, 1.6) * SC.mountains * w * 1.6;
  };
  const seaAt = (x, z) => {
    if (!SC.sea) return 0;
    const v = (x - centerX) * seaDir.x + (z - centerZ) * seaDir.y;
    return smoothstep(trackRadius * 0.25, trackRadius * 0.25 + 200, v);
  };
  // natural height used by terrain everywhere
  const naturalH = (x, z, base, dist, edge) => {
    const away = smoothstep(edge, edge + 160, dist);
    let h = base + hillsAt(x, z) * away + mountainsAt(x, z);
    const sea = seaAt(x, z) * smoothstep(edge, edge + 30, dist);
    h = lerp(h, -14, sea);
    return h;
  };
  const terrH = new Float32Array(nx * nz);
  const avgY = B.avgY;
  for (let gz = 0; gz < nz; gz++) for (let gx = 0; gx < nx; gx++) {
    const k = gz * nx + gx, wx = tx0 + gx * cell, wz = tz0 + gz * cell;
    const i = nearI[k];
    let h;
    if (i >= 0) {
      const dist = distF[k];
      // side & edge of the ribbon at this sample
      const lat = (wx - track.x[i]) * track.lx[i] + (wz - track.z[i]) * track.lz[i];
      const barr = lat > 0 ? track.barrierL[i] : track.barrierR[i];
      const verge = lat > 0 ? track.vergeL[i] : track.vergeR[i];
      const edge = barr + verge;
      const trackBase = track.heightAt(i, 0, Math.sign(lat) * Math.min(Math.abs(lat), barr));
      const base = lerp(trackBase - Math.max(0, dist - barr) * 0.03, avgY, smoothstep(edge + 60, RMAX, dist));
      h = naturalH(wx, wz, base, dist, edge);
      // sink below the ribbon so it never pokes through
      const sink = dist < barr + 0.5 ? 1.6 : dist < edge ? lerp(1.6, 0.45, (dist - barr) / Math.max(1, verge)) : lerp(0.45, 0, smoothstep(edge, edge + 10, dist));
      h -= sink;
    } else {
      h = naturalH(wx, wz, avgY, 1e4, 0);
    }
    terrH[k] = h;
  }
  const terrainHeight = (x, z) => {
    const fx = (x - tx0) / cell, fz = (z - tz0) / cell;
    const ix = clamp(Math.floor(fx), 0, nx - 2), iz = clamp(Math.floor(fz), 0, nz - 2);
    const tx = clamp(fx - ix, 0, 1), tz = clamp(fz - iz, 0, 1);
    const a = terrH[iz * nx + ix], b = terrH[iz * nx + ix + 1], c = terrH[(iz + 1) * nx + ix], d = terrH[(iz + 1) * nx + ix + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  };
  const distAt = (x, z) => {
    const ix = clamp(Math.round((x - tx0) / cell), 0, nx - 1), iz = clamp(Math.round((z - tz0) / cell), 0, nz - 1);
    return { d: distF[iz * nx + ix], i: nearI[iz * nx + ix] };
  };

  // terrain material: world-space UVs, two scales + macro tint + slope rock + snow caps
  function terrainMaterial(groundKind, slopeKind) {
    const g = TX.groundTextures(groundKind), r = TX.groundTextures(slopeKind);
    const m = new THREE.MeshStandardMaterial({ map: cloneTex(g.map, 1), normalMap: cloneTex(g.normalMap, 1), roughness: g.roughness, metalness: 0 });
    m.normalScale.set(0.7, 0.7);
    const rockMap = cloneTex(r.map, 1);
    disposables.push(m, m.map, m.normalMap, rockMap);
    const snowCaps = SC.snowCaps || 0;
    const allSnow = SC.allSnow ? 1 : 0;
    const snowTex = cloneTex(TX.groundTextures('snow').map, 1);
    disposables.push(snowTex);
    return patchMaterial(m, 'terrain_' + groundKind + slopeKind + snowCaps, (shader) => {
      Object.assign(shader.uniforms, uniforms, { uRock: { value: rockMap }, uSnow: { value: snowTex } });
      shader.vertexShader = 'varying vec3 vWPos;\nvarying vec3 vWNorm;\n' + shader.vertexShader
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNorm = normalize(mat3(modelMatrix) * objectNormal);');
      shader.fragmentShader = 'uniform sampler2D uMacro; uniform sampler2D uRock; uniform sampler2D uSnow;\nvarying vec3 vWPos;\nvarying vec3 vWNorm;\n' + shader.fragmentShader
        .replace('#include <map_fragment>', `
          vec2 wuv = vWPos.xz;
          vec3 g1 = texture2D(map, wuv / 7.0).rgb;
          vec3 g2 = texture2D(map, wuv / 31.0 + 0.3).rgb;
          vec3 gcol = mix(g1, g2, 0.45);
          vec3 mac = texture2D(uMacro, wuv / 420.0).rgb;
          vec3 mac2 = texture2D(uMacro, wuv / 90.0).rgb;
          gcol *= 0.78 + mac.r * 0.38;
          gcol = mix(gcol, gcol * vec3(1.08, 1.02, 0.82), smoothstep(0.45, 0.75, mac2.g) * 0.6);
          vec3 rock = mix(texture2D(uRock, wuv / 23.0).rgb, texture2D(uRock, wuv / 97.0).rgb, 0.5);
          float slope = 1.0 - clamp(vWNorm.y, 0.0, 1.0);
          float rk = smoothstep(0.22, 0.42, slope + (mac2.b - 0.5) * 0.15);
          vec3 col = mix(gcol, rock, rk);
          ${snowCaps > 0 ? `float sn = smoothstep(${snowCaps.toFixed(1)}, ${(snowCaps + 120).toFixed(1)}, vWPos.y + mac.g * 80.0) * (1.0 - smoothstep(0.55, 0.75, slope));
          col = mix(col, texture2D(uSnow, wuv / 17.0).rgb, sn);` : ''}
          ${allSnow ? `col = mix(col, texture2D(uSnow, wuv / 17.0).rgb, (1.0 - rk * 0.75));` : ''}
          diffuseColor.rgb *= col;`)
        .replace('#include <normal_fragment_maps>', `
          #ifdef USE_NORMALMAP_TANGENTSPACE
            vec3 mapN = texture2D(normalMap, vWPos.xz / 7.0).xyz * 2.0 - 1.0;
            mapN.xy *= normalScale;
            normal = normalize(tbn * mapN);
          #endif`);
    });
  }
  const terrainMat = terrainMaterial(SC.ground, SC.slope);
  {
    const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
    for (let gz = 0; gz < nz; gz++) for (let gx = 0; gx < nx; gx++) {
      const k = gz * nx + gx;
      pos[k * 3] = tx0 + gx * cell; pos[k * 3 + 1] = terrH[k]; pos[k * 3 + 2] = tz0 + gz * cell;
      uv[k * 2] = pos[k * 3]; uv[k * 2 + 1] = pos[k * 3 + 2];
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let q = 0;
    for (let gz = 0; gz < nz - 1; gz++) for (let gx = 0; gx < nx - 1; gx++) {
      const a = gz * nx + gx, b = a + 1, c = a + nx, d = c + 1;
      idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    addMesh(g, terrainMat, { name: 'terrain' });
  }
  // far terrain: big coarse grid with a hole where the near grid is
  {
    const ext = 26000, fc = 260;
    const fn = Math.round(ext / fc);
    const fx0 = centerX - ext / 2, fz0 = centerZ - ext / 2;
    const pos = [], idx = [];
    for (let gz = 0; gz <= fn; gz++) for (let gx = 0; gx <= fn; gx++) {
      const x = fx0 + gx * fc, z = fz0 + gz * fc;
      const inside = x > tx0 + cell * 2 && x < tx0 + (nx - 3) * cell && z > tz0 + cell * 2 && z < tz0 + (nz - 3) * cell;
      let h = naturalH(x, z, avgY, 1e4, 0);
      if (inside) h -= 30;
      pos.push(x, h, z);
    }
    for (let gz = 0; gz < fn; gz++) for (let gx = 0; gx < fn; gx++) {
      const x = fx0 + gx * fc, z = fz0 + gz * fc;
      const fullyInside = x > tx0 + fc && x + fc < tx0 + (nx - 1) * cell - fc && z > tz0 + fc && z + fc < tz0 + (nz - 1) * cell - fc;
      if (fullyInside) continue;
      const a = gz * (fn + 1) + gx, b = a + 1, c = a + fn + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const farMat = terrainMat; // same look; fog does the rest
    const uvs = new Float32Array((fn + 1) * (fn + 1) * 2);
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    const far = addMesh(g, farMat, { receive: false, name: 'farTerrain' });
    far.renderOrder = -1;
  }

  // ---- outer verge (beyond barriers) with skirt, blends into terrain
  const vergeMat = ribbonMaterial(SC.near && SC.near !== SC.ground ? SC.near : SC.ground, { tile: 7, extraKey: 'verge' });
  for (const side of [1, -1]) {
    const barr = side > 0 ? track.barrierL : track.barrierR;
    const verge = side > 0 ? track.vergeL : track.vergeR;
    const runs = runsWhere((i) => verge[i] > 0.5);
    if (!runs.length) continue;
    const g = stripGeometry(runs, (i) => side > 0 ? [barr[i] + 0.1, barr[i] + verge[i]] : [-barr[i] - verge[i], -barr[i] - 0.1], 3, {
      yOff: (i, d, f) => -0.02 - f * 0.12,
      skirt: 2.5,
    });
    addMesh(g, vergeMat, { name: 'verge' });
  }

  // ---------------------------------------------------------------------------
  // Barriers
  // ---------------------------------------------------------------------------
  // Sweep a cross-section along one side. edges: [[dd0,y0],[dd1,y1]] in metres
  // (dd measured outward from the barrier line). Each edge becomes its own
  // strip so creases stay sharp.
  function sweep(batch, side, runs, distArr, edges, { segLen = 0, uvV = null, atlasRows = 0, rowFn = null, vScale = 1, uScale = 1 } = {}) {
    for (const [i0, count] of runs) {
      for (const [p0, p1, vRange] of edges) {
        const pos = [], uv = [], idx = [];
        let r = 0;
        let segStart = 0, row = rowFn ? rowFn(i0) : 0;
        const pushRow = (ii, sAlong, rowSel) => {
          const i = ((ii % N) + N) % N;
          const bd = distArr[i];
          for (const [k, p] of [[0, p0], [1, p1]]) {
            const d = side * (bd + p[0]);
            const y = track.heightAt(i, 0, side * bd) + p[1];
            pos.push(track.x[i] + track.lx[i] * d, y, track.z[i] + track.lz[i] * d);
            let v = vRange ? lerp(vRange[0], vRange[1], k) : k;
            let u = sAlong * uScale;
            if (atlasRows) { v = (rowSel + (1 - v)) / atlasRows; if (side < 0) u = 1 - u; uv.push(u, 1 - v); }
            else uv.push(side < 0 ? -u : u, v * vScale);
          }
        };
        for (let rr = 0; rr < count; rr++) {
          const ii = i0 + rr;
          if (segLen && rr > 0 && rr % segLen === 0) {
            // close current segment, start a new one with a new atlas row
            pushRow(ii, (rr - segStart) * DS / (segLen * DS), row);
            const n = pos.length / 3;
            for (let q = r; q < n / 2 - 1; q++) { const a = q * 2; idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); }
            r = n / 2;
            segStart = rr;
            row = rowFn ? rowFn(ii) : row;
          }
          pushRow(ii, segLen ? (rr - segStart) * DS / (segLen * DS) : ii * DS, row);
        }
        const n = pos.length / 3;
        for (let q = r; q < n / 2 - 1; q++) { const a = q * 2; idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setIndex(idx);
        g.computeVertexNormals();
        // orient normals toward the track for side faces / up for tops
        const nrm = g.attributes.normal;
        const midI = ((i0 + (count >> 1)) % N + N) % N;
        const tl = new THREE.Vector3(track.lx[midI] * -side, 0, track.lz[midI] * -side);
        const ex = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], 0);
        // expected normal in (outward, up) plane: rotate edge 90deg
        const expOut = -(p1[1] - p0[1]), expUp = (p1[0] - p0[0]);
        const expected = new THREE.Vector3(track.lx[midI] * side * expOut, expUp, track.lz[midI] * side * expOut);
        let dot = 0;
        for (let i = 0; i < nrm.count; i += 5) dot += nrm.getX(i) * expected.x + nrm.getY(i) * expected.y + nrm.getZ(i) * expected.z;
        if (dot < 0) {
          const ia = g.index.array;
          for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; }
          g.computeVertexNormals();
        }
        void tl; void ex;
        batch.addGeometry(g);
        g.dispose();
      }
    }
  }

  const wallBatch = new Batch(), wallTopBatch = new Batch(), adBatch = new Batch(), armcoBatch = new Batch();
  const sponsorRows = TX.SPONSORS.length;
  const postsM = [];
  const tyreM = [];
  const fenceBatch = new Batch();
  const isStreet = track.type === 'street';
  const isOval = track.type === 'oval';
  for (const side of [1, -1]) {
    const barr = side > 0 ? track.barrierL : track.barrierR;
    const all = [[0, N + 1]];
    const useWall = isStreet || isOval || SC.wall === 'concrete';
    if (useWall) {
      // concrete wall with sponsor boards on the track face
      sweep(adBatch, side, all, barr, [[[0, 0.05], [0, 1.15]]], { segLen: 12, atlasRows: sponsorRows, rowFn: () => rng.int(0, sponsorRows - 1) });
      sweep(wallTopBatch, side, all, barr, [[[0, 1.15], [0.45, 1.15]]]);
      sweep(wallBatch, side, all, barr, [[[0.45, 1.15], [0.45, -0.6]], [[0, 0.05], [0, -0.4]]]);
      // catch fence on top
      if (quality.scenery >= 0.6) {
        sweep(fenceBatch, side, all, barr, [[[0.25, 1.15], [0.6, 4.2]]], { uScale: 0.5, vScale: 1.5 });
        for (let i = 0; i < N; i += 4) postsM.push([i, side, barr[i] + 0.3, 1.1, 3.3]);
      }
    } else {
      // armco: two rails + posts; tyre walls on corner outsides
      sweep(armcoBatch, side, all, barr, [[[0, 0.42], [0, 0.78]], [[0, 0.78], [0.12, 0.8]]], { uScale: 0.25 });
      for (let i = 0; i < N; i += 2) postsM.push([i, side, barr[i] + 0.12, 0.0, 0.82]);
      // tyre stacks where the corner is tight and this is the outside
      for (let i = 0; i < N; i++) {
        const kap = track.kappa[i];
        const outside = (kap < 0 && side > 0) || (kap > 0 && side < 0);
        if (outside && Math.abs(kap) > 1 / 110 && i % 1 === 0) tyreM.push([i, side, barr[i] - 0.45]);
      }
      // sponsor boards behind armco on straights
      const boards = runsWhere((i) => Math.abs(track.kappa[i]) < 1 / 600 && (i % 60) < 30);
      sweep(adBatch, side, boards, barr, [[[1.2, 0.3], [1.2, 1.5]]], { segLen: 12, atlasRows: sponsorRows, rowFn: () => rng.int(0, sponsorRows - 1) });
    }
  }
  const concreteMat = reg(new THREE.MeshStandardMaterial({ color: 0xbfbfbb, roughness: 0.85, metalness: 0, map: cloneTex(TX.groundTextures('pavement').map, 0.25) }));
  disposables.push(concreteMat.map);
  const adMat = reg(new THREE.MeshStandardMaterial({ map: TX.sponsorAtlas(), roughness: 0.55, metalness: 0, emissive: 0xffffff, emissiveMap: TX.sponsorAtlas(), emissiveIntensity: night ? 0.55 : 0.0 }));
  const armcoMat = reg(new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.28, metalness: 0.9 }));
  const fenceMat = reg(new THREE.MeshStandardMaterial({ map: cloneTex(TX.fenceTexture(), 1), alphaTest: 0.4, transparent: false, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6, color: 0xcfd4d8 }));
  fenceMat.map.repeat.set(1, 1);
  disposables.push(fenceMat.map);
  if (wallBatch.n) addMesh(wallBatch.build(), concreteMat, { cast: true, name: 'wall' });
  if (wallTopBatch.n) addMesh(wallTopBatch.build(), concreteMat, { name: 'walltop' });
  if (adBatch.n) addMesh(adBatch.build(), adMat, { cast: true, name: 'ads' });
  if (armcoBatch.n) addMesh(armcoBatch.build(), armcoMat, { cast: true, name: 'armco' });
  if (fenceBatch.n) {
    const fg = fenceBatch.build();
    // world-scaled UVs for the mesh pattern
    const uvA = fg.attributes.uv;
    for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * 4, uvA.getY(i) * 6);
    addMesh(fg, fenceMat, { name: 'fence' });
  }
  // posts (instanced)
  if (postsM.length) {
    const pg = new THREE.BoxGeometry(0.1, 1, 0.1);
    pg.translate(0, 0.5, 0);
    const pm = new THREE.InstancedMesh(pg, armcoMat, postsM.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    postsM.forEach(([i, side, d, y0, h], k) => {
      const dd = side * d;
      p.set(track.x[i] + track.lx[i] * dd, track.heightAt(i, 0, side * (d - 0.12)) + y0, track.z[i] + track.lz[i] * dd);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), track.heading[i]);
      sc.set(1, h, 1);
      m4.compose(p, q, sc);
      pm.setMatrixAt(k, m4);
    });
    pm.castShadow = quality.shadows > 1;
    pm.receiveShadow = true;
    group.add(pm);
    disposables.push(pg);
  }
  // tyre walls (instanced, 3 high x 2 deep)
  if (tyreM.length) {
    const tg = new THREE.CylinderGeometry(0.32, 0.32, 0.26, 14, 1, false);
    const tm = reg(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }));
    const count = tyreM.length * 6;
    const im = new THREE.InstancedMesh(tg, tm, count);
    const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1);
    const cols = [new THREE.Color(0x111111), new THREE.Color(0xd8d8d8), new THREE.Color(0xc41010), new THREE.Color(0x1a3fb0)];
    let k = 0;
    tyreM.forEach(([i, side, d]) => {
      const band = Math.floor(i / 3) % 2;
      for (let row = 0; row < 2; row++) for (let lev = 0; lev < 3; lev++) {
        const dd = side * (d - row * 0.62);
        p.set(track.x[i] + track.lx[i] * dd, track.heightAt(i, 0, side * d) + 0.13 + lev * 0.26, track.z[i] + track.lz[i] * dd);
        m4.compose(p, q, s1);
        im.setMatrixAt(k, m4);
        im.setColorAt(k, lev === 2 && row === 0 ? cols[band ? 2 : 1] : cols[0]);
        k++;
      }
    });
    im.castShadow = quality.shadows > 0;
    im.receiveShadow = true;
    group.add(im);
    disposables.push(tg);
  }

  // ---------------------------------------------------------------------------
  // Structures: start gantry + lights, pit building, grandstands, bridge
  // ---------------------------------------------------------------------------
  const startLights = [];
  {
    const f = track.frameAt(0);
    const gw = Math.max(track.barrierL[0], track.barrierR[0]);
    const gantry = new THREE.Group();
    gantry.position.set(f.x, f.y, f.z);
    gantry.rotation.y = f.heading;
    const steel = reg(new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.4, metalness: 0.8 }));
    for (const s of [-1, 1]) {
      const d = s * (s > 0 ? track.barrierL[0] + 0.8 : track.barrierR[0] + 0.8);
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.6, 9, 0.6), steel);
      col.position.set(d, 4.5, 0);
      col.castShadow = true;
      gantry.add(col);
    }
    const beamW = track.barrierL[0] + track.barrierR[0] + 1.6;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(beamW, 1.6, 0.8), steel);
    beam.position.set((track.barrierL[0] - track.barrierR[0]) / 2, 8.2, 0);
    beam.castShadow = true;
    gantry.add(beam);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(beamW * 0.98, 1.4), reg(new THREE.MeshStandardMaterial({ map: TX.textBanner('APEX VELOCITY  •  START', '#0b0f1a', '#ffffff', 2048, 128), roughness: 0.5, emissive: 0xffffff, emissiveMap: TX.textBanner('APEX VELOCITY  •  START', '#0b0f1a', '#ffffff', 2048, 128), emissiveIntensity: night ? 0.6 : 0.05 })));
    banner.position.set(beam.position.x, 8.2, -0.41);
    banner.rotation.y = Math.PI;
    gantry.add(banner);
    // 5 light pods facing the grid (which is behind the line: -heading)
    const podMat = reg(new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.5 }));
    for (let k = 0; k < 5; k++) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.5, 0.4), podMat);
      pod.position.set(beam.position.x + (k - 2) * 1.0, 6.4, -0.3);
      gantry.add(pod);
      const lampMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff0000, emissiveIntensity: 0, roughness: 0.3 });
      reg(lampMat);
      for (let r = 0; r < 2; r++) {
        const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), lampMat);
        lamp.position.set(pod.position.x, 6.75 - r * 0.6, -0.51);
        lamp.rotation.y = Math.PI;
        gantry.add(lamp);
      }
      startLights.push(lampMat);
    }
    group.add(gantry);
    gantry.traverse((o) => { if (o.isMesh) disposables.push(o.geometry); });
    void gw;
  }

  // Pit building + pit wall along the main straight on the right side
  const pitSide = def.pitSide === 'left' ? 1 : -1;
  if (!isOval || true) {
    const pitBatchWall = new Batch(), pitBatchRoof = new Batch();
    const i0 = N - Math.round(240 / DS), cnt = Math.round(330 / DS);
    const barr = pitSide > 0 ? track.barrierL : track.barrierR;
    const dist = new Float32Array(N);
    for (let i = 0; i < N; i++) dist[i] = barr[i] + 16;
    // building: facade facing the track, roof, back
    sweep(pitBatchWall, pitSide, [[i0, cnt]], dist, [[[0, 0], [0, 11]]], { uScale: 1 / 40 });
    sweep(pitBatchRoof, pitSide, [[i0, cnt]], dist, [[[-3, 11.4], [16, 11.4]], [[-3, 11], [-3, 11.4]], [[16, 11.4], [16, -1]]]);
    const pitMat = reg(new THREE.MeshStandardMaterial({ map: cloneTex(TX.pitBuildingTexture(), 1), roughness: 0.5, metalness: 0.1, emissive: 0xffffff, emissiveMap: cloneTex(TX.pitBuildingTexture(), 1), emissiveIntensity: night ? 0.35 : 0 }));
    pitMat.map.wrapT = THREE.ClampToEdgeWrapping;
    disposables.push(pitMat.map, pitMat.emissiveMap);
    const roofMat = reg(new THREE.MeshStandardMaterial({ color: 0xe8e8ec, roughness: 0.6, metalness: 0.2 }));
    if (pitBatchWall.n) addMesh(pitBatchWall.build(), pitMat, { cast: true, name: 'pits' });
    if (pitBatchRoof.n) addMesh(pitBatchRoof.build(), roofMat, { cast: true, name: 'pitroof' });
    // pit lane surface
    const laneG = stripGeometry([[i0, cnt]], (i) => pitSide > 0 ? [barr[i] + 0.4, barr[i] + 16] : [-barr[i] - 16, -barr[i] - 0.4], 4, { yOff: () => 0.0 });
    addMesh(laneG, ribbonMaterial('asphalt', { tile: 5, color: 0x9a9a9a, extraKey: 'pitlane' }), { name: 'pitlane' });
  }

  // Grandstands: tiered sweep with crowd texture + roof
  const crowdMat = reg(new THREE.MeshStandardMaterial({ map: cloneTex(TX.crowdTexture(), 1), roughness: 0.9 }));
  disposables.push(crowdMat.map);
  const standMat = reg(new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.7, metalness: 0.2 }));
  const standRoofMat = reg(new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }));
  const standSpots = [];
  if (SC.stands || SC.grandstands) {
    const want = Math.round((SC.grandstands || 0) * Math.min(1.2, scenery + 0.2));
    // main grandstand opposite the pits
    standSpots.push([N - Math.round(180 / DS), Math.round(200 / DS), -pitSide]);
    // others at the outside of big corners
    const cand = [];
    for (let i = 0; i < N; i += 10) {
      const kap = track.kappa[i];
      if (Math.abs(kap) > 1 / 140) cand.push([i, kap < 0 ? 1 : -1]);
    }
    for (let k = 0; k < cand.length && standSpots.length < want + 1; k += Math.max(1, Math.floor(cand.length / (want + 1)))) {
      const [i, side] = cand[k];
      if (standSpots.some(([j]) => Math.min(Math.abs(j - i), N - Math.abs(j - i)) < 120)) continue;
      standSpots.push([i - 25, 50, side]);
    }
  }
  if (SC.ovalStands) {
    standSpots.push([N - Math.round(300 / DS), Math.round(560 / DS), -1]);
    standSpots.push([Math.round(track.N * 0.15), Math.round(200 / DS), -1]);
  }
  for (const [i0, cnt, side] of standSpots) {
    const barr = side > 0 ? track.barrierL : track.barrierR;
    const verge = side > 0 ? track.vergeL : track.vergeR;
    // skip if there's not enough room behind the barrier
    let ok = true;
    for (let k = 0; k < cnt; k += 4) { const i = ((i0 + k) % N + N) % N; if (verge[i] < 6) ok = false; }
    if (!ok) continue;
    const dist = new Float32Array(N);
    for (let i = 0; i < N; i++) dist[i] = barr[i] + 4;
    const tiers = 10, th = 0.55, td = 0.9;
    const crowdB = new Batch(), structB = new Batch(), roofB = new Batch();
    for (let t = 0; t < tiers; t++) {
      sweep(crowdB, side, [[i0, cnt]], dist, [[[t * td, t * th + 0.5], [t * td, (t + 1) * th + 0.5], [t / tiers, (t + 1) / tiers]]], { uScale: 1 / 6 });
      sweep(structB, side, [[i0, cnt]], dist, [[[t * td, (t + 1) * th + 0.5], [(t + 1) * td, (t + 1) * th + 0.5]]]);
    }
    sweep(structB, side, [[i0, cnt]], dist, [[[tiers * td, tiers * th + 0.5], [tiers * td, -1]], [[0, 0.5], [0, -1]]]);
    sweep(roofB, side, [[i0, cnt]], dist, [[[-1.5, tiers * th + 4.2], [tiers * td + 0.5, tiers * th + 3.0]]]);
    const cm = addMesh(crowdB.build(), crowdMat, { cast: true, name: 'crowd' });
    const sm = addMesh(structB.build(), standMat, { cast: true, name: 'stand' });
    const rm = addMesh(roofB.build(), standRoofMat, { cast: true, name: 'standroof' });
    void cm; void sm; void rm;
    // roof columns
    const colG = new THREE.CylinderGeometry(0.15, 0.15, 1, 8);
    colG.translate(0, 0.5, 0);
    const cols = [];
    for (let k = 0; k <= cnt; k += 10) cols.push(((i0 + k) % N + N) % N);
    const im = new THREE.InstancedMesh(colG, standMat, cols.length);
    const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    cols.forEach((i, k) => {
      const d = side * (dist[i] + tiers * td + 0.3);
      const y0 = track.heightAt(i, 0, side * dist[i]) - 1;
      p.set(track.x[i] + track.lx[i] * d, y0, track.z[i] + track.lz[i] * d);
      s.set(1, tiers * th + 4.2, 1);
      m4.compose(p, q, s);
      im.setMatrixAt(k, m4);
    });
    im.castShadow = true;
    group.add(im);
    disposables.push(colG);
  }

  // Advertising bridge over the track
  {
    const i = Math.round(N * 0.33);
    const f = track.frameAt(i * DS);
    const bridge = new THREE.Group();
    bridge.position.set(f.x, f.y, f.z);
    bridge.rotation.y = f.heading;
    const mat = reg(new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.6 }));
    const bl = track.barrierL[i] + 1.5, br = track.barrierR[i] + 1.5;
    for (const d of [bl, -br]) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(1.2, 9, 2.4), mat);
      pil.position.set(d, 4.5, 0); pil.castShadow = true; bridge.add(pil);
    }
    const sp = TX.SPONSORS[rng.int(0, TX.SPONSORS.length - 1)];
    const btex = TX.textBanner(sp[0], sp[1], sp[2], 2048, 160);
    const bmat = reg(new THREE.MeshStandardMaterial({ map: btex, roughness: 0.5, emissive: 0xffffff, emissiveMap: btex, emissiveIntensity: night ? 0.5 : 0 }));
    const deck = new THREE.Mesh(new THREE.BoxGeometry(bl + br + 1.2, 2.2, 2.4), [mat, mat, mat, mat, bmat, bmat]);
    deck.position.set((bl - br) / 2, 8.6, 0); deck.castShadow = true;
    bridge.add(deck);
    group.add(bridge);
    bridge.traverse((o) => { if (o.isMesh) disposables.push(o.geometry); });
  }

  // brake marker boards before big braking zones
  {
    const bm = reg(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
    const boardTex = [300, 200, 100].map((n) => TX.textBanner(String(n), '#ffffff', '#111111', 128, 128));
    const mats = boardTex.map((t) => reg(new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 })));
    const g = new THREE.BoxGeometry(0.9, 0.9, 0.06);
    disposables.push(g);
    for (let i = 0; i < N; i++) {
      const prev = Math.abs(track.kappa[(i - 1 + N) % N]), cur = Math.abs(track.kappa[i]);
      if (prev < 1 / 300 && cur >= 1 / 300 && Math.abs(track.kappa[(i + 20) % N]) > 1 / 120) {
        const side = track.kappa[(i + 20) % N] > 0 ? -1 : 1; // outside of the corner
        [300, 200, 100].forEach((dist, k) => {
          const j = (i - Math.round(dist / DS) + N) % N;
          const barr = side > 0 ? track.barrierL[j] : track.barrierR[j];
          const dd = side * (Math.min(barr, track.hw[j] + 4));
          const m = new THREE.Mesh(g, [bm, bm, bm, bm, mats[k], mats[k]]);
          m.position.set(track.x[j] + track.lx[j] * dd, track.heightAt(j, 0, dd) + 1.2, track.z[j] + track.lz[j] * dd);
          m.rotation.y = track.heading[j] + Math.PI;
          group.add(m);
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Water
  // ---------------------------------------------------------------------------
  let water = null;
  if (SC.sea) {
    const wn = TX.waterNormal();
    const wmat = reg(new THREE.MeshPhysicalMaterial({ color: 0x0b3a5a, roughness: 0.06, metalness: 0.0, normalMap: cloneTex(wn, 1), clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.2 }));
    wmat.normalMap.repeat.set(220, 220);
    wmat.normalScale.set(0.35, 0.35);
    disposables.push(wmat.normalMap);
    const wg = new THREE.PlaneGeometry(30000, 30000, 1, 1);
    wg.rotateX(-Math.PI / 2);
    water = addMesh(wg, wmat, { name: 'water' });
    water.position.y = -2.5;
    water.position.x = centerX; water.position.z = centerZ;
  }

  // ---------------------------------------------------------------------------
  // Trees, rocks, mesas, buildings, lamps
  // ---------------------------------------------------------------------------
  const occupied = []; // [x, z, r]
  for (const [i0, cnt, side] of standSpots) for (let k = 0; k < cnt; k += 8) {
    const i = ((i0 + k) % N + N) % N, d = side * (track.barrierL[i] + 10);
    occupied.push([track.x[i] + track.lx[i] * d, track.z[i] + track.lz[i] * d, 16]);
  }
  const freeAt = (x, z, r) => occupied.every(([ox, oz, or]) => (ox - x) ** 2 + (oz - z) ** 2 > (or + r) ** 2);

  // Buildings
  if (SC.buildings) {
    const tower = SC.buildings === 'tower';
    const count = Math.round(SC.buildingCount * Math.min(1.2, scenery + 0.3));
    const styles = tower ? [0, 1, 3, 4] : [2, 4, 0];
    const batches = styles.map(() => new Batch());
    const roofBatch = new Batch();
    const box = new THREE.BoxGeometry(1, 1, 1);
    let placed = 0, tries = 0;
    while (placed < count && tries++ < count * 30) {
      const x = tx0 + rng.float(0.15, 0.85) * (nx - 1) * cell, z = tz0 + rng.float(0.15, 0.85) * (nz - 1) * cell;
      const { d, i } = distAt(x, z);
      if (i < 0) continue;
      const lat = (x - track.x[i]) * track.lx[i] + (z - track.z[i]) * track.lz[i];
      const edge = (lat > 0 ? track.barrierL[i] + track.vergeL[i] : track.barrierR[i] + track.vergeR[i]);
      if (d < edge + 6 || d > (tower ? 700 : 450)) continue;
      if (SC.sea && seaAt(x, z) > 0.05) continue;
      const w = rng.float(14, tower ? 34 : 26), dd = rng.float(14, tower ? 34 : 22);
      if (!freeAt(x, z, Math.max(w, dd) * 0.7)) continue;
      const near = 1 - smoothstep(edge, 500, d);
      const h = tower ? rng.float(20, 60) + Math.pow(rng.next(), 3) * 160 * (0.4 + near) : rng.float(10, 34);
      const y = terrainHeight(x, z) - 1;
      const rot = track.heading[i] + (rng.chance(0.5) ? 0 : Math.PI / 2);
      const style = rng.int(0, styles.length - 1);
      const m4 = new THREE.Matrix4().compose(new THREE.Vector3(x, y + h / 2, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(w, h, dd));
      // facades: tile windows by real size (one texture tile = 8 floors x 32 m)
      const g = box.clone();
      const uvA = g.attributes.uv, nA = g.attributes.normal;
      for (let k = 0; k < uvA.count; k++) {
        const nx_ = Math.abs(nA.getX(k)), nz_ = Math.abs(nA.getZ(k));
        const along = nx_ > 0.5 ? dd : w;
        uvA.setXY(k, uvA.getX(k) * along / 32, uvA.getY(k) * h / (tower ? 50 : 30));
        void nz_;
      }
      // drop top/bottom faces into the roof batch
      const idx = g.index.array;
      const keep = [], roofIdx = [];
      for (let f = 0; f < idx.length; f += 3) {
        const ny = nA.getY(idx[f]);
        (Math.abs(ny) > 0.5 ? roofIdx : keep).push(idx[f], idx[f + 1], idx[f + 2]);
      }
      const gw = g.clone(); gw.setIndex(keep);
      const gr = g.clone(); gr.setIndex(roofIdx);
      batches[style].addGeometry(gw, m4);
      roofBatch.addGeometry(gr, m4);
      occupied.push([x, z, Math.max(w, dd) * 0.7]);
      placed++;
    }
    styles.forEach((st, k) => {
      if (!batches[k].n) return;
      const ft = TX.facadeTextures(st);
      const mat = reg(new THREE.MeshStandardMaterial({ map: ft.map, roughness: 0.35, metalness: 0.4, emissive: 0xffffff, emissiveMap: ft.emissiveMap, emissiveIntensity: night ? 2.2 : 0 }));
      addMesh(batches[k].build(), mat, { cast: true, name: 'buildings' });
    });
    if (roofBatch.n) addMesh(roofBatch.build(), reg(new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.8 })), { name: 'roofs' });
  }

  // Mesas (desert)
  if (SC.mesas) {
    const mesaMat = terrainMaterial('rock', 'rock');
    for (let k = 0; k < SC.mesas; k++) {
      const a = rng.float(0, Math.PI * 2), r = trackRadius + rng.float(250, 1600);
      const x = centerX + Math.cos(a) * r, z = centerZ + Math.sin(a) * r;
      const rad = rng.float(60, 220), h = rng.float(50, 170);
      const g = new THREE.CylinderGeometry(rad * 0.82, rad, h, 28, 8, false);
      const p = g.attributes.position;
      const nn = new Noise(k + 3);
      for (let v = 0; v < p.count; v++) {
        const vx = p.getX(v), vy = p.getY(v), vz = p.getZ(v);
        const ang = Math.atan2(vz, vx);
        const f = 1 + nn.fbm(Math.cos(ang) * 2 + vy / 40, Math.sin(ang) * 2, 4) * 0.35;
        const terr = Math.round((vy / h + 0.5) * 6) / 6;
        const top = vy > h / 2 - 1;
        p.setXYZ(v, vx * (top ? f * 0.98 : f), vy + (terr - (vy / h + 0.5)) * h * 0.15, vz * (top ? f * 0.98 : f));
      }
      g.computeVertexNormals();
      const m = addMesh(g, mesaMat, { cast: false, name: 'mesa' });
      m.position.set(x, terrainHeight(x, z) + h / 2 - 8, z);
    }
  }

  // Trees (instanced by species)
  const treeTotal = Math.round((SC.treeCount || 0) * scenery);
  const treeKinds = SC.trees || [];
  const placements = {};
  for (const [k] of treeKinds) placements[k] = [];
  let tries = 0, placedT = 0;
  while (placedT < treeTotal && tries++ < treeTotal * 12) {
    const x = tx0 + rng.next() * (nx - 1) * cell, z = tz0 + rng.next() * (nz - 1) * cell;
    const { d, i } = distAt(x, z);
    if (i >= 0) {
      const lat = (x - track.x[i]) * track.lx[i] + (z - track.z[i]) * track.lz[i];
      const edge = (lat > 0 ? track.barrierL[i] + track.vergeL[i] : track.barrierR[i] + track.vergeR[i]);
      if (d < edge + 4) continue;
    }
    if (SC.sea && seaAt(x, z) > 0.02) continue;
    // forest clustering
    const fo = noise.fbm(x / 260 + 40, z / 260 - 13, 3) * 0.5 + 0.5;
    const dens = lerp(0.35, 1, SC.forest) * smoothstep(0.35 - SC.forest * 0.3, 0.65, fo) + (d < 220 ? 0.12 : 0);
    if (rng.next() > dens) continue;
    if (!freeAt(x, z, 3)) continue;
    const y = terrainHeight(x, z);
    if (y > 260 && SC.snowCaps) continue;
    const kind = rng.weighted(treeKinds);
    placements[kind].push([x, y, z, rng.float(0.7, 1.35), rng.float(0, Math.PI * 2), rng.float(0.85, 1.1)]);
    placedT++;
  }
  const treeGeoms = makeTreeGeometries();
  for (const kind in placements) {
    const list = placements[kind];
    if (!list.length) continue;
    for (const part of treeGeoms[kind]) {
      const im = new THREE.InstancedMesh(part.geo, part.mat, list.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
      const c = new THREE.Color();
      list.forEach(([x, y, z, sc, rot, tint], k) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
        p.set(x, y - 0.2, z);
        s.set(sc, sc * rng.float(0.9, 1.15), sc);
        m4.compose(p, q, s);
        im.setMatrixAt(k, m4);
        c.setRGB(tint, tint * rng.float(0.95, 1.05), tint * 0.95);
        im.setColorAt(k, c);
      });
      im.castShadow = quality.shadows > 1;
      im.receiveShadow = true;
      group.add(im);
    }
  }

  // Rocks
  if (SC.rockCount) {
    const rg = new THREE.IcosahedronGeometry(1, 1);
    const rp = rg.attributes.position;
    const rn = new Noise(99);
    for (let v = 0; v < rp.count; v++) {
      const x = rp.getX(v), y = rp.getY(v), z = rp.getZ(v);
      const f = 1 + rn.fbm(x * 1.7, y * 1.7 + z, 3) * 0.45;
      rp.setXYZ(v, x * f, y * f * 0.65, z * f);
    }
    rg.computeVertexNormals();
    const rmat = reg(new THREE.MeshStandardMaterial({ map: cloneTex(TX.groundTextures(SC.slope).map, 0.5), roughness: 0.95, flatShading: true }));
    disposables.push(rmat.map, rg);
    const n = Math.round(SC.rockCount * scenery);
    const im = new THREE.InstancedMesh(rg, rmat, n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    let k = 0, t = 0;
    while (k < n && t++ < n * 20) {
      const x = tx0 + rng.next() * (nx - 1) * cell, z = tz0 + rng.next() * (nz - 1) * cell;
      const { d, i } = distAt(x, z);
      if (i >= 0) {
        const lat = (x - track.x[i]) * track.lx[i] + (z - track.z[i]) * track.lz[i];
        const edge = (lat > 0 ? track.barrierL[i] + track.vergeL[i] : track.barrierR[i] + track.vergeR[i]);
        if (d < edge + 3) continue;
      }
      if (SC.sea && seaAt(x, z) > 0.5) continue;
      const sz = rng.float(0.6, 2.2) * (rng.chance(0.1) ? 3 : 1);
      q.setFromEuler(new THREE.Euler(rng.float(-0.3, 0.3), rng.float(0, 6.28), rng.float(-0.3, 0.3)));
      p.set(x, terrainHeight(x, z) + sz * 0.15, z);
      s.set(sz * rng.float(0.8, 1.4), sz, sz * rng.float(0.8, 1.4));
      m4.compose(p, q, s);
      im.setMatrixAt(k++, m4);
    }
    im.count = k;
    im.castShadow = quality.shadows > 0;
    im.receiveShadow = true;
    group.add(im);
  }

  // Floodlight poles (night circuits)
  if (night) {
    const poleG = new THREE.CylinderGeometry(0.12, 0.18, 1, 8);
    poleG.translate(0, 0.5, 0);
    const headG = new THREE.BoxGeometry(1.6, 0.25, 0.7);
    const poleMat = reg(new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.5, metalness: 0.7 }));
    const headMat = reg(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2dd, emissiveIntensity: 6 }));
    disposables.push(poleG, headG);
    const poles = [];
    const sp = 38;
    for (let s = 0; s < L; s += sp) { poles.push([s, 1]); poles.push([s + sp / 2, -1]); }
    const pm = new THREE.InstancedMesh(poleG, poleMat, poles.length);
    const hm = new THREE.InstancedMesh(headG, headMat, poles.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s1 = new THREE.Vector3();
    poles.forEach(([s, side], k) => {
      const f = track.frameAt(s);
      const barr = side > 0 ? f.barrierL : f.barrierR;
      const d = side * (barr + 1.0);
      const y = track.heightAt(f.i, f.t, side * barr);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.heading);
      p.set(f.x + f.lx * d, y, f.z + f.lz * d);
      s1.set(1, 12, 1);
      m4.compose(p, q, s1); pm.setMatrixAt(k, m4);
      const d2 = side * (barr - 0.2);
      p.set(f.x + f.lx * d2, y + 12, f.z + f.lz * d2);
      s1.set(1, 1, 1);
      m4.compose(p, q, s1); hm.setMatrixAt(k, m4);
    });
    group.add(pm, hm);
  }

  // ---------------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------------
  const api = {
    group,
    uniforms,
    terrainHeight,
    setStartLights(n, color = 'red') {
      startLights.forEach((m, k) => {
        const on = k < n;
        m.emissive.set(color === 'green' ? 0x00ff40 : 0xff0000);
        m.emissiveIntensity = on ? 9 : 0;
        m.color.set(on ? (color === 'green' ? 0x003300 : 0x330000) : 0x110000);
      });
    },
    update(dt, time) {
      uniforms.uTime.value = time;
      if (water) {
        water.material.normalMap.offset.set(time * 0.004, time * 0.0025);
      }
    },
    dispose() {
      group.removeFromParent();
      for (const d of disposables) d && d.dispose && d.dispose();
      group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
      for (const kind in treeGeoms) for (const p of treeGeoms[kind]) { p.geo.dispose(); }
    },
  };
  return api;
}

// ---------------------------------------------------------------------------
// Tree geometry library (merged parts per species, vertex-coloured)
// ---------------------------------------------------------------------------
let treeMats = null;
function makeTreeGeometries() {
  if (!treeMats) {
    treeMats = {
      bark: new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.95 }),
      leaf: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, vertexColors: true, flatShading: false }),
      cactus: new THREE.MeshStandardMaterial({ color: 0x4a7a3a, roughness: 0.8 }),
    };
  }
  const n = new Noise(4242);
  const crown = (r, detail, col1, col2, squash = 1, lumpy = 0.28) => {
    const g = new THREE.IcosahedronGeometry(r, detail);
    const p = g.attributes.position;
    const cols = [];
    const c1 = new THREE.Color(col1), c2 = new THREE.Color(col2), c = new THREE.Color();
    for (let v = 0; v < p.count; v++) {
      const x = p.getX(v), y = p.getY(v), z = p.getZ(v);
      const f = 1 + n.fbm(x * 0.9 + 3, y * 0.9 + z * 0.7, 3) * lumpy;
      p.setXYZ(v, x * f, y * f * squash, z * f);
      const t = clamp(0.5 + y / (r * 2) + n.noise2(x * 2, z * 2) * 0.2, 0, 1);
      c.copy(c1).lerp(c2, t);
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    return g;
  };
  const merge = (geos) => {
    const b = new Batch();
    const colors = [];
    for (const [g, m] of geos) {
      b.addGeometry(g, m);
      const ca = g.attributes.color;
      for (let i = 0; i < g.attributes.position.count; i++) colors.push(ca ? ca.getX(i) : 1, ca ? ca.getY(i) : 1, ca ? ca.getZ(i) : 1);
    }
    b.extra.color = { data: colors, size: 3 };
    return b.build();
  };
  const M = (x, y, z, s = 1, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, rz)), new THREE.Vector3(s, s, s));
  const trunk = (h, r) => { const g = new THREE.CylinderGeometry(r * 0.7, r, h, 6); g.translate(0, h / 2, 0); return g; };
  const cone = (r, h, y, col1, col2) => {
    const g = new THREE.ConeGeometry(r, h, 9, 2);
    const p = g.attributes.position;
    const cols = [];
    const c1 = new THREE.Color(col1), c2 = new THREE.Color(col2), c = new THREE.Color();
    for (let v = 0; v < p.count; v++) {
      const x = p.getX(v), yy = p.getY(v), z = p.getZ(v);
      const f = 1 + n.noise2(x * 3 + yy, z * 3) * 0.18;
      p.setXYZ(v, x * f, yy, z * f);
      c.copy(c1).lerp(c2, clamp(0.5 + yy / h + 0.1, 0, 1));
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    g.translate(0, y, 0);
    return g;
  };
  const lib = {};
  lib.deciduous = [
    { geo: trunk(4.2, 0.32), mat: treeMats.bark },
    { geo: merge([[crown(3.2, 1, 0x2e5a22, 0x6a9a3a), M(0, 6.4, 0)], [crown(2.4, 1, 0x2e5a22, 0x5a8a34), M(1.8, 5.4, 0.6)], [crown(2.2, 1, 0x325e26, 0x648f3a), M(-1.5, 5.7, -0.9)]]), mat: treeMats.leaf },
  ];
  lib.blossom = [
    { geo: trunk(3.6, 0.3), mat: treeMats.bark },
    { geo: merge([[crown(3.0, 1, 0xd77aa0, 0xffd1e4), M(0, 5.6, 0)], [crown(2.3, 1, 0xe08ab0, 0xffe0ee), M(1.7, 4.8, 0.5)], [crown(2.1, 1, 0xd070a0, 0xffc8e0), M(-1.6, 5.0, -0.8)]]), mat: treeMats.leaf },
  ];
  lib.pine = [
    { geo: trunk(3, 0.28), mat: treeMats.bark },
    { geo: merge([[cone(3.0, 5, 4.2, 0x1d3d22, 0x2f5a33), M(0, 0, 0)], [cone(2.4, 4.2, 7.0, 0x1f4224, 0x355f38), M(0, 0, 0)], [cone(1.7, 3.4, 9.6, 0x22462a, 0x3b663d), M(0, 0, 0)]]), mat: treeMats.leaf },
  ];
  lib.snowpine = [
    { geo: trunk(3, 0.28), mat: treeMats.bark },
    { geo: merge([[cone(3.0, 5, 4.2, 0x1d3a26, 0xe8eef6), M(0, 0, 0)], [cone(2.4, 4.2, 7.0, 0x1d3a26, 0xf2f6fb), M(0, 0, 0)], [cone(1.7, 3.4, 9.6, 0x22422c, 0xffffff), M(0, 0, 0)]]), mat: treeMats.leaf },
  ];
  lib.bush = [
    { geo: merge([[crown(1.4, 1, 0x2d5221, 0x587f33, 0.7), M(0, 0.8, 0)], [crown(1.1, 1, 0x30552a, 0x5b8236, 0.7), M(1.0, 0.6, 0.4)]]), mat: treeMats.leaf },
  ];
  lib.drybush = [
    { geo: merge([[crown(1.0, 1, 0x6b5a32, 0x9a8a50, 0.6, 0.45), M(0, 0.5, 0)], [crown(0.8, 1, 0x6e5e36, 0x9e8e56, 0.6, 0.45), M(0.7, 0.4, 0.3)]]), mat: treeMats.leaf },
  ];
  // palm: curved trunk + drooping fronds
  {
    const pts = [];
    for (let i = 0; i <= 8; i++) pts.push(new THREE.Vector3(Math.sin(i / 8 * 1.2) * 1.2, i * 1.2, 0));
    const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.22, 6, false);
    const fronds = [];
    for (let k = 0; k < 8; k++) {
      const fg = new THREE.PlaneGeometry(0.9, 4.2, 1, 6);
      const p = fg.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const y = p.getY(v) + 2.1, x = p.getX(v);
        p.setXYZ(v, x * (1 - y / 5), -Math.pow(y / 4.2, 2) * 1.6, y);
      }
      const cols = [];
      for (let v = 0; v < p.count; v++) cols.push(0.22, 0.42, 0.15);
      fg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      fg.computeVertexNormals();
      fronds.push([fg, M(Math.sin(1.2) * 1.2, 9.6, 0, 1, (k / 8) * Math.PI * 2, 0)]);
    }
    const fm = merge(fronds);
    lib.palm = [{ geo: tg, mat: treeMats.bark }, { geo: fm, mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }) }];
  }
  // cactus
  {
    const b = new Batch();
    const main = new THREE.CapsuleGeometry(0.35, 3.2, 4, 8); main.translate(0, 2, 0);
    b.addGeometry(main);
    for (const s of [-1, 1]) {
      const arm = new THREE.CapsuleGeometry(0.22, 1.2, 4, 8);
      b.addGeometry(arm, M(s * 0.75, 2.4 + s * 0.3, 0));
      const join = new THREE.CapsuleGeometry(0.2, 0.5, 4, 8);
      join.rotateZ(Math.PI / 2);
      b.addGeometry(join, M(s * 0.45, 1.9 + s * 0.3, 0));
    }
    lib.cactus = [{ geo: b.build(), mat: treeMats.cactus }];
  }
  return lib;
}
