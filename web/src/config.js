// Central tunables for the whole prototype.
export const WORLD_SEED = 1337;

export const CITY = {
  chunkSize: 120,
  roadWidth: 14,
  lotsPerSide: 3,
  renderRadius: 3,     // chunks kept fully loaded around the player
  unloadRadius: 4,     // chunks beyond this are torn down
  minHeight: 8,
  maxHeight: 70,
  colorPalettes: [
    [0x8a97a8, 0x6f7c8c, 0x9fb0c4],
    [0xc9b98a, 0xa89570, 0xe0d0a0],
    [0x7a8a7a, 0x5f6f5f, 0x94a894],
    [0x9a8a9a, 0x7a6a7a, 0xb8a6b8],
  ],
};

export const PLAYER = {
  radius: 0.4,
  height: 1.8,
  walkSpeed: 3.2,
  runSpeed: 6.4,
  jumpVelocity: 6.5,
  gravity: 18,
  turnLerp: 10,
  health: 100,
  armor: 100,
};

export const CAMERA = {
  fov: 65,
  near: 0.1,
  far: 1400,
  followDist: 6,
  followHeight: 2.4,
  aimDist: 2.4,
  aimHeight: 1.6,
  aimSideOffset: 0.6,
  mouseSensitivity: 0.0022,
  aimSensitivityMul: 0.4,
  lerpPos: 6,
  lerpLook: 10,
};

export const VEHICLE = {
  enterRange: 4,
  maxSpeed: 42,
  reverseMaxSpeed: 12,
  accel: 16,
  brake: 26,
  friction: 4,
  turnRate: 2.4,          // rad/s baseline, scales down with speed
  driftThreshold: 0.55,   // fraction of max steering input * speed to trigger drift
  driftGripLoss: 0.55,
  bodyRestitution: 0.35,
};

export const HELI = {
  enterRange: 5,
  rotorSpinUpTime: 1.6,
  ascendSpeed: 9,
  pitchRollRate: 1.6,
  yawRate: 1.4,
  drag: 0.6,
};

export const JET = {
  enterRange: 6,
  throttleAccel: 14,
  maxSpeed: 90,
  minLiftSpeed: 22,
  stallSinkRate: 14,
  rollRate: 2.4,
  pitchRate: 1.6,
  yawRate: 0.6,
  liftCoefficient: 0.9,
};

export const WEAPONS = [
  { id: 'pistol', name: 'PISTOL', color: 0x555555, damage: 18, fireRate: 3.2, maxAmmo: 60, spread: 0.012 },
  { id: 'rifle', name: 'RIFLE', color: 0x3a5a2f, damage: 26, fireRate: 8, maxAmmo: 180, spread: 0.02 },
  { id: 'shotgun', name: 'SHOTGUN', color: 0x6a4a2a, damage: 12, fireRate: 1.4, maxAmmo: 40, spread: 0.09, pellets: 6 },
];

export const WANTED = {
  maxStars: 5,
  decayTime: 8,        // seconds out of sight before a star decays
  starDurationBase: 20,
  policeChasePerStar: 1, // extra pursuers per star tier
};

export const AI = {
  pedestrianCountPerChunk: 4,
  trafficCountPerChunk: 2,
  enemyDetectionRadius: 26,
  enemyFireRange: 22,
  policeSpeedBase: 8,
  policeSpeedPerStar: 2.2,
};
