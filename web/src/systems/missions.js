import * as THREE from '../../vendor/three/three.module.js';
import { MISSIONS } from '../config.js';

const TITLES = {
  DELIVERY: 'DELIVERY',
  DEMOLITION: 'DEMOLITION DERBY',
  HITMAN: 'CONTRACT HIT',
  SURVIVAL: 'HEAT WAVE',
  HEIST: 'HEIST',
};

const DETAILS = {
  DELIVERY: (cfg) => `Race a package to a drop point ${cfg.minDist}-${cfg.maxDist}m away`,
  DEMOLITION: (cfg) => `Destroy ${cfg.targetCount} vehicles before time runs out`,
  HITMAN: (cfg) => `Eliminate ${cfg.targetCount} hostiles before time runs out`,
  SURVIVAL: (cfg) => `Stay alive for ${cfg.duration}s`,
  HEIST: (cfg) => `Hit a vault ${cfg.minDist}-${cfg.maxDist}m out, then run the score to a getaway point — triggers major heat`,
};

const HEIST_PHASE_DETAIL = {
  rob: 'Break into the marked vault',
  escape: 'Score in hand — get to the getaway point before the cops box you in!',
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

// Contracts stay out of the way until the player opens the mission menu and
// explicitly starts one (see HUD's missionBtn/missionMenu) — no more
// auto-popping offers cluttering the screen. Progress and pass/fail is
// reported back to Game via update()'s return value.
export class MissionManager {
  constructor(scene) {
    this.scene = scene;
    this.active = null;
    this._beacon = null;
    this._alarmPending = false;
  }

  // One-shot flag: true exactly once, the frame the heist vault is hit,
  // so Game can spike wanted heat / show a warning without MissionManager
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
    const roundTo = type === 'HEIST' ? 1000 : 10;
    const reward = Math.round(randRange(cfg.rewardRange) / roundTo) * roundTo;
    const mission = { type, title: TITLES[type], reward, detail: DETAILS[type](cfg) };

    if (type === 'DELIVERY') {
      const angle = Math.random() * Math.PI * 2;
      const dist = randRange([cfg.minDist, cfg.maxDist]);
      mission.target = new THREE.Vector3(playerPos.x + Math.sin(angle) * dist, 0, playerPos.z + Math.cos(angle) * dist);
      mission.timeLimit = cfg.timeLimit;
      this._beacon = buildBeacon(this.scene, mission.target);
    } else if (type === 'DEMOLITION' || type === 'HITMAN') {
      mission.targetCount = cfg.targetCount;
      mission.progress = 0;
      mission.timeLimit = cfg.timeLimit;
    } else if (type === 'SURVIVAL') {
      mission.timeLimit = cfg.duration;
    } else if (type === 'HEIST') {
      const angle = Math.random() * Math.PI * 2;
      const dist = randRange([cfg.minDist, cfg.maxDist]);
      mission.phase = 'rob';
      mission.target = new THREE.Vector3(playerPos.x + Math.sin(angle) * dist, 0, playerPos.z + Math.cos(angle) * dist);
      mission.timeLimit = cfg.timeLimit;
      mission.detail = HEIST_PHASE_DETAIL.rob;
      this._beacon = buildBeacon(this.scene, mission.target, 0xff3a3a);
    }
    mission.timeLeft = mission.timeLimit;
    this.active = mission;
    return true;
  }

  // playerAlive: false once health hits 0, used to fail SURVIVAL/any active mission.
  update(dt, playerPos, playerAlive) {
    if (this._beacon) this._beacon.ring.rotation.z += dt * 1.5;
    if (!this.active) return null;

    this.active.timeLeft -= dt;
    let outcome = null;

    if (!playerAlive) {
      outcome = 'fail';
    } else if (this.active.type === 'DELIVERY') {
      const d = Math.hypot(playerPos.x - this.active.target.x, playerPos.z - this.active.target.z);
      if (d < 6) outcome = 'success';
      else if (this.active.timeLeft <= 0) outcome = 'fail';
    } else if (this.active.type === 'SURVIVAL') {
      if (this.active.timeLeft <= 0) outcome = 'success';
    } else if (this.active.type === 'HEIST') {
      const d = Math.hypot(playerPos.x - this.active.target.x, playerPos.z - this.active.target.z);
      if (this.active.phase === 'rob') {
        if (d < 6) this._triggerAlarm();
        else if (this.active.timeLeft <= 0) outcome = 'fail';
      } else { // escape
        if (d < 6) outcome = 'success';
        else if (this.active.timeLeft <= 0) outcome = 'fail';
      }
    } else { // DEMOLITION / HITMAN
      if (this.active.progress >= this.active.targetCount) outcome = 'success';
      else if (this.active.timeLeft <= 0) outcome = 'fail';
    }

    if (outcome) return this._resolve(outcome);
    return null;
  }

  // Vault hit: swap the beacon to a fresh getaway point, flag the one-shot
  // alarm for Game to spike wanted heat on, and switch the HUD blurb.
  _triggerAlarm() {
    const cfg = MISSIONS.types.HEIST;
    const from = this.active.target;
    const angle = Math.random() * Math.PI * 2;
    const dist = randRange([cfg.escapeMinDist, cfg.escapeMaxDist]);
    this.active.target = new THREE.Vector3(from.x + Math.sin(angle) * dist, 0, from.z + Math.cos(angle) * dist);
    this.active.phase = 'escape';
    this.active.detail = HEIST_PHASE_DETAIL.escape;
    this._alarmPending = true;
    if (this._beacon) this.scene.remove(this._beacon.group);
    this._beacon = buildBeacon(this.scene, this.active.target, 0xffd23f);
  }

  notifyVehicleDestroyed() {
    if (this.active?.type === 'DEMOLITION') this.active.progress++;
  }

  notifyEnemyKilled() {
    if (this.active?.type === 'HITMAN') this.active.progress++;
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
    if (m.type === 'DEMOLITION' || m.type === 'HITMAN') progressText = `${m.progress}/${m.targetCount}`;
    return { mode: 'ACTIVE', title: m.title, detail: m.detail, timeLeft: Math.max(0, m.timeLeft), timeLimit: m.timeLimit, progressText };
  }
}
