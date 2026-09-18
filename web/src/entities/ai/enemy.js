import * as THREE from '../../../vendor/three/three.module.js';
import { AI } from '../../config.js';
import { resolveCircleVsBoxes } from '../../world/collision.js';
import { buildHumanoid, stepWalkCycle, tagHumanoid } from '../humanoid.js';

const SPEED = 4.5;
const STOP_RANGE = 14;
const FIRE_COOLDOWN = 1.1;
const RADIUS = 0.4;

const SKIN_TONES = [0xc78a5a, 0x9a7a63, 0x7a5a45, 0xecc19c, 0x5c4536, 0xd8a878];
// Muted/worn "hostile" palette — varied enough that every enemy looks like a
// different person, while staying dark/dull so the group still reads as
// one faction rather than random pedestrian colors.
const SHIRT_TONES = [0x3a3230, 0x4a2a2a, 0x2a3a2e, 0x33343a, 0x4a3c22, 0x28282c];
const PANTS_TONES = [0x1a1a1c, 0x22201e, 0x1c2420, 0x24201c];

export const EnemyState = { IDLE: 'IDLE', CHASING: 'CHASING' };

// Hostile NPC: idles until the player enters its detection radius, then
// closes to firing range and hitscans the player on a cooldown.
export class EnemyAI {
  constructor(scene, position) {
    this.mesh = new THREE.Group();
    const body = buildHumanoid({
      skin: SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)],
      shirt: SHIRT_TONES[Math.floor(Math.random() * SHIRT_TONES.length)],
      pants: PANTS_TONES[Math.floor(Math.random() * PANTS_TONES.length)],
      shoes: 0x0c0c0c,
      hair: [0x0c0c0c, 0x2a1e16, 0x1c140f, 0x5a4a3a][Math.floor(Math.random() * 4)],
      hairStyle: ['short', 'buzz', 'bald', 'full'][Math.floor(Math.random() * 4)],
      eyeColor: '#241a14',
      stubble: Math.random() < 0.6,
      scale: 0.97 + Math.random() * 0.12,
    });
    this.mesh.add(body.root);
    this.body = body;
    this.bodyMesh = body.torso; // kept for external references expecting a single "body" mesh
    tagHumanoid(body, 'enemy', this);
    this.mesh.position.copy(position);
    scene.add(this.mesh);

    // "spotted you" cue: a small glowing marker over the head instead of
    // recoloring the body, so each enemy's randomized look stays visible
    // even mid-chase (an all-red tint on a dark shirt washed out the variety).
    this.alertIcon = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff2020 })
    );
    this.alertIcon.position.copy(body.head.position);
    this.alertIcon.position.y += 0.26; // just above the head, same local space as head/hair
    this.alertIcon.visible = false;
    body.shoulders.add(this.alertIcon);
    this._alertPhase = Math.random() * Math.PI * 2;

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

    const chasing = this.state === EnemyState.CHASING;
    this.alertIcon.visible = chasing;
    if (chasing) {
      this._alertPhase += dt * 6;
      const pulse = 1 + Math.sin(this._alertPhase) * 0.25;
      this.alertIcon.scale.setScalar(pulse);
    }

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
