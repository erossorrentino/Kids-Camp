// The 10,000-car catalogue. Generated deterministically (same seed -> same
// cars every time), so nothing needs to be stored and every car always looks
// and drives the same. All brands and model names are invented.
import { RNG, hashString, clamp, lerp } from '../core/rng.js';

export const CAR_COUNT = 10000;

export const CLASSES = {
  compact: { name: 'Compact', bodies: ['hatch'], hp: [70, 150], kg: [900, 1250], top: [165, 205], price: [16000, 29000], grip: 0.95, aero: 0.05, drive: [['FWD', 1]], count: 900, engines: ['I3', 'I4'] },
  sedan: { name: 'Sedan', bodies: ['sedan'], hp: [110, 340], kg: [1300, 1750], top: [190, 255], price: [22000, 85000], grip: 1.0, aero: 0.06, drive: [['FWD', 3], ['RWD', 2], ['AWD', 1]], count: 1300, engines: ['I4', 'V6'] },
  hothatch: { name: 'Hot Hatch', bodies: ['hatch'], hp: [180, 340], kg: [1150, 1450], top: [220, 268], price: [30000, 62000], grip: 1.05, aero: 0.1, drive: [['FWD', 3], ['AWD', 2]], count: 700, engines: ['I4'] },
  coupe: { name: 'Coupe', bodies: ['coupe'], hp: [200, 430], kg: [1300, 1650], top: [230, 285], price: [30000, 105000], grip: 1.04, aero: 0.1, drive: [['RWD', 3], ['AWD', 1]], count: 800, engines: ['I4', 'V6', 'I6'] },
  muscle: { name: 'Muscle', bodies: ['muscle'], hp: [300, 820], kg: [1550, 1950], top: [240, 325], price: [32000, 120000], grip: 1.0, aero: 0.08, drive: [['RWD', 1]], count: 650, engines: ['V8'] },
  suv: { name: 'SUV', bodies: ['suv'], hp: [150, 720], kg: [1850, 2500], top: [190, 305], price: [28000, 250000], grip: 0.98, aero: 0.05, drive: [['AWD', 1]], count: 750, engines: ['I4', 'V6', 'V8'] },
  pickup: { name: 'Pickup', bodies: ['pickup'], hp: [200, 720], kg: [2000, 2700], top: [175, 260], price: [35000, 115000], grip: 0.95, aero: 0.04, drive: [['RWD', 1], ['AWD', 1]], count: 400, engines: ['V6', 'V8'] },
  sports: { name: 'Sports', bodies: ['sports'], hp: [280, 570], kg: [1200, 1520], top: [255, 312], price: [60000, 245000], grip: 1.1, aero: 0.25, drive: [['RWD', 3], ['AWD', 1]], count: 900, engines: ['I6', 'V6', 'V8', 'F6'] },
  classic: { name: 'Classic', bodies: ['classic'], hp: [60, 420], kg: [850, 1500], top: [150, 272], price: [15000, 3500000], grip: 0.9, aero: 0.04, drive: [['RWD', 1]], count: 600, engines: ['I4', 'I6', 'V8', 'V12'] },
  electric: { name: 'Electric', bodies: ['sedan', 'sports', 'suv', 'wedge', 'hatch'], hp: [180, 2000], kg: [1600, 2350], top: [180, 412], price: [29000, 2400000], grip: 1.05, aero: 0.2, drive: [['RWD', 1], ['AWD', 2]], count: 650, engines: ['EV'], ev: true },
  gt: { name: 'Grand Tourer', bodies: ['gt'], hp: [450, 790], kg: [1550, 1900], top: [300, 336], price: [100000, 420000], grip: 1.1, aero: 0.3, drive: [['RWD', 2], ['AWD', 1]], count: 500, engines: ['V8', 'V12'] },
  supercar: { name: 'Supercar', bodies: ['wedge'], hp: [600, 900], kg: [1300, 1600], top: [320, 355], price: [220000, 650000], grip: 1.18, aero: 0.6, drive: [['RWD', 1], ['AWD', 1]], count: 500, engines: ['V8', 'V10', 'V12'] },
  hypercar: { name: 'Hypercar', bodies: ['wedge'], hp: [900, 1600], kg: [1200, 1500], top: [350, 490], price: [1000000, 4000000], grip: 1.25, aero: 1.2, drive: [['AWD', 2], ['RWD', 1]], count: 250, engines: ['V8', 'V12', 'W16'] },
  rally: { name: 'Rally', bodies: ['hatch'], hp: [280, 400], kg: [1200, 1350], top: [195, 235], price: [120000, 1000000], grip: 1.12, aero: 0.4, drive: [['AWD', 1]], count: 200, engines: ['I4'], race: true },
  touring: { name: 'Touring Car', bodies: ['sedan', 'coupe'], hp: [300, 430], kg: [1150, 1300], top: [240, 275], price: [150000, 600000], grip: 1.3, aero: 0.8, drive: [['FWD', 1], ['RWD', 1]], count: 250, engines: ['I4', 'V6'], race: true },
  gt3: { name: 'GT3 Race', bodies: ['sports', 'gt', 'wedge'], hp: [500, 600], kg: [1230, 1320], top: [280, 302], price: [480000, 750000], grip: 1.42, aero: 2.0, drive: [['RWD', 1]], count: 250, engines: ['V8', 'V10', 'F6'], race: true },
  proto: { name: 'Prototype', bodies: ['proto'], hp: [650, 1000], kg: [900, 1060], top: [320, 346], price: [500000, 5000000], grip: 1.6, aero: 3.5, drive: [['RWD', 2], ['AWD', 1]], count: 120, engines: ['V6', 'V8'], race: true },
  formulaJr: { name: 'Formula Junior', bodies: ['formula'], hp: [160, 620], kg: [470, 640], top: [220, 300], price: [110000, 1300000], grip: 1.55, aero: 2.8, drive: [['RWD', 1]], count: 200, engines: ['I4', 'V6'], race: true },
  formula1: { name: 'Formula Elite', bodies: ['formula'], hp: [950, 1050], kg: [798, 812], top: [340, 372], price: [12000000, 20000000], grip: 1.8, aero: 5.5, drive: [['RWD', 1]], count: 80, engines: ['V6T'], race: true },
};
export const CLASS_KEYS = Object.keys(CLASSES);

// name, flavour, prestige 0..1, class focus
const B = (name, flavor, prestige, focus) => ({ name, flavor, prestige, focus });
export const BRANDS = [
  B('Velocci', 'it', 0.9, { supercar: 4, hypercar: 2, gt: 3, sports: 2, gt3: 2, classic: 1 }),
  B('Ardenza', 'it', 0.8, { sports: 3, gt: 2, coupe: 2, classic: 2, supercar: 2 }),
  B('Corvanti', 'it', 0.95, { hypercar: 3, supercar: 3, gt3: 1, proto: 1 }),
  B('Lucerno', 'it', 0.55, { compact: 3, hothatch: 3, sedan: 2, rally: 1 }),
  B('Saturna', 'it', 0.7, { coupe: 2, sports: 2, classic: 2, touring: 1 }),
  B('Marzetti', 'it', 0.85, { formulaJr: 2, formula1: 2, proto: 1, gt3: 1 }),
  B('Kessler', 'de', 0.8, { sedan: 3, coupe: 2, sports: 2, suv: 2, touring: 2, gt3: 1 }),
  B('Brandt', 'de', 0.6, { compact: 2, sedan: 3, hothatch: 2, suv: 1 }),
  B('Vogelsang', 'de', 0.9, { sports: 3, gt3: 3, proto: 2, gt: 1 }),
  B('Hartmann', 'de', 0.75, { sedan: 2, gt: 2, suv: 2, electric: 1 }),
  B('Steinwerk', 'de', 0.65, { coupe: 2, hothatch: 2, touring: 2, rally: 1 }),
  B('Reinholt', 'de', 0.85, { gt: 2, supercar: 2, hypercar: 1, classic: 1 }),
  B('Takeda', 'jp', 0.6, { compact: 3, sedan: 3, hothatch: 2, coupe: 2, rally: 2 }),
  B('Hoshiro', 'jp', 0.7, { sports: 3, coupe: 3, gt3: 1, touring: 2 }),
  B('Kazemoto', 'jp', 0.55, { compact: 3, suv: 2, pickup: 2, sedan: 2 }),
  B('Ryuzen', 'jp', 0.8, { sports: 3, supercar: 2, gt: 1, electric: 1, formulaJr: 1 }),
  B('Mizuka', 'jp', 0.5, { compact: 4, hothatch: 2, electric: 1 }),
  B('Sorato', 'jp', 0.65, { rally: 2, hothatch: 2, coupe: 2, classic: 1 }),
  B('Ashbourne', 'uk', 0.9, { gt: 4, supercar: 1, classic: 2, sports: 1 }),
  B('Whitcombe', 'uk', 0.6, { compact: 2, hothatch: 2, sedan: 1, classic: 2 }),
  B('Pembridge', 'uk', 0.85, { suv: 3, sedan: 2, gt: 1 }),
  B('Halsey', 'uk', 0.75, { sports: 3, coupe: 2, gt3: 1, formulaJr: 1 }),
  B('Thornbury', 'uk', 0.9, { formula1: 2, formulaJr: 2, proto: 2, gt3: 1 }),
  B('Carrington', 'uk', 0.8, { classic: 3, gt: 2, coupe: 1 }),
  B('Halvorsen', 'us', 0.55, { muscle: 4, pickup: 3, sedan: 1, suv: 1 }),
  B('Brookline', 'us', 0.5, { sedan: 3, suv: 3, pickup: 2, compact: 1 }),
  B('Rexford', 'us', 0.65, { muscle: 3, sports: 2, classic: 2 }),
  B('Callahan', 'us', 0.6, { pickup: 4, suv: 3, muscle: 1 }),
  B('Stratton', 'us', 0.8, { sports: 2, supercar: 2, gt3: 1, muscle: 1 }),
  B('Ironside', 'us', 0.5, { pickup: 3, suv: 3 }),
  B('Garrison', 'us', 0.7, { muscle: 3, classic: 3, coupe: 1 }),
  B('Dalton', 'us', 0.75, { proto: 1, gt3: 2, touring: 1, formulaJr: 1 }),
  B('Delacroix', 'fr', 0.7, { compact: 2, hothatch: 3, rally: 2, sedan: 1 }),
  B('Montclair', 'fr', 0.85, { gt: 2, hypercar: 2, supercar: 1, proto: 1 }),
  B('Lavalle', 'fr', 0.55, { compact: 3, sedan: 2, electric: 1 }),
  B('Beaumont', 'fr', 0.7, { classic: 2, coupe: 2, touring: 1 }),
  B('Nordvik', 'se', 0.65, { sedan: 2, suv: 3, electric: 2 }),
  B('Fjellstrom', 'se', 0.85, { hypercar: 2, supercar: 2, electric: 1 }),
  B('Skarsgaard', 'se', 0.6, { rally: 2, hothatch: 2, coupe: 1 }),
  B('Hanseong', 'kr', 0.5, { compact: 3, sedan: 3, suv: 2, electric: 1 }),
  B('Daeyang', 'kr', 0.6, { sedan: 2, hothatch: 2, touring: 2, electric: 1 }),
  B('Voltara', 'ev', 0.75, { electric: 6 }),
  B('Ionix', 'ev', 0.6, { electric: 6 }),
  B('Lumen', 'ev', 0.85, { electric: 5, hypercar: 1 }),
  B('Nexum', 'ev', 0.7, { electric: 5, suv: 1 }),
  B('Quanta', 'ev', 0.9, { electric: 4, hypercar: 1 }),
  B('Apex Racing', 'race', 0.9, { gt3: 3, proto: 2, formulaJr: 2, formula1: 1, touring: 1 }),
  B('Vortech', 'race', 0.85, { touring: 3, rally: 2, gt3: 2, formulaJr: 1 }),
  B('Kinetic', 'race', 0.8, { formulaJr: 3, formula1: 2, proto: 1 }),
  B('Redline Works', 'race', 0.75, { rally: 3, touring: 2, gt3: 1 }),
];

const MODELS = {
  it: ['Strada', 'Veloce', 'Corsa', 'Furia', 'Tempesta', 'Vento', 'Saetta', 'Fulmine', 'Aria', 'Notte', 'Diavolo', 'Lampo', 'Stella', 'Ombra', 'Brezza', 'Roccia', 'Fiamma', 'Turbine', 'Volpe', 'Aquila', 'Leone', 'Lupo', 'Falco', 'Gemma', 'Onda', 'Luna', 'Sole', 'Cielo', 'Vortice', 'Orizzonte'],
  de: ['Blitz', 'Sturm', 'Falke', 'Adler', 'Donner', 'Pfeil', 'Kraft', 'Ring', 'Berg', 'Feuer', 'Stahl', 'Nacht', 'Bahn', 'Licht', 'Kreis', 'Welle', 'Funke', 'Wind', 'Sonne', 'Silber', 'Eisen', 'Hagel', 'Fels', 'Strom', 'Glanz', 'Kompass', 'Tor', 'Spur', 'Zeit', 'Horizont'],
  jp: ['Kaze', 'Hayate', 'Raijin', 'Sora', 'Kumo', 'Hikari', 'Tora', 'Ryu', 'Kitsune', 'Yuki', 'Hoshi', 'Mirai', 'Akira', 'Shiden', 'Tsubasa', 'Kaminari', 'Sakura', 'Tenshi', 'Kiba', 'Hinode', 'Nami', 'Arashi', 'Kurogane', 'Shinobi', 'Kagero', 'Senko', 'Tsuki', 'Homura', 'Kodama', 'Fuji'],
  uk: ['Sovereign', 'Monarch', 'Regent', 'Ascot', 'Windsor', 'Kestrel', 'Merlin', 'Harrier', 'Wessex', 'Avalon', 'Camden', 'Thames', 'Highland', 'Lancer', 'Oxford', 'Chester', 'Sterling', 'Duke', 'Baron', 'Albion', 'Mayfair', 'Kensington', 'Belgrave', 'Cornwall', 'Exeter', 'Brighton', 'Hawk', 'Osprey', 'Swift', 'Raven'],
  us: ['Outlaw', 'Bandit', 'Sidewinder', 'Tornado', 'Hurricane', 'Stampede', 'Rattler', 'Prairie', 'Frontier X', 'Canyon', 'Thunderhead', 'Freedom', 'Ironhorse', 'Wildcat', 'Bison', 'Grizzly', 'Coyote', 'Desperado', 'Highway', 'Interstate', 'Boulevard', 'Rocket', 'Comet', 'Avenger', 'Sentinel', 'Pioneer', 'Ranger X', 'Marshal', 'Gunslinger', 'Rodeo'],
  fr: ['Mistral', 'Lumiere', 'Eclair', 'Etoile', 'Rapide', 'Libellule', 'Comete', 'Azur', 'Cascade', 'Riviera', 'Provence', 'Soleil', 'Papillon', 'Faucon', 'Orage', 'Nuage', 'Bijou', 'Aube', 'Crepuscule', 'Avenue'],
  se: ['Nord', 'Fjord', 'Polar', 'Aurora', 'Glacier', 'Tundra', 'Boreal', 'Frost', 'Saga', 'Rune', 'Odin', 'Freya', 'Storm', 'Vinter', 'Midnatt', 'Isberg', 'Tor', 'Valkyr', 'Skog', 'Ljus'],
  kr: ['Hana', 'Byeol', 'Baram', 'Sonagi', 'Haneul', 'Mir', 'Dal', 'Bit', 'Gaon', 'Saebyeok', 'Nuri', 'Arin', 'Doul', 'Hwarang', 'Maru', 'Seom', 'Taeyang', 'Yeoul', 'Bom', 'Gyeoul'],
  ev: ['Volt', 'Ion', 'Quark', 'Photon', 'Nova', 'Pulse', 'Flux', 'Helix', 'Vector', 'Zenith', 'Axiom', 'Prism', 'Quantum', 'Arc', 'Spark', 'Neutron', 'Plasma', 'Orbit', 'Lumina', 'Tesseract', 'Circuit', 'Ohm', 'Kelvin', 'Joule', 'Radiant', 'Electra', 'Static', 'Fusion', 'Ether', 'Nimbus'],
  race: ['R1', 'Spec-C', 'Evo', 'Apex', 'Vanguard', 'Phantom', 'Venom', 'Stinger', 'Predator', 'Raptor', 'Talon', 'Havoc', 'Blade', 'Fury', 'Inferno', 'Nitro', 'Tempest R', 'Velocity', 'Mach', 'Hornet'],
};
const TRIMS = {
  street: ['', 'S', 'SE', 'GT', 'Sport', 'Limited', 'Touring', 'Turbo', 'RS', 'Signature', 'Premium', 'Plus', 'GTS', 'Performance', 'Classic'],
  hot: ['RS', 'R', 'Turbo', 'Evo', 'Competition', 'Track', 'GTR', 'Clubsport', 'Type-S', 'Cup'],
  race: ['GT3', 'Evo R', 'Cup', 'Spec', 'Works', 'Pro', 'Endurance', 'Sprint', 'LM', 'Factory'],
};
const ROMAN = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];

const ENGINE_INFO = {
  I3: { redline: [6200, 6800], cyl: 3, sound: 'i4' }, I4: { redline: [6500, 7800], cyl: 4, sound: 'i4' }, I6: { redline: [7000, 7800], cyl: 6, sound: 'i6' },
  V6: { redline: [6800, 8200], cyl: 6, sound: 'v6' }, V8: { redline: [6400, 8500], cyl: 8, sound: 'v8' }, V10: { redline: [8500, 9200], cyl: 10, sound: 'v10' },
  V12: { redline: [8000, 9500], cyl: 12, sound: 'v12' }, W16: { redline: [6700, 7200], cyl: 16, sound: 'v12' }, F6: { redline: [7800, 9000], cyl: 6, sound: 'f6' },
  EV: { redline: [15000, 18000], cyl: 0, sound: 'ev' }, V6T: { redline: [12500, 15000], cyl: 6, sound: 'f1' },
};

function roundPrice(p) {
  if (p < 100000) return Math.round(p / 100) * 100;
  if (p < 1000000) return Math.round(p / 1000) * 1000;
  return Math.round(p / 10000) * 10000;
}

let CATALOG = null;

// Build the summary records for all 10,000 cars (fast: ~20 ms)
export function catalog() {
  if (CATALOG) return CATALOG;
  const list = [];
  const usedNames = new Set();
  const rng = new RNG(20261108);
  let id = 0;
  // brand weights per class
  const brandWeights = {};
  for (const k of CLASS_KEYS) brandWeights[k] = BRANDS.map((b, i) => [i, b.focus[k] || 0]).filter(([, w]) => w > 0);
  for (const k of CLASS_KEYS) {
    const C = CLASSES[k];
    const modelsPerBrand = {};
    for (let n = 0; n < C.count; n++) {
      const bi = rng.weighted(brandWeights[k]);
      const brand = BRANDS[bi];
      const seed = (hashString(brand.name + k) + n * 7919) >>> 0;
      const r = new RNG(seed);
      // model line: brands reuse model names across trims and years
      const pool = MODELS[brand.flavor];
      modelsPerBrand[bi] = (modelsPerBrand[bi] || 0) + 1;
      const model = pool[(hashString(brand.name) + Math.floor(modelsPerBrand[bi] / 3) * 7 + k.length) % pool.length];
      const trimPool = C.race ? TRIMS.race : (k === 'hothatch' || k === 'supercar' || k === 'hypercar' || k === 'muscle') ? TRIMS.hot : TRIMS.street;
      let trim = trimPool[r.int(0, trimPool.length - 1)];
      const year = k === 'classic' ? r.int(1955, 1985) : r.int(2012, 2026);
      let name = `${brand.name} ${model}${trim ? ' ' + trim : ''}`;
      let g = 0;
      while (usedNames.has(name) && g < 9) { g++; name = `${brand.name} ${model}${ROMAN[g]}${trim ? ' ' + trim : ''}`; }
      if (usedNames.has(name)) name = `${name} '${String(year).slice(2)}`;
      usedNames.add(name);
      // performance
      const perf = Math.pow(r.next(), 1.15); // 0..1 within class
      const hp = Math.round(lerp(C.hp[0], C.hp[1], clamp(perf + r.float(-0.08, 0.08), 0, 1)));
      const kg = Math.round(lerp(C.kg[1], C.kg[0], clamp(perf * 0.6 + r.float(0, 0.4), 0, 1)));
      const top = Math.round(lerp(C.top[0], C.top[1], clamp(perf * 0.85 + r.float(0, 0.15), 0, 1)));
      const drive = r.weighted(C.drive);
      const body = C.bodies[r.int(0, C.bodies.length - 1)];
      const engine = C.engines[Math.min(C.engines.length - 1, Math.floor(clamp(perf + r.float(-0.25, 0.25), 0, 0.999) * C.engines.length))];
      const E = ENGINE_INFO[engine];
      const redline = Math.round(r.float(E.redline[0], E.redline[1]) / 100) * 100;
      const gears = C.ev ? 1 : k === 'formula1' || k === 'formulaJr' ? 8 : k === 'classic' ? r.int(4, 5) : r.int(5, 8);
      const prestige = brand.prestige;
      const logLerp = (a, b, t) => Math.exp(lerp(Math.log(a), Math.log(b), t));
      let price = logLerp(C.price[0], C.price[1], Math.pow(clamp(perf * 0.8 + prestige * 0.2 + r.float(-0.06, 0.06), 0, 1), 1.25));
      if (k === 'classic') price = logLerp(C.price[0], C.price[1], Math.pow(clamp(r.next() * 0.6 + perf * 0.4, 0, 1), 2.2));
      price = roundPrice(price * r.float(0.92, 1.08));
      const grip = C.grip * r.float(0.97, 1.04);
      const aero = C.aero * r.float(0.85, 1.15);
      const frontW = body === 'wedge' || body === 'proto' || body === 'formula' ? r.float(0.4, 0.45) : drive === 'FWD' ? r.float(0.58, 0.63) : r.float(0.48, 0.55);
      list.push({
        id, name, brand: brand.name, flavor: brand.flavor, model, trim, year, cls: k, className: C.name, body, drive,
        ev: !!C.ev, race: !!C.race, engine, cyl: E.cyl, sound: E.sound, hp, kg, top, redline, gears, price, grip, aero, frontW,
        seed: seed ^ 0x9e3779b9, prestige,
      });
      id++;
    }
  }
  CATALOG = list;
  return list;
}

export function carById(id) { return catalog()[id]; }

// Visual options derived from the catalogue record (+ owner customisation)
export function visualOptionsFor(car, custom = {}) {
  const race = car.race;
  const parts = custom.parts || {};
  const aeroLvl = parts.aero || 0;
  const r = new RNG(car.seed);
  let wing = race ? (car.cls === 'touring' ? 2 : car.cls === 'rally' ? 2 : car.cls === 'proto' || car.cls === 'formula1' || car.cls === 'formulaJr' ? 0 : 4)
    : car.cls === 'supercar' || car.cls === 'hypercar' ? r.pick([0, 1, 2, 3]) : car.cls === 'sports' ? r.pick([0, 0, 1, 2]) : car.cls === 'hothatch' ? r.pick([0, 1, 1]) : car.cls === 'muscle' ? r.pick([0, 1, 2]) : 0;
  if (aeroLvl > 0) wing = Math.max(wing, aeroLvl + 1);
  return {
    race,
    livery: custom.livery ?? (race ? (car.cls === 'rally' ? 'race_stripes' : 'race') : car.cls === 'muscle' && r.chance(0.4) ? 'stripes' : car.cls === 'classic' && r.chance(0.3) ? 'stripes' : 'none'),
    wing,
    splitter: race || aeroLvl > 0 ? 1 : 0,
    paint: custom.paint,
    accent: custom.accent,
    rim: custom.rim,
    finish: custom.finish,
    number: custom.number,
    electric: car.ev,
    roofScoop: car.cls === 'rally',
  };
}

export function formatPrice(p) {
  if (p >= 1e6) return '$' + (p / 1e6).toFixed(p >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M';
  return '$' + Math.round(p).toLocaleString('en-US');
}
