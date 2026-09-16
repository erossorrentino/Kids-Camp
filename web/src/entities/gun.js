import * as THREE from '../../vendor/three/three.module.js';

// Distinct, multi-part low-poly gun models (one per weapon id) instead of a
// single tinted box. Each builder returns { group, muzzle }: `group` is the
// full mesh (forward = local +Z, matching the old box's orientation on the
// hand anchor) and `muzzle` is an Object3D at the barrel tip, used to
// position the muzzle flash and give projectiles/tracers a realistic origin.

const steel = () => new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.35, metalness: 0.75 });
const darkGrip = () => new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.8, metalness: 0.1 });
const accent = (hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.4, metalness: 0.5 });
const glass = () => new THREE.MeshStandardMaterial({ color: 0x1a2a2e, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.7 });

function addMuzzle(group, z) {
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, z);
  group.add(muzzle);
  return muzzle;
}

function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  return m;
}

function buildPistol() {
  const group = new THREE.Group();
  const slide = box(0.09, 0.1, 0.32, steel());
  slide.position.set(0, 0.03, 0.02);
  group.add(slide);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 10), steel());
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.03, 0.22);
  group.add(barrel);

  const grip = box(0.075, 0.16, 0.09, darkGrip());
  grip.position.set(0, -0.08, -0.1);
  grip.rotation.x = -0.18;
  group.add(grip);

  const trigger = box(0.014, 0.03, 0.02, steel());
  trigger.position.set(0, -0.015, 0.02);
  group.add(trigger);

  const sightR = box(0.02, 0.02, 0.02, steel());
  sightR.position.set(0, 0.09, 0.14);
  group.add(sightR);
  const sightF = box(0.012, 0.02, 0.012, steel());
  sightF.position.set(0, 0.09, 0.36);
  group.add(sightF);

  const mag = box(0.055, 0.07, 0.03, darkGrip());
  mag.position.set(0, -0.16, -0.1);
  group.add(mag);

  return { group, muzzle: addMuzzle(group, 0.28) };
}

function buildRifle() {
  const group = new THREE.Group();
  const body = box(0.07, 0.09, 0.58, steel());
  body.position.set(0, 0.02, 0);
  group.add(body);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.28, 10), steel());
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.03, 0.42);
  group.add(barrel);

  const handguard = box(0.075, 0.06, 0.22, accent(0x3a5a2f));
  handguard.position.set(0, 0, 0.24);
  group.add(handguard);

  const stock = box(0.06, 0.08, 0.24, accent(0x3a5a2f));
  stock.position.set(0, 0, -0.34);
  group.add(stock);

  const grip = box(0.055, 0.14, 0.06, darkGrip());
  grip.position.set(0, -0.09, -0.08);
  grip.rotation.x = -0.25;
  group.add(grip);

  const mag = box(0.05, 0.22, 0.05, darkGrip());
  mag.position.set(0, -0.16, 0.05);
  mag.rotation.x = 0.35;
  group.add(mag);

  const sightRear = box(0.02, 0.03, 0.02, steel());
  sightRear.position.set(0, 0.085, -0.14);
  group.add(sightRear);
  const rail = box(0.05, 0.015, 0.3, steel());
  rail.position.set(0, 0.075, 0.05);
  group.add(rail);
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.16, 10), glass());
  scope.rotation.x = Math.PI / 2;
  scope.position.set(0, 0.1, 0.08);
  group.add(scope);

  return { group, muzzle: addMuzzle(group, 0.56) };
}

function buildShotgun() {
  const group = new THREE.Group();
  const receiver = box(0.09, 0.1, 0.3, accent(0x6a4a2a));
  receiver.position.set(0, 0.02, -0.05);
  group.add(receiver);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 10), steel());
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.04, 0.3);
  group.add(barrel);

  const pump = box(0.075, 0.06, 0.16, darkGrip());
  pump.position.set(0, -0.02, 0.22);
  group.add(pump);

  const stock = box(0.065, 0.1, 0.26, darkGrip());
  stock.position.set(0, -0.01, -0.32);
  group.add(stock);

  const grip = box(0.06, 0.13, 0.06, darkGrip());
  grip.position.set(0, -0.08, -0.12);
  grip.rotation.x = -0.2;
  group.add(grip);

  const shellTube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.4, 8), accent(0xb8862a));
  shellTube.rotation.x = Math.PI / 2;
  shellTube.position.set(0, -0.03, 0.24);
  group.add(shellTube);

  return { group, muzzle: addMuzzle(group, 0.5) };
}

function buildRocketLauncher() {
  const group = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.82, 12), accent(0x3a3f34));
  tube.rotation.x = Math.PI / 2;
  tube.position.set(0, 0.02, 0.1);
  group.add(tube);

  const frontRing = new THREE.Mesh(new THREE.TorusGeometry(0.076, 0.012, 6, 12), steel());
  frontRing.rotation.x = Math.PI / 2;
  frontRing.position.set(0, 0.02, 0.5);
  group.add(frontRing);

  const sight = box(0.02, 0.09, 0.02, steel());
  sight.position.set(0, 0.11, 0.1);
  group.add(sight);

  const grip = box(0.06, 0.15, 0.07, darkGrip());
  grip.position.set(0, -0.11, -0.02);
  grip.rotation.x = -0.15;
  group.add(grip);

  const shoulderPad = box(0.11, 0.11, 0.05, darkGrip());
  shoulderPad.position.set(0, 0.02, -0.32);
  group.add(shoulderPad);

  const warningStripe = new THREE.Mesh(new THREE.CylinderGeometry(0.077, 0.077, 0.05, 12), accent(0xd9a827));
  warningStripe.rotation.x = Math.PI / 2;
  warningStripe.position.set(0, 0.02, 0.3);
  group.add(warningStripe);

  return { group, muzzle: addMuzzle(group, 0.52) };
}

function buildRailgun() {
  const group = new THREE.Group();
  const core = box(0.06, 0.075, 0.5, steel());
  core.position.set(0, 0.02, 0.05);
  group.add(core);

  // twin exposed coil rails running along the barrel — sci-fi railgun look
  for (const s of [-1, 1]) {
    const rail = box(0.02, 0.02, 0.46, accent(0x33d6ff));
    rail.material.emissive = new THREE.Color(0x0e6a80);
    rail.material.emissiveIntensity = 0.8;
    rail.position.set(s * 0.045, 0.05, 0.14);
    group.add(rail);
  }

  const coilGeo = new THREE.TorusGeometry(0.05, 0.008, 6, 12);
  for (let i = 0; i < 3; i++) {
    const coil = new THREE.Mesh(coilGeo, accent(0x9adfff));
    coil.rotation.x = Math.PI / 2;
    coil.position.set(0, 0.05, -0.05 + i * 0.16);
    group.add(coil);
  }

  const grip = box(0.055, 0.14, 0.06, darkGrip());
  grip.position.set(0, -0.09, -0.14);
  grip.rotation.x = -0.2;
  group.add(grip);

  const stock = box(0.05, 0.06, 0.2, steel());
  stock.position.set(0, 0.01, -0.32);
  group.add(stock);

  const powerCell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8),
    new THREE.MeshStandardMaterial({ color: 0x33d6ff, emissive: 0x1aa0c0, emissiveIntensity: 1.4, roughness: 0.3 })
  );
  powerCell.rotation.x = Math.PI / 2;
  powerCell.position.set(0, -0.06, -0.18);
  group.add(powerCell);

  return { group, muzzle: addMuzzle(group, 0.3) };
}

const BUILDERS = {
  pistol: buildPistol,
  rifle: buildRifle,
  shotgun: buildShotgun,
  rocket: buildRocketLauncher,
  railgun: buildRailgun,
};

export function buildGunMesh(weaponId) {
  const builder = BUILDERS[weaponId] || buildPistol;
  return builder();
}
