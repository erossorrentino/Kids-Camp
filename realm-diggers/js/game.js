'use strict';
// ============================================================
// Game controller: player, interaction, realms, saving, main loop
// ============================================================

const DAY_LEN = 600; // seconds for a full day/night in cycle realms

const Input = {
  keys: {}, pressed: new Set(), mouseL: false, mouseR: false, clickL: false, clickR: false, locked: false, everLocked: false,
  dragLook: false, dragging: false, joy: { x: 0, y: 0 }, btnMine: false, btnBuild: false, tapAttack: false, tapUse: false, tapAct: false,
  keyDown(code) { if (!this.keys[code]) this.pressed.add(code); this.keys[code] = true; },
  keyUp(code) { this.keys[code] = false; },
  consume(code) { if (this.pressed.has(code)) { this.pressed.delete(code); return true; } return false; },
};

const ACHIEVEMENTS = [
  { id: 'wood', name: 'Timber!', desc: 'Chop a log from a tree.' },
  { id: 'bench', name: 'Crafty', desc: 'Craft a Workbench.' },
  { id: 'woodpick', name: 'Pick It Up', desc: 'Craft a Wooden Pickaxe.' },
  { id: 'stonepick', name: 'Stone Age', desc: 'Craft a Stone Pickaxe.' },
  { id: 'torch', name: 'Light It Up', desc: 'Craft some Torches.' },
  { id: 'furnace', name: 'Hot Stuff', desc: 'Craft a Furnace.' },
  { id: 'iron', name: 'Iron Will', desc: 'Smelt an Iron Ingot.' },
  { id: 'firstmod', name: 'Modded!', desc: 'Find your first Mod.' },
  { id: 'ironpick', name: 'Heavy Metal', desc: 'Craft an Iron Pickaxe.' },
  ...REALMS.slice(1).map(r => ({ id: 'realm_' + r.key, name: 'Visit ' + r.name, desc: r.how })),
  { id: 'allgems', name: 'Gem Collector', desc: 'Collect all 8 Realm Gems.' },
  { id: 'boss', name: 'Champion of Realms', desc: 'Defeat the Prism Guardian in Prismara.' },
  { id: 'ruby', name: 'Seeing Red', desc: 'Mine a Ruby.' },
  { id: 'deep', name: 'Rock Bottom', desc: 'Dig down to the bottom of the world.' },
  { id: 'boom', name: 'Kaboom!', desc: 'Set off a Boom Barrel.' },
  { id: 'bounce', name: 'Boing!', desc: 'Bounce on a Bounce Pad.' },
  { id: 'eat', name: 'Snack Time', desc: 'Eat some food.' },
  { id: 'sleep', name: 'Sweet Dreams', desc: 'Sleep through the night in a Bed.' },
  { id: 'hunter', name: 'Monster Hunter', desc: 'Defeat 10 monsters.' },
  { id: 'builder', name: 'Master Builder', desc: 'Place 200 blocks.' },
  { id: 'mods10', name: 'Mod Collector', desc: 'Find 10 different Mods.' },
  { id: 'legendary', name: 'Legendary!', desc: 'Find a Legendary Mod.' },
  { id: 'mythic', name: 'Mythical', desc: 'Find a Mythic Mod.' },
  { id: 'spot10', name: 'Creature Spotter', desc: 'Find 10 different creatures (see the Creatures tab).' },
  { id: 'spot30', name: 'Wildlife Expert', desc: 'Find 30 different creatures.' },
  { id: 'modling', name: 'Mod Catcher', desc: 'Catch a sparkly Modling.' },
  { id: 'village', name: 'Neighbors', desc: 'Find a village.' },
  { id: 'trade', name: 'Fair Trade', desc: 'Trade with a villager.' },
];
const GOAL_CHAIN = ['wood', 'bench', 'woodpick', 'stonepick', 'furnace', 'iron', 'firstmod', 'village', 'ironpick', 'realm_emberdeep', 'realm_frostveil', 'realm_skyreach', 'realm_hollowdeep', 'realm_coralabyss', 'realm_sugarland', 'realm_lunara', 'realm_dinovalley', 'allgems', 'realm_prismara', 'boss'];
const GOAL_TEXT = {
  wood: 'Hold click on a tree trunk to chop a log.',
  bench: 'Press E. Craft Planks, then a Workbench.',
  woodpick: 'Place your Workbench, stand next to it and craft a Wooden Pickaxe.',
  stonepick: 'Mine some stone and craft a Stone Pickaxe.',
  furnace: 'Craft a Furnace from 8 Cobblestone.',
  iron: 'Find Iron Ore (tan spots in stone) and smelt it next to a Furnace.',
  firstmod: 'Mine ore or a sparkly Mod Geode to find a Mod.',
  village: 'Find a village: follow the yellow house on your map, then tap a villager to trade.',
  ironpick: 'Craft an Iron Pickaxe.',
  allgems: 'Collect a Realm Gem from each of the 8 other realms (mine their special ore).',
  boss: 'Defeat the Prism Guardian in the center of Prismara.',
};

const Game = {
  state: 'boot', slot: 0, save: null, world: null, realm: REALMS[0], player: null, stats: computeStats([], {}),
  creative: false, titleMode: true, time: 0.15, t: 0, rain: 0, raining: false, rainT: 200,
  edits: {}, abilityCD: { X: 0, R: 0, F: 0, Q: 0 }, pal: null, geode: null, windReady: 0, discT: 0, geodeT: 0, xrayT: 0, xrayScanT: 0, xrayList: [],
  barrels: [], boss: null, rocket: null, travel: null, shake: 0, hurtFlash: 0,
  mining: null, attackCD: 0, useCD: 0, autosaveT: 30, hudT: 0, mmT: 0, lightT: 0, lights: [], frameN: 0, mem: {},
  batches: null,

  // ---------------- boot ----------------
  boot() {
    Settings.load();
    try { buildAtlas(); buildIcons(); } catch (e) { console.error(e); }
    let ok = false;
    try { ok = Renderer.init($('gl')); } catch (e) { console.error(e); }
    if (!ok) { UI.show('scr-error'); return; }
    this.batches = { ents: new Batch(90000), parts: new Batch(40000), lines: new Batch(64), xray: new Batch(30000), echo: new Batch(40000) };
    UI.init();
    this.setupInput();
    this.startTitleWorld();
    UI.showTitle();
    this.last = performance.now();
    requestAnimationFrame(t => this.frame(t));
  },
  hookWorld(w) {
    w.onMesh = (c, o, t) => Renderer.uploadChunk(c, o, t);
    w.onFree = c => Renderer.freeChunk(c);
  },
  freeWorld() { if (this.world) for (const c of this.world.chunks.values()) Renderer.freeChunk(c); },
  startTitleWorld() {
    this.freeWorld();
    this.titleMode = true; this.creative = true; this.save = null;
    Mobs.clear(); Projectiles.list = []; Particles.list = []; this.barrels = []; this.boss = null; this.rocket = null; this.travel = null; this.xrayT = 0;
    $('fx-fade').style.opacity = 0; UI.bossBar(null);
    this.realm = REALM.greenhollow;
    this.world = new World(this.realm, 20261107, new Map()); this.hookWorld(this.world);
    this.world.generateArea(40, 40, 1);
    this.player = this.makePlayer(null);
    const sy = Math.max(this.world.surfaceY(40, 40), GH_SEA);
    Object.assign(this.player, { x: 40, y: sy + 14, z: 40, yaw: 0.6, pitch: -0.28 });
    this.time = 0.12; this.stats = computeStats([], {});
  },
  makePlayer(s) {
    s = s || {};
    return {
      x: 0, y: 80, z: 0, vx: 0, vy: 0, vz: 0, w: 0.6, h: 1.8, yaw: s.yaw || 0, pitch: s.pitch || 0,
      onGround: false, inWater: false, headInWater: false, inLava: false, headInLava: false, climbing: false,
      hp: s.hp !== undefined ? s.hp : 20, food: s.food !== undefined ? s.food : 20, air: 10, fuel: 0, airJumpsLeft: 0,
      flying: false, sneaking: false, sprinting: false, fallStart: 80, dead: false, hurtCD: 0, regenT: 0, healT: 0,
      hungerAcc: 0, starveT: 0, lastSpace: -1, lastW: -1, bob: 0, stepT: 0, speedBoost: 0, lavaT: 0, hurtBlockT: 0, airT: 0, autoJumpT: 0,
      inv: (s.inv || new Array(36).fill(null)).map(x => (x ? { id: x.id, n: x.n } : null)), sel: 0, armor: s.armor || null,
    };
  },

  // ---------------- saves ----------------
  storageKey(i) { return 'rd_slot_' + i; },
  slotMeta(i) {
    const st = safeStorage();
    try {
      const raw = st ? st.getItem('rd_meta_' + i) : (this.mem[i] && this.mem[i].meta);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
  deleteSlot(i) {
    const st = safeStorage();
    if (st) try { st.removeItem(this.storageKey(i)); st.removeItem('rd_meta_' + i); } catch (e) { /* ignore */ }
    delete this.mem[i];
  },
  newSaveData(name, mode, seed) {
    return { v: 1, name, mode, seed, created: Date.now(), playTime: 0, realm: 'greenhollow', pos: null, yaw: 0, pitch: 0, hp: 20, food: 20,
      inv: new Array(36).fill(null), armor: null, mods: {}, equipped: [], discovered: ['greenhollow'], gems: [], seen: [], achievements: [],
      realms: {}, creatures: [], time: 0.04, bedSpawn: null, bossDefeated: false, counters: { kills: 0, placed: 0 } };
  },
  newGame(slot, name, mode, seed) {
    this.slot = slot;
    this.save = this.newSaveData(name, mode, seed);
    if (mode === 'creative') {
      const hot = ['grass', 'stone_bricks', 'planks', 'glass', 'torch', 'paint_red', 'paint_blue', 'boom_barrel', 'bounce_pad'];
      hot.forEach((k, i) => { this.save.inv[i] = { id: idOf(k), n: itemDef(idOf(k)).stack }; });
      this.save.inv[9] = { id: I.igniter, n: 1 };
    }
    this.edits = {};
    this.startPlaying();
  },
  loadSlot(i) {
    const st = safeStorage();
    let raw = null;
    try { raw = st ? st.getItem(this.storageKey(i)) : (this.mem[i] && this.mem[i].data); } catch (e) { raw = null; }
    if (!raw) { UI.toast('That save could not be loaded.'); return; }
    try { this.save = JSON.parse(raw); } catch (e) { UI.toast('That save is damaged.'); return; }
    this.slot = i; this.edits = {};
    this.startPlaying();
  },
  getEdits(key) {
    if (!this.edits[key]) {
      const m = new Map(), enc = this.save.realms[key] && this.save.realms[key].edits;
      if (enc) for (const ck in enc) {
        const b = b64ToBytes(enc[ck]), mm = new Map();
        for (let i = 0; i + 2 < b.length; i += 3) mm.set((b[i] << 8) | b[i + 1], b[i + 2]);
        m.set(ck, mm);
      }
      this.edits[key] = m;
    }
    return this.edits[key];
  },
  persist() {
    if (!this.save || this.titleMode) return;
    const s = this.save, p = this.player;
    s.pos = p.dead ? null : [p.x, p.y, p.z]; s.yaw = p.yaw; s.pitch = p.pitch; s.hp = p.hp; s.food = p.food;
    s.inv = p.inv; s.armor = p.armor; s.time = this.time;
    for (const rk in this.edits) {
      const out = {};
      for (const [ck, m] of this.edits[rk]) {
        const b = new Uint8Array(m.size * 3); let i = 0;
        for (const [idx, id] of m) { b[i++] = idx >> 8; b[i++] = idx & 255; b[i++] = id; }
        out[ck] = bytesToB64(b);
      }
      (s.realms[rk] = s.realms[rk] || {}).edits = out;
    }
    const json = JSON.stringify(s);
    const meta = JSON.stringify({ name: s.name, mode: s.mode, discovered: s.discovered, mods: Object.keys(s.mods).length, playTime: s.playTime });
    const st = safeStorage();
    if (st) {
      try { st.setItem(this.storageKey(this.slot), json); st.setItem('rd_meta_' + this.slot, meta); }
      catch (e) { if (!this.warnedQuota) { this.warnedQuota = true; UI.toast('Saving failed: browser storage is full.', '#ff5a5a'); } this.mem[this.slot] = { data: json, meta }; }
    } else this.mem[this.slot] = { data: json, meta };
  },

  // ---------------- starting & realms ----------------
  startPlaying() {
    this.freeWorld();
    this.titleMode = false;
    const s = this.save;
    this.creative = s.mode === 'creative';
    this.player = this.makePlayer(s);
    this.time = s.time || 0.04;
    this.recomputeStats();
    this.player.fuel = this.stats.jetpack;
    UI.show('scr-loading'); $('loading-text').textContent = 'Building the world…';
    $('hud').hidden = true;
    this.state = 'entering';
    setTimeout(() => {
      this.enterRealm(s.realm || 'greenhollow', { pos: s.pos });
      this.state = 'loading';
      this.loadT = 0;
    }, 40);
  },
  enterRealm(key, opts = {}) {
    this.freeWorld();
    this.realm = REALM[key] || REALMS[0];
    this.save.realm = this.realm.key;
    this.world = new World(this.realm, this.save.seed, this.getEdits(this.realm.key));
    this.hookWorld(this.world);
    this.pal = null; this.geode = null; this.villages = []; this.villageSpawned = {}; this.villageKilled = {};
    Mobs.clear(); Projectiles.list = []; Particles.list = []; this.barrels = []; this.boss = null; this.xrayList = []; this.xrayT = 0; this.rocket = null; this.mining = null;
    UI.bossBar(null);
    let spawn = null;
    if (opts.pos) spawn = opts.pos;
    else if (this.realm.key === 'greenhollow' && this.save.bedSpawn) spawn = this.save.bedSpawn;
    if (spawn) {
      this.world.generateArea(spawn[0], spawn[2], 2);
      if (boxCollides(this.world, spawn[0], spawn[1], spawn[2], 0.6, 1.8)) spawn = null;
    }
    if (!spawn) spawn = this.realmSpawn(this.realm.key);
    this.world.generateArea(spawn[0], spawn[2], 2);
    const p = this.player;
    p.x = spawn[0]; p.y = spawn[1]; p.z = spawn[2]; p.vx = p.vy = p.vz = 0; p.fallStart = p.y; p.flying = this.creative && p.flying;
    p.inLava = p.headInLava = p.inWater = p.headInWater = p.climbing = false; p.air = 10;
    if (!this.save.discovered.includes(this.realm.key)) {
      this.save.discovered.push(this.realm.key);
      this.achieve('realm_' + this.realm.key);
    }
    UI.realmCard(this.realm);
    UI.last = {};
  },
  realmSpawn(key) {
    const rs = (this.save.realms[key] = this.save.realms[key] || {});
    if (rs.spawn) { this.world.generateArea(rs.spawn[0], rs.spawn[2], 2); return rs.spawn; }
    const r = REALM[key], w = this.world, [sx, sz] = r.spawnXZ;
    w.generateArea(sx, sz, 3);
    let found = this.findSpawnColumn(w, r, sx, sz);
    let x, y, z;
    if (found) [x, y, z] = found;
    else { x = sx; z = sz; y = r.key === 'skyreach' ? 72 : r.key === 'coralabyss' ? CA_SEA + 1 : 64; }
    // build the arrival platform + Realm Gate
    const plat = B[r.platform] || B.cobble;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      w.setBlock(x + dx, y - 1, z + dz, plat);
      for (let h = 0; h < 3; h++) { const id = w.blockAt(x + dx, y + h, z + dz); if (id && id !== B.realm_gate) w.setBlock(x + dx, y + h, z + dz, 0); }
    }
    w.setBlock(x + 1, y, z + 1, B.realm_gate);
    if (r.key === 'hollowdeep' || r.key === 'lunara') { w.setBlock(x - 1, y, z + 1, B.lantern); w.setBlock(x + 1, y, z - 1, B.lantern); }
    rs.spawn = [x + 0.5, y, z + 0.5];
    return rs.spawn;
  },
  findSpawnColumn(w, r, sx, sz) {
    const PREF = { greenhollow: ['grass'], emberdeep: ['scorch_moss', 'ash'], frostveil: ['snow'], skyreach: ['sky_grass'], lunara: ['regolith'],
      coralabyss: ['grass', 'sand'], sugarland: ['frosting', 'icing'], dinovalley: ['jungle_grass'], prismara: ['prism_grass', 'guardian_stone'] };
    const MAXY = { greenhollow: 80, emberdeep: 64, frostveil: 76, dinovalley: 78, sugarland: 76 };
    const pref = PREF[r.key] ? PREF[r.key].map(k => B[k]) : null, maxY = MAXY[r.key] || 124;
    const tryCol = (x, z, strict) => {
      if (r.spawnMode === 'bottom') {
        for (let y = 6; y < 110; y++) {
          const g = w.blockAt(x, y, z), a1 = w.blockAt(x, y + 1, z), a2 = w.blockAt(x, y + 2, z), a3 = w.blockAt(x, y + 3, z);
          if (SOLID[g] && !SOLID[a1] && !LIQ[a1] && !SOLID[a2] && !LIQ[a2] && !SOLID[a3]) return y + 1;
        }
        return -1;
      }
      for (let y = 124; y > 2; y--) {
        const g = w.blockAt(x, y, z);
        if (!g || RENDER[g] === R_CROSS) continue;
        if (LIQ[g] || LEAF[g] || !SOLID[g] || g === B.cloud && r.key !== 'skyreach') return -1;
        if (strict && ((pref && !pref.includes(g)) || y > maxY)) return -1;
        if (r.key === 'coralabyss' && y < CA_SEA) return -1;
        const a1 = w.blockAt(x, y + 1, z), a2 = w.blockAt(x, y + 2, z);
        return (!SOLID[a1] && !LIQ[a1] && !SOLID[a2] && !LIQ[a2]) ? y + 1 : -1;
      }
      return -1;
    };
    for (const strict of [true, false]) {
      for (let d = 0; d <= 44; d += d < 10 ? 1 : 2) {
        for (let dz = -d; dz <= d; dz++) for (let dx = -d; dx <= d; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== d) continue;
          const y = tryCol(sx + dx, sz + dz, strict);
          if (y > 0) return [sx + dx, y, sz + dz];
        }
      }
    }
    return null;
  },
  travelTo(key, reason) {
    if (this.travel || this.player.dead) return;
    this.travel = { key, reason, t: 0, swapped: false };
    $('fx-fade').style.opacity = 1;
    Sound.play('portal');
  },
  updateTravel(dt) {
    const tr = this.travel;
    tr.t += dt;
    if (!tr.swapped && tr.t > 0.55) {
      tr.swapped = true;
      this.enterRealm(tr.key, {});
      this.persist();
      for (let i = 0; i < 6; i++) this.world.update(this.player.x, this.player.z, Settings.data.renderDist, 200);
    }
    if (tr.swapped && tr.t > 0.8) { $('fx-fade').style.opacity = 0; this.travel = null; }
  },

  // ---------------- stats & mods ----------------
  recomputeStats() {
    const owned = this.creative ? Object.fromEntries(MODS.map(m => [m.key, 3])) : this.save.mods;
    if (this.creative) this.save.mods = Object.assign({}, owned, this.save.mods);
    this.save.equipped = this.save.equipped.filter(k => MOD[k]).slice(0, this.modSlots());
    this.stats = computeStats(this.save.equipped, this.save.mods);
    if (this.player) this.player.hp = Math.min(this.player.hp, this.maxHp());
    UI.last.modbar = null;
  },
  maxHp() { return 20 + (this.stats.bonusHearts || 0) * 2; },
  modSlots() {
    if (!this.save) return 4;
    const found = MODS.filter(m => this.save.mods[m.key]).length;
    return 4 + (found >= 15 ? 1 : 0) + (this.save.bossDefeated ? 1 : 0);
  },
  toggleMod(k) {
    const eq = this.save.equipped, i = eq.indexOf(k);
    if (i >= 0) eq.splice(i, 1);
    else if (eq.length < this.modSlots()) eq.push(k);
    else { UI.toast('All mod slots are full. Unequip one first.'); return; }
    Sound.play('click');
    this.recomputeStats();
  },
  grantMod(key) {
    const m = MOD[key], lv = this.save.mods[key] || 0, rc = RARITY[m.rarity].color;
    if (lv >= 3) {
      UI.popup('Mod found', m.name, 'Already max level, so you get 3 Gold Ingots instead!', m.icon, rc);
      this.addItem(I.gold_ingot, 3);
    } else {
      this.save.mods[key] = lv + 1;
      if (lv === 0) {
        UI.popup('New ' + RARITY[m.rarity].name + ' mod!', m.name, m.desc[0], m.icon, rc, 4200);
        if (this.save.equipped.length < this.modSlots()) this.save.equipped.push(key);
        else UI.toast('Mod slots full: press M to swap mods', rc);
      } else UI.popup('Mod level up!', m.name + ' ' + 'I'.repeat(lv + 1), m.desc[lv], m.icon, rc);
    }
    Sound.play('mod', m.rarity);
    this.achieve('firstmod');
    const found = MODS.filter(x => this.save.mods[x.key]).length;
    if (found >= 10) this.achieve('mods10');
    if (m.rarity >= 4) this.achieve('legendary');
    if (m.rarity >= 5) this.achieve('mythic');
    this.recomputeStats();
  },
  achieve(id) {
    if (!this.save || this.save.achievements.includes(id)) return;
    this.save.achievements.push(id);
    const a = ACHIEVEMENTS.find(x => x.id === id);
    if (a && !id.startsWith('realm_')) { UI.toast('🏆 Goal complete: ' + a.name, '#ffc24b'); Sound.play('achieve'); }
  },
  currentGoal() {
    if (!this.save || this.creative) return null;
    for (const id of GOAL_CHAIN) {
      if (this.save.achievements.includes(id)) continue;
      if (id.startsWith('realm_')) { const r = REALM[id.slice(6)]; return `Discover ${r.name}: ${r.how}`; }
      return GOAL_TEXT[id];
    }
    return null;
  },

  // ---------------- inventory ----------------
  addItem(id, n) {
    const inv = this.player.inv, d = itemDef(id);
    if (!d) return n;
    const max = d.stack;
    for (let i = 0; i < 36 && n > 0; i++) { const s = inv[i]; if (s && s.id === id && s.n < max) { const m = Math.min(n, max - s.n); s.n += m; n -= m; } }
    for (let i = 0; i < 36 && n > 0; i++) if (!inv[i]) { const m = Math.min(n, max); inv[i] = { id, n: m }; n -= m; }
    if (this.save && !this.save.seen.includes(id)) { this.save.seen.push(id); if (!this.creative) UI.toast('New item: ' + d.name, null, iconURL(id)); }
    if (d.gem && this.save && !this.save.gems.includes(d.gem)) {
      this.save.gems.push(d.gem);
      UI.toast(`Realm Gem found! (${this.save.gems.length}/8)`, REALM[d.gem].color, iconURL(id));
      if (this.save.gems.length >= 8) this.achieve('allgems');
    }
    if (n > 0) UI.toast('Inventory full!', '#ff5a5a');
    UI.updateHotbar();
    return n;
  },
  hasRoomFor(id) {
    const d = itemDef(id);
    return this.player.inv.some(s => !s || (s.id === id && s.n < d.stack));
  },
  heldDef() { const s = this.player.inv[this.player.sel]; return s ? itemDef(s.id) : null; },
  // only real tools count as tools (blocks also have a 'tool' field: the tool that mines them best)
  heldTool() { const d = this.heldDef(); return d && !d.isBlock && d.tool ? d : null; },
  craft(r) {
    const inv = this.player.inv, id = idOf(r.out);
    if (!this.creative) {
      if (!canCraft(inv, r)) return false;
      if (r.st && !UI.stations[r.st]) return false;
    }
    if (!this.hasRoomFor(id)) { UI.toast('Inventory full!', '#ff5a5a'); return false; }
    if (!this.creative) for (const [k, n] of r.in) takeIng(inv, k, n);
    this.addItem(id, r.n);
    if (!this.creative && this.stats.crafty && Math.random() < this.stats.crafty && this.hasRoomFor(id)) { this.addItem(id, r.n); UI.toast('Crafty Hands: you made double!', RARITY[1].color, iconURL(id)); }
    Sound.play('craft');
    const ach = { workbench: 'bench', wood_pickaxe: 'woodpick', stone_pickaxe: 'stonepick', torch: 'torch', furnace: 'furnace', iron_ingot: 'iron', iron_pickaxe: 'ironpick' }[r.out];
    if (ach) this.achieve(ach);
    return true;
  },
  nearStations() {
    const p = this.player, w = this.world, out = { bench: false, furnace: false };
    for (let dy = -3; dy <= 3; dy++) for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      const id = w.blockAt(Math.floor(p.x) + dx, Math.floor(p.y) + dy, Math.floor(p.z) + dz);
      if (id === B.workbench) out.bench = true; else if (id === B.furnace) out.furnace = true;
    }
    return out;
  },

  // ---------------- input ----------------
  setupInput() {
    const cv = $('gl');
    window.addEventListener('keydown', e => {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (e.repeat && Input.keys[e.code]) { if (this.state === 'playing' && e.code === 'Space') e.preventDefault(); return; }
      Input.keyDown(e.code);
      this.onKey(e.code, e);
      if (this.state === 'playing' && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'ControlLeft'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => Input.keyUp(e.code));
    window.addEventListener('blur', () => { Input.keys = {}; Input.mouseL = Input.mouseR = Input.btnMine = Input.btnBuild = false; });
    cv.addEventListener('mousedown', e => {
      Sound.init();
      if (this.state !== 'playing' || Settings.touchOn()) return;
      if (!Input.locked && !Input.dragLook) { this.requestLock(); return; }
      if (e.button === 0) { Input.mouseL = true; Input.clickL = true; Input.dragging = false; Input.dragDist = 0; }
      if (e.button === 2) { Input.mouseR = true; Input.clickR = true; }
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) { Input.mouseL = false; Input.dragging = false; } if (e.button === 2) Input.mouseR = false; });
    window.addEventListener('mousemove', e => {
      if (this.state !== 'playing') return;
      // some browsers report a huge bogus jump right after pointer lock starts: ignore those
      if (Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return;
      if (Input.locked) this.look(e.movementX * 0.0023, e.movementY * 0.0023);
      else if (Input.dragLook && Input.mouseL) {
        Input.dragDist += Math.abs(e.movementX) + Math.abs(e.movementY);
        if (Input.dragDist > 6) Input.dragging = true;
        if (Input.dragging) this.look(e.movementX * 0.005, e.movementY * 0.005);
      }
    });
    cv.addEventListener('wheel', e => {
      if (this.state !== 'playing') return;
      e.preventDefault();
      const p = this.player; p.sel = (p.sel + (e.deltaY > 0 ? 1 : -1) + 9) % 9; UI.updateHotbar();
    }, { passive: false });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      Input.locked = document.pointerLockElement === cv;
      if (Input.locked) Input.everLocked = true;
      if (!Input.locked && this.state === 'playing' && !this.ignoreUnlock) this.pause();
      this.ignoreUnlock = false;
    });
    document.addEventListener('pointerlockerror', () => {
      if (!Input.everLocked) { Input.dragLook = true; UI.toast('Drag with the mouse to look around'); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.persist(); if (this.state === 'playing') this.pause(); } });
    window.addEventListener('beforeunload', () => this.persist());
    window.addEventListener('pagehide', () => this.persist());
  },
  requestLock() {
    if (Settings.touchOn() || Input.dragLook) return;
    const cv = $('gl');
    try {
      const r = cv.requestPointerLock();
      if (r && r.catch) r.catch(() => { if (!Input.everLocked) { Input.dragLook = true; UI.toast('Drag with the mouse to look around'); } });
    } catch (e) { Input.dragLook = true; }
  },
  releaseLock() { if (document.pointerLockElement) { this.ignoreUnlock = true; document.exitPointerLock(); } },
  onKey(code) {
    if (code === 'Escape') {
      if (this.state === 'ui') this.closeUI();
      else if (this.state === 'paused' && UI.screen === 'scr-pause') this.resume();
      else if (this.state === 'playing') this.pause();
      return;
    }
    if (this.state === 'ui') {
      if ((code === 'KeyE' && UI.screen === 'scr-inv') || (code === 'KeyM' && UI.screen === 'scr-mods') || (code === 'KeyG' && UI.screen === 'scr-guide')) this.closeUI();
      return;
    }
    if (this.state !== 'playing') return;
    if (code === 'KeyE') this.toggleUI('inv');
    else if (code === 'KeyM') this.toggleUI('mods');
    else if (code === 'KeyG') this.toggleUI('guide');
    else if (code.startsWith('Digit')) { const n = +code.slice(5); if (n >= 1 && n <= 9) { this.player.sel = n - 1; UI.updateHotbar(); } }
    else if (code === 'KeyX' || code === 'KeyR' || code === 'KeyF' || code === 'KeyQ') this.ability(code.slice(3));
  },
  look(dx, dy) {
    const p = this.player, s = Settings.data.sensitivity;
    p.yaw -= dx * s;
    p.pitch = clamp(p.pitch - dy * s * (Settings.data.invertY ? -1 : 1), -1.55, 1.55);
  },
  toggleUI(name) {
    if (this.state === 'ui') { this.closeUI(); return; }
    if (this.state !== 'playing') return;
    this.state = 'ui';
    this.releaseLock();
    Input.mouseL = Input.mouseR = false;
    if (name === 'inv') UI.openInventory();
    else if (name === 'mods') UI.openMods();
    else if (name === 'guide') UI.openGuide();
    else if (name === 'travel') UI.openTravel();
  },
  closeUI() {
    UI.returnCursor();
    UI.hideScreens();
    this.state = 'playing';
    this.requestLock();
  },
  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.releaseLock();
    Input.mouseL = Input.mouseR = false;
    UI.show('scr-pause');
    this.persist();
  },
  resume() { UI.hideScreens(); this.state = 'playing'; this.requestLock(); },
  quitToTitle() {
    this.persist();
    this.startTitleWorld();
    UI.showTitle();
  },
  applySettings() { Sound.applyVolume(); $('touch').hidden = !Settings.touchOn() || this.titleMode; document.body.classList.toggle('touch', Settings.touchOn()); },

  // ---------------- main loop ----------------
  frame(now) {
    let dt = (now - this.last) / 1000; this.last = now;
    if (dt > 0.05) dt = 0.05;
    this.frameN++;
    try {
      if (this.titleMode) this.updateTitle(dt);
      else if (this.state === 'entering') { /* waiting for the realm to be built */ }
      else if (this.state === 'loading') this.updateLoading(dt);
      else this.updateGame(dt);
      this.render(dt);
    } catch (e) { console.error(e); }
    requestAnimationFrame(t => this.frame(t));
  },
  updateTitle(dt) {
    const p = this.player;
    p.yaw += dt * 0.04;
    this.time = (this.time + dt / 400) % 1;
    this.t += dt;
    this.world.update(p.x, p.z, Math.min(Settings.data.renderDist, 6), 6);
  },
  updateLoading(dt) {
    this.loadT += dt;
    const p = this.player;
    this.world.update(p.x, p.z, Settings.data.renderDist, 30);
    let pending = 0;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const c = this.world.chunk(Math.floor(p.x / 16) + dx, Math.floor(p.z / 16) + dz); if (!c || c.dirty) pending++; }
    $('loading-text').textContent = pending ? `Building the world… ${Math.round((1 - pending / 25) * 100)}%` : 'Ready!';
    if (pending === 0 || this.loadT > 6) {
      this.state = 'playing';
      UI.hideScreens();
      $('hud').hidden = false;
      this.applySettings();
      UI.updateHotbar(); UI.updateModbar();
      if (!Settings.touchOn()) UI.toast(Input.dragLook ? 'Drag with the mouse to look around' : 'Click the game to look around');
      if (!this.save.achievements.includes('wood') && !this.creative) setTimeout(() => UI.toast('Tip: press G for the Realm Guide'), 3000);
    }
  },
  updateGame(dt) {
    const playing = this.state === 'playing';
    const p = this.player;
    this.t += dt;
    if (this.save) this.save.playTime += dt;
    if (this.travel) this.updateTravel(dt);
    if (playing || this.state === 'ui') {
      if (this.realm.sky.mode === 'cycle') this.time = (this.time + dt / DAY_LEN) % 1;
      this.updateWeather(dt);
      if (this.rocket) this.updateRocket(dt);
      else if (!this.travel && !p.dead && playing) this.updatePlayer(dt);
      else if (!this.travel && !p.dead) this.updatePlayer(dt, true);
      if (playing && !this.travel && !this.rocket) this.updateInteract(dt);
      if (!this.travel) {
        Mobs.update(dt); Projectiles.update(dt); this.updateBarrels(dt); this.updateBoss(dt);
        this.updateVitals(dt);
        this.checkTriggers();
      }
    }
    Particles.update(dt);
    if (playing && !this.travel) {
      this.updatePal(dt);
      this.discT -= dt; if (this.discT <= 0) { this.discT = 0.4; this.updateDiscovery(); }
      this.geodeT -= dt; if (this.geodeT <= 0) { this.geodeT = 1; this.updateGeode(); this.updateVillages(); }
    }
    for (const k in this.abilityCD) if (this.abilityCD[k] > 0) this.abilityCD[k] -= dt;
    if (this.xrayT > 0) { this.xrayT -= dt; this.xrayScanT -= dt; if (this.xrayScanT <= 0) this.scanXray(); }
    this.attackCD -= dt; this.useCD -= dt;
    const heldNow = p.inv[p.sel] ? p.inv[p.sel].id : 0;
    if (heldNow !== this.handId) { this.handId = heldNow; this.equipT = 0.25; }
    this.equipT = Math.max(0, (this.equipT || 0) - dt); this.swingT = Math.max(0, (this.swingT || 0) - dt);
    this.shake = Math.max(0, this.shake - dt * 1.5);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);
    $('fx-hurt').style.opacity = this.hurtFlash;
    this.world.update(p.x, p.z, Settings.data.renderDist, 7);
    Sound.updateMusic(this.realm);
    this.autosaveT -= dt;
    if (this.autosaveT <= 0) { this.autosaveT = 30; this.persist(); }
    this.hudT -= dt;
    if (this.hudT <= 0) { this.hudT = 0.1; UI.updateBars(); UI.updateInfo(); UI.updateModbar(); }
    this.mmT -= dt;
    if (this.mmT <= 0) { this.mmT = 0.5; UI.minimap(); }
    Input.clickL = Input.clickR = false; Input.tapAttack = Input.tapUse = Input.tapAct = false;
    Input.pressed.clear();
  },

  // ---------------- player ----------------
  gravity() {
    const S = this.stats;
    let g = this.realm.gravity;
    if (S.moonboots) g = Math.min(g, [1, 0.5, 0.42, 0.34][S.moonboots]);
    return g;
  },
  eye() { const p = this.player; return [p.x, p.y + (p.sneaking ? 1.42 : 1.62), p.z]; },
  viewDir() { const p = this.player, cp = Math.cos(p.pitch); return [-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp]; },
  isWaterId(id) { return LIQ[id] === 1 || LIQ[id] === 3 || WLOG[id] === 1; },
  updatePlayer(dt, frozen) {
    const p = this.player, S = this.stats, w = this.world, K = frozen ? {} : Input.keys;
    let fwd = 0, str = 0;
    if (K.KeyW || K.ArrowUp) fwd += 1; if (K.KeyS || K.ArrowDown) fwd -= 1;
    if (K.KeyA || K.ArrowLeft) str -= 1; if (K.KeyD || K.ArrowRight) str += 1;
    if (!frozen) { fwd -= Input.joy.y; str += Input.joy.x; }
    const len = Math.hypot(fwd, str); if (len > 1) { fwd /= len; str /= len; }
    if (!frozen && Input.consume('KeyW')) { if (this.t - p.lastW < 0.3) p.sprinting = true; p.lastW = this.t; }
    if (K.ControlLeft || K.ControlRight || (!frozen && Input.joy.y < -0.93)) p.sprinting = true;
    const canFly = this.creative || S.fly;
    let jumpPressed = false;
    if (!frozen && Input.consume('Space')) {
      jumpPressed = true;
      if (canFly && this.t - p.lastSpace < 0.3) { p.flying = !p.flying; p.vy = 0; jumpPressed = false; }
      p.lastSpace = this.t;
    }
    if (!canFly) p.flying = false;
    p.sneaking = !!(K.ShiftLeft || K.ShiftRight) && !p.flying;
    if (fwd <= 0.2 || p.sneaking || (p.food <= 6 && !this.creative)) p.sprinting = false;
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    let wx = -sy * fwd + cy * str, wz = -cy * fwd - sy * str;
    const under = w.blockAt(Math.floor(p.x), Math.floor(p.y - 0.05), Math.floor(p.z));
    const ub = BLOCKS[under] || BLOCKS[0];
    let speed = 4.3 * S.speed;
    if (p.sprinting) speed *= 1.38;
    if (p.sneaking) speed *= 0.33;
    if (p.speedBoost > 0) { speed *= 1.35; p.speedBoost -= dt; }
    let slip = p.onGround ? ub.slip : 1;
    if (S.iceskates && p.onGround && (ub.slip < 1 || under === B.snow)) { speed *= 1.35 + 0.22 * S.iceskates; slip = Math.max(slip, 0.4); }
    if (p.onLiquid) speed *= 1 + 0.18 * (Math.max(S.waterwalk, S.magmastride) - 1);
    if (p.flying) speed = (this.creative ? 10.9 : 6.5 + 2.5 * S.fly) * (p.sprinting ? 1.8 : 1);
    else if (p.inWater) speed = (2.7 + (S.dolphin ? 2 + S.dolphin * 0.9 : 0)) * (p.sprinting ? 1.3 : 1);
    else if (p.inLava) speed = S.fireproof >= 2 ? 3.2 : 1.5;
    if (S.glider && !p.onGround && !p.flying && K.Space && p.vy < 0) speed = Math.max(speed, 6 + S.glider);
    wx *= speed; wz *= speed;
    const accel = p.flying ? 10 : p.onGround ? 15 * slip : (p.inWater ? 6 : 3.2);
    const k = Math.min(1, accel * dt);
    p.vx += (wx - p.vx) * k; p.vz += (wz - p.vz) * k;
    const grav = 28 * this.gravity();
    const jumpV = 8.65 * S.jump;
    const fb = w.blockAt(Math.floor(p.x), Math.floor(p.y + 0.1), Math.floor(p.z)), bb = w.blockAt(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z));
    p.wallClimb = !p.flying && S.wallclimb && (p.hitX || p.hitZ) && fwd > 0.2 && !CLIMB[fb] && !CLIMB[bb];
    p.climbing = !p.flying && (CLIMB[fb] === 1 || CLIMB[bb] === 1 || p.wallClimb);
    if (p.flying) {
      let vy = 0; if (K.Space) vy += 1; if (K.ShiftLeft || K.ShiftRight) vy -= 1;
      p.vy += (vy * (this.creative ? 9 : 7) - p.vy) * Math.min(1, 10 * dt);
    } else if (p.climbing) {
      if (K.Space || fwd > 0.2) p.vy = p.wallClimb ? 3 + S.wallclimb * 0.8 : 3.4; else if (p.sneaking) p.vy = 0; else p.vy = Math.max(p.vy - grav * dt, -2.5);
    } else if (p.inWater || p.inLava) {
      p.vy -= grav * 0.12 * dt;
      if (K.Space) p.vy = Math.min(p.vy + 22 * dt, (p.hitX || p.hitZ) ? 5.5 : 3.8);
      p.vy = Math.max(p.vy, -3.5) * Math.pow(0.55, dt);
    } else {
      p.vy -= grav * dt; if (p.vy < -55) p.vy = -55;
      if (K.Space && p.onGround) { p.vy = jumpV; p.hungerAcc += 0.05; }
      else if (jumpPressed && !p.onGround && p.airJumpsLeft > 0) {
        p.airJumpsLeft--; p.vy = jumpV * S.airJumpPower; p.fallStart = p.y;
        Particles.burst(p.x, p.y, p.z, [1, 1, 1], 8, 2.5, 0.08);
      } else if (K.Space && !p.onGround && S.jetpack && p.fuel > 0 && !jumpPressed) {
        p.vy = Math.min(p.vy + 42 * dt, 7); p.fuel -= dt; p.fallStart = p.y;
        if (Math.random() < 0.7) Particles.add(p.x + (Math.random() - .5) * .3, p.y + 0.4, p.z + (Math.random() - .5) * .3, 0, -4, 0, 0.4, 0.1, 1, 0.6 + Math.random() * 0.3, 0.2, 1, 0, true);
      } else if (K.Space && S.glider && p.vy < 0) { p.vy = Math.max(p.vy, -(3.4 - S.glider * 0.8)); p.fallStart = p.y; }
    }
    if (p.onGround && S.jetpack) p.fuel = Math.min(S.jetpack, p.fuel + dt * 1.5);
    let dx = p.vx * dt, dz = p.vz * dt;
    if (p.sneaking && p.onGround) {
      const sup = (x, z) => boxCollides(w, x, p.y - 0.08, z, p.w, 0.06);
      if (!sup(p.x + dx, p.z)) { dx = 0; p.vx = 0; }
      if (!sup(p.x + dx, p.z + dz)) { dz = 0; p.vz = 0; }
    }
    const wasGround = p.onGround;
    p.impact = 0;
    physMove(w, p, dx, p.vy * dt, dz);
    // Water Strider / Magma Stride: stand on the surface of liquids
    p.onLiquid = false;
    if ((S.waterwalk || S.magmastride) && !p.sneaking && !p.flying && p.vy <= 0.5) {
      const ly = Math.floor(p.y - 0.05), lq = LIQ[w.blockAt(Math.floor(p.x), ly, Math.floor(p.z))], up = w.blockAt(Math.floor(p.x), Math.floor(p.y + 0.4), Math.floor(p.z));
      if ((((lq === 1 || lq === 3) && S.waterwalk) || (lq === 2 && S.magmastride)) && !LIQ[up] && p.y - ly > 0.6) { p.y = ly + 0.9; p.vy = 0; p.onGround = true; p.onLiquid = true; }
    }
    if (Settings.data.autoJump && p.onGround && (p.hitX || p.hitZ) && len > 0.3 && !p.sneaking && this.t > p.autoJumpT) {
      const fx = Math.floor(p.x + Math.sign(wx) * 0.6), fz = Math.floor(p.z + Math.sign(wz) * 0.6), fy = Math.floor(p.y);
      if (!w.solidAt(fx, fy + 1, fz) && !w.solidAt(fx, fy + 2, fz)) { p.vy = jumpV; p.autoJumpT = this.t + 0.25; }
    }
    // landing
    if (p.onGround && !wasGround && !p.flying) {
      const fall = p.fallStart - p.y, impact = p.impact || 0;
      const ground = BLOCKS[w.blockAt(Math.floor(p.x), Math.floor(p.y - 0.05), Math.floor(p.z))] || BLOCKS[0];
      if (ground.bounce && !p.sneaking && impact > 3) { p.vy = Math.max(11, impact * 0.9); p.onGround = false; Sound.play('bounce'); this.achieve('bounce'); p.fallStart = p.y; }
      else if (S.bounce && impact > 11 && !p.sneaking) { p.vy = impact * (0.45 + 0.1 * S.bounce); p.onGround = false; Sound.play('bounce'); p.fallStart = p.y; }
      else {
        if (S.meteor && fall > 6) this.meteorStomp(fall);
        let dmg = Math.max(0, (impact - 13.5) * 0.85);
        if (ground.soft || p.inWater) dmg = 0;
        dmg *= S.fallMul;
        if (S.meteor && fall > 6) dmg = 0;
        if (dmg >= 1) this.hurtPlayer(Math.round(dmg), null, 'fall');
        if (impact > 6) Sound.play('step', ground.id);
      }
    }
    if (p.onGround || p.inWater || p.flying || p.climbing) { p.fallStart = p.y; p.airJumpsLeft = S.airJumps; }
    else p.fallStart = Math.max(p.fallStart, p.y);
    // fluids
    const f2 = w.blockAt(Math.floor(p.x), Math.floor(p.y + 0.2), Math.floor(p.z)), b2 = w.blockAt(Math.floor(p.x), Math.floor(p.y + 0.9), Math.floor(p.z));
    const eye = this.eye(), hb = w.blockAt(Math.floor(eye[0]), Math.floor(eye[1]), Math.floor(eye[2]));
    const wasWater = p.inWater;
    p.inWater = this.isWaterId(f2) || this.isWaterId(b2);
    p.headInWater = this.isWaterId(hb);
    p.inLava = LIQ[f2] === 2 || LIQ[b2] === 2; p.headInLava = LIQ[hb] === 2;
    if (p.inWater && !wasWater && p.vy < -4) { Sound.play('splash'); Particles.burst(p.x, p.y + 0.5, p.z, [0.6, 0.8, 1], 12, 4, 0.08); }
    // ice path
    if (S.icepath && !p.inWater && !p.flying) {
      const r = S.icepath, fy = Math.floor(p.y - 0.5);
      for (let oz = -r; oz <= r; oz++) for (let ox = -r; ox <= r; ox++) {
        if (ox * ox + oz * oz > r * r + 1) continue;
        const X = Math.floor(p.x) + ox, Z = Math.floor(p.z) + oz;
        if (LIQ[w.blockAt(X, fy, Z)] === 1 && w.blockAt(X, fy + 1, Z) === 0) w.setBlock(X, fy, Z, B.ice);
      }
    }
    // footsteps & bob
    const hs = Math.hypot(p.vx, p.vz);
    if (p.onGround && hs > 1) {
      p.bob += dt * hs * 1.6; p.stepT += dt * hs;
      if (p.stepT > 2.1) { p.stepT = 0; Sound.play('step', under); }
    }
    if (p.sprinting) p.hungerAcc += dt * 0.04;
  },
  meteorStomp(fall) {
    const S = this.stats, p = this.player, r = 3 + S.meteor;
    const dmg = Math.min(30, fall * (1 + S.meteor * 0.4));
    for (const m of Mobs.list) { const d = Math.hypot(m.x - p.x, m.z - p.z); if (d < r && Math.abs(m.y - p.y) < 3) m.damage(dmg * (1 - d / r / 2), true, (m.x - p.x) / (d || 1) * 8, (m.z - p.z) / (d || 1) * 8); }
    for (let i = 0; i < 40; i++) { const a = i / 40 * 6.28; Particles.add(p.x, p.y + 0.2, p.z, Math.cos(a) * 8, 1, Math.sin(a) * 8, 0.6, 0.15, 1, 0.6, 0.2, 1, 0, true); }
    Sound.play('boom'); this.shake = 0.5;
  },
  updateRocket(dt) {
    const r = this.rocket, p = this.player;
    r.t += dt;
    p.y += (2 + r.t * 9) * dt; p.vx = p.vy = p.vz = 0; p.fallStart = p.y;
    for (let i = 0; i < 4; i++) {
      Particles.add(p.x + (Math.random() - .5) * .6, p.y - 0.6, p.z + (Math.random() - .5) * .6, (Math.random() - .5) * 2, -6 - Math.random() * 4, (Math.random() - .5) * 2, 0.6, 0.15, 1, 0.5 + Math.random() * 0.4, 0.1, 1, 0, true);
      Particles.add(p.x + (Math.random() - .5), p.y - 1.5, p.z + (Math.random() - .5), (Math.random() - .5) * 3, -2, (Math.random() - .5) * 3, 1.5, 0.3, 0.8, 0.8, 0.8, 1, -1, false);
    }
    this.shake = 0.25;
    if (r.t > 2.4 && !this.travel) this.travelTo(r.dest, 'rocket');
  },

  // ---------------- interaction ----------------
  rayAABB(o, d, x0, y0, z0, x1, y1, z1) {
    let tmin = 0, tmax = 1e9;
    const lo = [x0, y0, z0], hi = [x1, y1, z1];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) return null; continue; }
      let t1 = (lo[i] - o[i]) / d[i], t2 = (hi[i] - o[i]) / d[i];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    return tmin;
  },
  updateInteract(dt) {
    const p = this.player, w = this.world;
    if (p.dead) return;
    const eye = this.eye(), dir = this.viewDir();
    const reach = (this.creative ? 8 : 5.2) + this.stats.reach;
    const hit = w.raycast(eye[0], eye[1], eye[2], dir[0], dir[1], dir[2], reach, id => id > 0 && !LIQ[id]);
    let mob = null, mobT = Infinity;
    const cands = this.boss ? [...Mobs.list, this.boss] : Mobs.list;
    for (const m of cands) {
      if (m.dead) continue;
      const sc = m.def.scale || 1, hw = m.w * sc / 2;
      if (Math.abs(m.x - p.x) > 12 || Math.abs(m.z - p.z) > 12) continue;
      const t = this.rayAABB(eye, dir, m.x - hw, m.y, m.z - hw, m.x + hw, m.y + m.h * sc, m.z + hw);
      if (t !== null && t < mobT && t < reach) { mob = m; mobT = t; }
    }
    const bt = hit ? hit.t : Infinity;
    this.target = hit && bt < mobT ? hit : null;
    this.targetMob = mob && mobT <= bt ? mob : null;
    const touchMine = Input.btnMine, touchBuild = Input.btnBuild;
    const held = (Input.mouseL && !Input.dragging) || touchMine;
    const tapL = (Input.clickL && !Input.dragLook) || Input.tapAttack;
    // attack creatures
    if (this.targetMob && this.attackCD <= 0 && (tapL || held)) { this.attack(this.targetMob, dir); this.attackCD = 0.42; }
    // mining
    const t = this.target;
    if ((held || (this.creative && tapL)) && t && !this.targetMob) {
      if (!this.mining || this.mining.x !== t.x || this.mining.y !== t.y || this.mining.z !== t.z || this.mining.id !== t.id) {
        this.mining = { x: t.x, y: t.y, z: t.z, id: t.id, prog: 0, snd: 0 };
        const bd = BLOCKS[t.id];
        const tool = this.heldTool();
        if (!this.creative && bd.tool === 'pick' && this.breakTime(t.id) > 2 && (this.hintId !== t.id || this.t - this.hintT > 20)) {
          this.hintId = t.id; this.hintT = this.t;
          if (!tool || tool.tool !== 'pick') UI.toast(`Tip: a Pickaxe mines ${bd.name} much faster.`, '#ffc24b');
          else if (bd.tier && tool.tier < bd.tier) UI.toast(`Tip: ${TIER_NEED[bd.tier]} or better mines ${bd.name} faster.`, '#ffc24b');
        }
      }
      this.lastNormal = [t.nx, t.ny, t.nz];
      const bt2 = this.breakTime(t.id);
      if (this.creative) {
        if (this.attackCD <= 0 && bt2 < Infinity) { this.breakBlock(t.x, t.y, t.z); this.attackCD = 0.2; this.mining = null; UI.swing(); }
      } else if (bt2 < Infinity) {
        this.mining.prog += dt / bt2;
        this.mining.snd -= dt;
        if (this.mining.snd <= 0) { this.mining.snd = 0.24; Sound.play('dig', t.id); UI.swing(); if (Math.random() < 0.5) Particles.blockBreak(t.x + (t.nx * 0.5), t.y + (t.ny * 0.5), t.z + (t.nz * 0.5), t.id); }
        if (this.mining.prog >= 1) { this.breakBlock(t.x, t.y, t.z); this.mining = null; }
      } else if (tapL) UI.toast('Use a Bucket to scoop up liquids.');
    } else this.mining = null;
    if (Input.tapAttack && !t && !this.targetMob) UI.swing();
    if (Input.tapUse) this.useCD = 0;
    // use / place
    if (Input.clickR || (Input.mouseR && this.useCD <= 0)) { this.useCD = 0.27; this.use('all'); }
    else if (Input.tapUse || (touchBuild && this.useCD <= 0)) { this.useCD = 0.27; this.use('place'); }
    if (Input.tapAct) this.use('use');
  },
  attack(m, dir) {
    const S = this.stats, d = this.heldTool(), p = this.player;
    let dmg = (d && d.dmg) ? d.dmg : 1;
    dmg += S.strength;
    if (!p.onGround && p.vy < -1) dmg *= 1.5;
    m.damage(dmg, true, dir[0] * 5, dir[2] * 5);
    if (S.flamefist) m.burnT = 2 + S.flamefist;
    if (S.lifesteal && Math.random() < S.lifesteal && p.hp < this.maxHp()) { p.hp = Math.min(this.maxHp(), p.hp + 1); Particles.burst(p.x, p.y + 1.2, p.z, [1, 0.35, 0.5], 5, 1.5, 0.06, true); }
    UI.swing();
    p.hungerAcc += 0.03;
  },
  breakTime(id) {
    const d = BLOCKS[id];
    if (!d || d.unbreakable) return Infinity;
    if (this.creative) return 0;
    const tool = this.heldTool(), S = this.stats;
    // harder blocks take longer; the right tool is faster, and stronger tools are faster still
    let speed;
    if (tool && tool.tool === d.tool) { speed = tool.speed; if (d.tier && tool.tier < d.tier) speed *= 0.6; }
    else if (tool && tool.tool === 'sword' && (d.leaves || d.render === R_CROSS)) speed = 3;
    else speed = d.tool === 'pick' ? 0.5 : 1;
    let t = d.hard * 1.5 / speed / S.mine;
    if (S.widedig >= 2) t *= 1 - 0.2 * (S.widedig - 1);
    if (this.player.headInWater && !S.gills) t *= 2;
    if (!Number.isFinite(t)) t = d.hard * 1.5;
    return Math.max(0.05, t);
  },
  // every block drops its item, even when mined by hand (tools just make it faster)
  canHarvest() { return true; },
  getDrops(id) {
    const d = BLOCKS[id], S = this.stats;
    let drop = d.drop;
    if (typeof drop === 'function') drop = drop(Math.random() * ((S.greenthumb && (d.leaves || d.render === R_CROSS)) ? [1, 0.45, 0.3, 0.2][S.greenthumb] : 1));
    if (!drop) return [];
    let out = idOf(drop), n = 1;
    if (S.autosmelt) {
      if (d.smelt) out = idOf(d.smelt);
      else if (id === B.sand) out = B.glass;
      else if (id === B.stone) out = B.stone;
      if (S.autosmelt >= 3 && (d.smelt || id === B.sand) && Math.random() < 0.2) n = 2;
    }
    if (d.ore && S.lucky && Math.random() < S.lucky) n = 2;
    return [[out, n]];
  },
  breakBlock(x, y, z, extra) {
    const w = this.world, id = w.blockAt(x, y, z);
    if (!id) return;
    const d = BLOCKS[id];
    if (d.unbreakable) return;
    w.setBlock(x, y, z, WLOG[id] ? B.water : 0);
    if (d.pair) for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (w.blockAt(x + ox, y, z + oz) === B[d.pair]) { w.setBlock(x + ox, y, z + oz, 0); break; }
    Particles.blockBreak(x, y, z, id);
    if (!extra) Sound.play('break', id);
    if ((id === B.cracked_worldstone || id === B.worldstone) && y === 0) UI.popup('A rift opens!', 'Jump in!', this.realm.key === 'greenhollow' ? 'Something glows far below...' : 'Below is the void. Falling brings you back to the start.', '🕳️', '#c47aff');
    if (!this.creative) {
      if (this.canHarvest(id)) {
        for (const [did, n] of this.getDrops(id)) this.addItem(did, n);
        if (d.ore) this.tryModDrop(id, y);
      }
      if (d.group === 'log') this.achieve('wood');
      if (id === B.ruby_ore) this.achieve('ruby');
      if (y <= 3) this.achieve('deep');
    }
    // things resting on top
    for (let ay = y + 1; ay < HEIGHT; ay++) {
      const a = w.blockAt(x, ay, z);
      if ((RENDER[a] === R_CROSS && a !== B.vine) || a === B.cactus) {
        w.setBlock(x, ay, z, WLOG[a] ? B.water : 0);
        if (!this.creative) for (const [did, n] of this.getDrops(a)) this.addItem(did, n);
        if (a === B.kelp || a === B.cactus) continue;
      }
      break;
    }
    for (let by = y - 1; by > 0 && w.blockAt(x, by, z) === B.vine; by--) w.setBlock(x, by, z, 0);
    if (extra) return;
    const S = this.stats;
    if (S.treefeller && d.group === 'log') this.chainBreak(x, y, z, id, S.treefeller, true);
    else if (S.vein && d.ore && !d.ore.geode) this.chainBreak(x, y, z, id, S.vein, false);
    else if (S.widedig && !d.interact && this.lastNormal) {
      const n = this.lastNormal, ax = n[0] ? [1, 2] : n[1] ? [0, 2] : [0, 1];
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        if (!a && !b) continue;
        const o = [0, 0, 0]; o[ax[0]] = a; o[ax[1]] = b;
        const id2 = w.blockAt(x + o[0], y + o[1], z + o[2]), d2 = BLOCKS[id2];
        if (!id2 || d2.unbreakable || d2.interact || LIQ[id2] || d2.hard > d.hard * 1.6 + 0.6) continue;
        this.breakBlock(x + o[0], y + o[1], z + o[2], true);
      }
    }
  },
  chainBreak(x, y, z, id, max, tree) {
    const w = this.world, seen = new Set([x + ',' + y + ',' + z]), q = [[x, y, z]];
    let n = 0;
    const leaves = [];
    while (q.length && n < max) {
      const [cx, cy, cz] = q.shift();
      for (let dy = tree ? 0 : -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const X = cx + dx, Y = cy + dy, Z = cz + dz, k = X + ',' + Y + ',' + Z;
        if (seen.has(k)) continue; seen.add(k);
        const b = w.blockAt(X, Y, Z);
        if (b === id && n < max) { this.breakBlock(X, Y, Z, true); n++; q.push([X, Y, Z]); }
        else if (tree && LEAF[b]) leaves.push([X, Y, Z]);
      }
    }
    if (tree) {
      let lq = leaves.slice(), ln = 0;
      const ls = new Set(lq.map(a => a.join(',')));
      while (lq.length && ln < 160) {
        const [lx, ly, lz] = lq.shift();
        if (!LEAF[w.blockAt(lx, ly, lz)]) continue;
        this.breakBlock(lx, ly, lz, true); ln++;
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
          const k = (lx + dx) + ',' + (ly + dy) + ',' + (lz + dz);
          if (!ls.has(k) && LEAF[w.blockAt(lx + dx, ly + dy, lz + dz)] && Math.abs(lx + dx - x) < 6 && Math.abs(lz + dz - z) < 6) { ls.add(k); lq.push([lx + dx, ly + dy, lz + dz]); }
        }
      }
    }
    if (n) Sound.play('break', id);
  },
  tryModDrop(id, y) {
    const d = BLOCKS[id], S = this.stats;
    const mult = [1, 2, 2, 3][S.rainbow || 0];
    if (Math.random() < d.ore.chance * mult) {
      const key = rollMod(d.ore.tier + (d.ore.geode ? 1 : 0), this.realm, y, S.rainbow >= 2 ? 1 : 0, this.save.mods);
      this.grantMod(key);
    }
  },
  // mode: 'all' (right-click), 'place' (Build button: only places blocks), 'use' (Use button: never places)
  use(mode = 'all') {
    const p = this.player, held = p.inv[p.sel], hd = held ? itemDef(held.id) : null, t = this.target;
    if (mode === 'place') {
      if (held && isPlaceable(held.id) && t && !this.targetMob) this.placeBlock(t, held);
      else if (held && !isPlaceable(held.id) && this.t - (this.tipT || -9) > 4) { this.tipT = this.t; UI.toast('That is not a block. Press ✋ Use to use it.'); }
      return;
    }
    if (this.targetMob && this.targetMob.def.trader && !this.targetMob.dead) { this.openTrade(this.targetMob); return; }
    if (t && !this.targetMob) {
      const bd = BLOCKS[t.id];
      if (bd.interact && (mode === 'use' || !(p.sneaking && held && isPlaceable(held.id)))) { if (this.interactBlock(t, bd, held)) return; }
      if (held && held.id === I.frost_crystal && (t.id === B.ice || t.id === B.packed_ice || t.id === B.blue_ice)) {
        if (this.tryFrostPortal(t)) { if (!this.creative) { held.n--; if (held.n <= 0) p.inv[p.sel] = null; UI.updateHotbar(); } }
        else UI.toast('Build a hollow Ice frame first: the hole inside must be 2 wide and 3 tall.', '#8fe0ff');
        return;
      }
    }
    if (hd && hd.bucket !== undefined) { this.useBucket(held, hd); return; }
    if (hd && hd.food) { this.eat(held, hd); return; }
    if (hd && hd.use) { this.useItem(held, hd); return; }
    if (held && held.id === I.ember_key) { UI.toast('Hold the Ember Key and jump into lava!', '#ff6a2a'); return; }
    if (mode === 'use') { if (this.t - (this.tipT || -9) > 4) { this.tipT = this.t; UI.toast('Point at a workbench, furnace, bed, gate or villager, or hold food to eat.'); } return; }
    if (held && isPlaceable(held.id) && t && !this.targetMob) this.placeBlock(t, held);
  },
  // what the Use button would do right now (shown under the crosshair)
  useHint() {
    const p = this.player, held = p.inv[p.sel];
    if (this.targetMob && this.targetMob.def.trader) return 'Trade with the ' + VILLAGER_ROLES[this.targetMob.variant];
    const t = this.target;
    if (!t) return '';
    if (held && held.id === I.frost_crystal && (t.id === B.ice || t.id === B.packed_ice || t.id === B.blue_ice)) return 'Open a Frost Portal';
    const d = BLOCKS[t.id];
    const what = { craft: 'open crafting', bed: this.realm.sky.mode === 'cycle' ? 'sleep and set your spawn' : 'set your spawn', dreambed: 'take a dreamy nap', gate: 'travel to a realm', rocket: 'blast off!', eat: 'eat some cake',
      barrel: held && held.id === I.igniter ? 'light it, then run!' : '' }[d.interact];
    return what ? `${d.name}: ${what}` : '';
  },
  useBucket(stack, d) {
    const p = this.player, w = this.world, eye = this.eye(), dir = this.viewDir(), reach = this.creative ? 8 : 5.2;
    if (d.bucket === 0) {
      const hit = w.raycast(eye[0], eye[1], eye[2], dir[0], dir[1], dir[2], reach, id => id > 0);
      if (!hit || !LIQ[hit.id]) { UI.toast('Point the bucket at water, lava or chocolate milk.'); return; }
      const filled = [0, I.water_bucket, I.lava_bucket, I.choco_bucket][LIQ[hit.id]];
      w.setBlock(hit.x, hit.y, hit.z, 0);
      Sound.play('splash'); Particles.blockBreak(hit.x, hit.y, hit.z, hit.id);
      if (stack.n <= 1) p.inv[p.sel] = { id: filled, n: 1 };
      else { if (!this.creative) stack.n--; this.addItem(filled, 1); }
    } else {
      const t = this.target;
      if (!t || this.targetMob) { UI.toast('Point at a block to pour next to it.'); return; }
      let x = t.x + t.nx, y = t.y + t.ny, z = t.z + t.nz;
      if (REPL[t.id] && !LIQ[t.id]) { x = t.x; y = t.y; z = t.z; }
      const cur = w.blockAt(x, y, z);
      if ((cur && !REPL[cur]) || y < 0 || y >= HEIGHT) return;
      w.setBlock(x, y, z, d.bucket);
      Sound.play('splash');
      if (!this.creative) p.inv[p.sel] = { id: I.bucket, n: 1 };
    }
    UI.swing(); UI.updateHotbar();
  },
  interactBlock(t, bd, held) {
    const p = this.player;
    switch (bd.interact) {
      case 'craft': this.toggleUI('inv'); return true;
      case 'gate': this.toggleUI('travel'); return true;
      case 'bed':
        if (this.realm.key === 'greenhollow') { this.save.bedSpawn = [t.x + 0.5, t.y + 1, t.z + 0.5]; UI.toast('Spawn point set!', '#ffc24b'); }
        if (this.realm.sky.mode === 'cycle' && this.time > 0.48 && this.time < 0.98) {
          $('fx-fade').style.opacity = 1;
          setTimeout(() => { this.time = 0.01; $('fx-fade').style.opacity = 0; UI.toast('Good morning!'); }, 700);
          this.achieve('sleep');
        } else if (this.realm.sky.mode === 'cycle') UI.toast('You can only sleep at night.');
        return true;
      case 'dreambed':
        UI.toast(this.realm.key === 'sugarland' ? 'You wake up at home...' : 'You drift into a sugary dream...', '#ff8ad8');
        this.travelTo(this.realm.key === 'sugarland' ? 'greenhollow' : 'sugarland', 'dream');
        return true;
      case 'rocket':
        this.rocket = { t: 0, dest: this.realm.key === 'lunara' ? 'greenhollow' : 'lunara' };
        p.x = t.x + 0.5; p.z = t.z + 0.5; p.y = t.y + 1;
        Sound.play('rocket'); UI.toast('3... 2... 1... BLAST OFF!', '#c8d0ff');
        return true;
      case 'barrel':
        if (held && held.id === I.igniter) { this.world.setBlock(t.x, t.y, t.z, 0); this.barrels.push({ x: t.x + 0.5, y: t.y, z: t.z + 0.5, vx: 0, vy: 0, vz: 0, w: 0.98, h: 0.98, fuse: 3, fuseSnd: 0 }); Sound.play('fuse'); UI.toast('RUN!', '#ff5a5a'); return true; }
        if (!(held && isPlaceable(held.id))) UI.toast('Use an Igniter on a Boom Barrel to light it.');
        return false;
      case 'eat':
        if (p.food < 20 || this.creative) { this.world.setBlock(t.x, t.y, t.z, 0); p.food = Math.min(20, p.food + 3); Sound.play('eat'); this.achieve('eat'); Particles.blockBreak(t.x, t.y, t.z, t.id); return true; }
        return false;
    }
    return false;
  },
  eat(stack, d) {
    const p = this.player, S = this.stats;
    if (p.food >= 20 && p.hp >= this.maxHp() && !d.speedBoost) { UI.toast("You're full!"); return; }
    p.food = Math.min(20, p.food + d.food * (S.sweettooth ? 2 : 1) * (S.greenthumb >= 2 && d.plant ? 2 : 1));
    if (S.sweettooth >= 2) p.hp = Math.min(this.maxHp(), p.hp + (S.sweettooth - 1) * 2);
    if (d.speedBoost) p.speedBoost = d.speedBoost;
    if (S.sugarrush) p.speedBoost = Math.max(p.speedBoost, S.sugarrush);
    if (!this.creative) { stack.n--; if (stack.n <= 0) p.inv[p.sel] = null; }
    Sound.play('eat'); this.achieve('eat'); UI.updateHotbar(); UI.swing();
  },
  useItem(stack, d) {
    const p = this.player, r = this.realm.key;
    switch (d.use) {
      case 'conch':
        if (r === 'coralabyss') this.travelTo('greenhollow', 'conch');
        else if (p.inWater || p.headInWater) { UI.toast('The sea answers your call...', '#3fe0c8'); this.travelTo('coralabyss', 'conch'); }
        else UI.toast('Swim underwater, then blow the Conch!', '#3fe0c8');
        break;
      case 'clock': this.travelTo(r === 'dinovalley' ? 'greenhollow' : 'dinovalley', 'clock'); break;
      case 'starkey': this.travelTo(r === 'prismara' ? 'greenhollow' : 'prismara', 'star'); break;
      case 'charm':
        if (!this.creative) { stack.n--; if (stack.n <= 0) p.inv[p.sel] = null; UI.updateHotbar(); }
        if (r === 'greenhollow') { const sp = this.save.bedSpawn || this.realmSpawn('greenhollow'); p.x = sp[0]; p.y = sp[1]; p.z = sp[2]; p.vy = 0; Sound.play('portal'); }
        else this.travelTo('greenhollow', 'charm');
        break;
    }
  },
  placeBlock(t, held) {
    const p = this.player, w = this.world;
    let x = t.x + t.nx, y = t.y + t.ny, z = t.z + t.nz;
    if (REPL[t.id] && !LIQ[t.id]) { x = t.x; y = t.y; z = t.z; }
    if (y < 0 || y >= HEIGHT) return;
    const cur = w.blockAt(x, y, z);
    if (cur && !REPL[cur]) return;
    const id = held.id;
    if (SOLID[id]) {
      const hw = p.w / 2;
      if (x + 1 > p.x - hw && x < p.x + hw && y + 1 > p.y && y < p.y + p.h && z + 1 > p.z - hw && z < p.z + hw) return;
      for (const m of Mobs.list) { const mw = m.w * (m.def.scale || 1) / 2; if (x + 1 > m.x - mw && x < m.x + mw && y + 1 > m.y && y < m.y + m.h && z + 1 > m.z - mw && z < m.z + mw) return; }
    }
    const pairKey = BLOCKS[id].pair;
    let px2, pz2;
    if (pairKey) {
      const f = this.viewDir(), ax = Math.abs(f[0]) > Math.abs(f[2]);
      px2 = x + (ax ? Math.sign(f[0]) : 0); pz2 = z + (ax ? 0 : Math.sign(f[2]));
      const c2 = w.blockAt(px2, y, pz2), hw = p.w / 2;
      const inPlayer = px2 + 1 > p.x - hw && px2 < p.x + hw && y + 1 > p.y && y < p.y + p.h && pz2 + 1 > p.z - hw && pz2 < p.z + hw;
      if ((c2 && !REPL[c2]) || inPlayer) { UI.toast('A bed is 2 blocks long: it needs an empty space in front of it.'); return; }
    }
    w.setBlock(x, y, z, id);
    if (pairKey) w.setBlock(px2, y, pz2, B[pairKey]);
    Sound.play('place', id); UI.swing();
    if (!this.creative) { held.n--; if (held.n <= 0) p.inv[p.sel] = null; UI.updateHotbar(); }
    this.save.counters.placed++;
    if (this.save.counters.placed >= 200) this.achieve('builder');
  },
  tryFrostPortal(t) {
    const w = this.world, isFrame = id => id === B.ice || id === B.packed_ice || id === B.blue_ice;
    for (const axis of ['x', 'z']) {
      const ax = axis === 'x' ? [1, 0] : [0, 1];
      const nb = [[ax[0], 0, ax[1]], [-ax[0], 0, -ax[1]], [0, 1, 0], [0, -1, 0]];
      for (const n of nb) {
        const s0 = [t.x + n[0], t.y + n[1], t.z + n[2]];
        if (w.blockAt(s0[0], s0[1], s0[2]) !== 0) continue;
        const seen = new Set(), stack = [s0], cells = []; let ok = true;
        while (stack.length) {
          const [x, y, z] = stack.pop(), k = x + ',' + y + ',' + z;
          if (seen.has(k)) continue; seen.add(k);
          const id = w.blockAt(x, y, z);
          if (isFrame(id)) continue;
          if (id !== 0) { ok = false; break; }
          cells.push([x, y, z]); if (cells.length > 48) { ok = false; break; }
          for (const m of nb) stack.push([x + m[0], y + m[1], z + m[2]]);
        }
        if (!ok || cells.length < 6) continue;
        const hs = cells.map(c => (axis === 'x' ? c[0] : c[2])), ys = cells.map(c => c[1]);
        const W = Math.max(...hs) - Math.min(...hs) + 1, H = Math.max(...ys) - Math.min(...ys) + 1;
        if (W < 2 || H < 3 || W * H !== cells.length) continue;
        for (const c of cells) w.setBlock(c[0], c[1], c[2], B.frost_portal);
        Sound.play('portal'); UI.toast('The Frost Portal opens! Walk through it.', '#8fe0ff');
        for (const c of cells) Particles.burst(c[0] + .5, c[1] + .5, c[2] + .5, [0.7, 0.95, 1], 3, 2, 0.1, true);
        return true;
      }
    }
    return false;
  },

  // ---------------- abilities ----------------
  ability(k) {
    const S = this.stats, p = this.player;
    if (this.state !== 'playing' || p.dead) return;
    const cd = this.abilityCD;
    if (k === 'X') {
      if (!S.xray) { UI.toast('You need the X-Ray Vision mod.'); return; }
      if (cd.X > 0) { UI.toast(`X-Ray recharging (${Math.ceil(cd.X)}s)`); return; }
      cd.X = 20; this.xrayT = 7; this.scanXray(); Sound.play('xray');
    } else if (k === 'R') {
      if (!S.blink) { UI.toast('You need the Prism Blink mod.'); return; }
      if (cd.R > 0) return;
      const eye = this.eye(), dir = this.viewDir();
      const hit = this.world.raycast(eye[0], eye[1], eye[2], dir[0], dir[1], dir[2], S.blinkR, id => SOLID[id] === 1);
      let tx, ty, tz;
      if (hit) { tx = hit.x + hit.nx + 0.5; ty = hit.y + hit.ny; tz = hit.z + hit.nz + 0.5; if (hit.ny === 0) { ty = hit.y; if (this.world.solidAt(Math.floor(tx), ty, Math.floor(tz))) ty++; } }
      else { tx = eye[0] + dir[0] * S.blinkR; ty = eye[1] + dir[1] * S.blinkR - 1.6; tz = eye[2] + dir[2] * S.blinkR; }
      if (boxCollides(this.world, tx, ty, tz, p.w, p.h)) { if (!boxCollides(this.world, tx, ty + 1, tz, p.w, p.h)) ty += 1; else { UI.toast('No room to blink there.'); return; } }
      Particles.burst(p.x, p.y + 1, p.z, [0.85, 0.6, 1], 20, 4, 0.1, true);
      p.x = tx; p.y = ty; p.z = tz; p.vy = 0; p.fallStart = ty;
      Particles.burst(p.x, p.y + 1, p.z, [0.85, 0.6, 1], 20, 4, 0.1, true);
      cd.R = 2.5; Sound.play('blink');
    } else if (k === 'Q') {
      if (!S.frostbolt) { UI.toast('You need the Frost Bolt mod.'); return; }
      if (cd.Q > 0) return;
      cd.Q = 1.1;
      const eye = this.eye(), dir = this.viewDir(), sp = 24;
      Projectiles.list.push({ x: eye[0] + dir[0] * 0.6, y: eye[1] + dir[1] * 0.6 - 0.1, z: eye[2] + dir[2] * 0.6, vx: dir[0] * sp, vy: dir[1] * sp, vz: dir[2] * sp,
        dmg: [0, 6, 9, 12][S.frostbolt], c: [0.7, 0.95, 1], life: 2, size: 0.18, fromPlayer: true, freeze: 2 + S.frostbolt });
      Sound.play('shoot'); UI.swing();
    } else if (k === 'F') {
      if (!S.roar) { UI.toast('You need the Mega Roar mod.'); return; }
      if (cd.F > 0) { UI.toast(`Roar recharging (${Math.ceil(cd.F)}s)`); return; }
      cd.F = 15;
      const r = 9 + S.roar * 2;
      for (const m of [...Mobs.list, ...(this.boss ? [this.boss] : [])]) {
        const d = Math.hypot(m.x - p.x, m.z - p.z);
        if (d < r && m.def.hostile !== 0) { m.damage(4 + S.roar * 3, true, (m.x - p.x) / (d || 1) * 12, (m.z - p.z) / (d || 1) * 12); m.fleeT = 5; }
        else if (d < r) m.fleeT = 5;
      }
      for (let i = 0; i < 48; i++) { const a = i / 48 * 6.28; Particles.add(p.x, p.y + 1, p.z, Math.cos(a) * 12, 0, Math.sin(a) * 12, 0.5, 0.12, 1, 0.9, 0.5, 1, 0, true); }
      Sound.play('roar'); this.shake = 0.6;
    }
    UI.last.modbar = null;
  },
  scanXray() {
    this.xrayScanT = 1.5;
    const p = this.player, w = this.world, r = this.stats.xrayR, out = [];
    const px = Math.floor(p.x), py = Math.floor(p.y), pz = Math.floor(p.z);
    for (let dy = -r; dy <= r && out.length < 500; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy + dz * dz > r * r) continue;
      const id = w.blockAt(px + dx, py + dy, pz + dz);
      if (ORE[id]) out.push([px + dx, py + dy, pz + dz, id]);
    }
    this.xrayList = out;
  },

  // ---------------- vitals ----------------
  updateVitals(dt) {
    const p = this.player, S = this.stats, maxHp = this.maxHp();
    if (p.hurtCD > 0) p.hurtCD -= dt;
    if (this.creative) { p.hp = maxHp; p.food = 20; p.air = 10; return; }
    if (p.dead) return;
    p.hungerAcc += dt / 50;
    if (p.hungerAcc >= 1) { p.hungerAcc -= 1; if (Math.random() < S.hungerMul) p.food = Math.max(0, p.food - 1); }
    if (p.food >= 16 && p.hp < maxHp) { p.healT += dt; if (p.healT > 3.5) { p.healT = 0; p.hp = Math.min(maxHp, p.hp + 1); p.hungerAcc += 0.25; } }
    if (S.regen && p.hp < maxHp) { p.regenT += dt; if (p.regenT > S.regen) { p.regenT = 0; p.hp = Math.min(maxHp, p.hp + 1); } }
    if (p.food <= 0) { p.starveT += dt; if (p.starveT > 5) { p.starveT = 0; if (p.hp > 2) this.hurtPlayer(1, null, 'starve'); } }
    const breathe = S.gills || this.realm.waterBreathing;
    if (p.headInWater && !breathe) {
      p.air -= dt;
      if (p.air <= 0) { p.air = 0; p.airT += dt; if (p.airT > 1) { p.airT = 0; this.hurtPlayer(2, null, 'drown'); } }
    } else p.air = Math.min(10, p.air + dt * 4);
    const fb = this.world.blockAt(Math.floor(p.x), Math.floor(p.y + 0.5), Math.floor(p.z));
    if (BLOCKS[fb] && BLOCKS[fb].bubbles) p.air = 10;
    if (p.inLava) {
      p.lavaT -= dt;
      if (p.lavaT <= 0) { p.lavaT = 0.5; if (S.fireproof >= 3) p.hp = Math.min(maxHp, p.hp + 1); else if (!S.fireproof) this.hurtPlayer(3, null, 'lava'); }
    }
    p.hurtBlockT -= dt;
    if (p.hurtBlockT <= 0) {
      const under = BLOCKS[this.world.blockAt(Math.floor(p.x), Math.floor(p.y - 0.05), Math.floor(p.z))];
      let touchCactus = false;
      for (const [ox, oz] of [[0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]]) if (this.world.blockAt(Math.floor(p.x + ox), Math.floor(p.y + 0.5), Math.floor(p.z + oz)) === B.cactus) touchCactus = true;
      if (under && under.id === B.magma && !p.sneaking && !S.fireproof && p.onGround) { this.hurtPlayer(1, null, 'magma'); p.hurtBlockT = 1; }
      else if (touchCactus) { this.hurtPlayer(1, null, 'cactus'); p.hurtBlockT = 0.6; }
    }
  },
  hurtPlayer(amount, src, cause) {
    const p = this.player, S = this.stats;
    if (this.creative || p.dead || this.travel || this.titleMode) return;
    if (p.hurtCD > 0 && cause !== 'starve') return;
    let dmg = amount;
    const diff = Settings.data.difficulty;
    if (diff === 'easy') dmg *= 0.6; else if (diff === 'peaceful') dmg *= 0.4;
    if (!['fall', 'starve', 'drown'].includes(cause)) {
      const armor = p.armor ? (itemDef(p.armor.id).armor || 0) : 0;
      dmg *= 1 - Math.min(0.85, armor + S.defense);
    }
    dmg = Math.max(1, Math.round(dmg));
    p.hp -= dmg; p.hurtCD = 0.5;
    if (src && src.x !== undefined) {
      const dx = p.x - src.x, dz = p.z - src.z, l = Math.hypot(dx, dz) || 1;
      p.vx += dx / l * 6; p.vz += dz / l * 6; p.vy = Math.max(p.vy, 4.5);
    }
    this.hurtFlash = 0.9; this.shake = Math.max(this.shake, 0.2);
    Sound.play('hurt');
    if (S.thorns && src && src.damage && !src.dead) src.damage(S.thorns, true);
    if (p.hp <= 0 && S.extralife && this.t >= this.windReady) {
      const wait = [0, 180, 120, 90][S.extralife];
      p.hp = [0, 6, 10, this.maxHp()][S.extralife]; this.windReady = this.t + wait; p.hurtCD = 1.5;
      UI.popup('Second Wind!', 'You bounced back!', `Ready again in ${wait} seconds.`, '🌟', RARITY[4].color, 2500);
      Sound.play('levelup'); Particles.burst(p.x, p.y + 1, p.z, [1, 0.9, 0.4], 30, 5, 0.1, true);
    } else if (p.hp <= 0) this.die(cause);
  },
  die(cause) {
    const p = this.player;
    p.dead = true; p.hp = 0;
    Sound.play('death');
    this.releaseLock();
    this.state = 'dead';
    const msgs = { lava: 'Lava is hot! Try the Fireproof mod.', fall: 'That was a long way down.', drown: 'Remember to come up for air!', starve: 'Eat some food!', cactus: 'Ouch, prickly!' };
    UI.showDeath((msgs[cause] || 'A monster got you.') + ' You keep all your stuff.');
  },
  respawn() {
    const p = this.player;
    p.dead = false; p.hp = this.maxHp(); p.food = Math.max(p.food, 14); p.air = 10; p.vx = p.vy = p.vz = 0;
    let sp = (this.realm.key === 'greenhollow' && this.save.bedSpawn) ? this.save.bedSpawn : this.realmSpawn(this.realm.key);
    this.world.generateArea(sp[0], sp[2], 1);
    if (boxCollides(this.world, sp[0], sp[1], sp[2], p.w, p.h)) sp = this.realmSpawn(this.realm.key);
    p.x = sp[0]; p.y = sp[1]; p.z = sp[2]; p.fallStart = p.y;
    UI.hideScreens(); this.state = 'playing'; this.requestLock();
    UI.last = {};
  },
  onMobDeath(m, fromPlayer) {
    const d = m.def;
    Sound.play('mobdie', d.pitch);
    Particles.burst(m.x, m.y + m.h / 2, m.z, [0.9, 0.9, 0.9], 16, 3, 0.12);
    if (fromPlayer && !this.creative) {
      for (const [k, a, b, ch] of d.drops) {
        if (Math.random() > ch) continue;
        let n = a + Math.floor(Math.random() * (b - a + 1));
        let id = idOf(k);
        if (this.stats.autosmelt >= 2) { const cooked = { raw_meat: 'cooked_meat', raw_fish: 'cooked_fish', dino_meat: 'cooked_dino' }[k]; if (cooked) id = idOf(cooked); }
        if (this.stats.critter && d.hostile !== 1 && Math.random() < this.stats.critter) n *= 2;
        if (n > 0) this.addItem(id, n);
      }
    }
    if (m.home) this.villageKilled[m.home] = this.t;
    if (fromPlayer && d.givesMod) {
      Particles.burst(m.x, m.y + .3, m.z, [1, 0.6, 1], 30, 5, 0.1, true);
      this.grantMod(rollMod(2, this.realm, 30, 1, this.save.mods));
      this.achieve('modling');
    }
    if (fromPlayer && d.hostile === 1) { this.save.counters.kills++; if (this.save.counters.kills >= 10) this.achieve('hunter'); }
  },
  // ---------------- creature log, pocket pal, geode finder ----------------
  updateDiscovery() {
    if (!this.save || this.player.dead) return;
    const seen = this.save.creatures || (this.save.creatures = []);
    const eye = this.eye(), dir = this.viewDir();
    for (const m of Mobs.list) {
      if (seen.includes(m.def.key)) continue;
      const dx = m.x - eye[0], dy = m.y + m.h * 0.5 * (m.def.scale || 1) - eye[1], dz = m.z - eye[2], d = Math.hypot(dx, dy, dz) || 1;
      if (d > 26 || (dx * dir[0] + dy * dir[1] + dz * dir[2]) / d < 0.55) continue;
      if (this.world.raycast(eye[0], eye[1], eye[2], dx / d, dy / d, dz / d, d - 1, id => OPAQUE[id] === 1)) continue;
      seen.push(m.def.key);
      UI.toast(`New creature found: ${m.def.name}! (${seen.length}/${Object.keys(MOBS).length})`, '#7ad04a', mobPreview(m.def, false, 48));
      Sound.play('achieve');
      if (seen.length >= 10) this.achieve('spot10');
      if (seen.length >= 30) this.achieve('spot30');
    }
  },
  updatePal(dt) {
    const S = this.stats, p = this.player;
    if (!S.pal || p.dead) { this.pal = null; return; }
    if (!this.pal) this.pal = { x: p.x, y: p.y + 2, z: p.z, t: 0, cd: 1 };
    const q = this.pal; q.t += dt;
    const a = q.t * 1.3, tx = p.x + Math.cos(a) * 1.1, tz = p.z + Math.sin(a) * 1.1, ty = p.y + 2.1 + Math.sin(q.t * 2.2) * 0.2;
    if (Math.hypot(tx - q.x, ty - q.y, tz - q.z) > 10) { q.x = tx; q.y = ty; q.z = tz; }
    const k = Math.min(1, dt * 5); q.x += (tx - q.x) * k; q.y += (ty - q.y) * k; q.z += (tz - q.z) * k;
    q.cd -= dt;
    if (q.cd > 0) return;
    let best = null, bd = 8;
    for (const m of this.boss ? [...Mobs.list, this.boss] : Mobs.list) {
      if (m.dead || !(m.def.hostile === 1 || m.angry || m.isBoss)) continue;
      const d = Math.hypot(m.x - q.x, m.y + m.h / 2 - q.y, m.z - q.z);
      if (d < bd) { bd = d; best = m; }
    }
    if (!best) { q.cd = 0.3; return; }
    q.cd = [0, 1.5, 1.2, 0.9][S.pal];
    const ex = best.x, ey = best.y + best.h * (best.def.scale || 1) * 0.5, ez = best.z;
    best.damage([0, 2, 3, 5][S.pal], true);
    for (let i = 0; i <= 12; i++) { const f = i / 12; Particles.add(q.x + (ex - q.x) * f, q.y + (ey - q.y) * f, q.z + (ez - q.z) * f, 0, 0, 0, 0.25, 0.05, 0.6, 1, 0.9, 1, 0, true); }
    Sound.play('zap');
  },
  updateVillages() {
    const p = this.player, w = this.world;
    this.villages = villagesNear(w.G, this.realm, p.x, p.z, 260).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).slice(0, 3);
    const seen = this.save.villages || (this.save.villages = []);
    for (const v of this.villages) {
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (d > 70 || !w.isLoaded(v.x, v.z) || !w.isLoaded(v.x + 8, v.z + 8) || !w.isLoaded(v.x - 8, v.z - 8)) continue;
      if (!seen.includes(v.key) && d < 40) {
        seen.push(v.key);
        UI.popup('You found a village!', 'Welcome, neighbor', 'Tap a villager to trade. Houses have beds, Workbenches and Furnaces.', '🏘️', '#ffc24b', 4500);
        Sound.play('achieve'); this.achieve('village');
      }
      if (Mobs.list.some(m => m.home === v.key)) continue;
      if (this.villageKilled[v.key] && this.t - this.villageKilled[v.key] < 90) continue;
      const rnd = mulberry32(v.seed ^ 77), n = 4 + Math.floor(rnd() * 2), start = Math.floor(rnd() * 5);
      const spots = [[3.5, 0.5], [-3.5, 2.5], [0.5, 3.5], [2.5, -3.5], [-3.5, -3.5]];
      for (let i = 0; i < n; i++) {
        const [ox, oz] = spots[i], x = v.x + ox, z = v.z + oz;
        let y = v.h + 1;
        for (let k = 0; k < 6 && boxCollides(w, x, y, z, 0.6, 1.7); k++) y++;
        const m = new Mob(MOBS.villager, x, y + 0.01, z);
        m.variant = (start + i) % 5; m.home = v.key; m.homePos = [v.x, v.z];
        Mobs.list.push(m);
      }
    }
  },
  openTrade(m) {
    this.tradeWith = m;
    this.state = 'ui';
    this.releaseLock();
    Input.mouseL = Input.mouseR = Input.btnMine = Input.btnBuild = false;
    UI.openTrade(m);
  },
  trade(m, idx) {
    const [give, get] = TRADES[m.variant][idx], inv = this.player.inv, id = idOf(get[0]);
    if (!this.creative && !give.every(([k, n]) => countIng(inv, k) >= n)) return false;
    if (!this.hasRoomFor(id)) { UI.toast('Inventory full!', '#ff5a5a'); return false; }
    if (!this.creative) for (const [k, n] of give) takeIng(inv, k, n);
    this.addItem(id, get[1]);
    Sound.play('craft'); this.achieve('trade');
    return true;
  },
  updateGeode() {
    const R = this.stats.geodeR, p = this.player;
    if (!R) { this.geode = null; return; }
    let best = null, bd = R;
    const cx = Math.floor(p.x / 16), cz = Math.floor(p.z / 16), cr = Math.ceil(R / 16);
    for (let dz = -cr; dz <= cr; dz++) for (let dx = -cr; dx <= cr; dx++) {
      const c = this.world.chunk(cx + dx, cz + dz);
      if (!c || !c.geodes) continue;
      for (const g of c.geodes) { const d = Math.hypot(g[0] + .5 - p.x, g[1] + .5 - p.y, g[2] + .5 - p.z); if (d < bd) { bd = d; best = g; } }
    }
    const was = this.geode;
    this.geode = best ? { x: best[0], y: best[1], z: best[2], d: bd } : null;
    if (best && (!was || was.x !== best[0] || was.y !== best[1] || was.z !== best[2])) UI.toast('Geode Finder: a Mod Geode is nearby! Check your map.', RARITY[2].color, iconURL(B.mod_geode));
  },
  onBossDeath(b) {
    this.boss = null; UI.bossBar(null);
    this.save.bossDefeated = true;
    for (let i = 0; i < 80; i++) Particles.add(b.x, b.y + 1.5, b.z, (Math.random() - .5) * 14, Math.random() * 10, (Math.random() - .5) * 14, 2, 0.2, Math.random(), Math.random(), 1, 1, 4, true);
    Sound.play('boom'); Sound.play('levelup');
    this.addItem(I.crown, 1); this.addItem(I.prism_shard, 10);
    const myth = MODS.filter(m => m.rarity === 5 && (this.save.mods[m.key] || 0) < 3);
    setTimeout(() => { if (myth.length) this.grantMod(myth[Math.floor(Math.random() * myth.length)].key); }, 2500);
    this.achieve('boss');
    UI.popup('Victory!', 'Champion of Realms', 'You defeated the Prism Guardian! You unlocked an extra mod slot.', '👑', '#ffc24b', 6000);
    this.recomputeStats();
  },

  // ---------------- triggers, entities, weather ----------------
  checkTriggers() {
    const p = this.player, r = this.realm.key, w = this.world;
    if (this.travel || p.dead) return;
    if (r === 'greenhollow' && p.y > 124) { UI.toast('You climbed above the clouds!', '#ffd25a'); this.travelTo('skyreach', 'climb'); return; }
    if (r === 'greenhollow' && p.y < -3) { this.travelTo('hollowdeep', 'rift'); return; }
    if (this.realm.fallOut && p.y < -18) { UI.toast('You fell off the sky islands...', '#ffd25a'); this.travelTo(this.realm.fallOut, 'fall'); return; }
    if (p.y < -30) {
      const sp = this.realmSpawn(r); p.x = sp[0]; p.y = sp[1]; p.z = sp[2]; p.vx = p.vy = p.vz = 0; p.fallStart = p.y;
      UI.toast('You fell out of the world! Back to the start.', '#c47aff'); Sound.play('portal'); return;
    }
    const held = p.inv[p.sel];
    if (p.inLava && held && held.id === I.ember_key) { this.travelTo(r === 'emberdeep' ? 'greenhollow' : 'emberdeep', 'lava'); return; }
    const body = w.blockAt(Math.floor(p.x), Math.floor(p.y + 0.6), Math.floor(p.z));
    if (body === B.frost_portal) { this.travelTo(r === 'frostveil' ? 'greenhollow' : 'frostveil', 'portal'); return; }
    if (r === 'prismara' && !this.save.bossDefeated && !this.boss && Math.hypot(p.x, p.z) < 30) {
      this.boss = new Boss(0, 70, 0);
      UI.popup('Beware!', 'The Prism Guardian', 'Defeat it to become Champion of Realms!', '💎', '#c46aff', 4000);
      Sound.play('boss');
    }
  },
  updateBoss(dt) {
    const b = this.boss;
    if (!b) return;
    if (Math.hypot(this.player.x, this.player.z) > 90 || this.player.dead) { this.boss = null; UI.bossBar(null); return; }
    b.update(dt);
    UI.bossBar(this.boss);
  },
  updateBarrels(dt) {
    const w = this.world;
    for (const b of this.barrels) {
      b.fuse -= dt; b.fuseSnd -= dt;
      if (b.fuseSnd <= 0) { b.fuseSnd = 0.5; Sound.play('fuse'); }
      b.vy -= 22 * dt;
      physMove(w, b, 0, b.vy * dt, 0);
      if (b.fuse <= 0) { b.dead = true; this.explode(b.x, b.y + 0.5, b.z, 3.8); }
    }
    this.barrels = this.barrels.filter(b => !b.dead);
  },
  explode(x, y, z, r) {
    const w = this.world, p = this.player;
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z), R = Math.ceil(r);
    for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy + dz * dz > r * r - Math.random() * 3) continue;
      const X = bx + dx, Y = by + dy, Z = bz + dz, id = w.blockAt(X, Y, Z);
      if (!id) continue;
      const d = BLOCKS[id];
      if (d.unbreakable || LIQ[id] || id === B.obsidian || id === B.guardian_stone || id === B.worldstone || id === B.realm_gate) continue;
      if (id === B.boom_barrel) { w.setBlock(X, Y, Z, 0); this.barrels.push({ x: X + .5, y: Y, z: Z + .5, vx: 0, vy: 3, vz: 0, w: .98, h: .98, fuse: 0.3 + Math.random() * 0.5, fuseSnd: 1 }); continue; }
      w.setBlock(X, Y, Z, WLOG[id] ? B.water : 0);
      if (!this.creative && Math.random() < 0.3) for (const [did, n] of this.getDrops(id)) this.addItem(did, n);
      if (Math.random() < 0.15) Particles.blockBreak(X, Y, Z, id);
    }
    for (let i = 0; i < 60; i++) {
      const fire = Math.random() < 0.5;
      Particles.add(x, y, z, (Math.random() - .5) * 14, Math.random() * 9, (Math.random() - .5) * 14, 0.8 + Math.random() * 0.8, 0.15 + Math.random() * 0.25, fire ? 1 : 0.5, fire ? 0.6 : 0.5, fire ? 0.2 : 0.5, 1, fire ? 2 : 4, fire);
    }
    Sound.play('boom'); this.shake = 0.7; this.achieve('boom');
    const blast = r * 1.8;
    const d = Math.hypot(p.x - x, p.y + 0.9 - y, p.z - z);
    if (d < blast) { this.hurtPlayer(Math.round((1 - d / blast) * 16), { x, z }, 'boom'); p.vy += (1 - d / blast) * 8; }
    for (const m of Mobs.list) { const md = Math.hypot(m.x - x, m.y - y, m.z - z); if (md < blast) m.damage((1 - md / blast) * 22, true, (m.x - x) / (md || 1) * 10, (m.z - z) / (md || 1) * 10); }
  },
  updateWeather(dt) {
    const r = this.realm, p = this.player, w = this.world;
    if (r.weather === 'rain') {
      this.rainT -= dt;
      if (this.rainT <= 0) { this.raining = !this.raining; this.rainT = this.raining ? 60 + Math.random() * 90 : 240 + Math.random() * 300; }
    } else this.raining = false;
    this.rain += ((this.raining ? 1 : 0) - this.rain) * Math.min(1, dt * 0.25);
    const type = r.weather === 'rain' ? (this.rain > 0.2 ? 'rain' : null) : r.weather;
    if (!type) return;
    const rate = { rain: 220 * this.rain, snow: 90, embers: 40, spores: 25, sparkles: 18 }[type] || 0;
    let n = rate * dt; while (n > 0) {
      if (Math.random() > n) break; n -= 1;
      const x = p.x + (Math.random() - .5) * 28, z = p.z + (Math.random() - .5) * 28;
      if (type === 'rain' || type === 'snow') {
        const y = p.y + 8 + Math.random() * 6;
        if (w.skyAt(x, y, z) < 0.9) continue;
        if (type === 'rain') { const pt = { x, y, z, vx: 0, vy: -20, vz: 0, life: 1.1, max: 1.1, size: 0.035, r: 0.6, g: 0.7, b: 0.95, a: 0.6, grav: 0, em: false, tall: 12 }; Particles.list.push(pt); }
        else Particles.add(x, y, z, (Math.random() - .5) * 0.8, -1.4 - Math.random() * 0.6, (Math.random() - .5) * 0.8, 6, 0.06, 1, 1, 1, 0.9, 0, false);
      } else {
        const y = p.y + (Math.random() - 0.3) * 10;
        if (type === 'embers') Particles.add(x, y, z, (Math.random() - .5) * 0.5, 0.8 + Math.random(), (Math.random() - .5) * 0.5, 3, 0.05, 1, 0.5 + Math.random() * 0.3, 0.1, 1, 0, true);
        else if (type === 'spores') Particles.add(x, y, z, (Math.random() - .5) * 0.3, (Math.random() - .5) * 0.3, (Math.random() - .5) * 0.3, 5, 0.04, 0.4, 0.9, 1, 1, 0, true);
        else Particles.add(x, y, z, 0, 0.2, 0, 2.5, 0.045, 1, 0.95, 1, 1, 0, true);
      }
    }
  },

  // ---------------- sky & lighting ----------------
  dayFactor() {
    const k = this.realm.sky;
    if (k.mode === 'none') return 0;
    const t = k.mode === 'cycle' ? this.time : k.time;
    return smoothstep(-0.18, 0.22, Math.sin(t * Math.PI * 2));
  },
  sunLevel() {
    const r = this.realm, k = r.sky;
    if (k.mode === 'none') return 0;
    if (k.mode === 'fixed') return r.sunMin;
    return lerp(r.sunMin, 1, this.dayFactor()) * (1 - 0.3 * this.rain);
  },
  skyParams() {
    const r = this.realm, k = r.sky;
    if (k.mode === 'none') return { sky: null, hor: hexRgb(k.day[1]).map(v => v / 255) };
    const t = k.mode === 'cycle' ? this.time : k.time, a = t * Math.PI * 2;
    const sd = [Math.cos(a), Math.sin(a), 0.28], l = Math.hypot(...sd); sd[0] /= l; sd[1] /= l; sd[2] /= l;
    const c = h => hexRgb(h).map(v => v / 255);
    let zen = c(k.day[0]), hor = c(k.day[1]);
    let stars = k.stars || 0, moon = 0, dayF = 1, setF = 0;
    if (k.mode === 'cycle') {
      dayF = this.dayFactor();
      setF = (1 - smoothstep(0, 0.32, Math.abs(Math.sin(a)))) * (Math.cos(a) !== 0 ? 1 : 0);
      zen = mixC(c(k.night[0]), zen, dayF); hor = mixC(c(k.night[1]), hor, dayF);
      if (k.sunset) hor = mixC(hor, c(k.sunset), setF * 0.65);
      stars *= 1 - dayF; moon = k.moon ? 1 - dayF : 0;
    }
    if (this.rain > 0.01) { const grey = [0.45, 0.5, 0.58]; zen = mixC(zen, mulC(grey, 0.5 + 0.5 * dayF), this.rain * 0.7); hor = mixC(hor, mulC(grey, 0.6 + 0.4 * dayF), this.rain * 0.7); }
    return {
      hor, setF,
      sky: {
        sunDir: sd, zen, hor, sunCol: k.mode === 'cycle' ? mixC([1, 0.95, 0.85], [1, 0.6, 0.3], setF) : [1, 0.95, 0.85], cloudCol: c(k.cloudColor || '#ffffff').map(v => v * (0.35 + 0.65 * dayF)),
        stars, sunVis: k.sun ? smoothstep(-0.12, 0.04, sd[1]) * (1 - this.rain * 0.8) : 0, moonVis: moon, sunBig: k.sunBig ? 1 : 0,
        aurora: k.aurora || 0, planet: k.planet || 0, rainbow: k.rainbow || 0, nebula: k.nebula || 0,
        clouds: k.clouds ? 1 : 0, cloudY: k.cloudY || 118, cloudSea: k.cloudSea || 0, dark: this.rain * 0.25,
      },
    };
  },
  collectLights(eye) {
    const p = this.player, w = this.world, out = [];
    const held = p.inv[p.sel];
    if (held && held.id < 256 && LIGHTR[held.id] > 0) { const L = BLOCKS[held.id].light; out.push([eye[0], eye[1] - 0.3, eye[2], L[3] * 0.85, L[0], L[1], L[2], -1]); }
    if (this.pal) out.push([this.pal.x, this.pal.y, this.pal.z, 5, 0.6, 1, 0.85, -1]);
    if (this.stats.glow) out.push([eye[0], eye[1], eye[2], 7 + this.stats.glow * 2.5, 0.85, 0.9, 1, -1]);
    const cand = [];
    const cx = Math.floor(eye[0] / 16), cz = Math.floor(eye[2] / 16);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const c = w.chunk(cx + dx, cz + dz); if (!c) continue;
      for (const l of c.lights) { const d = (l[0] - eye[0]) ** 2 + (l[1] - eye[1]) ** 2 + (l[2] - eye[2]) ** 2; if (d < 1600) cand.push([l, d]); }
    }
    cand.sort((a, b) => a[1] - b[1]);
    for (const [l] of cand) { if (out.length >= 32) break; out.push(l); }
    for (const b of this.barrels) if (Math.sin(b.fuse * 18) > 0 && out.length < 32) out.push([b.x, b.y + .5, b.z, 5, 1, 1, 1]);
    if (this.boss && out.length < 32) out.push([this.boss.x, this.boss.y + 1.5, this.boss.z, 14, 0.9, 0.6, 1]);
    return out;
  },

  // ---------------- render ----------------
  render(dt) {
    const p = this.player, cvs = Renderer.canvas;
    if (!p || !this.world) return;
    const aspect = (cvs.clientWidth || 1) / (cvs.clientHeight || 1);
    let eye = this.eye();
    if (!this.titleMode && p.onGround && !p.flying) eye[1] += Math.sin(p.bob * 2) * 0.045 * Math.min(1, Math.hypot(p.vx, p.vz) / 4);
    if (this.shake > 0) { eye[0] += (Math.random() - .5) * this.shake * 0.3; eye[1] += (Math.random() - .5) * this.shake * 0.3; eye[2] += (Math.random() - .5) * this.shake * 0.3; }
    if (p.dead) eye[1] = p.y + 0.3;
    const dir = this.viewDir();
    let fov = Settings.data.fov * (p.sprinting ? 1.08 : 1) * (p.flying && p.sprinting ? 1.06 : 1);
    const proj = M4.perspective(fov * Math.PI / 180, aspect, 0.06, 900);
    const view = M4.lookAt(eye, [eye[0] + dir[0], eye[1] + dir[1], eye[2] + dir[2]], [0, 1, 0]);
    const vp = M4.mul(proj, view);
    const sp = this.skyParams();
    const R = this.realm, S = this.stats;
    let fog = sp.hor, far = Math.min(R.fogFar || 1e9, Settings.data.renderDist * 16 - 6), near = far * 0.45 * (R.fogScale || 1);
    far *= 1 - 0.3 * this.rain; near *= 1 - 0.5 * this.rain;
    if (p.headInWater) { fog = [0.06, 0.22, 0.45]; near = 0.5; far = (R.waterBreathing ? 40 : 22) + (S.gills >= 2 ? 16 : 0); }
    if (p.headInLava) { fog = [0.9, 0.35, 0.05]; near = 0; far = S.fireproof ? 10 : 2.5; }
    $('fx-water').style.opacity = p.headInWater ? 1 : 0;
    $('fx-lava').style.opacity = p.headInLava ? (S.fireproof ? 0.35 : 1) : 0;
    const sun = this.titleMode ? Math.max(0.6, this.sunLevel()) : this.sunLevel();
    let tint = R.sunTint || [1, 1, 1];
    if (R.sky.mode === 'cycle') tint = mixC([1, 1, 1], [1.12, 0.85, 0.7], sp.setF || 0);
    if ((this.frameN & 3) === 0 || !this.lights.length) { this.lights = this.collectLights(eye); Renderer.setLights(this.lights); }
    // batches
    const Bt = this.batches, t = this.t;
    Bt.ents.reset(); Bt.parts.reset(); Bt.lines.reset(); Bt.xray.reset(); Bt.echo.reset();
    for (const m of Mobs.list) { if (Math.abs(m.x - p.x) < 90 && Math.abs(m.z - p.z) < 90) drawMob(Bt.ents, m, t); }
    if (this.boss) drawBoss(Bt.ents, this.boss, t);
    if (this.pal) {
      const q = this.pal, s = 0.13, fl = Math.sin(t * 22) * 0.08;
      Bt.ents.box(q.x - s, q.y - s, q.z - s, q.x + s, q.y + s, q.z + s, 0.7, 1, 0.85, 1, 1, true);
      Bt.ents.box(q.x - s - 0.22, q.y + fl, q.z - 0.07, q.x - s, q.y + 0.03 + fl, q.z + 0.1, 1, 1, 1, 1, 1, true);
      Bt.ents.box(q.x + s, q.y + fl, q.z - 0.07, q.x + s + 0.22, q.y + 0.03 + fl, q.z + 0.1, 1, 1, 1, 1, 1, true);
    }
    for (const b of this.barrels) { const f = Math.sin(b.fuse * 18) > 0; Bt.ents.box(b.x - .49, b.y, b.z - .49, b.x + .49, b.y + .98, b.z + .49, f ? 1 : 0.85, f ? 1 : 0.25, f ? 1 : 0.2, 1, 1, f); }
    for (const q of Particles.list) {
      const s = q.size, a = q.a * Math.min(1, q.life / q.max * 2), h = s * (q.tall || 1);
      const sky = q.em ? 1 : (this.titleMode ? 1 : this.world.skyAt(q.x, q.y, q.z));
      Bt.parts.box(q.x - s, q.y - h, q.z - s, q.x + s, q.y + h, q.z + s, q.r, q.g, q.b, a, sky, q.em);
    }
    for (const b of Projectiles.list) { const s = b.size; Bt.parts.box(b.x - s, b.y - s, b.z - s, b.x + s, b.y + s, b.z + s, b.c[0], b.c[1], b.c[2], 1, 1, true); }
    let crack = null;
    if (!this.titleMode && this.state === 'playing' && this.target && !p.dead) {
      const tg = this.target, e = 0.004;
      Bt.lines.wireBox(tg.x - e, tg.y - e, tg.z - e, tg.x + 1 + e, tg.y + BLOCK_H[tg.id] + e, tg.z + 1 + e, 0, 0, 0, 0.55);
      if (this.mining && this.mining.prog > 0.02) crack = crackVerts(tg.x, tg.y, tg.z, Math.floor(this.mining.prog * 8));
    }
    if (this.xrayT > 0) {
      const pulse = 0.55 + 0.25 * Math.sin(t * 5);
      for (const [x, y, z, id] of this.xrayList) {
        const c = hexRgb(XRAY_COLOR[BLOCKS[id].key] || '#ffffff').map(v => v / 255);
        Bt.xray.box(x + .2, y + .2, z + .2, x + .8, y + .8, z + .8, c[0], c[1], c[2], pulse, 1, true);
      }
    }
    if (S.echo && !this.titleMode) {
      const er = 14 + S.echo * 8;
      for (const m of Mobs.list) {
        if (Math.hypot(m.x - p.x, m.z - p.z) > er) continue;
        const sc = m.def.scale || 1, hw = m.w * sc / 2;
        const c = m.def.hostile === 1 ? [1, 0.35, 0.35] : [0.5, 0.9, 1];
        Bt.echo.box(m.x - hw, m.y, m.z - hw, m.x + hw, m.y + m.h * sc, m.z + hw, c[0], c[1], c[2], 0.28, 1, true);
      }
    }
    Renderer.render({
      vp, invVP: M4.invert(vp), cam: eye, fog, fogNear: near, fogFar: far, sun, sunTint: tint, amb: R.ambient + S.nightEyes + (this.titleMode ? 0.08 : 0),
      time: t, sky: (p.headInWater || p.headInLava) ? null : sp.sky, world: this.world,
      ents: Bt.ents.d, entN: Bt.ents.n, parts: Bt.parts.d, partN: Bt.parts.n, lines: Bt.lines.d, lineN: Bt.lines.n,
      crack, xray: Bt.xray.d, xrayN: Bt.xray.n, echo: Bt.echo.d, echoN: Bt.echo.n,
    });
    if (!this.titleMode && !p.dead && this.state !== 'title' && this.state !== 'entering' && this.state !== 'loading') {
      // how bright your hand is: sunlight where you stand, cave light, nearby torches
      let light = Math.max(this.world.skyAt(p.x, eye[1], p.z) * sun, R.ambient + S.nightEyes);
      for (const l of this.lights) { const a = clamp(1 - Math.hypot(l[0] - eye[0], l[1] - eye[1], l[2] - eye[2]) / l[3], 0, 1); light += a * a * 0.95; }
      const hand = this.handMesh(clamp(light, 0.08, 1.15), aspect);
      hand.proj = M4.perspective(70 * Math.PI / 180, aspect, 0.01, 10);
      Renderer.drawHand(hand);
    }
  },
  // your arm and whatever you're holding, in view space (camera at 0,0,0 looking down -Z)
  handMesh(light, aspect) {
    const p = this.player, held = p.inv[p.sel], atlas = [], items = [];
    const swing = this.swingT > 0 ? Math.sin((1 - this.swingT / 0.28) * Math.PI) : 0;
    const eq = this.equipT / 0.25;
    const moving = p.onGround ? Math.min(1, Math.hypot(p.vx, p.vz) / 4) : 0;
    const bx = Math.sin(p.bob) * 0.022 * moving, by = -Math.abs(Math.cos(p.bob)) * 0.022 * moving;
    // place the hand relative to the screen shape so it fits phones and wide screens
    const halfH = Math.tan(35 * Math.PI / 180) * 0.8, halfW = halfH * aspect, touch = Settings.touchOn();
    // on touch screens keep the hand clear of the buttons: above them in portrait, left of them in landscape
    const [ax, ay, sc] = !touch ? [0.56, -0.5, clamp(aspect / 1.4, 0.62, 1)] : aspect < 1 ? [0.48, 0.05, 0.55] : [0.36, -0.45, clamp(aspect / 1.6, 0.6, 0.9)];
    const empty = !held;
    const group = M4.chain(
      M4.translate(halfW * ax + bx, halfH * ay + by - eq * 0.4 - swing * 0.06 + (empty ? 0.03 : 0), -0.8 - swing * 0.1),
      M4.rotX(-swing * 0.85), M4.rotY(swing * 0.25), M4.scale(sc, sc, sc));
    const xf = (M, x, y, z) => [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]];
    const cube = (out, M, tiles, hs = 1, em = 0) => {
      for (let f = 0; f < 6; f++) {
        const tile = f === 2 ? tiles[0] : f === 3 ? tiles[1] : f === 4 ? tiles[3] : tiles[2];
        const u0 = (tile & 15) / 16, v0 = (tile >> 4) / 16;
        for (const k of [0, 1, 2, 0, 2, 3]) {
          const v = FACE_V[f][k], yy = (v[1] - 0.5) * hs, vv = hs < 1 && v[1] === 1 && f !== 2 ? 1 - hs : v[4];
          const q = xf(M, v[0] - 0.5, yy, v[2] - 0.5);
          out.push(q[0], q[1], q[2], u0 + v[3] / 16, v0 + vv / 16, FACE_SHADE[f], 1, em);
        }
      }
    };
    const quad = (out, M, u0, v0, u1, v1, em = 0) => {
      const C = [[-.5, -.5, u0, v1], [.5, -.5, u1, v1], [.5, .5, u1, v0], [-.5, .5, u0, v0]];
      for (const k of [0, 1, 2, 0, 2, 3]) { const c = C[k], q = xf(M, c[0], c[1], 0); out.push(q[0], q[1], q[2], c[2], c[3], 0.95, 1, em); }
    };
    // a box stretched from point a to point b (used for the arm)
    const between = (a, b, t) => {
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(...d), z = d.map(v => v / len);
      let x = [z[2], 0, -z[0]]; const xl = Math.hypot(...x) || 1; x = x.map(v => v / xl);
      const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
      const R = new Float32Array([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, 1]);
      return M4.mul(R, M4.scale(t, t, len));
    };
    // arm: hand just under the held item, sleeve running off the bottom-right of the screen
    const handA = empty ? [-0.02, 0.02, 0] : [0.05, -0.12, 0.06], wrist = [handA[0] + 0.08, handA[1] - 0.16, handA[2] + 0.16], shoulder = [handA[0] + 0.42, handA[1] - 0.95, handA[2] + 0.75];
    cube(atlas, M4.mul(group, between(handA, wrist, 0.15)), [TILE.hand_skin, TILE.hand_skin, TILE.hand_skin, TILE.hand_skin]);
    cube(atlas, M4.mul(group, between(wrist, shoulder, 0.18)), [TILE.hand_sleeve, TILE.hand_sleeve, TILE.hand_sleeve, TILE.hand_sleeve]);
    if (held) {
      const id = held.id;
      if (id < 256 && RENDER[id] !== R_CROSS) {
        cube(atlas, M4.chain(group, M4.translate(0, 0.04, -0.05), M4.rotX(0.12), M4.rotY(0.78), M4.scale(0.26, 0.26, 0.26)), [TEX_T[id], TEX_B[id], TEX_S[id], TEX_F[id]], BLOCK_H[id], EMIT[id]);
      } else {
        const M = M4.chain(group, M4.translate(0.0, 0.09, -0.07), M4.rotY(-0.45), M4.rotZ(0.25), M4.scale(0.42, 0.42, 0.42));
        if (id < 256) { const tl = TEX_S[id], u0 = (tl & 15) / 16, v0 = (tl >> 4) / 16; quad(atlas, M, u0, v0, u0 + 1 / 16, v0 + 1 / 16, EMIT[id]); }
        else { const sl = ITEM_SLOT[id], u0 = (sl % 16) / 16, v0 = Math.floor(sl / 16) / 16; quad(items, M, u0, v0, u0 + 1 / 16, v0 + 1 / 16); }
      }
    }
    return { atlas: new Float32Array(atlas), items: new Float32Array(items), light };
  },
};

// expose for debugging/tests
window.Game = Game;
window.addEventListener('load', () => Game.boot());
