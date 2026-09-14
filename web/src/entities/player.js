import * as THREE from '../../vendor/three/three.module.js';
import { PLAYER } from '../config.js';
import { resolveCircleVsBoxes } from '../world/collision.js';

function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export const PlayerState = {
  IDLE: 'IDLE', WALKING: 'WALKING', RUNNING: 'RUNNING', JUMPING: 'JUMPING', FALLING: 'FALLING',
};

export class Player {
  constructor(scene) {
    this.mesh = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(PLAYER.radius, PLAYER.height - PLAYER.radius * 2, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0x2f6fbf, roughness: 0.6 })
    );
    body.position.y = PLAYER.height / 2;
    body.castShadow = true;
    this.mesh.add(body);
    this.bodyMesh = body;

    // a facing indicator (nose) so state/heading is visible without a rigged model
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0xffd23f }));
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, PLAYER.height - 0.3, PLAYER.radius + 0.15);
    this.mesh.add(nose);

    // anchor point for the currently equipped weapon's visual mesh
    this.handAnchor = new THREE.Object3D();
    this.handAnchor.position.set(0.35, PLAYER.height * 0.6, 0.25);
    this.mesh.add(this.handAnchor);

    scene.add(this.mesh);
    this.mesh.position.set(0, 0, 6);

    this.velocityY = 0;
    this.grounded = true;
    this.heading = 0; // radians, world-space facing
    this.horizontalSpeed = 0;
    this.state = PlayerState.IDLE;
    this.health = PLAYER.health;
    this.armor = PLAYER.armor;
    this.visible = true;
  }

  setVisible(v) {
    this.visible = v;
    this.mesh.visible = v;
  }

  takeDamage(amount) {
    const toArmor = Math.min(this.armor, amount * 0.5);
    this.armor -= toArmor;
    this.health -= (amount - toArmor);
    this.health = Math.max(0, this.health);
  }

  respawn() {
    this.health = PLAYER.health;
    this.armor = PLAYER.armor;
    this.velocityY = 0;
  }

  update(dt, input, cameraRig, world) {
    const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const aiming = input.isMouseDown(2);

    let ix = 0, iz = 0;
    if (input.isDown('KeyW')) iz += 1;
    if (input.isDown('KeyS')) iz -= 1;
    if (input.isDown('KeyD')) ix += 1;
    if (input.isDown('KeyA')) ix -= 1;
    const moving = ix !== 0 || iz !== 0;

    const fwd = cameraRig.flatForward || new THREE.Vector3(0, 0, 1);
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const moveDir = new THREE.Vector3()
      .addScaledVector(fwd, iz)
      .addScaledVector(right, ix);
    if (moveDir.lengthSq() > 0) moveDir.normalize();

    const targetSpeed = moving ? (sprint ? PLAYER.runSpeed : PLAYER.walkSpeed) : 0;
    this.horizontalSpeed = targetSpeed;

    let nx = this.mesh.position.x + moveDir.x * targetSpeed * dt;
    let nz = this.mesh.position.z + moveDir.z * targetSpeed * dt;

    const colliders = world.getCollidersNear(this.mesh.position.x, this.mesh.position.z, 20);
    const resolved = resolveCircleVsBoxes(nx, nz, PLAYER.radius, colliders);
    this.mesh.position.x = resolved.x;
    this.mesh.position.z = resolved.z;

    // gravity / jump
    if (this.grounded && input.wasPressed('Space')) {
      this.velocityY = PLAYER.jumpVelocity;
      this.grounded = false;
    }
    this.velocityY -= PLAYER.gravity * dt;
    this.mesh.position.y += this.velocityY * dt;
    if (this.mesh.position.y <= 0) {
      this.mesh.position.y = 0;
      this.velocityY = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    // facing: aim mode snaps to camera yaw for accurate shooting; otherwise
    // smoothly turn toward the movement direction (GTA-style third person).
    if (aiming) {
      this.heading = lerpAngle(this.heading, cameraRig.yaw, Math.min(1, PLAYER.turnLerp * dt));
    } else if (moving) {
      const targetHeading = Math.atan2(moveDir.x, moveDir.z);
      this.heading = lerpAngle(this.heading, targetHeading, Math.min(1, PLAYER.turnLerp * dt));
    }
    this.mesh.rotation.y = this.heading;

    // animation state machine
    if (!this.grounded) {
      this.state = this.velocityY > 0 ? PlayerState.JUMPING : PlayerState.FALLING;
    } else if (targetSpeed > PLAYER.walkSpeed + 0.1) {
      this.state = PlayerState.RUNNING;
    } else if (targetSpeed > 0.1) {
      this.state = PlayerState.WALKING;
    } else {
      this.state = PlayerState.IDLE;
    }

    this._bob(dt);
  }

  // Cheap procedural "animation": bob/tilt the capsule based on state so the
  // state machine reads visually even before a rigged model is attached.
  _bob(dt) {
    this._bobT = (this._bobT || 0) + dt;
    let bobAmt = 0, bobRate = 0;
    if (this.state === PlayerState.WALKING) { bobAmt = 0.05; bobRate = 8; }
    else if (this.state === PlayerState.RUNNING) { bobAmt = 0.09; bobRate = 12; }
    if (bobRate > 0) {
      this.bodyMesh.position.y = PLAYER.height / 2 + Math.sin(this._bobT * bobRate) * bobAmt;
    } else {
      this.bodyMesh.position.y = PLAYER.height / 2;
    }
    const tilt = this.state === PlayerState.JUMPING ? -0.12 : this.state === PlayerState.FALLING ? 0.12 : 0;
    this.bodyMesh.rotation.x = THREE.MathUtils.lerp(this.bodyMesh.rotation.x, tilt, Math.min(1, 8 * dt));
  }
}
