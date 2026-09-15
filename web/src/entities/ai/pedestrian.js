import * as THREE from '../../../vendor/three/three.module.js';
import { resolveCircleVsBoxes } from '../../world/collision.js';
import { buildHumanoid, stepWalkCycle, tagHumanoid } from '../humanoid.js';

const SPEED = 1.4;
const FLEE_SPEED = 4.2;
const FLEE_DURATION = 3.5;
const RADIUS = 0.35;

const SKIN_TONES = [0xd8a878, 0xc78a5a, 0x9a7a63, 0x7a5a45, 0xecc19c, 0x5c4536];
const SHIRT_COLORS = [0x2f6fbf, 0xb03a3a, 0x3a8a4a, 0xc9a227, 0x5a4a8a, 0x2a2a2e, 0xd67a2a, 0xe0e0e0];
const PANTS_COLORS = [0x263041, 0x1c1c1e, 0x3a3226, 0x44342a];
const HAIR_COLORS = [0x1c140f, 0x2a1e16, 0x5a4a3a, 0x8a7a6a, 0x0c0c0c, 0xb08a4a];
const HAIR_STYLES = ['short', 'buzz', 'full', 'bald'];

// Wanders the sidewalk loop of its home chunk; turns around if it walks into
// a building (collision resolver pushes it back, which we detect and react
// to). A nearby gunshot spooks it into sprinting straight away from the
// threat for a few seconds before it resumes its normal route.
export class Pedestrian {
  constructor(scene, loop, startIdx = 0) {
    this.loop = loop;
    this.targetIdx = startIdx;
    this.dir = 1;
    this.fleeTimer = 0;
    this.fleeHeading = 0;

    this.mesh = new THREE.Group();
    const body = buildHumanoid({
      skin: SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)],
      shirt: SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)],
      pants: PANTS_COLORS[Math.floor(Math.random() * PANTS_COLORS.length)],
      hair: HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)],
      hairStyle: HAIR_STYLES[Math.floor(Math.random() * HAIR_STYLES.length)],
      scale: 0.94 + Math.random() * 0.14,
    });
    this.mesh.add(body.root);
    this.body = body;
    this.bodyMesh = body.torso; // kept for external references expecting a single "body" mesh
    tagHumanoid(body, 'pedestrian', this);

    const p = loop[startIdx];
    this.mesh.position.set(p.x, 0, p.z);
    scene.add(this.mesh);
    this.alive = true;
  }

  // Called by AIManager.notifyGunfire when a shot lands within earshot.
  spookFrom(sourcePos) {
    const dx = this.mesh.position.x - sourcePos.x;
    const dz = this.mesh.position.z - sourcePos.z;
    this.fleeHeading = Math.atan2(dx, dz);
    this.fleeTimer = FLEE_DURATION;
  }

  update(dt, world) {
    let heading, speed;
    if (this.fleeTimer > 0) {
      this.fleeTimer -= dt;
      heading = this.fleeHeading;
      speed = FLEE_SPEED;
    } else {
      const target = this.loop[this.targetIdx];
      const dx = target.x - this.mesh.position.x;
      const dz = target.z - this.mesh.position.z;
      if (Math.hypot(dx, dz) < 1.5) {
        this.targetIdx = (this.targetIdx + this.dir + this.loop.length) % this.loop.length;
      }
      heading = Math.atan2(dx, dz);
      speed = SPEED;
    }

    let nx = this.mesh.position.x + Math.sin(heading) * speed * dt;
    let nz = this.mesh.position.z + Math.cos(heading) * speed * dt;

    const colliders = world.getCollidersNear(this.mesh.position.x, this.mesh.position.z, 10);
    const resolved = resolveCircleVsBoxes(nx, nz, RADIUS, colliders);
    const pushedBack = Math.hypot(resolved.x - nx, resolved.z - nz) > 0.05;
    if (pushedBack) {
      if (this.fleeTimer > 0) this.fleeHeading += Math.PI / 2; // deflect off the obstacle instead of freezing
      else this.dir *= -1; // hit a building barrier — turn around
    }

    this.mesh.position.x = resolved.x;
    this.mesh.position.z = resolved.z;
    this.mesh.rotation.y = heading;

    stepWalkCycle(this.body, dt, Math.min(1, speed / FLEE_SPEED));
  }

  dispose(scene) { scene.remove(this.mesh); }
}
