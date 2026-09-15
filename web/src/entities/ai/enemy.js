import * as THREE from '../../../vendor/three/three.module.js';
import { AI } from '../../config.js';
import { resolveCircleVsBoxes } from '../../world/collision.js';
import { buildHumanoid, stepWalkCycle, tagHumanoid } from '../humanoid.js';

const SPEED = 4.5;
const STOP_RANGE = 14;
const FIRE_COOLDOWN = 1.1;
const RADIUS = 0.4;

const SKIN_TONES = [0xc78a5a, 0x9a7a63, 0x7a5a45, 0xecc19c];
const IDLE_SHIRT = 0x3a3230;
const CHASE_SHIRT = 0xa02020;

export const EnemyState = { IDLE: 'IDLE', CHASING: 'CHASING' };

// Hostile NPC: idles until the player enters its detection radius, then
// closes to firing range and hitscans the player on a cooldown.
export class EnemyAI {
  constructor(scene, position) {
    this.mesh = new THREE.Group();
    const body = buildHumanoid({
      skin: SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)],
      shirt: IDLE_SHIRT,
      pants: 0x1a1a1c,
      shoes: 0x0c0c0c,
      hair: [0x0c0c0c, 0x2a1e16, 0x1c140f][Math.floor(Math.random() * 3)],
      hairStyle: ['short', 'buzz', 'bald'][Math.floor(Math.random() * 3)],
      eyeColor: '#241a14',
      stubble: true,
      scale: 1.03,
    });
    this.mesh.add(body.root);
    this.body = body;
    this.bodyMesh = body.torso; // kept for external references expecting a single "body" mesh
    tagHumanoid(body, 'enemy', this);
    this.mesh.position.copy(position);
    scene.add(this.mesh);

    this.state = EnemyState.IDLE;
    this.health = 60;
    this.fireTimer = 0;
    this.alive = true;
  }

  update(dt, world, playerPos, onFireAtPlayer) {
    if (!this.alive) return;
    const dx = playerPos.x - this.mesh.position.x;
    const dz = playerPos.z - this.mesh.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist < AI.enemyDetectionRadius) this.state = EnemyState.CHASING;
    else if (dist > AI.enemyDetectionRadius * 1.6) this.state = EnemyState.IDLE;

    this.bodyMesh.material.color.setHex(this.state === EnemyState.CHASING ? CHASE_SHIRT : IDLE_SHIRT);

    let moving = false;
    if (this.state === EnemyState.CHASING) {
      const heading = Math.atan2(dx, dz);
      this.mesh.rotation.y = heading;
      if (dist > STOP_RANGE) {
        moving = true;
        let nx = this.mesh.position.x + Math.sin(heading) * SPEED * dt;
        let nz = this.mesh.position.z + Math.cos(heading) * SPEED * dt;
        const colliders = world.getCollidersNear(this.mesh.position.x, this.mesh.position.z, 15);
        const resolved = resolveCircleVsBoxes(nx, nz, RADIUS, colliders);
        this.mesh.position.x = resolved.x;
        this.mesh.position.z = resolved.z;
      } else if (dist < AI.enemyFireRange) {
        this.fireTimer -= dt;
        if (this.fireTimer <= 0) {
          this.fireTimer = FIRE_COOLDOWN;
          if (onFireAtPlayer) onFireAtPlayer(this, 8);
        }
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
