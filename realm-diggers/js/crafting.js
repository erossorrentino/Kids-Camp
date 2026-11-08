'use strict';
// ============================================================
// Recipes. st = station needed nearby: null | 'bench' | 'furnace'
// Ingredients can be a group: 'group:log', 'group:flower'
// ============================================================

const RECIPES = [];
function rec(out, n, ins, st, cat) { RECIPES.push({ out, n, in: ins, st: st || null, cat: cat || 'blocks' }); }

// Basics (no station)
rec('planks', 4, [['group:log', 1]], null, 'basics');
rec('stick', 4, [['planks', 2]], null, 'basics');
rec('workbench', 1, [['planks', 4]], null, 'basics');
rec('torch', 4, [['stick', 1], ['coal', 1]], null, 'basics');
rec('scaffold', 4, [['stick', 4]], null, 'basics');
rec('homeward_charm', 1, [['gold_ingot', 1], ['stick', 1]], null, 'realm');
// Tools
const TOOL_MATS = [['wood', 'planks'], ['stone', 'cobble'], ['iron', 'iron_ingot'], ['ruby', 'ruby'], ['prism', 'prism_shard']];
for (const [t, m] of TOOL_MATS) {
  rec(t + '_pickaxe', 1, [[m, 3], ['stick', 2]], 'bench', 'tools');
  rec(t + '_axe', 1, [[m, 3], ['stick', 2]], 'bench', 'tools');
  rec(t + '_shovel', 1, [[m, 1], ['stick', 2]], 'bench', 'tools');
  rec(t + '_sword', 1, [[m, 2], ['stick', 1]], 'bench', 'tools');
}
rec('iron_armor', 1, [['iron_ingot', 8]], 'bench', 'tools');
rec('ruby_armor', 1, [['ruby', 8]], 'bench', 'tools');
rec('prism_armor', 1, [['prism_shard', 8]], 'bench', 'tools');
rec('igniter', 1, [['iron_ingot', 1], ['coal', 1]], 'bench', 'tools');
rec('bucket', 1, [['iron_ingot', 3]], 'bench', 'tools');
// Smelting
rec('iron_ingot', 1, [['iron_ore', 1]], 'furnace', 'smelt');
rec('copper_ingot', 1, [['copper_ore', 1]], 'furnace', 'smelt');
rec('gold_ingot', 1, [['gold_ore', 1]], 'furnace', 'smelt');
rec('glass', 1, [['sand', 1]], 'furnace', 'smelt');
rec('stone', 1, [['cobble', 1]], 'furnace', 'smelt');
rec('bricks', 1, [['clay', 1]], 'furnace', 'smelt');
rec('cooked_meat', 1, [['raw_meat', 1]], 'furnace', 'food');
rec('cooked_fish', 1, [['raw_fish', 1]], 'furnace', 'food');
rec('cooked_dino', 1, [['dino_meat', 1]], 'furnace', 'food');
// Building blocks
rec('furnace', 1, [['cobble', 8]], 'bench', 'blocks');
rec('stone_bricks', 4, [['stone', 4]], 'bench', 'blocks');
rec('lantern', 1, [['copper_ingot', 1], ['torch', 1]], 'bench', 'blocks');
rec('bed', 1, [['wool', 3], ['planks', 3]], 'bench', 'blocks');
rec('boom_barrel', 1, [['sand', 4], ['coal', 5]], 'bench', 'blocks');
rec('bounce_pad', 1, [['slime_ball', 4]], null, 'blocks');
rec('chest', 1, [['planks', 8]], 'bench', 'basics');

// ============================================================
// Loot in village chests (made the first time a chest is opened, same for everyone on that seed)
// ============================================================
const CHEST_LOOT = [
  ['apple', 2, 5, 10], ['berries', 3, 8, 8], ['cooked_meat', 1, 4, 8], ['cooked_fish', 1, 3, 6], ['torch', 4, 12, 9], ['coal', 3, 10, 9],
  ['iron_ingot', 1, 5, 8], ['copper_ingot', 1, 4, 6], ['gold_ingot', 1, 3, 5], ['planks', 4, 12, 6], ['glass', 2, 6, 4], ['wool', 1, 3, 4],
  ['ruby', 1, 2, 2], ['sapphire', 1, 2, 2], ['bucket', 1, 1, 2], ['homeward_charm', 1, 2, 3], ['stone_pickaxe', 1, 1, 3], ['iron_pickaxe', 1, 1, 1],
  ['iron_sword', 1, 1, 1], ['conch', 1, 1, 1.5], ['fossil', 1, 1, 1.2], ['iron_armor', 1, 1, 0.6], ['mod_geode', 1, 1, 0.8], ['boom_barrel', 1, 2, 1.5],
];
const CHEST_LOOT_THEME = {
  candy: [['candy', 3, 8, 12], ['cotton_candy', 1, 4, 6], ['sugar_crystal', 1, 1, 1.2]],
  jungle: [['dino_meat', 1, 3, 8], ['cooked_dino', 1, 2, 6], ['amber', 1, 1, 1.2]],
  ice: [['snow', 4, 12, 6], ['ice', 2, 6, 5], ['glacite', 1, 1, 1.2]],
  desert: [['sand', 4, 16, 6], ['sandstone', 4, 12, 5], ['gold_ingot', 1, 4, 4]],
  snow: [['snow', 2, 8, 5], ['pine_log', 2, 6, 4]],
  oak: [['oak_log', 2, 6, 5], ['flower_red', 1, 3, 3]],
};
function rollChestLoot(rnd, theme) {
  const table = CHEST_LOOT.concat(CHEST_LOOT_THEME[theme] || []), total = table.reduce((a, t) => a + t[3], 0);
  const slots = new Array(27).fill(null), n = 4 + Math.floor(rnd() * 4);
  for (let k = 0; k < n; k++) {
    let r = rnd() * total, pick = table[0];
    for (const t of table) { r -= t[3]; if (r <= 0) { pick = t; break; } }
    const id = idOf(pick[0]), cnt = Math.min(itemDef(id).stack, pick[1] + Math.floor(rnd() * (pick[2] - pick[1] + 1)));
    let at = Math.floor(rnd() * 27); while (slots[at]) at = (at + 1) % 27;
    slots[at] = { id, n: cnt };
  }
  return slots;
}
rec('iron_block', 1, [['iron_ingot', 9]], 'bench', 'blocks');
rec('gold_block', 1, [['gold_ingot', 9]], 'bench', 'blocks');
rec('ruby_block', 1, [['ruby', 9]], 'bench', 'blocks');
rec('iron_ingot', 9, [['iron_block', 1]], null, 'blocks');
rec('gold_ingot', 9, [['gold_block', 1]], null, 'blocks');
rec('ruby', 9, [['ruby_block', 1]], null, 'blocks');
rec('snow', 1, [['ice', 1]], null, 'blocks');
rec('ice', 2, [['snow', 4]], 'bench', 'blocks');
rec('wool', 1, [['cotton_candy', 2]], null, 'blocks');
rec('paint_red', 4, [['cobble', 4], ['flower_red', 1]], null, 'paint');
rec('paint_yellow', 4, [['cobble', 4], ['flower_yellow', 1]], null, 'paint');
rec('paint_blue', 4, [['cobble', 4], ['flower_blue', 1]], null, 'paint');
rec('paint_green', 4, [['cobble', 4], ['cactus', 1]], null, 'paint');
rec('paint_purple', 4, [['cobble', 4], ['berries', 1]], null, 'paint');
rec('paint_orange', 4, [['cobble', 4], ['flower_red', 1], ['flower_yellow', 1]], null, 'paint');
rec('paint_pink', 4, [['cobble', 4], ['flower_red', 1], ['bone', 1]], null, 'paint');
rec('paint_white', 4, [['cobble', 4], ['bone', 1]], null, 'paint');
rec('paint_black', 4, [['cobble', 4], ['coal', 1]], null, 'paint');
// Realm travel
rec('ember_key', 1, [['gold_ingot', 2], ['coal', 4]], 'bench', 'realm');
rec('frost_crystal', 1, [['ice', 2], ['sapphire', 1]], 'bench', 'realm');
rec('dream_bed', 1, [['bed', 1], ['gold_ingot', 2], ['group:flower', 3]], 'bench', 'realm');
rec('moon_rocket', 1, [['iron_ingot', 8], ['glass', 2], ['coal', 6], ['boom_barrel', 1]], 'bench', 'realm');
rec('time_clock', 1, [['fossil', 1], ['gold_ingot', 2], ['copper_ingot', 4]], 'bench', 'realm');
rec('star_key', 1, REALM_GEMS.map(g => [g, 1]), 'bench', 'realm');
rec('realm_gate', 1, [['obsidian', 4], ['gold_ingot', 2], ['glass', 1]], 'bench', 'realm');

// ============================================================
// Villager trades: [give list, get]
// ============================================================
const VILLAGER_ROLES = ['Farmer', 'Smith', 'Gem Trader', 'Explorer', 'Mystic'];
const TRADES = [
  [[[['berries', 4]], ['apple', 2]], [[['raw_meat', 2]], ['cooked_meat', 2]], [[['raw_fish', 2]], ['cooked_fish', 2]], [[['wool', 3], ['planks', 3]], ['bed', 1]]],
  [[[['coal', 6]], ['iron_ingot', 1]], [[['iron_ingot', 3]], ['bucket', 1]], [[['iron_ingot', 5]], ['gold_ingot', 1]], [[['cobble', 16]], ['furnace', 1]]],
  [[[['gold_ingot', 4]], ['ruby', 1]], [[['gold_ingot', 4]], ['sapphire', 1]], [[['iron_ingot', 8]], ['gold_ingot', 2]], [[['ruby', 1]], ['gold_ingot', 3]]],
  [[[['gold_ingot', 3]], ['conch', 1]], [[['iron_ingot', 6]], ['fossil', 1]], [[['gold_ingot', 1]], ['homeward_charm', 2]], [[['coal', 5], ['sand', 4]], ['boom_barrel', 2]]],
  [[[['gold_ingot', 8]], ['mod_geode', 1]], [[['ruby', 3]], ['mod_geode', 1]], [[['apple', 4]], ['candy', 4]], [[['sapphire', 2]], ['frost_crystal', 1]]],
];

const RECIPE_CATS = [['all', 'All'], ['basics', 'Basics'], ['tools', 'Tools'], ['smelt', 'Smelting'], ['blocks', 'Blocks'], ['paint', 'Paint'], ['food', 'Food'], ['realm', 'Realm Items'], ['materials', 'Materials']];

function ingMatches(key, id) {
  if (key.startsWith('group:')) { const d = itemDef(id); return !!d && d.group === key.slice(6); }
  return idOf(key) === id;
}
function countIng(inv, key) {
  let n = 0;
  for (const s of inv) if (s && ingMatches(key, s.id)) n += s.n;
  return n;
}
function ingName(key) {
  if (key === 'group:log') return 'Any Log';
  if (key === 'group:flower') return 'Any Flower';
  return itemName(idOf(key));
}
function ingIcon(key) {
  if (key === 'group:log') return iconURL(B.oak_log);
  if (key === 'group:flower') return iconURL(B.flower_red);
  return iconURL(idOf(key));
}
function canCraft(inv, r) { return r.in.every(([k, n]) => countIng(inv, k) >= n); }
function takeIng(inv, key, n) {
  for (let i = 0; i < inv.length && n > 0; i++) {
    const s = inv[i];
    if (!s || !ingMatches(key, s.id)) continue;
    const t = Math.min(n, s.n); s.n -= t; n -= t;
    if (s.n <= 0) inv[i] = null;
  }
}

// ============================================================
// Materials: how to get each crafting material and what it makes
// ============================================================
const MATERIAL_GROUPS = [
  ['Wood & stone', ['group:log', 'planks', 'stick', 'cobble', 'stone', 'sand', 'glass', 'clay', 'snow', 'ice', 'cactus', 'obsidian']],
  ['Ores & metals', ['coal', 'copper_ore', 'copper_ingot', 'iron_ore', 'iron_ingot', 'iron_block', 'gold_ore', 'gold_ingot', 'gold_block', 'ruby', 'ruby_block', 'sapphire']],
  ['Creatures & plants', ['wool', 'bone', 'slime_ball', 'raw_meat', 'raw_fish', 'dino_meat', 'berries', 'group:flower', 'flower_red', 'flower_yellow', 'flower_blue', 'cotton_candy']],
  ['Made by crafting', ['torch', 'bed', 'boom_barrel']],
  ['Realm treasures', ['fossil', ...REALM_GEMS, 'prism_shard']],
];
function materialList() {
  const used = new Set();
  for (const r of RECIPES) for (const [k] of r.in) used.add(k);
  const groups = MATERIAL_GROUPS.map(([name, keys]) => [name, keys.filter(k => used.has(k))]);
  const listed = new Set(groups.flatMap(g => g[1]));
  const rest = [...used].filter(k => !listed.has(k));
  if (rest.length) groups.push(['Other', rest]);
  return groups.filter(g => g[1].length);
}
function recipesUsing(key) { return RECIPES.filter(r => r.in.some(([k]) => k === key)); }
function recipesUsingItem(id) { return RECIPES.filter(r => r.in.some(([k]) => ingMatches(k, id))); }

// Which realms each block shows up in (sampled once from the real generators)
let _blockRealms = null;
function blockRealms() {
  if (_blockRealms) return _blockRealms;
  _blockRealms = {};
  const spots = [[0, 0], [7, 3], [-6, 9], [19, -8], [3, 28], [-17, -15], [30, 30], [-30, 12]];
  for (const r of REALMS) {
    const G = r.makeGen(424242), seen = new Uint8Array(256);
    for (const [cx, cz] of spots) { const c = new Chunk(cx, cz); r.gen(c, G); const b = c.blocks; for (let i = 0; i < b.length; i++) seen[b[i]] = 1; }
    for (let id = 1; id < 256; id++) if (seen[id]) (_blockRealms[id] = _blockRealms[id] || []).push(r.key);
  }
  return _blockRealms;
}
const TIER_NEED = ['', 'any Pickaxe', 'a Stone Pickaxe', 'an Iron Pickaxe', 'a Ruby Pickaxe', 'a Prismatic Pickaxe'];
function realmsText(keys) {
  if (!keys || !keys.length || keys.length >= REALMS.length - 1) return '';
  if (keys.length > 3) return ' in many realms';
  return ' in ' + keys.map(k => REALM[k].name).join(', ');
}
function materialSources(key) {
  if (key === 'group:log') return ['Chop any tree trunk: Oak, Birch, Pine, Jungle, Palm, Skywood, Charwood or Candy Cane.'];
  if (key === 'group:flower') return ['Pick any flower: Red Tulip, Sunny Daisy, Bluebell, Starpetal or Star Flower.'];
  const out = [], id = idOf(key), br = blockRealms();
  for (const r of RECIPES.filter(r => r.out === key)) {
    const ings = r.in.map(([k, n]) => `${n} ${ingName(k)}`).join(' + ');
    out.push(r.st === 'furnace' ? `Smelt ${ings} in a Furnace.` : `Craft from ${ings}${r.st === 'bench' ? ' at a Workbench' : ''}.`);
  }
  const crafted = out.length > 0, srcs = [];
  for (const b of BLOCKS) {
    if (!b.drop || b.render === R_NONE) continue;
    const drops = typeof b.drop === 'function' ? [b.drop(0), b.drop(0.999)] : [b.drop];
    if (!drops.includes(key)) continue;
    if (b.key === key && crafted && !br[b.id]) continue;
    srcs.push({ b, sometimes: typeof b.drop === 'function' && drops[1] !== key });
  }
  if (srcs.length) {
    const names = srcs.slice(0, 4).map(s => s.b.name + (s.sometimes ? ' (sometimes)' : ''));
    const tier = Math.max(...srcs.map(s => (s.b.tool === 'pick' ? s.b.tier : 0)));
    const realms = [...new Set(srcs.flatMap(s => br[s.b.id] || []))];
    const verb = srcs.every(s => s.b.tool === 'axe') ? 'Chop' : srcs.every(s => s.b.render === R_CROSS || s.b.leaves) ? 'Break' : 'Mine';
    out.push(`${verb} ${names.join(', ')}${srcs.length > 4 ? ' and more' : ''}${realmsText(realms)}${tier ? ` (fastest with ${TIER_NEED[tier]} or better)` : ''}.`);
  }
  const mobs = Object.values(MOBS).filter(m => m.drops.some(d => d[0] === key));
  if (mobs.length) out.push('Dropped by ' + mobs.map(m => m.name).join(', ') + '.');
  if (!out.length) out.push('Keep exploring to find it!');
  return out;
}
