import * as THREE from '../../vendor/three/three.module.js';
import { MISSIONS } from '../config.js';

const TITLES = {
  DELIVERY: 'DELIVERY',
  GETAWAY: 'GETAWAY DRIVER',
  DEMOLITION: 'DEMOLITION DERBY',
  RAMPAGE: 'RAMPAGE',
  HITMAN: 'CONTRACT HIT',
  SURVIVAL: 'HEAT WAVE',
  HEIST: 'HEIST',
  JEWELRY_STORE: 'JEWELRY STORE HEIST',
  ARMORED_CAR: 'ARMORED CAR HEIST',
};

const DETAILS = {
  DELIVERY: (cfg) => `Race a package to a drop point ${cfg.minDist}-${cfg.maxDist}m away`,
  GETAWAY: (cfg) => `Drive a package to a drop point ${cfg.minDist}-${cfg.maxDist}m away — must arrive by vehicle`,
  DEMOLITION: (cfg) => `Destroy ${cfg.targetCount} vehicles before time runs out`,
  RAMPAGE: (cfg) => `Smash ${cfg.targetCount} street props (crates/barriers) before time runs out`,
  HITMAN: (cfg) => `Eliminate ${cfg.targetCount} hostiles before time runs out`,
  SURVIVAL: (cfg) => `Stay alive for ${cfg.duration}s`,
  HEIST: (cfg) => `Hit a vault ${cfg.minDist}-${cfg.maxDist}m out, then run the score to a getaway point — triggers major heat`,
  JEWELRY_STORE: (cfg) => `A tighter, faster score ${cfg.minDist}-${cfg.maxDist}m out — less heat, less time`,
  ARMORED_CAR: (cfg) => `Crack an armored car ${cfg.minDist}-${cfg.maxDist}m out, then escape by vehicle — heaviest heat`,
};

const HEIST_PHASE_DETAIL = {
  rob: 'Break into the marked target',
  escape: 'Score in hand — get to the getaway point before the cops box you in!',
  escapeVehicle: 'Score in hand — get to the getaway point BY VEHICLE before the cops box you in!',
};

function randRange([min, max]) { return THREE.MathUtils.lerp(min, max, Math.random()); }

function buildBeacon(scene, position, color = 0xffd23f) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 40, 16, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = 20;
  group.add(beam);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.15, 8, 24),
    new THREE.MeshBasicMaterial({ color })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.3;
  group.add(ring);

  group.position.copy(position);
  scene.add(group);
  return { group, ring };
}

function randomTarget(playerPos, minDist, maxDist) {
  const angle = Math.random() * Math.PI * 2;
  const dist = randRange([minDist, maxDist]);
  return new THREE.Vector3(playerPos.x + Math.sin(angle) * dist, 0, playerPos.z + Math.cos(angle) * dist);
}

// Contracts stay out of the way until the player opens the mission menu and
// explicitly starts one (see HUD's missionBtn/missionMenu) — no more
// auto-popping offers cluttering the screen. Progress and pass/fail is
// reported back to Game via update()'s return value. Every type dispatches
// on its config's `kind` rather than its own name, so adding a new contract
// is just a new config entry (see config.js's MISSIONS.types).
export class MissionManager {
  constructor(scene) {
    this.scene = scene;
    this.active = null;
    this._beacon = null;
    this._alarmPending = false;
  }

  // One-shot flag: true exactly once, the frame a heist target is hit, so
  // Game can spike wanted heat / show a warning without MissionManager
  // needing to know about WantedSystem directly.
  consumeAlarm() {
    const v = this._alarmPending;
    this._alarmPending = false;
    return v;
  }

  // Menu contents: the fixed set of contract types with their pay range and
  // a human-readable blurb, unaffected by whatever's currently active.
  listAvailable() {
    return Object.entries(MISSIONS.types).map(([type, cfg]) => ({
      type,
      title: TITLES[type],
      detail: DETAILS[type](cfg),
      rewardRange: cfg.rewardRange,
    }));
  }

  // Explicitly chosen from the mission menu — replaces the old random-offer
  // + accept-with-keypress flow.
  start(type, playerPos) {
    if (this.active) return false;
    const cfg = MISSIONS.types[type];
    if (!cfg) return false;
    const roundTo = cfg.kind === 'heist' ? 1000 : 10;
    const reward = Math.round(randRange(cfg.rewardRange) / roundTo) * roundTo;
    const mission = { type, kind: cfg.kind, title: TITLES[type], reward, detail: DETAILS[type](cfg), timeLimit: cfg.timeLimit };

    if (cfg.kind === 'delivery') {
      mission.target = randomTarget(playerPos, cfg.minDist, cfg.maxDist);
      mission.requireVehicle = !!cfg.requireVehicle;
      this._beacon = buildBeacon(this.scene, mission.target);
    } else if (cfg.kind === 'demolitionVehicles' || cfg.kind === 'demolitionProps' || cfg.kind === 'hitman') {
      mission.targetCount = cfg.targetCount;
      mission.progress = 0;
    } else if (cfg.kind === 'survival') {
      mission.timeLimit = cfg.duration;
    } else if (cfg.kind === 'heist') {
      mission.phase = 'rob';
      mission.target = randomTarget(playerPos, cfg.minDist, cfg.maxDist);
      mission.escapeMinDist = cfg.escapeMinDist;
      mission.escapeMaxDist = cfg.escapeMaxDist;
      mission.alarmStars = cfg.alarmStars ?? 3;
      mission.requireVehicleEscape = !!cfg.requireVehicleEscape;
      mission.detail = HEIST_PHASE_DETAIL.rob;
      this._beacon = buildBeacon(this.scene, mission.target, 0xff3a3a);
    }
    mission.timeLeft = mission.timeLimit;
    this.active = mission;
    return true;
  }

  // playerAlive: false once health hits 0. isInVehicle: whether the player is
  // currently driving — some contracts (GETAWAY, ARMORED_CAR's escape) only
  // count arrival if you're behind the wheel.
  update(dt, playerPos, playerAlive, isInVehicle = false) {
    if (this._beacon) this._beacon.ring.rotation.z += dt * 1.5;
    if (!this.active) return null;

    const m = this.active;
    m.timeLeft -= dt;
    let outcome = null;

    if (!playerAlive) {
      outcome = 'fail';
    } else if (m.kind === 'delivery') {
      const d = Math.hypot(playerPos.x - m.target.x, playerPos.z - m.target.z);
      if (d < 6 && (!m.requireVehicle || isInVehicle)) outcome = 'success';
      else if (m.timeLeft <= 0) outcome = 'fail';
    } else if (m.kind === 'survival') {
      if (m.timeLeft <= 0) outcome = 'success';
    } else if (m.kind === 'heist') {
      const d = Math.hypot(playerPos.x - m.target.x, playerPos.z - m.target.z);
      if (m.phase === 'rob') {
        if (d < 6) this._triggerAlarm();
        else if (m.timeLeft <= 0) outcome = 'fail';
      } else { // escape
        if (d < 6 && (!m.requireVehicleEscape || isInVehicle)) outcome = 'success';
        else if (m.timeLeft <= 0) outcome = 'fail';
      }
    } else { // demolitionVehicles / demolitionProps / hitman
      if (m.progress >= m.targetCount) outcome = 'success';
      else if (m.timeLeft <= 0) outcome = 'fail';
    }

    if (outcome) return this._resolve(outcome);
    return null;
  }

  // Vault/target hit: swap the beacon to a fresh getaway point, flag the
  // one-shot alarm for Game to spike wanted heat on, and switch the HUD blurb.
  _triggerAlarm() {
    const m = this.active;
    const from = m.target;
    m.target = randomTarget(from, m.escapeMinDist, m.escapeMaxDist);
    m.phase = 'escape';
    m.detail = m.requireVehicleEscape ? HEIST_PHASE_DETAIL.escapeVehicle : HEIST_PHASE_DETAIL.escape;
    this._alarmPending = true;
    this._alarmStars = m.alarmStars;
    if (this._beacon) this.scene.remove(this._beacon.group);
    this._beacon = buildBeacon(this.scene, m.target, 0xffd23f);
  }

  // How many stars the most recently triggered alarm is worth (read once
  // alongside consumeAlarm()).
  get alarmStars() { return this._alarmStars ?? 3; }

  notifyVehicleDestroyed() {
    if (this.active?.kind === 'demolitionVehicles') this.active.progress++;
  }

  notifyPropDestroyed() {
    if (this.active?.kind === 'demolitionProps') this.active.progress++;
  }

  notifyEnemyKilled() {
    if (this.active?.kind === 'hitman') this.active.progress++;
  }

  _resolve(outcome) {
    const mission = this.active;
    this.active = null;
    if (this._beacon) { this.scene.remove(this._beacon.group); this._beacon = null; }
    return { type: mission.type, title: mission.title, success: outcome === 'success', reward: outcome === 'success' ? mission.reward : 0 };
  }

  // HUD-friendly snapshot; called every frame, cheap to compute.
  status() {
    if (!this.active) return { mode: 'NONE' };
    const m = this.active;
    let progressText = null;
    if (m.kind === 'demolitionVehicles' || m.kind === 'demolitionProps' || m.kind === 'hitman') {
      progressText = `${m.progress}/${m.targetCount}`;
    }
    return { mode: 'ACTIVE', title: m.title, detail: m.detail, timeLeft: Math.max(0, m.timeLeft), timeLimit: m.timeLimit, progressText };
  }
}
