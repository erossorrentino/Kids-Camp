import * as THREE from 'three';
import { MISSIONS } from '../config.js';

const TITLES = {
  DELIVERY: 'DELIVERY',
  DEMOLITION: 'DEMOLITION DERBY',
  HITMAN: 'CONTRACT HIT',
  SURVIVAL: 'HEAT WAVE',
};

function randRange([min, max]) { return THREE.MathUtils.lerp(min, max, Math.random()); }
function randomType() {
  const keys = Object.keys(MISSIONS.types);
  return keys[Math.floor(Math.random() * keys.length)];
}

function buildBeacon(scene, position) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 40, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = 20;
  group.add(beam);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.15, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23f })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.3;
  group.add(ring);

  group.position.copy(position);
  scene.add(group);
  return { group, ring };
}

// Offers one contract at a time (delivery / demolition derby / contract hit /
// heat wave survival). The player accepts with a keypress while an offer is
// showing; progress and pass/fail is reported back to Game via update()'s
// return value so it can award cash and pop a HUD toast.
export class MissionManager {
  constructor(scene) {
    this.scene = scene;
    this.offer = null;
    this.active = null;
    this._offerCooldown = 3;
    this._beacon = null;
  }

  acceptOffer() {
    if (!this.offer) return;
    this.active = this.offer;
    this.active.timeLeft = this.active.timeLimit; // was counting down the offer-expiry clock until now
    this.offer = null;
    if (this.active.type === 'DELIVERY') this._beacon = buildBeacon(this.scene, this.active.target);
  }

  // playerAlive: false once health hits 0, used to fail SURVIVAL/any active mission.
  update(dt, playerPos, playerAlive) {
    if (this._beacon) this._beacon.ring.rotation.z += dt * 1.5;

    if (!this.active) {
      if (this.offer) {
        this.offer.timeLeft -= dt;
        if (this.offer.timeLeft <= 0) this.offer = null;
      } else {
        this._offerCooldown -= dt;
        if (this._offerCooldown <= 0) this._generateOffer(playerPos);
      }
      return null;
    }

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
    } else { // DEMOLITION / HITMAN
      if (this.active.progress >= this.active.targetCount) outcome = 'success';
      else if (this.active.timeLeft <= 0) outcome = 'fail';
    }

    if (outcome) return this._resolve(outcome);
    return null;
  }

  notifyVehicleDestroyed() {
    if (this.active?.type === 'DEMOLITION') this.active.progress++;
  }

  notifyEnemyKilled() {
    if (this.active?.type === 'HITMAN') this.active.progress++;
  }

  _generateOffer(playerPos) {
    const type = randomType();
    const cfg = MISSIONS.types[type];
    const reward = Math.round(randRange(cfg.rewardRange) / 10) * 10;
    const offer = { type, title: TITLES[type], reward, timeLeft: MISSIONS.offerExpiry };

    if (type === 'DELIVERY') {
      const angle = Math.random() * Math.PI * 2;
      const dist = randRange([cfg.minDist, cfg.maxDist]);
      offer.target = new THREE.Vector3(playerPos.x + Math.sin(angle) * dist, 0, playerPos.z + Math.cos(angle) * dist);
      offer.timeLimit = cfg.timeLimit;
      offer.detail = `Deliver to the marked drop point (${Math.round(dist)}m)`;
    } else if (type === 'DEMOLITION') {
      offer.targetCount = cfg.targetCount;
      offer.progress = 0;
      offer.timeLimit = cfg.timeLimit;
      offer.detail = `Destroy ${cfg.targetCount} vehicles`;
    } else if (type === 'HITMAN') {
      offer.targetCount = cfg.targetCount;
      offer.progress = 0;
      offer.timeLimit = cfg.timeLimit;
      offer.detail = `Eliminate ${cfg.targetCount} hostiles`;
    } else if (type === 'SURVIVAL') {
      offer.timeLimit = cfg.duration;
      offer.detail = `Stay alive for ${cfg.duration}s`;
    }
    this.offer = offer;
  }

  _resolve(outcome) {
    const mission = this.active;
    this.active = null;
    this._offerCooldown = MISSIONS.offerCooldown;
    if (this._beacon) { this.scene.remove(this._beacon.group); this._beacon = null; }

    // timeLeft becomes the mission's own timeLimit once accepted (see acceptOffer path below)
    return { type: mission.type, title: mission.title, success: outcome === 'success', reward: outcome === 'success' ? mission.reward : 0 };
  }

  // HUD-friendly snapshot; called every frame, cheap to compute.
  status() {
    if (this.active) {
      const m = this.active;
      let progressText = null;
      if (m.type === 'DEMOLITION' || m.type === 'HITMAN') progressText = `${m.progress}/${m.targetCount}`;
      return { mode: 'ACTIVE', title: m.title, detail: m.detail, timeLeft: Math.max(0, m.timeLeft), timeLimit: m.timeLimit, progressText };
    }
    if (this.offer) {
      return { mode: 'OFFER', title: this.offer.title, detail: this.offer.detail, reward: this.offer.reward };
    }
    return { mode: 'NONE' };
  }
}
