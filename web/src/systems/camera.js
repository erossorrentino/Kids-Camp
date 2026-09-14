import * as THREE from '../../vendor/three/three.module.js';
import { CAMERA } from '../config.js';

// Single camera rig that reconfigures itself per control mode instead of
// swapping cameras, so audio listener / renderer wiring stays simple.
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = -0.15;
    this.aiming = false;
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._initialized = false;
  }

  handleMouseFoot(input, aiming) {
    const sens = CAMERA.mouseSensitivity * (aiming ? CAMERA.aimSensitivityMul : 1);
    this.yaw -= input.mouseDX * sens;
    this.pitch -= input.mouseDY * sens;
    this.pitch = Math.max(-1.2, Math.min(0.9, this.pitch));
  }

  // Third-person orbit/aim camera anchored to the player.
  updateFoot(player, dt, aiming) {
    this.aiming = aiming;
    this.camera.up.set(0, 1, 0);
    const dist = this.aiming ? CAMERA.aimDist : CAMERA.followDist;
    const height = this.aiming ? CAMERA.aimHeight : CAMERA.followHeight;
    const sideOffset = this.aiming ? CAMERA.aimSideOffset : 0;

    const dirX = Math.sin(this.yaw) * Math.cos(this.pitch);
    const dirY = Math.sin(this.pitch);
    const dirZ = Math.cos(this.yaw) * Math.cos(this.pitch);

    const anchor = player.mesh.position;
    const back = new THREE.Vector3(-dirX, 0, -dirZ).normalize();
    const right = new THREE.Vector3(back.z, 0, -back.x);

    const desired = new THREE.Vector3()
      .copy(anchor)
      .addScaledVector(back, dist)
      .addScaledVector(right, sideOffset)
      .add(new THREE.Vector3(0, height - dirY * 2, 0));

    this._lerpTo(desired, dt);

    const lookTarget = new THREE.Vector3()
      .copy(anchor)
      .add(new THREE.Vector3(0, 1.4, 0))
      .addScaledVector(new THREE.Vector3(dirX, dirY, dirZ), 4)
      .addScaledVector(right, sideOffset);
    this._look.lerp(lookTarget, Math.min(1, CAMERA.lerpLook * dt));
    this.camera.lookAt(this._look);

    // expose facing direction for player movement-relative-to-camera & shooting ray
    this.forward = new THREE.Vector3(dirX, dirY, dirZ);
    this.flatForward = new THREE.Vector3(dirX, 0, dirZ).normalize();
    this.right = right;
  }

  // Chase camera for cars/boats: stays behind current heading, not mouse-driven.
  updateChase(vehicle, dt, opts = {}) {
    const heading = vehicle.heading;
    const back = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
    const dist = opts.dist ?? 8;
    const height = opts.height ?? 3.2;
    const desired = new THREE.Vector3()
      .copy(vehicle.mesh.position)
      .addScaledVector(back, dist)
      .add(new THREE.Vector3(0, height, 0));
    this._lerpTo(desired, dt, opts.posLerp ?? CAMERA.lerpPos);

    const lookTarget = new THREE.Vector3()
      .copy(vehicle.mesh.position)
      .add(new THREE.Vector3(0, 1.2, 0));
    this._look.lerp(lookTarget, Math.min(1, CAMERA.lerpLook * dt));

    if (opts.bank) {
      this.camera.up.set(Math.sin(opts.bank) * -1, Math.cos(opts.bank), 0);
    } else {
      this.camera.up.set(0, 1, 0);
    }
    this.camera.lookAt(this._look);
  }

  _lerpTo(desired, dt, speed = CAMERA.lerpPos) {
    if (!this._initialized) {
      this._pos.copy(desired);
      this._look.copy(desired);
      this._initialized = true;
    }
    this._pos.lerp(desired, Math.min(1, speed * dt));
    this.camera.position.copy(this._pos);
  }
}
