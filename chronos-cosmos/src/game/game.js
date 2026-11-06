import * as THREE from 'three';
import { G } from '../core/G.js';
import { ITEMS, MATERIALS, CONSUMABLES, SWORDS, ARMORS } from './items.js';
import { POIS, START, regionAt, REGION_EPOCH_NAMES } from '../world/worldmap.js';
import { EPOCHS } from '../world/epochs.js';

const SAVE_KEY = 'chronos-cosmos-save-v1';

export function newState() {
  const inv = {};
  for (const k of Object.keys(ITEMS)) inv[k] = 0;
  inv.tonic = 2;
  return {
    version: 1,
    inv,
    sword: 'wayfarer',
    armor: 'traveler',
    owned: { sword_wayfarer: true, armor_traveler: true },
    flags: {},
    quests: {},
    affinity: { lyra: 0, kael: 0, oriel: 0 },
    faction: { verdant: 0, covenant: 0 },
    elements: [true, true, false, false],
    discovered: {},
    collected: {},
    harvested: { t: [], r: [], c: [] },
    blocks: [],
    time: 8.5,
    day: 1,
    epoch: 0,
    player: null,
    stats: { kills: 0, parries: 0, timeslips: 0, spells: 0, rifts: 0, built: 0, shifts: 0 },
    motes: 0,
    vigor: 0,
    staminaUp: 0,
    glider: 0,
    mount: null,
    riftTier: 1,
    riftBest: 0,
    riftBoons: {},
    skills: [],
    level: 1,
    xp: 0,
    skillPoints: 0,
    spawn: { x: START.x, z: START.z },
    difficulty: 'balanced',
    playTime: 0,
    ending: null,
  };
}

export class Game {
  constructor() {
    this.state = newState();
    this.currentInteractable = null;
    this.deathT = 0;
    this.autosaveT = 60;
    this.peaceful = false;
    this.bossActive = null;
    this.inPocket = null;
    this.companionPerk = null;
    this.discoveredCheckT = 0;
    this.waypoint = null;
    this.lastRegion = null;
  }

  // ------------------------------------------------------------ inventory
  count(id) {
    return this.state.inv[id] || 0;
  }
  give(id, n = 1, quiet) {
    this.state.inv[id] = (this.state.inv[id] || 0) + n;
    G.hud?.pickup(id, n, this.state.inv[id]);
    G.quests?.onItem(id);
    if (!quiet && ITEMS[id]?.type === 'key') G.audio?.sfx('keyItem');
  }
  take(id, n = 1) {
    if ((this.state.inv[id] || 0) < n) return false;
    this.state.inv[id] -= n;
    return true;
  }
  canAfford(cost) {
    for (const k in cost) if (this.count(k) < cost[k]) return false;
    return true;
  }
  pay(cost) {
    if (!this.canAfford(cost)) return false;
    for (const k in cost) this.state.inv[k] -= cost[k];
    return true;
  }
  quickItem() {
    if (this.quickSel && this.count(this.quickSel) > 0) return this.quickSel;
    for (const id of CONSUMABLES) if (this.count(id) > 0) return id;
    return null;
  }
  useItem(id) {
    const P = G.player;
    if (!id || this.count(id) <= 0 || P.dead) return;
    if (P.action && P.action.type !== 'parry') return;
    const it = ITEMS[id];
    this.take(id, 1);
    P.startAction({
      type: 'drink', dur: 0.9, allowMove: true, moveMul: 0.35,
      onDone: () => {
        if (it.heal) P.heal(it.heal);
        if (it.mana) { P.mana = Math.min(P.maxMana, P.mana + it.mana); G.fx?.healBurst(P.pos, 0x72dcff); }
        if (it.stamina) { P.stamina = P.maxStamina; P.exhausted = false; }
      },
    });
    G.audio?.sfx('drink');
  }

  equipSword(key) {
    const s = SWORDS[key];
    this.state.sword = key;
    G.player.weaponDamage = s.dmg;
    G.player.rig.setWeapon('sword', { bladeColor: s.color, glow: s.glow, length: s.length, curve: s.curve });
    G.player.rig.sheathe(G.player.rig.sheathed);
  }
  equipArmor(key) {
    const a = ARMORS[key];
    this.state.armor = key;
    G.player.armor = a.armor;
    const rig = G.player.rig;
    rig.materials[1].color.setHex(a.cloth);
    if (rig.cape) {
      rig.cape.mesh.material.color.setHex(a.cape);
      rig.cape.mesh.material.emissive = new THREE.Color(a.capeGlow || 0x000000);
      rig.cape.mesh.material.emissiveIntensity = a.capeGlow ? 0.5 : 0;
    }
  }

  stat(k, n = 1) {
    this.state.stats[k] = (this.state.stats[k] || 0) + n;
  }

  markHarvest(kind, o) {
    // trees/rocks/crystals remember being harvested until you rest
    const list = this.state.harvested[kind];
    const arr = kind === 't' ? G.veg.trees : kind === 'r' ? G.veg.rocks : G.veg.crystals;
    const idx = arr.indexOf(o);
    if (idx >= 0) list.push(idx);
  }

  // --------------------------------------------------------- markers
  compassMarkers() {
    const out = [];
    for (const p of POIS) {
      if (!this.state.discovered[p.id]) continue;
      const kind = p.type;
      const color = { village: '#f3c66b', arena: '#ff6a5a', pillar: '#9fd8ff', trial: '#c9a8ff', rift: '#d07aff', camp: '#ffb36a', spire: '#fff2c0', astral: '#9fd8ff' }[kind] || '#ccc';
      if (Math.hypot(p.x - G.player.pos.x, p.z - G.player.pos.z) < 400) out.push({ x: p.x, z: p.z, color, kind: 'poi' });
    }
    const wp = this.activeWaypoint();
    if (wp) out.push({ x: wp.x, z: wp.z, color: wp.color || '#ffe08a', kind: 'quest', showDist: true });
    if (this.state.mount && G.mount?.tamed && G.mount.rig.root.visible) out.push({ x: G.mount.pos.x, z: G.mount.pos.z, color: '#b4e36c', kind: 'mount' });
    return out;
  }
  activeWaypoint() {
    if (this.inPocket) return null;
    if (this.waypoint) return this.waypoint;
    return G.quests?.waypoint() || null;
  }

  // ------------------------------------------------------------ loop
  update(dt) {
    const P = G.player;
    const inp = G.input;
    this.state.playTime += dt;
    // interactables
    this.currentInteractable = null;
    if (!P.dead && (P.mode === 'ground' || P.mode === 'swim' || P.mode === 'mounted') && !G.ui?.blocking && !G.build?.active) {
      this.currentInteractable = G.world.nearestInteractable(P.pos);
      if (P.mode === 'mounted' && this.currentInteractable && !this.currentInteractable.mountOk) this.currentInteractable = null;
    }
    if (inp.hit('interact') && this.currentInteractable && !G.ui?.blocking) {
      const it = this.currentInteractable;
      it.action(it);
    }
    if (!G.ui?.blocking && !P.dead) {
      if (inp.hit('lock') || inp.mousePressed.middle) G.combat.toggleLock();
      if (inp.keys.has('KeyG') && !this._gHeld) { this.useItem(this.quickItem()); }
      this._gHeld = inp.keys.has('KeyG');
    }
    // death
    if (P.dead) {
      this.deathT += dt;
      if (this.deathT > 3.2 && !this.respawning) {
        this.respawning = true;
        G.fx.screenFade(1.2);
        G.after(0.6, () => this.respawn());
      }
    }
    // discoveries
    this.discoveredCheckT -= dt;
    if (this.discoveredCheckT <= 0 && !this.inPocket) {
      this.discoveredCheckT = 0.5;
      for (const p of POIS) {
        if (this.state.discovered[p.id]) continue;
        const d = Math.hypot(p.x - P.pos.x, p.z - P.pos.z);
        if (d < Math.max(30, p.r * 0.9)) {
          this.state.discovered[p.id] = true;
          if (p.type !== 'camp' || true) {
            G.hud.banner(p.name, 'Location discovered', 'discover');
            G.audio?.sfx('discover');
            P.gainXP(15);
          }
        }
      }
      const reg = regionAt(P.pos.x, P.pos.z);
      const rname = REGION_EPOCH_NAMES[reg.id]?.[G.epochs.current] || reg.name;
      if (rname !== this.lastRegion) {
        if (this.lastRegion !== null) G.hud.toast(rname, 'region');
        this.lastRegion = rname;
        G.audio?.setRegion?.(reg.id);
      }
    }
    // autosave
    this.autosaveT -= dt;
    if (this.autosaveT <= 0) {
      this.autosaveT = 90;
      if (!P.dead && !this.bossActive && !this.inPocket && P.mode === 'ground') this.save(true);
    }
  }

  onEnemyKilled(e) {
    this.stat('kills');
    G.quests?.onKill(e);
  }
  onCampCleared(c) {
    if (c.reward) {
      G.hud.toast('Camp cleared', 'good');
      G.player.gainXP(25 * (c.level || 1));
    }
    G.quests?.onCampCleared(c);
  }
  onEpochSettled(e) {
    this.stat('shifts');
    G.quests?.onEpoch(e);
  }

  onPlayerDeath() {
    this.deathT = 0;
    this.respawning = false;
    G.hud.banner('Unwritten', 'Time folds back to your last campfire…', 'death');
    G.player.lockTarget = null;
  }

  respawn() {
    const P = G.player;
    if (this.bossActive) this.bossActive.onPlayerDeath?.();
    if (this.inPocket) {
      G.rift?.exit(false);
    }
    const s = this.state.spawn;
    const y = G.collision.groundAt(s.x, s.z, 500, 0.4, 999).h;
    P.revive(s.x, y + 0.1, s.z);
    G.cam.smoothTarget.copy(P.pos);
    this.respawning = false;
    // enemies reset their aggression
    for (const e of G.enemies) if (!e.dead && e.state !== 'idle') e.setState('return');
  }

  rest(where) {
    const P = G.player;
    P.hp = P.maxHp;
    P.mana = P.maxMana;
    P.stamina = P.maxStamina;
    P.exhausted = false;
    this.state.spawn = { x: where.x, z: where.z };
    G.spawner.resetAll();
    // regrow harvested things
    for (const i of this.state.harvested.t) { const t = G.veg.trees[i]; if (t && !t.alive) { t.alive = true; t.hp = 3; G.veg.refreshTree(t); } }
    for (const i of this.state.harvested.r) { const r = G.veg.rocks[i]; if (r && !r.alive) { r.alive = true; r.hp = 4; G.veg.refreshRock(r); } }
    for (const i of this.state.harvested.c) { const c = G.veg.crystals[i]; if (c && !c.alive) { c.alive = true; c.hp = 2; G.veg.refreshCrystal(c); } }
    this.state.harvested = { t: [], r: [], c: [] };
    this.save(true);
    G.fx.healBurst(P.pos, 0xffd27a);
    G.audio?.sfx('rest');
  }

  // ------------------------------------------------------------ save
  snapshot() {
    const P = G.player;
    const s = this.state;
    s.time = G.atmo.timeOfDay;
    s.day = G.atmo.day;
    s.epoch = G.epochs.current;
    s.player = { x: P.pos.x, y: P.pos.y, z: P.pos.z, yaw: P.yaw, hp: P.hp, mana: P.mana, maxHp: P.maxHp, maxMana: P.maxMana, maxStamina: P.maxStamina, element: P.element, stance: P.stance };
    s.level = P.level;
    s.xp = P.xp;
    s.skillPoints = P.skillPoints || 0;
    s.skills = [...P.skills];
    s.blocks = G.build ? G.build.serialize() : s.blocks;
    s.quests = G.quests ? G.quests.serialize() : s.quests;
    s.mount = G.mount && G.mount.tamed ? { x: G.mount.pos.x, z: G.mount.pos.z, name: G.mount.name } : s.mount;
    s.difficulty = G.settings.difficulty;
    return JSON.parse(JSON.stringify(s));
  }
  save(quiet) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.snapshot()));
      if (!quiet) G.hud.toast('Game saved', 'good');
      else G.hud?.saveBlip?.();
      return true;
    } catch (e) {
      if (!quiet) G.hud.toast('Saving is unavailable in this browser', 'warn');
      return false;
    }
  }
  static hasSave() {
    try {
      return !!localStorage.getItem(SAVE_KEY);
    } catch (e) {
      return false;
    }
  }
  static loadRaw() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  static clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (e) {}
  }

  // Apply a saved state to the live world
  apply(s) {
    const base = newState();
    this.state = Object.assign(base, s);
    this.state.inv = Object.assign(base.inv, s.inv || {});
    const P = G.player;
    if (s.player) {
      P.spawn(s.player.x, s.player.y, s.player.z);
      P.yaw = s.player.yaw || 0;
      P.maxHp = s.player.maxHp || 100;
      P.maxMana = s.player.maxMana || 100;
      P.maxStamina = s.player.maxStamina || 100;
      P.hp = Math.max(1, s.player.hp || P.maxHp);
      P.mana = s.player.mana ?? P.maxMana;
      P.element = s.player.element || 0;
      P.stance = s.player.stance || 'wind';
    }
    P.level = s.level || 1;
    P.xp = s.xp || 0;
    P.skillPoints = s.skillPoints || 0;
    P.skills = new Set(s.skills || []);
    G.atmo.timeOfDay = s.time ?? 8.5;
    G.atmo.day = s.day ?? 1;
    G.epochs.setInstant(s.epoch || 0);
    this.equipSword(this.state.sword || 'wayfarer');
    this.equipArmor(this.state.armor || 'traveler');
    // harvested state
    for (const i of this.state.harvested.t) { const t = G.veg.trees[i]; if (t) { t.alive = false; G.veg.refreshTree(t); } }
    for (const i of this.state.harvested.r) { const r = G.veg.rocks[i]; if (r) { r.alive = false; G.veg.refreshRock(r); } }
    for (const i of this.state.harvested.c) { const c = G.veg.crystals[i]; if (c) { c.alive = false; G.veg.refreshCrystal(c); } }
    if (G.build && s.blocks) G.build.deserialize(s.blocks);
    if (G.quests) G.quests.deserialize(s.quests || {});
    if (G.mount && s.mount) G.mount.restore(s.mount);
    if (s.difficulty) G.settings.difficulty = s.difficulty;
  }
}
