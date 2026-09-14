import * as THREE from '../../vendor/three/three.module.js';
import { WANTED, AI } from '../config.js';
import { PoliceAI } from '../entities/ai/police.js';

const SIGHT_RANGE = 26;
const SPAWN_RING = [55, 90];
const RAM_RANGE = 3.2;

// 1-5 star wanted meter. Damaging NPCs or stealing a car raises heat; heat
// decays only once no pursuing police unit has line-of-sight-range on the
// player. Police unit count/aggression scale with the current star tier.
export class WantedSystem {
  constructor(scene) {
    this.scene = scene;
    this.stars = 0;
    this._decayAccum = 0;
    this.police = [];
  }

  reportCrime(stars = 1) {
    this.stars = Math.min(WANTED.maxStars, this.stars + stars);
    this._decayAccum = 0;
  }

  update(dt, world, player, activePos, controlMode, traction = 1) {
    // destroyed cruisers stop counting as pursuers so a fresh one spawns in
    const wrecked = this.police.filter((p) => p.vehicle.destroyed);
    if (wrecked.length) {
      this.police = this.police.filter((p) => !p.vehicle.destroyed);
      for (const p of wrecked) setTimeout(() => p.dispose(this.scene), 4000); // leave the wreck visible briefly
    }

    // decay: only once every pursuing unit is out of sight range
    const nearestDist = this.police.reduce((m, p) => Math.min(m, p.distanceTo(activePos)), Infinity);
    if (this.stars > 0 && nearestDist > SIGHT_RANGE) {
      this._decayAccum += dt;
      if (this._decayAccum > WANTED.decayTime) {
        this.stars -= 1;
        this._decayAccum = 0;
      }
    } else {
      this._decayAccum = 0;
    }

    this._syncPoliceCount(activePos);

    // police only chase/ram along the ground, so a lead-aim only makes sense
    // while the player is actually driving a car (not on foot or airborne)
    const isDriving = controlMode?.mode === 'CAR' && controlMode.vehicle;
    const playerVel = isDriving
      ? controlMode.vehicle.forward.multiplyScalar(controlMode.vehicle.speed)
      : new THREE.Vector3();

    for (const p of this.police) {
      p.update(dt, world, activePos, playerVel, this.stars, traction);
      if (isDriving && p.distanceTo(activePos) < RAM_RANGE) {
        controlMode.vehicle.speed *= 0.85; // ram impact bleeds player speed
        p.vehicle.speed *= 0.7;
      } else if (controlMode?.mode === 'FOOT' && p.distanceTo(activePos) < RAM_RANGE + 1) {
        player.takeDamage(4 * dt * 10); // cornered on foot by a cruiser
      }
    }
  }

  _syncPoliceCount(playerPos) {
    const desired = Math.min(WANTED.maxStars, this.stars) * WANTED.policeChasePerStar;
    while (this.police.length < desired) {
      const angle = Math.random() * Math.PI * 2;
      const r = THREE.MathUtils.lerp(SPAWN_RING[0], SPAWN_RING[1], Math.random());
      const pos = new THREE.Vector3(playerPos.x + Math.sin(angle) * r, 0, playerPos.z + Math.cos(angle) * r);
      this.police.push(new PoliceAI(this.scene, pos));
    }
    while (this.police.length > desired) {
      this.police.pop().dispose(this.scene);
    }
  }

  get responseTier() {
    if (this.stars <= 0) return 'NONE';
    if (this.stars <= 2) return 'LOCAL POLICE';
    if (this.stars <= 4) return 'ROADBLOCKS';
    return 'SWAT';
  }
}
