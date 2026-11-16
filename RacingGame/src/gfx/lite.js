// "Lite" graphics: the most widely compatible way to draw the game. Every
// PBR / custom-shader material is replaced with Lambert, or Phong with a tiny
// canvas cube-map reflection for shiny things (no shadow maps, no PMREM, no
// render targets, no shader patches), so it runs on weak or unusual phone and
// Chromebook graphics chips.
import * as THREE from 'three';

const GREY = new THREE.Color(0x9aa0a8);

// Reflections for Lite: a tiny ordinary cube map painted on canvases. It needs
// no render targets, no HDR buffers and no PMREM, so it is as safe as a texture.
const ENVS = {};
const ENV_COLORS = {
  day: { top: '#7f9cc6', sky: '#b9cde6', hor: '#f2f5f8', gnd: '#3a3f46', bottom: '#202328', light: 'rgba(255,255,255,0.9)' },
  night: { top: '#05070d', sky: '#0b1020', hor: '#3a3f55', gnd: '#101216', bottom: '#08090b', light: 'rgba(255,240,210,0.8)' },
  studio: { top: '#10131a', sky: '#151a24', hor: '#2a3140', gnd: '#0b0d12', bottom: '#07080b', light: 'rgba(255,255,255,0.95)' },
};
export function liteEnv(kind = 'day') {
  if (ENVS[kind]) return ENVS[kind];
  const c = ENV_COLORS[kind] || ENV_COLORS.day, S = 32;
  const face = (type) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d');
    if (type === 'side') {
      const gr = g.createLinearGradient(0, 0, 0, S);
      gr.addColorStop(0, c.sky); gr.addColorStop(0.48, c.hor); gr.addColorStop(0.52, c.gnd); gr.addColorStop(1, c.bottom);
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
    } else if (type === 'top') {
      g.fillStyle = c.top; g.fillRect(0, 0, S, S);
      // light strips / sun glow seen in the paint
      g.fillStyle = c.light;
      for (let i = 0; i < 3; i++) g.fillRect(6 + i * 9, 4, 3, S - 8);
    } else { g.fillStyle = c.bottom; g.fillRect(0, 0, S, S); }
    return cv;
  };
  const tex = new THREE.CubeTexture([face('side'), face('side'), face('top'), face('bottom'), face('side'), face('side')]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  ENVS[kind] = tex;
  return tex;
}

// Shiny things (paint, glass, chrome, clear-coated floors) become Phong with a
// simple reflection; everything rough stays Lambert (cheapest).
function toPhong(m, envKind) {
  const rough = m.roughness ?? 1, metal = m.metalness ?? 0, coat = m.clearcoat ?? 0;
  const p = new THREE.MeshPhongMaterial({
    color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
    map: m.map || null,
    vertexColors: !!m.vertexColors,
    side: m.side, alphaTest: m.alphaTest || 0, transparent: !!m.transparent, opacity: m.opacity ?? 1, flatShading: !!m.flatShading,
    emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0x000000), emissiveMap: m.emissiveMap || null, emissiveIntensity: m.emissiveIntensity ?? 1,
    depthWrite: m.depthWrite, polygonOffset: !!m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor || 0, polygonOffsetUnits: m.polygonOffsetUnits || 0,
    shininess: Math.max(4 + Math.pow(1 - rough, 3) * 120, coat > 0.3 ? 90 : 0),
    specular: new THREE.Color(metal > 0.5 ? 0x999999 : coat > 0.3 ? 0x707070 : 0x404040).multiplyScalar(0.35 + 0.65 * (1 - rough)),
    envMap: liteEnv(envKind),
    combine: THREE.MixOperation,
    reflectivity: Math.min(0.55, metal * 0.45 + coat * 0.22 + (1 - rough) * 0.12),
  });
  if (metal > 0.6 && !m.map) p.color.lerp(GREY, 0.3);
  return p;
}

function toLite(m, cache, envKind) {
  if (!m || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshBasicMaterial || m.isLineBasicMaterial || m.isPointsMaterial || m.isShaderMaterial) return m;
  let l = cache.get(m);
  if (!l && envKind && ((m.roughness ?? 1) < 0.55 || (m.metalness ?? 0) > 0.5 || (m.clearcoat ?? 0) > 0.3)) {
    l = toPhong(m, envKind);
    cache.set(m, l);
  }
  if (!l) {
    l = new THREE.MeshLambertMaterial({
      color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
      map: m.map || null,
      vertexColors: !!m.vertexColors,
      side: m.side,
      alphaTest: m.alphaTest || 0,
      transparent: !!m.transparent,
      opacity: m.opacity ?? 1,
      flatShading: !!m.flatShading,
      emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0x000000),
      emissiveMap: m.emissiveMap || null,
      emissiveIntensity: m.emissiveIntensity ?? 1,
      depthWrite: m.depthWrite,
      polygonOffset: !!m.polygonOffset,
      polygonOffsetFactor: m.polygonOffsetFactor || 0,
      polygonOffsetUnits: m.polygonOffsetUnits || 0,
    });
    // bare metal has no colour of its own without reflections: lift it to a mid grey
    if ((m.metalness || 0) > 0.6 && !m.map) l.color.lerp(GREY, 0.55);
    cache.set(m, l);
  }
  return l;
}

// Swap every mesh under root to Lambert. Returns the cache (original -> lite)
// so callers can re-point material references and dispose the copies later.
// envKind ('day' | 'night' | 'studio') gives shiny materials a matching simple reflection.
export function liteSwap(root, cache = new Map(), envKind = 'day') {
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.pbrMaterial === undefined) o.userData.pbrMaterial = o.material;
    const src = o.userData.pbrMaterial;
    o.material = Array.isArray(src) ? src.map((m) => toLite(m, cache, envKind)) : toLite(src, cache, envKind);
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return cache;
}

// Undo liteSwap (used by the menu showroom when leaving Lite)
export function liteRestore(root) {
  root.traverse((o) => {
    if (o.isMesh && o.userData.pbrMaterial !== undefined) { o.material = o.userData.pbrMaterial; delete o.userData.pbrMaterial; }
  });
}

export function disposeLite(cache) {
  if (!cache) return;
  for (const l of cache.values()) l.dispose();
  cache.clear();
}

// Simple sky for Lite: a vertex-coloured dome (zenith -> horizon -> ground)
export function gradientSky(zenithHex, horizonHex, groundHex) {
  const g = new THREE.SphereGeometry(1, 24, 16);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const zen = new THREE.Color(zenithHex), hor = new THREE.Color(horizonHex), gnd = new THREE.Color(groundHex), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y >= 0) c.copy(hor).lerp(zen, Math.pow(Math.min(1, y * 1.15), 0.55));
    else c.copy(hor).lerp(gnd, Math.min(1, -y / 0.06));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return mesh;
}
