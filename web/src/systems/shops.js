import * as THREE from '../../vendor/three/three.module.js';
import { SHOPS } from '../config.js';

// A small colored pad + spinning icon + light column, distinguishing shops
// from mission beacons (thinner beam, a floating icon instead of a ring).
function buildShopMarker(scene, position, color) {
  const group = new THREE.Group();

  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 0.15, 20),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2 })
  );
  pad.position.y = 0.08;
  group.add(pad);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.6, 26, 10, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = 13;
  group.add(beam);

  const icon = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1, 0),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.3 })
  );
  icon.position.y = 3.2;
  group.add(icon);

  group.position.copy(position);
  scene.add(group);
  return { group, icon };
}

// Fixed-position shops the player interacts with by walking/driving up and
// pressing F (see Game._findInteractable). Purchases are resolved by Game
// itself (it owns cash, the weapon inventory, and vehicle spawning) — this
// class just holds the catalog and world markers.
export class ShopManager {
  constructor(scene) {
    this.scene = scene;
    this.shops = SHOPS.locations.map((loc, i) => {
      const cfg = SHOPS.types[loc.type];
      const position = new THREE.Vector3(...loc.position);
      const marker = buildShopMarker(scene, position, cfg.color);
      return { id: `${loc.type}_${i}`, type: loc.type, name: cfg.name, color: cfg.color, position, items: cfg.items, marker };
    });
  }

  update(dt) {
    for (const s of this.shops) s.marker.icon.rotation.y += dt * 1.2;
  }

  // Nearest shop within range of a world position, or null.
  findNearby(pos, range = 6) {
    let best = null, bestDist = Infinity;
    for (const s of this.shops) {
      const d = Math.hypot(pos.x - s.position.x, pos.z - s.position.z);
      if (d < range && d < bestDist) { best = s; bestDist = d; }
    }
    return best;
  }
}
