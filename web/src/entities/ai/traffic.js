import { Vehicle } from '../vehicle.js';

const BRAKE_DISTANCE = 9;
const COLORS = [0x2255aa, 0xaaaaaa, 0xcc8822, 0x224422, 0x882222, 0xdddddd];

// Ambient traffic: shuttles back and forth along its home chunk's road lane,
// braking to a stop if another vehicle (traffic or the player's) is ahead.
export class TrafficAI {
  constructor(scene, lane) {
    this.lane = lane;
    this.forward = true;
    this.vehicle = new Vehicle(scene, {
      position: lane.from.clone(),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    });
    // `occupied` stays false: it gates only the player-input `update()` path,
    // not `driveTowards()`, and false lets the player carjack this vehicle
    // (see Game._findInteractable, which skips anything already occupied).
    this.vehicle.heading = Math.atan2(lane.to.x - lane.from.x, lane.to.z - lane.from.z);
    this.vehicle.mesh.rotation.y = this.vehicle.heading;
  }

  update(dt, world, obstacles, traction = 1) {
    if (this.vehicle.destroyed) return;
    const target = this.forward ? this.lane.to : this.lane.from;
    const pos = this.vehicle.mesh.position;

    let blocked = false;
    for (const ob of obstacles) {
      if (ob === this.vehicle.mesh) continue;
      const dx = ob.position.x - pos.x, dz = ob.position.z - pos.z;
      const fwd = this.vehicle.forward;
      const ahead = dx * fwd.x + dz * fwd.z;
      const lateral = Math.abs(dx * fwd.z - dz * fwd.x);
      if (ahead > 0 && ahead < BRAKE_DISTANCE && lateral < 2.5) { blocked = true; break; }
    }

    const dist = this.vehicle.driveTowards(dt, world, target, blocked ? 0 : 0.5, undefined, traction);
    if (blocked) this.vehicle.speed *= 0.8; // hard brake on top of the throttle cut
    if (dist < 3) this.forward = !this.forward;
  }

  dispose(scene) { scene.remove(this.vehicle.mesh); }
}
