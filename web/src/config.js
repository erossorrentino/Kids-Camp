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

// The old hand-authored mission list has been replaced by a 500-entry
// procedurally generated pool — see systems/missionGenerator.js. Every entry
// still dispatches on one of the `kind`s MissionManager understands
// (delivery / demolitionVehicles / demolitionProps / hitman / survival / heist).

// Cash you start a fresh save with (see Game._loadCash) — enough to gear up
// at the shops, but the expensive vehicles still take real jobs to afford.
export const STARTING_CASH = 1500000;

// The city sits on an island: CityWorld only generates land within `radius`
// of the origin (see world/city.js), everything past that is open ocean.
// Foot/car/bike travel is clamped at the shoreline; boats, subs, and
// aircraft can freely cross it.
export const ISLAND = { radius: 1400 };

export const WATER = {
  level: -0.4,       // sea surface height
  color: 0x1c5f7d,
  size: 20000,       // the ocean plane's edge length, centered on the origin
};

// A sandy ring where the island meets the sea: only the part beyond
// ISLAND.radius is ever actually visible (the land chunks cover the rest),
// sloping from street level down to the water's surface.
export const BEACH = {
  color: 0xd8c39a,
  innerRadius: ISLAND.radius - 20,
  outerRadius: ISLAND.radius + 25,
  level: -0.08,
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
// see WeaponSystem); vehicle shops spawn ("call in") a vehicle near the shop;
// the fixer sells the one-time CONTRACTOR_LICENSE (see Game.hasLicense) that
// gates the mission board — no license, no contracts. Prices are pitched at
// roughly what the real item costs (a small civilian sub, a fighter jet on
// the private warbird market, a box of pistol ammo, ...), not game-balance
// round numbers, so the big toys take real jobs to save up for.
export const SHOPS = {
  types: {
    FIXER: {
      name: 'THE FIXER', color: 0x9a2fd9,
      items: [
        { id: 'contractor_license', label: 'Contractor License (unlocks contracts)', price: 50000, license: true },
      ],
    },
    GUN_SHOP: {
      name: 'GUN SHOP', color: 0xd94040,
      items: [
        { id: 'ammo_pistol', label: 'Pistol ammo (box of 50, 9mm)', price: 35, weapon: 'pistol' },
        { id: 'ammo_rifle', label: 'Rifle ammo (case, 5.56mm)', price: 280, weapon: 'rifle' },
        { id: 'ammo_shotgun', label: 'Shotgun shells (box of 25)', price: 60, weapon: 'shotgun' },
        { id: 'ammo_rocket', label: 'Rocket resupply (military ordnance)', price: 45000, weapon: 'rocket' },
        { id: 'ammo_railgun', label: 'Railgun slug resupply (experimental)', price: 95000, weapon: 'railgun' },
        { id: 'ammo_all', label: 'Restock ALL weapons', price: 130000, weapon: 'all' },
      ],
    },
    CAR_SHOP: {
      name: 'CAR DEALERSHIP', color: 0x3d6bff,
      items: [
        { id: 'car_sedan', label: 'Call in a Sedan (new, MSRP)', price: 35000, spawn: 'car' },
        { id: 'car_bike', label: 'Call in a Superbike (new, MSRP)', price: 18000, spawn: 'bike' },
      ],
    },
    BOAT_SHOP: {
      name: 'BOAT DOCK', color: 0x1fb0c9,
      items: [{ id: 'boat_speed', label: 'Call in a Speedboat (new, 30ft)', price: 250000, spawn: 'boat' }],
    },
    HELI_SHOP: {
      name: 'HELIPAD', color: 0xffa62b,
      items: [{ id: 'heli_std', label: 'Call in a Helicopter (light turbine)', price: 1800000, spawn: 'heli' }],
    },
    JET_SHOP: {
      name: 'AIRFIELD', color: 0xff3a3a,
      items: [{ id: 'jet_fighter', label: 'Call in a Fighter Jet (ex-military, private market)', price: 18000000, spawn: 'jet' }],
    },
    SUB_SHOP: {
      name: 'SUB PEN', color: 0x8a5cff,
      items: [{ id: 'sub_std', label: 'Call in a Submarine (personal submersible)', price: 4500000, spawn: 'sub' }],
    },
    // A gambling den rather than a gear shop: its "items" are bets, not
    // purchases — see Game.purchaseShopItem's `gamble` branch, which spins
    // a weighted payout instead of granting/spawning anything.
    CASINO: {
      name: 'THE GOLDEN VEGA CASINO', color: 0xffd23f,
      items: [
        { id: 'slots_100', label: 'Play the slots — bet $100', price: 100, gamble: true },
        { id: 'slots_1000', label: 'Play the slots — bet $1,000', price: 1000, gamble: true },
        { id: 'slots_10000', label: 'Play the slots — bet $10,000', price: 10000, gamble: true },
        { id: 'slots_100000', label: 'Play the slots — bet $100,000 (high roller)', price: 100000, gamble: true },
      ],
    },
  },
  // Land shops sit on the sidewalk/plaza of the spawn chunk (0,0) — the one
  // chunk CityWorld guarantees stays free of buildings and props (see
  // world/city.js's isSpawnPlaza) — spread out across it, off the actual
  // road lanes so they never sit in traffic. Transport shops sit on the
  // shoreline along the 4 cardinal directions, just inside the island
  // radius, so buying one launches the vehicle straight into open water.
  locations: [
    { type: 'FIXER', position: [25, 0, 100] },
    { type: 'GUN_SHOP', position: [95, 0, 100] },
    { type: 'GUN_SHOP', position: [95, 0, 35] },
    { type: 'CAR_SHOP', position: [55, 0, 65] },
    { type: 'CAR_SHOP', position: [25, 0, 35] },
    { type: 'CASINO', position: [-40, 0, 70] },
    { type: 'BOAT_SHOP', position: [ISLAND.radius - 15, 0, 0] },
    { type: 'SUB_SHOP', position: [-(ISLAND.radius - 15), 0, 0] },
    { type: 'HELI_SHOP', position: [0, 0, ISLAND.radius - 15] },
    { type: 'JET_SHOP', position: [0, 0, -(ISLAND.radius - 15)] },
  ],
};
