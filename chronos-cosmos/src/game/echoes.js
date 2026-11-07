import * as THREE from 'three';
import { G, HALF_WORLD } from '../core/G.js';
import { mulberry32 } from '../core/noise.js';
import { POIS, forestMask } from '../world/worldmap.js';
import { EPOCHS } from '../world/epochs.js';

// Echoes: 30 hidden glowing memories scattered across the three Ages (ten
// per Age, each only visible in its own Age). Finding them grants rewards
// at milestones. Feats: achievements checked once a second.

export const ECHO_TOTAL = 30;
const SPIN_AXIS = new THREE.Vector3(0.3, 1, 0.2).normalize();
const EP_COL = [0xffd86b, 0xff8a4c, 0x8fe8ff];
const REWARDS = {
  5: { hp: 10, text: 'Max health +10' },
  10: { st: 15, text: 'Max stamina +15' },
  15: { sp: 1, text: 'Gained a skill point' },
  20: { hp: 15, text: 'Max health +15' },
  25: { st: 20, text: 'Max stamina +20' },
  30: { sp: 2, hp: 25, text: 'Two skill points and max health +25' },
};

export class Echoes {
  constructor(scene) {
    this.list = this.place();
    const geo = new THREE.IcosahedronGeometry(0.26, 1);
    this.mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.4, 2.4) });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, ECHO_TOTAL);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.list.forEach((e, i) => this.mesh.setColorAt(i, new THREE.Color(EP_COL[e.ep])));
    scene.add(this.mesh);
    // soft halos (only the handful near the player are shown)
    this.halos = [];
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.glowTex, color: 0xffffff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.scale.setScalar(2.2);
      s.visible = false;
      scene.add(s);
      this.halos.push(s);
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this.chimeT = 0;
    this.sparkT = 0;
  }

  get found() {
    const S = G.game.state;
    return (S.flags.echoes = S.flags.echoes || []);
  }

  // Deterministic placement so saved ids stay valid between sessions.
  place() {
    const rng = mulberry32(4242);
    const T = G.terrain;
    const out = [];
    const ok = (x, z, ep, minGap = 70) => {
      if (Math.abs(x) > HALF_WORLD - 40 || Math.abs(z) > HALF_WORLD - 40) return false;
      const h = T.heightAt(x, z);
      if (h < EPOCHS[ep].water.level + 0.6) return false;
      for (const o of out) if (Math.hypot(o.x - x, o.z - z) < minGap) return false;
      return true;
    };
    const push = (x, z, ep, y) => out.push({ id: out.length, x, z, ep, y: y ?? T.heightAt(x, z) + 1.15 });
    // three on the floating isles (Stars)
    const isles = G.content?.astral?.isles || [];
    for (const is of isles.filter((i) => !i.arena).slice(0, 3)) push(is.x + 1.5, is.z - 1, 2, is.y + 1.3);
    // near landmarks, a little off the beaten path
    const pois = POIS.filter((p) => ['village', 'arena', 'pillar', 'trial', 'camp', 'rift'].includes(p.type));
    let k = 0;
    for (const p of pois) {
      for (let tries = 0; tries < 12; tries++) {
        const a = rng() * Math.PI * 2, d = (p.r || 20) + 18 + rng() * 30;
        const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
        const ep = k % 3;
        if (ok(x, z, ep)) { push(x, z, ep); k++; break; }
      }
    }
    // mountain tops and forest hollows for the rest
    let guard = 0;
    while (out.length < ECHO_TOTAL && guard++ < 6000) {
      const x = (rng() * 2 - 1) * (HALF_WORLD - 60), z = (rng() * 2 - 1) * (HALF_WORLD - 60);
      const h = T.heightAt(x, z);
      const peak = h > 90 && h >= T.heightAt(x + 12, z) && h >= T.heightAt(x - 12, z) && h >= T.heightAt(x, z + 12) && h >= T.heightAt(x, z - 12);
      const hollow = forestMask(x, z) > 0.6 && rng() < 0.3;
      if (!peak && !hollow) continue;
      const ep = [0, 1, 2].sort((a, b) => out.filter((o) => o.ep === a).length - out.filter((o) => o.ep === b).length)[0];
      if (ok(x, z, ep, 90)) push(x, z, ep);
    }
    // keep ten per Age
    return out.slice(0, ECHO_TOTAL);
  }

  nearestUnfound(p, r) {
    const ep = G.epochs.current;
    const found = this.found;
    let best = null, bd = r;
    for (const e of this.list) {
      if (e.ep !== ep || found.includes(e.id)) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  collect(e) {
    const found = this.found;
    if (found.includes(e.id)) return;
    found.push(e.id);
    const n = found.length;
    G.audio?.sfx('discover', { pos: this._v.set(e.x, e.y, e.z) });
    G.fx?.motes(e.x, e.y - 0.6, e.z, 40, EP_COL[e.ep], 0.6);
    G.fx?.ring(e.x, e.y - 1, e.z, 3, EP_COL[e.ep], 0.8, 0.6);
    G.hud.toast(`Echo found: ${n} / ${ECHO_TOTAL}`, 'echo');
    const r = REWARDS[n];
    if (r) {
      const P = G.player;
      if (r.hp) { P.maxHp += r.hp; P.hp = P.maxHp; }
      if (r.st) { P.maxStamina += r.st; P.stamina = P.maxStamina; }
      if (r.sp) P.skillPoints = (P.skillPoints || 0) + r.sp;
      G.after(1.2, () => { G.hud.toast(`The Echoes resonate. ${r.text}!`, 'good'); G.audio?.sfx('levelup'); });
    } else {
      const next = Object.keys(REWARDS).map(Number).find((m) => m > n);
      if (next) G.after(1.0, () => G.hud.toast(`${next - n} more until the Echoes resonate.`, ''));
    }
  }

  update(dt) {
    const S = G.game?.state;
    if (!S || !G.player) return;
    const hidden = !!G.game.inPocket || G.state === 'title';
    const P = G.player.pos;
    const ep = G.epochs.current;
    const found = this.found;
    const t = G.time;
    let hi = 0;
    let nearest = 1e9, near = null;
    this.list.forEach((e, i) => {
      const show = !hidden && e.ep === ep && !found.includes(e.id);
      const d = Math.hypot(e.x - P.x, e.z - P.z);
      const bob = Math.sin(t * 2 + i) * 0.15;
      this._v.set(e.x, e.y + bob, e.z);
      this._q.setFromAxisAngle(SPIN_AXIS, t * 1.3 + i);
      const sc = show && d < 220 ? 1 + Math.sin(t * 5 + i) * 0.08 + (e.sensed ? 0.25 : 0) : 0;
      this._s.setScalar(sc);
      this._m.compose(this._v, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
      if (!show) return;
      if (d < 60 && hi < this.halos.length) {
        const h = this.halos[hi++];
        h.visible = true;
        h.position.set(e.x, e.y + bob, e.z);
        h.material.color.setHex(EP_COL[e.ep]);
        h.material.opacity = 0.55 + Math.sin(t * 3 + i) * 0.15;
        h.scale.setScalar(e.sensed ? 3 : 2.2);
      }
      if (d < nearest) { nearest = d; near = e; }
      if (d < 1.9 && Math.abs(P.y + 1 - e.y) < 2.2 && G.state === 'play') this.collect(e);
    });
    for (let i = hi; i < this.halos.length; i++) this.halos[i].visible = false;
    this.mesh.instanceMatrix.needsUpdate = true;
    // a gentle chime and a few sparkles when one is close
    if (near && nearest < 28 && G.state === 'play') {
      this.chimeT -= dt;
      if (this.chimeT <= 0) {
        this.chimeT = 2.6;
        G.audio?.sfx('mote', { pos: this._v.set(near.x, near.y, near.z), volume: 0.5 });
      }
      this.sparkT -= dt;
      if (this.sparkT <= 0) {
        this.sparkT = 0.12;
        const c = this._c.setHex(EP_COL[near.ep]);
        G.fx?.add.emit({ x: near.x + (Math.random() - 0.5) * 1.2, y: near.y - 0.4 + Math.random(), z: near.z + (Math.random() - 0.5) * 1.2, vx: 0, vy: 0.6, vz: 0, life: 1, size: 0.09, size1: 0, color: [c.r * 3, c.g * 3, c.b * 3], shape: 2 });
      }
    }
  }
}

// ------------------------------------------------------------------ feats
export const FEATS = [
  { id: 'firstblood', name: 'First Blood', desc: 'Defeat your first foe.', check: (S) => S.stats.kills >= 1 },
  { id: 'hunter', name: 'Monster Hunter', desc: 'Defeat 50 foes.', check: (S) => S.stats.kills >= 50 },
  { id: 'parry', name: 'Perfect Guard', desc: 'Parry 10 attacks.', check: (S) => S.stats.parries >= 10 },
  { id: 'timeslip', name: 'Slow Motion', desc: 'Trigger 5 Timeslips with last-moment dodges.', check: (S) => S.stats.timeslips >= 5 },
  { id: 'spells', name: 'Spellweaver', desc: 'Cast 50 spells.', check: (S) => S.stats.spells >= 50 },
  { id: 'shifts', name: 'Time Traveler', desc: 'Shift between the Ages 10 times.', check: (S) => S.stats.shifts >= 10 },
  { id: 'builder', name: 'Architect', desc: 'Place 25 building pieces.', check: (S) => S.stats.built >= 25 },
  { id: 'rift', name: 'Rift Runner', desc: 'Survive a rift run.', check: (S) => S.stats.rifts >= 1 },
  { id: 'tamer', name: 'Beast Friend', desc: 'Tame a Duskhorn.', check: () => !!G.mounts?.list?.some((m) => m.tamed) },
  { id: 'fox', name: 'Faithful Friend', desc: 'Befriend Pip the fox.', check: (S) => !!S.flags.fox },
  { id: 'pets', name: 'Good Fox', desc: 'Pet Pip 10 times.', check: (S) => (S.stats.pets || 0) >= 10 },
  { id: 'dig', name: 'Buried Treasure', desc: 'Let Pip dig up 5 treasures.', check: (S) => (S.stats.digs || 0) >= 5 },
  { id: 'echo1', name: 'Echo Seeker', desc: 'Find your first Echo.', check: (S) => (S.flags.echoes || []).length >= 1 },
  { id: 'echo15', name: 'Echo Hunter', desc: 'Find 15 Echoes.', check: (S) => (S.flags.echoes || []).length >= 15 },
  { id: 'echo30', name: 'Keeper of Echoes', desc: `Find all ${ECHO_TOTAL} Echoes.`, check: (S) => (S.flags.echoes || []).length >= ECHO_TOTAL },
  {
    id: 'summit', name: 'Top of the World', desc: 'Climb to the top of the Chrono Spire.',
    check: () => {
      const t = G.content?.spireTop, P = G.player;
      return !!t && P.grounded && P.pos.y > t.y - 0.6 && Math.hypot(P.pos.x - t.x, P.pos.z - t.z) < 8;
    },
    reward: () => { G.player.gainXP(150); G.after(1.5, () => G.hud.toast('The whole of Aeloria stretches out below. Jump and glide down!', 'tip')); },
  },
  { id: 'sky', name: 'Head in the Clouds', desc: 'Stand on ground more than 200 m high.', check: () => G.player.grounded && G.player.pos.y > 200 },
  { id: 'photo', name: 'Snapshot', desc: 'Save a picture in Photo Mode.', check: (S) => (S.stats.photos || 0) >= 1 },
  { id: 'shards', name: 'Shardbearer', desc: 'Reclaim all three Shards.', check: (S) => !!(S.inv.shardDawn && S.inv.shardEmber && S.inv.shardStar) },
  { id: 'ending', name: 'Keeper of Time', desc: 'Decide the fate of time.', check: (S) => !!S.ending },
];

export class Feats {
  constructor() {
    this.t = 0;
  }
  get got() {
    const S = G.game.state;
    return (S.flags.feats = S.flags.feats || {});
  }
  update(dt) {
    if (G.state !== 'play' || !G.game?.state) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1;
    const S = G.game.state;
    const got = this.got;
    for (const f of FEATS) {
      if (got[f.id]) continue;
      let ok = false;
      try { ok = f.check(S); } catch (e) { ok = false; }
      if (ok) {
        got[f.id] = true;
        G.hud.toast(`Feat unlocked: ${f.name}`, 'feat');
        try { f.reward?.(); } catch (e) {}
        G.audio?.sfx('unlock');
        break; // one per second keeps the toasts readable
      }
    }
  }
  render(body) {
    const got = this.got;
    const S = G.game.state;
    const n = FEATS.filter((f) => got[f.id]).length;
    const ec = (S.flags.echoes || []).length;
    const wrap = document.createElement('div');
    wrap.className = 'feats';
    wrap.innerHTML = `<div class="feats-head"><h2>Feats</h2><p><b>${n}</b> of ${FEATS.length} unlocked · <b>${ec}</b> of ${ECHO_TOTAL} Echoes found${S.flags.fox ? ` · Pip has dug up <b>${S.stats.digs || 0}</b> treasures` : ''}</p></div>`;
    const grid = document.createElement('div');
    grid.className = 'feat-grid';
    for (const f of FEATS) {
      const c = document.createElement('div');
      c.className = 'feat' + (got[f.id] ? ' on' : '');
      c.innerHTML = `<span class="ic">${got[f.id] ? '★' : '☆'}</span><div><b>${f.name}</b><span>${f.desc}</span></div>`;
      grid.appendChild(c);
    }
    wrap.appendChild(grid);
    body.appendChild(wrap);
  }
}
