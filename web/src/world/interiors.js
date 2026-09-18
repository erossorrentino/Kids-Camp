import * as THREE from '../../vendor/three/three.module.js';
import { buildHumanoid } from '../entities/humanoid.js';

// Interiors live directly below their shop on the Y axis, at the SAME X/Z —
// so walking in is a pure vertical teleport that never disturbs CityWorld's
// X/Z-keyed chunk streaming or collision lookups (both ignore Y), and
// walking back out lands you exactly where you left the surface. Well
// clear of anything else in the scene (aircraft, the seabed, etc).
const INTERIOR_Y = -400;

// One enclosed room per shop: floor/walls/ceiling, its own light (the sun
// doesn't reach down here), a counter, and a clerk NPC — a casino gets a
// bigger room with slot-machine cabinets and a couple of patrons instead.
export function buildShopInterior(scene, shop) {
  const isCasino = shop.type === 'CASINO';
  const w = isCasino ? 26 : 10, d = isCasino ? 22 : 9, h = isCasino ? 6 : 4.2;
  const center = new THREE.Vector3(shop.position.x, INTERIOR_Y, shop.position.z);
  const group = new THREE.Group();
  group.position.copy(center);
  scene.add(group);

  const floorMat = new THREE.MeshStandardMaterial({ color: isCasino ? 0x2a1830 : 0x2c2f36, roughness: 0.8 });
  const wallMat = new THREE.MeshStandardMaterial({ color: isCasino ? 0x3a2440 : 0xcfd2d6, roughness: 0.85 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.9 });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = h;
  group.add(ceil);

  const wallThick = 0.3;
  const wallDefs = [
    [[w, h, wallThick], [0, h / 2, -d / 2]],
    [[w, h, wallThick], [0, h / 2, d / 2]],
    [[wallThick, h, d], [-w / 2, h / 2, 0]],
    [[wallThick, h, d], [w / 2, h / 2, 0]],
  ];
  for (const [size, pos] of wallDefs) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(...size), wallMat);
    wall.position.set(...pos);
    wall.receiveShadow = true;
    group.add(wall);
  }

  const light = new THREE.PointLight(isCasino ? 0xffcc66 : 0xfff2d8, isCasino ? 4 : 2.2, isCasino ? 32 : 16);
  light.position.set(0, h - 0.3, 0);
  group.add(light);
  group.add(new THREE.AmbientLight(0xffffff, 0.4));

  // counter the clerk stands behind, against the back wall (the wall the
  // player faces when they walk in from the entry point at +d/2)
  const counterMat = new THREE.MeshStandardMaterial({ color: shop.color, roughness: 0.5, metalness: 0.3 });
  const counter = new THREE.Mesh(new THREE.BoxGeometry(isCasino ? 7 : 3, 1, 0.8), counterMat);
  counter.position.set(0, 0.5, -d / 2 + 1.6);
  counter.castShadow = true;
  group.add(counter);

  const clerk = buildHumanoid({ shirt: shop.color, hair: 0x2a1e16 });
  clerk.root.position.set(0, 0, -d / 2 + 2.4);
  clerk.root.rotation.y = Math.PI;
  group.add(clerk.root);
  const npcs = [clerk];

  if (isCasino) {
    const slotColors = [0xd23a3a, 0x2255aa, 0x2f8a4a, 0xffa62b];
    for (let i = 0; i < slotColors.length; i++) {
      const cab = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1.9, 1),
        new THREE.MeshStandardMaterial({ color: slotColors[i], emissive: slotColors[i], emissiveIntensity: 0.5, roughness: 0.4 })
      );
      cab.position.set(-w / 2 + 2 + i * 2.4, 0.95, d / 2 - 3);
      cab.castShadow = true;
      group.add(cab);
      // a patron in front of every other machine
      if (i % 2 === 0) {
        const patron = buildHumanoid({ shirt: 0x445566 + i * 0x030303, hairStyle: i % 4 === 0 ? 'short' : 'long' });
        patron.root.position.set(cab.position.x, 0, d / 2 - 4.4);
        group.add(patron.root);
        npcs.push(patron);
      }
    }
    // a roulette-ish table in the middle of the floor
    const table = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.9, 20), new THREE.MeshStandardMaterial({ color: 0x1a1020, roughness: 0.4 }));
    table.position.set(w / 2 - 5, 0.45, 0);
    table.castShadow = true;
    group.add(table);
    const dealer = buildHumanoid({ shirt: 0x111111 });
    dealer.root.position.set(w / 2 - 5, 0, -1.9);
    dealer.root.rotation.y = Math.PI;
    group.add(dealer.root);
    npcs.push(dealer);
  }

  const entryPoint = new THREE.Vector3(center.x, center.y, center.z + d / 2 - 1.4);
  return { group, entryPoint, npcs };
}
