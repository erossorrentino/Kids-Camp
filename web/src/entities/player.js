import * as THREE from '../../vendor/three/three.module.js';
import { PLAYER } from '../config.js';
import { resolveCircleVsBoxes } from '../world/collision.js';

function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export const PlayerState = {
  IDLE: 'IDLE', WALKING: 'WALKING', RUNNING: 'RUNNING', JUMPING: 'JUMPING', FALLING: 'FALLING',
};

// Skin-tone + simple painted face (eyes/brows/mouth/blush + soft AO shading
// at the jaw and temples) baked onto a canvas and wrapped on the head
// sphere — a cheap stand-in for a sculpted/painted character texture.
function makeFaceTexture(skinHex) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const skin = new THREE.Color(skinHex);
  const skinCss = `#${skin.getHexString()}`;

  ctx.fillStyle = skinCss;
  ctx.fillRect(0, 0, size, size);

  // soft ambient-occlusion shading toward the edges (temples/jaw/neckline)
  const shade = ctx.createRadialGradient(size * 0.5, size * 0.52, size * 0.18, size * 0.5, size * 0.52, size * 0.5);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);

  // face band sits at the sphere's equator (this is where the front-facing
  // UV band lands); eyes/brows/mouth centered in it
  const cx = size * 0.5, cy = size * 0.48;
  const eyeDX = size * 0.11, eyeY = cy - size * 0.02;

  // eyebrows
  ctx.strokeStyle = 'rgba(40,25,15,0.85)';
  ctx.lineWidth = size * 0.018;
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * (eyeDX - size * 0.045), eyeY - size * 0.05);
    ctx.lineTo(cx + s * (eyeDX + size * 0.045), eyeY - size * 0.06);
    ctx.stroke();
  }

  // eyes (white + iris + pupil + lower-lid shadow)
  for (const s of [-1, 1]) {
    const ex = cx + s * eyeDX;
    ctx.fillStyle = '#f5f0e8';
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, size * 0.032, size * 0.02, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a2a1e';
    ctx.beginPath();
    ctx.arc(ex, eyeY, size * 0.013, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0c0805';
    ctx.beginPath();
    ctx.arc(ex, eyeY, size * 0.006, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = size * 0.006;
    ctx.beginPath();
    ctx.arc(ex, eyeY + size * 0.006, size * 0.034, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }

  // nose shading (two soft strokes)
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = size * 0.01;
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.012, eyeY + size * 0.02);
  ctx.lineTo(cx - size * 0.02, eyeY + size * 0.09);
  ctx.stroke();

  // mouth
  ctx.strokeStyle = 'rgba(120,55,55,0.8)';
  ctx.lineWidth = size * 0.016;
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.05, eyeY + size * 0.16);
  ctx.quadraticCurveTo(cx, eyeY + size * 0.19, cx + size * 0.05, eyeY + size * 0.16);
  ctx.stroke();

  // faint cheek blush
  ctx.fillStyle = 'rgba(200,90,80,0.12)';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + s * size * 0.15, eyeY + size * 0.09, size * 0.04, size * 0.028, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A short-hair "cap" mesh — a partial sphere shell slightly larger than the
// head, covering the top/back so it reads as hair rather than a bald dome.
function makeHairMesh(headRadius, color) {
  const geo = new THREE.SphereGeometry(headRadius * 1.06, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.42);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

// Build a lightweight but genuinely segmented humanoid (head/hair, torso,
// hips, upper+lower arms and legs, hands, feet) instead of a single capsule.
// Limbs are pivoted at the shoulder/hip so a simple walk-cycle can swing
// them — a common "action figure" rig used when there's no real skeleton.
function buildBody({ skin = 0xd9a878, shirt = 0x2f6fbf, pants = 0x263041, shoes = 0x18181c, hair = 0x2a1e16 } = {}) {
  const LEG_LEN = 0.86, TORSO_H = 0.5, NECK_H = 0.06, HEAD_R = 0.15;
  const HIP_W = 0.13, SHOULDER_W = 0.21, UPPER_LEN = 0.32, LOWER_LEN = 0.34;
  const ARM_UPPER = 0.28, ARM_LOWER = 0.26;

  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.75, metalness: 0.02 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85, metalness: 0.0 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9, metalness: 0.0 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: shoes, roughness: 0.55, metalness: 0.1 });

  const root = new THREE.Group();

  const hips = new THREE.Group();
  hips.position.y = LEG_LEN;
  root.add(hips);

  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.2), pantsMat);
  pelvis.position.y = 0.08;
  pelvis.castShadow = true;
  hips.add(pelvis);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, TORSO_H, 0.2), shirtMat);
  torso.position.y = 0.16 + TORSO_H / 2;
  torso.castShadow = true;
  hips.add(torso);

  const shoulders = new THREE.Group();
  shoulders.position.y = 0.16 + TORSO_H;
  hips.add(shoulders);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, NECK_H, 8), skinMat);
  neck.position.y = NECK_H / 2;
  shoulders.add(neck);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(HEAD_R, 20, 16),
    new THREE.MeshStandardMaterial({ map: makeFaceTexture(skin), roughness: 0.7, metalness: 0.02 })
  );
  head.position.y = NECK_H + HEAD_R;
  head.rotation.y = -Math.PI / 2; // face texture's front lands on local +Z (forward) instead of +X
  head.castShadow = true;
  shoulders.add(head);

  const hairMesh = makeHairMesh(HEAD_R, hair);
  hairMesh.position.copy(head.position);
  shoulders.add(hairMesh);

  function buildLimb(side, { upperLen, lowerLen, upperR, lowerR, upperMat, lowerMat, endMat, endRadius, yOffset }) {
    const pivot = new THREE.Object3D();
    pivot.position.set(side * (yOffset === undefined ? 0 : 0), 0, 0);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(upperR, upperR * 0.9, upperLen, 8), upperMat);
    upper.position.y = -upperLen / 2;
    upper.castShadow = true;
    pivot.add(upper);

    const lowerPivot = new THREE.Object3D();
    lowerPivot.position.y = -upperLen;
    pivot.add(lowerPivot);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(lowerR * 0.9, lowerR, lowerLen, 8), lowerMat);
    lower.position.y = -lowerLen / 2;
    lower.castShadow = true;
    lowerPivot.add(lower);

    const end = new THREE.Mesh(new THREE.SphereGeometry(endRadius, 8, 8), endMat);
    end.position.y = -lowerLen - endRadius * 0.4;
    end.castShadow = true;
    lowerPivot.add(end);

    return { pivot, lowerPivot };
  }

  const arms = [-1, 1].map((side) => {
    const arm = buildLimb(side, {
      upperLen: ARM_UPPER, lowerLen: ARM_LOWER, upperR: 0.052, lowerR: 0.044,
      upperMat: shirtMat, lowerMat: skinMat, endMat: skinMat, endRadius: 0.05,
    });
    arm.pivot.position.set(side * SHOULDER_W, -0.02, 0);
    shoulders.add(arm.pivot);
    return arm;
  });

  const legs = [-1, 1].map((side) => {
    const leg = buildLimb(side, {
      upperLen: UPPER_LEN + 0.1, lowerLen: LOWER_LEN, upperR: 0.075, lowerR: 0.06,
      upperMat: pantsMat, lowerMat: pantsMat, endMat: shoeMat, endRadius: 0.075,
    });
    leg.pivot.position.set(side * HIP_W, 0, 0);
    hips.add(leg.pivot);
    return leg;
  });

  return { root, hips, shoulders, torso, head, arms, legs, height: LEG_LEN + TORSO_H + 0.16 + NECK_H + HEAD_R * 2 };
}

export class Player {
  constructor(scene) {
    this.mesh = new THREE.Group();

    const body = buildBody({});
    this.mesh.add(body.root);
    this.body = body;
    this.bodyMesh = body.torso; // kept for external references expecting a single "body" mesh

    // anchor point for the currently equipped weapon's visual mesh — parented
    // to the right hand's lower-arm pivot so the gun tracks arm swing
    this.handAnchor = new THREE.Object3D();
    this.handAnchor.position.set(0, -0.32, 0.05);
    body.arms[1].lowerPivot.add(this.handAnchor);

    scene.add(this.mesh);
    this.mesh.position.set(0, 0, 6);

    this.velocityY = 0;
    this.grounded = true;
    this.heading = 0; // radians, world-space facing
    this.horizontalSpeed = 0;
    this.state = PlayerState.IDLE;
    this.health = PLAYER.health;
    this.armor = PLAYER.armor;
    this.visible = true;
  }

  setVisible(v) {
    this.visible = v;
    this.mesh.visible = v;
  }

  takeDamage(amount) {
    const toArmor = Math.min(this.armor, amount * 0.5);
    this.armor -= toArmor;
    this.health -= (amount - toArmor);
    this.health = Math.max(0, this.health);
  }

  respawn() {
    this.health = PLAYER.health;
    this.armor = PLAYER.armor;
    this.velocityY = 0;
  }

  update(dt, input, cameraRig, world) {
    const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const aiming = input.isMouseDown(2);

    let ix = 0, iz = 0;
    if (input.isDown('KeyW')) iz += 1;
    if (input.isDown('KeyS')) iz -= 1;
    if (input.isDown('KeyD')) ix += 1;
    if (input.isDown('KeyA')) ix -= 1;
    const moving = ix !== 0 || iz !== 0;

    const fwd = cameraRig.flatForward || new THREE.Vector3(0, 0, 1);
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const moveDir = new THREE.Vector3()
      .addScaledVector(fwd, iz)
      .addScaledVector(right, ix);
    if (moveDir.lengthSq() > 0) moveDir.normalize();

    const targetSpeed = moving ? (sprint ? PLAYER.runSpeed : PLAYER.walkSpeed) : 0;
    this.horizontalSpeed = targetSpeed;

    let nx = this.mesh.position.x + moveDir.x * targetSpeed * dt;
    let nz = this.mesh.position.z + moveDir.z * targetSpeed * dt;

    const colliders = world.getCollidersNear(this.mesh.position.x, this.mesh.position.z, 20);
    const resolved = resolveCircleVsBoxes(nx, nz, PLAYER.radius, colliders);
    this.mesh.position.x = resolved.x;
    this.mesh.position.z = resolved.z;

    // gravity / jump
    if (this.grounded && input.wasPressed('Space')) {
      this.velocityY = PLAYER.jumpVelocity;
      this.grounded = false;
    }
    this.velocityY -= PLAYER.gravity * dt;
    this.mesh.position.y += this.velocityY * dt;
    if (this.mesh.position.y <= 0) {
      this.mesh.position.y = 0;
      this.velocityY = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    // facing: aim mode snaps to camera yaw for accurate shooting; otherwise
    // smoothly turn toward the movement direction (GTA-style third person).
    if (aiming) {
      this.heading = lerpAngle(this.heading, cameraRig.yaw, Math.min(1, PLAYER.turnLerp * dt));
    } else if (moving) {
      const targetHeading = Math.atan2(moveDir.x, moveDir.z);
      this.heading = lerpAngle(this.heading, targetHeading, Math.min(1, PLAYER.turnLerp * dt));
    }
    this.mesh.rotation.y = this.heading;

    // animation state machine
    if (!this.grounded) {
      this.state = this.velocityY > 0 ? PlayerState.JUMPING : PlayerState.FALLING;
    } else if (targetSpeed > PLAYER.walkSpeed + 0.1) {
      this.state = PlayerState.RUNNING;
    } else if (targetSpeed > 0.1) {
      this.state = PlayerState.WALKING;
    } else {
      this.state = PlayerState.IDLE;
    }

    this._animate(dt, aiming);
  }

  // Procedural walk-cycle: swings arm/leg pivots opposite each other and
  // bobs the hips, so the state machine reads visually on a rigless model.
  _animate(dt, aiming) {
    this._bobT = (this._bobT || 0) + dt;
    let amp = 0, rate = 0, bob = 0;
    if (this.state === PlayerState.WALKING) { amp = 0.5; rate = 7; bob = 0.035; }
    else if (this.state === PlayerState.RUNNING) { amp = 0.9; rate = 11; bob = 0.06; }
    else if (this.state === PlayerState.JUMPING || this.state === PlayerState.FALLING) { amp = 0.3; rate = 0; bob = 0; }

    const t = this._bobT * rate;
    const swing = Math.sin(t) * amp;
    const { arms, legs, hips } = this.body;

    if (rate > 0) {
      arms[0].pivot.rotation.x = swing;
      arms[1].pivot.rotation.x = -swing;
      legs[0].pivot.rotation.x = -swing * 0.8;
      legs[1].pivot.rotation.x = swing * 0.8;
      arms[0].lowerPivot.rotation.x = Math.max(0, -swing) * 0.6;
      arms[1].lowerPivot.rotation.x = Math.max(0, swing) * 0.6;
      hips.position.y = 0.86 + Math.abs(Math.sin(t)) * bob;
    } else if (this.state === PlayerState.JUMPING || this.state === PlayerState.FALLING) {
      const spread = this.state === PlayerState.JUMPING ? -0.6 : 0.4;
      arms[0].pivot.rotation.x = THREE.MathUtils.lerp(arms[0].pivot.rotation.x, spread, Math.min(1, 8 * dt));
      arms[1].pivot.rotation.x = THREE.MathUtils.lerp(arms[1].pivot.rotation.x, spread, Math.min(1, 8 * dt));
      legs[0].pivot.rotation.x = THREE.MathUtils.lerp(legs[0].pivot.rotation.x, 0.15, Math.min(1, 8 * dt));
      legs[1].pivot.rotation.x = THREE.MathUtils.lerp(legs[1].pivot.rotation.x, -0.15, Math.min(1, 8 * dt));
      hips.position.y = THREE.MathUtils.lerp(hips.position.y, 0.86, Math.min(1, 8 * dt));
    } else {
      // idle: settle limbs and add a faint breathing sway
      for (const limb of [...arms, ...legs]) {
        limb.pivot.rotation.x = THREE.MathUtils.lerp(limb.pivot.rotation.x, 0, Math.min(1, 6 * dt));
        limb.lowerPivot.rotation.x = THREE.MathUtils.lerp(limb.lowerPivot.rotation.x, 0, Math.min(1, 6 * dt));
      }
      hips.position.y = THREE.MathUtils.lerp(hips.position.y, 0.86 + Math.sin(this._bobT * 1.4) * 0.006, 0.1);
    }

    // aiming raises the right arm toward a level firing pose
    const aimTarget = aiming ? -1.5 : 0;
    arms[1].pivot.rotation.x = THREE.MathUtils.lerp(arms[1].pivot.rotation.x, aimTarget, Math.min(1, 10 * dt));
    if (aiming) arms[1].lowerPivot.rotation.x = THREE.MathUtils.lerp(arms[1].lowerPivot.rotation.x, 0.1, Math.min(1, 10 * dt));
  }
}
