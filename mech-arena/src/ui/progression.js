/**
 * PROGRESSION & SAVE
 * ------------------------------------------------------------------
 * Credits, pilot XP, unlocks and the saved hangar. Everything lives in
 * one localStorage blob; a failed read simply starts a fresh profile
 * rather than breaking the game.
 */
import { MECHS, MECH_BY_ID } from '../data/mechs.js';
import { WEAPONS, WEAPON_BY_ID } from '../data/weapons.js';
import { PILOTS, IMPLANTS } from '../data/pilots.js';
import { SKINS, starterSkins, DEFAULT_SKIN } from '../data/skins.js';
import { TOURNAMENT_BY_ID } from '../data/tournaments.js';
import { autoLoadout } from '../game/match.js';
import { makeRng } from '../core/rng.js';

const KEY = 'ironvanguard.profile.v1';

/** XP needed to reach each rank; index is rank-1. */
const RANK_CURVE = Array.from({ length: 50 }, (_, i) => Math.round(900 * Math.pow(i + 1, 1.42)));

export const RANK_TITLES = [
  'CADET', 'RECRUIT', 'PILOT', 'SENIOR PILOT', 'LANCE CORPORAL', 'SERGEANT',
  'LIEUTENANT', 'CAPTAIN', 'MAJOR', 'COLONEL', 'COMMANDER', 'STAR COLONEL',
  'GALAXY COMMANDER', 'KHAN', 'LEGEND',
];

function freshProfile() {
  const rng = makeRng(0x1234);
  const starterMechs = ['wasp', 'centurion', 'locust'];
  return {
    version: 1,
    name: 'PILOT',
    credits: 6000,
    xp: 0,
    matches: 0, wins: 0, kills: 0, deaths: 0, damage: 0,
    ownedMechs: [...starterMechs],
    ownedWeapons: WEAPONS.filter(w => w.cost === 0).map(w => w.id),
    ownedPilots: PILOTS.filter(p => p.cost === 0).map(p => p.id),
    ownedImplants: [],
    ownedSkins: starterSkins(),
    pilotId: PILOTS[0].id,
    implants: [null, null, null],
    hangar: starterMechs.map((id, i) => ({
      chassisId: id,
      loadout: autoLoadout(MECH_BY_ID[id], rng, { maxTier: 1 }),
      skinId: DEFAULT_SKIN,
    })),
    settings: {
      quality: 'high', sensitivity: 0.0022, invertY: false, volume: 0.6,
      fov: 72, showFps: false, difficulty: 'regular', autoQuality: true,
      colourMode: 'default', uiScale: 1, shake: 1, damageNumbers: true, nameplates: true,
    },
    stats: { bestKills: 0, bestDamage: 0, favouriteMech: null, mechUse: {} },
    tournaments: { completed: [], best: {}, run: null },
  };
}

export class Progression {
  constructor() {
    this.data = this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return freshProfile();
      const p = JSON.parse(raw);
      // Merge forward so a profile saved by an older build still loads.
      const base = freshProfile();
      const merged = {
        ...base, ...p,
        settings: { ...base.settings, ...(p.settings || {}) },
        stats: { ...base.stats, ...(p.stats || {}) },
        tournaments: { ...base.tournaments, ...(p.tournaments || {}) },
      };
      if (!Array.isArray(merged.hangar) || !merged.hangar.length) merged.hangar = base.hangar;
      return merged;
    } catch {
      return freshProfile();
    }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* private mode: play on */ }
  }

  reset() { this.data = freshProfile(); this.save(); }

  /* ---- rank ---- */
  get rank() {
    let r = 1;
    for (let i = 0; i < RANK_CURVE.length; i++) { if (this.data.xp >= RANK_CURVE[i]) r = i + 2; else break; }
    return Math.min(r, RANK_CURVE.length);
  }
  get rankTitle() {
    return RANK_TITLES[Math.min(RANK_TITLES.length - 1, Math.floor((this.rank - 1) / 3.4))];
  }
  get xpIntoRank() {
    const r = this.rank;
    const prev = r <= 1 ? 0 : RANK_CURVE[r - 2];
    const next = RANK_CURVE[r - 1] ?? RANK_CURVE[RANK_CURVE.length - 1];
    return { have: this.data.xp - prev, need: next - prev };
  }

  /** Tier gate: content unlocks as the pilot ranks up, then costs credits. */
  tierUnlocked(tier) { return this.rank >= [0, 1, 4, 8, 13, 19][tier]; }

  owns(kind, id) {
    switch (kind) {
      case 'mech': return this.data.ownedMechs.includes(id);
      case 'weapon': return this.data.ownedWeapons.includes(id);
      case 'pilot': return this.data.ownedPilots.includes(id);
      case 'implant': return this.data.ownedImplants.includes(id);
      case 'skin': return this.data.ownedSkins.includes(id);
      default: return false;
    }
  }

  priceOf(kind, id) {
    const rec = kind === 'mech' ? MECH_BY_ID[id]
      : kind === 'weapon' ? WEAPON_BY_ID[id]
      : kind === 'pilot' ? PILOTS.find(p => p.id === id)
      : kind === 'implant' ? IMPLANTS.find(p => p.id === id)
      : SKINS.find(s => s.id === id);
    return rec ? (rec.cost || 0) : 0;
  }

  tierOf(kind, id) {
    const rec = kind === 'mech' ? MECH_BY_ID[id]
      : kind === 'weapon' ? WEAPON_BY_ID[id]
      : kind === 'pilot' ? PILOTS.find(p => p.id === id)
      : kind === 'implant' ? IMPLANTS.find(p => p.id === id)
      : SKINS.find(s => s.id === id);
    return rec ? (rec.tier || 1) : 1;
  }

  /** @returns {{ok:boolean, reason?:string}} */
  buy(kind, id) {
    if (this.owns(kind, id)) return { ok: false, reason: 'Already owned' };
    const tier = this.tierOf(kind, id);
    if (!this.tierUnlocked(tier)) return { ok: false, reason: `Requires rank ${[0, 1, 4, 8, 13, 19][tier]}` };
    const price = this.priceOf(kind, id);
    if (price > this.data.credits) return { ok: false, reason: 'Not enough credits' };
    this.data.credits -= price;
    const bucket = { mech: 'ownedMechs', weapon: 'ownedWeapons', pilot: 'ownedPilots', implant: 'ownedImplants', skin: 'ownedSkins' }[kind];
    this.data[bucket].push(id);
    this.save();
    return { ok: true };
  }

  /* ---- post-match ---- */
  /**
   * Convert a match result into credits and XP.
   * Rewards lean on participation (damage, objectives) so a losing player
   * still makes progress, with a meaningful bonus for the win.
   */
  awardMatch(result, mode) {
    const me = result.players.find(p => p.isPlayer);
    if (!me) return null;
    const base = 240;
    const perf = me.kills * 85 + me.assists * 30 + Math.round(me.damage / 22) + Math.round(me.healing / 30);
    const winBonus = result.playerWon ? 500 : result.draw ? 200 : 0;
    const modeBonus = { control: 1.15, attrition: 1.25, juggernaut: 1.1 }[mode] || 1;
    const credits = Math.round((base + perf + winBonus) * modeBonus);
    const xp = Math.round((base * 0.7 + perf * 0.8 + winBonus * 0.6) * modeBonus);

    const before = this.rank;
    this.data.credits += credits;
    this.data.xp += xp;
    this.data.matches++;
    if (result.playerWon) this.data.wins++;
    this.data.kills += me.kills;
    this.data.deaths += me.deaths;
    this.data.damage += me.damage;
    this.data.stats.bestKills = Math.max(this.data.stats.bestKills, me.kills);
    this.data.stats.bestDamage = Math.max(this.data.stats.bestDamage, Math.round(me.damage));
    this.save();

    return { credits, xp, rankUp: this.rank > before, rank: this.rank, title: this.rankTitle };
  }

  recordMechUse(chassisId, seconds) {
    const u = this.data.stats.mechUse;
    u[chassisId] = (u[chassisId] || 0) + seconds;
    let best = null, bestT = 0;
    for (const [k, v] of Object.entries(u)) if (v > bestT) { bestT = v; best = k; }
    this.data.stats.favouriteMech = best;
  }

  /* ---- hangar ---- */
  get hangar() { return this.data.hangar; }

  setHangarSlot(i, build) {
    while (this.data.hangar.length <= i) this.data.hangar.push(null);
    this.data.hangar[i] = build;
    this.save();
  }

  removeHangarSlot(i) {
    this.data.hangar.splice(i, 1);
    if (!this.data.hangar.length) this.data.hangar = freshProfile().hangar.slice(0, 1);
    this.save();
  }

  /** The payload the Match constructor wants. */
  toMatchHangar() {
    const list = this.data.hangar.filter(Boolean).map(b => ({
      chassisId: b.chassisId,
      loadout: b.loadout,
      skinId: b.skinId,
    }));
    if (!list.length) list.push(freshProfile().hangar[0]);
    return {
      mechs: list,
      pilotId: this.data.pilotId,
      implants: this.data.implants.filter(Boolean),
      pilotName: this.data.name,
    };
  }

  setSetting(k, v) { this.data.settings[k] = v; this.save(); }
  get settings() { return this.data.settings; }

  /* ================= tournaments ================= */

  get run() { return this.data.tournaments.run; }

  tournamentState(id) {
    const t = TOURNAMENT_BY_ID[id];
    if (!t) return null;
    const run = this.run;
    return {
      def: t,
      completed: this.data.tournaments.completed.includes(id),
      best: this.data.tournaments.best[id] || 0,
      active: run?.id === id ? run : null,
      unlocked: this.rank >= t.rank,
      affordable: this.data.credits >= t.entryFee,
    };
  }

  /** @returns {{ok:boolean, reason?:string}} */
  enterTournament(id) {
    const t = TOURNAMENT_BY_ID[id];
    if (!t) return { ok: false, reason: 'No such circuit' };
    if (this.run) return { ok: false, reason: 'You are already in a circuit' };
    if (this.rank < t.rank) return { ok: false, reason: `Requires rank ${t.rank}` };
    if (this.data.credits < t.entryFee) return { ok: false, reason: 'Cannot cover the entry fee' };
    this.data.credits -= t.entryFee;
    this.data.tournaments.run = {
      id, round: 0, wins: 0,
      // The lance is locked for the whole circuit: that is the point of one.
      lance: JSON.parse(JSON.stringify(this.data.hangar.filter(Boolean))),
      pilotId: this.data.pilotId,
      implants: [...this.data.implants],
      credits: 0, xp: 0, kills: 0,
    };
    this.save();
    return { ok: true };
  }

  abandonRun() {
    this.data.tournaments.run = null;
    this.save();
  }

  /**
   * Record the result of a circuit round.
   * @returns {{finished:boolean, won:boolean, payout?:object, reward?:object, round?:object}}
   */
  advanceRun(result, award) {
    const run = this.run;
    if (!run) return { finished: true, won: false };
    const t = TOURNAMENT_BY_ID[run.id];

    run.credits += award?.credits || 0;
    run.xp += award?.xp || 0;
    const me = result.players.find(p => p.isPlayer);
    run.kills += me?.kills || 0;

    if (!result.playerWon) {
      // A loss ends the run. Rounds survived still count for the record.
      const reached = run.round;
      this.data.tournaments.best[run.id] = Math.max(this.data.tournaments.best[run.id] || 0, reached);
      this.data.tournaments.run = null;
      this.save();
      return { finished: true, won: false, roundsCleared: reached, total: t.rounds.length };
    }

    run.wins++;
    run.round++;
    this.data.tournaments.best[run.id] = Math.max(this.data.tournaments.best[run.id] || 0, run.round);

    if (run.round < t.rounds.length) {
      this.save();
      return { finished: false, won: true, round: t.rounds[run.round], index: run.round, total: t.rounds.length };
    }

    // Circuit won.
    this.data.credits += t.purse;
    this.data.xp += t.xp;
    if (!this.data.tournaments.completed.includes(t.id)) this.data.tournaments.completed.push(t.id);
    const reward = t.reward;
    let rewardGranted = null;
    if (reward.kind === 'skin' && !this.data.ownedSkins.includes(reward.id)) {
      this.data.ownedSkins.push(reward.id);
      rewardGranted = reward;
    } else if (reward.kind === 'mech' && !this.data.ownedMechs.includes(reward.id)) {
      this.data.ownedMechs.push(reward.id);
      rewardGranted = reward;
    }
    this.data.tournaments.run = null;
    this.save();
    return {
      finished: true, won: true, total: t.rounds.length,
      payout: { credits: t.purse, xp: t.xp }, reward: rewardGranted, tournament: t,
    };
  }

  /** The locked lance a circuit round must be fought with. */
  runHangar() {
    const run = this.run;
    if (!run) return this.toMatchHangar();
    return {
      mechs: run.lance.map(b => ({ chassisId: b.chassisId, loadout: b.loadout, skinId: b.skinId })),
      pilotId: run.pilotId,
      implants: (run.implants || []).filter(Boolean),
      pilotName: this.data.name,
    };
  }
}
