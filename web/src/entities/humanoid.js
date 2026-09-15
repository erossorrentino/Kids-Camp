import * as THREE from '../../vendor/three/three.module.js';

// Shared "action figure" humanoid rig used by the player, pedestrians, and
// enemies: a segmented body (head/hair, torso, hips, upper+lower arms and
// legs) with a procedurally painted face, instead of one plain capsule per
// character. Limbs pivot at the shoulder/hip/elbow/knee so a simple
// walk-cycle can swing them without a real skeleton/animation system.

// Skin-tone + simple painted face (eyes/brows/mouth/blush + soft AO shading
// at the jaw and temples) baked onto a canvas and wrapped on the head
// sphere — a cheap stand-in for a sculpted/painted character texture.
export function makeFaceTexture(skinHex, { eyeColor = '#3a2a1e', browColor = 'rgba(40,25,15,0.85)', stubble = false } = {}) {
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
  ctx.strokeStyle = browColor;
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
    ctx.fillStyle = eyeColor;
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

  // optional stubble/shadow across the jaw for a rougher NPC look
  if (stubble) {
    ctx.fillStyle = 'rgba(30,26,24,0.16)';
    ctx.beginPath();
    ctx.ellipse(cx, eyeY + size * 0.2, size * 0.19, size * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A hair "cap" mesh — a partial sphere shell slightly larger than the head,
// covering the top so it reads as hair rather than a bald dome. Kept well
// clear of the equator (face height) so it never occludes facial features.
export function makeHairMesh(headRadius, color, style = 'short') {
  if (style === 'bald') return null;
  const thetaLength = style === 'buzz' ? 0.3 : style === 'full' ? 0.5 : 0.42;
  const geo = new THREE.SphereGeometry(headRadius * 1.06, 16, 12, 0, Math.PI * 2, 0, Math.PI * thetaLength);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

// Build a lightweight but genuinely segmented humanoid instead of a single
// capsule/box. Colors and a uniform scale let callers (player, pedestrians,
// enemies) each get visually distinct people cheaply.
export function buildHumanoid({
  skin = 0xd9a878, shirt = 0x2f6fbf, pants = 0x263041, shoes = 0x18181c, hair = 0x2a1e16,
  hairStyle = 'short', eyeColor = '#3a2a1e', stubble = false, scale = 1,
} = {}) {
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
    new THREE.MeshStandardMaterial({ map: makeFaceTexture(skin, { eyeColor, stubble }), roughness: 0.7, metalness: 0.02 })
  );
  head.position.y = NECK_H + HEAD_R;
  head.rotation.y = -Math.PI / 2; // face texture's front lands on local +Z (forward) instead of +X
  head.castShadow = true;
  shoulders.add(head);

  const hairMesh = makeHairMesh(HEAD_R, hair, hairStyle);
  if (hairMesh) {
    hairMesh.position.copy(head.position);
    shoulders.add(hairMesh);
  }

  function buildLimb(side, { upperLen, lowerLen, upperR, lowerR, upperMat, lowerMat, endMat, endRadius }) {
    const pivot = new THREE.Object3D();
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

  root.scale.setScalar(scale);

  return {
    root, hips, shoulders, torso, head, arms, legs,
    hipsBaseY: LEG_LEN,
    height: (LEG_LEN + TORSO_H + 0.16 + NECK_H + HEAD_R * 2) * scale,
  };
}

// Stamp userData.kind/ref onto every mesh in the rig (torso, head, each limb
// segment, ...) so a recursive raycast hit anywhere on the body resolves to
// the right game-object, the way it did when NPCs were a single capsule mesh.
export function tagHumanoid(body, kind, ref) {
  body.root.traverse((obj) => {
    if (obj.isMesh) {
      obj.userData.kind = kind;
      obj.userData.ref = ref;
    }
  });
}

// Generic walk-cycle for NPCs (pedestrians/enemies): swings arm/leg pivots
// opposite each other and bobs the hips based on how fast the character is
// currently moving (0 = idle sway, 1 = full sprint). Shared so every
// "person" in the game gets the same rigless-but-alive look as the player.
export function stepWalkCycle(body, dt, speedFrac) {
  body._walkT = (body._walkT || 0) + dt;
  const { arms, legs, hips, hipsBaseY } = body;

  if (speedFrac > 0.05) {
    const rate = 3 + speedFrac * 8;
    const amp = 0.15 + speedFrac * 0.75;
    const t = body._walkT * rate;
    const swing = Math.sin(t) * amp;
    arms[0].pivot.rotation.x = swing;
    arms[1].pivot.rotation.x = -swing;
    legs[0].pivot.rotation.x = -swing * 0.8;
    legs[1].pivot.rotation.x = swing * 0.8;
    arms[0].lowerPivot.rotation.x = Math.max(0, -swing) * 0.6;
    arms[1].lowerPivot.rotation.x = Math.max(0, swing) * 0.6;
    hips.position.y = hipsBaseY + Math.abs(Math.sin(t)) * 0.05 * speedFrac;
  } else {
    for (const limb of [...arms, ...legs]) {
      limb.pivot.rotation.x = THREE.MathUtils.lerp(limb.pivot.rotation.x, 0, Math.min(1, 6 * dt));
      limb.lowerPivot.rotation.x = THREE.MathUtils.lerp(limb.lowerPivot.rotation.x, 0, Math.min(1, 6 * dt));
    }
    hips.position.y = THREE.MathUtils.lerp(hips.position.y, hipsBaseY + Math.sin(body._walkT * 1.4) * 0.006, 0.1);
  }
}
