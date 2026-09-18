import * as THREE from '../../vendor/three/three.module.js';
import { VEHICLE, VEHICLE_HEALTH } from '../config.js';
import { resolveVehicleVsBoxes } from '../world/collision.js';

const HALF_LENGTH = 2.2;
const HALF_WIDTH = 1.05;
const BIKE_HALF_LENGTH = 1.5;
const BIKE_HALF_WIDTH = 0.32;

function buildRim(radius, capMat) {
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 0.07, 10, 1, false),
    [new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.25, metalness: 0.9 }), capMat, capMat]
  );
  return rim;
}

// A 5-spoke alloy-wheel look baked onto a canvas and used as the rim's cap
// (side) face material — much sportier than a flat metal disc.
function makeSpokeTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2, r = size * 0.48;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#cfd4da';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3a3d42';
  const spokes = 5;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(-r * 0.16, 0);
    ctx.lineTo(-r * 0.05, -r * 0.92);
    ctx.lineTo(r * 0.05, -r * 0.92);
    ctx.lineTo(r * 0.16, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#20232a';
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#8a8f96';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.97, 0, Math.PI * 2); ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const spokeTexture = makeSpokeTexture();

function buildCarMesh(color) {
  const group = new THREE.Group();
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0c1620, roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.55,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.5, metalness: 0.4 });
  const archMat = new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.75, metalness: 0.1 });
  // Shared across every exterior paint panel (tub/hood/roof/trunk/fenders) so
  // cycling paint color with a single material tint recolors the whole car.
  // MeshPhysicalMaterial's clearcoat layer is what gives real automotive
  // paint its glassy highlight on top of the base color coat — the cheapest
  // single change that makes a car stop looking like painted cardboard.
  const paintMat = new THREE.MeshPhysicalMaterial({
    color, roughness: 0.35, metalness: 0.7, clearcoat: 1, clearcoatRoughness: 0.08,
  });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.35, metalness: 0.3 });
  const paintPanels = [];

  const TUB_H = 0.58, TUB_Y = 0.62;
  const tub = new THREE.Mesh(new THREE.BoxGeometry(HALF_WIDTH * 2, TUB_H, HALF_LENGTH * 1.86), paintMat);
  tub.position.y = TUB_Y;
  tub.castShadow = true;
  group.add(tub);
  paintPanels.push(tub);

  // Low coupe cabin, sitting on top of the tub; the raked windshield/rear
  // window panels added below do the visual tapering work.
  const roofH = 0.34;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(HALF_WIDTH * 1.6, roofH, HALF_LENGTH * 0.82), paintMat);
  roof.position.set(0, TUB_Y + TUB_H / 2 + roofH / 2, -0.05);
  roof.castShadow = true;
  group.add(roof);
  paintPanels.push(roof);

  // Hood + trunk: angled panels bridging the cabin roofline down to the
  // bumpers so the silhouette slopes instead of looking like stacked boxes.
  // Each panel is defined by its two end points (where it meets the glass,
  // and where it meets the bumper) so the length/position/tilt fall out of
  // simple trig instead of hand-guessed numbers that can clip the ground.
  function buildSlopedPanel(topY, topZ, endY, endZ, width, material) {
    const dy = endY - topY, dz = endZ - topZ;
    const length = Math.hypot(dy, dz);
    const angle = Math.atan2(-dy, dz); // rotation.x that tilts the +Z tip down to endY/endZ
    const panel = new THREE.Mesh(new THREE.BoxGeometry(width, 0.05, length), material);
    panel.position.set(0, (topY + endY) / 2, (topZ + endZ) / 2);
    panel.rotation.x = angle;
    panel.castShadow = true;
    return { panel, length };
  }

  const tubTopY = TUB_Y + TUB_H / 2;
  const { panel: hood, length: hoodLen } = buildSlopedPanel(
    tubTopY, HALF_LENGTH * 0.46 - 0.1,
    tubTopY - 0.31, HALF_LENGTH - 0.05,
    HALF_WIDTH * 1.9, paintMat
  );
  group.add(hood);
  paintPanels.push(hood);

  const { panel: trunk, length: trunkLen } = buildSlopedPanel(
    tubTopY, -HALF_LENGTH * 0.44,
    tubTopY - 0.36, -(HALF_LENGTH - 0.05),
    HALF_WIDTH * 1.9, paintMat
  );
  group.add(trunk);
  paintPanels.push(trunk);

  // racing stripe: parented to the hood/trunk panels so it inherits their
  // tilt exactly instead of needing its own duplicated trig.
  const stripeW = HALF_WIDTH * 0.32;
  const hoodStripe = new THREE.Mesh(new THREE.PlaneGeometry(stripeW, hoodLen - 0.1), stripeMat);
  hoodStripe.rotation.x = -Math.PI / 2;
  hoodStripe.position.y = 0.03;
  hood.add(hoodStripe);
  const trunkStripe = new THREE.Mesh(new THREE.PlaneGeometry(stripeW, trunkLen - 0.1), stripeMat);
  trunkStripe.rotation.x = -Math.PI / 2;
  trunkStripe.position.y = 0.03;
  trunk.add(trunkStripe);
  const roofStripe = new THREE.Mesh(new THREE.PlaneGeometry(stripeW, HALF_LENGTH * 0.82 - 0.05), stripeMat);
  roofStripe.rotation.x = -Math.PI / 2;
  roofStripe.position.y = roofH / 2 + 0.005;
  roof.add(roofStripe);

  // windshield + rear window + side glass, tinted and inset under the roof arc
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(HALF_WIDTH * 1.7, 0.4, 0.04), glassMat);
  windshield.position.set(0, TUB_Y + TUB_H / 2 + 0.16, HALF_LENGTH * 0.46 - 0.1);
  windshield.rotation.x = -0.42;
  group.add(windshield);

  const rearWindow = windshield.clone();
  rearWindow.position.z = -HALF_LENGTH * 0.44;
  rearWindow.rotation.x = 0.46;
  group.add(rearWindow);

  const sideGlassGeo = new THREE.BoxGeometry(0.04, 0.3, HALF_LENGTH * 0.72);
  const sideGlassL = new THREE.Mesh(sideGlassGeo, glassMat);
  sideGlassL.position.set(-HALF_WIDTH * 0.86 - 0.02, TUB_Y + TUB_H / 2 + 0.08, -0.05);
  group.add(sideGlassL);
  const sideGlassR = sideGlassL.clone();
  sideGlassR.position.x = HALF_WIDTH * 0.86 + 0.02;
  group.add(sideGlassR);

  // side mirrors
  for (const s of [-1, 1]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.2), trimMat);
    mirror.position.set(s * (HALF_WIDTH + 0.1), TUB_Y + TUB_H / 2 - 0.1, HALF_LENGTH * 0.3);
    group.add(mirror);
  }

  // front bumper/splitter + headlights + grille
  const bumperFront = new THREE.Mesh(new THREE.BoxGeometry(HALF_WIDTH * 2.05, 0.24, 0.12), trimMat);
  bumperFront.position.set(0, TUB_Y - TUB_H / 2 + 0.1, HALF_LENGTH - 0.02);
  group.add(bumperFront);
  const bumperRear = bumperFront.clone();
  bumperRear.position.z = -HALF_LENGTH + 0.02;
  group.add(bumperRear);

  const grille = new THREE.Mesh(new THREE.BoxGeometry(HALF_WIDTH * 1.1, 0.16, 0.06), archMat);
  grille.position.set(0, TUB_Y - TUB_H / 2 + 0.28, HALF_LENGTH - 0.02);
  group.add(grille);

  const headlightGeo = new THREE.BoxGeometry(0.32, 0.13, 0.05);
  const headlightMat = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff2b0, emissiveIntensity: 1.6, roughness: 0.3 });
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(headlightGeo, headlightMat);
    hl.position.set(s * (HALF_WIDTH - 0.3), TUB_Y + 0.06, HALF_LENGTH - 0.01);
    group.add(hl);
  }

  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.32, 14);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const wheelPositions = [
    [-HALF_WIDTH - 0.06, 0.42, HALF_LENGTH - 0.68], [HALF_WIDTH + 0.06, 0.42, HALF_LENGTH - 0.68],
    [-HALF_WIDTH - 0.06, 0.42, -HALF_LENGTH + 0.68], [HALF_WIDTH + 0.06, 0.42, -HALF_LENGTH + 0.68],
  ];
  wheelPositions.forEach(([x, y, z], i) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, y, z);
    w.castShadow = true;
    group.add(w);
    const rim = buildRim(0.22, new THREE.MeshStandardMaterial({ map: spokeTexture, roughness: 0.4, metalness: 0.7 }));
    rim.rotation.z = Math.PI / 2;
    rim.position.set(x + (x < 0 ? 0.11 : -0.11), y, z);
    group.add(rim);

    // flared wheel-arch shoulder: a thin flare flush against the tub's side
    // at each wheel, instead of floating in space beside it
    const arch = new THREE.Mesh(new THREE.BoxGeometry(0.1, TUB_H * 0.85, 0.62), archMat);
    arch.position.set(Math.sign(x) * (HALF_WIDTH + 0.03), TUB_Y, z);
    group.add(arch);

    wheels.push({ mesh: w, front: i < 2 });
  });

  const tailLightMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xaa1010, emissiveIntensity: 1.2, roughness: 0.4 });
  const tailLightGeo = new THREE.BoxGeometry(HALF_WIDTH * 0.7, 0.16, 0.05);
  const tailLights = new THREE.Group();
  tailLights.material = tailLightMat; // shared by both lamp meshes below; toggled for braking
  for (const s of [-1, 1]) {
    const tl = new THREE.Mesh(tailLightGeo, tailLightMat);
    tl.position.set(s * HALF_WIDTH * 0.55, TUB_Y + 0.1, -HALF_LENGTH + 0.02);
    tailLights.add(tl);
  }
  group.add(tailLights);

  const neon = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF_WIDTH * 2.6, HALF_LENGTH * 2.6),
    new THREE.MeshBasicMaterial({ color: 0x00eaff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  neon.rotation.x = -Math.PI / 2;
  neon.position.y = 0.05;
  neon.visible = false;
  group.add(neon);

  return { group, bodyMesh: tub, paintPanels, wheels, tailLights, neon, halfLength: HALF_LENGTH, halfWidth: HALF_WIDTH };
}

function buildBikeMesh(color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(BIKE_HALF_WIDTH * 2, 0.5, BIKE_HALF_LENGTH * 2),
    new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 })
  );
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);

  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(BIKE_HALF_WIDTH * 1.6, 0.2, BIKE_HALF_LENGTH * 0.9),
    new THREE.MeshStandardMaterial({ color: 0x1a1d22 })
  );
  seat.position.set(0, 0.85, -0.2);
  group.add(seat);

  const handlebar = new THREE.Mesh(
    new THREE.BoxGeometry(BIKE_HALF_WIDTH * 2.4, 0.08, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.6 })
  );
  handlebar.position.set(0, 0.95, BIKE_HALF_LENGTH - 0.2);
  group.add(handlebar);

  const headlight = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.11, 0.08, 12),
    new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff2b0, emissiveIntensity: 1.6, roughness: 0.3 })
  );
  headlight.rotation.x = Math.PI / 2;
  headlight.position.set(0, 0.75, BIKE_HALF_LENGTH - 0.05);
  group.add(headlight);

  const exhaustMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.3, metalness: 0.85 });
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, BIKE_HALF_LENGTH * 0.9, 8), exhaustMat);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(BIKE_HALF_WIDTH + 0.06, 0.42, -0.3);
  group.add(exhaust);

  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.22, 14);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  [[0, 0.42, BIKE_HALF_LENGTH - 0.3, true], [0, 0.42, -BIKE_HALF_LENGTH + 0.3, false]].forEach(([x, y, z, front]) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, y, z);
    w.castShadow = true;
    group.add(w);
    const rim = buildRim(0.2);
    rim.rotation.z = Math.PI / 2;
    rim.position.set(x, y, z);
    group.add(rim);
    wheels.push({ mesh: w, front });
  });

  const tailLights = new THREE.Mesh(
    new THREE.BoxGeometry(BIKE_HALF_WIDTH * 1.8, 0.15, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xaa1010, emissiveIntensity: 1.2, roughness: 0.4 })
  );
  tailLights.position.set(0, 0.7, -BIKE_HALF_LENGTH + 0.02);
  group.add(tailLights);

  const neon = new THREE.Mesh(
    new THREE.PlaneGeometry(BIKE_HALF_WIDTH * 3, BIKE_HALF_LENGTH * 2.4),
    new THREE.MeshBasicMaterial({ color: 0x00eaff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  neon.rotation.x = -Math.PI / 2;
  neon.position.y = 0.04;
  neon.visible = false;
  group.add(neon);

  return { group, bodyMesh: body, wheels, tailLights, neon, halfLength: BIKE_HALF_LENGTH, halfWidth: BIKE_HALF_WIDTH };
}

const PAINT_COLORS = [0xcc3333, 0x2255aa, 0x22aa55, 0xdddddd, 0x111111, 0xffcc00, 0xaa22cc];
const NEON_OPTIONS = [null, 0x00eaff, 0xff00aa, 0x39ff14, 0xff2a2a, 0xffee00];

export class Vehicle {
  constructor(scene, { position = new THREE.Vector3(), color = 0xcc3333, isPlayerStarter = false, stats = VEHICLE, isBike = false } = {}) {
    const built = isBike ? buildBikeMesh(color) : buildCarMesh(color);
    this.mesh = built.group;
    this.bodyMesh = built.bodyMesh;
    for (const panel of built.paintPanels || [this.bodyMesh]) {
      panel.userData.kind = 'vehicle';
      panel.userData.ref = this;
    }
    this.wheels = built.wheels;
    this.tailLights = built.tailLights;
    this.neonMesh = built.neon;
    this.halfLength = built.halfLength;
    this.halfWidth = built.halfWidth;
    this.isBike = isBike;
    this.stats = stats;

    this.mesh.position.copy(position);
    scene.add(this.mesh);

    this.heading = 0;
    this.speed = 0;
    this.steerInput = 0;
    this.isDrifting = false;
    this.driftIntensity = 0;
    this.occupied = false;
    this.isPlayerStarter = isPlayerStarter; // the demo car you start with — entering others counts as "stealing"
    this.wheelSpin = 0;

    this.maxHealth = stats.health ?? VEHICLE_HEALTH;
    this.health = this.maxHealth;
    this.destroyed = false;

    this._colorIdx = 0;
    this._neonIdx = 0;
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  update(dt, input, world, onDrift, traction = 1) {
    if (!this.occupied) { this._settleWheels(); return { collided: false }; }
    const throttle = input.isDownAny('KeyW', 'ArrowUp') ? 1 : input.isDownAny('KeyS', 'ArrowDown') ? -1 : 0;
    // heading increases toward -X (screen-left) at heading 0, so turning
    // right needs a negative steer value from the right key — see the
    // matching note on player.js's strafe `right` vector.
    const steer = (input.isDownAny('KeyA', 'ArrowLeft') ? 1 : 0) + (input.isDownAny('KeyD', 'ArrowRight') ? -1 : 0);
    return this._physicsStep(dt, throttle, steer, world, onDrift, 1, traction);
  }

  // Autopilot entry point shared by traffic and police AI: drives the same
  // physics/collision code the player uses, just with a computed input.
  driveTowards(dt, world, targetPos, speedLimitFrac = 1, onDrift, traction = 1) {
    const dx = targetPos.x - this.mesh.position.x;
    const dz = targetPos.z - this.mesh.position.z;
    const dist = Math.hypot(dx, dz);
    const desiredHeading = Math.atan2(dx, dz);
    let diff = ((desiredHeading - this.heading + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    const steer = THREE.MathUtils.clamp(diff * 1.6, -1, 1);
    const throttle = dist < 2.5 ? 0 : (Math.abs(diff) > 2.2 ? -1 : 1);
    this._physicsStep(dt, throttle, steer, world, onDrift, speedLimitFrac, traction);
    return dist;
  }

  _physicsStep(dt, throttle, steer, world, onDrift, speedLimitFrac = 1, traction = 1) {
    this.steerInput = THREE.MathUtils.lerp(this.steerInput, steer, Math.min(1, 10 * dt));
    const stats = this.stats;
    const maxSpeed = stats.maxSpeed * speedLimitFrac;

    // acceleration / braking / reverse
    if (throttle > 0) {
      this.speed = Math.min(maxSpeed, this.speed + stats.accel * dt);
    } else if (throttle < 0) {
      if (this.speed > 0.5) this.speed = Math.max(0, this.speed - stats.brake * traction * dt);
      else this.speed = Math.max(-stats.reverseMaxSpeed, this.speed - stats.accel * dt);
    } else {
      const sign = Math.sign(this.speed);
      this.speed -= sign * stats.friction * dt;
      if (Math.sign(this.speed) !== sign) this.speed = 0;
    }

    const speedFrac = Math.min(1, Math.abs(this.speed) / stats.maxSpeed);
    const steerAuthority = (1 - speedFrac * 0.7) * traction; // less agile at speed, and on wet roads
    let turnRate = this.steerInput * stats.turnRate * steerAuthority;

    // drifting: sharp turns at high speed (or any slick-road turn) break rear
    // grip and add oversteer; wet roads amplify the oversteer once sliding
    const sharpTurn = Math.abs(this.steerInput) > stats.driftThreshold * traction;
    this.isDrifting = sharpTurn && speedFrac > 0.45 && Math.abs(this.speed) > 4;
    if (this.isDrifting) {
      this.driftIntensity = Math.min(1, this.driftIntensity + dt * 3);
      turnRate *= 1 + stats.driftGripLoss * this.driftIntensity * (2 - traction);
      this.speed *= 1 - 0.35 * dt; // scrub speed while sliding
      if (onDrift) onDrift(this);
    } else {
      this.driftIntensity = Math.max(0, this.driftIntensity - dt * 2.5);
    }

    if (Math.abs(this.speed) > 0.05) {
      this.heading += turnRate * dt * Math.sign(this.speed);
    }

    const fwd = this.forward;
    let nx = this.mesh.position.x + fwd.x * this.speed * dt;
    let nz = this.mesh.position.z + fwd.z * this.speed * dt;

    const colliders = world.getCollidersNear(this.mesh.position.x, this.mesh.position.z, 25);
    const resolved = resolveVehicleVsBoxes(nx, nz, this.halfLength, this.halfWidth, colliders);
    let collided = false;
    if (resolved.hit) {
      collided = true;
      // reflect velocity off the impact normal and bleed speed (elastic-ish bounce)
      const velX = fwd.x * this.speed, velZ = fwd.z * this.speed;
      const dot = velX * resolved.normal.x + velZ * resolved.normal.z;
      const rx = velX - 2 * dot * resolved.normal.x;
      const rz = velZ - 2 * dot * resolved.normal.z;
      const impactSpeed = Math.hypot(velX, velZ);
      this.speed = Math.hypot(rx, rz) * stats.bodyRestitution * Math.sign(this.speed || 1);
      this.heading = Math.atan2(rx, rz);
      if (impactSpeed > 14) this.takeDamage((impactSpeed - 14) * 2.2);
    }
    this.mesh.position.x = resolved.x;
    this.mesh.position.z = resolved.z;
    this.mesh.rotation.y = this.heading;

    // wheel visuals
    this.wheelSpin += this.speed * dt * 2.2;
    for (const w of this.wheels) {
      w.mesh.rotation.x = this.wheelSpin;
      if (w.front) w.mesh.rotation.y = this.steerInput * 0.5;
    }
    this.tailLights.material.color.setHex(throttle < 0 || this.speed < -0.1 ? 0xff2222 : 0x330000);

    return { collided };
  }

  takeDamage(amount) {
    if (this.destroyed) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) this.destroyed = true;
  }

  cycleColor() {
    this._colorIdx = (this._colorIdx + 1) % PAINT_COLORS.length;
    this.bodyMesh.material.color.setHex(PAINT_COLORS[this._colorIdx]);
  }

  toggleNeon() {
    this._neonIdx = (this._neonIdx + 1) % NEON_OPTIONS.length;
    const c = NEON_OPTIONS[this._neonIdx];
    if (c === null) { this.neonMesh.visible = false; return; }
    this.neonMesh.visible = true;
    this.neonMesh.material.color.setHex(c);
  }

  _settleWheels() {
    for (const w of this.wheels) if (w.front) w.mesh.rotation.y = THREE.MathUtils.lerp(w.mesh.rotation.y, 0, 0.1);
  }

  getExitOffset() {
    const right = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    return new THREE.Vector3().copy(this.mesh.position).addScaledVector(right, this.halfWidth + 1.2);
  }
}
