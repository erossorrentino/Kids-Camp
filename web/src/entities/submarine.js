import * as THREE from '../../vendor/three/three.module.js';
import { SUB, WATER } from '../config.js';

function buildSubMesh(tint = 0x2a3f45) {
  const group = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.4, metalness: 0.6 });

  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(1.05, 5.0, 6, 12), hullMat);
  hull.rotation.z = Math.PI / 2;
  hull.castShadow = true;
  group.add(hull);

  const sail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2, 1.7), hullMat);
  sail.position.set(0, 1.3, 0.4);
  sail.castShadow = true;
  group.add(sail);

  const periscope = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 0.7 })
  );
  periscope.position.set(0, 2.05, 0.4);
  group.add(periscope);

  const finGeo = new THREE.BoxGeometry(0.08, 0.75, 0.85);
  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(finGeo, hullMat);
    fin.position.set(s * 1.05, 0, -2.3);
    group.add(fin);
  }

  const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.6), hullMat);
  tailFin.position.set(0, 0.5, -2.5);
  group.add(tailFin);

  const bubbleMat = new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.3, depthWrite: false });
  const bubbles = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), bubbleMat);
  bubbles.position.set(0, 0, -2.9);
  bubbles.visible = false;
  group.add(bubbles);

  return { group, bubbles };
}

// A submarine: forward/back throttle + left/right yaw like a boat, plus a
// depth axis (Shift ascends, Space descends) clamped between the surface and
// SUB.maxDepth. Only obtainable via a SUB_SHOP. Not destructible, matching
// the Helicopter/Jet/Boat.
export class Submarine {
  constructor(scene, position, { color, speedMul = 1, handlingMul = 1 } = {}) {
    const { group, bubbles } = buildSubMesh(color);
    this.mesh = group;
    this.bubbles = bubbles;
    this.mesh.position.copy(position);
    scene.add(this.mesh);

    this.heading = 0;
    this.speed = 0;
    this.depth = 0; // 0 = surfaced, up to SUB.maxDepth
    this.occupied = false;
    this.enterRange = SUB.enterRange;
    this.speedMul = speedMul;
    this.handlingMul = handlingMul;
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  get depthFrac() { return this.depth / SUB.maxDepth; }

  update(dt, input) {
    if (!this.occupied) return;

    const throttle = input.isDownAny('KeyW', 'ArrowUp') ? 1 : input.isDownAny('KeyS', 'ArrowDown') ? -1 : 0;
    const steer = (input.isDownAny('KeyA', 'ArrowLeft') ? 1 : 0) + (input.isDownAny('KeyD', 'ArrowRight') ? -1 : 0);
    const ascend = input.isDown('ShiftLeft') || input.isDown('ShiftRight') ? 1 : 0;
    const descend = input.isDown('Space') ? 1 : 0;

    const maxSpeed = SUB.maxSpeed * this.speedMul;
    if (throttle > 0) this.speed = Math.min(maxSpeed, this.speed + SUB.throttleAccel * this.speedMul * dt);
    else if (throttle < 0) this.speed = Math.max(-maxSpeed * 0.4, this.speed - SUB.throttleAccel * this.speedMul * dt);
    else {
      const sign = Math.sign(this.speed);
      this.speed -= sign * SUB.throttleAccel * 0.6 * dt;
      if (Math.sign(this.speed) !== sign) this.speed = 0;
    }

    const turnAuthority = this.speed !== 0 ? 1 : 0.4;
    this.heading += steer * SUB.yawRate * this.handlingMul * dt * turnAuthority;
    this.depth = THREE.MathUtils.clamp(this.depth + (descend - ascend) * SUB.ascendSpeed * dt, 0, SUB.maxDepth);

    const fwd = this.forward;
    this.mesh.position.x += fwd.x * this.speed * dt;
    this.mesh.position.z += fwd.z * this.speed * dt;
    this.mesh.position.y = WATER.level - this.depth;
    this.mesh.rotation.y = this.heading;

    this.bubbles.visible = Math.abs(this.speed) > 1;
  }
}
