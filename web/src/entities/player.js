import * as THREE from '../../vendor/three/three.module.js';
import { PLAYER } from '../config.js';
import { resolveCircleVsBoxes } from '../world/collision.js';
import { buildHumanoid } from './humanoid.js';

function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export const PlayerState = {
  IDLE: 'IDLE', WALKING: 'WALKING', RUNNING: 'RUNNING', JUMPING: 'JUMPING', FALLING: 'FALLING', SWIMMING: 'SWIMMING',
};

export class Player {
  constructor(scene) {
    this.mesh = new THREE.Group();

    const body = buildHumanoid({});
    this.mesh.add(body.root);
    this.body = body;
    this.bodyMesh = body.torso; // kept for external references expecting a single "body" mesh

    // anchor point for the currently equipped weapon's visual mesh — parented
    // to the right hand's lower-arm pivot so the gun tracks arm swing
    this.handAnchor = new THREE.Object3D();
    this.handAnchor.position.set(0, -0.32, 0.05);
    body.arms[1].lowerPivot.add(this.handAnchor);

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

  update(dt, input, cameraRig, world, swimming = false) {
    const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const aiming = input.isMouseDown(2);
    this.swimming = swimming;

    let ix = 0, iz = 0;
    if (input.isDownAny('KeyW', 'ArrowUp')) iz += 1;
    if (input.isDownAny('KeyS', 'ArrowDown')) iz -= 1;
    if (input.isDownAny('KeyD', 'ArrowRight')) ix += 1;
    if (input.isDownAny('KeyA', 'ArrowLeft')) ix -= 1;
    const moving = ix !== 0 || iz !== 0;

    const fwd = cameraRig.flatForward || new THREE.Vector3(0, 0, 1);
    // True screen-right relative to the camera's forward (cross(forward, up))
    // — was previously inverted, which made D/→ strafe left on screen.
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const moveDir = new THREE.Vector3()
      .addScaledVector(fwd, iz)
      .addScaledVector(right, ix);
    if (moveDir.lengthSq() > 0) moveDir.normalize();

    const targetSpeed = moving ? (swimming ? PLAYER.swimSpeed : (sprint ? PLAYER.runSpeed : PLAYER.walkSpeed)) : 0;
    this.horizontalSpeed = targetSpeed;

    let nx = this.mesh.position.x + moveDir.x * targetSpeed * dt;
    let nz = this.mesh.position.z + moveDir.z * targetSpeed * dt;

    const colliders = world.getCollidersNear(this.mesh.position.x, this.mesh.position.z, 20);
    const resolved = resolveCircleVsBoxes(nx, nz, PLAYER.radius, colliders);
    this.mesh.position.x = resolved.x;
    this.mesh.position.z = resolved.z;

    // gravity / jump — skipped while swimming: Game sets the Y position
    // directly there (see its swim-depth lerp), so fighting it with gravity
    // would just fling the player back to the seabed the next frame.
    if (!swimming) {
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
    } else {
      this.velocityY = 0;
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
    if (swimming) {
      this.state = PlayerState.SWIMMING;
    } else if (!this.grounded) {
      this.state = this.velocityY > 0 ? PlayerState.JUMPING : PlayerState.FALLING;
    } else if (targetSpeed > PLAYER.walkSpeed + 0.1) {
      this.state = PlayerState.RUNNING;
    } else if (targetSpeed > 0.1) {
      this.state = PlayerState.WALKING;
    } else {
      this.state = PlayerState.IDLE;
    }

    this._animate(dt, aiming);
  }

  // Procedural walk-cycle: swings arm/leg pivots opposite each other and
  // bobs the hips, so the state machine reads visually on a rigless model.
  _animate(dt, aiming) {
    this._bobT = (this._bobT || 0) + dt;
    let amp = 0, rate = 0, bob = 0;
    if (this.state === PlayerState.WALKING) { amp = 0.5; rate = 7; bob = 0.035; }
    else if (this.state === PlayerState.RUNNING) { amp = 0.9; rate = 11; bob = 0.06; }
    else if (this.state === PlayerState.JUMPING || this.state === PlayerState.FALLING) { amp = 0.3; rate = 0; bob = 0; }

    const t = this._bobT * rate;
    const swing = Math.sin(t) * amp;
    const { arms, legs, hips } = this.body;

    if (this.state === PlayerState.SWIMMING) {
      // A slow alternating freestyle-style arm sweep (big shoulder rotation,
      // elbow bending on the recovery half) over a quick flutter-kick leg
      // beat — deliberately a different rhythm from the walk cycle above so
      // swimming reads as its own thing, not "walking while wet."
      const strokeRate = 3.4, kickRate = 8;
      const strokeT = this._bobT * strokeRate;
      const s0 = Math.sin(strokeT), s1 = Math.sin(strokeT + Math.PI);
      arms[0].pivot.rotation.x = s0 * 2.0 - 0.6;
      arms[1].pivot.rotation.x = s1 * 2.0 - 0.6;
      arms[0].lowerPivot.rotation.x = Math.max(0, -s0) * 1.1;
      arms[1].lowerPivot.rotation.x = Math.max(0, -s1) * 1.1;
      const kick = Math.sin(this._bobT * kickRate) * 0.3;
      legs[0].pivot.rotation.x = kick;
      legs[1].pivot.rotation.x = -kick;
      hips.position.y = 0.86 + Math.sin(strokeT * 2) * 0.02;
      return;
    }

    if (rate > 0) {
      arms[0].pivot.rotation.x = swing;
      arms[1].pivot.rotation.x = -swing;
      legs[0].pivot.rotation.x = -swing * 0.8;
      legs[1].pivot.rotation.x = swing * 0.8;
      arms[0].lowerPivot.rotation.x = Math.max(0, -swing) * 0.6;
      arms[1].lowerPivot.rotation.x = Math.max(0, swing) * 0.6;
      hips.position.y = 0.86 + Math.abs(Math.sin(t)) * bob;
    } else if (this.state === PlayerState.JUMPING || this.state === PlayerState.FALLING) {
      const spread = this.state === PlayerState.JUMPING ? -0.6 : 0.4;
      arms[0].pivot.rotation.x = THREE.MathUtils.lerp(arms[0].pivot.rotation.x, spread, Math.min(1, 8 * dt));
      arms[1].pivot.rotation.x = THREE.MathUtils.lerp(arms[1].pivot.rotation.x, spread, Math.min(1, 8 * dt));
      legs[0].pivot.rotation.x = THREE.MathUtils.lerp(legs[0].pivot.rotation.x, 0.15, Math.min(1, 8 * dt));
      legs[1].pivot.rotation.x = THREE.MathUtils.lerp(legs[1].pivot.rotation.x, -0.15, Math.min(1, 8 * dt));
      hips.position.y = THREE.MathUtils.lerp(hips.position.y, 0.86, Math.min(1, 8 * dt));
    } else {
      // idle: settle limbs and add a faint breathing sway
      for (const limb of [...arms, ...legs]) {
        limb.pivot.rotation.x = THREE.MathUtils.lerp(limb.pivot.rotation.x, 0, Math.min(1, 6 * dt));
        limb.lowerPivot.rotation.x = THREE.MathUtils.lerp(limb.lowerPivot.rotation.x, 0, Math.min(1, 6 * dt));
      }
      hips.position.y = THREE.MathUtils.lerp(hips.position.y, 0.86 + Math.sin(this._bobT * 1.4) * 0.006, 0.1);
    }

    // aiming raises the right arm toward a level firing pose
    const aimTarget = aiming ? -1.5 : 0;
    arms[1].pivot.rotation.x = THREE.MathUtils.lerp(arms[1].pivot.rotation.x, aimTarget, Math.min(1, 10 * dt));
    if (aiming) arms[1].lowerPivot.rotation.x = THREE.MathUtils.lerp(arms[1].lowerPivot.rotation.x, 0.1, Math.min(1, 10 * dt));
  }
}
