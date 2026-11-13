// "Lite" graphics: the most widely compatible way to draw the game. Every
// PBR / custom-shader material is replaced with a plain Lambert material
// (no reflections, no shadows, no environment maps, no shader patches), so
// it runs on weak or unusual phone and Chromebook graphics chips.
import * as THREE from 'three';

const GREY = new THREE.Color(0x9aa0a8);

function toLite(m, cache) {
  if (!m || m.isMeshLambertMaterial || m.isMeshBasicMaterial || m.isLineBasicMaterial || m.isPointsMaterial || m.isShaderMaterial) return m;
  let l = cache.get(m);
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
export function liteSwap(root, cache = new Map()) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.pbrMaterial === undefined) o.userData.pbrMaterial = o.material;
    const src = o.userData.pbrMaterial;
    o.material = Array.isArray(src) ? src.map((m) => toLite(m, cache)) : toLite(src, cache);
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
