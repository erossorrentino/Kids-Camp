import * as THREE from '../../vendor/three/three.module.js';

// A tall translucent light-column + spinning ring, used to mark a world
// position the player needs to walk/drive/fly to (mission targets, the
// player-set map waypoint). Shared so every marker looks and behaves the same.
export function buildBeacon(scene, position, color = 0xffd23f) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 40, 16, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = 20;
  group.add(beam);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.15, 8, 24),
    new THREE.MeshBasicMaterial({ color })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.3;
  group.add(ring);

  group.position.copy(position);
  scene.add(group);
  return { group, ring };
}
