import * as THREE from 'three';
import { buildPerson, animatePerson } from './geom.js';
import { PAINTS, ENGINE_SPEED, ENGINE_RANGE, HULL_HP } from './ship.js';
import { GRAPPLE_RANGE } from './player.js';

const SAVE_KEY = 'driftlands-save-v1';

export const ITEMS = {
  gear: { name: 'Brass Gear', icon: '⚙️', tiers: [0, 1, 2, 3] },
  seed: { name: 'Seed Pod', icon: '🌱', tiers: [0, 1] },
  core: { name: 'Storm Core', icon: '🔮', tiers: [] },
  chart: { name: 'Star Chart', icon: '🗺️', tiers: [0, 1, 2, 3] },
  berry: { name: 'Sky Berry', icon: '🫐', tiers: [0, 1, 2] },
  feather: { name: 'Wind Feather', icon: '🪶', tiers: [] },
  glowcap: { name: 'Glowcap', icon: '🍄', tiers: [2, 3] },
  ore: { name: 'Ember Ore', icon: '🔥', tiers: [3] },
};

export const SURVIVORS = [
  { id: 'pip', name: 'Pip', role: 'Mechanic', tier: 0, color: 0xf2a541, hat: 0x6a4a2a,
    unlock: 'Unlocks Aether Engine upgrades (faster ship, farther range)',
    hello: "You came for me? Ha! I've been tinkering with scrap here for weeks. Your engine sounds terrible — let me fix that.",
    quest: { item: 'gear', need: 3, reward: 'Afterburner: hold F at the helm for a speed burst', ask: 'Bring me 3 Brass Gears from chests and I\'ll build you an afterburner.' } },
  { id: 'marlow', name: 'Marlow', role: 'Gardener', tier: 0, color: 0x6cc650, hat: 0xd9c27a,
    unlock: 'Unlocks the Garden room — heals you 3× faster aboard',
    hello: 'Oh, thank the winds. Do you have room for a little garden on that ship? Plants need a home too.',
    quest: { item: 'seed', need: 3, reward: 'Sky Fruit: +25 max health', ask: 'Find me 3 Seed Pods and I\'ll grow you Sky Fruit — it makes you hardier.' } },
  { id: 'volta', name: 'Volta', role: 'Tinker', tier: 1, color: 0x6ad8ff, hat: null,
    unlock: 'Unlocks Shock arrows (key 3) — they chain between foes, and rain conducts them',
    hello: 'Careful! These coils bite. I can rig your arrows to carry a charge — especially nasty in the rain.',
    quest: { item: 'core', need: 2, reward: 'Overcharge: shock chains to 2 extra targets', ask: 'Storm Cores hum with lightning. Dive the Storm and bring me 2.' } },
  { id: 'wren', name: 'Wren', role: 'Cartographer', tier: 1, color: 0xd96aa0, hat: 0x3a2a5a,
    unlock: 'Chests now appear on your minimap and compass',
    hello: "Every island I chart sinks a month later. Infuriating! Let's map them together, quickly.",
    quest: { item: 'chart', need: 3, reward: 'Far Sight: minimap range doubled', ask: 'Collect 3 Star Charts from chests so I can see farther.' } },
  { id: 'bram', name: 'Bram', role: 'Cook', tier: 1, color: 0xe8e0d0, hat: 0xffffff,
    unlock: 'Hearty meals: +25 max health',
    hello: "Rescued by a hungry-looking captain. Perfect. I'll cook — you eat. That's how this works.",
    quest: { item: 'berry', need: 4, reward: 'Second Wind: health regenerates twice as fast', ask: 'Bring me 4 Sky Berries for my famous pie.' } },
  { id: 'juno', name: 'Juno', role: 'Aeronaut', tier: 2, color: 0xffd36a, hat: 0x8a5a2a,
    unlock: 'Unlocks Glider upgrades',
    hello: "I've glided between these rocks since I was six. Your glider? Adorable. Let me help.",
    quest: { item: 'feather', need: 5, reward: 'Glider Dash: press Shift while gliding', ask: 'Wind Feathers float in high, hard-to-reach places. Bring me 5.' } },
  { id: 'lumen', name: 'Lumen', role: 'Rigger', tier: 2, color: 0x9a6aff, hat: 0x2a2a3a,
    unlock: 'Unlocks Grapple upgrades',
    hello: 'Ropes, hooks, pulleys — that\'s my whole life. Your grapple line is fraying. Tsk.',
    quest: { item: 'glowcap', need: 3, reward: 'Zipline: grapple pulls 50% faster', ask: 'Glowcaps grow on the crystal isles. Bring 3 — I need their fibres.' } },
  { id: 'ash', name: 'Old Ash', role: 'Smith', tier: 3, color: 0xff6a3a, hat: 0x3a3030,
    unlock: 'Unlocks Bow upgrades',
    hello: 'Hmph. Out here in the embers, only the stubborn survive. I can forge you a proper bow.',
    quest: { item: 'ore', need: 3, reward: 'Piercing: arrows pass through enemies', ask: 'Ember Ore. Three pieces. From the burning isles. Go.' } },
];

export const UPGRADES = [
  { id: 'engine', name: 'Aether Engine', icon: '⚡', max: 5, needs: { 2: 'pip' },
    desc: (l) => `Speed ${ENGINE_SPEED[l - 1]} → ${ENGINE_SPEED[Math.min(l, 4)]} · Range ${ENGINE_RANGE[l - 1]}m → ${ENGINE_RANGE[Math.min(l, 4)]}m`,
    cost: (l) => ({ shards: [0, 60, 150, 300, 520][l], scrap: [0, 15, 35, 60, 90][l], cores: [0, 0, 3, 6, 10][l] }) },
  { id: 'hull', name: 'Reinforced Hull', icon: '🛡️', max: 4,
    desc: (l) => `Ship health ${HULL_HP[l - 1]} → ${HULL_HP[Math.min(l, 3)]} (survive longer in Storm Dives)`,
    cost: (l) => ({ shards: [0, 50, 140, 280][l], scrap: [0, 20, 40, 70][l], cores: [0, 0, 2, 5][l] }) },
  { id: 'grapple', name: 'Grapple Line', icon: '🪝', max: 3, needs: { 2: 'lumen' },
    desc: (l) => `Grapple range ${GRAPPLE_RANGE[l - 1]}m → ${GRAPPLE_RANGE[Math.min(l, 2)]}m`,
    cost: (l) => ({ shards: [0, 70, 180][l], scrap: [0, 15, 35][l], cores: [0, 0, 2][l] }) },
  { id: 'glider', name: 'Glider Wings', icon: '🪁', max: 3, needs: { 2: 'juno' },
    desc: () => 'Glide faster and sink slower',
    cost: (l) => ({ shards: [0, 70, 180][l], scrap: [0, 15, 35][l], cores: [0, 1, 3][l] }) },
  { id: 'bow', name: 'Skyforged Bow', icon: '🏹', max: 3, needs: { 2: 'ash' },
    desc: (l) => `Arrow damage ×${[1, 1.35, 1.8][l - 1]} → ×${[1, 1.35, 1.8][Math.min(l, 2)]}`,
    cost: (l) => ({ shards: [0, 90, 220][l], scrap: [0, 20, 45][l], cores: [0, 2, 4][l] }) },
  { id: 'garden', name: 'Garden Room', icon: '🌿', max: 1, base: 0, needs: { 1: 'marlow' },
    desc: () => 'A planter at the bow. Heal 3× faster while aboard',
    cost: () => ({ shards: 40, scrap: 10, cores: 0 }) },
  { id: 'lookout', name: "Crow's Nest", icon: '🔭', max: 1, base: 0,
    desc: () => 'A lookout atop the mast: minimap range +50%, and a great diving board',
    cost: () => ({ shards: 60, scrap: 15, cores: 0 }) },
];

function defaultSave() {
  return {
    v: 1,
    res: { shards: 0, scrap: 0, cores: 0 },
    items: {},
    upg: { engine: 1, hull: 1, grapple: 1, glider: 1, bow: 1, garden: 0, lookout: 0 },
    rescued: [], questDone: [], paint: 0, dives: 0, flags: {}, stats: { chests: 0, kills: 0, shards: 0 },
  };
}

export class Save {
  constructor() { this.data = defaultSave(); }
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      const def = defaultSave();
      this.data = { ...def, ...d, res: { ...def.res, ...d.res }, upg: { ...def.upg, ...d.upg }, flags: { ...d.flags }, stats: { ...def.stats, ...d.stats }, items: { ...d.items } };
      return true;
    } catch (e) { return false; }
  }
  exists() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
  write() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* storage unavailable */ } }
  reset() { this.data = defaultSave(); try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }
  get res() { return this.data.res; } get items() { return this.data.items; } get upg() { return this.data.upg; }
  get rescued() { return this.data.rescued; } get questDone() { return this.data.questDone; } get flags() { return this.data.flags; }
  get stats() { return this.data.stats; }
  get paint() { return this.data.paint; } set paint(v) { this.data.paint = v; }
  has(id) { return this.data.rescued.includes(id); }
  maxHp() { return 100 + (this.has('bram') ? 25 : 0) + (this.questDone.includes('marlow') ? 25 : 0); }
}

const beamGeo = new THREE.CylinderGeometry(1.2, 1.2, 400, 12, 1, true); beamGeo.translate(0, 200, 0);

export class Progress {
  constructor(G) {
    this.G = G;
    this.npcs = [];        // survivors waiting on islands {data, island, mesh, beam, local, rescued}
    this.crew = [];        // aboard the ship
  }

  gain(r, pos) {
    const G = this.G, s = G.save;
    const parts = [];
    for (const k of ['shards', 'scrap', 'cores']) {
      if (!r[k]) continue;
      s.res[k] += r[k];
      if (k === 'shards') s.stats.shards += r[k];
      parts.push(`+${r[k]} ${k === 'shards' ? '◆' : k === 'scrap' ? '⚙' : '✦'}`);
    }
    if (pos && parts.length) G.ui.popText(pos.clone().add(new THREE.Vector3(0, 2.2, 0)), parts.join('  '), '#8ff0ff');
    G.ui.refresh();
  }
  have(id) { return id === 'core' ? this.G.save.res.cores : (this.G.save.items[id] || 0); }
  addItem(id, n = 1, pos) {
    const G = this.G;
    G.save.items[id] = (G.save.items[id] || 0) + n;
    const it = ITEMS[id];
    if (pos) G.ui.popText(pos.clone().add(new THREE.Vector3(0, 2.8, 0)), `${it.icon} ${it.name}`, '#ffe08a');
    // quest progress hint
    for (const sv of SURVIVORS) {
      if (G.save.has(sv.id) && !G.save.questDone.includes(sv.id) && sv.quest.item === id) {
        if (this.have(id) >= sv.quest.need) G.ui.toast(`${it.icon} You have enough ${it.name}s for ${sv.name}! Talk to them aboard your ship.`, 4);
      }
    }
    G.ui.refresh();
  }

  rollChest(isl) {
    const G = this.G;
    const t = isl.tier;
    const mult = [1, 1.8, 3, 4.5][t];
    const shards = Math.round((14 + Math.random() * 18) * mult);
    const scrap = Math.round((3 + Math.random() * 6) * mult);
    const pos = new THREE.Vector3();
    return { shards, scrap, pos };
  }

  openChest(isl, c) {
    const G = this.G;
    c.opened = true;
    G.audio.play('chest');
    const wp = new THREE.Vector3(isl.pos.x + c.x, isl.pos.y + c.y + 1, isl.pos.z + c.z);
    const r = this.rollChest(isl);
    this.gain({ shards: r.shards, scrap: r.scrap }, wp);
    G.particles.burst(wp, 40, { color: [1, 0.85, 0.4], speed: 6, size: 0.5, life: 1, grav: 6, up: 5 });
    G.save.stats.chests++;
    // quest items for rescued survivors with active quests
    const wants = SURVIVORS.filter((s) => G.save.has(s.id) && !G.save.questDone.includes(s.id) && ITEMS[s.quest.item].tiers.includes(isl.tier)
      && this.have(s.quest.item) < s.quest.need);
    let gotItem = false;
    for (const s of wants) {
      if (Math.random() < 0.6) { setTimeout(() => this.addItem(s.quest.item, 1, wp), 350); gotItem = true; break; }
    }
    if (!gotItem && Math.random() < 0.3) {
      const pool = Object.keys(ITEMS).filter((k) => ITEMS[k].tiers.includes(isl.tier));
      const k = pool[Math.floor(Math.random() * pool.length)];
      setTimeout(() => this.addItem(k, 1, wp), 350);
    }
    G.save.write();
  }

  // ---- survivors in the world
  placeAll() {
    const G = this.G;
    this.npcs.forEach((n) => this.removeNpc(n));
    this.npcs = [];
    const used = new Set();
    for (const s of SURVIVORS) {
      if (G.save.has(s.id)) continue;
      const cands = G.islands.list.filter((i) => !i.small && !i.home && i.tier === s.tier && !used.has(i) && !i.survivor);
      // first survivor goes on a nearby island so new captains have an obvious first goal
      if (s.id === 'pip') cands.sort((a, b) => Math.hypot(a.pos.x, a.pos.z) - Math.hypot(b.pos.x, b.pos.z));
      const isl = s.id === 'pip' ? cands[0] : cands[Math.floor(Math.random() * cands.length)];
      if (!isl) continue;
      used.add(isl);
      this.place(s, isl);
    }
  }
  place(s, isl) {
    const G = this.G;
    const pt = isl.samplePoint(0.5) || { x: 0, y: isl.topH(0, 0), z: 0 };
    const mesh = buildPerson({ body: s.color, accent: 0xffffff, hat: s.hat });
    mesh.position.set(pt.x, pt.y, pt.z);
    isl.detail.add(mesh);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.set(pt.x, pt.y, pt.z);
    isl.group.add(beam);
    const npc = { data: s, island: isl, mesh, beam, local: new THREE.Vector3(pt.x, pt.y, pt.z), rescued: false, phase: Math.random() * 5 };
    isl.survivor = npc;
    this.npcs.push(npc);
  }
  detach(isl) {
    const n = isl.survivor;
    if (!n) return;
    this.removeNpc(n);
    this.npcs = this.npcs.filter((x) => x !== n);
    isl.survivor = null;
  }
  removeNpc(n) {
    if (n.mesh.parent) n.mesh.parent.remove(n.mesh);
    if (n.beam.parent) n.beam.parent.remove(n.beam);
    n.beam.material.dispose();
  }
  npcWorld(n) { return n.island.pos.clone().add(n.local); }

  rescue(n) {
    const G = this.G;
    const s = n.data;
    n.rescued = true;
    G.save.rescued.push(s.id);
    const wp = this.npcWorld(n);
    G.particles.burst(wp.clone().add(new THREE.Vector3(0, 1, 0)), 60, { color: [1, 0.95, 0.6], speed: 7, size: 0.6, life: 1.2, up: 6 });
    G.audio.play('rescue');
    this.removeNpc(n);
    this.npcs = this.npcs.filter((x) => x !== n);
    n.island.survivor = null;
    this.addCrew(s, true);
    G.ui.toast(`🎉 ${s.name} the ${s.role} has joined your crew and moved aboard!`, 4.5, 'good');
    G.ui.toast(`Unlocked: ${s.unlock}`, 5, 'good');
    if (G.save.rescued.length === 4) G.ui.toast('🎨 New paint unlocked: Gilded (open the workbench)', 4);
    G.ui.dialog(s, 'hello');
    G.save.write();
  }

  addCrew(s, fresh) {
    const G = this.G;
    const slot = G.save.rescued.indexOf(s.id);
    const standLocal = G.ship.addCabin(slot, s.color, s.name);
    const mesh = buildPerson({ body: s.color, accent: 0xffffff, hat: s.hat });
    G.ship.visual.add(mesh);
    mesh.position.copy(standLocal);
    mesh.rotation.y = standLocal.x > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.crew.push({ data: s, mesh, local: standLocal, phase: Math.random() * 5, baseYaw: mesh.rotation.y });
    if (fresh && s.id === 'marlow') G.ui.toast('Marlow can now build a Garden at your workbench', 3.5);
  }

  rebuildCrew() {
    const G = this.G;
    for (const id of G.save.rescued) { const s = SURVIVORS.find((x) => x.id === id); if (s) this.addCrew(s, false); }
  }

  talk(c) {
    const G = this.G;
    const s = c.data;
    if (G.save.questDone.includes(s.id)) { G.ui.dialog(s, 'done'); return; }
    if (this.have(s.quest.item) >= s.quest.need) {
      if (s.quest.item === 'core') G.save.res.cores -= s.quest.need;
      else G.save.items[s.quest.item] -= s.quest.need;
      G.save.questDone.push(s.id);
      G.audio.play('upgrade');
      G.ui.dialog(s, 'complete');
      G.ui.toast(`★ Quest complete! ${s.quest.reward}`, 5, 'good');
      if (s.id === 'marlow') G.player.hp = G.save.maxHp();
      G.save.write();
    } else G.ui.dialog(s, 'quest');
  }

  upgradeCost(u) {
    const lvl = this.G.save.upg[u.id];
    return u.cost(u.base === 0 ? lvl + 1 : lvl);
  }
  canUpgrade(u) {
    const G = this.G, s = G.save;
    const lvl = s.upg[u.id];
    if (lvl >= u.max) return { ok: false, why: 'Maxed' };
    const next = lvl + 1;
    const need = u.needs && Object.entries(u.needs).find(([l, who]) => next >= +l && !s.has(who));
    if (need) { const sv = SURVIVORS.find((x) => x.id === need[1]); return { ok: false, why: `Rescue ${sv.name} the ${sv.role}` }; }
    const c = this.upgradeCost(u);
    if (s.res.shards < c.shards || s.res.scrap < c.scrap || s.res.cores < c.cores) return { ok: false, why: 'Not enough resources', cost: c };
    return { ok: true, cost: c };
  }
  buy(u) {
    const G = this.G, s = G.save;
    const chk = this.canUpgrade(u);
    if (!chk.ok) { G.audio.play('error'); return false; }
    const c = chk.cost;
    s.res.shards -= c.shards; s.res.scrap -= c.scrap; s.res.cores -= c.cores;
    s.upg[u.id]++;
    if (u.id === 'garden') G.ship.buildGarden();
    if (u.id === 'lookout') G.ship.buildLookout();
    if (u.id === 'hull') G.ship.hp = G.ship.maxHp;
    G.audio.play('upgrade');
    G.particles.burst(G.ship.toWorld(G.ship.benchPos.clone().add(new THREE.Vector3(0, 1.5, 0))), 40, { color: [1, 0.85, 0.4], speed: 5, size: 0.4, life: 0.9, up: 3 });
    G.save.write();
    return true;
  }
  paintUnlocked(i) {
    const p = PAINTS[i], s = this.G.save;
    if (!p.unlock) return true;
    if (p.unlock === 'dive') return s.data.dives > 0;
    if (p.unlock === 'rescue4') return s.rescued.length >= 4;
    return false;
  }

  update(dt) {
    const G = this.G;
    for (const n of this.npcs) {
      n.phase += dt;
      const u = n.mesh.userData;
      // wave for help
      u.armR.rotation.x = -2.6 + Math.sin(n.phase * 6) * 0.4;
      u.armR.rotation.z = -0.3;
      const wp = this.npcWorld(n);
      n.mesh.rotation.y = Math.atan2(-(G.player.pos.x - wp.x), -(G.player.pos.z - wp.z));
      const d = wp.distanceTo(G.camera.position);
      n.beam.material.opacity = Math.min(0.35, 0.08 + d / 900) * (0.8 + Math.sin(G.time * 2 + n.phase) * 0.2);
      n.beam.visible = d > 25;
    }
    for (const c of this.crew) {
      c.phase += dt;
      animatePerson(c.mesh, c.phase * 2, 0, false, G.time);
      c.mesh.rotation.y = c.baseYaw + Math.sin(c.phase * 0.4) * 0.6;
    }
  }
}
