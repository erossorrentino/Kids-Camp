import * as THREE from '../../vendor/three/three.module.js';
import { SHOPS } from '../config.js';
import { generateWeaponVariants, describeWeaponVariant } from './weaponGenerator.js';
import { generateVehicleVariants, describeVehicleVariant } from './vehicleGenerator.js';

const DEALERSHIP_KINDS = new Set(['CAR_SHOP', 'BOAT_SHOP', 'HELI_SHOP', 'JET_SHOP', 'SUB_SHOP']);
// Which vehicle-catalog `kind`s a dealership shop type browses (see
// systems/vehicleGenerator.js) — a car dealership shows both cars and bikes.
const DEALERSHIP_VEHICLE_KINDS = {
  CAR_SHOP: ['car', 'bike'], BOAT_SHOP: ['boat'], HELI_SHOP: ['heli'], JET_SHOP: ['jet'], SUB_SHOP: ['sub'],
};

// A small storefront/dealership building (walls, glass front, an awning +
// roof sign tinted the shop's color) plus a spinning icon + light beam above
// the roof so it's still spottable from a distance. Vehicle shops get a
// couple of "parked" cars out front so they read as a lot, not just a shop.
function buildShopMarker(scene, position, color, kind) {
  const group = new THREE.Group();
  const isDealership = DEALERSHIP_KINDS.has(kind);
  const isCasino = kind === 'CASINO';
  const w = isCasino ? 16 : 8, d = isCasino ? 18 : isDealership ? 14 : 10, h = isCasino ? 9 : isDealership ? 5.5 : 6;

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

  // A landmark, not just another storefront: a marquee ring of emissive
  // bulbs around the roofline instead of one sign, plus a second, brighter
  // beam so it reads as THE place to go from across the island.
  if (isCasino) {
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffcc33, emissiveIntensity: 1.4, roughness: 0.4 });
    const bulbGeo = new THREE.SphereGeometry(0.22, 8, 8);
    const perimeter = 2 * (w + d) - 8;
    const bulbCount = Math.round(perimeter / 1.6);
    for (let i = 0; i < bulbCount; i++) {
      const t = i / bulbCount;
      const edge = t * perimeter;
      let x, z;
      if (edge < w) { x = -w / 2 + edge; z = -d / 2; }
      else if (edge < w + d) { x = w / 2; z = -d / 2 + (edge - w); }
      else if (edge < 2 * w + d) { x = w / 2 - (edge - w - d); z = d / 2; }
      else { x = -w / 2; z = d / 2 - (edge - 2 * w - d); }
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(x, h + 0.2, z);
      group.add(bulb);
    }
    const marquee = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, 2.2, 0.4), accentMat);
    marquee.position.set(0, h * 0.62, d / 2 + 1.4);
    group.add(marquee);
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

// n random, distinct entries from pool (Fisher-Yates partial shuffle).
function sampleN(pool, n) {
  const arr = [...pool];
  const take = Math.min(n, arr.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(Math.random() * (arr.length - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, take);
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
    // Built once at construction (like the 500-entry mission pool): a
    // 1000-entry gun catalog and a 1500-entry vehicle catalog (see
    // weaponGenerator.js / vehicleGenerator.js). GUN_SHOPs and dealerships
    // browse a random sample of these on top of their static items (see
    // getShopItems) rather than showing all of them in one long list.
    this.gunCatalog = generateWeaponVariants();
    this.vehicleCatalog = generateVehicleVariants();
  }

  update(dt) {
    for (const s of this.shops) s.marker.icon.rotation.y += dt * 1.2;
  }

  // Static config items plus (for GUN_SHOP/dealerships) a fresh random
  // sample of the procedural catalog, reshuffled every time a shop is
  // opened — same "sample of a big pool, reroll on reopen" pattern as
  // MissionManager.listAvailable.
  getShopItems(shop) {
    const base = SHOPS.types[shop.type].items;
    if (shop.type === 'GUN_SHOP') {
      const sample = sampleN(this.gunCatalog, 10);
      return [...base, ...sample.map((v) => ({
        id: v.id, label: `${v.name} — ${describeWeaponVariant(v)}`, price: v.price, gunVariant: v,
      }))];
    }
    const kinds = DEALERSHIP_VEHICLE_KINDS[shop.type];
    if (kinds) {
      const pool = this.vehicleCatalog.filter((v) => kinds.includes(v.kind));
      const sample = sampleN(pool, 10);
      return [...base, ...sample.map((v) => ({
        id: v.id, label: `${v.name} — ${describeVehicleVariant(v)}`, price: v.price, spawn: v.kind, vehicleVariant: v,
      }))];
    }
    return base;
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
