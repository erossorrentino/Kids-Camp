// A tournament: field, conditions per round, AI rounds (pre-simulated so the
// leaderboard can reveal them hole by hole as you play), cut, playoff, payouts.
import { proById } from '../data/players.js';
import { courseById } from '../data/courses.js';
import { courseProfile, simRound, drawForm, drawDayForm, simHole, effectiveStats, fxWithGear } from '../sim/aisim.js';
import { RNG, mixSeed, clamp } from '../util/rng.js';
import { purseShare, pointsShare, splitTies, TOURS } from '../data/tour.js';

export const HUMAN_ID = 'you';
export const CUT_SIZE = 65;

export function makeConditions(course, seed, roundIdx, isMajor) {
  const rng = new RNG(mixSeed(seed, 'cond', roundIdx));
  const [w0, w1] = course.wind;
  const windMph = Math.max(0, rng.float(w0, w1) + rng.gauss(0, 2));
  const windDir = rng.float(0, Math.PI * 2); // direction the wind blows TOWARD (heading convention)
  return {
    windMph,
    windDir,
    stimp: course.stimp + (isMajor ? 0.5 : 0) + roundIdx * 0.2,
    firm: clamp(course.firm + roundIdx * 0.03 + (isMajor ? 0.05 : 0), 0.15, 0.95),
    pinDay: roundIdx,
    timeOfDay: rng.float(0.25, 0.8), // 0 = dawn, 1 = dusk
    overcast: course.style === 'Links' ? rng.chance(0.55) : rng.chance(0.15),
    gust: rng.float(0.05, 0.25),
  };
}

export function coursePar(course) {
  return course.holes.reduce((s, h) => s + h.par, 0);
}

/**
 * event: from the season calendar; fieldIds: AI pro ids; human: golfer (or null)
 */
export function createTournament(event, fieldIds, human, rounds = 4) {
  const course = courseById(event.courseId);
  const rng = new RNG(mixSeed(event.seed, 'field'));
  const players = fieldIds.map((id) => ({
    id,
    scores: [],
    status: 'active',
    form: drawForm(proById(id), () => rng.next()),
    teeOff: [],
  }));
  if (human) players.push({ id: HUMAN_ID, scores: [], status: 'active', form: 0, teeOff: [] });
  const t = {
    id: event.id,
    name: event.name,
    tour: event.tour,
    week: event.week,
    courseId: course.id,
    purse: event.purse,
    pts: event.pts,
    rounds,
    round: 0,
    seed: event.seed,
    cond: Array.from({ length: rounds }, (_, r) => makeConditions(course, event.seed, r, event.tour === 'MAJ')),
    players,
    cutMade: false,
    finished: false,
    hasHuman: !!human,
    human: human ? { holes: [], simmed: [] } : null,
    playoff: null,
  };
  return t;
}

function totalOf(p, upToRound = 99) {
  let s = 0;
  for (let r = 0; r < Math.min(p.scores.length, upToRound); r++) for (const v of p.scores[r] || []) s += v;
  return s;
}

function parThrough(course, n) {
  let s = 0;
  for (let i = 0; i < n; i++) s += course.holes[i].par;
  return s;
}

// Pre-simulate every AI player's round r
export function simAIRound(t, r) {
  const course = courseById(t.courseId);
  const prof = courseProfile(course);
  const cond = { windMph: t.cond[r].windMph, stimp: t.cond[r].stimp, firm: t.cond[r].firm };
  const rng = new RNG(mixSeed(t.seed, 'round', r));
  const rnd = () => rng.next();
  const par = coursePar(course);
  // Contention going into the round (for final-round pressure)
  let lead = Infinity;
  for (const p of t.players) if (p.status === 'active') lead = Math.min(lead, totalOf(p, r) - par * r);
  for (const p of t.players) {
    if (p.id === HUMAN_ID || p.status !== 'active') continue;
    const pro = proById(p.id);
    if (!pro.fx) pro.fx = fxWithGear(pro.traits, pro.bag);
    const behind = totalOf(p, r) - par * r - lead;
    const finalRound = r === t.rounds - 1;
    const pressure = finalRound && behind <= 4 ? (i) => (i >= 9 ? (i - 8) / 10 : 0.1) : null;
    p.scores[r] = simRound(pro, prof, cond, rnd, { form: p.form + drawDayForm(pro, rnd), pressure });
    p.teeOff[r] = Math.round(rng.float(-7, 7));
  }
}

export function aiRoundsAllDone(t, r) {
  return t.players.every((p) => p.id === HUMAN_ID || p.status !== 'active' || p.scores[r]);
}

// Human scores for the current round
export function humanPlayer(t) {
  return t.players.find((p) => p.id === HUMAN_ID);
}

export function recordHumanHole(t, holeIdx, strokes, simmed = false) {
  const hp = humanPlayer(t);
  if (!hp.scores[t.round]) hp.scores[t.round] = [];
  hp.scores[t.round][holeIdx] = strokes;
  if (simmed) {
    if (!t.human.simmed[t.round]) t.human.simmed[t.round] = [];
    t.human.simmed[t.round][holeIdx] = true;
  }
}

export function simHumanHole(t, golfer, holeIdx, salt = 0) {
  const course = courseById(t.courseId);
  const prof = courseProfile(course);
  const c = t.cond[Math.min(t.round, t.cond.length - 1)];
  const rng = new RNG(mixSeed(t.seed, 'humansim', t.round, holeIdx, salt));
  const fx = fxWithGear(golfer.traits || [], golfer.bag);
  const s = effectiveStats(golfer.stats, 0);
  return simHole(s, fx, prof.holes[holeIdx], { windMph: c.windMph, stimp: c.stimp, firm: c.firm }, () => rng.next());
}

/**
 * Leaderboard rows. humanThru: holes the human has finished this round
 * (AI players are revealed relative to that, using staggered tee times).
 */
export function leaderboard(t, opts = {}) {
  const course = courseById(t.courseId);
  const r = t.round;
  const hp = humanPlayer(t);
  const humanThru = hp ? (hp.scores[r] || []).filter((v) => v != null).length : 18;
  const roundLive = !t.finished && hp && hp.status === 'active' && humanThru < 18 && !opts.full;
  const rows = [];
  for (const p of t.players) {
    let prior = 0, priorPar = 0;
    for (let k = 0; k < r; k++) {
      if (!p.scores[k]) continue;
      prior += p.scores[k].reduce((a, b) => a + b, 0);
      priorPar += coursePar(course);
    }
    let thru = 0, today = 0, todayPar = 0;
    const cur = p.scores[r];
    if (p.status === 'active' && cur) {
      if (p.id === HUMAN_ID) {
        for (let i = 0; i < 18; i++) if (cur[i] != null) { thru++; today += cur[i]; todayPar += course.holes[i].par; }
      } else {
        thru = roundLive ? clamp(humanThru + (p.teeOff[r] || 0), 0, 18) : 18;
        for (let i = 0; i < thru; i++) { today += cur[i]; todayPar += course.holes[i].par; }
      }
    }
    rows.push({
      id: p.id,
      human: p.id === HUMAN_ID,
      status: p.status,
      toPar: prior - priorPar + (today - todayPar),
      total: prior + today,
      today: thru ? today - todayPar : null,
      thru,
      rounds: p.scores.map((sc) => (sc && sc.length === 18 && sc.every((v) => v != null) ? sc.reduce((a, b) => a + b, 0) : null)),
    });
  }
  rows.sort((a, b) => {
    const ac = a.status === 'cut' ? 1 : 0, bc = b.status === 'cut' ? 1 : 0;
    if (ac !== bc) return ac - bc;
    return a.toPar - b.toPar || b.thru - a.thru || (a.human ? -1 : b.human ? 1 : 0);
  });
  // positions with ties
  let i = 0;
  while (i < rows.length) {
    let j = i;
    while (j + 1 < rows.length && rows[j + 1].toPar === rows[i].toPar && rows[j + 1].status === rows[i].status) j++;
    for (let k = i; k <= j; k++) rows[k].pos = rows[i].status === 'cut' ? 'CUT' : `${j > i ? 'T' : ''}${i + 1}`;
    i = j + 1;
  }
  if (t.playoff && t.playoff.winner) {
    const w = rows.find((x) => x.id === t.playoff.winner);
    if (w) { rows.splice(rows.indexOf(w), 1); rows.unshift(w); w.pos = '1'; rows.slice(1).forEach((x) => { if (x.pos === 'T1') x.pos = 'T2'; }); }
  }
  return rows;
}

// Close out round r: cut after round 2 of a 4-round event
export function finishRound(t) {
  const r = t.round;
  const course = courseById(t.courseId);
  if (t.rounds === 4 && r === 1 && !t.cutMade) {
    const act = t.players.filter((p) => p.status === 'active');
    const totals = act.map((p) => totalOf(p, 2)).sort((a, b) => a - b);
    const line = totals[Math.min(totals.length - 1, CUT_SIZE - 1)];
    for (const p of act) if (totalOf(p, 2) > line) p.status = 'cut';
    t.cutLine = line - coursePar(course) * 2;
    t.cutMade = true;
  }
  if (r + 1 < t.rounds) {
    t.round = r + 1;
    return { done: false };
  }
  return { done: true };
}

export function humanMissedCut(t) {
  const hp = humanPlayer(t);
  return hp && hp.status === 'cut';
}

// Tied for the lead after 72 holes -> sudden death on the 18th
export function playoffNeeded(t) {
  const rows = leaderboard(t, { full: true }).filter((x) => x.status === 'active');
  const lead = rows[0].toPar;
  const tied = rows.filter((x) => x.toPar === lead).map((x) => x.id);
  return tied.length > 1 ? tied : null;
}

export function simPlayoff(t, tied, humanScores = []) {
  const course = courseById(t.courseId);
  const prof = courseProfile(course);
  const c = t.cond[t.rounds - 1];
  const rng = new RNG(mixSeed(t.seed, 'playoff'));
  let alive = tied.slice();
  const log = [];
  for (let hole = 0; hole < 8 && alive.length > 1; hole++) {
    const res = alive.map((id) => {
      if (id === HUMAN_ID) return { id, s: humanScores[hole] };
      const pro = proById(id);
      const fx = pro.fx || fxWithGear(pro.traits, pro.bag);
      return { id, s: simHole(effectiveStats(pro.stats, 1), fx, prof.holes[17], { windMph: c.windMph, stimp: c.stimp, firm: c.firm }, () => rng.next()) };
    });
    if (res.some((x) => x.s == null)) return { pending: true, alive, log, hole };
    const best = Math.min(...res.map((x) => x.s));
    log.push(res);
    alive = res.filter((x) => x.s === best).map((x) => x.id);
  }
  if (alive.length > 1) alive = [alive[Math.floor(rng.next() * alive.length)]];
  t.playoff = { tied, winner: alive[0], log };
  return { winner: alive[0], log };
}

// Final results with payouts and ranking points
export function results(t) {
  const rows = leaderboard(t, { full: true });
  const made = rows.filter((x) => x.status === 'active');
  const tour = TOURS[t.tour];
  const alloc = splitTies(made, 'toPar', (pos) => purseShare(pos));
  const palloc = splitTies(made, 'toPar', (pos) => pointsShare(pos));
  const salloc = splitTies(made, 'toPar', (pos) => pointsShare(pos));
  const out = [];
  for (const row of rows) {
    const a = alloc.get(row);
    let share = a ? a.value : 0;
    let pshare = palloc.get(row) ? palloc.get(row).value : 0;
    let sshare = salloc.get(row) ? salloc.get(row).value : 0;
    let pos = a ? a.pos : null;
    if (t.playoff && t.playoff.tied.includes(row.id)) {
      const n = t.playoff.tied.length;
      if (row.id === t.playoff.winner) { share = purseShare(1); pshare = 1; sshare = 1; pos = 1; }
      else {
        let s = 0, ps = 0;
        for (let k = 2; k <= n; k++) { s += purseShare(k); ps += pointsShare(k); }
        share = s / (n - 1); pshare = ps / (n - 1); sshare = pshare; pos = 2;
      }
    }
    out.push({
      id: row.id,
      pos,
      posText: row.status === 'cut' ? 'CUT' : row.pos,
      toPar: row.toPar,
      total: row.total,
      rounds: row.rounds,
      money: Math.round(t.purse * share),
      pts: Math.round(t.pts * pshare * 100) / 100,
      seasonPts: Math.round(tour.season * sshare),
      made: row.status === 'active',
    });
  }
  return out;
}

// A whole event with no human in it (other tours, weeks you skip)
export function simulateWholeEvent(event, fieldIds, rounds = 4) {
  const t = createTournament(event, fieldIds, null, rounds);
  for (let r = 0; r < rounds; r++) {
    simAIRound(t, r);
    finishRound(t);
  }
  t.finished = true;
  const tied = playoffNeeded(t);
  if (tied) simPlayoff(t, tied);
  return { t, results: results(t) };
}
