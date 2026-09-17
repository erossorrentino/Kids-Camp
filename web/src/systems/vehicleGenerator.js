import { mulberry32, pick, randRange } from '../utils/rng.js';

// Procedural fleet catalog, same idea as the 500-entry mission pool and the
// 1000-entry gun catalog: a handful of hand-built physics/mesh classes
// (Vehicle-as-car, Vehicle-as-bike, Boat, Helicopter, Jet, Submarine) each
// get many named/liveried/retuned variants rather than one bespoke model
// per variant. `speedMul`/`handlingMul` scale that class's top speed/accel
// and turn rate respectively (see Game._spawnPurchasedVehicle and each
// entity's constructor overrides) so pricier variants genuinely drive
// differently, not just look different.
const MAKES = [
  'Kestrel', 'Ironvale', 'Sable', 'Vantage', 'Bracewell', 'Meridian', 'Nightline', 'Coastal',
  'Rustbelt', 'Vega', 'Blackwater', 'Sterling', 'Harborline', 'Union', 'Ridgeback', 'Talon',
];
const MODELS = [
  'Comet', 'Marauder', 'Fury', 'Voyager', 'Specter', 'Outrider', 'Cutlass', 'Regent',
  'Drifter', 'Warhawk', 'Sentinel', 'Nomad', 'Baron', 'Renegade', 'Overdrive', 'Zephyr',
];
const TRIMS = ['', 'GT', 'RS', 'Turbo', 'Custom', 'Street', 'Sport', 'LE', 'SE', 'Cartel Spec'];
const COLORS = [
  0xd23a3a, 0x2255aa, 0xdddddd, 0x161616, 0xffd23f, 0x2f8a4a, 0x9a2fd9, 0xff6a00,
  0x1fb0c9, 0x8a1010, 0xc9b98a, 0x33d6ff, 0x555555, 0xffffff, 0x7a1fa2, 0xd4af37,
];

// Base price + physics class per catalog kind, mirrored against SHOPS.types
// in config.js so a variant's baseline matches what the plain version costs.
const KIND_INFO = {
  car: { count: 600, price0: 30000, priceMax: 900000 },
  bike: { count: 300, price0: 15000, priceMax: 300000 },
  boat: { count: 200, price0: 200000, priceMax: 2200000 },
  heli: { count: 150, price0: 1400000, priceMax: 9000000 },
  jet: { count: 150, price0: 14000000, priceMax: 60000000 },
  sub: { count: 100, price0: 3800000, priceMax: 16000000 },
};

export function generateVehicleVariants(seed = 778899) {
  const rng = mulberry32(seed);
  const list = [];
  let n = 0;
  for (const [kind, info] of Object.entries(KIND_INFO)) {
    for (let i = 0; i < info.count; i++) {
      n++;
      const tier = i / info.count;
      const speedMul = 0.82 + tier * 0.55 + randRange(rng, -0.05, 0.05);
      const handlingMul = 0.85 + tier * 0.35 + randRange(rng, -0.05, 0.05);
      const trim = pick(rng, TRIMS);
      const price = Math.round((info.price0 + tier * tier * (info.priceMax - info.price0)) * randRange(rng, 0.9, 1.1) / 10) * 10;
      list.push({
        id: `VEH_${String(n).padStart(4, '0')}`,
        kind,
        name: `${pick(rng, MAKES)} ${pick(rng, MODELS)}${trim ? ' ' + trim : ''}`,
        color: pick(rng, COLORS),
        speedMul: +speedMul.toFixed(3),
        handlingMul: +handlingMul.toFixed(3),
        price,
      });
    }
  }
  return list;
}

export function describeVehicleVariant(v) {
  return `SPEED ${Math.round(v.speedMul * 100)}% · HANDLING ${Math.round(v.handlingMul * 100)}%`;
}

// Merges a variant's speed/handling multipliers into a base VEHICLE/BIKE
// stats block (see config.js) for the Vehicle class, which takes a whole
// `stats` object rather than individual overrides.
export function applyVehicleStatMul(base, variant) {
  return {
    ...base,
    maxSpeed: base.maxSpeed * variant.speedMul,
    accel: base.accel * variant.speedMul,
    reverseMaxSpeed: base.reverseMaxSpeed * variant.speedMul,
    turnRate: base.turnRate * variant.handlingMul,
  };
}
