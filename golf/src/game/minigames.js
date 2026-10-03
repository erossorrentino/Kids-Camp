// Mini-games: the practice range and four skills challenges (closest to the
// pin, long drive, putting, target challenge). Each one runs inside the
// normal round controller as a "mode": the mode decides where the ball
// starts, what counts, and when the game is over. A small field of tour pros
// takes the same challenge (simulated from their skills) so there is always
// somebody to beat.
import { HoleModel, YD } from '../sim/hole.js';
import { generatePros, proById } from '../data/players.js';
import { BALL_BY_ID } from '../data/equipment.js';
import { traitEffects } from '../data/traits.js';
import { computeLaunch, launchState, ballAero } from '../sim/shot.js';
import { simulate, flatEnv } from '../sim/physics.js';
import { gearFor } from '../data/clubsets.js';
import { suggestClub } from '../sim/caddie.js';
import { RNG, mixSeed, clamp } from '../util/rng.js';
import { sfx } from '../audio.js';
import { buildTarget, buildDistanceBoards, buildRangeBay, buildStationDiscs } from '../render/targets.js';

export const GAMES = {
  range: {
    name: 'Practice Range', short: 'Range', icon: '⛳',
    blurb: 'Hit as many balls as you like with any club. Target greens every 50 yards, and your average carry with every club.',
    rules: ['Unlimited balls', 'Every club', 'No score'],
  },
  ctp: {
    name: 'Closest to the Pin', short: 'Closest to pin', icon: '🎯',
    blurb: 'Three balls at a par 3. Your closest ball is your score. Hole one and you win outright.',
    rules: ['3 balls', 'Closest ball counts', 'Ace wins'],
  },
  drive: {
    name: 'Long Drive', short: 'Long drive', icon: '💥',
    blurb: 'Six drives down the longest hole. Only balls that stop in the fairway count. Longest one wins.',
    rules: ['6 drives', 'Fairway only', 'Longest wins'],
  },
  putt: {
    name: 'Putting Challenge', short: 'Putting', icon: '🟢',
    blurb: 'Six putts from 5 to 40 feet around one hole. Longer putts are worth more; a lag inside 3 feet still earns a point.',
    rules: ['6 putts', 'Holed: 2 to 8 pts', 'Within 3 ft: 1 pt'],
  },
  target: {
    name: 'Target Challenge', short: 'Targets', icon: '🔴',
    blurb: 'Ten balls at five ringed targets from 60 to 230 yards. Bullseyes score big, and farther targets multiply your points.',
    rules: ['10 balls', 'Bull 10 · ring 5 · outer 2', 'Far targets ×2, ×3'],
  },
};

export const GAME_ORDER = ['range', 'ctp', 'drive', 'putt', 'target'];

// Weekly prize for a career golfer (first play of each game each week)
export const MINI_PRIZES = [25000, 12000, 7500, 5000, 3500, 2500, 2500, 2500];

const TARGETS = [
  { yd: 60, lat: -9, color: '#e63946', mult: 1 },
  { yd: 100, lat: 11, color: '#f2c230', mult: 1 },
  { yd: 140, lat: -13, color: '#2ec4b6', mult: 2 },
  { yd: 180, lat: 8, color: '#3a86ff', mult: 2 },
  { yd: 230, lat: -5, color: '#9d4edd', mult: 3 },
];
const RINGS = [3.5, 8, 13]; // bullseye, ring, outer (meters)
const RING_PTS = [10, 5, 2];
const RANGE_GREENS = [50, 100, 150, 200, 250].map((yd, i) => ({ yd, lat: [8, -10, 12, -8, 4][i], color: ['#e63946', '#f2c230', '#2ec4b6', '#3a86ff', '#9d4edd'][i], mult: 0 }));
const PUTT_STATIONS = [1.5, 2.5, 4, 6, 9, 12];
const PUTT_PTS = [2, 3, 4, 5, 6, 8];

// A straight, wide practice hole on the chosen course's land
export function rangeCourse(base) {
  return {
    ...base,
    id: `${base.id}-range`,
    name: `${base.name} Practice Range`,
    holes: [{ n: 1, par: 5, yards: 470, si: 1, seed: mixSeed(base.seed, 'range') | 0 }],
    signature: 1,
  };
}

// Which hole of the course each game uses
export function holeFor(kind, course) {
  const hs = course.holes;
  if (kind === 'ctp') {
    const p3 = hs.map((h, i) => ({ h, i })).filter((x) => x.h.par === 3);
    p3.sort((a, b) => Math.abs(a.h.yards - 170) - Math.abs(b.h.yards - 170));
    return p3.length ? p3[0].i : 0;
  }
  if (kind === 'drive') {
    let best = 0;
    hs.forEach((h, i) => { if (h.par >= hs[best].par && h.yards > hs[best].yards) best = i; });
    return best;
  }
  if (kind === 'putt') return course.signature - 1;
  return 0;
}

const fmt = (units, m, small = true) => {
  if (units === 'meters') return small && m < 20 ? `${m.toFixed(1)} m` : `${Math.round(m)} m`;
  const ft = m / 0.3048;
  if (small && m / YD < 20) {
    const f = Math.floor(ft);
    const inch = Math.round((ft - f) * 12);
    return inch === 12 ? `${f + 1} ft` : f < 3 ? `${f} ft ${inch} in` : `${f} ft${inch ? ` ${inch} in` : ''}`;
  }
  return `${Math.round(m / YD)} yds`;
};

// ------------------------------------------------------------ AI field
function rayleigh(rng, sigma) {
  return sigma * Math.sqrt(-2 * Math.log(Math.max(1e-9, rng.next())));
}

// Full-power driver total on flat ground for a golfer, from the real physics
const driveCache = new Map();
export function driveTotal(stats, traits, ballId, bag) {
  const key = `${JSON.stringify(stats)}|${traits.join(',')}|${ballId}|${JSON.stringify(bag || {})}`;
  if (driveCache.has(key)) return driveCache.get(key);
  const fx = traitEffects(traits);
  const ball = BALL_BY_ID[ballId] || BALL_BY_ID.tourbal;
  const aero = ballAero(ball, stats, fx);
  const L = computeLaunch({ clubId: 'DR', power: 1, stats, fx, ball, gear: gearFor(bag, 'DR'), lie: 'tee', noRandom: true, heading: 0 });
  const st = launchState(0, L);
  const r = simulate({ pos: { x: 0, y: 0.03, z: 0 }, vel: st.vel, spin: st.spin, env: flatEnv({ firmness: 0.55 }), ball: aero, maxTime: 20 });
  driveCache.set(key, r.total);
  return r.total;
}

function pickField(kind, seed, excludeId) {
  const pros = generatePros().slice(0, 260).filter((p) => p.id !== excludeId);
  const rng = new RNG(mixSeed(seed, 'field', kind));
  const key = { ctp: (p) => p.stats.irons * 0.7 + p.stats.accuracy * 0.3, drive: (p) => p.stats.power, putt: (p) => p.stats.putting, target: (p) => p.ovr }[kind];
  // a mixed field: a couple of specialists and a spread of everyone else
  const pool = pros.map((p) => ({ p, k: key(p) + rng.float(0, 34) })).sort((a, b) => b.k - a.k).slice(0, 70);
  rng.shuffle(pool);
  return pool.slice(0, 7).map((x) => x.p);
}

// Pre-simulated scores for the field. Lower is better for ctp; higher for the rest.
function simField(kind, pros, ctx) {
  const rng = new RNG(mixSeed(ctx.seed, 'sim', kind));
  return pros.map((p) => {
    const s = p.stats;
    if (kind === 'ctp') {
      const m = ctx.yards * YD;
      const sigma = 1.3 * m * clamp(0.072 - (s.irons - 60) * 0.0008 - (s.accuracy - 60) * 0.00025, 0.03, 0.09) * (1 + ctx.windMph / 45);
      const shots = [];
      for (let i = 0; i < 3; i++) {
        if (rng.chance(1 / 2600)) { shots.push(0); continue; }
        if (ctx.water && rng.chance(0.04)) { shots.push(Infinity); continue; }
        shots.push(Math.max(0.2, rayleigh(rng, sigma)));
      }
      return { id: p.id, name: p.name, score: Math.min(...shots), shots };
    }
    if (kind === 'drive') {
      const base = driveTotal(s, p.traits, p.ball, p.bag) * 0.98;
      const hit = clamp(0.36 + (s.accuracy - 55) * 0.008 + (p.traits.includes('fairway') ? 0.1 : 0) - (p.traits.includes('wild') ? 0.12 : 0), 0.2, 0.8);
      const shots = [];
      for (let i = 0; i < 6; i++) shots.push(rng.chance(hit) ? base * (1 + rng.gauss(0, 0.025)) + rng.gauss(0, 5) : 0);
      return { id: p.id, name: p.name, score: Math.max(...shots), shots };
    }
    if (kind === 'putt') {
      const make = [0.9, 0.66, 0.42, 0.23, 0.12, 0.07];
      const k = clamp(0.5 + (s.putting - 55) * 0.011, 0.4, 1.05);
      let pts = 0;
      const shots = [];
      make.forEach((mk, i) => {
        const r = rng.next();
        if (r < mk * k) { pts += PUTT_PTS[i]; shots.push('in'); }
        else if (rng.chance(clamp(0.95 - i * 0.1 + (s.putting - 60) * 0.006, 0.3, 0.97))) { pts += 1; shots.push('close'); }
        else shots.push('miss');
      });
      return { id: p.id, name: p.name, score: pts, shots };
    }
    // target
    let pts = 0;
    const shots = [];
    for (let i = 0; i < 10; i++) {
      const t = TARGETS[rng.weighted([0, 1, 2, 3, 4], (j) => [1, 1.4, 1.6, 1.5, 1.3][j])];
      const sigma = 1.45 * t.yd * YD * clamp(0.075 - (s.irons - 60) * 0.0008 - (s.accuracy - 60) * 0.0003, 0.035, 0.1) * (1 + ctx.windMph / 45);
      const d = rayleigh(rng, sigma);
      const ring = RINGS.findIndex((r) => d <= r);
      const got = ring >= 0 ? RING_PTS[ring] * t.mult : 0;
      pts += got;
      shots.push(got);
    }
    return { id: p.id, name: p.name, score: pts, shots };
  });
}

// ------------------------------------------------------------ the mode
export class MiniGame {
  constructor(kind, { course, golfer, seed, units = 'yards', cond }) {
    this.kind = kind;
    this.meta = GAMES[kind];
    this.baseCourse = course;
    this.course = kind === 'range' || kind === 'target' ? rangeCourse(course) : course;
    this.holeIndex = kind === 'range' || kind === 'target' ? 0 : holeFor(kind, course);
    this.golfer = golfer;
    this.seed = seed;
    this.units = units;
    this.cond = cond;
    this.flyover = kind === 'ctp' || kind === 'drive';
    // stand back and up on the range so the targets are easy to see
    this.cam = kind === 'range' || kind === 'target' ? { back: 7, up: 3.6, side: 0.4 } : null;
    this.holeOpts = kind === 'range' || kind === 'target' ? { range: true } : {};
    this.attempt = 0;
    this.maxAttempts = { range: Infinity, ctp: 3, drive: 6, putt: PUTT_STATIONS.length, target: 10 }[kind];
    this.shots = [];
    this.score = kind === 'ctp' ? Infinity : 0;
    this.best = null;
    this.clubLog = {}; // range: club -> [carry...]
    this.offLog = {}; // range: club -> [metres offline...]
    this.last = null;
    this.targetIdx = 1;
    this.field = [];
    this.done = false;
  }

  // Build the scoring field once the hole is known
  setupField(round) {
    if (this.kind === 'range') return;
    const hole = round.hole;
    const pros = pickField(this.kind, this.seed, this.golfer.proId);
    this.field = simField(this.kind, pros, { seed: this.seed, yards: hole.yards, windMph: round.wind.mph, water: hole.waters.length > 0 });
  }

  fmt(m, small = true) { return fmt(this.units, m, small); }

  // ---------------- hooks called by the round ----------------
  onHoleLoaded(round) {
    const hole = round.hole;
    const hs = round.world.holeScene;
    const add = (o) => { if (o) hs.group.add(o); };
    round.world.markers.reset();
    if (this.kind === 'range' || this.kind === 'target') {
      hs.setFlagVisible(false);
      const list = this.kind === 'target' ? TARGETS : RANGE_GREENS;
      this.targets = list.map((t, i) => {
        const p = hole.pointAtS(t.yd * YD);
        const r = { x: Math.cos(p.heading), z: Math.sin(p.heading) };
        const x = p.x + r.x * t.lat, z = p.z + r.z * t.lat;
        return { ...t, i, x, z, y: hole.heightAt(x, z) };
      });
      for (const t of this.targets) add(buildTarget(hole, t, { rings: this.kind === 'target' ? RINGS : [2.5, 5, 7.5], units: this.units, scoring: this.kind === 'target' }));
      add(buildRangeBay(hole, hole.teeSpot()));
      add(buildDistanceBoards(hole, [50, 100, 150, 200, 250, 300], { units: this.units, sideOff: 36 }));
    } else if (this.kind === 'drive') {
      add(buildDistanceBoards(hole, [250, 275, 300, 325, 350], { units: this.units }));
    } else if (this.kind === 'putt') {
      this.stations = this.findStations(hole);
      add(buildStationDiscs(hole, this.stations));
    }
    this.setupField(round);
  }

  startPos(round) {
    if (this.kind === 'putt') return this.stationPos(round.hole, 0);
    return null;
  }

  stationPos(hole, i) {
    const s = this.stations[i];
    return { x: s.x, y: hole.heightAt(s.x, s.z), z: s.z };
  }

  findStations(hole) {
    const pin = hole.pin;
    const out = [];
    const base = hole.finalHeading + Math.PI;
    PUTT_STATIONS.forEach((d, i) => {
      let best = null;
      for (let k = 0; k < 36; k++) {
        const a = base + (i * 2.1) + k * 0.35;
        const x = pin.x + Math.sin(a) * d, z = pin.z - Math.cos(a) * d;
        if (hole.surfaceAt(x, z) !== 'green') continue;
        const f = hole.fields(x, z);
        if (f.dG > -0.6) continue;
        best = { x, z, d };
        break;
      }
      if (!best) {
        // fall back toward the middle of the green
        const g = hole.green;
        const dx = g.x - pin.x, dz = g.z - pin.z;
        const l = Math.hypot(dx, dz) || 1;
        best = { x: pin.x + (dx / l) * Math.min(d, l * 1.6), z: pin.z + (dz / l) * Math.min(d, l * 1.6), d };
      }
      out.push(best);
    });
    return out;
  }

  // The aim point for the caddie (target challenge: the target that suits the club)
  aimPoint(round) {
    if (this.kind === 'target' && this.targets) {
      const t = this.targets[this.targetIdx] || this.targets[0];
      return { x: t.x, z: t.z };
    }
    if (this.kind === 'drive') {
      // straight down the fairway, as far as it goes
      const s = Math.min(round.hole.length - 20, 290);
      const p = round.hole.pointAtS(s);
      return { x: p.x, z: p.z };
    }
    return null;
  }

  // What the distance box measures to (a target instead of the far pin)
  distTarget(round) {
    if (!this.targets || round.putting) return null;
    if (this.kind === 'target') {
      const t = this.targets[this.targetIdx];
      return { x: t.x, z: t.z, y: t.y, label: `to the ${t.yd}` };
    }
    // range: the target green nearest to where this club lands
    const land = round.pred ? round.pred.land : null;
    let best = this.targets[0], bd = Infinity;
    for (const t of this.targets) {
      const d = land ? Math.hypot(t.x - land.x, t.z - land.z) : Math.abs(Math.hypot(t.x, t.z) - 100);
      if (d < bd) { bd = d; best = t; }
    }
    return { x: best.x, z: best.z, y: best.y, label: `to the ${best.yd} flag` };
  }

  // Club for the shot (target challenge: the club for the chosen target)
  prepare(round) {
    if (this.kind === 'drive' && round.lie === 'tee') round.club = 'DR';
    // a club test drive keeps the club you're trying in your hands
    if (this.kind === 'range' && this.keepClub) round.club = this.keepClub;
    if (this.kind === 'target' && this.targets) {
      const t = this.targets[this.targetIdx];
      const d = Math.hypot(t.x - round.ballPos.x, t.z - round.ballPos.z);
      round.club = suggestClub(round.table, d * 0.99, 'tee', true).clubId;
    }
  }

  pickTarget(round, i) {
    if (this.kind !== 'target' || round.phase !== 'aim') return;
    this.targetIdx = clamp(i, 0, this.targets.length - 1);
    round.aimManual = false;
    const t = this.targets[this.targetIdx];
    const d = Math.hypot(t.x - round.ballPos.x, t.z - round.ballPos.z);
    this.picking = true;
    round.setClub(suggestClub(round.table, d * 0.99, 'tee', true).clubId);
    this.picking = false;
    round.hud.setMode(this.hud(round));
  }

  // After changing clubs on the target range, aim at the matching target
  onClubChange(round) {
    if (this.kind === 'range' && this.keepClub) this.keepClub = round.club;
    if (this.kind !== 'target' || !this.targets || round.aimManual || this.picking) return;
    const carry = round.table[round.club] ? round.table[round.club].carry : 100;
    let best = 0;
    this.targets.forEach((t, i) => {
      const d = Math.hypot(t.x - round.ballPos.x, t.z - round.ballPos.z);
      if (Math.abs(d - carry) < Math.abs(Math.hypot(this.targets[best].x - round.ballPos.x, this.targets[best].z - round.ballPos.z) - carry)) best = i;
    });
    this.targetIdx = best;
  }

  // ---------------- after every shot ----------------
  shotDone(round, fl) {
    const res = fl.res;
    const hole = round.hole;
    const markers = round.world.markers;
    const hud = round.hud;
    this.attempt++;
    const n = this.attempt;
    const start = fl.start;
    const rest = res.rest;
    const outcome = res.outcome;
    const lost = outcome === 'water' || outcome === 'ob';
    let restPos = rest ? { x: rest.x, y: hole.heightAt(rest.x, rest.z), z: rest.z } : null;
    let pause = 2.2;
    if (this.kind === 'range') {
      const carry = res.carry, total = res.total;
      (this.clubLog[round.club] || (this.clubLog[round.club] = [])).push(carry);
      if (rest) {
        // how far from the straight line down the range it finished
        const h = round.hole.teeHeading;
        const off = Math.abs((rest.x - start.x) * Math.cos(h) + (rest.z - start.z) * Math.sin(h));
        (this.offLog[round.club] || (this.offLog[round.club] = [])).push(lost ? 40 : off);
      }
      this.last = { club: round.club, carry, total, lost };
      if (!lost && restPos) markers.add(restPos.x, restPos.y, restPos.z, { label: this.fmt(total, false), color: '#ffffff', fade: 14 });
      if (round.club === 'DR' && !lost && (!this.best || total > this.best)) this.best = total;
      hud.message(lost ? (outcome === 'water' ? 'In the water' : 'Out of bounds') : `${this.fmt(carry, false)} carry`, lost ? '' : `${this.fmt(total, false)} total`, 'neutral');
      pause = 1.3;
    } else if (this.kind === 'ctp') {
      let d = Infinity;
      if (outcome === 'holed') {
        d = 0;
        round.world.ball.setVisible(false);
        sfx.cup();
        sfx.applause(1.6);
        round.world.cheer(1.6);
        round.world.celebrate(hole.pin);
        hud.message('HOLE IN ONE!', 'You win Closest to the Pin', 'good');
        round.reactionShot('arms');
        pause = 4.5;
      } else if (lost) {
        hud.message(outcome === 'water' ? 'In the water' : 'Out of bounds', 'No score for this ball', 'bad');
        sfx.groan();
      } else {
        d = hole.distToPin(rest.x, rest.z);
        const onGreen = hole.surfaceAt(rest.x, rest.z) === 'green';
        const better = d < this.score;
        markers.add(restPos.x, restPos.y, restPos.z, { label: this.fmt(d), color: better ? '#f2c230' : '#ffffff' });
        hud.message(better ? (this.score === Infinity ? 'On the board' : 'New leader!') : 'Not closer', `${this.fmt(d)} from the pin${onGreen ? '' : ' (off the green)'}`, better ? 'good' : 'neutral');
        if (d < 1.5) { sfx.applause(0.9); round.world.cheer(0.8); } else if (d < 4) sfx.applause(0.4);
      }
      this.shots.push(d);
      this.score = Math.min(this.score, d);
      if (d === 0) this.maxAttempts = n; // an ace ends it
    } else if (this.kind === 'drive') {
      const surf = rest ? hole.surfaceAt(rest.x, rest.z) : null;
      const inGrid = !lost && (surf === 'fairway' || surf === 'first');
      const dist = rest ? Math.hypot(rest.x - start.x, rest.z - start.z) : 0;
      const counted = inGrid ? dist : 0;
      const better = counted > this.score;
      this.shots.push(counted);
      if (restPos) markers.add(restPos.x, restPos.y, restPos.z, { label: inGrid ? this.fmt(dist, false) : 'Out', color: better ? '#f2c230' : inGrid ? '#ffffff' : '#ff8a80', flag: better });
      if (better) { this.score = counted; markers.setLeader(markers.items.length - 1); }
      if (inGrid) { hud.message(better ? 'New leader!' : 'In the grid', `${this.fmt(dist, false)}`, better ? 'good' : 'neutral'); if (better) sfx.applause(0.7); }
      else { hud.message(lost ? (outcome === 'water' ? 'In the water' : 'Out of bounds') : 'Missed the grid', 'Only balls in the fairway count', 'bad'); sfx.groan(); }
    } else if (this.kind === 'putt') {
      let pts = 0, what;
      const target = this.stations[n - 1];
      if (outcome === 'holed') {
        pts = PUTT_PTS[n - 1];
        what = 'in';
        round.world.ball.setVisible(false);
        sfx.cup();
        sfx.applause(0.5 + n * 0.15);
        hud.message(`Holed! +${pts}`, `From ${this.fmt(target.d)}`, 'good');
      } else {
        const d = rest ? hole.distToPin(rest.x, rest.z) : 99;
        if (d < 0.9) { pts = 1; what = 'close'; hud.message('Good lag +1', `${this.fmt(d)} away`, 'neutral'); }
        else { what = 'miss'; hud.message(res.events.some((e) => e.type === 'lip') ? 'Lipped out!' : 'Missed', `${this.fmt(d)} away`, 'bad'); if (res.events.some((e) => e.type === 'lip')) sfx.groan(); }
        if (restPos) markers.add(restPos.x, restPos.y, restPos.z, { label: pts ? '+1' : '0', color: pts ? '#b5f08f' : '#ffffff', fade: 3 });
      }
      this.shots.push(what);
      this.score += pts;
      pause = 1.8;
    } else if (this.kind === 'target') {
      let got = 0, hitT = null;
      if (!lost && rest) {
        let bestD = Infinity;
        for (const t of this.targets) {
          const d = Math.hypot(rest.x - t.x, rest.z - t.z);
          if (d < bestD) { bestD = d; hitT = t; }
        }
        const ring = RINGS.findIndex((r) => bestD <= r);
        if (ring >= 0) got = RING_PTS[ring] * hitT.mult;
        const label = ring === 0 ? 'BULLSEYE' : ring === 1 ? 'Ring' : ring === 2 ? 'Outer' : '';
        markers.add(restPos.x, restPos.y, restPos.z, { label: got ? `+${got}` : '0', color: got ? hitT.color : '#ffffff' });
        if (got) {
          hud.message(`${label} +${got}`, hitT.mult > 1 ? `${hitT.yd}-yard target ×${hitT.mult}` : `${hitT.yd}-yard target`, 'good');
          if (ring === 0) { sfx.applause(1); round.world.cheer(1); round.world.celebrate({ x: hitT.x, y: hitT.y, z: hitT.z }, hitT.color); } else sfx.applause(0.35);
        } else hud.message('No points', `${this.fmt(bestD)} from the ${hitT.yd}-yard target`, 'neutral');
      } else hud.message(outcome === 'water' ? 'In the water' : 'Out of bounds', 'No points', 'bad');
      this.shots.push(got);
      this.score += got;
    }
    round.hud.updateBoard();
    // next ball, or finished
    if (n >= this.maxAttempts) {
      this.done = true;
      round.modeEnd(pause + 0.8);
      return;
    }
    let next;
    if (this.kind === 'putt') next = this.stationPos(hole, n);
    else next = hole.teeSpot();
    round.modeNext(next, pause);
  }

  // ---------------- HUD ----------------
  hud(round) {
    const k = this.kind;
    const lines = [];
    const chips = [];
    let title = this.meta.name;
    if (k === 'range') {
      const l = this.last;
      lines.push(l ? `Last: ${l.club} · ${this.fmt(l.carry, false)} carry · ${this.fmt(l.total, false)} total` : 'Pick any club and fire away');
      const avg = Object.entries(this.clubLog).map(([c, arr]) => `${c} ${this.fmt(arr.reduce((a, b) => a + b, 0) / arr.length, false)}`).slice(-4);
      if (avg.length) lines.push(`Avg carry: ${avg.join(' · ')}`);
      if (this.best) lines.push(`Longest drive: ${this.fmt(this.best, false)}`);
      return { title, sub: `Ball ${this.attempt + 1}`, lines, buttons: [{ h: 'modeQuit', label: 'Leave range' }] };
    }
    const ball = Math.min(this.attempt + 1, this.maxAttempts);
    const sub = k === 'putt' ? `Putt ${ball} of ${this.maxAttempts} · ${this.fmt(PUTT_STATIONS[ball - 1])}` : `Ball ${ball} of ${this.maxAttempts}`;
    if (k === 'ctp') lines.push(`Your best: ${this.score === Infinity ? '—' : this.score === 0 ? 'ACE!' : this.fmt(this.score)}`);
    if (k === 'drive') lines.push(`Your best: ${this.score ? this.fmt(this.score, false) : '—'}`);
    if (k === 'putt' || k === 'target') lines.push(`Points: ${this.score}`);
    const lead = this.board()[0];
    if (lead && !lead.you) lines.push(`To beat: ${lead.name.split(' ').slice(-1)[0]} ${lead.text}`);
    if (k === 'target' && this.targets) {
      this.targets.forEach((t, i) => chips.push({ h: 'modeTarget', i, label: `${t.yd}${t.mult > 1 ? ` ×${t.mult}` : ''}`, on: i === this.targetIdx, color: t.color }));
    }
    return { title, sub, lines, chips };
  }

  scoreText(v) {
    if (this.kind === 'ctp') return v === Infinity ? 'No score' : v === 0 ? 'ACE' : this.fmt(v);
    if (this.kind === 'drive') return v ? this.fmt(v, false) : 'No score';
    return `${v} pts`;
  }

  // Standings: the field plus you
  board() {
    if (this.kind === 'range') return [];
    const rows = this.field.map((f) => ({ id: f.id, name: f.name, score: f.score, you: false }));
    rows.push({ id: 'you', name: this.golfer.name, score: this.score, you: true, partial: !this.done });
    const low = this.kind === 'ctp';
    rows.sort((a, b) => (low ? a.score - b.score : b.score - a.score) || (a.you ? -1 : b.you ? 1 : 0));
    let pos = 0, prev = null;
    rows.forEach((r, i) => {
      if (prev === null || r.score !== prev) pos = i + 1;
      prev = r.score;
      r.pos = pos;
      r.text = this.scoreText(r.score);
    });
    return rows;
  }

  result() {
    const rows = this.board();
    const me = rows.find((r) => r.you);
    return { kind: this.kind, name: this.meta.name, rows, pos: me ? me.pos : null, score: this.score, scoreText: this.scoreText(this.score), shots: this.shots, course: this.baseCourse, clubLog: this.clubLog, offLog: this.offLog, best: this.best, trial: this.trial || null };
  }
}

// Records kept across all play (best score per game)
export function betterScore(kind, a, b) {
  if (b == null) return true;
  if (kind === 'ctp') return a < b;
  return a > b;
}

export { proById };
