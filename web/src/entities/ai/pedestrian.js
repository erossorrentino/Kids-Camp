import * as THREE from 'three';
import { resolveCircleVsBoxes } from '../../world/collision.js';

const SPEED = 1.4;
const FLEE_SPEED = 4.2;
const FLEE_DURATION = 3.5;
const RADIUS = 0.35;

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
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(RADIUS, 1.0, 4, 8),
      new THREE.MeshStandardMaterial({ color: [0xd8a878, 0xc78a5a, 0x9a7a63, 0x7a6a8a][Math.floor(Math.random() * 4)] })
    );
    body.position.y = 0.85;
    body.castShadow = true;
    body.userData.kind = 'pedestrian';
    body.userData.ref = this;
    this.mesh.add(body);
    this.bodyMesh = body;

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
  }

  dispose(scene) { scene.remove(this.mesh); }
}
