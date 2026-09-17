import { mulberry32, pick, randRange } from '../utils/rng.js';

const BANK_NAMES = [
  'First National Bank', 'Coastal Trust Bank', 'Meridian Savings & Loan', 'Union Federal Bank',
  'Harborview Bank', 'Sterling Trust', 'Ironclad Credit Union', 'Pacific Rim Bank',
  'Liberty National Bank', 'Cornerstone Bank', 'Silvercrest Federal', 'Redline Trust & Savings',
];
const CRIMINAL_TARGETS = [
  "the Vega Cartel's stash house", "a kingpin's counting house", "a biker gang's clubhouse safe",
  "a loan shark's back office", "a chop-shop's cash room", "a smuggler's dockside warehouse",
  "a casino's skim room", "a drug lord's mansion vault", "a money launderer's front business",
  "an arms dealer's lockup", "a cartel accountant's safehouse", "a fence's hidden strongroom",
];
const DELIVERY_CLIENTS = [
  'a fence', 'a bent cop', 'a cartel courier run', 'an underground broker', 'a smuggler contact',
  'a black-market buyer', 'a rival crew looking to trade',
];
const HIT_TARGETS = [
  'a rival enforcer', 'a snitch', 'a cartel lieutenant', 'a corrupt accountant',
  'a gang lookout crew', 'a debt collector', 'a hit squad tailing you',
];
const DEMO_TARGETS = ["a rival gang's fleet", "a cartel convoy", "a chop-shop's inventory", 'a smuggling convoy'];
const DISTRICTS = [
  'Downtown', 'the Docks', 'Old Town', 'the Financial District', 'Chinatown',
  'the Industrial Park', 'Suburbia', 'the Hills', 'the Waterfront', 'Skid Row',
];

const KIND_WEIGHTS = [
  ['delivery', 0.16], ['demolitionVehicles', 0.12], ['demolitionProps', 0.10],
  ['hitman', 0.16], ['survival', 0.10], ['heist', 0.36],
];

function weightedPick(rng, weights) {
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let r = rng() * total;
  for (const [value, w] of weights) {
    r -= w;
    if (r <= 0) return value;
  }
  return weights[weights.length - 1][0];
}

// A large, deterministic (fixed seed, so a reload sees the same pool) job
// board: every entry is a real target (rob a named bank, hit a cartel
// stash house, take out a gang lieutenant, ...) rather than a cosmetic
// reskin, with reward/time/distance scaled by `tier` (its position in the
// pool) so later entries in the list are bigger, riskier scores.
export function generateMissions(count = 500, seed = 90210) {
  const rng = mulberry32(seed);
  const list = [];

  for (let i = 0; i < count; i++) {
    const tier = i / count;
    const kind = weightedPick(rng, KIND_WEIGHTS);
    const type = `JOB_${String(i + 1).padStart(3, '0')}`;
    const district = pick(rng, DISTRICTS);
    let title, detail, cfg;

    if (kind === 'heist') {
      const isBank = rng() < 0.55;
      const name = isBank ? pick(rng, BANK_NAMES) : pick(rng, CRIMINAL_TARGETS);
      const requireVehicleEscape = rng() < 0.4;
      const minDist = Math.round(randRange(rng, 60, 140 + tier * 140));
      const maxDist = minDist + Math.round(randRange(rng, 40, 120));
      const escapeMinDist = Math.round(randRange(rng, 60, 100));
      const escapeMaxDist = escapeMinDist + Math.round(randRange(rng, 40, 100));
      const alarmStars = Math.min(5, 2 + Math.floor(tier * 3 + rng()));
      const base = 500000 + tier * 5000000;
      title = isBank ? `ROB ${name.toUpperCase()}` : `HIT ${name.toUpperCase()}`;
      detail = isBank
        ? `Break into ${name} in ${district}, crack the vault, then get away${requireVehicleEscape ? ' BY VEHICLE' : ''} before the cops box you in`
        : `Hit ${name} in ${district} and get away${requireVehicleEscape ? ' BY VEHICLE' : ''} with the score before the cops box you in`;
      cfg = {
        kind: 'heist', timeLimit: Math.round(120 + tier * 80),
        minDist, maxDist, escapeMinDist, escapeMaxDist, requireVehicleEscape, alarmStars,
        rewardRange: [Math.round(base * 0.7), Math.round(base * 1.5)],
      };
    } else if (kind === 'delivery') {
      const client = pick(rng, DELIVERY_CLIENTS);
      const requireVehicle = rng() < 0.5;
      const minDist = Math.round(randRange(rng, 70, 160 + tier * 80));
      const maxDist = minDist + Math.round(randRange(rng, 40, 100));
      const base = 5000 + tier * 45000;
      title = `RUN FOR ${client.toUpperCase()}`;
      detail = `Deliver a package to ${client} in ${district}, ${minDist}-${maxDist}m away${requireVehicle ? ' — must arrive by vehicle' : ''}`;
      cfg = {
        kind: 'delivery', requireVehicle, timeLimit: Math.round(60 + tier * 40), minDist, maxDist,
        rewardRange: [Math.round(base * 0.8), Math.round(base * 1.4)],
      };
    } else if (kind === 'demolitionVehicles') {
      const target = pick(rng, DEMO_TARGETS);
      const targetCount = 3 + Math.floor(tier * 4 + rng() * 2);
      const base = 4000 + tier * 32000;
      title = `WRECK ${target.toUpperCase()}`;
      detail = `Destroy ${targetCount} vehicles from ${target} in ${district} before time runs out`;
      cfg = {
        kind: 'demolitionVehicles', timeLimit: Math.round(60 + tier * 40), targetCount,
        rewardRange: [Math.round(base * 0.8), Math.round(base * 1.4)],
      };
    } else if (kind === 'demolitionProps') {
      const targetCount = 4 + Math.floor(tier * 4 + rng() * 2);
      const base = 3000 + tier * 27000;
      title = `SABOTAGE ${district.toUpperCase()}`;
      detail = `Smash ${targetCount} crates/barriers around ${district} before time runs out`;
      cfg = {
        kind: 'demolitionProps', timeLimit: Math.round(50 + tier * 30), targetCount,
        rewardRange: [Math.round(base * 0.8), Math.round(base * 1.4)],
      };
    } else if (kind === 'hitman') {
      const target = pick(rng, HIT_TARGETS);
      const targetCount = 3 + Math.floor(tier * 4 + rng() * 2);
      const base = 4000 + tier * 34000;
      title = `TAKE OUT ${target.toUpperCase()}`;
      detail = `Eliminate ${targetCount} of ${target} in ${district} before time runs out`;
      cfg = {
        kind: 'hitman', timeLimit: Math.round(70 + tier * 40), targetCount,
        rewardRange: [Math.round(base * 0.8), Math.round(base * 1.4)],
      };
    } else { // survival
      const duration = Math.round(30 + tier * 60);
      const base = 3000 + tier * 24000;
      title = `SURVIVE ${district.toUpperCase()}`;
      detail = `Stay alive for ${duration}s while the heat comes down on ${district}`;
      cfg = { kind: 'survival', duration, rewardRange: [Math.round(base * 0.8), Math.round(base * 1.4)] };
    }

    list.push({ type, title, detail, cfg });
  }

  return list;
}
