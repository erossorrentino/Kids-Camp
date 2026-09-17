import * as THREE from '../../../vendor/three/three.module.js';
import { AI } from '../../config.js';
import { resolveCircleVsBoxes } from '../../world/collision.js';
import { buildHumanoid, stepWalkCycle, tagHumanoid } from '../humanoid.js';

const SPEED = 4.2;
const STOP_RANGE = 12;
const FIRE_COOLDOWN = 0.9;
const RADIUS = 0.4;

// A cop who's bailed out of a stopped cruiser (see PoliceAI) and is chasing
// the player on foot, hitscanning them like a hostile EnemyAI once in range.
// Killing this officer counts as destroying the whole PoliceAI unit — see
// PoliceAI.update, which marks its cruiser destroyed the instant the officer
// dies so WantedSystem cleans it up and spawns a fresh pursuer if still wanted.
export class PoliceOfficer {
  constructor(scene, position) {
    this.mesh = new THREE.Group();
    const body = buildHumanoid({
      skin: 0xc78a5a, shirt: 0x18244a, pants: 0x12172a, shoes: 0x0c0c0c,
      hair: 0x181410, hairStyle: 'short', eyeColor: '#241a14',
    });
    this.mesh.add(body.root);
    this.body = body;
    tagHumanoid(body, 'policeOfficer', this);
    this.mesh.position.copy(position);
    scene.add(this.mesh);

    this.health = 90;
    this.fireTimer = 0;
    this.alive = true;
  }

  update(dt, world, playerPos, onFireAtPlayer) {
    if (!this.alive) return;
    const dx = playerPos.x - this.mesh.position.x;
    const dz = playerPos.z - this.mesh.position.z;
    const dist = Math.hypot(dx, dz);
    const heading = Math.atan2(dx, dz);
    this.mesh.rotation.y = heading;

    let moving = false;
    if (dist > STOP_RANGE) {
      moving = true;
      const nx = this.mesh.position.x + Math.sin(heading) * SPEED * dt;
      const nz = this.mesh.position.z + Math.cos(heading) * SPEED * dt;
      const colliders = world.getCollidersNear(this.mesh.position.x, this.mesh.position.z, 15);
      const resolved = resolveCircleVsBoxes(nx, nz, RADIUS, colliders);
      this.mesh.position.x = resolved.x;
      this.mesh.position.z = resolved.z;
    } else if (dist < AI.enemyFireRange) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = FIRE_COOLDOWN;
        if (onFireAtPlayer) onFireAtPlayer(this, 10);
      }
    }
    stepWalkCycle(this.body, dt, moving ? 1 : 0);
  }

  takeDamage(amount) {
    this.health -= amount;
    if (this.health <= 0) this.alive = false;
  }

  dispose(scene) { scene.remove(this.mesh); }
}
