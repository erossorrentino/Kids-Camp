import * as THREE from 'three';
import { VEHICLE, VEHICLE_HEALTH } from '../config.js';
import { resolveVehicleVsBoxes } from '../world/collision.js';

const HALF_LENGTH = 2.2;
const HALF_WIDTH = 1.0;
const BIKE_HALF_LENGTH = 1.5;
const BIKE_HALF_WIDTH = 0.32;

function buildCarMesh(color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(HALF_WIDTH * 2, 1.1, HALF_LENGTH * 2),
    new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 })
  );
  body.position.y = 0.75;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(HALF_WIDTH * 1.6, 0.6, HALF_LENGTH * 1.1),
    new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.2, metalness: 0.1 })
  );
  cabin.position.set(0, 1.35, -0.1);
  group.add(cabin);

  const wheels = [];
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
    group.add(w);
    wheels.push({ mesh: w, front: i < 2 });
  });

  const tailLights = new THREE.Mesh(
    new THREE.BoxGeometry(HALF_WIDTH * 1.9, 0.2, 0.05),
    new THREE.MeshBasicMaterial({ color: 0x330000 })
  );
  tailLights.position.set(0, 0.8, HALF_LENGTH - 0.02);
  group.add(tailLights);

  const neon = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF_WIDTH * 2.6, HALF_LENGTH * 2.6),
    new THREE.MeshBasicMaterial({ color: 0x00eaff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  neon.rotation.x = -Math.PI / 2;
  neon.position.y = 0.05;
  neon.visible = false;
  group.add(neon);

  return { group, bodyMesh: body, wheels, tailLights, neon, halfLength: HALF_LENGTH, halfWidth: HALF_WIDTH };
}

function buildBikeMesh(color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(BIKE_HALF_WIDTH * 2, 0.5, BIKE_HALF_LENGTH * 2),
    new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 })
  );
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);

  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(BIKE_HALF_WIDTH * 1.6, 0.2, BIKE_HALF_LENGTH * 0.9),
    new THREE.MeshStandardMaterial({ color: 0x1a1d22 })
  );
  seat.position.set(0, 0.85, -0.2);
  group.add(seat);

  const handlebar = new THREE.Mesh(
    new THREE.BoxGeometry(BIKE_HALF_WIDTH * 2.4, 0.08, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x222222 })
  );
  handlebar.position.set(0, 0.95, BIKE_HALF_LENGTH - 0.2);
  group.add(handlebar);

  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.22, 14);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  [[0, 0.42, BIKE_HALF_LENGTH - 0.3, true], [0, 0.42, -BIKE_HALF_LENGTH + 0.3, false]].forEach(([x, y, z, front]) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, y, z);
    w.castShadow = true;
    group.add(w);
    wheels.push({ mesh: w, front });
  });

  const tailLights = new THREE.Mesh(
    new THREE.BoxGeometry(BIKE_HALF_WIDTH * 1.8, 0.15, 0.05),
    new THREE.MeshBasicMaterial({ color: 0x330000 })
  );
  tailLights.position.set(0, 0.7, -BIKE_HALF_LENGTH + 0.02);
  group.add(tailLights);

  const neon = new THREE.Mesh(
    new THREE.PlaneGeometry(BIKE_HALF_WIDTH * 3, BIKE_HALF_LENGTH * 2.4),
    new THREE.MeshBasicMaterial({ color: 0x00eaff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  neon.rotation.x = -Math.PI / 2;
  neon.position.y = 0.04;
  neon.visible = false;
  group.add(neon);

  return { group, bodyMesh: body, wheels, tailLights, neon, halfLength: BIKE_HALF_LENGTH, halfWidth: BIKE_HALF_WIDTH };
}

const PAINT_COLORS = [0xcc3333, 0x2255aa, 0x22aa55, 0xdddddd, 0x111111, 0xffcc00, 0xaa22cc];
const NEON_OPTIONS = [null, 0x00eaff, 0xff00aa, 0x39ff14, 0xff2a2a, 0xffee00];

export class Vehicle {
  constructor(scene, { position = new THREE.Vector3(), color = 0xcc3333, isPlayerStarter = false, stats = VEHICLE, isBike = false } = {}) {
    const built = isBike ? buildBikeMesh(color) : buildCarMesh(color);
    this.mesh = built.group;
    this.bodyMesh = built.bodyMesh;
    this.bodyMesh.userData.kind = 'vehicle';
    this.bodyMesh.userData.ref = this;
    this.wheels = built.wheels;
    this.tailLights = built.tailLights;
    this.neonMesh = built.neon;
    this.halfLength = built.halfLength;
    this.halfWidth = built.halfWidth;
    this.isBike = isBike;
    this.stats = stats;

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

    this.maxHealth = stats.health ?? VEHICLE_HEALTH;
    this.health = this.maxHealth;
    this.destroyed = false;

    this._colorIdx = 0;
    this._neonIdx = 0;
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  update(dt, input, world, onDrift, traction = 1) {
    if (!this.occupied) { this._settleWheels(); return { collided: false }; }
    const throttle = input.isDown('KeyW') ? 1 : input.isDown('KeyS') ? -1 : 0;
    const steer = (input.isDown('KeyA') ? -1 : 0) + (input.isDown('KeyD') ? 1 : 0);
    return this._physicsStep(dt, throttle, steer, world, onDrift, 1, traction);
  }

  // Autopilot entry point shared by traffic and police AI: drives the same
  // physics/collision code the player uses, just with a computed input.
  driveTowards(dt, world, targetPos, speedLimitFrac = 1, onDrift, traction = 1) {
    const dx = targetPos.x - this.mesh.position.x;
    const dz = targetPos.z - this.mesh.position.z;
    const dist = Math.hypot(dx, dz);
    const desiredHeading = Math.atan2(dx, dz);
    let diff = ((desiredHeading - this.heading + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    const steer = THREE.MathUtils.clamp(diff * 1.6, -1, 1);
    const throttle = dist < 2.5 ? 0 : (Math.abs(diff) > 2.2 ? -1 : 1);
    this._physicsStep(dt, throttle, steer, world, onDrift, speedLimitFrac, traction);
    return dist;
  }

  _physicsStep(dt, throttle, steer, world, onDrift, speedLimitFrac = 1, traction = 1) {
    this.steerInput = THREE.MathUtils.lerp(this.steerInput, steer, Math.min(1, 10 * dt));
    const stats = this.stats;
    const maxSpeed = stats.maxSpeed * speedLimitFrac;

    // acceleration / braking / reverse
    if (throttle > 0) {
      this.speed = Math.min(maxSpeed, this.speed + stats.accel * dt);
    } else if (throttle < 0) {
      if (this.speed > 0.5) this.speed = Math.max(0, this.speed - stats.brake * traction * dt);
      else this.speed = Math.max(-stats.reverseMaxSpeed, this.speed - stats.accel * dt);
    } else {
      const sign = Math.sign(this.speed);
      this.speed -= sign * stats.friction * dt;
      if (Math.sign(this.speed) !== sign) this.speed = 0;
    }

    const speedFrac = Math.min(1, Math.abs(this.speed) / stats.maxSpeed);
    const steerAuthority = (1 - speedFrac * 0.7) * traction; // less agile at speed, and on wet roads
    let turnRate = this.steerInput * stats.turnRate * steerAuthority;

    // drifting: sharp turns at high speed (or any slick-road turn) break rear
    // grip and add oversteer; wet roads amplify the oversteer once sliding
    const sharpTurn = Math.abs(this.steerInput) > stats.driftThreshold * traction;
    this.isDrifting = sharpTurn && speedFrac > 0.45 && Math.abs(this.speed) > 4;
    if (this.isDrifting) {
      this.driftIntensity = Math.min(1, this.driftIntensity + dt * 3);
      turnRate *= 1 + stats.driftGripLoss * this.driftIntensity * (2 - traction);
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
    const resolved = resolveVehicleVsBoxes(nx, nz, this.halfLength, this.halfWidth, colliders);
    let collided = false;
    if (resolved.hit) {
      collided = true;
      // reflect velocity off the impact normal and bleed speed (elastic-ish bounce)
      const velX = fwd.x * this.speed, velZ = fwd.z * this.speed;
      const dot = velX * resolved.normal.x + velZ * resolved.normal.z;
      const rx = velX - 2 * dot * resolved.normal.x;
      const rz = velZ - 2 * dot * resolved.normal.z;
      const impactSpeed = Math.hypot(velX, velZ);
      this.speed = Math.hypot(rx, rz) * stats.bodyRestitution * Math.sign(this.speed || 1);
      this.heading = Math.atan2(rx, rz);
      if (impactSpeed > 14) this.takeDamage((impactSpeed - 14) * 2.2);
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

  takeDamage(amount) {
    if (this.destroyed) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) this.destroyed = true;
  }

  cycleColor() {
    this._colorIdx = (this._colorIdx + 1) % PAINT_COLORS.length;
    this.bodyMesh.material.color.setHex(PAINT_COLORS[this._colorIdx]);
  }

  toggleNeon() {
    this._neonIdx = (this._neonIdx + 1) % NEON_OPTIONS.length;
    const c = NEON_OPTIONS[this._neonIdx];
    if (c === null) { this.neonMesh.visible = false; return; }
    this.neonMesh.visible = true;
    this.neonMesh.material.color.setHex(c);
  }

  _settleWheels() {
    for (const w of this.wheels) if (w.front) w.mesh.rotation.y = THREE.MathUtils.lerp(w.mesh.rotation.y, 0, 0.1);
  }

  getExitOffset() {
    const right = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    return new THREE.Vector3().copy(this.mesh.position).addScaledVector(right, this.halfWidth + 1.2);
  }
}
