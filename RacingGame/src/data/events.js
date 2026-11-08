// Career: series of races with entry rules and prize money. Win races to
// earn credits, buy faster cars and parts, unlock bigger championships.
import { catalog, CLASSES } from './cars.js';
import { effectiveStats } from './parts.js';
import { RNG } from '../core/rng.js';

// prize split for 1st..8th as a fraction of the winner's purse
export const PRIZE_SPLIT = [1, 0.6, 0.4, 0.25, 0.15, 0.1, 0.07, 0.05];

const S = (id, name, tier, desc, req, races, purse, bonus, color) => ({ id, name, tier, desc, req, races, purse, bonus, color });

export const SERIES = [
  S('rookie', 'Rookie Cup', 1, 'Your first taste of racing. Any small car will do!', { maxPR: 210 },
    [['kingsbridge', 2], ['sakura', 2], ['glacier', 2]], 6000, 10000, '#3ddc84'),
  S('sunday', 'Sunday Club Series', 1, 'Weekend racers in everyday cars.', { maxPR: 270 },
    [['azure', 2], ['redcanyon', 2], ['kingsbridge', 3], ['thunder', 4]], 9000, 15000, '#3ddc84'),
  S('suv', 'SUV & Truck Showdown', 1, 'Big, tall and bouncy. Only SUVs and pickups allowed!', { cls: ['suv', 'pickup'] },
    [['redcanyon', 2], ['alpine', 2], ['thunder', 4]], 12000, 20000, '#ffb300'),
  S('hothatch', 'Hot Hatch Heroes', 2, 'Small, light and furious hatchbacks.', { cls: ['hothatch', 'compact'], maxPR: 360 },
    [['sakura', 3], ['azure', 3], ['glacier', 3], ['kingsbridge', 3]], 18000, 30000, '#ff5a1f'),
  S('muscle', 'American Muscle', 2, 'V8 thunder. Long straights, loud engines.', { cls: ['muscle'] },
    [['thunder', 5], ['neonbay', 2], ['redcanyon', 3]], 22000, 35000, '#ff5a1f'),
  S('classic', 'Classic Legends', 2, 'Old-school beauties from the golden age.', { cls: ['classic'] },
    [['kingsbridge', 2], ['azure', 2], ['sakura', 2]], 20000, 40000, '#c9a66b'),
  S('coupe', 'Coupe Clash', 2, 'Two doors, rear-drive fun.', { maxPR: 360 },
    [['alpine', 2], ['sakura', 3], ['neonbay', 2], ['glacier', 3]], 24000, 40000, '#ff5a1f'),
  S('electric', 'Electric Charge', 3, 'Silent but deadly fast battery cars.', { cls: ['electric'], maxPR: 470 },
    [['neonbay', 2], ['azure', 3], ['glacier', 3]], 45000, 80000, '#00e5ff'),
  S('sports', 'Sports Car Trophy', 3, 'Proper driver\'s cars on proper tracks.', { maxPR: 430 },
    [['kingsbridge', 3], ['alpine', 2], ['redcanyon', 3], ['sakura', 3]], 55000, 100000, '#00e5ff'),
  S('rally', 'Rally Stars Tarmac', 3, 'Rally machines let loose on the circuit.', { cls: ['rally'] },
    [['glacier', 3], ['alpine', 2], ['sakura', 3]], 60000, 90000, '#00e5ff'),
  S('touring', 'Touring Car Masters', 3, 'Door-to-door saloon car racing.', { cls: ['touring'] },
    [['azure', 3], ['kingsbridge', 3], ['neonbay', 2], ['thunder', 5]], 75000, 120000, '#00e5ff'),
  S('gt', 'Grand Tourer Gala', 3, 'Luxury GTs with big engines.', { cls: ['gt'] },
    [['alpine', 2], ['redcanyon', 3], ['azure', 3]], 80000, 140000, '#00e5ff'),
  S('supercar', 'Supercar Series', 4, 'Wild mid-engined supercars.', { cls: ['supercar'] },
    [['neonbay', 2], ['kingsbridge', 3], ['redcanyon', 3], ['glacier', 3]], 160000, 300000, '#b388ff'),
  S('gt3', 'GT Championship', 4, 'Full race cars with wings and slicks.', { maxPR: 560, minPR: 380 },
    [['sakura', 3], ['alpine', 2], ['thunder', 6], ['kingsbridge', 3], ['azure', 3]], 220000, 400000, '#b388ff'),
  S('formulajr', 'Formula Junior', 4, 'Single-seaters: the ladder to the top.', { cls: ['formulaJr'] },
    [['kingsbridge', 3], ['sakura', 3], ['glacier', 3], ['redcanyon', 3]], 260000, 450000, '#b388ff'),
  S('hyper', 'Hypercar Kings', 5, 'The fastest road cars on Earth.', { cls: ['hypercar', 'electric'], minPR: 470 },
    [['thunder', 6], ['neonbay', 3], ['alpine', 2], ['redcanyon', 3]], 600000, 1000000, '#ff4f9a'),
  S('proto', 'Endurance Prototypes', 5, 'Le Mans-style prototypes at full attack.', { cls: ['proto'] },
    [['kingsbridge', 4], ['redcanyon', 4], ['alpine', 3], ['glacier', 4]], 900000, 1500000, '#ff4f9a'),
  S('f1', 'Formula Elite World Championship', 6, 'The pinnacle. The fastest cars in the world.', { cls: ['formula1'] },
    [['kingsbridge', 5], ['azure', 5], ['neonbay', 4], ['sakura', 5], ['alpine', 3], ['redcanyon', 5], ['glacier', 5], ['thunder', 8]], 2500000, 6000000, '#ffd400'),
  S('unlimited', 'Unlimited Open', 6, 'Anything goes. Bring your fastest machine!', {},
    [['thunder', 6], ['kingsbridge', 4], ['neonbay', 3]], 1200000, 2500000, '#ffd400'),
];

export function seriesEvents(series) {
  return series.races.map(([track, laps], i) => ({ id: `${series.id}_${i}`, series: series.id, index: i, track, laps, purse: Math.round(series.purse * (1 + i * 0.12) / 100) * 100 }));
}

export function eligible(car, stats, req) {
  if (!req) return true;
  if (req.cls && !req.cls.includes(car.cls)) return false;
  if (req.maxPR && stats.pr > req.maxPR) return false;
  if (req.minPR && stats.pr < req.minPR) return false;
  return true;
}

export function reqText(req) {
  const parts = [];
  if (req.cls) parts.push(req.cls.map((k) => CLASSES[k].name).join(' / '));
  if (req.minPR) parts.push(`PR ≥ ${req.minPR}`);
  if (req.maxPR) parts.push(`PR ≤ ${req.maxPR}`);
  return parts.length ? parts.join(' · ') : 'Any car';
}

// Unlocking: tier N opens when you have finished (top 3) a race in tier N-1
export function seriesUnlocked(series, profile) {
  if (series.tier <= 1) return true;
  return SERIES.some((s) => s.tier === series.tier - 1 && seriesEvents(s).some((e) => (profile.career[e.id] || 99) <= 3));
}

const AI_NAMES = ['M. Rossi', 'L. Hamada', 'K. Becker', 'S. Laurent', 'J. Carter', 'A. Novak', 'R. Silva', 'T. Okafor', 'E. Lindqvist', 'D. Moreau',
  'P. Kowalski', 'H. Tanaka', 'C. Romano', 'B. Fischer', 'N. Patel', 'O. Hughes', 'V. Petrov', 'G. Alvarez', 'I. Kim', 'F. Dubois',
  'Z. Mensah', 'Y. Sato', 'W. Brooks', 'Q. Larsen'];

// Pick an opponent field matched to the player's car and the series rules
export function buildField(req, playerStats, count, seed, difficulty = 'normal') {
  const rng = new RNG(seed);
  const all = catalog();
  let pool = all.filter((c) => !req.cls || req.cls.includes(c.cls));
  const statCache = new Map();
  const st = (c) => { let s = statCache.get(c.id); if (!s) { s = effectiveStats(c); statCache.set(c.id, s); } return s; };
  const target = req.maxPR ? Math.min(req.maxPR, playerStats.pr + 25) : playerStats.pr;
  const diffK = { easy: 0.9, normal: 0.97, hard: 1.03 }[difficulty] || 0.97;
  const want = target * diffK;
  // sample candidates and keep those near the target PR
  const cands = [];
  for (let t = 0; t < 900 && cands.length < 200; t++) {
    const c = pool[rng.int(0, pool.length - 1)];
    const s = st(c);
    if (req.maxPR && s.pr > req.maxPR) continue;
    if (req.minPR && s.pr < req.minPR) continue;
    cands.push([c, s, Math.abs(s.pr - want)]);
  }
  cands.sort((a, b) => a[2] - b[2]);
  const picked = [];
  const used = new Set();
  for (const [c, s] of cands) {
    if (used.has(c.id)) continue;
    used.add(c.id);
    picked.push({ car: c, stats: s });
    if (picked.length >= count) break;
  }
  while (picked.length < count && cands.length) picked.push({ car: cands[picked.length % cands.length][0], stats: cands[picked.length % cands.length][1] });
  const names = AI_NAMES.slice();
  for (let i = names.length - 1; i > 0; i--) { const j = rng.int(0, i); [names[i], names[j]] = [names[j], names[i]]; }
  const skillBase = { easy: 0.84, normal: 0.905, hard: 0.96 }[difficulty] || 0.905;
  return picked.map((p, i) => ({
    ...p,
    name: names[i % names.length],
    skill: Math.min(1.0, skillBase + rng.float(-0.025, 0.035) + (i / count) * 0.01),
    number: rng.int(2, 99),
  }));
}
