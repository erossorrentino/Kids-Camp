/**
 * MATCH
 * ------------------------------------------------------------------
 * Owns the roster, the clock, scoring, respawning and whichever objective
 * the selected mode wants. Everything that is "the rules of the game"
 * lives here; mech.js and combat.js stay rules-agnostic.
 */
import * as THREE from 'three';
import { Mech } from './mech.js';
import { Combat } from './combat.js';
import { BotBrain } from './ai.js';
import { getMode } from '../data/modes.js';
import { MECHS, MECH_BY_ID, battleValue } from '../data/mechs.js';
import { WEAPONS, WEAPON_BY_ID, fitsHardpoint, dps } from '../data/weapons.js';
import { PILOTS } from '../data/pilots.js';
import { skinForSeed, DEFAULT_SKIN } from '../data/skins.js';
import { clamp, lerp, makeRng } from '../core/rng.js';

export const TEAM_COLORS = { a: 0x49d6ff, b: 0xff6a4d };

const CALLSIGNS = [
  'Ripsaw', 'Halberd', 'Kestrel', 'Bulwark', 'Ozone', 'Tarpit', 'Nightjar', 'Cinder',
  'Quarrel', 'Pikeman', 'Rimefall', 'Stonecrop', 'Vesper', 'Aught', 'Brimstone', 'Culverin',
  'Dredge', 'Emberline', 'Falchion', 'Gallows', 'Harrow', 'Ingot', 'Jackdaw', 'Kiln',
  'Loamshire', 'Mordant', 'Nockpoint', 'Ossuary', 'Palisade', 'Quicklime', 'Runnel', 'Slagheap',
];

export class Match {
  constructor({ engine, world, fx, audio, mode, hangar, difficulty, progression, quality }) {
    this.engine = engine;
    this.scene = engine.scene;
    this.world = world;
    this.fx = fx;
    this.audio = audio;
    this.mode = getMode(mode);
    this.difficulty = difficulty || 'regular';
    this.progression = progression;
    this.quality = quality;
    this.rng = makeRng((world.def.seed ^ 0x9e37) >>> 0);

    this.friendlyFire = false;
    this.time = 0;
    this.clock = this.mode.duration;
    this.state = 'countdown';        // countdown | live | over
    this.countdown = 3.4;
    this.score = { a: 0, b: 0 };
    this.ffaScores = new Map();
    this.events = [];                // killfeed entries
    this.mechs = [];
    this.brains = new Map();
    this.players = [];               // roster entries (a pilot + their hangar)
    this.combat = new Combat(this, world, fx, audio);
    this.player = null;              // the human's roster entry
    this.reveals = [];               // { team, until }
    this.zones = world.zones;
    this.zoneTickAcc = 0;
    this.kingTimer = this.mode.rotateEvery || 0;
    this.activeZone = 0;
    this.onEvent = null;             // UI hook
    this.result = null;
    // Frame-scoped caches. frameId starts at 0, so these must start below it
    // or the very first query returns an empty cache instead of building one.
    this.frameId = 0;
    this._aliveFrame = -1;
    this._aliveCache = [];
    this._focusFrame = -1;
    this._focusCache = {};

    this._buildRoster(hangar);
    if (this.mode.objective === 'points' || this.mode.objective === 'king') {
      world.setZonesVisible(true);
    }
    this.audio.play('matchStart');
  }

  /* ================= roster ================= */

  _buildRoster(hangar) {
    const m = this.mode;
    const isFFA = m.teams > 2;
    const teams = isFFA
      ? Array.from({ length: m.teams }, (_, i) => 'ffa' + i)
      : ['a', 'b'];

    const used = new Set();
    const pickName = () => {
      let n;
      do { n = this.rng.pick(CALLSIGNS); } while (used.has(n) && used.size < CALLSIGNS.length);
      used.add(n);
      return n;
    };

    let slot = 0;
    for (const team of teams) {
      for (let i = 0; i < m.perTeam; i++) {
        const isHuman = slot === 0;
        const entry = {
          id: slot,
          team,
          isPlayer: isHuman,
          name: isHuman ? (hangar.pilotName || 'YOU') : pickName(),
          hangar: isHuman ? hangar.mechs.slice(0, m.hangarSize) : this._botHangar(m.hangarSize),
          pilotId: isHuman ? hangar.pilotId : this.rng.pick(PILOTS).id,
          implants: isHuman ? hangar.implants : [],
          livesLeft: m.livesPerPlayer ?? Infinity,
          current: 0,
          alive: false,
          respawnIn: 0,
          score: 0, kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0,
          mech: null,
          juggernaut: false,
        };
        this.players.push(entry);
        if (isHuman) this.player = entry;
        slot++;
      }
    }

    if (m.objective === 'juggernaut') {
      for (const team of teams) {
        const pool = this.players.filter(p => p.team === team);
        const pick = pool[this.rng.int(0, pool.length - 1)];
        pick.juggernaut = true;
      }
    }

    // Stagger the initial deploy so a match does not start as one blob.
    for (const p of this.players) this._deploy(p, 0);
  }

  /** Build a plausible bot hangar: a spread of weight classes, sane loadouts. */
  _botHangar(size) {
    const out = [];
    const classes = this.rng.shuffle(['light', 'medium', 'heavy', 'assault', 'support']);
    for (let i = 0; i < size; i++) {
      const cls = classes[i % classes.length];
      const pool = MECHS.filter(mm => mm.cls === cls);
      const chassis = this.rng.pick(pool);
      out.push({
        chassisId: chassis.id,
        loadout: autoLoadout(chassis, this.rng),
        skinId: skinForSeed(chassis.id.length * 977 + i * 31 + this.rng.int(0, 9999)),
      });
    }
    return out;
  }

  _deploy(entry, delay = 0) {
    const build = entry.hangar[entry.current] || entry.hangar[0];
    const chassis = MECH_BY_ID[build.chassisId] || MECHS[0];
    const teamColor = entry.team === 'a' ? TEAM_COLORS.a
                    : entry.team === 'b' ? TEAM_COLORS.b
                    : 0xffb454;

    const mech = new Mech({
      chassis,
      loadout: build.loadout,
      skinId: build.skinId || DEFAULT_SKIN,
      pilotId: entry.pilotId,
      implants: entry.implants,
      team: entry.team,
      name: entry.name,
      isPlayer: entry.isPlayer,
      teamColor,
    }, this.world, this.fx, this.audio);

    mech.entry = entry;
    mech.juggernaut = entry.juggernaut;
    if (entry.juggernaut) {
      // Double plating, and worth double on the scoreboard.
      for (const loc of Object.keys(mech.armour)) {
        mech.maxArmour[loc] = Math.round(mech.maxArmour[loc] * 2);
        mech.maxStructure[loc] = Math.round(mech.maxStructure[loc] * 1.5);
      }
    }

    const spawn = this._spawnPointFor(entry);
    mech.spawn(spawn.pos, spawn.yaw);
    mech.onDestroyed = () => this._onMechDestroyed(mech);
    mech.onVoidDeath = () => this._onVoidDeath(mech);
    mech.onSlam = (r, d) => this._slamDamage(mech, r, d);

    this.scene.add(mech.root);
    this.mechs.push(mech);
    entry.mech = mech;
    entry.alive = true;

    if (!entry.isPlayer) {
      this.brains.set(mech.id, new BotBrain(mech, this, this._botDifficulty()));
    }
    return mech;
  }

  _botDifficulty() {
    // A little spread around the chosen level keeps teams from feeling cloned.
    const order = ['recruit', 'regular', 'veteran', 'elite', 'ace'];
    const i = order.indexOf(this.difficulty);
    const j = clamp(i + this.rng.int(-1, 1), 0, order.length - 1);
    return order[j];
  }

  _spawnPointFor(entry) {
    const list = entry.team === 'a' ? this.world.spawns.a
               : entry.team === 'b' ? this.world.spawns.b
               : this.world.spawns.ffa;
    // Spawn away from live enemies, and with elbow room from teammates --
    // a lance stacked on one tile blocks its own line of fire and its own
    // third-person cameras.
    let best = list[0], bestScore = -Infinity;
    for (const p of list) {
      let score = this.rng.range(0, 40);
      for (const m of this.aliveMechs()) {
        const d = m.position.distanceTo(p);
        if (m.team === entry.team) {
          if (d < 34) score -= (34 - d) * 14;         // far too close
          else score += clamp(140 - d, 0, 70) * 0.2;  // but stay in the area
        } else {
          score -= clamp(300 - d, 0, 300);
        }
      }
      if (score > bestScore) { bestScore = score; best = p; }
    }

    const pos = best.clone().add(new THREE.Vector3(this.rng.range(-12, 12), 0, this.rng.range(-12, 12)));
    // Push out of anyone we still overlap, then re-seat on the ground.
    for (let iter = 0; iter < 6; iter++) {
      let moved = false;
      for (const m of this.aliveMechs()) {
        const dx = pos.x - m.position.x, dz = pos.z - m.position.z;
        const d = Math.hypot(dx, dz);
        const want = m.radius + 20;
        if (d > want || d < 0.001) continue;
        pos.x += (dx / d) * (want - d);
        pos.z += (dz / d) * (want - d);
        moved = true;
      }
      if (!moved) break;
    }
    const seated = this.world.findStandable(pos.x, pos.z, 40, 10);
    pos.copy(seated);
    const yaw = Math.atan2(-pos.x, -pos.z);
    return { pos, yaw };
  }

  /* ================= queries ================= */

  aliveMechs() {
    // Rebuilt lazily each frame; callers iterate it many times per tick.
    if (this._aliveFrame === this.frameId) return this._aliveCache;
    this._aliveFrame = this.frameId;
    this._aliveCache = this.mechs.filter(m => m.alive);
    return this._aliveCache;
  }

  teamOf(m) { return m.team; }

  spawnCenter(team) {
    const list = team === 'a' ? this.world.spawns.a : team === 'b' ? this.world.spawns.b : this.world.spawns.ffa;
    const c = new THREE.Vector3();
    for (const p of list) c.add(p);
    return c.multiplyScalar(1 / list.length);
  }

  /** The target a team is collectively focusing, so bots converge. */
  focusTarget(team) {
    if (this._focusFrame === this.frameId && this._focusCache?.[team] !== undefined) {
      return this._focusCache[team];
    }
    if (this._focusFrame !== this.frameId) { this._focusFrame = this.frameId; this._focusCache = {}; }
    let best = null, bestScore = -Infinity;
    for (const m of this.aliveMechs()) {
      if (m.team === team) continue;
      const score = (1 - m.healthFraction) * 100 + (m.juggernaut ? 60 : 0)
                  + (this.time - m.lastDamageTime < 3 ? 40 : 0);
      if (score > bestScore) { bestScore = score; best = m; }
    }
    this._focusCache[team] = best;
    return best;
  }

  wantsObjective(mech) {
    return this.mode.objective === 'points' || this.mode.objective === 'king';
  }

  bestZoneFor(mech) {
    if (this.mode.objective === 'king') return this.zones[this.activeZone];
    let best = null, bestScore = -Infinity;
    for (const z of this.zones) {
      const d = mech.position.distanceTo(z.pos);
      let score = 400 - d;
      if (z.owner === mech.team) score -= 200;             // already ours
      else if (z.owner) score += 120;                       // theirs: take it
      if (z.contested) score += 160;
      if (score > bestScore) { bestScore = score; best = z; }
    }
    return best;
  }

  patrolPoint(mech) {
    if (this.zones.length && this.wantsObjective(mech)) return this.bestZoneFor(mech).pos;
    // Otherwise head for the middle-ish, biased toward the enemy half.
    const enemyHome = mech.team === 'a' ? this.spawnCenter('b')
                    : mech.team === 'b' ? this.spawnCenter('a')
                    : new THREE.Vector3(0, 0, 0);
    const p = enemyHome.clone().multiplyScalar(0.55);
    p.x += this.rng.range(-this.world.half * 0.35, this.world.half * 0.35);
    p.z += this.rng.range(-this.world.half * 0.35, this.world.half * 0.35);
    return p;
  }

  /* ================= damage & scoring ================= */

  applyDamage(target, attacker, amount, opts = {}) {
    if (!target.alive || amount <= 0) return 0;
    const dealt = target.takeDamage(amount, opts.location || 'CT', { ...opts, attacker });
    if (dealt <= 0) return 0;

    if (attacker && attacker !== target && attacker.team !== target.team) {
      attacker.damageDealt += dealt;
      if (attacker.entry) attacker.entry.damage += dealt;
      if (attacker.isPlayer) this.onEvent?.({ type: 'hit', amount: dealt, target, killing: !target.alive });
    }
    if (opts.stagger) target.staggerTime = Math.max(target.staggerTime, opts.stagger);
    if (target.isPlayer) {
      this.onEvent?.({ type: 'taken', amount: dealt, from: opts.from, attacker });
      this.fx.shakeRequest = Math.max(this.fx.shakeRequest, clamp(dealt / 220, 0.03, 0.8));
    }
    return dealt;
  }

  repair(target, amount, healer) {
    const healed = target.repair(amount);
    if (healer && healer.entry) { healer.healingDone += healed; healer.entry.healing += healed; }
    return healed;
  }

  breakLocksNear(pos, radius) {
    for (const m of this.aliveMechs()) {
      if (!m.lockedTarget) continue;
      if (m.lockedTarget.position.distanceTo(pos) < radius) {
        m.lockedTarget = null;
        m.lockProgress = 0;
      }
    }
  }

  revealAll(team, duration) {
    this.reveals.push({ team, until: this.time + duration });
    for (const m of this.aliveMechs()) {
      if (m.team !== team) m.revealedUntil = Math.max(m.revealedUntil, this.time + duration);
    }
  }

  callArtillery(target, owner, opts) { this.combat.callArtillery(target, owner, opts); }

  _slamDamage(mech, radius, damage) {
    for (const other of this.aliveMechs()) {
      if (other === mech || other.team === mech.team) continue;
      const d = other.position.distanceTo(mech.position);
      if (d > radius) continue;
      const f = 1 - d / radius;
      this.applyDamage(other, mech, damage * f, { location: 'CT', source: 'slam', stagger: 1.8 * f });
    }
  }

  _onVoidDeath(mech) {
    if (!mech.alive) return;
    this._killMech(mech, mech.lastDamagedBy, 'VOID');
  }

  _onMechDestroyed(mech) {
    if (!mech.alive) return;
    this._killMech(mech, mech.lastDamagedBy, null);
  }

  _killMech(mech, killer, cause) {
    mech.alive = false;
    mech.endAbility();
    const pos = mech.position.clone().setY(mech.position.y + mech.height * 0.4);
    this.fx.mechExplosion(pos, mech.chassis.tons / 55);
    this.audio.explosion(pos, 1.6);
    mech.root.visible = false;

    const entry = mech.entry;
    entry.alive = false;
    entry.deaths++;
    mech.deaths++;

    const value = mech.juggernaut ? 2 : 1;

    if (killer && killer.alive !== undefined && killer.team !== mech.team) {
      killer.kills++;
      if (killer.entry) {
        killer.entry.kills += value;
        killer.entry.score += 100 * value;
      }
      if (this.mode.objective === 'kills' || this.mode.objective === 'juggernaut' || this.mode.objective === 'elimination') {
        this._addScore(killer.team, value);
      }
      if (killer.isPlayer) this.onEvent?.({ type: 'kill', victim: mech });
      if (mech.isPlayer) this.onEvent?.({ type: 'death', killer });
    } else if (mech.isPlayer) {
      this.onEvent?.({ type: 'death', killer: null });
    }

    // Assists: anyone who did meaningful damage in the last few seconds.
    for (const [id, dmg] of mech.assistCredit) {
      if (killer && id === killer.id) continue;
      if (dmg < mech.maxTotal * 0.12) continue;
      const helper = this.mechs.find(m => m.id === id);
      if (!helper || helper.team === mech.team) continue;
      helper.assists++;
      if (helper.entry) { helper.entry.assists++; helper.entry.score += 35; }
    }

    this._pushEvent({
      killer: killer?.name || cause || 'THE ARENA',
      killerTeam: killer?.team || null,
      victim: mech.name,
      victimTeam: mech.team,
      weapon: cause || killer?.weapons?.find(w => w && !w.destroyed)?.def.name || '',
    });

    // Schedule the next deploy.
    entry.livesLeft--;
    entry.current = (entry.current + 1) % entry.hangar.length;
    const out = entry.livesLeft <= 0 && !this.mode.respawn;
    entry.respawnIn = out ? Infinity : (entry.isPlayer ? 0 : 4.5 + this.rng.range(0, 2.5));
    entry.eliminated = out;

    this.scene.remove(mech.root);
    this.brains.delete(mech.id);
    const i = this.mechs.indexOf(mech);
    if (i >= 0) this.mechs.splice(i, 1);
    entry.mech = null;

    if (entry.isPlayer) this.onEvent?.({ type: 'playerDown', entry });
    this._checkEnd();
  }

  _addScore(team, n) {
    if (team === 'a' || team === 'b') this.score[team] += n;
    else this.ffaScores.set(team, (this.ffaScores.get(team) || 0) + n);
  }

  scoreFor(team) {
    if (team === 'a' || team === 'b') return this.score[team];
    return this.ffaScores.get(team) || 0;
  }

  _pushEvent(e) {
    this.events.push({ ...e, t: this.time });
    if (this.events.length > 40) this.events.shift();
    this.onEvent?.({ type: 'feed', entry: this.events[this.events.length - 1] });
  }

  /** Called by the UI when the player picks a mech from the respawn screen. */
  respawnPlayer(hangarIndex) {
    const e = this.player;
    if (!e || e.alive || e.eliminated) return false;
    if (hangarIndex != null) e.current = clamp(hangarIndex, 0, e.hangar.length - 1);
    this._deploy(e);
    this.onEvent?.({ type: 'playerUp', entry: e });
    return true;
  }

  /* ================= per-frame ================= */

  update(dt, playerController) {
    this.frameId = (this.frameId || 0) + 1;

    if (this.state === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) { this.state = 'live'; this.onEvent?.({ type: 'go' }); }
    }
    const live = this.state === 'live';
    if (live) {
      this.time += dt;
      this.clock = Math.max(0, this.clock - dt);
    }

    // Frozen during the countdown, but the world still renders and animates.
    const simDt = live ? dt : dt * 0.0001;

    // Player intent.
    if (this.player?.mech && playerController) playerController.apply(this.player.mech, dt, live);

    // Bots.
    for (const m of this.mechs) {
      if (!m.alive) continue;
      const brain = this.brains.get(m.id);
      if (brain && live) brain.update(simDt);
    }

    // Lock-on for every mech that carries a lock weapon.
    for (const m of this.mechs) if (m.alive) this._updateLock(m, simDt);

    const ctx = { match: this, fireWeapon: (mech, w, pos, c) => this.combat.fireWeapon(mech, w, pos, c) };
    for (const m of this.mechs) {
      if (!m.alive) continue;
      m._ctx = ctx;
      m.update(simDt, ctx);
    }

    this.combat.update(simDt);
    this.world.update(dt, this.engine.camera.position);

    if (live) {
      this._updateRespawns(dt);
      this._updateObjective(dt);
      this._updateHazards(dt);
      this._checkEnd();
    }

    // Clean up stale reveals.
    this.reveals = this.reveals.filter(r => r.until > this.time);
  }

  _updateRespawns(dt) {
    for (const e of this.players) {
      if (e.alive || e.eliminated) continue;
      if (e.respawnIn === Infinity) continue;
      e.respawnIn -= dt;
      if (e.respawnIn <= 0 && !e.isPlayer) this._deploy(e);
    }
  }

  /** Missile lock acquisition, with ECM and smoke able to break it. */
  _updateLock(m, dt) {
    const hasLockWeapon = m.weapons.some(w => w && !w.destroyed && w.def.mode === 'lock');
    if (!hasLockWeapon) { m.lockedTarget = null; m.lockProgress = 0; return; }

    // Lock onto whoever the torso is pointed at.
    let candidate = null, bestAngle = 0.16;
    const eye = m.eyePosition(_v1);
    const fwd = m.aimForward(_v2);
    for (const o of this.aliveMechs()) {
      if (o.team === m.team) continue;
      const to = _v3.subVectors(o.position.clone().setY(o.position.y + o.height * 0.5), eye);
      const dist = to.length();
      if (dist > m.sensorRange * 2.2) continue;
      to.multiplyScalar(1 / dist);
      const dot = to.dot(fwd);
      if (dot < 0.9) continue;
      const ang = Math.acos(clamp(dot, -1, 1)) - Math.atan2(o.radius, dist);
      if (ang > bestAngle) continue;
      if (!this.world.lineOfSight(eye, o.position.clone().setY(o.position.y + o.height * 0.5), o.radius * 0.8)) continue;
      if (this.world.smokeBlocks(eye, o.position)) continue;
      if (this._jammed(m, o)) continue;
      bestAngle = ang;
      candidate = o;
    }

    if (!candidate) {
      m.lockProgress = Math.max(0, m.lockProgress - dt * 1.6);
      if (m.lockProgress <= 0) m.lockedTarget = null;
      return;
    }
    if (m.lockCandidate !== candidate) { m.lockCandidate = candidate; m.lockProgress = 0; }
    const lockWeapon = m.weapons.find(w => w && !w.destroyed && w.def.mode === 'lock');
    const lockTime = (lockWeapon?.def.lockTime || 1.0) * m.lockTimeMul;
    m.lockProgress = Math.min(1, m.lockProgress + dt / Math.max(0.1, lockTime));
    if (m.lockProgress >= 1) {
      if (m.lockedTarget !== candidate && m.isPlayer) this.audio.play('lockon');
      m.lockedTarget = candidate;
    } else if (m.isPlayer && Math.random() < dt * 8) {
      this.audio.play('lock');
    }
  }

  _jammed(observer, target) {
    for (const m of this.aliveMechs()) {
      if (!m.ecmRadius || m.team === observer.team) continue;
      if (m.position.distanceTo(target.position) < m.ecmRadius * (1 - observer.ecmResist)) return true;
    }
    return false;
  }

  _updateHazards(dt) {
    const h = this.world.def.hazard;
    if (!h) return;
    if (h === 'lightning') {
      this._lightningTimer = (this._lightningTimer || 4) - dt;
      if (this._lightningTimer <= 0) {
        this._lightningTimer = this.rng.range(5, 12);
        // Strikes the tallest exposed mech, which makes height a real trade.
        let best = null, bestY = -Infinity;
        for (const m of this.aliveMechs()) if (m.position.y > bestY) { bestY = m.position.y; best = m; }
        if (best) {
          const p = best.position.clone().setY(best.position.y + best.height);
          this.fx.ring(p, 1, 26, 0xc8e4ff, 0.5);
          this.fx.light(p, 0xdfefff, 120, 0.3, 300);
          this.fx.explosion(best.position.clone(), 1.2, 0xc8e4ff);
          this.audio.explosion(best.position, 2);
          this.onLightning?.();
          this.applyDamage(best, null, 220, { location: 'HD', source: 'lightning', type: 'energy' });
          best.heat += 30;
          best.jammedFor = 2.5;
        }
      }
    } else if (h === 'water') {
      for (const m of this.aliveMechs()) {
        if (m.position.y > 2) continue;
        m.heat = Math.max(0, m.heat - 14 * dt);   // wading cools you
      }
    }
  }

  _updateObjective(dt) {
    const obj = this.mode.objective;
    if (obj !== 'points' && obj !== 'king') return;

    if (obj === 'king') {
      this.kingTimer -= dt;
      if (this.kingTimer <= 0) {
        this.kingTimer = this.mode.rotateEvery;
        this.activeZone = (this.activeZone + 1) % this.zones.length;
        this.onEvent?.({ type: 'zoneRotate', zone: this.zones[this.activeZone] });
        this.audio.play('callout');
      }
    }

    this.zoneTickAcc += dt;
    const tick = this.zoneTickAcc >= 1;
    if (tick) this.zoneTickAcc -= 1;

    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      const live = obj !== 'king' || i === this.activeZone;
      if (!live) {
        z.contested = false;
        this.world.updateZoneVisual(i, 0x445566, 0);
        continue;
      }
      const counts = {};
      for (const m of this.aliveMechs()) {
        const d = m.position.distanceTo(z.pos);
        if (d > z.radius || Math.abs(m.position.y - z.pos.y) > 26) continue;
        counts[m.team] = (counts[m.team] || 0) + 1;
        m.captureTime += dt;
      }
      const teams = Object.keys(counts);
      z.contested = teams.length > 1;
      const holder = teams.length === 1 ? teams[0] : null;

      if (holder) {
        const rate = 0.34 * Math.min(3, counts[holder]);
        if (z.owner === holder) {
          z.progress = Math.min(1, z.progress + rate * dt);
        } else {
          z.progress -= rate * dt;
          if (z.progress <= 0) {
            z.owner = holder;
            z.progress = 0.02;
            this.onEvent?.({ type: 'capture', zone: z, team: holder });
            this.audio.play('callout');
          }
        }
      } else if (!z.contested) {
        z.progress = Math.max(0, z.progress - 0.08 * dt);
      }

      if (tick && z.owner && !z.contested) this._addScore(z.owner, obj === 'king' ? 5 : 3);

      const col = z.contested ? 0xffd24e
                : z.owner === 'a' ? TEAM_COLORS.a
                : z.owner === 'b' ? TEAM_COLORS.b
                : 0xaabbcc;
      this.world.updateZoneVisual(i, col, z.progress);
    }
  }

  _checkEnd() {
    if (this.state === 'over') return;
    const m = this.mode;
    let winner = null, reason = '';

    if (m.objective === 'elimination') {
      const live = {};
      for (const p of this.players) if (!p.eliminated) live[p.team] = (live[p.team] || 0) + 1;
      const teams = Object.keys(live);
      if (teams.length === 1) { winner = teams[0]; reason = 'ELIMINATION'; }
      else if (teams.length === 0) { winner = 'draw'; reason = 'MUTUAL DESTRUCTION'; }
    }
    if (!winner && m.scoreLimit > 0) {
      for (const t of this._teams()) {
        if (this.scoreFor(t) >= m.scoreLimit) { winner = t; reason = 'SCORE LIMIT'; break; }
      }
    }
    if (!winner && this.clock <= 0) {
      const ranked = this._teams().sort((x, y) => this.scoreFor(y) - this.scoreFor(x));
      if (ranked.length > 1 && this.scoreFor(ranked[0]) === this.scoreFor(ranked[1])) { winner = 'draw'; reason = 'TIME -- DRAW'; }
      else { winner = ranked[0]; reason = 'TIME'; }
    }
    if (winner) this._end(winner, reason);
  }

  _teams() {
    if (this.mode.teams > 2) return this.players.map(p => p.team);
    return ['a', 'b'];
  }

  _end(winner, reason) {
    this.state = 'over';
    this.result = {
      winner, reason,
      playerWon: winner === this.player?.team,
      draw: winner === 'draw',
      scores: this._teams().map(t => ({ team: t, score: this.scoreFor(t) })),
      players: this.players.map(p => ({
        name: p.name, team: p.team, kills: p.kills, deaths: p.deaths,
        assists: p.assists, damage: Math.round(p.damage), healing: Math.round(p.healing),
        score: p.score, isPlayer: p.isPlayer,
      })).sort((x, y) => y.score - x.score),
    };
    this.audio.play(this.result.playerWon ? 'victory' : this.result.draw ? 'callout' : 'defeat');
    this.onEvent?.({ type: 'matchEnd', result: this.result });
  }

  dispose() {
    for (const m of this.mechs) { this.scene.remove(m.root); }
    this.mechs.length = 0;
    this.brains.clear();
    this.combat.reset();
  }
}

/* ------------------------------------------------------------------ *
 * Loadout helper: fill a chassis with weapons that fit its hardpoints
 * and stay inside its tonnage budget. Used for bots and for the
 * "auto-fit" button in the hangar.
 * ------------------------------------------------------------------ */
export function autoLoadout(chassis, rng = Math.random, opts = {}) {
  const r = typeof rng === 'function' ? rng : Math.random;
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const maxTier = opts.maxTier ?? 5;
  const roleRoll = r();
  // Pick a bracket for the whole machine so loadouts are coherent rather
  // than a random grab-bag: brawler, skirmisher, or sniper.
  const bracket = roleRoll < 0.34 ? [0, 220] : roleRoll < 0.7 ? [180, 460] : [400, 1200];

  const out = new Array(chassis.hardpoints.length).fill(null);
  let tons = 0;
  const budget = chassis.payload;

  // Fill the biggest hardpoints first -- they set the character of the build.
  const order = chassis.hardpoints
    .map((h, i) => ({ h, i }))
    .sort((a, b) => sizeRank(b.h.size) - sizeRank(a.h.size));

  for (const { h, i } of order) {
    const remaining = budget - tons;
    const candidates = WEAPONS.filter(w =>
      fitsHardpoint(w, h.size) &&
      w.tier <= maxTier &&
      w.tons <= remaining &&
      !(w.flags || []).includes('heal') &&
      w.opt >= bracket[0] * 0.6 && w.opt <= bracket[1]);
    if (!candidates.length) continue;
    // Prefer weapons that use most of the hardpoint and most of the budget.
    const scored = candidates.map(w => ({
      w, s: dps(w) * (0.5 + w.tons / Math.max(1, remaining)) * (sizeRank(w.size) === sizeRank(h.size) ? 1.35 : 1),
    })).sort((a, b) => b.s - a.s);
    const chosen = scored[Math.floor(Math.pow(r(), 2) * Math.min(6, scored.length))].w;
    out[i] = chosen.id;
    tons += chosen.tons;
  }

  // Support chassis get a repair beam in a spare slot.
  if (chassis.cls === 'support') {
    const idx = out.findIndex((v, i) => !v || chassis.hardpoints[i].size === 'M');
    if (idx >= 0) {
      const heal = WEAPONS.filter(w => (w.flags || []).includes('heal') && fitsHardpoint(w, chassis.hardpoints[idx].size) && w.tier <= maxTier);
      if (heal.length) {
        tons -= out[idx] ? WEAPON_BY_ID[out[idx]].tons : 0;
        out[idx] = pick(heal).id;
      }
    }
  }
  return out;
}

function sizeRank(s) { return { S: 0, M: 1, L: 2, XL: 3 }[s] ?? 0; }

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
