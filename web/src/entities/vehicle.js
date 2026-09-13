import * as THREE from 'three';
import { VEHICLE } from '../config.js';
import { resolveVehicleVsBoxes } from '../world/collision.js';

const HALF_LENGTH = 2.2;
const HALF_WIDTH = 1.0;

export class Vehicle {
  constructor(scene, { position = new THREE.Vector3(), color = 0xcc3333, isPlayerStarter = false } = {}) {
    this.mesh = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(HALF_WIDTH * 2, 1.1, HALF_LENGTH * 2),
      new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 })
    );
    body.position.y = 0.75;
    body.castShadow = true;
    body.userData.kind = 'vehicle';
    body.userData.ref = this;
    this.mesh.add(body);
    this.bodyMesh = body;

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(HALF_WIDTH * 1.6, 0.6, HALF_LENGTH * 1.1),
      new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.2, metalness: 0.1 })
    );
    cabin.position.set(0, 1.35, -0.1);
    this.mesh.add(cabin);

    this.wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const wheelPositions = [
      [-HALF_WIDTH - 0.05, 0.4, HALF_LENGTH - 0.6], [HALF_WIDTH + 0.05, 0.4, HALF_LENGTH - 0.6],
      [-HALF_WIDTH - 0.05, 0.4, -HALF_LENGTH + 0.6], [HALF_WIDTH + 0.05, 0.4, -HALF_LENGTH + 0.6],
    ];
    wheelPositions.forEach(([x, y, z], i) => {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, y, z);
      w.castShadow = true;
      this.mesh.add(w);
      this.wheels.push({ mesh: w, front: i < 2 });
    });

    this.tailLights = new THREE.Mesh(
      new THREE.BoxGeometry(HALF_WIDTH * 1.9, 0.2, 0.05),
      new THREE.MeshBasicMaterial({ color: 0x330000 })
    );
    this.tailLights.position.set(0, 0.8, HALF_LENGTH - 0.02);
    this.mesh.add(this.tailLights);

    this.mesh.position.copy(position);
    scene.add(this.mesh);

    this.heading = 0;
    this.speed = 0;
    this.steerInput = 0;
    this.isDrifting = false;
    this.driftIntensity = 0;
    this.occupied = false;
    this.isPlayerStarter = isPlayerStarter; // the demo car you start with — entering others counts as "stealing"
    this.wheelSpin = 0;
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  update(dt, input, world, onDrift) {
    if (!this.occupied) { this._settleWheels(); return { collided: false }; }
    const throttle = input.isDown('KeyW') ? 1 : input.isDown('KeyS') ? -1 : 0;
    const steer = (input.isDown('KeyA') ? -1 : 0) + (input.isDown('KeyD') ? 1 : 0);
    return this._physicsStep(dt, throttle, steer, world, onDrift);
  }

  // Autopilot entry point shared by traffic and police AI: drives the same
  // physics/collision code the player uses, just with a computed input.
  driveTowards(dt, world, targetPos, speedLimitFrac = 1, onDrift) {
    const dx = targetPos.x - this.mesh.position.x;
    const dz = targetPos.z - this.mesh.position.z;
    const dist = Math.hypot(dx, dz);
    const desiredHeading = Math.atan2(dx, dz);
    let diff = ((desiredHeading - this.heading + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    const steer = THREE.MathUtils.clamp(diff * 1.6, -1, 1);
    const throttle = dist < 2.5 ? 0 : (Math.abs(diff) > 2.2 ? -1 : 1);
    this._physicsStep(dt, throttle, steer, world, onDrift, speedLimitFrac);
    return dist;
  }

  _physicsStep(dt, throttle, steer, world, onDrift, speedLimitFrac = 1) {
    this.steerInput = THREE.MathUtils.lerp(this.steerInput, steer, Math.min(1, 10 * dt));
    const maxSpeed = VEHICLE.maxSpeed * speedLimitFrac;

    // acceleration / braking / reverse
    if (throttle > 0) {
      this.speed = Math.min(maxSpeed, this.speed + VEHICLE.accel * dt);
    } else if (throttle < 0) {
      if (this.speed > 0.5) this.speed = Math.max(0, this.speed - VEHICLE.brake * dt);
      else this.speed = Math.max(-VEHICLE.reverseMaxSpeed, this.speed - VEHICLE.accel * dt);
    } else {
      const sign = Math.sign(this.speed);
      this.speed -= sign * VEHICLE.friction * dt;
      if (Math.sign(this.speed) !== sign) this.speed = 0;
    }

    const speedFrac = Math.min(1, Math.abs(this.speed) / VEHICLE.maxSpeed);
    const steerAuthority = 1 - speedFrac * 0.7; // less agile at speed
    let turnRate = this.steerInput * VEHICLE.turnRate * steerAuthority;

    // drifting: sharp turns at high speed break rear grip and add oversteer
    const sharpTurn = Math.abs(this.steerInput) > VEHICLE.driftThreshold;
    this.isDrifting = sharpTurn && speedFrac > 0.45 && Math.abs(this.speed) > 4;
    if (this.isDrifting) {
      this.driftIntensity = Math.min(1, this.driftIntensity + dt * 3);
      turnRate *= 1 + VEHICLE.driftGripLoss * this.driftIntensity;
      this.speed *= 1 - 0.35 * dt; // scrub speed while sliding
      if (onDrift) onDrift(this);
    } else {
      this.driftIntensity = Math.max(0, this.driftIntensity - dt * 2.5);
    }

    if (Math.abs(this.speed) > 0.05) {
      this.heading += turnRate * dt * Math.sign(this.speed);
    }

    const fwd = this.forward;
    let nx = this.mesh.position.x + fwd.x * this.speed * dt;
    let nz = this.mesh.position.z + fwd.z * this.speed * dt;

    const colliders = world.getCollidersNear(this.mesh.position.x, this.mesh.position.z, 25);
    const resolved = resolveVehicleVsBoxes(nx, nz, HALF_LENGTH, HALF_WIDTH, colliders);
    let collided = false;
    if (resolved.hit) {
      collided = true;
      // reflect velocity off the impact normal and bleed speed (elastic-ish bounce)
      const velX = fwd.x * this.speed, velZ = fwd.z * this.speed;
      const dot = velX * resolved.normal.x + velZ * resolved.normal.z;
      const rx = velX - 2 * dot * resolved.normal.x;
      const rz = velZ - 2 * dot * resolved.normal.z;
      this.speed = Math.hypot(rx, rz) * VEHICLE.bodyRestitution * Math.sign(this.speed || 1);
      this.heading = Math.atan2(rx, rz);
    }
    this.mesh.position.x = resolved.x;
    this.mesh.position.z = resolved.z;
    this.mesh.rotation.y = this.heading;

    // wheel visuals
    this.wheelSpin += this.speed * dt * 2.2;
    for (const w of this.wheels) {
      w.mesh.rotation.x = this.wheelSpin;
      if (w.front) w.mesh.rotation.y = this.steerInput * 0.5;
    }
    this.tailLights.material.color.setHex(throttle < 0 || this.speed < -0.1 ? 0xff2222 : 0x330000);

    return { collided };
  }

  _settleWheels() {
    for (const w of this.wheels) if (w.front) w.mesh.rotation.y = THREE.MathUtils.lerp(w.mesh.rotation.y, 0, 0.1);
  }

  getExitOffset() {
    const right = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    return new THREE.Vector3().copy(this.mesh.position).addScaledVector(right, HALF_WIDTH + 1.2);
  }
}
