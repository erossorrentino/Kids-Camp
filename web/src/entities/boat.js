import * as THREE from '../../vendor/three/three.module.js';
import { BOAT, WATER } from '../config.js';

function buildBoatMesh() {
  const group = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.45, metalness: 0.25 });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 5.0), hullMat);
  hull.position.y = 0.45;
  hull.castShadow = true;
  group.add(hull);

  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.35, 2.0, 4), hullMat);
  bow.rotation.x = -Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.scale.set(0.85, 1, 0.55);
  bow.position.set(0, 0.45, 3.4);
  bow.castShadow = true;
  group.add(bow);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.95, 1.7),
    new THREE.MeshStandardMaterial({ color: 0x2255aa, roughness: 0.5, metalness: 0.2 })
  );
  cabin.position.set(0, 1.35, 0.1);
  cabin.castShadow = true;
  group.add(cabin);

  const windshield = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.5, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x0c1620, roughness: 0.1, metalness: 0.4, transparent: true, opacity: 0.55 })
  );
  windshield.position.set(0, 1.55, 0.95);
  group.add(windshield);

  const railMat = new THREE.MeshStandardMaterial({ color: 0xcfd4da, roughness: 0.5, metalness: 0.6 });
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 4.6), railMat);
    rail.position.set(s * 1.02, 1.02, -0.1);
    group.add(rail);
  }

  const wake = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 5),
    new THREE.MeshBasicMaterial({ color: 0xdff5ff, transparent: true, opacity: 0.35, depthWrite: false })
  );
  wake.rotation.x = -Math.PI / 2;
  wake.position.set(0, 0.05, -1.5);
  wake.visible = false;
  group.add(wake);

  return { group, wake };
}

// A simple drivable boat: same accel/brake/turn feel as a car, but it floats
// at the sea surface instead of colliding with roads/buildings, and it's
// only obtainable via a BOAT_SHOP (see systems/shops.js) — not one of the
// free starter vehicles. Not destructible, matching the Helicopter/Jet.
export class Boat {
  constructor(scene, position) {
    const { group, wake } = buildBoatMesh();
    this.mesh = group;
    this.wake = wake;
    this.mesh.position.copy(position);
    scene.add(this.mesh);

    this.heading = 0;
    this.speed = 0;
    this.steerInput = 0;
    this.occupied = false;
    this.enterRange = BOAT.enterRange;
    this._bobT = Math.random() * 10;
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  update(dt, input) {
    this._bobT += dt;
    if (!this.occupied) return;

    const throttle = input.isDownAny('KeyW', 'ArrowUp') ? 1 : input.isDownAny('KeyS', 'ArrowDown') ? -1 : 0;
    const steer = (input.isDownAny('KeyA', 'ArrowLeft') ? 1 : 0) + (input.isDownAny('KeyD', 'ArrowRight') ? -1 : 0);

    if (throttle > 0) {
      this.speed = Math.min(BOAT.maxSpeed, this.speed + BOAT.accel * dt);
    } else if (throttle < 0) {
      if (this.speed > 0.5) this.speed = Math.max(0, this.speed - BOAT.brake * dt);
      else this.speed = Math.max(-BOAT.reverseMaxSpeed, this.speed - BOAT.accel * dt);
    } else {
      const sign = Math.sign(this.speed);
      this.speed -= sign * BOAT.friction * dt;
      if (Math.sign(this.speed) !== sign) this.speed = 0;
    }

    this.steerInput = THREE.MathUtils.lerp(this.steerInput, steer, Math.min(1, 8 * dt));
    const speedFrac = Math.min(1, Math.abs(this.speed) / BOAT.maxSpeed);
    if (Math.abs(this.speed) > 0.05) {
      this.heading += this.steerInput * BOAT.turnRate * (1 - speedFrac * 0.5) * dt * Math.sign(this.speed);
    }

    const fwd = this.forward;
    this.mesh.position.x += fwd.x * this.speed * dt;
    this.mesh.position.z += fwd.z * this.speed * dt;
    this.mesh.position.y = WATER.level + 0.1 + Math.sin(this._bobT * 1.3) * 0.05;
    this.mesh.rotation.y = this.heading;
    this.mesh.rotation.z = Math.sin(this._bobT * 0.9) * 0.02 - this.steerInput * speedFrac * 0.08;

    this.wake.visible = speedFrac > 0.05;
  }
}
