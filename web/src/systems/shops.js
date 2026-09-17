import * as THREE from '../../vendor/three/three.module.js';
import { SHOPS } from '../config.js';

const DEALERSHIP_KINDS = new Set(['CAR_SHOP', 'BOAT_SHOP', 'HELI_SHOP', 'JET_SHOP', 'SUB_SHOP']);

// A small storefront/dealership building (walls, glass front, an awning +
// roof sign tinted the shop's color) plus a spinning icon + light beam above
// the roof so it's still spottable from a distance. Vehicle shops get a
// couple of "parked" cars out front so they read as a lot, not just a shop.
function buildShopMarker(scene, position, color, kind) {
  const group = new THREE.Group();
  const isDealership = DEALERSHIP_KINDS.has(kind);
  const w = 8, d = isDealership ? 14 : 10, h = isDealership ? 5.5 : 6;

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xcfd2d6, roughness: 0.85 });
  const accentMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0e1826, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.65 });

  const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  building.position.y = h / 2;
  building.castShadow = true;
  building.receiveShadow = true;
  group.add(building);

  const glass = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, h * 0.5, 0.12), glassMat);
  glass.position.set(0, h * 0.42, d / 2 + 0.06);
  group.add(glass);

  const awning = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 0.35, 2.4), accentMat);
  awning.position.set(0, h * 0.58, d / 2 + 1.2);
  awning.castShadow = true;
  group.add(awning);

  const sign = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 1.3, 0.35), accentMat);
  sign.position.set(0, h + 0.85, 0);
  group.add(sign);

  if (isDealership) {
    const carColors = [0xd23a3a, 0x2255aa, 0xdddddd];
    for (let i = 0; i < 3; i++) {
      const car = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 0.75, 3.4),
        new THREE.MeshStandardMaterial({ color: carColors[i], roughness: 0.35, metalness: 0.5 })
      );
      car.position.set((i - 1) * 2.6, 0.4, d / 2 + 4.2);
      car.castShadow = true;
      group.add(car);
    }
  }

  // The interactive "you can shop here" cue — kept small/above the roofline
  // so the building itself reads first.
  const icon = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.9, 0),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.3 })
  );
  icon.position.y = h + 2.2;
  group.add(icon);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 20, 10, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = h + 10;
  group.add(beam);

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
      const marker = buildShopMarker(scene, position, cfg.color, loc.type);
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
