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

const RECIPE_CATS = [['all', 'All'], ['basics', 'Basics'], ['tools', 'Tools'], ['smelt', 'Smelting'], ['blocks', 'Blocks'], ['paint', 'Paint'], ['food', 'Food'], ['realm', 'Realm Items']];

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
