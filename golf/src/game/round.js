// Plays a round of golf: one hole at a time, shot by shot, through the real
// physics, with cameras, penalties, scoring and the HUD.
import * as THREE from '../../vendor/three.module.min.js';
import { HoleModel, YD } from '../sim/hole.js';
import { makeEnv, computeLaunch, launchState, computePutt, ballAero, slopeLie, predictShot } from '../sim/shot.js';
import { simulate, BALL_R, SURFACES } from '../sim/physics.js';
import { clubTable, suggestClub } from '../sim/caddie.js';
import { CLUBS, CLUB_BY_ID, BALL_BY_ID } from '../data/equipment.js';
import { traitEffects } from '../data/traits.js';
import { gearFor, normBag, MODEL_BY_ID } from '../data/clubsets.js';
import { RNG, mixSeed, clamp } from '../util/rng.js';
import { sfx, setWind, setAmbience } from '../audio.js';
import { simHole, courseProfile, effectiveStats } from '../sim/aisim.js';
import { ReplayDirector, rateShot } from './replay.js';
import { buildPrizeCar } from '../render/prizes.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const fwdOf = (h) => ({ x: Math.sin(h), z: -Math.cos(h) });
const rightOf = (h) => ({ x: Math.cos(h), z: Math.sin(h) });

export const SCORE_NAMES = { '-4': 'Condor', '-3': 'Albatross', '-2': 'Eagle', '-1': 'Birdie', 0: 'Par', 1: 'Bogey', 2: 'Double Bogey', 3: 'Triple Bogey' };
export function scoreName(strokes, par) {
  if (strokes === 1) return 'Hole in One';
  const d = strokes - par;
  return SCORE_NAMES[d] || (d > 0 ? `+${d}` : `${d}`);
}

export class RoundController {
  constructor(app, opts) {
    this.app = app;
    this.world = app.world;
    this.hud = app.hud;
    this.opts = opts;
    // a mini-game (or other special format) that decides what each shot means
    this.mode = opts.mode || null;
    this.course = opts.course;
    this.holeList = opts.holeList;
    this.golfer = opts.golfer;
    this.fx = traitEffects(this.golfer.traits || []);
    this.ball = BALL_BY_ID[this.golfer.ball] || BALL_BY_ID.tourbal;
    this.aero = ballAero(this.ball, this.golfer.stats, this.fx);
    this.cond = opts.cond;
    this.altitude = this.course.style === 'Mountain' ? 1500 : 0;
    this.rng = new RNG(mixSeed(Date.now() & 0xffffff, this.course.id));
    this.rand = () => this.rng.next();
    this.scores = opts.scores ? opts.scores.slice() : [];
    this.holeStats = [];
    this.pos = this.opts.startPos || 0; // index into holeList
    this.phase = 'idle';
    this.flight = null;
    this.aimManual = false;
    this.shape = { x: 0, y: 0 };
    this.viewMode = 'address';
    this.gridOn = false;
    this.fast = false;
    this.lastHoleRel = 0;
    this.destroyed = false;
    this.bag = normBag(this.golfer.bag);
    this.table = clubTable(this.golfer.stats, this.fx, this.ball, this.aero, 1.225 * Math.exp(-this.altitude / 8500), this.bag);
    // friends taking turns on one device
    this.party = opts.party || null;
    if (this.party) this.setupParty();
    else this.world.setGolfer({ ...this.golfer.look, gender: this.golfer.gender });
  }

  // ---------------- multiplayer ----------------
  setupParty() {
    const rho = 1.225 * Math.exp(-this.altitude / 8500);
    for (const p of this.party.players) {
      const g = p.golfer;
      const fx = traitEffects(g.traits || []);
      const ball = BALL_BY_ID[g.ball] || BALL_BY_ID.tourbal;
      const aero = ballAero(ball, g.stats, fx);
      const bag = normBag(g.bag);
      p.kit = { golfer: g, fx, ball, aero, bag, table: clubTable(g.stats, fx, ball, aero, rho, bag) };
      p.lastRel = 0;
    }
    this.world.clearGolfers();
    this.cur = 0;
    Object.assign(this, this.party.players[0].kit);
    this.scores = this.party.players[0].scores;
    this.holeStats = this.party.players[0].holeStats;
  }

  // Everything about the current player's ball on this hole
  saveState(p) {
    p.st = {
      ...p.st, ballPos: { ...this.ballPos }, prevPos: this.prevPos ? { ...this.prevPos } : null, lie: this.lie, plugged: this.plugged,
      strokes: this.strokes, putts: this.putts, penalties: this.penalties, hitFairway: this.hitFairway, girHit: this.girHit, dispMult: this.dispMult,
    };
  }

  loadState(p) {
    const s = p.st;
    this.ballPos = { ...s.ballPos };
    this.prevPos = s.prevPos ? { ...s.prevPos } : null;
    this.lie = s.lie;
    this.plugged = s.plugged;
    this.strokes = s.strokes;
    this.putts = s.putts;
    this.penalties = s.penalties;
    this.hitFairway = s.hitFairway;
    this.girHit = s.girHit;
    this.dispMult = s.dispMult ?? 1;
    this.scores = p.scores;
    this.holeStats = p.holeStats;
  }

  // Hand the round to player i: their golfer, clubs, ball and position
  switchTo(i) {
    const p = this.party.players[i];
    this.cur = i;
    Object.assign(this, p.kit);
    this.loadState(p);
    this.world.useGolfer(`party${i}`, { ...p.golfer.look, gender: p.golfer.gender }, p.name);
    this.hud.setPlayer(p, this.party, this.scoreToPar());
    this.showOtherBalls();
  }

  // The other players' balls, each labelled with its owner
  showOtherBalls() {
    const m = this.world.markers;
    m.reset();
    for (const p of this.party.players) {
      if (p.i === this.cur || !p.st || p.st.done || !p.st.strokes) continue;
      const b = p.st.ballPos;
      m.add(b.x, b.y, b.z, { label: p.name, color: p.color });
    }
  }

  // Whoever is away plays next
  nextTurn() {
    const party = this.party;
    this.saveState(party.players[this.cur]);
    const next = party.next((p) => this.hole.distToPin(p.st.ballPos.x, p.st.ballPos.z));
    if (next < 0) return;
    const changed = next !== this.cur;
    this.switchTo(next);
    const p = party.players[next];
    if (changed || p.st.strokes === 0) {
      const d = this.hole.distToPin(p.st.ballPos.x, p.st.ballPos.z);
      const sub = p.st.strokes === 0 ? (party.teed.size === 0 ? 'Has the honor' : 'On the tee') : `${this.fmtDist(d, true)} to the pin · shot ${p.st.strokes + 1}`;
      this.hud.turnBanner(p.name, p.color, sub);
    }
    this.prepareShot();
  }

  // What happens after a shot comes to rest: same player, or the next one
  resumePlay() {
    if (this.party) this.nextTurn();
    else this.prepareShot();
  }

  // ---------------- hole setup ----------------
  start() {
    this.loadHole();
  }

  get holeIndex() { return this.holeList[this.pos]; }

  windForHole(i) {
    const r = new RNG(mixSeed(this.cond.seed || 1, 'wind', i));
    const mph = Math.max(0, this.cond.windMph * (1 + r.float(-this.cond.gust, this.cond.gust)));
    const dir = this.cond.windDir + r.float(-0.25, 0.25);
    const ms = mph * 0.44704;
    return { mph, dir, vec: { x: Math.sin(dir) * ms, z: -Math.cos(dir) * ms } };
  }

  loadHole() {
    const i = this.holeIndex;
    this.hud.loading(`Walking to the ${ordinal(i + 1)} tee…`);
    // let the loading card paint before the heavy build
    setTimeout(() => {
      if (this.destroyed) return;
      try {
        this.buildHole(i);
      } catch (e) {
        this.hud.loaded();
        if (this.app.reportError) this.app.reportError(e);
        else throw e;
      }
    }, 30);
  }

  buildHole(i) {
    {
      this.hole = new HoleModel(this.course, i, { pinDay: this.cond.pinDay || 0, ...(this.opts.holeOpts || {}) });
      this.wind = this.windForHole(i);
      this.env = makeEnv(this.hole, { wind: this.wind.vec, firmness: this.cond.firm, stimp: this.cond.stimp, altitude: this.altitude });
      this.world.setConditions(this.cond, this.hole.style, this.hole.teeHeading);
      let board = null;
      if (this.opts.tournament && this.opts.leaderboardFn) {
        const lb = this.opts.leaderboardFn().slice(0, 6);
        board = { title: this.opts.tournament.name, rows: lb.map((r) => ({ name: r.human ? this.golfer.name : this.app.nameOf(r.id), toPar: r.toPar })) };
      }
      this.world.loadHole(this.hole, { crowd: !!this.opts.crowd, board });
      const car = this.opts.prizeCar;
      if (car && car.hole === i && !car.won) this.world.holeScene.group.add(buildPrizeCar(this.hole, car));
      this.world.wind = this.wind.vec;
      setWind(this.wind.mph);
      setAmbience({ rain: this.cond.weather === 'rain' ? (this.cond.rainLevel ?? 0.8) : 0, night: !!this.cond.night });
      this.strokes = 0;
      this.putts = 0;
      this.penalties = 0;
      this.hitFairway = null;
      this.girHit = false;
      const tee = this.hole.teeSpot();
      this.ballPos = { x: tee.x, y: tee.y, z: tee.z };
      this.prevPos = { ...this.ballPos, lie: 'tee' };
      this.lie = 'tee';
      this.plugged = false;
      this.hud.setHole(this.hole, this.course, this.strokes, this.scoreToPar());
      this.hud.buildMinimap(this.hole);
      this.hud.loaded();
      this.world.ball.setVisible(true);
      this.dispMult = 1;
      if (this.fx.hotHead && this.lastHoleRel > 0) this.dispMult *= 1.35;
      if (this.fx.slowStart && i < 3) this.dispMult *= 1.2;
      if (this.fx.lateFade > 0 && i >= 13) this.dispMult *= 1.15;
      if (this.party) {
        const party = this.party;
        party.startHole(i);
        for (const p of party.players) {
          const fx = p.kit.fx;
          let dm = 1;
          if (fx.hotHead && p.lastRel > 0) dm *= 1.35;
          if (fx.slowStart && i < 3) dm *= 1.2;
          if (fx.lateFade > 0 && i >= 13) dm *= 1.15;
          p.st = { ballPos: { ...this.ballPos }, prevPos: { ...this.ballPos, lie: 'tee' }, lie: 'tee', plugged: false, strokes: 0, putts: 0, penalties: 0, hitFairway: null, girHit: false, dispMult: dm, done: false };
        }
        const first = party.next(() => 0);
        this.switchTo(first);
        this.hud.setHole(this.hole, this.course, this.strokes, this.scoreToPar());
        this.hud.updateBoard();
        this.hud.turnBanner(party.players[first].name, party.players[first].color, i === this.holeList[0] ? 'Tees off first' : 'Has the honor');
        if (this.app.settings.flyover) this.startIntro(); else this.prepareShot(true);
        return;
      }
      if (this.mode) {
        this.mode.onHoleLoaded(this);
        const sp = this.mode.startPos(this);
        if (sp) { this.ballPos = { ...sp }; this.prevPos = { ...sp, lie: this.hole.surfaceAt(sp.x, sp.z) }; }
        this.hud.setMode(this.mode.hud(this));
        this.hud.updateBoard();
        if (this.app.settings.flyover && this.mode.flyover) this.startIntro(); else this.prepareShot(true);
        return;
      }
      // Pick up a saved hole in progress where the last shot finished
      const rs = this.opts.resume;
      if (rs && rs.hole === i && rs.ball) {
        this.opts.resume = null;
        this.strokes = rs.strokes || 0;
        this.putts = rs.putts || 0;
        this.penalties = rs.penalties || 0;
        this.hitFairway = rs.hitFairway ?? null;
        this.girHit = !!rs.girHit;
        this.plugged = !!rs.plugged;
        this.ballPos = { ...rs.ball };
        this.prevPos = rs.prev ? { ...rs.prev } : { ...this.ballPos, lie: this.hole.surfaceAt(rs.ball.x, rs.ball.z) };
        this.hud.setStrokes(this.strokes);
        this.hud.message('Welcome back', `Shot ${this.strokes + 1} on the ${ordinal(i + 1)}`, 'neutral');
        this.prepareShot(true);
        return;
      }
      if (this.app.settings.flyover) this.startIntro(); else this.prepareShot(true);
    }
  }

  // Everything needed to carry on this hole from where the ball lies now
  shotState() {
    return {
      hole: this.holeIndex, strokes: this.strokes, putts: this.putts, penalties: this.penalties,
      hitFairway: this.hitFairway, girHit: this.girHit, plugged: this.plugged,
      ball: { ...this.ballPos }, prev: this.prevPos ? { ...this.prevPos } : null,
    };
  }

  startIntro() {
    this.phase = 'intro';
    const h = this.hole;
    const pts = [];
    const L = h.length;
    for (let k = 0; k <= 6; k++) {
      const s = (k / 6) * L;
      const p = h.pointAtS(s);
      pts.push(p);
    }
    this.intro = { t: 0, dur: 4.2, pts };
    this.hud.showIntro(this.hole, this.course, this.wind);
    const p0 = h.pointAtS(0);
    const f = fwdOf(h.teeHeading);
    this.world.setCamera(V(p0.x - f.x * 40, h.teeY + 45, p0.z - f.z * 40), V(p0.x + f.x * 120, h.teeY, p0.z + f.z * 120), 55, 50);
    this.world.snapCamera();
  }

  skipIntro() {
    if (this.phase !== 'intro') return;
    this.hud.hideIntro();
    this.prepareShot(true);
  }

  // ---------------- per shot ----------------
  scoreToPar() {
    let s = 0, p = 0;
    for (let k = 0; k < this.scores.length; k++) {
      if (this.scores[k] == null) continue;
      s += this.scores[k];
      p += this.course.holes[k].par;
    }
    return s - p;
  }

  isPuttLie(lie) {
    return lie === 'green';
  }

  prepareShot(snap = false) {
    if (this.destroyed) return;
    const h = this.hole;
    const b = this.ballPos;
    this.lie = h.surfaceAt(b.x, b.z);
    const dist = h.distToPin(b.x, b.z);
    this.distToPin = dist;
    this.putting = this.isPuttLie(this.lie) || (this.lie === 'fringe' && dist < 12 && !this.forceClub);
    this.aimManual = false;
    this.shape = { x: 0, y: 0 };
    this.hud.setShape(this.shape);
    if (this.putting) {
      this.club = 'PT';
      const opts = [3, 6, 10, 16, 25, 40];
      this.puttScale = opts.find((o) => o >= dist * 1.3 + 0.8) || 40;
    } else {
      const sug = this.suggest();
      this.club = sug.clubId;
    }
    this.forceClub = false;
    if (this.mode && this.mode.prepare) this.mode.prepare(this);
    this.aimDefault();
    this.phase = 'aim';
    this.viewMode = 'address';
    this.world.ball.setVisible(true);
    this.world.aim.setVisible(!this.putting);
    this.world.grid.setVisible(this.putting && this.gridOn);
    this.hud.setPutting(this.putting);
    this.updateGolfer();
    this.updatePrediction();
    this.addressCamera();
    if (snap) this.world.snapCamera();
    this.hud.setShot(this.shotInfo());
    this.hud.setLie(this.lieInfo());
    this.hud.setStrokes(this.strokes);
    this.hud.showSwingHint(true);
    if (this.mode) this.hud.setMode(this.mode.hud(this));
    if (this.strokes > 0 && this.opts.onShotState) this.opts.onShotState(this.shotState());
  }

  suggest() {
    const h = this.hole;
    const b = this.ballPos;
    const dist = this.distToPin;
    const onTee = this.lie === 'tee';
    let want = dist;
    if (onTee && h.par > 3) want = this.table.DR.carry;
    // Short shots: land it short and let it release
    if (!onTee || h.par === 3) want = dist < 60 ? dist * 0.85 : dist * 0.96 - 2;
    const lieSpeed = { rough: 0.9, deep: 0.7, fescue: 0.7, heather: 0.7, bunker: dist < 55 ? 0.72 : 0.88, first: 0.98 }[this.lie] || 1;
    return suggestClub(this.table, want / Math.pow(lieSpeed, 1.6), this.lie, onTee && h.par > 3);
  }

  aimDefault() {
    const h = this.hole;
    const b = this.ballPos;
    let target;
    const mt = this.mode && this.mode.aimPoint ? this.mode.aimPoint(this) : null;
    if (mt) target = mt;
    else if (this.putting) target = h.pin;
    else {
      const carry = this.table[this.club] ? this.table[this.club].carry : 100;
      target = h.suggestAim(b.x, b.z, carry);
    }
    this.heading = Math.atan2(target.x - b.x, -(target.z - b.z));
  }

  setClub(id) {
    if (this.phase !== 'aim') return;
    if (this.putting && id !== 'PT') {
      // chipping from the fringe: allow wedges
      if (this.lie === 'green') return;
      this.putting = false;
      this.hud.setPutting(false);
      this.world.aim.setVisible(true);
    }
    if (id === 'PT') {
      if (!['green', 'fringe', 'fairway', 'first'].includes(this.lie)) return;
      this.putting = true;
      const opts = [3, 6, 10, 16, 25, 40];
      this.puttScale = opts.find((o) => o >= this.distToPin * 1.3 + 0.8) || 40;
      this.hud.setPutting(true);
      this.world.aim.setVisible(false);
    }
    if (id === 'DR' && this.lie !== 'tee') {
      // driver off the deck is allowed (with a penalty in the launch model)
    }
    this.club = id;
    if (this.mode && this.mode.onClubChange) this.mode.onClubChange(this);
    if (!this.aimManual) this.aimDefault();
    this.updateGolfer();
    this.updatePrediction();
    this.addressCamera();
    this.hud.setShot(this.shotInfo());
  }

  cycleClub(dir) {
    const ids = CLUBS.map((c) => c.id);
    let i = ids.indexOf(this.club);
    for (let k = 0; k < ids.length; k++) {
      i = (i + dir + ids.length) % ids.length;
      const id = ids[i];
      if (id === 'PT' && !['green', 'fringe', 'fairway', 'first'].includes(this.lie)) continue;
      if (id !== 'PT' && this.lie === 'green') continue;
      if (id === 'DR' && ['bunker', 'deep', 'fescue', 'heather'].includes(this.lie)) continue;
      this.setClub(id);
      return;
    }
  }

  cyclePuttScale(dir) {
    const opts = [3, 6, 10, 16, 25, 40];
    const i = clamp(opts.indexOf(this.puttScale) + dir, 0, opts.length - 1);
    this.puttScale = opts[i];
    this.updatePrediction();
    this.hud.setShot(this.shotInfo());
  }

  nudgeAim(rad) {
    if (this.phase !== 'aim') return;
    this.heading += rad;
    this.aimManual = true;
    this.updateGolfer();
    this.updatePrediction();
    this.addressCamera(true);
  }

  aimAt(x, z) {
    if (this.phase !== 'aim') return;
    const b = this.ballPos;
    this.heading = Math.atan2(x - b.x, -(z - b.z));
    this.aimManual = true;
    this.updateGolfer();
    this.updatePrediction();
    this.addressCamera(true);
  }

  setShape(s) {
    this.shape = { x: clamp(s.x, -1, 1), y: clamp(s.y, -1, 1) };
    this.hud.setShape(this.shape);
    this.updatePrediction();
  }

  updateGolfer() {
    const g = this.world.golfer;
    const c = CLUB_BY_ID[this.club];
    g.setClub(c.kind, c.length, gearFor(this.bag, this.club).look);
    g.placeAt(this.ballPos, this.heading);
    g.address();
    const cad = this.world.caddie;
    if (cad) { cad.group.visible = true; cad.place(this.ballPos, this.heading, this.putting, (x, z) => this.hole.heightAt(x, z)); }
  }

  shotInput(power) {
    const b = this.ballPos;
    return {
      clubId: this.club, power, stats: this.golfer.stats, fx: this.fx, ball: this.ball, aero: this.aero, gear: gearFor(this.bag, this.club),
      lie: this.lie, plugged: this.plugged, slope: slopeLie(this.hole, b.x, b.z, this.heading),
      distToPin: this.distToPin, shape: this.shape,
    };
  }

  // Aim ring / flight preview at a given power (default full)
  updatePrediction(power = 1) {
    const w = this.world;
    const b = this.ballPos;
    if (this.putting) {
      this.updatePuttPreview(power);
      return;
    }
    w.puttLine.clear();
    const r = predictShot(this.hole, this.env, b, this.heading, this.shotInput(power));
    this.pred = r;
    const land = r.land;
    const n = this.hole.normalAt(land.x, land.z);
    const dist = Math.hypot(land.x - b.x, land.z - b.z);
    w.aim.set({ x: land.x, y: this.hole.heightAt(land.x, land.z), z: land.z }, n, clamp(dist / 90, 0.6, 2.2));
    // Wind-adjusted ring for golfers with elite wind reading
    const windRead = this.golfer.stats.wind >= 80 || this.fx.wind < 0.8;
    if (windRead && this.wind.mph > 2) {
      const rw = predictShot(this.hole, this.env, b, this.heading, this.shotInput(power), true);
      w.aim.setWind({ x: rw.land.x, y: this.hole.heightAt(rw.land.x, rw.land.z), z: rw.land.z }, clamp(dist / 90, 0.6, 2.2), true);
    } else w.aim.setWind(null, 1, false);
    // dotted flight preview (only if aim help is on)
    if (this.app.settings.aimHelp) {
      const pts = [];
      const S = r.samples;
      for (let i = 0; i < S.length; i += 5 * 6) {
        if (S[i + 4] > 0) break;
        // skip the first few meters so dots never balloon in front of the camera
        if (Math.hypot(S[i + 1] - b.x, S[i + 3] - b.z) < 12) continue;
        pts.push({ x: S[i + 1], y: S[i + 2], z: S[i + 3] });
      }
      w.preview.set(pts);
    } else w.preview.clear();
    this.predCarry = r.carry;
    this.predTotal = r.total;
  }

  puttPreviewFrac() {
    const p = this.golfer.stats.putting;
    return clamp((0.22 + (p - 50) * 0.011) * this.fx.puttPreview * gearFor(this.bag, 'PT').read, 0.12, 0.92);
  }

  updatePuttPreview(power) {
    const w = this.world;
    w.preview.clear();
    const b = this.ballPos;
    const dist = this.distToPin;
    // At rest, preview the pace that would roll to the hole; while dragging, the actual pace
    const pw = this.dragging ? power : Math.min(1, (dist + 0.35) / this.puttScale);
    const pt = computePutt({ power: pw, scale: this.puttScale, stimp: this.cond.stimp, heading: this.heading, stats: this.golfer.stats, fx: this.fx, ball: this.ball, gear: gearFor(this.bag, 'PT'), devDeg: 0, noRandom: true, distToPin: dist });
    const r = simulate({ pos: { x: b.x, y: b.y + BALL_R, z: b.z }, vel: pt.vel, rolling: true, env: { ...this.env, cup: null }, maxTime: 20 });
    const S = r.samples;
    const pts = [];
    let travelled = 0;
    let last = null;
    const limit = r.total * this.puttPreviewFrac();
    for (let i = 0; i < S.length; i += 5 * 2) {
      const p = { x: S[i + 1], y: S[i + 2] + 0.01, z: S[i + 3] };
      if (last) travelled += Math.hypot(p.x - last.x, p.z - last.z);
      if (travelled > limit) break;
      if (!last || Math.hypot(p.x - last.x, p.z - last.z) > 0.12 || i === 0) { pts.push(p); last = p; }
    }
    w.puttLine.set(pts);
    this.predTotal = r.total;
  }

  addressCamera(fast = false) {
    const b = this.ballPos;
    const f = fwdOf(this.heading), r = rightOf(this.heading);
    const w = this.world;
    const gy = this.hole.heightAt(b.x, b.z);
    if (this.viewMode === 'overhead') {
      const tgt = this.putting ? this.hole.pin : (this.pred ? this.pred.land : this.hole.pin);
      const mx = (b.x + tgt.x) / 2, mz = (b.z + tgt.z) / 2;
      const d = Math.hypot(tgt.x - b.x, tgt.z - b.z);
      const hgt = clamp(d * 0.9, 18, 260);
      w.setCamera(V(mx - f.x * d * 0.25, gy + hgt, mz - f.z * d * 0.25), V(mx + f.x * d * 0.1, gy, mz + f.z * d * 0.1), 50, fast ? 8 : 3);
    } else if (this.viewMode === 'target') {
      const tgt = this.putting ? this.hole.pin : (this.pred ? this.pred.land : this.hole.pin);
      const ty = this.hole.heightAt(tgt.x, tgt.z);
      w.setCamera(V(tgt.x + f.x * 14 + r.x * 6, ty + 6, tgt.z + f.z * 14 + r.z * 6), V(tgt.x - f.x * 10, ty, tgt.z - f.z * 10), 50, fast ? 8 : 3);
    } else if (this.putting) {
      const pin = this.hole.pin;
      const d = this.distToPin;
      // behind the ball and a little to the right, clear of the golfer
      const back = clamp(2.2 + d * 0.12, 2.7, 5);
      w.setCamera(V(b.x - f.x * back + r.x * 0.55, gy + clamp(1.2 + d * 0.06, 1.35, 2.8), b.z - f.z * back + r.z * 0.55), V(b.x + f.x * Math.min(d, 12) * 0.7, (gy + pin.y) / 2, b.z + f.z * Math.min(d, 12) * 0.7), 46, fast ? 10 : 3.5);
    } else {
      const land = this.pred ? this.pred.land : { x: b.x + f.x * 100, z: b.z + f.z * 100 };
      const ld = Math.hypot(land.x - b.x, land.z - b.z);
      const ly = this.hole.heightAt(land.x, land.z);
      const lookD = Math.min(ld, 90);
      const lookY = gy + (ly - gy) * (lookD / Math.max(1, ld)) + 1.2;
      // On a tall phone screen stand a little further back and closer to the
      // golfer's side so both the golfer and the target line fit
      const tall = w.camera.aspect < 0.8;
      // a short landscape phone: tilt down a little so the ball clears the HUD
      const short = !tall && window.innerHeight < 540;
      const mc = this.mode && this.mode.cam;
      const back = mc ? mc.back + (tall ? 1.5 : 0) : tall ? 5 : 3.7, side = mc ? mc.side : tall ? -0.2 : 0.55;
      const up = mc ? mc.up + (tall ? 0.5 : 0) : tall ? 2.1 : 1.75;
      w.setCamera(V(b.x - f.x * back + r.x * side, gy + up, b.z - f.z * back + r.z * side), V(b.x + f.x * lookD, lookY - (short ? 0.12 * lookD : 0), b.z + f.z * lookD), short ? 54 : 50, fast ? 10 : 3.5);
    }
    w.focus.set(b.x, gy, b.z);
  }

  toggleView() {
    if (this.phase !== 'aim') return;
    this.viewMode = this.viewMode === 'address' ? 'overhead' : this.viewMode === 'overhead' ? 'target' : 'address';
    this.addressCamera();
    this.hud.setView(this.viewMode);
  }

  toggleGrid() {
    this.gridOn = !this.gridOn;
    this.world.grid.setVisible(this.putting && this.gridOn);
    this.hud.setGrid(this.gridOn);
  }

  lieInfo() {
    const b = this.ballPos;
    const s = SURFACES[this.lie];
    const sl = slopeLie(this.hole, b.x, b.z, this.heading);
    const pct = { tee: '100%', fairway: '100%', fringe: '95-100%', green: '', first: '95-100%', rough: '80-90%', deep: '60-75%', fescue: '60-75%', heather: '60-75%', waste: '90-95%', path: '100%', bunker: this.distToPin < 55 ? '55-70%' : '85-90%' }[this.lie] || '';
    const notes = [];
    if (Math.abs(sl.uphillDeg) > 1.2) notes.push(`${sl.uphillDeg > 0 ? 'Uphill' : 'Downhill'} ${Math.abs(sl.uphillDeg).toFixed(0)}°`);
    if (Math.abs(sl.sideDeg) > 1.2) notes.push(sl.sideDeg > 0 ? 'Ball above feet' : 'Ball below feet');
    if (this.plugged) notes.push('Plugged');
    return { name: s ? s.label : this.lie, pct, notes, lie: this.lie };
  }

  shotInfo() {
    const b = this.ballPos;
    const h = this.hole;
    const mt = this.mode && this.mode.distTarget ? this.mode.distTarget(this) : null;
    const d = mt ? Math.hypot(mt.x - b.x, mt.z - b.z) : this.distToPin;
    const elev = (mt ? mt.y : h.pin.y) - b.y;
    // wind component along the aim line (+ = helping)
    const f = fwdOf(this.heading);
    const along = (this.wind.vec.x * f.x + this.wind.vec.z * f.z);
    const playsLike = d + elev * 1.0 - along * (d / 45);
    const c = CLUB_BY_ID[this.club];
    const t = this.table[this.club];
    return {
      dist: d,
      elev,
      playsLike,
      club: c,
      model: gearFor(this.bag, this.club),
      carry: t ? t.carry : null,
      predCarry: this.predCarry,
      putting: this.putting,
      puttScale: this.puttScale,
      windMph: this.wind.mph,
      windDir: this.wind.dir,
      heading: this.heading,
      ball: this.ball,
      pressure: this.pressure(),
      distLabel: mt ? mt.label : 'to pin',
    };
  }

  pressure() {
    const t = this.opts.tournament;
    if (!t) return 0;
    const i = this.holeIndex;
    const finalRound = t.round === t.rounds - 1;
    if (!finalRound || i < 9) return 0;
    const lb = this.opts.leaderboardFn ? this.opts.leaderboardFn() : null;
    if (!lb) return 0;
    const me = lb.find((r) => r.human);
    const lead = lb[0].toPar;
    if (!me || me.toPar - lead > 3) return 0;
    return clamp(0.3 + (i - 9) * 0.08 + (t.tour === 'MAJ' ? 0.15 : 0), 0, 1);
  }

  // ---------------- swing ----------------
  beginDrag() {
    if (this.phase !== 'aim') return false;
    this.dragging = true;
    this.hud.showSwingHint(false);
    return true;
  }

  dragPower(p) {
    if (!this.dragging) return;
    this.world.golfer.setBackswing(Math.min(1.1, p));
    this.dragP = p;
    if (!this._predT || performance.now() - this._predT > 60) {
      this._predT = performance.now();
      this.updatePrediction(Math.max(0.02, Math.min(1.1, p)));
      this.hud.setPowerCarry(this.putting ? (this.predTotal ?? 0) : (this.predCarry ?? 0), this.putting);
    }
  }

  // The forward push has begun: the golfer's downswing follows it (0..1)
  dragForward(f) {
    if (!this.dragging) return;
    this.world.golfer.setDownswing(f);
  }

  cancelDrag() {
    this.dragging = false;
    this.world.golfer.address();
    this.updatePrediction();
  }

  // Called when the forward swing crosses the start line
  release(power, devDeg, tempo) {
    if (!this.dragging) return;
    this.dragging = false;
    if (power < 0.02) { this.cancelDrag(); return; }
    this.app.swingsDone = (this.app.swingsDone || 0) + 1;
    this.phase = 'swing';
    this.world.aim.setVisible(false);
    this.world.preview.clear();
    this.world.puttLine.clear();
    this.hud.hideTransient();
    const c = CLUB_BY_ID[this.club];
    const sens = this.app.settings.swingSens || 1;
    const dev = devDeg * sens;
    const toImpact = this.world.golfer.swing(power, () => this.launchShot(power, dev, tempo, c));
    if (!this.putting) sfx.whoosh(power, toImpact);
  }

  launchShot(power, dev, tempo, club) {
    const b = this.ballPos;
    this.prevPos = { x: b.x, y: b.y, z: b.z, lie: this.lie, plugged: this.plugged };
    this.strokes++;
    if (this.party) this.party.teed.add(this.cur);
    let res;
    let launchInfo = null;
    const pressure = this.pressure();
    if (this.putting) {
      this.putts++;
      const pt = computePutt({ power, scale: this.puttScale, stimp: this.cond.stimp, heading: this.heading, stats: this.golfer.stats, fx: this.fx, ball: this.ball, gear: gearFor(this.bag, 'PT'), devDeg: dev, distToPin: this.distToPin, pressure, rng: this.rand });
      res = simulate({ pos: { x: b.x, y: b.y + BALL_R, z: b.z }, vel: pt.vel, rolling: true, env: this.env, rng: this.rand, pinIn: false });
      launchInfo = { putt: true, speed: pt.v0 };
    } else {
      const inp = { ...this.shotInput(power), devDeg: dev, tempo, pressure, rng: this.rand, heading: this.heading, dispMult: this.dispMult };
      const L = computeLaunch(inp);
      const st = launchState(this.heading, L);
      res = simulate({ pos: { x: b.x, y: b.y + BALL_R + 0.01, z: b.z }, vel: st.vel, spin: st.spin, env: this.env, ball: this.aero, rng: this.rand, pinIn: true });
      launchInfo = { speed: L.speed, launch: L.launchDeg, spin: L.spinRpm, axis: L.axisDeg, start: L.startDeg, note: L.lieNote };
    }
    sfx.impact(club.kind, power);
    this.hud.strike(dev, tempo, this.putting);
    if (club.kind !== 'putter' && ['fairway', 'rough', 'first', 'deep', 'fescue', 'heather'].includes(this.lie)) {
      this.world.particles.burst(b.x, b.y + 0.05, b.z, 'grass', 0.6 + power * 0.4);
    }
    if (this.lie === 'bunker') this.world.particles.burst(b.x, b.y + 0.05, b.z, 'sand', 1.3);
    // irons and wedges off turf take a divot just past the ball
    if (!this.putting && club.kind !== 'wood' && power > 0.35 && ['fairway', 'first', 'rough', 'tee'].includes(this.lie)) {
      const f = fwdOf(this.heading);
      const dx = b.x + f.x * 0.15, dz = b.z + f.z * 0.15;
      this.world.marks.add('divot', dx, this.hole.heightAt(dx, dz), dz, this.heading, club.kind === 'wedge' ? 1.1 : 0.9);
    }
    this.flight = { res, t: 0, ev: 0, launchInfo, club, power, dev, start: { ...b }, camMode: 'launch', landT: res.land ? res.land.t : 0 };
    this.world.tracer.reset();
    this.phase = 'flight';
    this.hud.setStrokes(this.strokes);
  }

  sampleAt(t, out) {
    const S = this.flight.res.samples;
    const n = S.length / 5;
    // binary search on time
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (S[mid * 5] <= t) lo = mid; else hi = mid;
    }
    const a = lo * 5, b = hi * 5;
    const ta = S[a], tb = S[b];
    const k = tb > ta ? clamp((t - ta) / (tb - ta), 0, 1) : 1;
    out.x = S[a + 1] + (S[b + 1] - S[a + 1]) * k;
    out.y = S[a + 2] + (S[b + 2] - S[a + 2]) * k;
    out.z = S[a + 3] + (S[b + 3] - S[a + 3]) * k;
    out.rolling = S[a + 4] > 0;
    return out;
  }

  updateFlight(dt) {
    const fl = this.flight;
    const res = fl.res;
    const speed = this.fast ? 3.5 : 1;
    fl.t = Math.min(res.duration, fl.t + dt * speed);
    const p = this.sampleAt(fl.t, fl.p || (fl.p = {}));
    const gy = this.hole.heightAt(p.x, p.z);
    this.world.ball.set(p.x, p.y, p.z, gy, this.world.camera.position);
    if (!this.putting) this.world.tracer.push(p.x, p.y, p.z);
    // events
    while (fl.ev < res.events.length && res.events[fl.ev].t <= fl.t) {
      const e = res.events[fl.ev++];
      if (e.type === 'bounce') {
        if (e.surface === 'bunker') { sfx.sand(); this.world.particles.burst(e.x, e.y, e.z, 'sand', 1); }
        else sfx.bounce(e.speed);
        if (e.surface === 'green' && e.speed > 4 && !this.putting) this.world.marks.add('pitch', e.x, this.hole.heightAt(e.x, e.z), e.z, 0, 1);
      } else if (e.type === 'tree') sfx.tree();
      else if (e.type === 'pin') sfx.pin();
      else if (e.type === 'water') { sfx.splash(); this.world.particles.burst(e.x, e.y, e.z, 'water', 1.2); this.world.ball.setVisible(false); }
      else if (e.type === 'holed') { sfx.cup(); }
    }
    this.flightCamera(p, gy);
    if (fl.t >= res.duration) this.finishShot();
  }

  flightCamera(p, gy) {
    const fl = this.flight;
    const w = this.world;
    const st = fl.start;
    const f = fwdOf(this.heading), r = rightOf(this.heading);
    w.focus.set(p.x, gy, p.z);
    if (this.putting) {
      const back = 2.4;
      w.setCamera(V(st.x - f.x * back + (p.x - st.x) * 0.55, Math.max(st.y, p.y) + 1.3, st.z - f.z * back + (p.z - st.z) * 0.55), V(p.x, p.y, p.z), 46, 3);
      return;
    }
    const t = fl.t;
    const land = fl.res.land;
    const carry = fl.res.carry;
    if (t < 0.9 || carry < 25) {
      // hold the address view, turn to follow the ball
      const gy0 = this.hole.heightAt(st.x, st.z);
      const back = carry < 25 ? 5 : 3.7;
      w.setCamera(V(st.x - f.x * back + r.x * 0.55, gy0 + (carry < 25 ? 2.4 : 1.75), st.z - f.z * back + r.z * 0.55), V(p.x, p.y, p.z), 50, carry < 25 ? 2.5 : 6);
      return;
    }
    const toLand = Math.hypot(land.x - p.x, land.z - p.z);
    if (t < fl.landT && toLand > 60) {
      // chase from behind and above
      const dx = p.x - st.x, dz = p.z - st.z;
      const d = Math.hypot(dx, dz) || 1;
      const ux = dx / d, uz = dz / d;
      w.setCamera(V(p.x - ux * 22 + r.x * 3, Math.max(p.y + 5, gy + 6), p.z - uz * 22 + r.z * 3), V(p.x + ux * 30, p.y - 2, p.z + uz * 30), 50, 2.2);
    } else {
      // landing cam near the landing zone, looking back at the incoming ball
      if (!fl.landCam) {
        const ly = this.hole.heightAt(land.x, land.z);
        const side = (fl.dev || 0) > 0 ? -1 : 1;
        fl.landCam = V(land.x + f.x * 26 + r.x * 14 * side, ly + 7, land.z + f.z * 26 + r.z * 14 * side);
      }
      w.setCamera(fl.landCam, V(p.x, p.y, p.z), 45, 3);
    }
  }

  finishShot() {
    const fl = this.flight;
    const res = fl.res;
    const h = this.hole;
    this.phase = 'result';
    this.fast = false;
    const shotStats = this.shotStats(fl);
    this.hud.showShotStats(shotStats);
    if (this.mode) {
      this.mode.shotDone(this, fl);
      this.hud.setMode(this.mode.hud(this));
      return;
    }
    const par = h.par;
    const wasTee = fl.start && this.prevPos.lie === 'tee';
    // Was that a shot for the highlights?
    const rate = rateShot({ res, start: fl.start, putt: this.putting, holeIndex: this.holeIndex, strokes: this.strokes, par, hole: h, units: this.app.settings.units, teeShot: wasTee });
    if (rate) this.noteBestShot(rate, fl);
    const great = !!(rate && rate.great && this.app.settings.replays !== false);
    if (res.outcome === 'holed') {
      if (great) {
        this.world.ball.setVisible(false);
        sfx.cup();
        if (this.strokes === 1) this.aceCelebration();
        else {
          sfx.applause(1.3);
          this.world.cheer(1.3);
          this.hud.message(rate.kind === 'putt' ? 'What a putt!' : 'It\'s in!', rate.label, 'good');
        }
        this.queueReplay(rate, () => this.holeOut(true));
        return;
      }
      this.holeOut();
      return;
    }
    if (res.outcome === 'water') {
      this.strokes++;
      this.penalties++;
      const drop = this.findDrop(res);
      this.hud.message('In the water', 'Penalty stroke — dropping', 'bad');
      sfx.groan();
      this.ballPos = drop;
      this.plugged = false;
      this.afterPause(2.2);
      return;
    }
    if (res.outcome === 'ob') {
      this.strokes++;
      this.penalties++;
      this.hud.message('Out of bounds', `Stroke and distance — hitting ${this.strokes + 1} from the same spot`, 'bad');
      sfx.groan();
      this.ballPos = { x: this.prevPos.x, y: this.prevPos.y, z: this.prevPos.z };
      this.plugged = this.prevPos.plugged;
      this.afterPause(2.4);
      return;
    }
    const rest = res.rest;
    this.ballPos = { x: rest.x, y: h.heightAt(rest.x, rest.z), z: rest.z };
    this.plugged = !!res.plugged;
    const surf = h.surfaceAt(rest.x, rest.z);
    // stats: fairway hit (tee shots on par 4/5), green in regulation
    if (wasTee && par > 3) this.hitFairway = surf === 'fairway';
    if (surf === 'green' && this.strokes <= par - 2) this.girHit = true;
    const d = h.distToPin(rest.x, rest.z);
    let title = SURFACES[surf] ? SURFACES[surf].label : surf;
    let sub = `${this.fmtDist(d, true)} to the pin`;
    let tone = 'neutral';
    if (this.putting) {
      title = d < 1 ? 'Close!' : fl.res.events.some((e) => e.type === 'lip') ? 'Lipped out!' : 'Putt missed';
      if (fl.res.events.some((e) => e.type === 'lip')) sfx.groan();
    } else if (surf === 'green') { title = d < 3 ? 'Stiff!' : 'On the green'; tone = 'good'; if (d < 3) sfx.applause(0.5); }
    else if (surf === 'bunker') { title = this.plugged ? 'Plugged in the bunker' : 'In the bunker'; tone = 'bad'; }
    else if (surf === 'fairway') tone = 'good';
    this.hud.message(title, sub, tone);
    // Tap-in
    if (this.app.settings.tapIn && surf === 'green' && d < 0.45) {
      const tap = () => setTimeout(() => {
        if (this.destroyed) return;
        this.strokes++;
        this.putts++;
        sfx.cup();
        this.hud.message('Tap-in', '', 'neutral');
        this.holeOut(true);
      }, 900);
      if (great) this.queueReplay(rate, tap); else tap();
      return;
    }
    // Pick up after a quadruple bogey
    if (this.strokes >= par + 4) {
      setTimeout(() => {
        if (this.destroyed) return;
        this.strokes = par + 4;
        this.hud.message('Picked up', `Maximum score: ${par + 4}`, 'bad');
        this.completeHole(true);
      }, 1400);
      return;
    }
    if (great) { this.queueReplay(rate, () => this.afterPause(0.6)); return; }
    this.afterPause(this.putting ? 1.2 : 2.2);
  }

  // ---------------- highlights ----------------
  noteBestShot(rate, fl) {
    if (this.bestShot && this.bestShot.value >= rate.value) return;
    const who = this.party ? this.party.players[this.cur] : null;
    const c = CLUB_BY_ID[this.club];
    this.bestShot = {
      value: rate.value, kind: rate.kind, label: who ? `${who.name}: ${rate.label}` : rate.label,
      res: fl.res, start: { ...fl.start }, heading: this.heading, putt: this.putting,
      holeIndex: this.holeIndex, courseId: this.course.id, course: this.course, holeOpts: this.opts.holeOpts || null,
      cond: { ...this.cond }, look: { ...this.golfer.look, gender: this.golfer.gender }, club: { kind: c.kind, length: c.length },
      crowd: !!this.opts.crowd,
    };
  }

  // Watch it again from the TV angles, then carry on with `then`
  queueReplay(rate, then) {
    const fl = this.flight;
    this.phase = 'replayWait';
    this.replayAt = performance.now() + (rate.kind === 'ace' ? 2600 : 1500);
    this.replayThen = then;
    this.replayShot = { res: fl.res, start: fl.start, heading: this.heading, putt: this.putting, label: rate.label };
  }

  startReplay() {
    this.phase = 'replay';
    this.hud.replayTag(true, this.replayShot.label);
    this.replay = new ReplayDirector(this.world, this.hole, this.replayShot, () => {
      this.hud.replayTag(false);
      this.replay = null;
      this.phase = 'result';
      const then = this.replayThen;
      this.replayThen = null;
      if (then) then();
    });
  }

  skipReplay() {
    if (this.phase === 'replayWait') this.startReplay();
    if (this.phase === 'replay' && this.replay) this.replay.finish();
  }

  // Fireworks, the crowd going wild, and maybe a new car
  aceCelebration() {
    const pin = this.hole.pin;
    this.world.celebrate(pin, '#f2c230', true);
    this.world.cheer(2);
    sfx.applause(2);
    const car = this.opts.prizeCar;
    if (car && car.hole === this.holeIndex && !car.won) {
      car.won = true;
      this.hud.message('HOLE IN ONE!', `You won the ${car.name}!`, 'good');
      if (this.opts.onAceCar) this.opts.onAceCar(car);
    } else this.hud.message('HOLE IN ONE!', `On the ${ordinal(this.holeIndex + 1)}`, 'good');
  }

  afterPause(sec) {
    this.phase = 'result';
    this.resumeAt = performance.now() + sec * 1000;
  }

  // Mini-games: play the next ball from `pos` after a pause
  modeNext(pos, sec) {
    this.ballPos = { x: pos.x, y: this.hole.heightAt(pos.x, pos.z), z: pos.z };
    this.plugged = false;
    this.afterPause(sec);
  }

  // Mini-games: the game is over; hand back after a pause
  modeEnd(sec) {
    this.phase = 'modeEnd';
    this.resumeAt = performance.now() + sec * 1000;
  }

  findDrop(res) {
    const h = this.hole;
    const e = res.events.find((ev) => ev.type === 'water') || res.rest;
    // walk back along the flight path to where it crossed into the hazard
    const S = res.samples;
    let px = e.x, pz = e.z;
    for (let i = S.length - 5; i >= 0; i -= 5) {
      const x = S[i + 1], z = S[i + 3];
      if (!h.waterAt(x, z)) { px = x; pz = z; break; }
    }
    // step away from the water, back toward where the shot came from
    let dx = this.prevPos.x - px, dz = this.prevPos.z - pz;
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl; dz /= dl;
    for (let k = 0; k < 80; k++) {
      const f = h.fields(px, pz);
      const inHaz = h.waterAt(px, pz) || f.dW < 2.5 || (h.ocean && f.dO < 2.5) || !h.inBounds(px, pz);
      if (!inHaz && h.surfaceAt(px, pz) !== 'bunker') break;
      px += dx * 1.5; pz += dz * 1.5;
    }
    return { x: px, y: h.heightAt(px, pz), z: pz };
  }

  shotStats(fl) {
    const res = fl.res;
    const li = fl.launchInfo;
    const st = fl.start;
    const f = fwdOf(this.heading), r = rightOf(this.heading);
    const land = res.land;
    const lat = (land.x - st.x) * r.x + (land.z - st.z) * r.z;
    return {
      putt: !!li.putt,
      club: fl.club.name,
      ballSpeed: li.speed / 0.44704,
      launch: li.launch,
      spin: li.spin,
      carry: res.carry,
      total: res.total,
      apex: res.apex,
      curve: lat,
      landAngle: land.angle ? (land.angle * 180) / Math.PI : null,
      note: li.note,
      dev: fl.dev,
    };
  }

  holeOut(tapIn = false) {
    this.world.ball.setVisible(false);
    if (!tapIn) sfx.cup();
    const par = this.hole.par;
    const rel = this.strokes - par;
    if (rel <= -1) sfx.applause(rel <= -2 ? 1.3 : 0.9);
    else if (rel === 0) sfx.applause(0.4);
    this.reactionShot(rel <= -2 ? 'arms' : rel === -1 ? 'fist' : rel === 0 ? 'tip' : 'sad');
    this.completeHole(false);
  }

  // Cut to the golfer's reaction, like the TV coverage does
  reactionShot(kind) {
    const g = this.world.golfer;
    if (!g) return;
    g.react(kind);
    const p = g.root.position;
    const r = rightOf(this.heading), f = fwdOf(this.heading);
    const cx = p.x + r.x * 4.2 + f.x * 1.2, cz = p.z + r.z * 4.2 + f.z * 1.2;
    const cy = Math.max(p.y, this.hole.heightAt(cx, cz)) + 1.35;
    this.world.setCamera(V(cx, cy, cz), V(p.x, p.y + 1.1, p.z), 46, 3);
    this.world.focus.set(p.x, p.y, p.z);
  }

  completeHole(pickedUp) {
    const i = this.holeIndex;
    const par = this.hole.par;
    this.phase = 'holedone';
    this.scores[i] = this.strokes;
    this.lastHoleRel = this.strokes - par;
    const hs = {
      strokes: this.strokes, par, putts: this.putts, penalties: this.penalties,
      fairway: this.hitFairway, gir: this.girHit, pickedUp, simmed: false,
    };
    this.holeStats[i] = hs;
    if (this.party) {
      const party = this.party;
      const p = party.players[this.cur];
      this.saveState(p);
      p.st.done = true;
      p.lastRel = this.strokes - par;
      this.hud.holeResult(this.strokes, par, `${p.name}: ${scoreName(this.strokes, par)}`, this.scoreToPar());
      this.hud.updateBoard();
      if (!party.allDone()) {
        // the others still have to finish the hole
        this.phase = 'result';
        this.resumeAt = performance.now() + 2600;
        return;
      }
      const line = party.holeFinished(i, par);
      setTimeout(() => { if (!this.destroyed) this.hud.partyHole(party, i, par, line); }, 1900);
      this.hud.updateBoard();
      this.resumeAt = performance.now() + 5600;
      return;
    }
    this.hud.holeResult(this.strokes, par, scoreName(this.strokes, par), this.scoreToPar());
    if (this.opts.onHoleDone) this.opts.onHoleDone(i, this.strokes, hs);
    this.resumeAt = performance.now() + 2600;
  }

  simCurrentHole() {
    if (!['aim', 'intro'].includes(this.phase)) return;
    const i = this.holeIndex;
    let strokes;
    if (this.opts.simHole) strokes = this.opts.simHole(i);
    else {
      const prof = courseProfile(this.course);
      strokes = simHole(effectiveStats(this.golfer.stats, 0), this.fx, prof.holes[i], { windMph: this.cond.windMph, stimp: this.cond.stimp, firm: this.cond.firm }, this.rand);
    }
    // If shots were already played, never score better than what's already on the card
    strokes = Math.max(strokes, this.strokes + 1);
    this.strokes = strokes;
    this.hud.hideIntro();
    this.phase = 'holedone';
    this.scores[i] = strokes;
    const par = this.hole.par;
    this.lastHoleRel = strokes - par;
    const hs = { strokes, par, putts: null, penalties: 0, fairway: null, gir: null, simmed: true };
    this.holeStats[i] = hs;
    this.hud.holeResult(strokes, par, `${scoreName(strokes, par)} (simulated)`, this.scoreToPar());
    if (this.opts.onHoleDone) this.opts.onHoleDone(i, strokes, hs);
    this.resumeAt = performance.now() + 1800;
  }

  nextHole() {
    this.pos++;
    if (this.pos >= this.holeList.length || (this.party && this.party.over())) {
      this.phase = 'done';
      if (this.opts.onRoundDone) this.opts.onRoundDone(this.scores, this.holeStats);
      return;
    }
    this.loadHole();
  }

  // ---------------- per frame ----------------
  update(dt) {
    if (this.destroyed) return;
    const w = this.world;
    if (this.phase === 'intro') {
      const it = this.intro;
      it.t += dt;
      const k = Math.min(1, it.t / it.dur);
      const e = k * k * (3 - 2 * k);
      const h = this.hole;
      const s = e * h.length;
      const p = h.pointAtS(s);
      const pa = h.pointAtS(Math.min(h.length, s + 90));
      const gy = h.heightAt(p.x, p.z);
      const f = fwdOf(p.heading);
      w.setCamera(V(p.x - f.x * 50, gy + 42 - 12 * e, p.z - f.z * 50), V(pa.x, h.heightAt(pa.x, pa.z), pa.z), 55, 3);
      w.focus.set(p.x, gy, p.z);
      if (k >= 1) this.skipIntro();
    } else if (this.phase === 'flight') {
      this.updateFlight(dt);
    } else if (this.phase === 'result' && this.resumeAt && performance.now() > this.resumeAt) {
      this.resumeAt = 0;
      this.world.tracer.reset();
      this.resumePlay();
    } else if (this.phase === 'holedone' && this.resumeAt && performance.now() > this.resumeAt) {
      this.resumeAt = 0;
      this.nextHole();
    } else if (this.phase === 'replayWait' && performance.now() > this.replayAt) {
      this.startReplay();
    } else if (this.phase === 'replay' && this.replay) {
      this.replay.update(dt);
    } else if (this.phase === 'modeEnd' && this.resumeAt && performance.now() > this.resumeAt) {
      this.resumeAt = 0;
      this.phase = 'done';
      if (this.opts.onRoundDone) this.opts.onRoundDone(this.scores, this.holeStats);
    }
    if (this.phase === 'aim' || this.phase === 'swing') {
      const b = this.ballPos;
      w.ball.set(b.x, b.y + BALL_R, b.z, b.y, w.camera.position);
    }
    this.hud.frame(this, dt);
  }

  fmtDist(m, small = false) {
    const units = this.app.settings.units;
    if (units === 'meters') return small && m < 20 ? `${m.toFixed(1)} m` : `${Math.round(m)} m`;
    const yd = m / YD;
    if (small && yd < 20) return `${Math.round(m / 0.3048)} ft`;
    return `${Math.round(yd)} yds`;
  }

  destroy() {
    this.destroyed = true;
    this.world.aim.setVisible(false);
    this.world.preview.clear();
    this.world.puttLine.clear();
  }
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
