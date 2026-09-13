import { Vehicle } from '../vehicle.js';
import { AI } from '../../config.js';

// Police cruiser: drives straight at the player's current position. At high
// wanted tiers it aims for a lead point on the player's velocity to ram them
// instead of just trailing.
export class PoliceAI {
  constructor(scene, position) {
    this.vehicle = new Vehicle(scene, { position, color: 0x14204a });
    this.vehicle.occupied = true;
    this.lightPhase = Math.random() * Math.PI * 2;
  }

  update(dt, world, targetPos, targetVelocity, stars, traction = 1) {
    if (this.vehicle.destroyed) return;
    const speedFrac = Math.min(1, (AI.policeSpeedBase + AI.policeSpeedPerStar * stars) / 42);
    let aimPoint = targetPos;
    if (stars >= 3 && targetVelocity) {
      aimPoint = {
        x: targetPos.x + targetVelocity.x * 0.6,
        z: targetPos.z + targetVelocity.z * 0.6,
      };
    }
    this.vehicle.driveTowards(dt, world, aimPoint, speedFrac, undefined, traction);

    this.lightPhase += dt * 8;
    const flash = Math.sin(this.lightPhase) > 0;
    this.vehicle.tailLights.material.color.setHex(flash ? 0xff2222 : 0x2222ff);
  }

  distanceTo(pos) {
    return Math.hypot(this.vehicle.mesh.position.x - pos.x, this.vehicle.mesh.position.z - pos.z);
  }

  dispose(scene) { scene.remove(this.vehicle.mesh); }
}
