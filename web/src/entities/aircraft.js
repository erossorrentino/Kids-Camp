import * as THREE from '../../vendor/three/three.module.js';
import { HELI, JET } from '../config.js';

const GRAVITY = 9.8;

function buildHeliMesh(tint = 0x3a3f46) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.9, 2.4, 4, 8),
    new THREE.MeshStandardMaterial({ color: tint, roughness: 0.4, metalness: 0.4 })
  );
  body.rotation.z = Math.PI / 2;
  body.position.y = 1.6;
  body.castShadow = true;
  group.add(body);

  const tailBoom = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.35, 3.2, 8),
    new THREE.MeshStandardMaterial({ color: tint })
  );
  tailBoom.rotation.z = Math.PI / 2;
  tailBoom.position.set(0, 1.6, -3.0);
  group.add(tailBoom);

  const rotor = new THREE.Mesh(
    new THREE.BoxGeometry(7.5, 0.08, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x111111 })
  );
  rotor.position.set(0, 2.9, 0);
  group.add(rotor);

  const tailRotor = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 1.0, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x111111 })
  );
  tailRotor.position.set(0.25, 1.9, -4.5);
  group.add(tailRotor);

  const skidGeo = new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6);
  const skidMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  [-0.9, 0.9].forEach((x) => {
    const skid = new THREE.Mesh(skidGeo, skidMat);
    skid.rotation.z = Math.PI / 2;
    skid.position.set(x, 0.35, 0);
    group.add(skid);
  });

  return { group, rotor, tailRotor };
}

export class Helicopter {
  constructor(scene, position, { color, speedMul = 1, handlingMul = 1 } = {}) {
    const { group, rotor, tailRotor } = buildHeliMesh(color);
    this.mesh = group;
    this.rotor = rotor;
    this.tailRotor = tailRotor;
    this.mesh.position.copy(position);
    scene.add(this.mesh);

    this.heading = 0;
    this.pitch = 0;
    this.roll = 0;
    this.velocity = new THREE.Vector3();
    this.rotorSpeed = 0;
    this.occupied = false;
    this.enterRange = HELI.enterRange;
    this.speedMul = speedMul;
    this.handlingMul = handlingMul;
  }

  update(dt, input) {
    if (!this.occupied) {
      this.rotorSpeed = Math.max(0, this.rotorSpeed - dt * 0.5);
      this._spinRotor(dt);
      return;
    }
    this.rotorSpeed = Math.min(1, this.rotorSpeed + dt / HELI.rotorSpinUpTime);

    const ascend = input.isDown('ShiftLeft') || input.isDown('ShiftRight') ? 1 : 0;
    const descend = input.isDown('Space') ? 1 : 0;
    const pitchIn = (input.isDownAny('KeyW', 'ArrowUp') ? -1 : 0) + (input.isDownAny('KeyS', 'ArrowDown') ? 1 : 0);
    // roll right (banking toward screen-right) needs a negative rollIn from
    // the right key — same convention fix as the car's steer, see vehicle.js.
    const rollIn = (input.isDownAny('KeyA', 'ArrowLeft') ? 1 : 0) + (input.isDownAny('KeyD', 'ArrowRight') ? -1 : 0);
    const yawIn = (input.isDown('KeyQ') ? -1 : 0) + (input.isDown('KeyE') ? 1 : 0);

    const targetPitch = pitchIn * 0.35;
    const targetRoll = rollIn * 0.35;
    this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, Math.min(1, HELI.pitchRollRate * this.handlingMul * dt));
    this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, Math.min(1, HELI.pitchRollRate * this.handlingMul * dt));
    this.heading += yawIn * HELI.yawRate * this.handlingMul * dt;

    // full rotor speed exactly cancels gravity (a stable hover); below that the
    // rotor can't fully support the craft and it sinks, matching a real heli
    // spooling up. Shift/Space add climb/descend on top of that baseline.
    const lift = this.rotorSpeed * GRAVITY - GRAVITY;
    this.velocity.y += (lift + (ascend - descend) * HELI.ascendSpeed * this.speedMul * this.rotorSpeed) * dt;
    this.velocity.y *= 1 - HELI.drag * dt;

    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const accel = 14 * this.speedMul * this.rotorSpeed;
    this.velocity.addScaledVector(fwd, -this.pitch * accel * dt);
    this.velocity.addScaledVector(right, this.roll * accel * dt);
    this.velocity.x *= 1 - HELI.drag * dt;
    this.velocity.z *= 1 - HELI.drag * dt;

    this.mesh.position.addScaledVector(this.velocity, dt);
    if (this.mesh.position.y < 0.4) { this.mesh.position.y = 0.4; this.velocity.y = Math.max(0, this.velocity.y); }

    this.mesh.rotation.set(this.pitch, this.heading, -this.roll, 'YXZ');
    this._spinRotor(dt);
  }

  _spinRotor(dt) {
    this.rotor.rotation.y += (0.5 + this.rotorSpeed * 40) * dt;
    this.tailRotor.rotation.x += (0.5 + this.rotorSpeed * 60) * dt;
  }

  get speed() { return this.velocity.length(); }
}

function buildJetMesh(tint = 0x5b6b78) {
  const group = new THREE.Group();
  const fuselage = new THREE.Mesh(
    new THREE.ConeGeometry(0.8, 5.5, 8),
    new THREE.MeshStandardMaterial({ color: tint, roughness: 0.3, metalness: 0.6 })
  );
  fuselage.rotation.x = Math.PI / 2;
  fuselage.castShadow = true;
  group.add(fuselage);

  const wingGeo = new THREE.BoxGeometry(6.5, 0.12, 1.4);
  const wingMat = new THREE.MeshStandardMaterial({ color: 0x3f4a54 });
  const wing = new THREE.Mesh(wingGeo, wingMat);
  wing.position.set(0, -0.1, 0.2);
  group.add(wing);

  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.8), wingMat);
  tailWing.position.set(0, 0.1, 2.4);
  group.add(tailWing);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 1.0), wingMat);
  fin.position.set(0, 0.6, 2.4);
  group.add(fin);

  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.35, 1.2, 8),
    new THREE.MeshBasicMaterial({ color: 0xff8a33, transparent: true, opacity: 0.85 })
  );
  flame.rotation.x = -Math.PI / 2;
  flame.position.set(0, 0, 3.2);
  group.add(flame);

  return { group, flame };
}

export class Jet {
  constructor(scene, position, { color, speedMul = 1, handlingMul = 1 } = {}) {
    const { group, flame } = buildJetMesh(color);
    this.mesh = group;
    this.flame = flame;
    this.mesh.position.copy(position);
    scene.add(this.mesh);

    this.heading = 0;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.occupied = false;
    this.stalling = false;
    this.enterRange = JET.enterRange;
    this.speedMul = speedMul;
    this.handlingMul = handlingMul;
  }

  update(dt, input) {
    if (!this.occupied) return;

    const throttle = (input.isDown('KeyW') ? 1 : 0) + (input.isDown('KeyS') ? -1 : 0);
    const rollIn = (input.isDown('KeyA') ? -1 : 0) + (input.isDown('KeyD') ? 1 : 0);
    const pitchIn = (input.isDown('ArrowUp') ? -1 : 0) + (input.isDown('ArrowDown') ? 1 : 0);
    const yawIn = (input.isDown('ArrowLeft') ? -1 : 0) + (input.isDown('ArrowRight') ? 1 : 0)
      + (input.isDown('KeyQ') ? -1 : 0) + (input.isDown('KeyE') ? 1 : 0);

    const maxSpeed = JET.maxSpeed * this.speedMul;
    this.speed = THREE.MathUtils.clamp(this.speed + throttle * JET.throttleAccel * this.speedMul * dt, 0, maxSpeed);

    const targetRoll = rollIn * 0.9;
    this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, Math.min(1, JET.rollRate * this.handlingMul * dt));
    const targetPitch = pitchIn * 0.6;
    this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, Math.min(1, JET.pitchRate * this.handlingMul * dt));

    // banking contributes to turn rate (arcade bank-to-turn), plus direct yaw input
    this.heading += (yawIn * JET.yawRate * this.handlingMul - this.roll * 0.8) * dt;

    this.stalling = this.speed < JET.minLiftSpeed;
    const speedFrac = this.speed / maxSpeed;
    const climbRate = this.stalling ? -JET.stallSinkRate : -this.pitch * JET.liftCoefficient * this.speed * 0.3;

    const fwd = new THREE.Vector3(
      Math.sin(this.heading) * Math.cos(this.pitch),
      -Math.sin(this.pitch) * (this.stalling ? 0.3 : 1),
      Math.cos(this.heading) * Math.cos(this.pitch)
    ).normalize();

    const wasAirborne = this.mesh.position.y > 1.05;
    this.mesh.position.addScaledVector(fwd, this.speed * dt);
    this.mesh.position.y += climbRate * dt * (this.stalling ? 1 : 0.4);
    if (this.mesh.position.y < 1) {
      this.mesh.position.y = 1;
      // only bleed speed on an actual hard landing, not every frame spent
      // taxiing/accelerating on the runway at ground level
      if (wasAirborne && this.speed > 5) this.speed *= 0.9;
    }

    this.mesh.rotation.set(this.pitch + (this.stalling ? 0.3 : 0), this.heading, -this.roll, 'YXZ');
    this.flame.scale.set(1, 0.6 + speedFrac * 1.4, 1);
  }
}
