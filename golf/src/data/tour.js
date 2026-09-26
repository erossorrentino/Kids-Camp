// Season calendar, purses and ranking-points tables.
import { RNG, mixSeed } from '../util/rng.js';
import { generateCourses } from './courses.js';

export const SEASON_WEEKS = 24;

export const TOURS = {
  CH:  { name: 'Challenger Tour', short: 'Challenger', field: 96,  purse: [900000, 1400000], pts: 14, season: 0 },
  WT:  { name: 'World Tour', short: 'World Tour', field: 120, purse: [8000000, 12000000], pts: 50, season: 500 },
  MAJ: { name: 'Major Championship', short: 'Major', field: 120, purse: [18000000, 21000000], pts: 100, season: 750 },
  FIN: { name: 'Tour Championship', short: 'Finale', field: 30, purse: [40000000, 40000000], pts: 60, season: 0 },
};

export const MAJORS = [
  { week: 6, name: 'The Augustine Invitational', style: ['Parkland'], fixed: true, blurb: 'Azaleas, slick greens and a green jacket.' },
  { week: 11, name: 'The United Open Championship', style: ['Parkland', 'Forest', 'Coastal'], blurb: 'Brutal rough, fast greens: par is a good score.' },
  { week: 16, name: 'The Grand Championship', style: ['Parkland', 'Heathland', 'Mountain', 'Desert'], blurb: 'The deepest field in golf.' },
  { week: 20, name: 'The Old Links Open', style: ['Links'], blurb: 'The oldest championship, played by the sea.' },
];

const SPONSORS = ['Meridian', 'Harbor Bank', 'Apex Motors', 'Summit Air', 'Northwind', 'Crestline', 'Bluewater', 'Pioneer', 'Evergreen', 'Ironwood', 'Silverline', 'Goldcrest', 'Redstone', 'Lakeshore', 'Starling', 'Vantage', 'Beacon', 'Orion', 'Cobalt', 'Juniper'];
const EVENT_TYPES = ['Classic', 'Open', 'Invitational', 'Championship', 'Masters', 'Pro-Am'];

// Share of the purse by finishing position (tour-style table, 1st = 18%)
const TOP_SHARES = [0.18, 0.109, 0.069, 0.049, 0.041, 0.03625, 0.03375, 0.03125, 0.02925, 0.02725, 0.02525, 0.02325, 0.02125, 0.01925, 0.01825, 0.01725, 0.01625, 0.01525, 0.01425, 0.01325];
export function purseShare(pos) {
  if (pos <= 20) return TOP_SHARES[pos - 1];
  if (pos > 70) return 0.0019;
  return Math.max(0.002, 0.01325 * Math.pow(0.955, pos - 20));
}

// Ranking points share by position (1st = 100%)
export function pointsShare(pos) {
  if (pos > 70) return 0;
  return Math.pow(pos, -0.78);
}

// Tie-aware allocation: players tied for a position split the combined values
export function splitTies(sortedEntries, scoreKey, valueFn) {
  const out = new Map();
  let i = 0;
  while (i < sortedEntries.length) {
    let j = i;
    while (j + 1 < sortedEntries.length && sortedEntries[j + 1][scoreKey] === sortedEntries[i][scoreKey]) j++;
    let sum = 0;
    for (let k = i; k <= j; k++) sum += valueFn(k + 1);
    const each = sum / (j - i + 1);
    for (let k = i; k <= j; k++) out.set(sortedEntries[k], { pos: i + 1, tied: j > i, value: each });
    i = j + 1;
  }
  return out;
}

export function generateSeason(year) {
  const rng = new RNG(mixSeed('season', year));
  const courses = generateCourses();
  const pool = rng.shuffle(courses.map((c) => c.id));
  let cursor = 0;
  const take = (styles) => {
    for (let k = 0; k < pool.length; k++) {
      const id = pool[(cursor + k) % pool.length];
      const c = courses.find((cc) => cc.id === id);
      if (!styles || styles.includes(c.style)) {
        pool.splice((cursor + k) % pool.length, 1);
        return c;
      }
    }
    return courses[rng.int(0, courses.length - 1)];
  };
  // The Augustine is always at the same club
  const augustine = courses.find((c) => c.style === 'Parkland' && c.stars >= 4) || courses[0];
  const ix = pool.indexOf(augustine.id);
  if (ix >= 0) pool.splice(ix, 1);

  const weeks = [];
  const usedSponsor = new Set();
  for (let w = 1; w <= SEASON_WEEKS; w++) {
    const events = [];
    const major = MAJORS.find((m) => m.week === w);
    if (w === SEASON_WEEKS) {
      const c = take(['Parkland', 'Forest', 'Coastal']);
      events.push({ tour: 'FIN', name: 'The Tour Championship', courseId: c.id });
    } else if (major) {
      const c = major.fixed ? augustine : take(major.style);
      events.push({ tour: 'MAJ', name: major.name, courseId: c.id, blurb: major.blurb });
    } else {
      const c = take(null);
      let sponsor;
      do { sponsor = rng.pick(SPONSORS); } while (usedSponsor.has(sponsor) && usedSponsor.size < SPONSORS.length);
      usedSponsor.add(sponsor);
      if (usedSponsor.size >= SPONSORS.length) usedSponsor.clear();
      events.push({ tour: 'WT', name: `${sponsor} ${c.region} ${rng.pick(EVENT_TYPES)}`, courseId: c.id });
    }
    {
      const c = take(null);
      events.push({ tour: 'CH', name: w === SEASON_WEEKS ? 'Challenger Tour Finals' : `${c.region} Challenger`, courseId: c.id });
    }
    for (const e of events) {
      const t = TOURS[e.tour];
      e.id = `y${year}w${w}${e.tour}`;
      e.week = w;
      e.purse = Math.round(rng.float(t.purse[0], t.purse[1]) / 100000) * 100000;
      e.pts = t.pts;
      e.field = t.field;
      e.seed = mixSeed(e.id, year);
    }
    weeks.push({ week: w, events });
  }
  return { year, weeks };
}
