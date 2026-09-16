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
  {
    id: 'rocket', name: 'ROCKET LAUNCHER', color: 0x2a2a2a, damage: 130, fireRate: 0.8, maxAmmo: 8,
    spread: 0.004, projectile: true, projectileSpeed: 55, splashRadius: 7, blastDamage: 90,
  },
  {
    id: 'railgun', name: 'RAILGUN', color: 0x33d6ff, damage: 210, fireRate: 0.7, maxAmmo: 12,
    spread: 0.0015, pierce: true,
  },
];

export const VEHICLE_HEALTH = 120;
export const EXPLOSION = {
  radius: 8,
  vehicleDamage: 90,
  actorDamage: 70,
};

export const BIKE = {
  enterRange: 4,
  maxSpeed: 52,
  reverseMaxSpeed: 8,
  accel: 22,
  brake: 22,
  friction: 5,
  turnRate: 3.4,
  driftThreshold: 0.4,
  driftGripLoss: 0.7,
  bodyRestitution: 0.25,
  health: 70,
};

export const PROPS = {
  perChunk: 3,
  health: 40,
};

export const WEATHER = {
  clearDuration: [30, 55],   // seconds, randomized range per phase
  rainDuration: [20, 40],
  transitionTime: 6,
  rainDropCount: 1400,
  rainFallSpeed: 26,
  wetTraction: 0.6,          // multiplier on grip while roads are wet (1 = dry)
  thunderChance: 0.15,       // per-second chance of a thunderclap while raining
};

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

export const MISSIONS = {
  types: {
    DELIVERY: { kind: 'delivery', timeLimit: 75, minDist: 90, maxDist: 220, rewardRange: [400, 900] },
    // Same delivery shape, but you must actually be driving when you reach
    // the drop point — the timer keeps running if you show up on foot.
    GETAWAY: { kind: 'delivery', requireVehicle: true, timeLimit: 65, minDist: 100, maxDist: 200, rewardRange: [500, 1100] },
    DEMOLITION: { kind: 'demolitionVehicles', timeLimit: 70, targetCount: 3, rewardRange: [600, 1100] },
    // Same "destroy N before time's up" shape as DEMOLITION, aimed at street
    // props (crates/barriers) instead of vehicles.
    RAMPAGE: { kind: 'demolitionProps', timeLimit: 60, targetCount: 5, rewardRange: [500, 950] },
    HITMAN: { kind: 'hitman', timeLimit: 80, targetCount: 4, rewardRange: [550, 1000] },
    SURVIVAL: { kind: 'survival', duration: 45, rewardRange: [350, 700] },
    // The big scores: break into a marked vault, which triggers a serious
    // wanted-heat spike and swaps the beacon to a getaway point you need to
    // reach before time runs out. Three flavors at different risk/reward.
    HEIST: {
      kind: 'heist', timeLimit: 150, minDist: 120, maxDist: 260,
      escapeMinDist: 90, escapeMaxDist: 180, rewardRange: [250000, 2000000], alarmStars: 3,
    },
    JEWELRY_STORE: {
      kind: 'heist', timeLimit: 100, minDist: 60, maxDist: 140,
      escapeMinDist: 70, escapeMaxDist: 140, rewardRange: [250000, 1200000], alarmStars: 2,
    },
    ARMORED_CAR: {
      kind: 'heist', requireVehicleEscape: true, timeLimit: 130, minDist: 90, maxDist: 200,
      escapeMinDist: 100, escapeMaxDist: 200, rewardRange: [400000, 2500000], alarmStars: 4,
    },
  },
};

// The city sits on an island: CityWorld only generates land within `radius`
// of the origin (see world/city.js), everything past that is open ocean.
// Foot/car/bike travel is clamped at the shoreline; boats, subs, and
// aircraft can freely cross it.
export const ISLAND = { radius: 480 };

export const WATER = {
  level: -0.4,       // sea surface height
  color: 0x1c5f7d,
  size: 6000,        // the ocean plane's edge length, centered on the origin
};

export const BOAT = {
  enterRange: 4,
  maxSpeed: 30,
  reverseMaxSpeed: 10,
  accel: 10,
  brake: 14,
  friction: 3,
  turnRate: 1.6,
};

export const SUB = {
  enterRange: 5,
  maxSpeed: 22,
  throttleAccel: 9,
  yawRate: 1.0,
  ascendSpeed: 6,
  maxDepth: 30,
};

// Shops: fixed world markers the player walks/drives up to and presses F on
// to spend cash. Gun shops restock ammo (every weapon is already carried —
// see WeaponSystem); the rest spawn ("call in") a vehicle near the shop.
export const SHOPS = {
  types: {
    GUN_SHOP: {
      name: 'GUN SHOP', color: 0xd94040,
      items: [
        { id: 'ammo_pistol', label: 'Pistol ammo refill', price: 150, weapon: 'pistol' },
        { id: 'ammo_rifle', label: 'Rifle ammo refill', price: 400, weapon: 'rifle' },
        { id: 'ammo_shotgun', label: 'Shotgun ammo refill', price: 300, weapon: 'shotgun' },
        { id: 'ammo_rocket', label: 'Rocket ammo refill', price: 1200, weapon: 'rocket' },
        { id: 'ammo_railgun', label: 'Railgun ammo refill', price: 1800, weapon: 'railgun' },
        { id: 'ammo_all', label: 'Restock ALL weapons', price: 3000, weapon: 'all' },
      ],
    },
    CAR_SHOP: {
      name: 'CAR DEALERSHIP', color: 0x3d6bff,
      items: [
        { id: 'car_sedan', label: 'Call in a Sedan', price: 1500, spawn: 'car' },
        { id: 'car_bike', label: 'Call in a Superbike', price: 2500, spawn: 'bike' },
      ],
    },
    BOAT_SHOP: {
      name: 'BOAT DOCK', color: 0x1fb0c9,
      items: [{ id: 'boat_speed', label: 'Call in a Speedboat', price: 5000, spawn: 'boat' }],
    },
    HELI_SHOP: {
      name: 'HELIPAD', color: 0xffa62b,
      items: [{ id: 'heli_std', label: 'Call in a Helicopter', price: 15000, spawn: 'heli' }],
    },
    JET_SHOP: {
      name: 'AIRFIELD', color: 0xff3a3a,
      items: [{ id: 'jet_fighter', label: 'Call in a Fighter Jet', price: 40000, spawn: 'jet' }],
    },
    SUB_SHOP: {
      name: 'SUB PEN', color: 0x8a5cff,
      items: [{ id: 'sub_std', label: 'Call in a Submarine', price: 25000, spawn: 'sub' }],
    },
  },
  // Land shops sit in the clear spawn-plaza chunk; transport shops sit on
  // the shoreline along the 4 cardinal directions, just inside the island
  // radius, so buying one launches the vehicle straight out into open water.
  locations: [
    { type: 'GUN_SHOP', position: [100, 0, 100] },
    { type: 'GUN_SHOP', position: [30, 0, 100] },
    { type: 'CAR_SHOP', position: [100, 0, 60] },
    { type: 'CAR_SHOP', position: [60, 0, 100] },
    { type: 'BOAT_SHOP', position: [465, 0, 0] },
    { type: 'SUB_SHOP', position: [-465, 0, 0] },
    { type: 'HELI_SHOP', position: [0, 0, 465] },
    { type: 'JET_SHOP', position: [0, 0, -465] },
  ],
};
