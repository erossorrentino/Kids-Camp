// The daily challenge: one skills challenge a day, the same for everyone who
// plays that day (course, weather, wind and the pros to beat all come from
// the date). Beat the target score to keep your streak going.
import { RNG, mixSeed } from '../util/rng.js';
import { generateCourses } from '../data/courses.js';
import { GAMES } from './minigames.js';
import { YD } from '../sim/hole.js';

const KEY = 'fairway-legends.daily.v1';

export function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function prevDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1));
}

// Targets to beat: ctp is a distance (lower is better), the rest are higher-is-better
const TARGETS = { ctp: 5, drive: 245, putt: 8, target: 35 };

export function dailyChallenge(key = dayKey()) {
  const rng = new RNG(mixSeed('daily', key));
  const kinds = ['ctp', 'drive', 'putt', 'target'];
  const kind = kinds[rng.int(0, kinds.length - 1)];
  const courses = generateCourses();
  const course = courses[rng.int(0, courses.length - 1)];
  const sky = rng.weighted(['day', 'sunset', 'night', 'rain'], (s) => ({ day: 6, sunset: 2, night: 1.5, rain: 1 }[s]));
  const windMph = kind === 'putt' ? 0 : Math.round(rng.float(3, 15));
  const target = TARGETS[kind] * (sky === 'rain' && kind === 'drive' ? 0.93 : 1);
  return {
    key, kind, courseId: course.id, courseName: course.name, sky, windMph, windDir: rng.float(0, Math.PI * 2),
    seed: mixSeed('dailyseed', key), target,
    title: GAMES[kind].name,
  };
}

export function targetText(ch, units) {
  const t = ch.target;
  if (ch.kind === 'ctp') return units === 'meters' ? `inside ${t.toFixed(1)} m` : `inside ${Math.round(t / 0.3048)} ft`;
  if (ch.kind === 'drive') return units === 'meters' ? `${Math.round(t)} m in the fairway` : `${Math.round(t / YD)} yds in the fairway`;
  return `${t} points`;
}

export function beatsTarget(ch, score) {
  if (ch.kind === 'ctp') return score <= ch.target;
  return score >= ch.target;
}

export function loadDaily() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null') || { streak: 0, lastBeat: null, days: {} };
  } catch (e) {
    return { streak: 0, lastBeat: null, days: {} };
  }
}

export function saveDaily(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* ignore */ }
}

// Record a finished attempt; returns what changed
export function recordDaily(d, ch, score, better) {
  const day = d.days[ch.key] || (d.days[ch.key] = { best: null, tries: 0, beat: false, paid: false });
  day.tries++;
  const improved = day.best == null || better(score, day.best);
  if (improved) day.best = score;
  let newlyBeat = false;
  if (!day.beat && beatsTarget(ch, score)) {
    day.beat = true;
    newlyBeat = true;
    d.streak = d.lastBeat === prevDay(ch.key) ? (d.streak || 0) + 1 : 1;
    d.lastBeat = ch.key;
  }
  // keep a couple of weeks of history
  const keys = Object.keys(d.days).sort();
  while (keys.length > 21) delete d.days[keys.shift()];
  return { day, improved, newlyBeat, streak: d.streak };
}

// The streak only counts if you beat yesterday's (or today's) challenge
export function liveStreak(d, key = dayKey()) {
  if (!d.lastBeat) return 0;
  if (d.lastBeat === key || d.lastBeat === prevDay(key)) return d.streak || 0;
  return 0;
}

export function dailyReward(streak) {
  return 10000 + 5000 * Math.min(8, Math.max(0, streak - 1));
}
