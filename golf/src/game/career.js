// Career mode: you start as world #501 and try to become #1.
import { generatePros, proById, STAT_KEYS, overall } from '../data/players.js';
import { generateSeason, TOURS, SEASON_WEEKS, MAJORS } from '../data/tour.js';
import { courseById } from '../data/courses.js';
import { RNG, mixSeed } from '../util/rng.js';
import { HUMAN_ID, simulateWholeEvent, createTournament, results as tourneyResults } from './tournament.js';

export const START_YEAR = 2026;
export const DECAY = 0.984; // weekly ranking-points decay

export const ACHIEVEMENTS = {
  first_birdie: { name: 'First Birdie', desc: 'Make a birdie in any round' },
  first_eagle: { name: 'Eagle Eye', desc: 'Make an eagle' },
  ace: { name: 'Hole-in-One', desc: 'Ace a hole' },
  albatross: { name: 'Albatross', desc: 'Three under par on a single hole' },
  bogey_free: { name: 'Clean Card', desc: 'Play an 18-hole round without a bogey' },
  low_65: { name: 'Going Low', desc: 'Shoot 65 or better' },
  low_59: { name: 'Mr. 59', desc: 'Break 60' },
  first_cut: { name: 'Weekend Warrior', desc: 'Make a cut' },
  top10: { name: 'Top Ten', desc: 'Finish in the top 10' },
  win_ch: { name: 'Challenger Champion', desc: 'Win on the Challenger Tour' },
  win_wt: { name: 'World Tour Winner', desc: 'Win a World Tour event' },
  win_major: { name: 'Major Champion', desc: 'Win a major' },
  win_fin: { name: 'Tour Champion', desc: 'Win the Tour Championship' },
  grand_slam: { name: 'Grand Slam', desc: 'Win all four majors' },
  top100: { name: 'Top 100', desc: 'Reach the top 100 in the world' },
  top50: { name: 'Top 50', desc: 'Reach the top 50 in the world' },
  top10_world: { name: 'World Top 10', desc: 'Reach the top 10 in the world' },
  world_no1: { name: 'World No. 1', desc: 'Become the best golfer in the world' },
  million: { name: 'Millionaire', desc: 'Earn $1,000,000 in career prize money' },
  ten_million: { name: 'Big Money', desc: 'Earn $10,000,000 in career prize money' },
};

export function xpForLevel(level) {
  return 500 + level * 180;
}

export function statCost(value) {
  return value >= 92 ? 3 : value >= 84 ? 2 : 1;
}

export function newCareer({ name, country, gender, look, stats }) {
  const pros = generatePros();
  const rng = new RNG(mixSeed('career', name, Date.now() & 0xffff));
  const p = {};
  pros.forEach((pro, i) => {
    p[pro.id] = {
      pts: Math.round((700 * Math.exp(-i / 55) + 45 * Math.exp(-i / 250) + rng.float(-3, 3)) * 100) / 100,
      sp: 0, money: 0, wins: 0, majors: 0, top10: 0, events: 0, cw: pro.star ? Math.round(Math.max(0, 16 - i * 0.3) * rng.next()) : 0, cm: 0, cuts: 0,
    };
  });
  p[HUMAN_ID] = { pts: 0, sp: 0, money: 0, wins: 0, majors: 0, top10: 0, events: 0, cw: 0, cm: 0, cuts: 0 };
  const c = {
    v: 1,
    created: Date.now(),
    savedAt: Date.now(),
    golfer: {
      name, country, gender, look,
      stats: { ...stats },
      traits: [],
      level: 1, xp: 0, sp: 0,
      money: 25000, careerMoney: 0,
      balls: ['range', 'tourbal'], ball: 'tourbal',
      majorsWon: [],
    },
    year: START_YEAR,
    week: 1,
    p,
    prevRank: {},
    history: [],
    achievements: {},
    invites: 2,
    active: null,
    news: [],
    stats: { rounds: 0, holes: 0, strokes: 0, par: 0, birdies: 0, eagles: 0, aces: 0, best: null, fairways: 0, fairwayChances: 0, gir: 0, putts: 0 },
  };
  c.prevRank = rankMap(c);
  return c;
}

export function season(c) {
  if (!c._season || c._season.year !== c.year) c._season = generateSeason(c.year);
  return c._season;
}

export function thisWeek(c) {
  return season(c).weeks[c.week - 1];
}

export function rankings(c) {
  const ids = Object.keys(c.p);
  ids.sort((a, b) => c.p[b].pts - c.p[a].pts);
  return ids.map((id, i) => ({ id, rank: i + 1, pts: c.p[id].pts, prev: c.prevRank[id] || null }));
}

export function rankMap(c) {
  const m = {};
  rankings(c).forEach((r) => { m[r.id] = r.rank; });
  return m;
}

export function rankOf(c, id = HUMAN_ID) {
  return rankMap(c)[id];
}

export function seasonPointsTable(c) {
  const ids = Object.keys(c.p).filter((id) => c.p[id].sp > 0);
  ids.sort((a, b) => c.p[b].sp - c.p[a].sp);
  return ids.map((id, i) => ({ id, rank: i + 1, sp: c.p[id].sp }));
}

export function moneyTable(c) {
  const ids = Object.keys(c.p).filter((id) => c.p[id].money > 0);
  ids.sort((a, b) => c.p[b].money - c.p[a].money);
  return ids.map((id, i) => ({ id, rank: i + 1, money: c.p[id].money }));
}

function wonThisOrLastSeason(c, tour) {
  return c.history.some((h) => h.pos === 1 && h.tour === tour && h.year >= c.year - 1);
}

// Can the human enter this event?
export function eligibility(c, ev) {
  const rank = rankOf(c);
  if (ev.tour === 'CH') return { ok: true, how: 'Open to all' };
  if (ev.tour === 'WT') {
    if (rank <= 125) return { ok: true, how: `World rank #${rank}` };
    if (wonThisOrLastSeason(c, 'CH')) return { ok: true, how: 'Challenger Tour winner' };
    if (c.invites > 0) return { ok: true, invite: true, how: `Sponsor invite (${c.invites} left)` };
    return { ok: false, why: 'Need a top-125 ranking, a Challenger win, or a sponsor invite' };
  }
  if (ev.tour === 'MAJ') {
    if (rank <= 60) return { ok: true, how: `World rank #${rank}` };
    if (wonThisOrLastSeason(c, 'WT') || wonThisOrLastSeason(c, 'MAJ')) return { ok: true, how: 'Tour winner exemption' };
    if (c.golfer.majorsWon.length) return { ok: true, how: 'Past major champion' };
    return { ok: false, why: 'Need a top-60 ranking or a World Tour win' };
  }
  if (ev.tour === 'FIN') {
    const sp = seasonPointsTable(c);
    const me = sp.find((x) => x.id === HUMAN_ID);
    if (me && me.rank <= 30) return { ok: true, how: `#${me.rank} in the season points race` };
    return { ok: false, why: 'Top 30 in season points only' };
  }
  return { ok: false, why: '' };
}

// Pick AI fields for every event this week. humanEvent gets one fewer AI.
export function buildFields(c, week, humanEventId) {
  const rng = new RNG(mixSeed('fields', c.year, week.week));
  const ranked = rankings(c).filter((r) => r.id !== HUMAN_ID).map((r) => r.id);
  const used = new Set();
  const fields = {};
  const order = ['FIN', 'MAJ', 'WT', 'CH'];
  const evs = week.events.slice().sort((a, b) => order.indexOf(a.tour) - order.indexOf(b.tour));
  for (const ev of evs) {
    const size = ev.field - (ev.id === humanEventId ? 1 : 0);
    let pick = [];
    if (ev.tour === 'FIN') {
      pick = seasonPointsTable(c).filter((x) => x.id !== HUMAN_ID).map((x) => x.id).slice(0, size);
      if (pick.length < size) for (const id of ranked) { if (pick.length >= size) break; if (!pick.includes(id)) pick.push(id); }
    } else if (ev.tour === 'MAJ') {
      pick = ranked.slice(0, size - 12);
      const pool = ranked.slice(size - 12, 260);
      rng.shuffle(pool);
      pick.push(...pool.slice(0, size - pick.length));
    } else if (ev.tour === 'WT') {
      const cand = ranked.slice(0, 175).filter((id, i) => !used.has(id) && !(rng.next() < (i < 30 ? 0.3 : 0.15)));
      pick = cand.slice(0, size);
    } else {
      const cand = ranked.slice(110).filter((id) => !used.has(id));
      // Better-ranked Challenger players enter more often
      const weighted = cand.map((id, i) => ({ id, k: rng.next() * (1.4 - i / cand.length) }));
      weighted.sort((a, b) => b.k - a.k);
      pick = weighted.slice(0, size).map((x) => x.id);
    }
    pick.forEach((id) => used.add(id));
    fields[ev.id] = pick;
  }
  return fields;
}

export function startEvent(c, ev, roundsSetting = 4) {
  const el = eligibility(c, ev);
  if (!el.ok) throw new Error(el.why);
  if (el.invite) c.invites--;
  const week = thisWeek(c);
  const fields = buildFields(c, week, ev.id);
  const rounds = ev.tour === 'FIN' || ev.tour === 'MAJ' ? Math.max(roundsSetting, Math.min(4, roundsSetting * 2)) : roundsSetting;
  const t = createTournament(ev, fields[ev.id], c.golfer, rounds);
  c.active = { eventId: ev.id, t, fields };
  return t;
}

function applyResults(c, ev, res, humanIn) {
  const t = TOURS[ev.tour];
  const winner = res.find((r) => r.pos === 1);
  for (const r of res) {
    const d = c.p[r.id];
    if (!d) continue;
    d.events++;
    d.pts += r.pts;
    d.money += r.money;
    if (ev.tour === 'WT' || ev.tour === 'MAJ') d.sp += r.seasonPts;
    if (r.made) d.cuts++;
    if (r.pos && r.pos <= 10) d.top10++;
    if (r.pos === 1) {
      d.wins++; d.cw++;
      if (ev.tour === 'MAJ') { d.majors++; d.cm++; }
    }
  }
  if (winner && !humanIn) {
    const pro = proById(winner.id);
    if (ev.tour !== 'CH') c.news.unshift({ year: c.year, week: ev.week, text: `${pro.name} wins the ${ev.name} at ${winner.toPar === 0 ? 'E' : winner.toPar > 0 ? '+' + winner.toPar : winner.toPar}` });
  }
  c.news = c.news.slice(0, 30);
  return t;
}

/**
 * Finish the current week: record the human's event (if any), simulate every
 * other event, decay/refresh rankings, advance the calendar.
 */
export function completeWeek(c, humanSummary = null) {
  const week = thisWeek(c);
  const before = rankMap(c);
  const beforeRank = before[HUMAN_ID];
  let humanResult = null;
  const fields = c.active ? c.active.fields : buildFields(c, week, null);
  // decay before adding this week's points
  for (const id of Object.keys(c.p)) c.p[id].pts = Math.round(c.p[id].pts * DECAY * 100) / 100;
  for (const ev of week.events) {
    if (c.active && c.active.eventId === ev.id) {
      const res = tourneyResults(c.active.t);
      applyResults(c, ev, res, true);
      const me = res.find((r) => r.id === HUMAN_ID);
      humanResult = { ...me, event: ev, field: res.length, winner: res.find((r) => r.pos === 1) };
      c.history.unshift({ year: c.year, week: ev.week, eventId: ev.id, name: ev.name, tour: ev.tour, courseId: ev.courseId, pos: me.pos, posText: me.posText, toPar: me.toPar, money: me.money, pts: me.pts, rounds: me.rounds });
      c.golfer.money += me.money;
      c.golfer.careerMoney += me.money;
      if (ev.tour === 'MAJ' && me.pos === 1) c.golfer.majorsWon.push(ev.name);
    } else {
      const ids = fields[ev.id] || [];
      if (!ids.length) continue;
      const { results } = simulateWholeEvent(ev, ids, 4);
      applyResults(c, ev, results, false);
    }
  }
  c.prevRank = before;
  const afterRank = rankOf(c);
  const summary = { week: c.week, year: c.year, humanResult, rankBefore: beforeRank, rankAfter: afterRank, xp: 0, levels: 0, newAchievements: [] };
  if (humanResult) {
    summary.xp = eventXP(humanResult, humanSummary);
    summary.levels = addXP(c, summary.xp);
  }
  summary.newAchievements = checkAchievements(c, humanResult, humanSummary);
  c.active = null;
  // advance
  c.week++;
  if (c.week > SEASON_WEEKS) {
    summary.seasonEnd = endSeason(c);
  }
  c.savedAt = Date.now();
  return summary;
}

function eventXP(r, hs) {
  const tourMult = { CH: 1, WT: 2, MAJ: 3.2, FIN: 2.5 }[r.event.tour];
  let xp = 80;
  if (r.made) xp += 80;
  if (r.pos) xp += Math.max(0, (r.field - r.pos + 1) * 3 * tourMult);
  if (r.pos === 1) xp += 400 * tourMult;
  else if (r.pos && r.pos <= 10) xp += 120 * tourMult;
  if (hs) xp += hs.birdies * 15 + hs.eagles * 60 + hs.aces * 250 + hs.holesPlayed * 3;
  return Math.round(xp);
}

export function addXP(c, xp) {
  const g = c.golfer;
  g.xp += xp;
  let levels = 0;
  while (g.xp >= xpForLevel(g.level)) {
    g.xp -= xpForLevel(g.level);
    g.level++;
    g.sp += 4;
    levels++;
  }
  return levels;
}

export function upgradeStat(c, key) {
  const g = c.golfer;
  const v = g.stats[key];
  const cost = statCost(v);
  if (v >= 99 || g.sp < cost) return false;
  g.stats[key] = v + 1;
  g.sp -= cost;
  return true;
}

export function checkAchievements(c, hr, hs) {
  const got = [];
  const give = (id) => {
    if (!c.achievements[id]) { c.achievements[id] = { year: c.year, week: c.week }; got.push(id); }
  };
  if (hs) {
    if (hs.birdies > 0) give('first_birdie');
    if (hs.eagles > 0) give('first_eagle');
    if (hs.aces > 0) give('ace');
    if (hs.albatross > 0) give('albatross');
    if (hs.bogeyFree) give('bogey_free');
    if (hs.bestRound != null && hs.bestRound <= 65) give('low_65');
    if (hs.bestRound != null && hs.bestRound < 60) give('low_59');
  }
  if (hr) {
    if (hr.made) give('first_cut');
    if (hr.pos && hr.pos <= 10) give('top10');
    if (hr.pos === 1) {
      give({ CH: 'win_ch', WT: 'win_wt', MAJ: 'win_major', FIN: 'win_fin' }[hr.event.tour]);
      if (hr.event.tour === 'MAJ') {
        const names = new Set(c.golfer.majorsWon);
        if (MAJORS.every((m) => names.has(m.name))) give('grand_slam');
      }
    }
  }
  const r = rankOf(c);
  if (r <= 100) give('top100');
  if (r <= 50) give('top50');
  if (r <= 10) give('top10_world');
  if (r === 1) give('world_no1');
  if (c.golfer.careerMoney >= 1e6) give('million');
  if (c.golfer.careerMoney >= 1e7) give('ten_million');
  return got;
}

function endSeason(c) {
  const sp = seasonPointsTable(c);
  const money = moneyTable(c);
  const out = {
    year: c.year,
    champion: sp[0] ? sp[0].id : null,
    moneyLeader: money[0] ? money[0].id : null,
    yourRank: rankOf(c),
    yourSeasonMoney: c.p[HUMAN_ID].money,
  };
  for (const id of Object.keys(c.p)) {
    const d = c.p[id];
    d.sp = 0; d.money = 0; d.wins = 0; d.majors = 0; d.top10 = 0; d.events = 0; d.cuts = 0;
  }
  c.year++;
  c.week = 1;
  c.invites = 2;
  c._season = null;
  return out;
}

export function skipWeek(c) {
  c.active = null;
  return completeWeek(c, null);
}

export function golferOVR(g) {
  return overall(g.stats);
}

export const DEFAULT_STATS = { power: 58, accuracy: 56, irons: 56, shortGame: 55, putting: 56, recovery: 54, mental: 54, wind: 54, consistency: 58 };
export { STAT_KEYS, courseById };
