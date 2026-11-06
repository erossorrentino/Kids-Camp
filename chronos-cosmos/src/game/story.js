import * as THREE from 'three';
import { G } from '../core/G.js';
import { NPCManager } from '../actors/npc.js';
import { Builder, MATS } from '../world/structures.js';
import { mulberry32 } from '../core/noise.js';
import { POIS, poi, START } from '../world/worldmap.js';
import { ITEMS } from './items.js';

const H = (x, z) => G.terrain.heightAt(x, z);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Runtime glue between the world, NPCs, quests, bosses and endings.
export class Story {
  constructor() {
    this.npcs = new NPCManager();
    G.npcs = this.npcs;
    this.motes = [];
    this.chests = [];
    this.echoes = [];
    this.braziers = [];
    this.seedSpot = { x: -318, z: 262 };
  }

  get S() {
    return G.game.state;
  }

  npcPos(id) {
    const n = this.npcs.get(id);
    return n ? { x: n.pos.x, z: n.pos.z } : null;
  }

  // ------------------------------------------------------------------ build
  build() {
    this.buildNPCs();
    this.buildInteractables();
    this.buildMotes();
    this.buildChests();
    this.buildTrials();
    this.buildSunheart();
    // quest camps
    G.spawner.camps.push(
      { id: 'quest_thorn', x: -245, z: 420, r: 5, epochs: [0], types: ['thornling'], count: 3, level: 1, cleared: false, active: false, enemies: [], cond: () => G.quests.stepId('main1') === 'thorns' },
      { id: 'quest_hounds', x: 330, z: -40, r: 6, epochs: [1], types: ['hound', 'hound', 'husk'], count: 4, level: 2, cleared: false, active: false, enemies: [], cond: () => G.quests.isActive('locket') && G.quests.stepId('locket') === 'nest' },
    );
  }

  buildNPCs() {
    const h = G.content.hearthmere;
    const k = G.content.kestrel;
    const cx = h.cx, cz = h.cz;
    const obs = h.obs;
    const N = (d) => this.npcs.add(d);
    const day = (at, act, from = 7, to = 19) => ({ from, to, at, act });
    // Age of Bloom — Hearthmere
    N({
      id: 'lyra', name: 'Lyra', title: 'Apprentice Astronomer', epochs: [0], x: START.x + 4, z: START.z - 3, voice: 1.25,
      rig: { colors: { skin: 0xf0c6a8, cloth: 0x5b3a8a, cloth2: 0x3a2a5a, leather: 0x5a3a24, hair: 0xc8642a }, hairStyle: 'long', robe: 0x4a2f78, cape: 0x2a2a6a, capeLength: 0.8, pauldrons: false, weapon: 'staff', weaponOpts: { color: 0x8a6a3a, gem: 0x8fe8ff } },
      dialogue: () => (!this.S.flags.met_lyra ? 'lyra_intro' : this.S.flags.fracture && !this.S.flags.told_lyra && this.S.flags.shift_unlocked ? 'lyra_return' : this.S.flags.maren_thanks && !this.S.flags.lyra_pillar ? 'lyra_pillar' : 'lyra_hub'),
      barks: ['The stars were wrong again last night.', 'Did you know the Spire casts no shadow at noon?', 'Hello, Wayfarer!'],
      ranged: true, element: 1, power: 9, boltColor: 0x8fe8ff, followSide: -1,
    });
    N({
      id: 'maren', name: 'Elder Maren', title: 'Village Elder', epochs: [0], x: cx + 2.5, z: cz + 1.5, elder: true, voice: 0.8,
      rig: { colors: { skin: 0xd8b090, cloth: 0x5a4a3a, cloth2: 0x4a3a2a, hair: 0xd8d8d8 }, hairStyle: 'bun', robe: 0x6a4a3a, pauldrons: false },
      dialogue: () => (!this.S.flags.talked_maren ? 'maren_intro' : G.quests.stepId('main1') === 'thanks' ? 'maren_thanks' : this.S.flags.told_lyra && !this.S.flags.maren_shards ? 'maren_shards' : 'maren_idle'),
      schedule: [day({ x: cx + 2.5, z: cz + 1.5 }, 'idle', 6, 21), { from: 21, to: 6, act: 'sleep' }],
      barks: ['Time is a river, child. Mind the current.', 'The well water tastes of stars tonight.'],
    });
    N({
      id: 'bram', name: 'Bram', title: 'Blacksmith', epochs: [0], x: cx - 19, z: cz + 17.5, voice: 0.7,
      rig: { colors: { skin: 0xc89070, cloth: 0x6a4a30, cloth2: 0x3a3028, hair: 0x2a1a10 }, hairStyle: 'beard', bareArms: true, pauldrons: false, scale: 1.08 },
      dialogue: 'bram', schedule: [day({ x: cx - 19, z: cz + 17.5 }, 'hammer', 7, 18), { from: 18, to: 22, at: { x: h.tav ? h.tav.x : cx, z: h.tav ? h.tav.z + 3 : cz }, act: 'idle' }, { from: 22, to: 7, act: 'sleep' }],
      barks: ['Iron sings if you treat it right.', 'Mind the sparks.'],
    });
    N({
      id: 'tilda', name: 'Tilda', title: 'Merchant', epochs: [0], x: cx + 7.5, z: cz - 4.6, voice: 1.15, faceDir: Math.PI + 0.9,
      rig: { colors: { skin: 0xe8b898, cloth: 0xa04a3a, cloth2: 0x6a3a2a, hair: 0x8a5a2a }, hairStyle: 'bun', robe: 0x8a3a2a, pauldrons: false },
      dialogue: 'tilda', schedule: [day({ x: cx + 7.5, z: cz - 4.6 }, 'idle', 8, 18), { from: 18, to: 8, act: 'sleep' }],
      barks: ['Fresh tonics!', 'Sunbloom, still dewy!'],
    });
    N({
      id: 'hob', name: 'Old Hob', title: 'Farmer', epochs: [0], x: cx - 34, z: cz + 50, elder: true, voice: 0.85,
      rig: { colors: { skin: 0xd0a080, cloth: 0x6a7a3a, cloth2: 0x4a4a2a, hair: 0xb0b0a0 }, hat: 0xc8a860, hairStyle: 'beard', pauldrons: false },
      dialogue: 'hob', schedule: [day({ x: cx - 34, z: cz + 50 }, 'hoe', 6, 17), { from: 17, to: 21, at: { x: cx - 4, z: cz + 7 }, act: 'sit' }, { from: 21, to: 6, act: 'sleep' }],
    });
    N({
      id: 'rosalind', name: 'Rosalind', title: 'Innkeeper', epochs: [0], x: h.tav ? h.tav.x + Math.sin(h.tav.ry) * 5 : cx, z: h.tav ? h.tav.z + Math.cos(h.tav.ry) * 5 : cz, voice: 1.1,
      rig: { colors: { skin: 0xf0c0a0, cloth: 0x3a6a4a, cloth2: 0x2a4a3a, hair: 0x5a2a1a }, hairStyle: 'tail', robe: 0x3a5a4a, pauldrons: false },
      dialogue: 'rosalind', schedule: [day(null, 'sweep', 7, 23), { from: 23, to: 7, act: 'sleep' }],
    });
    N({
      id: 'edric', name: 'Edric', title: 'Village Guard', epochs: [0], x: cx + 18, z: cz - 14, voice: 0.9, brave: true,
      rig: { build: 'knight', helm: true, colors: { cloth: 0x2a3a6a, metal: 0xa8a8b0 }, weapon: 'sword' }, armed: false,
      dialogue: 'guard', schedule: [day({ x: cx + 18, z: cz - 14 }, 'wander', 6, 22), { from: 22, to: 6, at: { x: cx + 12, z: cz - 8 }, act: 'idle' }],
    });
    for (let i = 0; i < 3; i++) {
      N({
        id: 'child' + i, name: ['Pip', 'Wren', 'Tam'][i], title: 'Village child', epochs: [0], x: cx + (i - 1) * 4, z: cz + 4, voice: 1.6,
        rig: { colors: { skin: [0xf0c8a8, 0xc89070, 0xe0b090][i], cloth: [0xc04a4a, 0x4a8ac0, 0xc0a04a][i], hair: [0x6a3a1a, 0x1a1a1a, 0xd0a050][i] }, hairStyle: 'short', scale: 0.62, pauldrons: false },
        dialogue: 'child', schedule: [{ from: 8, to: 19, at: { x: cx, z: cz }, act: 'wander', r: 13 }, { from: 19, to: 8, act: 'sleep' }],
        barks: ['Tag, you’re it!', 'Are you a real hero?', 'My dad says the Spire hums at night.'],
      });
    }
    N({
      id: 'orin', name: 'Orin', title: 'Huntsman', epochs: [0], x: k.cx + 3, z: k.cz + 4, voice: 0.85,
      rig: { colors: { skin: 0xc89070, cloth: 0x4a5a2a, cloth2: 0x3a3a22, leather: 0x5a3a20, hair: 0x3a2a1a }, hood: 0x3a4a22, pauldrons: false, cape: 0x3a4a22, capeLength: 0.7 },
      dialogue: 'orin', barks: ['Wind’s from the north. Good hunting weather.'],
    });
    // Age of Ash
    N({
      id: 'kael', name: 'Kael', title: 'Knight of the Iron Covenant', epochs: [1], x: cx + 3.5, z: cz - 2, voice: 0.75, brave: true,
      rig: { build: 'knight', colors: { skin: 0xc89878, cloth: 0x2a3040, cloth2: 0x22262e, leather: 0x3a2a1a, metal: 0x8a909a, hair: 0x1a1410 }, hairStyle: 'short', cape: 0x1e2a4a, weapon: 'greatsword', weaponOpts: { color: 0xb8c0c8, glow: 0xff9a4a, scale: 0.7 } },
      dialogue: () => (!this.S.flags.met_kael ? 'kael_intro' : 'kael_hub'), power: 15, followSide: 1,
      barks: ['Keep your guard up.', 'Husks hunt by sound. Walk soft.', 'Fire’s warm. Doesn’t mean you’re safe.'],
    });
    N({
      id: 'sela', name: 'Sela', title: 'Keeper of the Verdant Circle', epochs: [1], x: cx - 3, z: cz + 3, elder: true, voice: 0.9,
      rig: { colors: { skin: 0xb88a6a, cloth: 0x3a5a3a, cloth2: 0x2a3a2a, hair: 0xe0e0e0 }, hairStyle: 'long', robe: 0x3a5a3a, pauldrons: false, weapon: 'staff', weaponOpts: { color: 0x5a4a3a, gem: 0x8aff8a } }, armed: true,
      dialogue: () => (!this.S.flags.shift_unlocked ? 'sela_intro' : 'sela_hub'),
      talkCond: () => this.S.flags.met_kael,
      barks: ['Even in ash, seeds remember.', 'The Circle endures.'],
    });
    N({
      id: 'voss', name: 'Captain Voss', title: 'Iron Covenant', epochs: [1], x: k.cx + 4, z: k.cz + 2, voice: 0.7, brave: true,
      rig: { build: 'knight', helm: true, plume: 0x2a4a8a, colors: { cloth: 0x1e2a4a, metal: 0x6a707a }, cape: 0x1e2a4a, weapon: 'sword' },
      dialogue: 'voss', talkCond: () => this.S.flags.shift_unlocked, barks: ['The wall holds. For now.'],
    });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 1;
      N({
        id: 'refugee' + i, name: ['Mara', 'Dunn', 'Ilse'][i], title: 'Survivor', epochs: [1], x: cx + Math.sin(a) * 3.2, z: cz + Math.cos(a) * 3.2, faceDir: a + Math.PI,
        rig: { colors: { skin: [0xd0a080, 0xb88060, 0xe0b898][i], cloth: 0x4a4038, cloth2: 0x3a3028, hair: [0x3a2a1a, 0x1a1a1a, 0x8a6a4a][i] }, hood: i === 1 ? 0x4a4038 : undefined, hairStyle: 'short', pauldrons: false },
        dialogue: 'refugee', schedule: [{ from: 0, to: 24, at: { x: cx + Math.sin(a) * 3.2, z: cz + Math.cos(a) * 3.2 }, act: 'sit' }],
        barks: ['Do you have any bread?', 'The husks came at night last time.'],
      });
    }
    for (let i = 0; i < 2; i++) {
      N({
        id: 'soldier' + i, name: ['Sgt. Hale', 'Pvt. Rook'][i], title: 'Iron Covenant', epochs: [1], x: k.cx - 20, z: k.cz + (i ? 4 : -4), brave: true, faceDir: -Math.PI / 2,
        rig: { build: 'knight', helm: true, colors: { cloth: 0x1e2a4a, metal: 0x5a606a }, weapon: 'sword' }, armed: true,
        dialogue: 'soldier', barks: ['Halt. Oh, it’s you.', 'Eyes on the treeline.'],
      });
    }
    // Age of Stars
    const ab = G.content.astral.base;
    N({
      id: 'oriel', name: 'Oriel', title: 'Keeper-light', epochs: [2], x: ab.x + 9, z: ab.z + 5, orb: 0x9fd8ff,
      dialogue: () => (!this.S.flags.met_oriel ? 'oriel_intro' : 'oriel_hub'),
    });
    N({
      id: 'archivist', name: 'The Archivist', title: 'Star-pilgrim', epochs: [2], x: cx + 4, z: cz + 2, elder: true, voice: 0.9,
      rig: { colors: { skin: 0xc8b0a0, cloth: 0xe8e8ff, cloth2: 0xc8c8e8, hair: 0xffffff }, hood: 0xd8d8f8, robe: 0xe0e0ff, pauldrons: false, weapon: 'staff', weaponOpts: { color: 0xc0c0d0, gem: 0x9fd8ff } }, armed: true,
      dialogue: 'archivist',
    });
    for (let i = 0; i < 2; i++) {
      N({
        id: 'pilgrim' + i, name: ['Sister Vale', 'Brother Ash'][i], title: 'Star-pilgrim', epochs: [2], x: cx - 5 + i * 10, z: cz - 6,
        rig: { colors: { skin: 0xd0b0a0, cloth: 0xe0e0f8 }, hood: 0xd8d8f8, robe: 0xe0e0ff, pauldrons: false },
        dialogue: 'pilgrim', schedule: [{ from: 0, to: 24, at: { x: cx - 5 + i * 10, z: cz - 6 }, act: 'pray' }],
      });
    }
  }

  setFollow(id, on) {
    for (const k of ['lyra', 'kael', 'oriel']) this.S.flags[k + '_following'] = k === id ? on : this.S.flags[k + '_following'];
    this.S.flags[id + '_following'] = on;
    this.npcs.setFollower(id, on);
    G.hud.toast(on ? `${this.npcs.get(id).name} is travelling with you.` : `${this.npcs.get(id).name} will wait here.`, 'good');
  }
  recruit(id) {
    this.S.flags[id + '_recruited'] = true;
    this.setFollow(id, true);
  }
  restoreFollowers() {
    for (const k of ['lyra', 'kael', 'oriel']) if (this.S.flags[k + '_following']) this.npcs.setFollower(k, true);
  }

  unlockElement(i) {
    const S = this.S;
    if (S.elements[i]) return;
    S.elements[i] = true;
    const names = ['Ember', 'Frost', 'Storm', 'Chrono'];
    G.hud.banner(`${names[i]} Magic`, ['Ember bolts set foes ablaze', 'Frost lances freeze foes and water', 'Chain lightning arcs between foes', 'Time bubbles slow everything inside'][i], 'element');
    G.audio?.sfx('unlock');
  }

  // ----------------------------------------------------------- interactables
  buildInteractables() {
    const W = G.world;
    // campfires
    for (const c of G.content.campfires) {
      W.addInteractable({ pos: V(c.x, c.y, c.z), r: 3, label: c.name, verb: 'Rest at ', epochs: c.epochs, action: () => G.ui.openRest(c) });
    }
    // pillars
    G.content.pillars.forEach((p, i) => {
      W.addInteractable({
        pos: V(p.x, p.top, p.z), r: 3.5, dy: 2.5, label: p.name, verb: 'Attune ',
        action: () => this.attunePillar(p, i),
        cond: () => !(this.S.flags['pillar_' + p.id] && (i !== 0 || this.S.flags.fracture)) || (G.epochs.current === 2 && this.S.flags.met_oriel && !this.S.flags['echo_' + p.id]),
      });
    });
    // rifts
    for (const r of G.content.rifts) {
      W.addInteractable({ pos: V(r.x, r.y, r.z), r: 4, label: r.name, verb: 'Enter ', action: () => G.ui.openRiftMenu(r) });
    }
  }

  attunePillar(p, i) {
    const S = this.S;
    if (G.epochs.current === 2 && S.flags.met_oriel && !S.flags['echo_' + p.id]) {
      S.flags['echo_' + p.id] = true;
      S.flags.echoes = (S.flags.echoes || 0) + 1;
      G.fx.motes(p.x, p.top, p.z, 60, 0x9fd8ff, 2);
      G.hud.banner('Memory Echo', ['“I remember a garden of hours…”', '“I remember a voice that sang the dawn up…”', '“I remember being afraid of the dark between stars…”'][S.flags.echoes - 1] || '', 'item');
      G.audio?.sfx('keyItem');
      return;
    }
    if (!S.flags['pillar_' + p.id]) {
      S.flags['pillar_' + p.id] = true;
      S.flags.pillars = (S.flags.pillars || 0) + 1;
      if (!G.quests.st.pillars) G.quests.start('pillars');
      // reveal nearby points of interest
      let n = 0;
      for (const q of POIS) if (!S.discovered[q.id] && Math.hypot(q.x - p.x, q.z - p.z) < 380) { S.discovered[q.id] = true; n++; }
      G.player.gainXP(60);
      G.fx.motes(p.x, p.top, p.z, 80, 0xffe08a, 2);
      G.audio?.sfx('attune');
      G.hud.banner(p.name + ' attuned', n ? `${n} new places revealed on your map` : 'The land below is laid bare', 'discover');
    }
    if (i === 0 && !S.flags.fracture && G.quests.stepId('main1') === 'attune') this.fractureCutscene(p);
  }

  // ------------------------------------------------------------- collectibles
  buildMotes() {
    const rng = mulberry32(2024);
    const spots = [];
    for (const p of G.content.pillars) spots.push([p.x + 2.5, p.top + 0.8, p.z + 2.5]);
    spots.push([G.content.trial3.x, G.content.trial3.y + 0.8, G.content.trial3.z]);
    const sp = G.content.spire;
    spots.push([sp.x + 15, sp.y + 8, sp.z]);
    for (const is of G.content.astral.isles) spots.push([is.x + 2, is.y + 0.8, is.z]);
    // peaks, mesas, and hidden corners
    const extra = [[60, -560], [-480, -120], [-380, -250], [-420, 30], [150, -480], [-520, 300], [500, 420], [-60, 560], [420, -300], [0, 200], [250, 300], [-200, -420], [320, 120], [-140, 470], [520, -40], [-600, -100], [100, -250], [-300, 120]];
    for (const [x, z] of extra) spots.push([x + (rng() - 0.5) * 8, null, z + (rng() - 0.5) * 8]);
    spots.forEach(([x, y, z], i) => {
      const gy = y ?? H(x, z) + 1.0;
      const ep = i < 3 ? 0 : i % 3;
      if (this.S.collected['mote' + i]) return;
      const g = new THREE.Group();
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: [0xffe08a, 0xff9a5a, 0x9fd8ff][ep], emissiveIntensity: 4 }));
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.glowTex, color: [0xffe08a, 0xff9a5a, 0x9fd8ff][ep], transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.setScalar(2);
      g.add(core, glow);
      g.position.set(x, gy, z);
      G.scene.add(g);
      this.motes.push({ id: 'mote' + i, g, core, x, y: gy, z, ep });
    });
  }

  buildChests() {
    const list = [
      { id: 'c_trial1', x: G.content.trial1.x, z: G.content.trial1.z, y: G.content.trial1.y + 0.6, items: { tonic: 2, crystal: 2, starShard: 2 }, locked: () => !this.S.flags.trial1_done, reward: 'vigor' },
      { id: 'c_trial2', x: G.content.trial2.x, z: G.content.trial2.z, y: G.content.trial2.y, items: { starShard: 3, draught: 2 }, reward: 'stamina' },
      { id: 'c_trial3', x: G.content.trial3.x, z: G.content.trial3.z, y: G.content.trial3.y, items: { crystal: 3, draught: 1 }, reward: 'aether' },
      { id: 'c_crater', x: G.content.crater.x + 6, z: G.content.crater.z + 4, items: { ember: 4, iron: 3 } },
      { id: 'c_spire', x: G.content.spire.x - 12, z: G.content.spire.z - 6, y: G.content.spire.y, items: { starShard: 2, stew: 1 } },
      { id: 'c_colosseum', x: G.content.colosseum.x - 20, z: G.content.colosseum.z + 8, items: { iron: 4, tonic: 1 } },
      { id: 'c_ruin', x: -100, z: -120, items: { hide: 3, ember: 2 } },
      { id: 'c_peak', x: 150, z: -480, items: { crystal: 2, starShard: 1, stew: 1 } },
      { id: 'c_isle', x: G.content.astral.isles[4].x, z: G.content.astral.isles[4].z, y: G.content.astral.isles[4].y, items: { starShard: 4, crystal: 3 } },
      { id: 'c_shore', x: -170, z: 120, items: { tonic: 1, fiber: 4 } },
      { id: 'c_mesa', x: -420, z: 30, items: { iron: 3, starShard: 1 } },
      { id: 'c_east', x: 500, z: 380, items: { hide: 4, herb: 3 } },
    ];
    const chestGeo = new THREE.BoxGeometry(1.1, 0.6, 0.7);
    const lidGeo = new THREE.BoxGeometry(1.14, 0.25, 0.74);
    for (const c of list) {
      const y = c.y ?? H(c.x, c.z);
      const g = new THREE.Group();
      const base = new THREE.Mesh(chestGeo, MATS.wood);
      base.position.y = 0.3;
      const lidPivot = new THREE.Group();
      lidPivot.position.set(0, 0.6, -0.35);
      const lid = new THREE.Mesh(lidGeo, MATS.wood);
      lid.position.set(0, 0.12, 0.35);
      lidPivot.add(lid);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.08, 0.76), MATS.gold);
      trim.position.y = 0.58;
      g.add(base, lidPivot, trim);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      g.position.set(c.x, y, c.z);
      g.rotation.y = Math.atan2(START.x - c.x, START.z - c.z);
      G.scene.add(g);
      const glow = new THREE.PointLight(0xffd890, 2, 6, 2);
      glow.position.set(c.x, y + 1, c.z);
      G.scene.add(glow);
      const chest = { ...c, y, g, lidPivot, glow, opened: !!this.S.collected[c.id] };
      if (chest.opened) { lidPivot.rotation.x = -1.9; glow.visible = false; }
      G.collision.addBox(c.x, y + 0.3, c.z, 0.55, 0.3, 0.35, g.rotation.y, { tag: 'wood' });
      G.world.addInteractable({ pos: V(c.x, y, c.z), r: 2.2, label: 'Chest', verb: 'Open ', cond: () => !chest.opened && (!c.locked || !c.locked()), action: () => this.openChest(chest) });
      this.chests.push(chest);
    }
  }

  openChest(c) {
    c.opened = true;
    this.S.collected[c.id] = true;
    G.audio?.sfx('chest');
    G.player.startAction({ type: 'pickup', clip: G.player.clips.pickup, dur: 0.55 });
    c.anim = 0;
    c.glow.visible = false;
    G.fx.motes(c.x, c.y + 0.6, c.z, 30, 0xffe08a, 0.4);
    G.after(0.5, () => {
      for (const k in c.items) G.game.give(k, c.items[k]);
      if (c.reward === 'vigor') { G.player.maxHp += 20; G.player.hp = G.player.maxHp; G.hud.banner('Heart Vessel', '+20 maximum health', 'item'); }
      if (c.reward === 'stamina') { G.player.maxStamina += 20; G.player.stamina = G.player.maxStamina; G.hud.banner('Stamina Vessel', '+20 maximum stamina', 'item'); }
      if (c.reward === 'aether') { G.player.maxMana += 20; G.player.mana = G.player.maxMana; G.hud.banner('Aether Vessel', '+20 maximum aether', 'item'); }
      G.player.gainXP(25);
    });
  }

  buildTrials() {
    // Trial of Embers: braziers lit by fire magic
    const t1 = G.content.trial1;
    const lit = [];
    t1.braziers.forEach((b, i) => {
      const g = new THREE.Group();
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.3, 0.5, 12), MATS.bronze);
      bowl.position.y = 1.3;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.1, 8), MATS.bronze);
      stem.position.y = 0.55;
      g.add(bowl, stem);
      g.position.set(b.x, b.y, b.z);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      G.scene.add(g);
      const light = new THREE.PointLight(0xff8a3a, 0, 10, 2);
      light.position.set(b.x, b.y + 2, b.z);
      G.scene.add(light);
      G.collision.addCyl(b.x, b.z, b.y, b.y + 1.5, 0.5, { climbable: false });
      const d = {
        pos: V(b.x, b.y + 1.3, b.z), r: 0.8, lit: !!this.S.flags.trial1_done,
        onIgnite: () => {
          if (d.lit) return;
          d.lit = true;
          lit.push(i);
          G.audio?.sfx('ignite', { pos: d.pos });
          G.fx.elementBurst(b.x, b.y + 1.5, b.z, 0, 0.6);
          if (lit.length === 1) {
            this.trialTimer = 25;
            G.hud.toast('A brazier flares! Light the others before it fades (25s).', 'quest');
          }
          if (t1.braziers.every((_, k) => this.braziers[k].lit)) {
            this.trialTimer = 0;
            this.S.flags.trial1_done = true;
            G.hud.banner('Trial of Embers', 'The sealed chest unlocks', 'quest done');
            G.audio?.sfx('questDone');
          }
        },
        update: (dt) => {
          light.intensity = d.lit ? 6 + Math.sin(G.time * 15 + i) * 1.5 : 0;
          if (d.lit && Math.random() < dt * 25) G.fx.fire(b.x, b.y + 1.5, b.z, 0.8);
        },
      };
      this.braziers.push(d);
      G.world.destructibles.push(d);
    });
    this.trialTimer = 0;
  }

  buildSunheart() {
    // the hill north of Hearthmere; tree grows in later ages if planted
    const sx = this.seedSpot.x, sz = this.seedSpot.z, sy = H(sx, sz);
    this.seedSpot.y = sy;
    const mound = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), MATS.rock);
    mound.position.set(sx, sy - 0.3, sz);
    mound.scale.y = 0.4;
    G.scene.add(mound);
    const sprout = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.6, 6), new THREE.MeshStandardMaterial({ color: 0x8aff6a, emissive: 0x4aaa2a, emissiveIntensity: 1 }));
    sprout.position.set(sx, sy + 0.3, sz);
    sprout.visible = false;
    G.scene.add(sprout);
    // the great tree (Ash & Stars) — a giant climbable trunk with a canopy platform
    const b = new Builder('sunheart');
    const th = 34;
    b.cyl(MATS.woodDark, 2.4, 3.6, th, sx, sy - 1, sz, 14, { tag: 'wood' });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.cyl(MATS.woodDark, 0.8, 1.4, 4, sx + Math.sin(a) * 3.4, sy - 1, sz + Math.cos(a) * 3.4, 8, { rz: Math.sin(a) * 0.5, rx: -Math.cos(a) * 0.5, collide: false });
    }
    b.cyl(MATS.wood, 7, 7, 0.6, sx, sy + th - 1, sz, 20, { tag: 'wood' });
    const built = b.build();
    G.scene.add(built.group);
    const canopy = new THREE.Group();
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xffd86a, emissive: 0xc88a1a, emissiveIntensity: 0.8, roughness: 0.6, map: G.tex.leaf.map, normalMap: G.tex.leaf.normalMap });
    const rng = mulberry32(99);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(5 + rng() * 2, 1), leafMat);
      m.position.set(sx + Math.sin(a) * 8, sy + th + 4 + rng() * 3, sz + Math.cos(a) * 8);
      m.castShadow = true;
      canopy.add(m);
    }
    built.group.add(canopy);
    this.sunheart = { built, canopy, sprout, mound };
    const apply = (e) => {
      const grown = this.S.flags.seed_planted && e > 0;
      built.group.visible = grown;
      for (const c of built.cols) c.active = grown;
      sprout.visible = this.S.flags.seed_planted && e === 0;
      if (e === 1) leafMat.color.setHex(0xff9a4a), leafMat.emissive.setHex(0xaa3a0a);
      else leafMat.color.setHex(0xffd86a), leafMat.emissive.setHex(0xc88a1a);
    };
    this.sunheartSite = G.epochs.register({ x: sx, z: sz, apply });
    G.world.addInteractable({ pos: V(sx, sy, sz), r: 2.5, label: 'Sunheart Seed', verb: 'Plant ', epochs: [0], cond: () => G.game.count('seed') > 0 && !this.S.flags.seed_planted, action: () => {
      G.game.take('seed', 1);
      this.S.flags.seed_planted = true;
      apply(G.epochs.current);
      G.player.startAction({ type: 'pickup', clip: G.player.clips.pickup, dur: 0.55 });
      G.fx.healBurst(V(sx, sy, sz), 0xffe08a);
      G.hud.toast('You plant the seed. It glows faintly, as if it knows it has a long wait ahead.', 'quest');
      G.audio?.sfx('plant');
    } });
    // treasure in the canopy
    this.chests.length; // chest added below
    const c = { id: 'c_sunheart', x: sx + 3, z: sz, y: sy + th - 0.4, items: { starShard: 5, crystal: 4, ember: 3 } };
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.7), MATS.wood);
    base.position.y = 0.3;
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.6, -0.35);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.25, 0.74), MATS.gold);
    lid.position.set(0, 0.12, 0.35);
    lidPivot.add(lid);
    g.add(base, lidPivot);
    g.position.set(c.x, c.y, c.z);
    built.group.add(g);
    const glow = new THREE.PointLight(0xffd890, 2, 6, 2);
    glow.position.set(c.x, c.y + 1, c.z);
    built.group.add(glow);
    const chest = { ...c, g, lidPivot, glow, opened: !!this.S.collected[c.id] };
    G.world.addInteractable({ pos: V(c.x, c.y, c.z), r: 2.2, label: 'Chest', verb: 'Open ', cond: () => built.group.visible && !chest.opened, action: () => this.openChest(chest) });
    this.chests.push(chest);
    // Lyra's journal: buried under the ruined observatory (Ash) if hidden there
    const h = G.content.hearthmere;
    G.world.addInteractable({ pos: V(h.obs.x + 3, H(h.obs.x + 3, h.obs.z), h.obs.z + 2), r: 2.5, label: 'Loose flagstones', verb: 'Dig beneath ', epochs: [1, 2], cond: () => this.S.flags.journal_buried && !this.S.collected.journal, action: () => {
      this.S.collected.journal = true;
      G.game.give('journal', 1);
      G.player.startAction({ type: 'pickup', clip: G.player.clips.pickup, dur: 0.55 });
      G.hud.banner("Lyra's Journal", '“To whoever finds this: the Heart is not a thing. It is a someone.”', 'item');
      G.player.gainXP(80);
      this.S.affinity.lyra = Math.min(100, this.S.affinity.lyra + 5);
    } });
  }

  nextEcho() {
    for (const p of G.content.pillars) if (!this.S.flags['echo_' + p.id]) return { x: p.x, z: p.z, y: p.top };
    return null;
  }
  nextPillar() {
    for (const p of G.content.pillars) if (!this.S.flags['pillar_' + p.id]) return { x: p.x, z: p.z, y: p.top };
    return null;
  }

  // ---------------------------------------------------------------- scenes
  introCutscene(done) {
    const P = G.player;
    const sp = G.content.spire;
    G.cutscene.play([
      { fade: 1.5, cam: { from: V(-80, 70, 260), to: V(-40, 45, 160), look: V(sp.x, sp.y + 60, sp.z), lookTo: V(sp.x, sp.y + 80, sp.z), dur: 7, fov: 50 }, line: { s: '', t: 'Time is a river. Every Age of Aeloria flows into the next: Bloom, Ash, Stars.' } },
      { line: { s: '', t: 'At its heart stands the Chrono Spire, keeping every hour in its place.' }, keepLine: false },
      { cam: { from: V(sp.x - 60, sp.y + 140, sp.z + 60), to: V(sp.x - 30, sp.y + 125, sp.z + 30), look: V(sp.x, sp.y + 118, sp.z), dur: 6, fov: 45 }, line: { s: '', t: 'But a river can be broken. And a stone, skipped across it, can land anywhere.' } },
      { cam: { from: () => V(P.pos.x + 6, P.pos.y + 4, P.pos.z + 6), to: () => V(P.pos.x + 2.5, P.pos.y + 1.6, P.pos.z + 2.5), look: () => V(P.pos.x, P.pos.y + 0.4, P.pos.z), lookTo: () => V(P.pos.x, P.pos.y + 1.0, P.pos.z), dur: 4, fov: 50 }, line: { s: '', t: 'You wake on the shore of Mirror Lake with no memory, and a strange astrolabe humming on your wrist.' } },
    ], done);
  }

  fractureCutscene(p) {
    const sp = G.content.spire;
    const P = G.player;
    G.player.mode = 'locked';
    G.cutscene.play([
      { cam: { from: () => V(P.pos.x + 5, P.pos.y + 3, P.pos.z + 5), to: () => V(P.pos.x + 3, P.pos.y + 2, P.pos.z - 3), look: () => V(P.pos.x, P.pos.y + 1.3, P.pos.z), dur: 3, fov: 50 }, line: { s: '', t: 'The astrolabe’s rings spin faster, faster, until they blur into a single burning circle.' } },
      { cam: { from: () => V(P.pos.x, P.pos.y + 4, P.pos.z), to: () => V(P.pos.x - 5, P.pos.y + 6, P.pos.z - 5), look: V(sp.x, sp.y + 100, sp.z), dur: 3.5, fov: 40 }, line: { s: '', t: 'Far across the lake, the Chrono Spire answers. A light like a second sunrise.' }, fn: () => { G.atmo.flash = 1; G.cam.shake(0.8); G.audio?.sfx('thunderBig'); } },
      { fn: () => { G.epochs.shift(1, { force: true, center: P.pos, cooldown: 6 }); }, dur: 3.2, line: { s: '', t: 'And then the world breaks.' } },
      { cam: { from: () => V(P.pos.x + 8, P.pos.y + 4, P.pos.z + 8), to: () => V(P.pos.x - 6, P.pos.y + 3, P.pos.z + 9), look: () => V(P.pos.x, P.pos.y + 1, P.pos.z), dur: 4, fov: 55 }, line: { s: '', t: 'Ash. A red sky. Dead trees as far as you can see. Hearthmere lies in ruins below.' } },
    ], () => {
      G.player.mode = 'ground';
      this.S.flags.fracture = true;
      G.epochs.locked = true; // until Sela teaches you
    });
  }

  ending(kind) {
    const S = this.S;
    S.flags.ending_chosen = true;
    S.ending = kind;
    G.audio?.setMusic?.('ending');
    const sp = G.content.spire;
    const lines = [];
    const lyra = S.affinity.lyra, kael = S.affinity.kael, oriel = S.affinity.oriel;
    if (kind === 'restore') {
      lines.push('The Heart beats once, twice, and time begins to flow again. The Ages settle like sediment in clear water, one after another, as they always should have.');
      lines.push(lyra >= 30 ? 'In the Age of Bloom, Lyra watches the stars move correctly for the first time in her life, and laughs until she cries.' : 'In the Age of Bloom, Lyra closes her journal and begins a new one.');
      lines.push(S.flags.grain_verdant ? 'In the Age of Ash, Sela’s seed-grain sprouts in the first clean rain in a thousand years.' : S.flags.grain_covenant ? 'In the Age of Ash, the Iron Covenant marches out to clear the last of the husks, well-fed and unafraid.' : 'In the Age of Ash, soldiers and farmers share a long table under a slowly brightening sky.');
      lines.push(kael >= 30 ? 'Kael hangs his sister’s locket above the fort gate, and for once, sleeps through the night.' : 'Kael keeps his watch on the wall. Some habits outlive their reasons.');
      lines.push(oriel >= 20 ? 'And in the Age of Stars, a small light named Oriel drifts above the Spire, remembering everything, forgetting nothing, and content.' : 'And in the Age of Stars, the pilgrims sing a new verse about a Wayfarer who let the river run.');
    } else if (kind === 'claim') {
      lines.push('You close your hand around the Heart, and every hour of every Age bends toward you.');
      lines.push('The world is safe. It is always safe now. Nothing withers, nothing burns, nothing ends.');
      lines.push(lyra >= 30 ? 'Lyra visits the Spire every evening. She stops bringing her telescope. The stars no longer move.' : 'In Hearthmere, the same spring morning repeats, and no one notices but you.');
      lines.push('High in the Spire, the new Chronarch keeps the long watch. You begin, very slowly, to understand.');
    } else if (kind === 'release') {
      lines.push('The Heart splits into three clean lights, and the Ages drift apart like boats untied from a single dock.');
      lines.push('Bloom will never burn. Ash will never heal. Stars will shine over a world that never knew the others.');
      lines.push('Lyra, Kael and Oriel each live out their own Age, in their own way, never quite remembering the stranger who passed through.');
      lines.push('But sometimes, in all three Ages at once, someone looks up at the Spire and feels as if a friend just waved.');
    } else {
      lines.push('Across a thousand years, three voices answer yours. Lyra, from the Bloom. Kael, from the Ash. Oriel, from the Stars.');
      lines.push('Together you hold the Heart, not to stop time, but to share it. The Ages flow, and where they touch, doors open.');
      lines.push('Lyra and Kael argue about everything, from swords to supper. Oriel referees, badly.');
      lines.push('The Fourth Age begins: the Age of Cosmos, where no one walks through time alone.');
    }
    const steps = [];
    steps.push({ fade: 2, cam: { from: V(sp.x + 40, sp.y + 60, sp.z + 40), to: V(sp.x + 70, sp.y + 90, sp.z + 70), look: V(sp.x, sp.y + 90, sp.z), dur: 10, fov: 50 } });
    for (const l of lines) steps.push({ line: { s: '', t: l }, dur: Math.max(5, l.length * 0.06) });
    steps.push({ line: { s: '', t: 'CHRONOS & COSMOS. Thank you for playing. The world remains open: rifts, trials and secrets still await.' }, dur: 6 });
    G.cutscene.play(steps, () => {
      G.hud.banner('The End', { restore: 'Ending: The River Runs', claim: 'Ending: The Long Watch', release: 'Ending: Three Songs', together: 'Ending: The Fourth Age' }[kind], 'epoch');
      G.game.save(true);
      G.audio?.setMusic?.(null);
    });
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    const P = G.player;
    const ep = G.epochs.current;
    // motes
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      const on = m.ep === ep;
      m.g.visible = on;
      if (!on) continue;
      m.core.rotation.y += dt * 2;
      m.g.position.y = m.y + Math.sin(G.time * 2 + i) * 0.2;
      if (Math.hypot(P.pos.x - m.x, P.pos.z - m.z) < 1.6 && Math.abs(P.pos.y + 1 - m.y) < 2.2) {
        this.S.collected[m.id] = true;
        this.S.motes++;
        G.scene.remove(m.g);
        this.motes.splice(i, 1);
        G.fx.motes(m.x, m.y - 0.5, m.z, 30, 0xffe08a, 0.5);
        G.audio?.sfx('mote');
        const n = this.S.motes;
        if (n % 4 === 0) {
          const hp = (n / 4) % 2 === 1;
          if (hp) { P.maxHp += 10; P.hp = P.maxHp; } else { P.maxStamina += 15; P.stamina = P.maxStamina; }
          G.hud.banner('Star Mote', `${n} collected · ${hp ? '+10 max health' : '+15 max stamina'}`, 'item');
        } else G.hud.toast(`Star Mote collected (${n}/${this.motes.length + n})`, 'good');
        P.gainXP(20);
      }
    }
    // chest lid animation
    for (const c of this.chests) {
      if (c.opened && c.lidPivot.rotation.x > -1.9) c.lidPivot.rotation.x = Math.max(-1.9, c.lidPivot.rotation.x - dt * 4);
    }
    // trial of embers timer
    if (this.trialTimer > 0) {
      this.trialTimer -= dt;
      if (this.trialTimer <= 0 && !this.S.flags.trial1_done) {
        for (const b of this.braziers) b.lit = false;
        G.hud.toast('The braziers gutter out. Try again, faster.', 'warn');
        G.audio?.sfx('fizzle');
      }
    }
    // trial of frost: frigid water around the islet drains stamina fast
    const t3 = G.content.trial3;
    if (P.mode === 'swim' && Math.hypot(P.pos.x - t3.x, P.pos.z - t3.z) < 30) {
      P.useStamina(14 * dt);
      if (Math.random() < dt * 2) G.hud.toast('The water here is bitterly cold. Freeze it with Frost magic.', 'warn');
    }
    // companion perks
    const comp = this.npcs.currentCompanion();
    G.game.companionPerk = comp ? comp.id : null;
    // boss arenas
    G.bosses?.checkTriggers();
    // Hearthmere arrival moves Lyra home
    const lyra = this.npcs.get('lyra');
    if (this.S.flags.met_lyra && !this.S.flags.lyra_home && !lyra.following) {
      const h = G.content.hearthmere;
      lyra.home.set(h.obs.x + Math.sin(h.obs.ry) * 5.5, 0, h.obs.z - 4 + Math.cos(h.obs.ry) * 5.5);
      lyra.home.y = H(lyra.home.x, lyra.home.z);
      lyra.def.schedule = [{ from: 0, to: 24, at: { x: lyra.home.x, z: lyra.home.z }, act: 'idle' }];
      this.S.flags.lyra_home = true;
    }
    // shards unlock elements
    const n = (this.S.inv.shardDawn ? 1 : 0) + (this.S.inv.shardEmber ? 1 : 0) + (this.S.inv.shardStar ? 1 : 0);
    if (n >= 1 && !this.S.elements[2]) this.unlockElement(2);
    if (n >= 2 && !this.S.elements[3]) this.unlockElement(3);
    this.S.flags.shard_count = n;
    // the astrolabe is usable once Sela taught you (and the fracture happened)
    if (this.S.flags.shift_unlocked && G.epochs.locked && !G.cutscene.active) G.epochs.locked = false;
    G.quests.update(dt);
  }
}
