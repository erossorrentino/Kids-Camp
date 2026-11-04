// Shot-level statistical simulation of a pro playing a hole. Used for
// every AI player in every event (and for "Sim hole" when you want to skip
// one). Tuned against tour stats: GIR ~65%, scrambling ~58%, make rates by
// putt length, ~71 scoring average for a mid-field World Tour pro.
import { clamp } from '../util/rng.js';
import { HoleModel } from './hole.js';
import { traitEffects } from '../data/traits.js';
import { STAT_KEYS } from '../data/players.js';
import { bagSimFx } from '../data/clubsets.js';

// Tour make percentage by putt length (feet)
const MAKE = [[1, 1], [2, 0.99], [3, 0.96], [4, 0.88], [5, 0.77], [6, 0.66], [7, 0.58], [8, 0.5], [10, 0.4], [12, 0.32], [15, 0.23], [20, 0.15], [25, 0.1], [30, 0.07], [40, 0.045], [50, 0.03], [60, 0.02], [90, 0.012]];
function makeRate(ft) {
  if (ft <= MAKE[0][0]) return 1;
  for (let i = 1; i < MAKE.length; i++) {
    if (ft <= MAKE[i][0]) {
      const [a, pa] = MAKE[i - 1], [b, pb] = MAKE[i];
      return pa + ((pb - pa) * (ft - a)) / (b - a);
    }
  }
  return 0.01;
}

// Lightweight per-course hole profiles for the sim (built once per course)
const PROFILE_CACHE = new Map();
export function courseProfile(course) {
  if (PROFILE_CACHE.has(course.id)) return PROFILE_CACHE.get(course.id);
  const holes = course.holes.map((h, i) => {
    const m = new HoleModel(course, i);
    const g = m.green;
    const nearGreen = (b) => Math.hypot(b.x - g.x, b.z - g.z) < 35;
    return {
      par: h.par,
      yards: h.yards,
      fw: m.fwHalf,
      greenArea: Math.PI * g.rx * g.rz,
      water: m.waters.length > 0 || !!m.ocean,
      waterGreen: m.waters.some((w) => w.type === 'pond' && nearGreen(w)),
      bunkersGreen: m.bunkers.filter((b) => b.kind !== 'fairway' && nearGreen(b)).length,
      bunkersFw: m.bunkers.filter((b) => !nearGreen(b)).length,
      ob: m.ob.left || m.ob.right,
      elev: (m.greenBaseY - m.teeY) / 0.9144,
      trees: m.style.trees.density,
    };
  });
  const prof = { holes, style: course.style, country: course.country, stimp: course.stimp, firm: course.firm };
  PROFILE_CACHE.set(course.id, prof);
  return prof;
}

function gauss(rng) {
  let u = 0, v = 0;
  while (!u) u = rng();
  while (!v) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function gamma2(rng, mean) {
  // Gamma(k=2) with the given mean: sum of two exponentials
  return (mean / 2) * (-Math.log(rng() || 1e-9) - Math.log(rng() || 1e-9));
}

/**
 * Simulate one hole.
 * s: effective stats (already adjusted for form/situation), fx: trait effects
 * h: hole profile, cond: { windMph, stimp, firm }, rng: () => 0..1
 */
export function simHole(s, fx, h, cond, rng) {
  let strokes = 0;
  const wind = cond.windMph || 0;
  const windSkill = (1.2 - s.wind * 0.005) * fx.wind;
  const windPen = wind * 0.0035 * windSkill;
  const blow = fx.blowup;
  let yards = h.yards - h.elev * 0.6; // uphill plays longer
  let lie = 'fairway';
  let remaining;

  if (h.par === 3) {
    remaining = yards;
    lie = 'tee';
  } else {
    strokes++;
    const drive = 247 + 0.8 * s.power + fx.driveYds + gauss(rng) * 11 - windPen * 60 + (cond.firm - 0.5) * 30;
    const fwP = clamp(0.4 + s.accuracy * 0.0028 + (h.fw - 15) * 0.012 + fx.fairwayPct - windPen * 0.6 - h.bunkersFw * 0.01, 0.25, 0.92);
    const hazardP = ((h.water ? 0.03 : 0.006) + (h.ob ? 0.02 : 0)) * (1.7 - s.accuracy / 100) * blow;
    const r = rng();
    let d = drive;
    if (r < hazardP) {
      strokes++; // penalty
      lie = 'rough';
      d = drive - 40;
    } else if (r < hazardP + fwP) {
      lie = 'fairway';
    } else if (rng() < 0.12 + h.bunkersFw * 0.03) {
      lie = 'bunker';
    } else {
      lie = rng() < 0.08 * h.trees ? 'trees' : 'rough';
    }
    if (h.par === 4 && yards - d < 25) d = yards - 25 - rng() * 20; // lay back on short par 4s
    remaining = Math.max(15, yards - d);
    if (lie === 'trees') {
      // punch out
      strokes++;
      remaining = Math.max(30, remaining - 90 - rng() * 40);
      lie = rng() < 0.6 ? 'fairway' : 'rough';
    }
    if (h.par === 5 || remaining > 250) {
      const reach = 225 + s.power * 0.55 + (fx.par5 ? 25 : 0);
      const goForIt = remaining <= reach && lie !== 'bunker' && (lie === 'fairway' || rng() < 0.4);
      if (!goForIt) {
        strokes++;
        const lay = 70 + rng() * 40;
        const layFw = clamp(0.75 + s.accuracy * 0.002 - windPen * 0.4, 0.5, 0.95);
        remaining = Math.max(lay, remaining - 245 - s.power * 0.4);
        if (remaining > 250) remaining = lay; // long par 5: third shot still a wedge after a good 2nd
        lie = rng() < layFw ? 'fairway' : 'rough';
        if (h.water && rng() < 0.02 * blow) strokes++;
      }
    }
  }

  // --- approach ---
  strokes++;
  const lieF = { tee: 1, fairway: 1, rough: 0.72, bunker: 0.6 }[lie] ?? 0.8;
  const lieFR = lie === 'rough' || lie === 'bunker' ? 1 - (1 - lieF) * (1.3 - s.recovery / 100) * (lie === 'bunker' ? fx.bunker : fx.rough) : lieF;
  const greenSize = clamp(h.greenArea / 520, 0.75, 1.3);
  let gir = (0.955 - 0.0024 * remaining) * lieFR * (0.85 + 0.15 * greenSize) + (s.irons - 78) * 0.0036 - windPen * 0.9 - (cond.firm - 0.5) * 0.12;
  gir = clamp(gir, 0.08, 0.96);
  let putt = null;
  if (rng() < gir) {
    const mean = (remaining * 0.14 + 10) * (lie === 'rough' ? 1.25 : lie === 'bunker' ? 1.35 : 1) * (1.32 - s.irons * 0.004) * fx.ironProx;
    putt = Math.max(1, gamma2(rng, mean));
    // Hole-out from the fairway
    if (rng() < 0.0045 * (100 / (remaining + 40))) return strokes;
  } else {
    // Missed green
    if (h.waterGreen && rng() < 0.16 * blow * (1.3 - s.irons / 100)) strokes++; // in the water, drop
    const bunker = rng() < 0.18 + h.bunkersGreen * 0.07;
    strokes++;
    // chip-in
    if (rng() < 0.018 + (s.shortGame - 75) * 0.0006) return strokes;
    let mean = 8.2 * (1.4 - s.shortGame * 0.0055) * (bunker ? 1.45 * fx.bunker : 1) * (fx.chipErr < 1 ? 0.8 : 1);
    if (rng() < 0.035 * blow) mean *= 3.5; // chunked / bladed it
    putt = Math.max(1, gamma2(rng, mean) + (fx.scramble ? -1.2 : 0));
  }
  // --- putting ---
  const speedPen = cond.stimp >= 12.5 && fx.fastGreens ? 0.8 : 1;
  const oddsMul = Math.exp((s.putting - 82) * 0.022) * fx.puttOdds * speedPen;
  for (let k = 0; k < 6; k++) {
    strokes++;
    let p = makeRate(putt);
    if (putt < 6 && fx.shortPuttMiss) p -= fx.shortPuttMiss;
    const odds = (p / Math.max(1e-6, 1 - p)) * oddsMul;
    p = p >= 0.999 ? p : odds / (1 + odds);
    if (rng() < p) return strokes;
    // leave
    const lag = (0.055 * putt + 1.1) * (1.35 - s.putting * 0.0045) * fx.lag * (cond.stimp / 12);
    putt = Math.max(0.6, gamma2(rng, lag));
  }
  return strokes;
}

// Effective stats for a round: base + form + situational tweaks
export function effectiveStats(base, shift) {
  const s = {};
  for (const k of STAT_KEYS) s[k] = clamp(base[k] + shift, 20, 99);
  return s;
}

/**
 * Simulate an 18-hole round. Returns an array of 18 hole scores.
 * ctx: { roundIndex, rounds, contention: fn(holeIdx) -> 0..1 pressure, home: bool, form }
 */
// Traits plus the small scoring edge (or cost) of a pro's equipment
export function fxWithGear(traits, bag) {
  const fx = { ...traitEffects(traits) };
  if (!bag) return fx;
  const g = bagSimFx(bag);
  fx.driveYds += g.driveYds;
  fx.fairwayPct += g.fairwayPct;
  fx.ironProx *= g.ironProx;
  fx.scramble += g.scramble;
  fx.puttOdds *= g.puttOdds;
  return fx;
}

export function simRound(pro, prof, cond, rng, ctx = {}) {
  const fx = pro.fx || fxWithGear(pro.traits, pro.bag);
  const scores = [];
  let prev = 0; // previous hole relative to par
  const styleB = fx.styleBonus[prof.style] ? 2.5 : 0;
  const home = fx.home && prof.country === pro.country ? 2.5 : 0;
  const form = ctx.form || 0;
  for (let i = 0; i < 18; i++) {
    const h = prof.holes[i];
    let shift = form + styleB + home;
    if (fx.slowStart && i < 3) shift -= 4;
    if (i >= 13) shift -= 3 * Math.max(0, fx.lateFade);
    if (prev < 0 && fx.streak) shift += 3;
    if (prev > 0 && fx.bounceBack) shift += 4;
    if (prev > 0 && fx.hotHead) shift -= 5;
    const pressure = ctx.pressure ? ctx.pressure(i) : 0;
    if (pressure > 0) shift += pressure * ((pro.stats.mental - 78) * 0.1 + fx.pressure * 3);
    const s = effectiveStats(pro.stats, shift);
    const sc = simHole(s, fx, h, cond, rng);
    scores.push(sc);
    prev = sc - h.par;
  }
  return scores;
}

// Per-tournament form: consistency controls how often a pro has an off week
export function drawForm(pro, rng) {
  const sd = 1.5 + (100 - pro.stats.consistency) * 0.06;
  return gauss(rng) * sd;
}
export function drawDayForm(pro, rng) {
  const sd = 1.5 + (100 - pro.stats.consistency) * 0.05;
  return gauss(rng) * sd;
}
