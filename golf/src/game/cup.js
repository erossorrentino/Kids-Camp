// The Legends Cup: a team match at the end of every season. You captain
// Team Legends (you plus the pros you own, topped up with the best players
// from your country); your rival captains Team World. Five singles matches
// over nine holes: you play yours hole by hole against your rival, the other
// four are played out from the players' skills.
import { generatePros, proById } from '../data/players.js';
import { courseById, generateCourses } from '../data/courses.js';
import { courseProfile, simHole, effectiveStats, fxWithGear } from '../sim/aisim.js';
import { RNG, mixSeed } from '../util/rng.js';

export const CUP_WEEK = 18; // the cup is open from this week to the end of the season
export const CUP_HOLES = 9;
export const CUP_PRIZE = { win: 150000, lose: 40000 };

export function cupAvailable(c) {
  return c.week >= CUP_WEEK && !(c.cup && c.cup.year === c.year && c.cup.done);
}

export function cupCourse(c) {
  const cs = generateCourses();
  const rng = new RNG(mixSeed('cupcourse', c.year));
  return cs[rng.int(0, cs.length - 1)];
}

// Pick the two teams (4 teammates each besides the captains)
export function cupTeams(c, rankRows, humanId) {
  const pros = generatePros();
  const me = c.golfer;
  const rivalId = c.rival ? c.rival.id : null;
  const taken = new Set([humanId, rivalId, me.char].filter(Boolean));
  const owned = (me.chars || []).filter((id) => proById(id) && !taken.has(id)).map((id) => proById(id)).sort((a, b) => b.ovr - a.ovr);
  const mates = owned.slice(0, 4);
  mates.forEach((p) => taken.add(p.id));
  const byRank = rankRows.filter((r) => r.id !== humanId).map((r) => proById(r.id)).filter(Boolean);
  // top up with the best players from your country, then the best available
  for (const p of byRank) {
    if (mates.length >= 4) break;
    if (!taken.has(p.id) && p.country === me.country) { mates.push(p); taken.add(p.id); }
  }
  for (const p of byRank) {
    if (mates.length >= 4) break;
    if (!taken.has(p.id)) { mates.push(p); taken.add(p.id); }
  }
  const world = [];
  for (const p of byRank) {
    if (world.length >= 4) break;
    if (!taken.has(p.id)) { world.push(p); taken.add(p.id); }
  }
  const rival = rivalId ? proById(rivalId) : pros[0];
  return { mates, world, rival };
}

// Nine holes of match play between two simulated pros
export function simMatch(a, b, course, holes, cond, seed) {
  const prof = courseProfile(course);
  const rng = new RNG(seed);
  const r = () => rng.next();
  const fa = fxWithGear(a.traits, a.bag), fb = fxWithGear(b.traits, b.bag);
  const sa = effectiveStats(a.stats, rng.gauss(0, 2)), sb = effectiveStats(b.stats, rng.gauss(0, 2));
  let up = 0;
  const log = [];
  for (let k = 0; k < holes.length; k++) {
    const i = holes[k];
    const x = simHole(sa, fa, prof.holes[i], cond, r);
    const y = simHole(sb, fb, prof.holes[i], cond, r);
    if (x < y) up++; else if (y < x) up--;
    log.push([x, y]);
    const left = holes.length - k - 1;
    if (Math.abs(up) > left) return { up, left, log };
  }
  return { up, left: 0, log };
}

export function matchText(up, left, aName, bName) {
  if (up === 0) return 'Halved';
  const w = up > 0 ? aName : bName;
  return `${w} wins ${Math.abs(up)}${left ? `&${left}` : ' up'}`;
}

// A pro's hole-by-hole scores for your match (the rival plays these)
export function opponentScores(pro, course, holes, cond, seed) {
  const prof = courseProfile(course);
  const rng = new RNG(seed);
  const r = () => rng.next();
  const fx = fxWithGear(pro.traits, pro.bag);
  const s = effectiveStats(pro.stats, rng.gauss(0, 2));
  const out = {};
  for (const i of holes) out[i] = simHole(s, fx, prof.holes[i], cond, r);
  return out;
}

export { courseById };
