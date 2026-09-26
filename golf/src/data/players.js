// Generates the 500-player world tour, deterministically.
import { RNG, clamp, mixSeed } from '../util/rng.js';
import { proBag } from './clubsets.js';
import { COUNTRIES, POOLS, STARS, REAL_NAME_BLOCKLIST } from './names.js';
import { TRAITS, TRAIT_IDS } from './traits.js';

export const STAT_KEYS = ['power', 'accuracy', 'irons', 'shortGame', 'putting', 'recovery', 'mental', 'wind', 'consistency'];
export const STAT_LABELS = {
  power: 'Power', accuracy: 'Accuracy', irons: 'Iron Play', shortGame: 'Short Game', putting: 'Putting',
  recovery: 'Recovery', mental: 'Mental', wind: 'Wind Play', consistency: 'Consistency',
};
export const STAT_HELP = {
  power: 'Swing speed: how far every club goes',
  accuracy: 'How forgiving tee shots are when your swing drifts off-line',
  irons: 'How tight approach shots finish',
  shortGame: 'Chips, pitches, and bunker shots around the green',
  putting: 'Putt preview length and how true the roll is',
  recovery: 'Distance kept from rough, bunkers, and bad lies',
  mental: 'Steady hands under pressure late in a round',
  wind: 'How much the wind moves your ball',
  consistency: 'How often you have an off day',
};
const WEIGHTS = { power: 0.16, accuracy: 0.12, irons: 0.2, shortGame: 0.13, putting: 0.19, recovery: 0.06, mental: 0.06, wind: 0.04, consistency: 0.04 };

export function overall(stats) {
  let s = 0;
  for (const k of STAT_KEYS) s += stats[k] * WEIGHTS[k];
  return Math.round(s);
}

const ARCHETYPES = {
  bomber:   { power: 10, accuracy: -8, irons: 0, shortGame: -2, putting: -2, recovery: 4, mental: 0, wind: -3, consistency: -2 },
  precise:  { power: -7, accuracy: 9, irons: 6, shortGame: 1, putting: -1, recovery: -2, mental: 1, wind: 3, consistency: 3 },
  wedge:    { power: -2, accuracy: 0, irons: 2, shortGame: 9, putting: 1, recovery: 5, mental: 0, wind: 0, consistency: 0 },
  putter:   { power: -4, accuracy: 1, irons: -2, shortGame: 3, putting: 10, recovery: 0, mental: 3, wind: 0, consistency: 1 },
  allround: { power: 1, accuracy: 1, irons: 1, shortGame: 0, putting: 0, recovery: 0, mental: 1, wind: 0, consistency: 1 },
  grinder:  { power: -5, accuracy: 4, irons: -1, shortGame: 5, putting: 3, recovery: 6, mental: 6, wind: 2, consistency: 8 },
  legend:   { power: -13, accuracy: 3, irons: 3, shortGame: 8, putting: 1, recovery: 4, mental: 12, wind: 8, consistency: -4 },
};
const ARCH_BALL = {
  bomber: ['distmax', 'distmax', 'urethane', 'tourbal'],
  precise: ['straight', 'urethane', 'tourbal', 'windcut'],
  wedge: ['spinpro', 'spinpro', 'urethane'],
  putter: ['puttpro', 'puttpro', 'urethane', 'tourbal'],
  allround: ['urethane', 'tourbal', 'tourbal', 'hilaunch'],
  grinder: ['tourbal', 'softfeel', 'windcut', 'links'],
  legend: ['urethane', 'links', 'softfeel', 'tourbal'],
};

const SHIRTS = ['#1d3557', '#e63946', '#f1faee', '#2a9d8f', '#e9c46a', '#264653', '#f4a261', '#8d99ae', '#ffffff', '#111111', '#6a4c93', '#ff006e', '#3a86ff', '#8ac926', '#ffca3a', '#c1121f', '#669bbc', '#003049', '#9d0208', '#588157'];
const PANTS = ['#1b1b1b', '#2b2d42', '#e9e4d8', '#8d99ae', '#3d405b', '#f1f1f1', '#6b705c', '#283618', '#495057', '#c9ada7'];
const SKIN = ['#f5d0b5', '#e8b996', '#d49a73', '#b87d56', '#8d5a3b', '#6b4029', '#f1c7a5', '#c68863'];
const HAIR = ['#1a1a1a', '#3b2a1f', '#6b4423', '#a0703a', '#d9b36c', '#8f8f8f', '#e8e8e8'];

function genName(rng, countryCode, gender, used) {
  const pool = POOLS[COUNTRIES[countryCode].pool];
  for (let tries = 0; tries < 60; tries++) {
    const first = rng.pick(gender === 'f' ? pool.f : pool.m);
    const last = rng.pick(pool.last);
    const full = `${first} ${last}`;
    const key = full.toLowerCase();
    if (used.has(key) || REAL_NAME_BLOCKLIST.has(key)) continue;
    used.add(key);
    return { first, last };
  }
  // Fallback: add a generational suffix so the name stays unique
  const first = rng.pick(gender === 'f' ? pool.f : pool.m);
  const last = `${rng.pick(pool.last)}`;
  const full = `${first} ${last} ${used.size}`;
  used.add(full.toLowerCase());
  return { first, last: `${last} Jr.` };
}

function pickTraits(rng, stats, arch, rankFrac) {
  const adv = [];
  const dis = [];
  const want = (id, list) => { if (!adv.includes(id) && !dis.includes(id)) list.push(id); };
  if (stats.power >= 88 && rng.chance(0.75)) want('bomber', adv);
  if (stats.power <= 58 && rng.chance(0.7)) want('short', dis);
  if (stats.accuracy >= 86 && rng.chance(0.6)) want('fairway', adv);
  if (stats.accuracy <= 60 && rng.chance(0.65)) want('wild', dis);
  if (stats.irons >= 88 && rng.chance(0.6)) want('darts', adv);
  if (stats.shortGame >= 88 && rng.chance(0.6)) want('magician', adv);
  if (stats.putting >= 88 && rng.chance(0.6)) want('putter', adv);
  if (stats.putting <= 58 && rng.chance(0.35)) want('yips', dis);
  if (stats.mental >= 88 && rng.chance(0.6)) want('clutch', adv);
  if (stats.mental <= 58 && rng.chance(0.5)) want('choker', dis);
  if (stats.wind >= 86 && rng.chance(0.5)) want('windw', adv);
  if (stats.wind <= 55 && rng.chance(0.45)) want('windh', dis);
  if (stats.recovery >= 86 && rng.chance(0.5)) want(rng.chance(0.5) ? 'sand' : 'rough', adv);
  if (arch === 'legend' && rng.chance(0.6)) want(rng.pick(['clutch', 'iceman', 'manager', 'windw']), adv);
  if (arch === 'grinder' && rng.chance(0.6)) want(rng.pick(['manager', 'bounce', 'lag']), adv);

  const advPool = TRAIT_IDS.filter((t) => TRAITS[t].kind === 'adv');
  const disPool = TRAIT_IDS.filter((t) => TRAITS[t].kind === 'dis');
  // Better players: more strengths, fewer weaknesses
  const extraAdv = rankFrac < 0.1 ? 2 : rankFrac < 0.4 ? 1 : rng.chance(0.6) ? 1 : 0;
  const extraDis = rankFrac < 0.05 ? (rng.chance(0.4) ? 1 : 0) : rankFrac < 0.4 ? 1 : rng.chance(0.7) ? 2 : 1;
  for (let i = 0; i < extraAdv && adv.length < 3; i++) want(rng.pick(advPool), adv);
  for (let i = 0; i < extraDis && dis.length < 2; i++) want(rng.pick(disPool), dis);
  // Contradictory pairs
  const bad = [['bomber', 'short'], ['fairway', 'wild'], ['clutch', 'choker'], ['windw', 'windh'], ['sand', 'sandphob'], ['rough', 'roughh'], ['lag', 'threeputt'], ['hook', 'slice'], ['manager', 'blowup'], ['iceman', 'tires'], ['putter', 'yips'], ['iceman', 'choker']];
  let all = [...adv.slice(0, 3), ...dis.slice(0, 2)];
  for (const [a, b] of bad) if (all.includes(a) && all.includes(b)) all = all.filter((t) => t !== b);
  return all;
}

let CACHE = null;

export function generatePros() {
  if (CACHE) return CACHE;
  const rng = new RNG(424242);
  const N = 500;
  const used = new Set();
  for (const s of STARS) used.add(`${s[0]} ${s[1]}`.toLowerCase());

  // Target overall by world-rank slot
  const slots = [];
  for (let i = 0; i < N; i++) slots.push({ target: 93 - 33 * Math.pow(i / (N - 1), 0.7), star: null });

  // Place headline stars
  const current = STARS.filter((s) => s[4] !== 'legend');
  const legends = STARS.filter((s) => s[4] === 'legend');
  let cursor = 0;
  for (const s of current) {
    let idx = Math.min(N - 1, Math.round(cursor + rng.float(0, 2.2)));
    while (slots[idx].star) idx++;
    slots[idx].star = s;
    cursor += s[5] === 'f' ? 2.2 : 1.35;
  }
  for (const s of legends) {
    let idx = rng.int(22, 190);
    while (slots[idx].star) idx++;
    slots[idx].star = s;
  }

  const codes = Object.keys(COUNTRIES);
  const pros = [];
  for (let i = 0; i < N; i++) {
    const slot = slots[i];
    let first, last, country, age, arch, gender;
    if (slot.star) {
      [first, last, country, age, arch, gender] = slot.star;
    } else {
      country = rng.weighted(codes, (c) => COUNTRIES[c].weight);
      gender = rng.chance(0.12) ? 'f' : 'm';
      ({ first, last } = genName(rng, country, gender, used));
      age = Math.round(clamp(rng.gauss(31, 6), 20, 52));
      arch = rng.weighted(Object.keys(ARCHETYPES), (a) => (a === 'legend' ? 0 : a === 'allround' ? 3 : 2));
    }
    const prof = ARCHETYPES[arch];
    const stats = {};
    for (const k of STAT_KEYS) stats[k] = slot.target + prof[k] + rng.gauss(0, 3.5);
    // Shift so the weighted overall hits the slot target
    let ovr = 0;
    for (const k of STAT_KEYS) ovr += stats[k] * WEIGHTS[k];
    const shift = slot.target - ovr;
    for (const k of STAT_KEYS) stats[k] = Math.round(clamp(stats[k] + shift, 30, 99));

    const traits = pickTraits(rng, stats, arch, i / N);
    const pro = {
      id: `p${i + 1}`,
      first, last, name: `${first} ${last}`,
      country, age, gender, arch,
      stats,
      traits,
      ovr: overall(stats),
      ball: rng.pick(ARCH_BALL[arch]),
      look: {
        shirt: rng.pick(SHIRTS), pants: rng.pick(PANTS), cap: rng.pick(SHIRTS),
        skin: rng.pick(SKIN), hair: arch === 'legend' ? rng.pick(['#8f8f8f', '#e8e8e8', '#3b2a1f']) : rng.pick(HAIR),
      },
      star: !!slot.star,
    };
    // Lower-ranked pros mostly play the stock ball
    if (i > 250 && rng.chance(0.55)) pro.ball = rng.pick(['tourbal', 'softfeel', 'range', 'tourbal']);
    pros.push(pro);
  }
  // Equipment: a separate generator so adding clubs never reshuffles the pros
  const brng = new RNG(mixSeed(424242, 'bags'));
  pros.forEach((pro, i) => {
    pro.bag = proBag(pro.arch, i / N, (opts) => brng.pick(opts));
    pro.look.shades = brng.chance(0.22);
    pro.look.belt = brng.pick(['#1b1b1b', '#3b2a1f', '#f4f4f4', '#1d3557', '#8d5a3b']);
    pro.look.shoe = brng.pick(['#1b1b1b', '#f4f4f4', pro.look.shirt, '#1d3557', '#8d5a3b']);
  });
  CACHE = pros;
  return pros;
}

export function proById(id) {
  const pros = generatePros();
  const n = parseInt(id.slice(1), 10) - 1;
  return pros[n];
}
