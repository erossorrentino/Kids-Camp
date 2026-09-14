import * as THREE from '../../../vendor/three/three.module.js';
import { AI } from '../../config.js';
import { resolveCircleVsBoxes } from '../../world/collision.js';

const SPEED = 4.5;
const STOP_RANGE = 14;
const FIRE_COOLDOWN = 1.1;
const RADIUS = 0.4;

export const EnemyState = { IDLE: 'IDLE', CHASING: 'CHASING' };

// Hostile NPC: idles until the player enters its detection radius, then
// closes to firing range and hitscans the player on a cooldown.
export class EnemyAI {
  constructor(scene, position) {
    this.mesh = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(RADIUS, 1.1, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x8a2020, roughness: 0.6 })
    );
    body.position.y = 0.9;
    body.castShadow = true;
    body.userData.kind = 'enemy';
    body.userData.ref = this;
    this.mesh.add(body);
    this.bodyMesh = body;
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

    this.bodyMesh.material.color.setHex(this.state === EnemyState.CHASING ? 0xff3030 : 0x8a2020);

    if (this.state === EnemyState.CHASING) {
      const heading = Math.atan2(dx, dz);
      this.mesh.rotation.y = heading;
      if (dist > STOP_RANGE) {
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
  }

  takeDamage(amount) {
    this.health -= amount;
    if (this.health <= 0) this.alive = false;
  }

  dispose(scene) { scene.remove(this.mesh); }
}
