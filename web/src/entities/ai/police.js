import * as THREE from '../../../vendor/three/three.module.js';
import { Vehicle } from '../vehicle.js';
import { AI } from '../../config.js';
import { PoliceOfficer } from './policeOfficer.js';

const EXIT_RANGE = 9; // close enough that the cruiser stops and the officer bails out on foot

// Police cruiser: drives straight at the player's current position. At high
// wanted tiers it aims for a lead point on the player's velocity to ram them
// instead of just trailing. Once it closes to EXIT_RANGE it stops for good
// and the officer gets out to chase/shoot on foot, GTA-style, instead of
// just ramming forever.
export class PoliceAI {
  constructor(scene, position) {
    this.scene = scene;
    this.vehicle = new Vehicle(scene, { position, color: 0x14204a });
    this.vehicle.occupied = true;
    this.lightPhase = Math.random() * Math.PI * 2;
    this.officer = null;
  }

  update(dt, world, targetPos, targetVelocity, stars, traction, onOfficerFire) {
    if (this.vehicle.destroyed) return;

    if (this.officer) {
      this.officer.update(dt, world, targetPos, onOfficerFire);
      if (!this.officer.alive) this.vehicle.destroyed = true; // this pursuer is defeated
    } else {
      const speedFrac = Math.min(1, (AI.policeSpeedBase + AI.policeSpeedPerStar * stars) / 42);
      let aimPoint = targetPos;
      if (stars >= 3 && targetVelocity) {
        aimPoint = {
          x: targetPos.x + targetVelocity.x * 0.6,
          z: targetPos.z + targetVelocity.z * 0.6,
        };
      }
      if (this.distanceTo(targetPos) < EXIT_RANGE) {
        this.vehicle.speed = 0;
        this.vehicle.occupied = false;
        const side = new THREE.Vector3(Math.cos(this.vehicle.heading), 0, -Math.sin(this.vehicle.heading));
        const officerPos = this.vehicle.mesh.position.clone().addScaledVector(side, 1.8);
        this.officer = new PoliceOfficer(this.scene, officerPos);
      } else {
        this.vehicle.driveTowards(dt, world, aimPoint, speedFrac, undefined, traction);
      }
    }

    this.lightPhase += dt * 8;
    const flash = Math.sin(this.lightPhase) > 0;
    this.vehicle.tailLights.material.color.setHex(flash ? 0xff2222 : 0x2222ff);
  }

  distanceTo(pos) {
    return Math.hypot(this.vehicle.mesh.position.x - pos.x, this.vehicle.mesh.position.z - pos.z);
  }

  dispose(scene) {
    scene.remove(this.vehicle.mesh);
    if (this.officer) this.officer.dispose(scene);
  }
}
