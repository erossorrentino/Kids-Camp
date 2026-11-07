'use strict';
// ============================================================
// Blocks, items, procedural pixel textures and icons
// ============================================================

const R_NONE = 0, R_CUBE = 1, R_CUTOUT = 2, R_CROSS = 3, R_LIQUID = 4, R_GLASS = 5;
const B = {};          // block key -> id
const BLOCKS = [];     // id -> def
const I = {};          // item key -> id (items start at 256)
const ITEMS = {};      // id -> def (items only)

function block(key, name, o = {}) {
  const id = BLOCKS.length;
  B[key] = id;
  const r = o.render || R_CUBE;
  const base = { id, key, name, render: r, solid: true, opaque: true, hard: 1, tool: null, tier: 0, drop: key,
    light: null, emissive: false, liquid: 0, climb: false, wlog: false, slip: 1, bounce: 0, soft: false, hurt: 0,
    replace: false, ore: null, interact: null, cat: 'building', unbreakable: false, sky: 2, sway: false, isBlock: true, stack: 64 };
  if (r === R_CROSS) Object.assign(base, { solid: false, opaque: false, sky: 0, hard: 0.05, sway: true, cat: 'nature' });
  if (r === R_CUTOUT) Object.assign(base, { opaque: false, sky: 1 });
  if (r === R_GLASS) Object.assign(base, { opaque: false, sky: 0 });
  if (r === R_LIQUID) Object.assign(base, { solid: false, opaque: false, sky: 0, hard: 999, unbreakable: true, cat: null, drop: null });
  const d = Object.assign(base, o);
  let t = o.tex || key;
  if (typeof t === 'string') t = [t, t, t, t];
  else if (t.length === 3) t = [t[0], t[1], t[2], t[2]];
  d.tex = t;
  BLOCKS.push(d);
  return d;
}
const plant = (key, name, o = {}) => block(key, name, Object.assign({ render: R_CROSS }, o));

// ---------------- Block definitions ----------------
block('air', 'Air', { render: R_NONE, solid: false, opaque: false, sky: 0, hard: 0, cat: null, drop: null });
// Greenhollow terrain
block('grass', 'Grass Block', { tex: ['grass_top', 'dirt', 'grass_side'], hard: .6, tool: 'shovel', drop: 'dirt', cat: 'nature' });
block('dirt', 'Dirt', { hard: .5, tool: 'shovel', cat: 'nature' });
block('stone', 'Stone', { hard: 1.5, tool: 'pick', tier: 1, drop: 'cobble' });
block('cobble', 'Cobblestone', { hard: 2, tool: 'pick', tier: 1 });
block('worldstone', 'Worldstone', { hard: 12, tool: 'pick', tier: 4, cat: 'building' });
block('cracked_worldstone', 'Cracked Worldstone', { tex: 'worldstone_cracked', hard: 5, tool: 'pick', tier: 3, drop: null, emissive: true, light: [0.75, 0.35, 1, 6], cat: null });
block('sand', 'Sand', { hard: .5, tool: 'shovel', cat: 'nature' });
block('sandstone', 'Sandstone', { tex: ['sandstone_top', 'sandstone_top', 'sandstone_side'], hard: 1, tool: 'pick', tier: 1 });
block('gravel', 'Gravel', { hard: .6, tool: 'shovel', cat: 'nature' });
block('clay', 'Clay', { hard: .6, tool: 'shovel', cat: 'nature' });
block('water', 'Water', { render: R_LIQUID, liquid: 1 });
block('lava', 'Lava', { render: R_LIQUID, liquid: 2, emissive: true, light: [1, 0.55, 0.2, 7], hurt: 4 });
block('oak_log', 'Oak Log', { tex: ['log_oak_top', 'log_oak_top', 'log_oak'], hard: 2, tool: 'axe', cat: 'nature', group: 'log' });
block('oak_leaves', 'Oak Leaves', { tex: 'leaves_oak', render: R_CUTOUT, hard: .2, sway: true, cat: 'nature', drop: r => (r < 0.07 ? 'apple' : null), leaves: true });
block('birch_log', 'Birch Log', { tex: ['log_birch_top', 'log_birch_top', 'log_birch'], hard: 2, tool: 'axe', cat: 'nature', group: 'log' });
block('birch_leaves', 'Birch Leaves', { tex: 'leaves_birch', render: R_CUTOUT, hard: .2, sway: true, cat: 'nature', drop: r => (r < 0.05 ? 'apple' : null), leaves: true });
block('pine_log', 'Pine Log', { tex: ['log_pine_top', 'log_pine_top', 'log_pine'], hard: 2, tool: 'axe', cat: 'nature', group: 'log' });
block('pine_leaves', 'Pine Needles', { tex: 'leaves_pine', render: R_CUTOUT, hard: .2, sway: true, cat: 'nature', drop: null, leaves: true });
block('planks', 'Planks', { hard: 2, tool: 'axe' });
block('cactus', 'Cactus', { tex: ['cactus_top', 'cactus_top', 'cactus_side'], render: R_CUTOUT, hard: .4, hurt: 1, cat: 'nature', sky: 2 });
block('snow', 'Snow Block', { hard: .3, tool: 'shovel', cat: 'nature' });
block('grass_snow', 'Snowy Grass', { tex: ['snow', 'dirt', 'grass_snow_side'], hard: .6, tool: 'shovel', drop: 'dirt', cat: 'nature' });
block('ice', 'Ice', { render: R_GLASS, hard: .5, slip: 0.12, cat: 'nature' });
block('packed_ice', 'Packed Ice', { hard: .6, slip: 0.12, cat: 'nature' });
block('blue_ice', 'Blue Ice', { hard: .8, slip: 0.06, cat: 'nature' });
// Ores
block('coal_ore', 'Coal Ore', { hard: 2, tool: 'pick', tier: 1, drop: 'coal', ore: { chance: 0.03, tier: 0 }, cat: 'ores' });
block('copper_ore', 'Copper Ore', { hard: 2.2, tool: 'pick', tier: 2, ore: { chance: 0.04, tier: 0 }, cat: 'ores', smelt: 'copper_ingot' });
block('iron_ore', 'Iron Ore', { hard: 2.5, tool: 'pick', tier: 2, ore: { chance: 0.06, tier: 1 }, cat: 'ores', smelt: 'iron_ingot' });
block('gold_ore', 'Gold Ore', { hard: 2.8, tool: 'pick', tier: 3, ore: { chance: 0.09, tier: 1 }, cat: 'ores', smelt: 'gold_ingot' });
block('ruby_ore', 'Ruby Ore', { hard: 3, tool: 'pick', tier: 3, drop: 'ruby', ore: { chance: 0.16, tier: 2 }, cat: 'ores' });
block('sapphire_ore', 'Sapphire Ore', { hard: 3, tool: 'pick', tier: 3, drop: 'sapphire', ore: { chance: 0.16, tier: 2 }, cat: 'ores' });
block('mod_geode', 'Mod Geode', { hard: 3, tool: 'pick', tier: 2, drop: null, ore: { chance: 1, tier: 2, geode: true }, emissive: true, light: [1, 0.6, 1, 5], cat: 'ores' });
block('fossil_block', 'Fossil Stone', { tex: 'fossil', hard: 2.5, tool: 'pick', tier: 2, drop: r => (r < 0.6 ? 'fossil' : 'bone'), cat: 'ores' });
// Plants
plant('tall_grass', 'Tall Grass', { replace: true, drop: r => (r < 0.04 ? 'berries' : null) });
plant('flower_red', 'Red Tulip', { group: 'flower' });
plant('flower_yellow', 'Sunny Daisy', { group: 'flower' });
plant('flower_blue', 'Bluebell', { group: 'flower' });
plant('berry_bush', 'Berry Bush', { drop: 'berries', sway: false });
plant('mushroom_red', 'Red Mushroom', { sway: false });
plant('dead_bush', 'Dry Bush', { replace: true, drop: 'stick', sway: false });
plant('conch_block', 'Conch Shell', { tex: 'conch', drop: 'conch', sway: false, cat: 'special' });
// Crafted / functional
block('workbench', 'Workbench', { tex: ['bench_top', 'planks', 'bench_side', 'bench_front'], hard: 2, tool: 'axe', interact: 'craft', cat: 'special' });
block('furnace', 'Furnace', { tex: ['furnace_top', 'furnace_top', 'furnace_side', 'furnace_front'], hard: 3, tool: 'pick', tier: 1, interact: 'craft', cat: 'special', light: [1, 0.6, 0.3, 4] });
plant('torch', 'Torch', { emissive: true, light: [1, 0.75, 0.45, 12], sway: false, hard: 0, cat: 'light' });
block('lantern', 'Lantern', { render: R_CUTOUT, emissive: true, light: [1, 0.85, 0.55, 14], hard: .5, sky: 0, cat: 'light' });
block('glass', 'Glass', { render: R_GLASS, hard: .3, drop: 'glass' });
block('bricks', 'Bricks', { hard: 2, tool: 'pick', tier: 1 });
block('stone_bricks', 'Stone Bricks', { hard: 2, tool: 'pick', tier: 1 });
block('boom_barrel', 'Boom Barrel', { tex: ['barrel_top', 'barrel_top', 'barrel_side'], hard: .3, interact: 'barrel', cat: 'special' });
block('bed', 'Bed', { tex: ['bed_top', 'planks', 'bed_side'], hard: .4, interact: 'bed', cat: 'special' });
block('dream_bed', 'Dream Bed', { tex: ['dreambed_top', 'planks', 'dreambed_side'], hard: .4, interact: 'dreambed', cat: 'special', emissive: false, light: [1, 0.6, 0.9, 5] });
block('scaffold', 'Scaffold', { render: R_CUTOUT, solid: false, climb: true, hard: .1, sky: 0 });
block('wool', 'Wool', { hard: .5, soft: true });
const PAINTS = [['red', '#e0413a'], ['orange', '#f28a2e'], ['yellow', '#f7d23b'], ['green', '#4dbb4a'], ['blue', '#3d7ae8'], ['purple', '#9b55e0'], ['pink', '#f58ac7'], ['white', '#f2f2f6'], ['black', '#2a2a33']];
for (const [c] of PAINTS) block('paint_' + c, c[0].toUpperCase() + c.slice(1) + ' Paint Block', { tex: 'paint_' + c, hard: 1, tool: 'pick', cat: 'building' });
block('iron_block', 'Iron Block', { hard: 3, tool: 'pick', tier: 2 });
block('gold_block', 'Gold Block', { hard: 3, tool: 'pick', tier: 3 });
block('ruby_block', 'Ruby Block', { hard: 3, tool: 'pick', tier: 3 });
block('obsidian', 'Obsidian', { hard: 8, tool: 'pick', tier: 4 });
block('realm_gate', 'Realm Gate', { tex: ['gate_top', 'gate_bottom', 'gate_side'], hard: 3, tool: 'pick', interact: 'gate', emissive: true, light: [0.6, 0.8, 1, 9], cat: 'special' });
block('frost_portal', 'Frost Portal', { render: R_GLASS, solid: false, emissive: true, light: [0.5, 0.9, 1, 8], hard: .2, drop: null, cat: null, portal: 'frostveil' });
block('moon_rocket', 'Moon Rocket', { tex: ['rocket_top', 'rocket_bottom', 'rocket_side'], hard: 1, interact: 'rocket', cat: 'special' });
block('bounce_pad', 'Bounce Pad', { hard: .3, bounce: 1, cat: 'special' });
// Emberdeep
block('ashstone', 'Ashstone', { tex: ['ashstone_top', 'ashstone_top', 'ashstone'], hard: 1.5, tool: 'pick', tier: 1, cat: 'realm' });
block('scorch_moss', 'Scorch Moss', { tex: ['scorch_top', 'ashstone_top', 'scorch_side'], hard: .8, tool: 'shovel', drop: 'ash', cat: 'realm' });
block('magma', 'Magma Block', { hard: 1, tool: 'pick', tier: 1, emissive: true, light: [1, 0.45, 0.15, 5], hurt: 1, cat: 'realm' });
block('ember_ore', 'Fire Opal Ore', { hard: 3, tool: 'pick', tier: 3, drop: 'fire_opal', ore: { chance: 0.18, tier: 2 }, cat: 'ores' });
plant('ember_fungus', 'Ember Fungus', { emissive: true, light: [1, 0.5, 0.2, 7], sway: false, cat: 'realm' });
block('ash', 'Ash', { hard: .5, tool: 'shovel', cat: 'realm' });
block('ember_crystal', 'Ember Crystal', { render: R_GLASS, emissive: true, light: [1, 0.55, 0.2, 10], hard: .5, cat: 'light' });
block('char_log', 'Charwood Log', { tex: ['char_log_top', 'char_log_top', 'char_log'], hard: 2, tool: 'axe', group: 'log', cat: 'realm' });
block('ember_leaves', 'Ember Leaves', { render: R_CUTOUT, hard: .2, emissive: true, sway: true, drop: null, cat: 'realm', leaves: true });
// Frostveil
block('frost_leaves', 'Frosted Needles', { render: R_CUTOUT, hard: .2, sway: true, drop: null, cat: 'realm', leaves: true });
block('glacite_ore', 'Glacite Ore', { hard: 3, tool: 'pick', tier: 3, drop: 'glacite', ore: { chance: 0.18, tier: 2 }, cat: 'ores' });
// Skyreach
block('cloud', 'Cloud', { hard: .2, soft: true, cat: 'realm' });
block('sky_grass', 'Sky Grass', { tex: ['skygrass_top', 'sky_soil', 'skygrass_side'], hard: .6, tool: 'shovel', drop: 'sky_soil', cat: 'realm' });
block('sky_soil', 'Sky Soil', { hard: .5, tool: 'shovel', cat: 'realm' });
block('skystone', 'Skystone', { hard: 1.5, tool: 'pick', tier: 1, cat: 'realm' });
block('skywood_log', 'Skywood Log', { tex: ['skywood_top', 'skywood_top', 'skywood'], hard: 2, tool: 'axe', group: 'log', cat: 'realm' });
block('golden_leaves', 'Golden Leaves', { render: R_CUTOUT, hard: .2, sway: true, drop: r => (r < 0.05 ? 'apple' : null), cat: 'realm', leaves: true });
block('skyshard_ore', 'Skyshard Ore', { hard: 3, tool: 'pick', tier: 3, drop: 'skyshard', ore: { chance: 0.18, tier: 2 }, cat: 'ores' });
plant('sky_flower', 'Starpetal', { group: 'flower', cat: 'realm' });
// Hollow Deep
block('gloomstone', 'Gloomstone', { hard: 1.5, tool: 'pick', tier: 1, cat: 'realm' });
block('deep_moss', 'Deep Moss', { tex: ['moss_top', 'gloomstone', 'moss_side'], hard: .8, tool: 'shovel', drop: 'gloomstone', cat: 'realm' });
plant('glowshroom', 'Glowshroom', { emissive: true, light: [0.3, 0.85, 1, 8], sway: false, cat: 'realm' });
block('shroom_stem', 'Shroom Stem', { hard: 1, tool: 'axe', cat: 'realm' });
block('shroom_cap', 'Glowcap', { hard: .5, tool: 'axe', emissive: true, light: [0.35, 0.6, 1, 9], cat: 'realm' });
block('glowquartz_ore', 'Glowquartz Ore', { hard: 3, tool: 'pick', tier: 3, drop: 'glowquartz', ore: { chance: 0.18, tier: 2 }, cat: 'ores' });
block('amethyst', 'Amethyst Crystal', { render: R_GLASS, emissive: true, light: [0.75, 0.4, 1, 9], hard: 1, tool: 'pick', cat: 'light' });
// Lunara
block('regolith', 'Moon Dust', { hard: .5, tool: 'shovel', cat: 'realm' });
block('moonrock', 'Moonrock', { hard: 1.5, tool: 'pick', tier: 1, cat: 'realm' });
block('moonstone_ore', 'Moonstone Ore', { hard: 3, tool: 'pick', tier: 3, drop: 'moonstone', ore: { chance: 0.18, tier: 2 }, cat: 'ores' });
block('lunar_ice', 'Lunar Ice', { hard: .8, slip: 0.1, cat: 'realm' });
plant('alien_crystal', 'Alien Sprout', { emissive: true, light: [0.4, 1, 0.5, 7], sway: false, cat: 'realm' });
block('cheese_ore', 'Moon Cheese Ore', { hard: 1.5, tool: 'pick', tier: 1, drop: 'moon_cheese', ore: { chance: 0.04, tier: 0 }, cat: 'ores' });
// Coral Abyss
for (const c of ['red', 'yellow', 'blue', 'pink']) block('coral_' + c, c[0].toUpperCase() + c.slice(1) + ' Coral', { hard: .6, cat: 'realm' });
plant('seagrass', 'Seagrass', { wlog: true, drop: null });
plant('kelp', 'Kelp', { wlog: true, drop: null });
block('seastone', 'Seastone', { hard: 1.5, tool: 'pick', tier: 1, cat: 'realm' });
block('aquamarine_ore', 'Aquamarine Ore', { hard: 3, tool: 'pick', tier: 3, drop: 'aquamarine', ore: { chance: 0.18, tier: 2 }, cat: 'ores' });
block('clam', 'Pearl Clam', { hard: 1, drop: r => (r < 0.7 ? 'pearl' : null), cat: 'realm' });
block('palm_log', 'Palm Log', { tex: ['palm_top', 'palm_top', 'palm_log'], hard: 2, tool: 'axe', group: 'log', cat: 'realm' });
block('palm_leaves', 'Palm Fronds', { render: R_CUTOUT, hard: .2, sway: true, drop: null, cat: 'realm', leaves: true });
plant('bubble_coral', 'Bubble Coral', { wlog: true, emissive: true, light: [0.5, 0.9, 1, 6], sway: false, bubbles: true });
// Sugarland
block('frosting', 'Frosting', { tex: ['frosting_top', 'cake', 'frosting_side'], hard: .5, tool: 'shovel', drop: 'cake', cat: 'realm' });
block('cake', 'Cake Sponge', { hard: .5, tool: 'shovel', interact: 'eat', cat: 'realm' });
block('chocolate', 'Chocolate Block', { hard: 1, tool: 'pick', cat: 'realm' });
block('candy_stone', 'Hard Candy', { hard: 1.5, tool: 'pick', tier: 1, cat: 'realm' });
block('sugar_ore', 'Sugar Crystal Ore', { hard: 3, tool: 'pick', tier: 3, drop: 'sugar_crystal', ore: { chance: 0.18, tier: 2 }, cat: 'ores' });
block('candy_cane', 'Candy Cane Block', { hard: 1.5, tool: 'axe', group: 'log', cat: 'realm' });
for (const c of ['red', 'green', 'blue']) block('lolli_' + c, c[0].toUpperCase() + c.slice(1) + ' Lollipop', { hard: .8, cat: 'realm' });
plant('gumdrop', 'Gumdrop', { drop: 'candy', sway: false, cat: 'realm' });
block('cotton_candy', 'Cotton Candy', { hard: .2, soft: true, cat: 'realm' });
block('choco_milk', 'Chocolate Milk', { render: R_LIQUID, liquid: 3 });
block('icing', 'Icing Block', { hard: .5, cat: 'realm' });
// Dino Valley
block('jungle_grass', 'Jungle Grass', { tex: ['jgrass_top', 'mud', 'jgrass_side'], hard: .6, tool: 'shovel', drop: 'mud', cat: 'realm' });
block('mud', 'Mud', { hard: .5, tool: 'shovel', cat: 'realm' });
block('jungle_log', 'Jungle Log', { tex: ['jungle_top', 'jungle_top', 'jungle_log'], hard: 2, tool: 'axe', group: 'log', cat: 'realm' });
block('jungle_leaves', 'Jungle Leaves', { render: R_CUTOUT, hard: .2, sway: true, drop: r => (r < 0.04 ? 'berries' : null), cat: 'realm', leaves: true });
plant('fern', 'Giant Fern', { replace: true, drop: null });
plant('vine', 'Vine', { climb: true, replace: true, drop: null, cat: 'realm' });
block('amber_ore', 'Amber Ore', { hard: 3, tool: 'pick', tier: 3, drop: 'amber', ore: { chance: 0.18, tier: 2 }, cat: 'ores' });
block('volcanic_rock', 'Volcanic Rock', { hard: 2, tool: 'pick', tier: 1, cat: 'realm' });
// Prismara
block('prism_stone', 'Prism Stone', { hard: 1.5, tool: 'pick', tier: 1, cat: 'realm' });
block('prism_grass', 'Prism Grass', { tex: ['prismgrass_top', 'prism_stone', 'prismgrass_side'], hard: .6, tool: 'shovel', drop: 'prism_stone', cat: 'realm' });
const CRYSTALS = [['red', '#ff5a6e', [1, .35, .4]], ['orange', '#ffa24a', [1, .6, .25]], ['yellow', '#ffe45a', [1, .95, .4]], ['green', '#5affa0', [.35, 1, .55]], ['blue', '#5ab4ff', [.35, .65, 1]], ['purple', '#c46aff', [.75, .4, 1]]];
for (const [c, , l] of CRYSTALS) block('crystal_' + c, c[0].toUpperCase() + c.slice(1) + ' Crystal', { render: R_GLASS, emissive: true, light: [l[0], l[1], l[2], 8], hard: 1, tool: 'pick', cat: 'light' });
block('starstone_ore', 'Starstone Ore', { hard: 4, tool: 'pick', tier: 4, drop: 'prism_shard', ore: { chance: 0.25, tier: 3 }, cat: 'ores' });
block('guardian_stone', 'Guardian Stone', { hard: 10, tool: 'pick', tier: 4, cat: 'realm' });
plant('star_flower', 'Star Flower', { emissive: true, light: [0.8, 0.7, 1, 5], group: 'flower', cat: 'realm' });

// ---------------- Items ----------------
let _nextItem = 256;
function item(key, name, o = {}) {
  const id = _nextItem++;
  I[key] = id;
  ITEMS[id] = Object.assign({ id, key, name, stack: 64, isBlock: false }, o);
  return ITEMS[id];
}
item('stick', 'Stick', { icon: ['stick'] });
item('coal', 'Coal', { icon: ['coal'] });
item('copper_ingot', 'Copper Ingot', { icon: ['ingot', '#e0864a'] });
item('iron_ingot', 'Iron Ingot', { icon: ['ingot', '#d8dde6'] });
item('gold_ingot', 'Gold Ingot', { icon: ['ingot', '#ffd23f'] });
item('ruby', 'Ruby', { icon: ['gem', '#ff3a5c'] });
item('sapphire', 'Sapphire', { icon: ['gem', '#3e6dff'] });
// Realm gems (one per realm, needed for the Star Key)
item('fire_opal', 'Fire Opal', { icon: ['round', '#ff6a2a'], gem: 'emberdeep' });
item('glacite', 'Glacite', { icon: ['shard', '#7fe8ff'], gem: 'frostveil' });
item('skyshard', 'Skyshard', { icon: ['shard', '#e8f4ff'], gem: 'skyreach' });
item('glowquartz', 'Glowquartz', { icon: ['shard', '#fff07a'], gem: 'hollowdeep' });
item('moonstone', 'Moonstone', { icon: ['round', '#c8d8ff'], gem: 'lunara' });
item('aquamarine', 'Aquamarine', { icon: ['gem', '#3fe0c8'], gem: 'coralabyss' });
item('sugar_crystal', 'Sugar Crystal', { icon: ['gem', '#ff8ad8'], gem: 'sugarland' });
item('amber', 'Amber', { icon: ['drop', '#ffa21f'], gem: 'dinovalley' });
item('prism_shard', 'Prism Shard', { icon: ['prism'] });
item('pearl', 'Pearl', { icon: ['pearl'] });
item('conch', 'Conch Shell', { icon: ['shell'], use: 'conch', stack: 16 });
item('fossil', 'Fossil', { icon: ['fossil'] });
item('bone', 'Bone', { icon: ['bone'] });
item('slime_ball', 'Slime Ball', { icon: ['slime'] });
// Food
item('apple', 'Apple', { icon: ['apple'], food: 4 });
item('berries', 'Berries', { icon: ['berries'], food: 2 });
item('raw_meat', 'Raw Meat', { icon: ['meat', '#e05a5a'], food: 3 });
item('cooked_meat', 'Roast Meat', { icon: ['meat', '#a8582a'], food: 8 });
item('raw_fish', 'Raw Fish', { icon: ['fish', '#8ab4d8'], food: 2 });
item('cooked_fish', 'Grilled Fish', { icon: ['fish', '#d89a4a'], food: 6 });
item('candy', 'Candy', { icon: ['candy'], food: 3, speedBoost: 8 });
item('moon_cheese', 'Moon Cheese', { icon: ['cheese'], food: 5 });
item('dino_meat', 'Dino Drumstick', { icon: ['meat', '#d8504a'], food: 4 });
item('cooked_dino', 'Dino Roast', { icon: ['meat', '#9a4a20'], food: 10 });
// Realm travel items
item('ember_key', 'Ember Key', { icon: ['key', '#ff7a2a'], stack: 1, desc: 'Hold it and jump into lava!' });
item('frost_crystal', 'Frost Crystal', { icon: ['crystal', '#9ae8ff'], stack: 16, desc: 'Use it on an Ice frame (2 wide, 3 tall inside).' });
item('time_clock', 'Time Clock', { icon: ['clock'], use: 'clock', stack: 1, desc: 'Use it to travel back to Dino Valley.' });
item('star_key', 'Star Key', { icon: ['star'], use: 'starkey', stack: 1, desc: 'Use it to open the way to Prismara.' });
item('homeward_charm', 'Homeward Charm', { icon: ['charm'], use: 'charm', stack: 16, desc: 'Use it to go home to Greenhollow.' });
item('bucket', 'Bucket', { icon: ['bucket', null], stack: 16, bucket: 0, desc: 'Use it on water, lava or chocolate milk to scoop it up.' });
item('water_bucket', 'Water Bucket', { icon: ['bucket', '#3a8ae8'], stack: 1, bucket: B.water, desc: 'Use it to pour water.' });
item('lava_bucket', 'Lava Bucket', { icon: ['bucket', '#ff6a1a'], stack: 1, bucket: B.lava, desc: 'Use it to pour lava. Careful!' });
item('choco_bucket', 'Chocolate Milk Bucket', { icon: ['bucket', '#7a4a2c'], stack: 1, bucket: B.choco_milk, desc: 'Use it to pour chocolate milk.' });
item('igniter', 'Igniter', { icon: ['igniter'], stack: 1, desc: 'Use it on a Boom Barrel. Then run!' });
item('crown', 'Crown of Realms', { icon: ['crown'], stack: 1, desc: 'Proof you beat the Prism Guardian!' });
// Tools
const TIERS = [['wood', 'Wooden', '#b88a52', 2, 'planks'], ['stone', 'Stone', '#9aa0a8', 4, 'cobble'], ['iron', 'Iron', '#e2e6ee', 6, 'iron_ingot'], ['ruby', 'Ruby', '#ff3a5c', 8.5, 'ruby'], ['prism', 'Prismatic', '#c8a0ff', 13, 'prism_shard']];
const SWORD_DMG = [4, 5, 7, 9, 13];
TIERS.forEach(([k, n, col, speed], i) => {
  item(k + '_pickaxe', n + ' Pickaxe', { icon: ['pickaxe', col], stack: 1, tool: 'pick', tier: i + 1, speed, dmg: 2 + i });
  item(k + '_axe', n + ' Axe', { icon: ['axe', col], stack: 1, tool: 'axe', tier: i + 1, speed, dmg: 3 + i });
  item(k + '_shovel', n + ' Shovel', { icon: ['shovel', col], stack: 1, tool: 'shovel', tier: i + 1, speed, dmg: 2 + i });
  item(k + '_sword', n + ' Sword', { icon: ['sword', col], stack: 1, tool: 'sword', tier: i + 1, speed: 1.5, dmg: SWORD_DMG[i] });
});
item('iron_armor', 'Iron Armor', { icon: ['armor', '#d8dde6'], stack: 1, armor: 0.25 });
item('ruby_armor', 'Ruby Armor', { icon: ['armor', '#ff3a5c'], stack: 1, armor: 0.4 });
item('prism_armor', 'Prismatic Armor', { icon: ['armor', '#c8a0ff'], stack: 1, armor: 0.6 });

const REALM_GEMS = ['fire_opal', 'glacite', 'skyshard', 'glowquartz', 'moonstone', 'aquamarine', 'sugar_crystal', 'amber'];

function idOf(key) { return B[key] !== undefined ? B[key] : I[key]; }
function itemDef(id) { return id < 256 ? BLOCKS[id] : ITEMS[id]; }
function itemName(id) { const d = itemDef(id); return d ? d.name : '?'; }
function isPlaceable(id) { return id > 0 && id < 256; }

// Bright colors used by the X-Ray Vision mod
const XRAY_COLOR = { coal_ore: '#ffffff', copper_ore: '#ff9a4a', iron_ore: '#ffc890', gold_ore: '#ffe040', ruby_ore: '#ff3050', sapphire_ore: '#4a78ff',
  mod_geode: '#ff5ae0', ember_ore: '#ff6a2a', glacite_ore: '#7ae8ff', skyshard_ore: '#e8f4ff', glowquartz_ore: '#fff07a', moonstone_ore: '#c8d8ff',
  cheese_ore: '#ffd84a', aquamarine_ore: '#3fe0c8', sugar_ore: '#ff8ad8', amber_ore: '#ffa21f', starstone_ore: '#c46aff' };

// ---------------- Fast lookup tables ----------------
const RENDER = new Uint8Array(256), SOLID = new Uint8Array(256), OPAQUE = new Uint8Array(256), EMIT = new Uint8Array(256);
const LIQ = new Uint8Array(256), WLOG = new Uint8Array(256), SKYB = new Uint8Array(256), SWAY = new Uint8Array(256), LEAF = new Uint8Array(256);
const REPL = new Uint8Array(256), CLIMB = new Uint8Array(256), LIGHTR = new Float32Array(256), ORE = new Uint8Array(256);
const TEX_T = new Uint16Array(256), TEX_B = new Uint16Array(256), TEX_S = new Uint16Array(256), TEX_F = new Uint16Array(256);
const AVG_COLOR = [];

// ============================================================
// Procedural texture painting
// ============================================================
class Painter {
  constructor() { this.d = new Uint8ClampedArray(16 * 16 * 4); this.r = Math.random; }
  begin(seed) { this.d.fill(0); this.r = mulberry32(seed); }
  set(x, y, c, a) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x > 15 || y > 15) return;
    const i = (y * 16 + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a === undefined ? 255 : a;
  }
  get(x, y) { const i = (((y + 16) & 15) * 16 + ((x + 16) & 15)) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; }
  v(c, amt) { const k = (this.r() - 0.5) * amt; return [c[0] + k, c[1] + k, c[2] + k]; }
  fill(c, amt = 20, a = 255) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) this.set(x, y, this.v(c, amt), a); }
  speck(c, n, amt = 20, a = 255) { for (let i = 0; i < n; i++) this.set(this.r() * 16, this.r() * 16, this.v(c, amt), a); }
  blob(cx, cy, r, c, amt = 10, a = 255) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++)
      if ((x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 <= r * r) this.set(x, y, this.v(c, amt), a);
  }
  blobs(c, n, rmin, rmax, amt = 10, a = 255) { for (let i = 0; i < n; i++) this.blob(this.r() * 16, this.r() * 16, rmin + this.r() * (rmax - rmin), c, amt, a); }
  rect(x, y, w, h, c, amt = 0, a = 255) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, this.v(c, amt), a); }
  line(x0, y0, x1, y1, c, amt = 0, a = 255) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) + 1;
    for (let i = 0; i <= n; i++) { const t = i / n; this.set(Math.round(lerp(x0, x1, t)), Math.round(lerp(y0, y1, t)), this.v(c, amt), a); }
  }
  fringe(c, depth, amt = 20) {
    for (let x = 0; x < 16; x++) {
      const d = depth + Math.floor(this.r() * 3) - 1;
      for (let y = 0; y < d; y++) this.set(x, y, this.v(c, amt));
      if (this.r() < 0.3) this.set(x, d, this.v(c, amt));
    }
  }
  ore(c, n = 5, hi) {
    hi = hi || mixC(c, [255, 255, 255], 0.45);
    for (let i = 0; i < n; i++) {
      const cx = 2 + Math.floor(this.r() * 12), cy = 2 + Math.floor(this.r() * 12);
      const k = 2 + Math.floor(this.r() * 3);
      for (let j = 0; j < k; j++) this.set(cx + Math.floor(this.r() * 3) - 1, cy + Math.floor(this.r() * 3) - 1, this.v(c, 30));
      this.set(cx, cy, hi); this.set(cx + 1, cy + 1, mulC(c, 0.6));
    }
  }
  bark(c, dark) {
    for (let x = 0; x < 16; x++) {
      const k = 0.85 + this.r() * 0.3;
      for (let y = 0; y < 16; y++) this.set(x, y, this.v(mulC(c, k), 10));
    }
    for (let i = 0; i < 7; i++) { const x = Math.floor(this.r() * 16), y = Math.floor(this.r() * 14); this.line(x, y, x, y + 2 + Math.floor(this.r() * 3), dark, 8); }
  }
  rings(bark, inner) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (x === 0 || y === 0 || x === 15 || y === 15) this.set(x, y, this.v(bark, 14));
      else this.set(x, y, this.v(Math.floor(d) % 3 === 0 ? mulC(inner, 0.82) : inner, 10));
    }
  }
  planks(c) {
    for (let b = 0; b < 4; b++) {
      const k = 0.88 + this.r() * 0.24, seam = Math.floor(this.r() * 16);
      for (let y = b * 4; y < b * 4 + 4; y++) for (let x = 0; x < 16; x++) {
        let col = mulC(c, k);
        if (y === b * 4 + 3) col = mulC(c, 0.62);
        if (x === seam && y !== b * 4 + 3) col = mulC(c, 0.7);
        this.set(x, y, this.v(col, 9));
      }
    }
  }
  bricks(c, mortar, h = 4, w = 8) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const row = Math.floor(y / h), off = (row % 2) * (w / 2);
      const isM = y % h === h - 1 || (x + off) % w === w - 1;
      this.set(x, y, isM ? this.v(mortar, 8) : this.v(mulC(c, 0.9 + ((Math.floor((x + off) / w) * 7 + row * 3) % 5) * 0.05), 14));
    }
  }
  cobble(c) {
    const pts = []; for (let i = 0; i < 11; i++) pts.push([this.r() * 16, this.r() * 16, 0.75 + this.r() * 0.4]);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let d1 = 99, d2 = 99, k = 1;
      for (const p of pts) for (let ox = -16; ox <= 16; ox += 16) for (let oy = -16; oy <= 16; oy += 16) {
        const d = Math.hypot(x - p[0] - ox, y - p[1] - oy);
        if (d < d1) { d2 = d1; d1 = d; k = p[2]; } else if (d < d2) d2 = d;
      }
      this.set(x, y, this.v(d2 - d1 < 1.1 ? mulC(c, 0.55) : mulC(c, k), 12));
    }
  }
  leaves(c, holes = 0.16) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (this.r() < holes) continue;
      this.set(x, y, this.v(mulC(c, 0.8 + this.r() * 0.35), 16));
    }
  }
  stripes(c1, c2, w = 4) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) this.set(x, y, this.v(Math.floor((x + y) / w) % 2 ? c1 : c2, 8));
  }
  swirl(c1, c2, a = 255) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 7.5, ang = Math.atan2(dy, dx), d = Math.hypot(dx, dy);
      const t = (Math.sin(ang * 2 + d * 0.9) + 1) / 2;
      this.set(x, y, this.v(mixC(c1, c2, t), 10), a);
    }
  }
  crystal(c, a = 200) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const f = ((x + y * 2) % 7 === 0 || (x * 2 - y + 16) % 9 === 0) ? 1.35 : 1;
      this.set(x, y, this.v(mulC(c, f * (0.85 + 0.15 * Math.sin(x * 0.7 + y))), 14), a);
    }
    for (let i = 0; i < 16; i++) { this.set(i, 0, mixC(c, [255, 255, 255], .5), 230); this.set(0, i, mixC(c, [255, 255, 255], .5), 230); }
  }
  glassFrame(c, a = 230) {
    for (let i = 0; i < 16; i++) { this.set(i, 0, c, a); this.set(i, 15, c, a); this.set(0, i, c, a); this.set(15, i, c, a); }
    this.line(3, 5, 5, 3, [255, 255, 255], 0, 170); this.line(3, 8, 8, 3, [255, 255, 255], 0, 140);
  }
}

// Helpers used by many textures
const hx = hexRgb;
const T_STONE = p => { p.fill(hx('#8a8f99'), 18); for (let i = 0; i < 5; i++) { const x = p.r() * 14, y = p.r() * 16; p.line(x, y, x + 2, y, hx('#757a84'), 8); } };
const T_DIRT = p => { p.fill(hx('#8a5d3b'), 24); p.speck(hx('#6e4529'), 18, 10); p.speck(hx('#a07450'), 8, 10); };
const T_ASH = p => { p.fill(hx('#4b4246'), 16); for (let x = 0; x < 16; x += 3) p.line(x, 0, x, 15, hx('#3d3539'), 6); };
const T_GLOOM = p => { p.fill(hx('#3b3e55'), 16); p.speck(hx('#2c2e42'), 30, 8); p.speck(hx('#4c5070'), 10, 8); };
const T_MOONROCK = p => { p.fill(hx('#7d7d88'), 18); p.blobs(hx('#6a6a75'), 4, 1, 2.2, 8); };
const T_SEASTONE = p => { p.fill(hx('#3f8a86'), 18); p.speck(hx('#2f6e6a'), 25, 8); p.speck(hx('#5fb0a8'), 10, 8); };
const T_CANDYSTONE = p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const k = Math.floor((x - y + 32) / 3) % 4; p.set(x, y, p.v(hx(['#ffb3d9', '#b3e6ff', '#fff0a8', '#c8b3ff'][k]), 10)); } };
const T_SKYSTONE = p => { p.fill(hx('#d6d2e8'), 14); p.speck(hx('#bfb8dc'), 22, 8); };
const T_PRISMSTONE = p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const h = (x + y) / 30; p.set(x, y, p.v(mixC(hx('#ece6fa'), mixC(hx('#ffd6f0'), hx('#cfe8ff'), h), 0.35), 10)); } };
const T_CAKE = p => { p.fill(hx('#e9b97a'), 16); p.speck(hx('#d29a58'), 20, 6); p.speck(hx('#f7d6a6'), 10, 6); };
const T_MUD = p => { p.fill(hx('#5b4130'), 16); p.blobs(hx('#4a3426'), 4, 1, 2, 6); };
const T_SKYSOIL = p => { p.fill(hx('#a690c6'), 18); p.speck(hx('#8b74ad'), 16, 8); };
const T_REGOLITH = p => { p.fill(hx('#bcbcc4'), 12); p.speck(hx('#a2a2ac'), 30, 6); p.speck(hx('#d8d8e0'), 10, 6); };

function plantStem(p, c, x = 7, top = 6) { p.line(x, 15, x, top, c, 10); }
function grassBlades(p, c, n = 9) {
  for (let i = 0; i < n; i++) {
    const x = 1 + Math.floor(p.r() * 14), h = 5 + Math.floor(p.r() * 9), lean = (p.r() - 0.5) * 3;
    p.line(x, 15, x + lean, 15 - h, mulC(c, 0.8 + p.r() * 0.4), 10);
  }
}

const TEXDEF = {
  stone: T_STONE,
  dirt: T_DIRT,
  grass_top: p => { p.fill(hx('#5fae47'), 26); p.speck(hx('#7fcf5c'), 26, 14); p.speck(hx('#4a8f37'), 14, 10); },
  grass_side: p => { T_DIRT(p); p.fringe(hx('#5fae47'), 4, 20); },
  cobble: p => p.cobble(hx('#8f949e')),
  worldstone: p => { p.fill(hx('#2d2c36'), 16); p.blobs(hx('#45434f'), 6, 1, 2.4, 8); p.speck(hx('#1c1b23'), 20, 6); },
  worldstone_cracked: p => { TEXDEF.worldstone(p); const c = hx('#c47aff'); for (let i = 0; i < 4; i++) { let x = 8, y = 8; for (let j = 0; j < 7; j++) { x += Math.floor(p.r() * 3) - 1; y += Math.floor(p.r() * 3) - 1; x += (i % 2 ? 1 : -1) * (j % 2); y += (i < 2 ? 1 : -1) * ((j + 1) % 2); p.set(x, y, c); } } p.set(8, 8, [255, 230, 255]); },
  sand: p => { p.fill(hx('#e8d59c'), 14); p.speck(hx('#d4bd80'), 24, 8); p.speck(hx('#f6e8bc'), 10, 6); },
  sandstone_top: p => { p.fill(hx('#ddc684'), 10); p.speck(hx('#c9b06c'), 18, 6); },
  sandstone_side: p => { p.fill(hx('#ddc684'), 10); for (const y of [3, 4, 10, 15]) p.line(0, y, 15, y, hx('#c4aa66'), 6); },
  gravel: p => { p.fill(hx('#8a8580'), 14); p.blobs(hx('#a29d96'), 9, .8, 1.8, 14); p.blobs(hx('#6e6964'), 7, .7, 1.5, 10); },
  clay: p => { p.fill(hx('#a4adc0'), 10); p.speck(hx('#929bae'), 14, 6); },
  water: p => { p.fill(hx('#2f7fe0'), 14, 175); for (let i = 0; i < 6; i++) { const x = p.r() * 12, y = p.r() * 16; p.line(x, y, x + 3, y, hx('#6fb0ff'), 10, 190); } },
  lava: p => { p.fill(hx('#ff5a0a'), 24); p.blobs(hx('#ffc23a'), 6, 1, 2.6, 20); p.speck(hx('#b8300a'), 18, 10); },
  log_oak: p => p.bark(hx('#6e4c2c'), hx('#4a3019')),
  log_oak_top: p => p.rings(hx('#6e4c2c'), hx('#b78c57')),
  leaves_oak: p => p.leaves(hx('#3f9a35')),
  log_birch: p => { p.fill(hx('#ebe7da'), 10); for (let i = 0; i < 8; i++) { const x = p.r() * 13, y = p.r() * 16; p.line(x, y, x + 1 + p.r() * 3, y, hx('#3d3a35'), 8); } },
  log_birch_top: p => p.rings(hx('#e7e3d6'), hx('#d8c49a')),
  leaves_birch: p => p.leaves(hx('#7cbb4c')),
  log_pine: p => p.bark(hx('#4f3621'), hx('#2f1f12')),
  log_pine_top: p => p.rings(hx('#4f3621'), hx('#a07b4c')),
  leaves_pine: p => p.leaves(hx('#2c6a3d'), 0.12),
  planks: p => p.planks(hx('#b98b53')),
  cactus_side: p => { p.fill(hx('#4c9a3a'), 12); for (const x of [2, 7, 12]) p.line(x, 0, x, 15, hx('#3a7d2c'), 6); for (let i = 0; i < 10; i++) p.set(p.r() * 16, p.r() * 16, hx('#e8f0c8')); for (let i = 0; i < 16; i++) { if (p.r() < 0.5) { p.set(0, i, [0, 0, 0], 0); p.set(15, i, [0, 0, 0], 0); } } },
  cactus_top: p => { p.fill(hx('#5aab45'), 12); p.blob(7.5, 7.5, 3, hx('#7fc85e'), 8); },
  snow: p => { p.fill(hx('#f3f7ff'), 8); p.speck(hx('#dfe8f8'), 16, 6); },
  grass_snow_side: p => { T_DIRT(p); p.fringe(hx('#f3f7ff'), 4, 8); },
  ice: p => { p.fill(hx('#a9d8ff'), 10, 175); for (let i = 0; i < 4; i++) { const x = p.r() * 12, y = p.r() * 12; p.line(x, y, x + 4, y + 3, hx('#e6f6ff'), 0, 220); } },
  packed_ice: p => { p.fill(hx('#8ec2f0'), 12); for (let i = 0; i < 5; i++) { const x = p.r() * 12, y = p.r() * 14; p.line(x, y, x + 3, y + 1, hx('#c4e4ff'), 6); } },
  blue_ice: p => { p.fill(hx('#5b9ef0'), 12); for (let i = 0; i < 5; i++) { const x = p.r() * 12, y = p.r() * 14; p.line(x, y, x + 3, y + 2, hx('#9ccaff'), 6); } },
  coal_ore: p => { T_STONE(p); p.ore(hx('#25252b'), 6, hx('#4a4a55')); },
  copper_ore: p => { T_STONE(p); p.ore(hx('#d8783e'), 5, hx('#5fd0b0')); },
  iron_ore: p => { T_STONE(p); p.ore(hx('#dcb48e'), 5); },
  gold_ore: p => { T_STONE(p); p.ore(hx('#ffd23a'), 5, hx('#fff3a8')); },
  ruby_ore: p => { T_STONE(p); p.ore(hx('#ee2f4f'), 4, hx('#ffb0c0')); },
  sapphire_ore: p => { T_STONE(p); p.ore(hx('#3a64f2'), 4, hx('#b8ccff')); },
  mod_geode: p => { p.fill(hx('#2a2236'), 14); const cols = ['#ff5ad2', '#5af0ff', '#ffe45a', '#8aff6a', '#b07aff']; for (let i = 0; i < 9; i++) { const c = hx(cols[i % 5]); const x = 2 + p.r() * 12, y = 2 + p.r() * 12; p.set(x, y, c); p.set(x + 1, y, mulC(c, .7)); p.set(x, y + 1, mulC(c, .7)); p.set(x - 1, y, mixC(c, [255, 255, 255], .5)); } p.set(7, 7, [255, 255, 255]); p.set(8, 8, [255, 255, 255]); },
  fossil: p => { T_STONE(p); const c = hx('#f0ead8'); for (let t = 0; t < 14; t += 0.35) { const r = 1 + t * 0.38; p.set(8 + Math.cos(t) * r, 8 + Math.sin(t) * r, p.v(c, 10)); } },
  tall_grass: p => grassBlades(p, hx('#5fae47'), 11),
  flower_red: p => { grassBlades(p, hx('#4f9a3a'), 3); plantStem(p, hx('#3f8a2c'), 7, 6); p.rect(5, 2, 5, 4, hx('#e8384a'), 14); p.rect(6, 1, 3, 1, hx('#ff6a7a')); p.set(5, 2, [0, 0, 0], 0); p.set(9, 2, [0, 0, 0], 0); },
  flower_yellow: p => { plantStem(p, hx('#3f8a2c'), 7, 7); for (let a = 0; a < 6.28; a += 0.8) p.blob(7.5 + Math.cos(a) * 2.6, 5 + Math.sin(a) * 2.6, 1.2, hx('#fff6e0'), 6); p.blob(7.5, 5, 1.3, hx('#ffc21f'), 8); },
  flower_blue: p => { plantStem(p, hx('#3f8a2c'), 7, 4); for (const [x, y] of [[5, 6], [9, 8], [6, 10]]) { p.rect(x, y, 3, 3, hx('#4a7cff'), 14); p.set(x + 1, y + 3, hx('#2f58d8')); } },
  berry_bush: p => { p.leaves(hx('#3c8a3a'), 0.3); for (let i = 0; i < 7; i++) { const x = 2 + p.r() * 12, y = 2 + p.r() * 12; p.set(x, y, hx('#d8304a')); p.set(x + 1, y, hx('#ff6a7a')); } },
  mushroom_red: p => { p.rect(7, 9, 2, 7, hx('#efe8d8'), 8); p.blob(7.8, 8, 4.2, hx('#e23a3a'), 10); for (let y = 9; y < 16; y++) for (let x = 0; x < 16; x++) if (y > 8 && !(x >= 7 && x <= 8)) p.set(x, y, [0, 0, 0], 0); p.set(6, 6, [255, 255, 255]); p.set(9, 5, [255, 255, 255]); p.set(10, 7, [255, 255, 255]); },
  dead_bush: p => { const c = hx('#9a7040'); p.line(7, 15, 7, 8, c); p.line(7, 10, 3, 5, c); p.line(7, 11, 12, 6, c); p.line(5, 7, 4, 3, c); p.line(10, 8, 12, 3, c); },
  conch: p => { const c = hx('#ffb4c8'); for (let y = 0; y < 6; y++) p.rect(5 - y * 0.4, 10 + y * 0.5, 6 + y, 1, c, 14); p.line(5, 10, 11, 15, hx('#e88aa6')); p.blob(8, 12, 1.4, hx('#fff0f4')); },
  bench_top: p => { p.planks(hx('#c49660')); for (let i = 0; i < 16; i++) { p.set(i, 0, hx('#6e4c2c')); p.set(i, 15, hx('#6e4c2c')); p.set(0, i, hx('#6e4c2c')); p.set(15, i, hx('#6e4c2c')); } p.line(5, 1, 5, 14, hx('#7a5634')); p.line(10, 1, 10, 14, hx('#7a5634')); },
  bench_side: p => { p.planks(hx('#a77c48')); p.rect(3, 3, 4, 2, hx('#9aa0a8')); p.line(4, 5, 4, 9, hx('#5a3e22')); p.rect(9, 2, 1, 7, hx('#c0c4cc')); p.rect(9, 9, 1, 3, hx('#5a3e22')); },
  bench_front: p => { TEXDEF.bench_side(p); p.rect(3, 11, 10, 2, hx('#6e4c2c')); },
  furnace_side: p => p.bricks(hx('#8d929b'), hx('#5d6168')),
  furnace_top: p => { p.fill(hx('#7c818a'), 14); p.rect(2, 2, 12, 12, hx('#8d929b'), 10); },
  furnace_front: p => { p.bricks(hx('#8d929b'), hx('#5d6168')); p.rect(4, 8, 8, 6, hx('#1c1a1e')); p.rect(5, 11, 6, 3, hx('#ff8a2a'), 30); p.rect(6, 12, 4, 2, hx('#ffd04a'), 20); p.line(4, 7, 11, 7, hx('#4a4e55')); },
  torch: p => { p.rect(7, 6, 2, 10, hx('#8a5a2b'), 10); p.rect(6, 2, 4, 4, hx('#ffb33a'), 20); p.rect(7, 1, 2, 2, hx('#fff2a0')); p.set(7, 3, hx('#ffffff')); },
  lantern: p => { p.rect(4, 3, 8, 11, hx('#2a2a33')); p.rect(5, 4, 6, 9, hx('#ffcf6a'), 26); p.rect(6, 6, 4, 5, hx('#fff2c0'), 10); p.rect(6, 1, 4, 2, hx('#2a2a33')); p.rect(3, 14, 10, 1, hx('#2a2a33')); },
  glass: p => p.glassFrame(hx('#d8eef8')),
  bricks: p => p.bricks(hx('#b5543c'), hx('#d8cfc4')),
  stone_bricks: p => p.bricks(hx('#8f949e'), hx('#62666e'), 8, 16),
  barrel_side: p => { for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) p.set(x, y, p.v(x % 4 === 3 ? hx('#9a2a20') : hx('#d8402e'), 10)); p.rect(0, 5, 16, 6, hx('#f2ead0'), 6); p.rect(7, 6, 2, 3, hx('#2a2a2a')); p.rect(7, 9, 2, 1, hx('#2a2a2a')); p.rect(0, 1, 16, 1, hx('#5a5a60')); p.rect(0, 14, 16, 1, hx('#5a5a60')); },
  barrel_top: p => { p.fill(hx('#c8b49a'), 10); p.blob(7.5, 7.5, 2.4, hx('#3a3a3a'), 6); p.line(7, 5, 9, 1, hx('#ddd')); },
  bed_top: p => { p.fill(hx('#d83a4a'), 12); p.rect(1, 1, 14, 5, hx('#f4f0ea'), 8); for (let i = 0; i < 6; i++) p.line(0, 8 + i * 2, 15, 8 + i * 2, hx('#b82a3a'), 4); },
  bed_side: p => { p.planks(hx('#b98b53')); p.rect(0, 0, 16, 7, hx('#d83a4a'), 10); p.rect(0, 0, 4, 7, hx('#f4f0ea'), 6); },
  dreambed_top: p => { p.fill(hx('#7a4ae0'), 14); p.rect(1, 1, 14, 5, hx('#ffe6f6'), 8); for (let i = 0; i < 8; i++) { const x = 1 + p.r() * 14, y = 7 + p.r() * 8; p.set(x, y, hx('#fff3a0')); } },
  dreambed_side: p => { p.planks(hx('#d8b0e8')); p.rect(0, 0, 16, 7, hx('#7a4ae0'), 10); p.set(4, 3, hx('#fff3a0')); p.set(11, 2, hx('#fff3a0')); },
  scaffold: p => { const c = hx('#c49a5a'); for (let i = 0; i < 16; i++) { p.set(i, 0, c); p.set(i, 15, c); p.set(0, i, c); p.set(15, i, c); p.set(i, i, mulC(c, .85)); p.set(i, 1, mulC(c, .7)); } },
  wool: p => { p.fill(hx('#f2f0ea'), 10); for (let i = 0; i < 20; i++) { const x = p.r() * 15, y = p.r() * 15; p.set(x, y, hx('#dcd8ce')); p.set(x + 1, y, hx('#fffef8')); } },
  iron_block: p => { p.fill(hx('#d8dde6'), 6); p.rect(1, 1, 14, 14, hx('#e8ecf2'), 4); p.line(1, 14, 14, 14, hx('#a8aeb8')); p.line(14, 1, 14, 14, hx('#a8aeb8')); },
  gold_block: p => { p.fill(hx('#f2c22a'), 6); p.rect(1, 1, 14, 14, hx('#ffd84a'), 6); p.line(1, 14, 14, 14, hx('#c8981a')); p.line(14, 1, 14, 14, hx('#c8981a')); p.line(3, 3, 6, 3, hx('#fff6c0')); },
  ruby_block: p => { p.fill(hx('#c8203c'), 8); for (let i = 0; i < 4; i++) p.rect(1 + (i % 2) * 7, 1 + Math.floor(i / 2) * 7, 6, 6, hx('#ee3a58'), 10); p.set(3, 3, hx('#ffc0cc')); p.set(10, 10, hx('#ffc0cc')); },
  obsidian: p => { p.fill(hx('#1d1530'), 10); p.speck(hx('#3a2a5a'), 18, 10); p.speck(hx('#8a6aff'), 4, 10); },
  gate_side: p => { p.fill(hx('#3a3f60'), 10); p.rect(2, 2, 12, 12, hx('#1c1f38')); p.swirl(hx('#5ab4ff'), hx('#c46aff')); for (let i = 0; i < 16; i++) { p.set(i, 0, hx('#ffd25a')); p.set(i, 15, hx('#ffd25a')); p.set(0, i, hx('#ffd25a')); p.set(15, i, hx('#ffd25a')); } },
  gate_top: p => { p.swirl(hx('#7ad8ff'), hx('#e08aff')); p.blob(7.5, 7.5, 2, hx('#ffffff'), 0); },
  gate_bottom: p => p.fill(hx('#3a3f60'), 10),
  frost_portal: p => p.swirl(hx('#7ae8ff'), hx('#d8f8ff'), 190),
  rocket_side: p => { p.fill(hx('#eef0f4'), 6); p.rect(0, 0, 16, 3, hx('#e0403a'), 8); p.rect(0, 13, 16, 3, hx('#e0403a'), 8); p.blob(7.5, 7.5, 3, hx('#3a4a6a')); p.blob(7.5, 7.5, 2, hx('#7ad0ff')); p.set(6, 6, [255, 255, 255]); },
  rocket_top: p => { p.fill(hx('#e0403a'), 10); p.blob(7.5, 7.5, 3, hx('#ff7a6a'), 8); p.set(7, 7, [255, 255, 255]); },
  rocket_bottom: p => { p.fill(hx('#5a5f6a'), 10); p.blob(7.5, 7.5, 4, hx('#2a2a30')); p.blob(7.5, 7.5, 2, hx('#ff9a3a')); },
  bounce_pad: p => { p.fill(hx('#5ad86a'), 16); p.rect(2, 2, 12, 12, hx('#7af08a'), 12); p.rect(4, 3, 3, 2, hx('#d8ffd8')); },
  ashstone: T_ASH,
  ashstone_top: p => { p.fill(hx('#4b4246'), 14); p.blobs(hx('#3a3236'), 5, 1, 2, 6); },
  scorch_top: p => { p.fill(hx('#8e2a1c'), 22); p.speck(hx('#c24a24'), 20, 14); p.speck(hx('#ff8a3a'), 5, 10); },
  scorch_side: p => { T_ASH(p); p.fringe(hx('#8e2a1c'), 4, 18); },
  magma: p => { p.fill(hx('#4a1608'), 12); for (let i = 0; i < 6; i++) { let x = p.r() * 16, y = p.r() * 16; for (let j = 0; j < 6; j++) { p.set(x, y, p.v(hx('#ff7a1a'), 30)); x += Math.floor(p.r() * 3) - 1; y += Math.floor(p.r() * 3) - 1; } } },
  ember_ore: p => { T_ASH(p); p.ore(hx('#ff5a2a'), 5, hx('#ffe08a')); },
  ember_fungus: p => { p.rect(7, 8, 2, 8, hx('#7a2a1a'), 8); p.blob(8, 7, 4, hx('#ff6a1a'), 18); for (let y = 8; y < 16; y++) for (let x = 0; x < 16; x++) if (!(x >= 7 && x <= 8)) p.set(x, y, [0, 0, 0], 0); p.set(6, 5, hx('#fff0a0')); p.set(10, 6, hx('#fff0a0')); },
  ash: p => { p.fill(hx('#6f6668'), 14); p.speck(hx('#5a5254'), 18, 6); p.speck(hx('#8a8284'), 10, 6); },
  ember_crystal: p => p.crystal(hx('#ff8a3a'), 215),
  char_log: p => { p.bark(hx('#2e2422'), hx('#1a1412')); for (let i = 0; i < 4; i++) { const x = p.r() * 16, y = p.r() * 14; p.line(x, y, x, y + 2, hx('#ff6a2a')); } },
  char_log_top: p => p.rings(hx('#2e2422'), hx('#5a3a2a')),
  ember_leaves: p => { p.leaves(hx('#ff6a2a'), 0.22); p.speck(hx('#ffd04a'), 8, 10); },
  frost_leaves: p => { p.leaves(hx('#2c6a5d'), 0.12); for (let i = 0; i < 26; i++) p.set(p.r() * 16, p.r() * 6, hx('#f4f8ff')); },
  glacite_ore: p => { T_STONE(p); p.ore(hx('#5ae0ff'), 5, hx('#e0fbff')); },
  cloud: p => { p.fill(hx('#ffffff'), 6); p.speck(hx('#e6eef8'), 30, 4); },
  skygrass_top: p => { p.fill(hx('#7fe0a8'), 20); p.speck(hx('#a8f0c8'), 20, 10); },
  skygrass_side: p => { T_SKYSOIL(p); p.fringe(hx('#7fe0a8'), 4, 14); },
  sky_soil: T_SKYSOIL,
  skystone: T_SKYSTONE,
  skywood: p => p.bark(hx('#e6d6b2'), hx('#b89a64')),
  skywood_top: p => p.rings(hx('#e6d6b2'), hx('#f6e8c8')),
  golden_leaves: p => { p.leaves(hx('#ffcf4a'), 0.18); p.speck(hx('#fff0a0'), 8, 10); },
  skyshard_ore: p => { T_SKYSTONE(p); p.ore(hx('#8ad0ff'), 5, hx('#ffffff')); },
  sky_flower: p => { plantStem(p, hx('#5ab07a'), 7, 6); for (let a = 0; a < 6.28; a += 1.256) p.line(7.5, 5, 7.5 + Math.cos(a) * 4, 5 + Math.sin(a) * 4, hx('#d8ecff')); p.set(7, 5, hx('#ffe45a')); },
  gloomstone: T_GLOOM,
  moss_top: p => { p.fill(hx('#3e6e5e'), 18); p.speck(hx('#5a9a80'), 16, 10); },
  moss_side: p => { T_GLOOM(p); p.fringe(hx('#3e6e5e'), 3, 14); },
  glowshroom: p => { p.rect(7, 8, 2, 8, hx('#d8e8f0'), 8); p.blob(8, 7, 4, hx('#3ad8ff'), 18); for (let y = 8; y < 16; y++) for (let x = 0; x < 16; x++) if (!(x >= 7 && x <= 8)) p.set(x, y, [0, 0, 0], 0); p.set(6, 5, hx('#e8ffff')); p.set(10, 6, hx('#e8ffff')); },
  shroom_stem: p => { p.fill(hx('#d8d0c0'), 10); for (let x = 1; x < 16; x += 4) p.line(x, 0, x, 15, hx('#c4baa6'), 4); },
  shroom_cap: p => { p.fill(hx('#3a7cff'), 16); p.blobs(hx('#a8d4ff'), 5, 1, 1.8, 6); },
  glowquartz_ore: p => { T_GLOOM(p); p.ore(hx('#fff07a'), 5, hx('#ffffff')); },
  amethyst: p => p.crystal(hx('#a85aff'), 210),
  regolith: T_REGOLITH,
  moonrock: T_MOONROCK,
  moonstone_ore: p => { T_MOONROCK(p); p.ore(hx('#b8ccff'), 5, hx('#f0f6ff')); },
  lunar_ice: p => { p.fill(hx('#cfe6ff'), 8); for (let i = 0; i < 4; i++) { const x = p.r() * 12, y = p.r() * 14; p.line(x, y, x + 3, y + 2, hx('#ffffff'), 4); } },
  alien_crystal: p => { const c = hx('#5aff7a'); p.line(7, 15, 7, 3, c, 20); p.line(8, 15, 8, 3, mulC(c, .8)); p.line(4, 15, 3, 7, c, 20); p.line(11, 15, 12, 8, c, 20); p.set(7, 2, hx('#e0ffe8')); },
  cheese_ore: p => { T_MOONROCK(p); for (let i = 0; i < 4; i++) { const x = 2 + p.r() * 11, y = 2 + p.r() * 11; p.rect(x, y, 3, 3, hx('#ffd84a'), 10); p.set(x + 1, y + 1, hx('#d8a82a')); } },
  coral_red: p => { p.fill(hx('#e8504a'), 20); p.blobs(hx('#ff7a6a'), 6, 1, 1.8, 10); },
  coral_yellow: p => { p.fill(hx('#f2c63a'), 20); p.blobs(hx('#ffe07a'), 6, 1, 1.8, 10); },
  coral_blue: p => { p.fill(hx('#3a7ae8'), 20); p.blobs(hx('#6aa8ff'), 6, 1, 1.8, 10); },
  coral_pink: p => { p.fill(hx('#f07ac0'), 20); p.blobs(hx('#ffa8dc'), 6, 1, 1.8, 10); },
  seagrass: p => grassBlades(p, hx('#3aa06a'), 7),
  kelp: p => { const c = hx('#3a8a3a'); for (let y = 0; y < 16; y++) { const x = 7 + Math.round(Math.sin(y * 0.6) * 1.5); p.set(x, y, p.v(c, 12)); p.set(x + 1, y, p.v(mulC(c, 1.2), 12)); if (y % 4 === 1) { p.set(x + 2, y, c); p.set(x - 1, y + 1, c); } } },
  seastone: T_SEASTONE,
  aquamarine_ore: p => { T_SEASTONE(p); p.ore(hx('#7affe8'), 5, hx('#e8fff8')); },
  clam: p => { p.fill(hx('#c8a8d8'), 14); for (let x = 0; x < 16; x += 3) p.line(x, 0, 7.5 + (x - 7.5) * .3, 15, hx('#a888b8')); p.blob(7.5, 9, 1.6, hx('#fff8ff')); },
  palm_log: p => { p.fill(hx('#a07c50'), 10); for (let y = 0; y < 16; y += 3) p.line(0, y, 15, y, hx('#7a5a36'), 6); },
  palm_top: p => p.rings(hx('#a07c50'), hx('#d8b888')),
  palm_leaves: p => { p.leaves(hx('#58b440'), 0.25); },
  bubble_coral: p => { for (let i = 0; i < 7; i++) { const x = 3 + p.r() * 10, y = 3 + p.r() * 12, r = 1 + p.r() * 1.5; p.blob(x, y, r, hx('#8ae0ff'), 10, 220); p.set(x - .5, y - .5, [255, 255, 255]); } },
  frosting_top: p => { p.fill(hx('#ff9fd0'), 12); const sp = ['#ffffff', '#5ad0ff', '#ffe45a', '#7aff8a', '#c87aff']; for (let i = 0; i < 12; i++) { const x = p.r() * 15, y = p.r() * 16; const c = hx(sp[i % 5]); p.set(x, y, c); p.set(x + 1, y, c); } },
  frosting_side: p => { T_CAKE(p); for (let x = 0; x < 16; x++) { const d = 3 + Math.floor(p.r() * 3) + (x % 5 === 2 ? 3 : 0); for (let y = 0; y < d; y++) p.set(x, y, p.v(hx('#ff9fd0'), 10)); } },
  cake: T_CAKE,
  chocolate: p => { p.fill(hx('#5b3521'), 10); for (let i = 0; i < 16; i += 8) { p.line(i, 0, i, 15, hx('#3e2214')); p.line(0, i, 15, i, hx('#3e2214')); } p.line(1, 1, 6, 1, hx('#7a4a30')); p.line(9, 9, 14, 9, hx('#7a4a30')); },
  candy_stone: T_CANDYSTONE,
  sugar_ore: p => { T_CANDYSTONE(p); p.ore(hx('#ffffff'), 6, hx('#ffffff')); p.speck(hx('#ff5ad2'), 4, 0); },
  candy_cane: p => p.stripes(hx('#e8303a'), hx('#fff6f6'), 3),
  lolli_red: p => p.swirl(hx('#e8303a'), hx('#fff0f0')),
  lolli_green: p => p.swirl(hx('#3ad85a'), hx('#f0fff0')),
  lolli_blue: p => p.swirl(hx('#3a8aff'), hx('#f0f6ff')),
  gumdrop: p => { const cols = ['#ff4a6a', '#4ad8ff', '#ffd23a', '#8aff4a']; const c = hx(cols[Math.floor(p.r() * 4)]); p.blob(7.5, 11, 4, c, 10, 240); p.rect(3, 13, 10, 3, c, 10, 240); p.set(6, 9, [255, 255, 255]); p.speck([255, 255, 255], 0); },
  cotton_candy: p => { p.fill(hx('#ffc2e8'), 10); p.blobs(hx('#ffdcf2'), 6, 1, 2, 6); },
  choco_milk: p => { p.fill(hx('#7a4a2c'), 12, 230); for (let i = 0; i < 5; i++) { const x = p.r() * 12, y = p.r() * 16; p.line(x, y, x + 3, y, hx('#a87050'), 8, 235); } },
  icing: p => { p.fill(hx('#fff6fb'), 6); p.speck(hx('#ffe0f0'), 10, 4); },
  jgrass_top: p => { p.fill(hx('#3a9e35'), 24); p.speck(hx('#5ac04a'), 20, 12); p.speck(hx('#2a7a26'), 12, 8); },
  jgrass_side: p => { T_MUD(p); p.fringe(hx('#3a9e35'), 5, 18); },
  mud: T_MUD,
  jungle_log: p => { p.bark(hx('#5f4a2b'), hx('#3a2a16')); p.speck(hx('#4a8a3a'), 8, 10); },
  jungle_top: p => p.rings(hx('#5f4a2b'), hx('#a88a5a')),
  jungle_leaves: p => p.leaves(hx('#2e8c2a'), 0.14),
  fern: p => { const c = hx('#3a9a3a'); for (const [x0, lean] of [[7, -5], [8, 5], [7, -2], [8, 2]]) { p.line(x0, 15, x0 + lean, 2, c, 14); for (let t = 0.2; t < 1; t += 0.15) { const x = x0 + lean * t, y = 15 - 13 * t; p.set(x - 1, y + 1, c); p.set(x + 1, y + 1, c); } } },
  vine: p => { const c = hx('#3a8a2a'); for (const x of [2, 6, 10, 13]) { for (let y = 0; y < 16; y++) if (p.r() < 0.85) p.set(x + Math.round(Math.sin(y * 0.8 + x) * 0.8), y, p.v(c, 16)); } },
  amber_ore: p => { T_STONE(p); p.ore(hx('#ff9a1a'), 5, hx('#ffe0a0')); },
  volcanic_rock: p => { p.fill(hx('#3a3232'), 14); p.speck(hx('#a83a2a'), 10, 10); p.speck(hx('#2a2222'), 20, 6); },
  prism_stone: T_PRISMSTONE,
  prismgrass_top: p => { p.fill(hx('#bfe6ff'), 16); p.speck(hx('#ffffff'), 14, 8); p.speck(hx('#e0c8ff'), 10, 8); },
  prismgrass_side: p => { T_PRISMSTONE(p); p.fringe(hx('#bfe6ff'), 4, 12); },
  starstone_ore: p => { p.fill(hx('#1a1f4a'), 12); for (let i = 0; i < 7; i++) { const x = 1 + p.r() * 14, y = 1 + p.r() * 14; p.set(x, y, hx('#ffffff')); p.set(x + 1, y, hx('#c8a0ff')); p.set(x - 1, y, hx('#c8a0ff')); p.set(x, y + 1, hx('#c8a0ff')); p.set(x, y - 1, hx('#c8a0ff')); } },
  guardian_stone: p => { p.fill(hx('#251d3e'), 10); p.rect(1, 1, 14, 14, hx('#2e2550'), 8); for (let i = 1; i < 15; i++) { p.set(i, 1, hx('#e8c25a')); p.set(i, 14, hx('#e8c25a')); p.set(1, i, hx('#e8c25a')); p.set(14, i, hx('#e8c25a')); } p.blob(7.5, 7.5, 1.6, hx('#c46aff')); },
  star_flower: p => { plantStem(p, hx('#7a8ad8'), 7, 7); const c = hx('#fff6a8'); p.line(7, 2, 7, 10, c); p.line(3, 6, 11, 6, c); p.line(5, 4, 9, 8, c); p.line(9, 4, 5, 8, c); p.set(7, 6, [255, 255, 255]); },
};
for (const [c, hex] of PAINTS) TEXDEF['paint_' + c] = p => { p.fill(hx(hex), 8); for (let i = 0; i < 16; i++) { p.set(i, 15, mulC(hx(hex), .8)); p.set(15, i, mulC(hx(hex), .8)); p.set(i, 0, mixC(hx(hex), [255, 255, 255], .25)); } };
for (const [c, hex] of CRYSTALS) TEXDEF['crystal_' + c] = p => p.crystal(hx(hex), 205);
for (let s = 0; s < 8; s++) TEXDEF['crack' + s] = p => {
  const lines = 2 + s * 2;
  for (let i = 0; i < lines; i++) {
    let x = 7.5, y = 7.5; const ang = (i / lines) * 6.28 + p.r();
    const len = 2 + s * 1.1 + p.r() * 2;
    for (let j = 0; j < len; j++) { x += Math.cos(ang) + (p.r() - .5); y += Math.sin(ang) + (p.r() - .5); p.set(x, y, [20, 20, 20], 200); }
  }
};

const TILE = {};
let ATLAS_CANVAS = null;
const TILE_CANVAS = {};

function buildAtlas() {
  const names = new Set();
  for (const b of BLOCKS) for (const t of b.tex) if (b.render !== R_NONE) names.add(t);
  for (let s = 0; s < 8; s++) names.add('crack' + s);
  const list = [...names];
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(256, 256);
  const p = new Painter();
  list.forEach((name, i) => {
    TILE[name] = i;
    const fn = TEXDEF[name];
    p.begin(hashStr(name));
    if (fn) fn(p); else p.fill([255, 0, 255], 0);
    const tx = (i % 16) * 16, ty = Math.floor(i / 16) * 16;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const s = (y * 16 + x) * 4, d = ((ty + y) * 256 + tx + x) * 4;
      img.data[d] = p.d[s]; img.data[d + 1] = p.d[s + 1]; img.data[d + 2] = p.d[s + 2]; img.data[d + 3] = p.d[s + 3];
    }
    const tc = document.createElement('canvas'); tc.width = tc.height = 16;
    const tctx = tc.getContext('2d', { willReadFrequently: true }); const ti = tctx.createImageData(16, 16); ti.data.set(p.d); tctx.putImageData(ti, 0, 0);
    TILE_CANVAS[name] = tc;
  });
  ctx.putImageData(img, 0, 0);
  ATLAS_CANVAS = canvas;
  // lookup tables
  for (const b of BLOCKS) {
    const id = b.id;
    RENDER[id] = b.render; SOLID[id] = b.solid ? 1 : 0; OPAQUE[id] = b.opaque ? 1 : 0; EMIT[id] = b.emissive ? 1 : 0;
    LIQ[id] = b.liquid; WLOG[id] = b.wlog ? 1 : 0; SKYB[id] = b.sky; SWAY[id] = b.sway ? 1 : 0; LEAF[id] = b.leaves ? 1 : 0;
    REPL[id] = (b.replace || b.liquid || id === 0) ? 1 : 0; CLIMB[id] = b.climb ? 1 : 0; LIGHTR[id] = b.light ? b.light[3] : 0;
    ORE[id] = b.ore ? 1 : 0;
    if (b.render !== R_NONE) {
      TEX_T[id] = TILE[b.tex[0]]; TEX_B[id] = TILE[b.tex[1]]; TEX_S[id] = TILE[b.tex[2]]; TEX_F[id] = TILE[b.tex[3]];
      // average color (for particles/minimap) from the top texture
      const src = TILE_CANVAS[b.tex[b.render === R_CROSS ? 2 : 0]].getContext('2d', { willReadFrequently: true }).getImageData(0, 0, 16, 16).data;
      let r = 0, g = 0, bl = 0, n = 0;
      for (let k = 0; k < 1024; k += 4) if (src[k + 3] > 60) { r += src[k]; g += src[k + 1]; bl += src[k + 2]; n++; }
      AVG_COLOR[id] = n ? [r / n, g / n, bl / n] : [200, 200, 200];
    } else AVG_COLOR[id] = [0, 0, 0];
  }
}

// ============================================================
// Item icons (procedural pixel sprites) + isometric block icons
// ============================================================
class Sprite {
  constructor() { this.px = new Array(256).fill(null); }
  set(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < 16 && y < 16) this.px[y * 16 + x] = c; }
  line(x0, y0, x1, y1, c, w = 1) {
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2) + 1;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = lerp(x0, x1, t), y = lerp(y0, y1, t);
      for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) this.set(Math.floor(x) + a, Math.floor(y) + b, c);
    }
  }
  circle(cx, cy, r, c) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 <= r * r) this.set(x, y, c); }
  poly(pts, c) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const px = x + .5, py = y + .5; let ins = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) ins = !ins;
      }
      if (ins) this.set(x, y, c);
    }
  }
  canvas(size = 32) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const ctx = c.getContext('2d'); const s = size / 16;
    const filled = (x, y) => x >= 0 && y >= 0 && x < 16 && y < 16 && this.px[y * 16 + x];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let col = this.px[y * 16 + x];
      if (!col) {
        const nb = filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1);
        if (nb) { ctx.fillStyle = rgbHex(mulC(hexRgb(nb), 0.32)); ctx.fillRect(x * s, y * s, s, s); }
        continue;
      }
      let rgb = hexRgb(col);
      if (!filled(x - 1, y) || !filled(x, y - 1)) rgb = mixC(rgb, [255, 255, 255], 0.25);
      else if (!filled(x + 1, y) || !filled(x, y + 1)) rgb = mulC(rgb, 0.78);
      ctx.fillStyle = rgbHex(rgb); ctx.fillRect(x * s, y * s, s, s);
    }
    return c;
  }
}

const STICK = '#8a5a2b';
const ICON_SHAPES = {
  stick: s => s.line(3, 12, 12, 3, STICK, 2),
  coal: s => { s.circle(7, 9, 4.2, '#2c2c34'); s.circle(10, 7, 3.2, '#34343e'); s.set(6, 8, '#5a5a66'); s.set(10, 6, '#5a5a66'); },
  ingot: (s, c) => { s.poly([[2, 9], [5, 5.5], [14, 5.5], [11, 9]], rgbHex(mixC(hexRgb(c), [255, 255, 255], .3))); s.poly([[2, 9], [11, 9], [11, 12.5], [2, 12.5]], c); s.poly([[11, 9], [14, 5.5], [14, 9], [11, 12.5]], rgbHex(mulC(hexRgb(c), .7))); },
  gem: (s, c) => { s.poly([[8, 2], [13.5, 6.5], [8, 14.5], [2.5, 6.5]], c); s.poly([[8, 2], [10.5, 6.5], [8, 6.5], [5.5, 6.5]], rgbHex(mixC(hexRgb(c), [255, 255, 255], .45))); s.set(6, 5, '#ffffff'); },
  round: (s, c) => { s.circle(8, 8.5, 5.5, c); s.circle(6.5, 7, 2, rgbHex(mixC(hexRgb(c), [255, 255, 255], .45))); s.set(6, 6, '#ffffff'); },
  shard: (s, c) => { s.poly([[8, 1], [11, 5], [10, 15], [6, 15], [5, 5]], c); s.poly([[8, 1], [9, 5], [8, 14], [7, 5]], rgbHex(mixC(hexRgb(c), [255, 255, 255], .5))); },
  drop: (s, c) => { s.circle(8, 10, 4.5, c); s.poly([[8, 2], [11.5, 8], [4.5, 8]], c); s.set(6, 8, '#fff2c0'); s.set(7, 12, rgbHex(mulC(hexRgb(c), .6))); },
  prism: s => { const cs = ['#ff5a6e', '#ffa24a', '#ffe45a', '#5affa0', '#5ab4ff', '#c46aff']; s.poly([[8, 1], [12, 6], [8, 15], [4, 6]], '#ffffff'); for (let y = 2; y < 15; y++) for (let x = 4; x < 13; x++) if (s.px[y * 16 + x]) s.set(x, y, cs[Math.floor((x + y) / 2.4) % 6]); s.set(7, 4, '#ffffff'); },
  pearl: s => { s.circle(8, 8.5, 4.5, '#f4eef8'); s.circle(6.5, 7, 1.4, '#ffffff'); s.set(10, 10, '#d8c8e8'); },
  shell: s => { s.poly([[3, 12], [8, 3], [13, 12], [8, 14]], '#ffb4c8'); s.line(8, 4, 6, 12, '#e8849e'); s.line(8, 4, 10, 12, '#e8849e'); s.poly([[6, 12], [10, 12], [8, 14.5]], '#fff0f4'); },
  fossil: s => { s.circle(8, 8, 6, '#d8c8a0'); for (let t = 0; t < 12; t += .3) { const r = .8 + t * .42; s.set(8 + Math.cos(t) * r, 8 + Math.sin(t) * r, '#9a8a6a'); } },
  bone: s => { s.line(4, 12, 12, 4, '#f2eee2', 2); s.circle(3.5, 12.5, 1.6, '#f2eee2'); s.circle(4.8, 13.5, 1.4, '#f2eee2'); s.circle(12.5, 3.5, 1.6, '#f2eee2'); s.circle(11.5, 2.5, 1.4, '#f2eee2'); },
  slime: s => { s.circle(8, 9, 5, '#6ad85a'); s.circle(6, 7, 1.6, '#c8ffb8'); s.set(10, 11, '#3aa83a'); },
  apple: s => { s.circle(8, 9.5, 5, '#e8343a'); s.line(8, 3, 8, 5, '#6a4020', 1); s.poly([[9, 4], [12, 2.5], [11, 5]], '#4aa83a'); s.set(6, 7, '#ffb0b0'); },
  berries: s => { for (const [x, y] of [[6, 9], [10, 8.5], [8, 12], [11, 12]]) s.circle(x, y, 2.3, '#a8306a'); s.poly([[7, 6], [9, 3], [11, 6]], '#3a8a3a'); s.set(5, 8, '#ff9ad0'); },
  meat: (s, c) => { s.circle(9.5, 6.5, 4.6, c); s.line(5, 10, 2.5, 13, '#f2eee2', 2); s.circle(2.2, 13.8, 1.3, '#f2eee2'); s.set(8, 5, rgbHex(mixC(hexRgb(c), [255, 255, 255], .4))); },
  fish: (s, c) => { s.poly([[2, 8], [6, 4.5], [11, 5], [13, 8], [11, 11], [6, 11.5]], c); s.poly([[12, 8], [15, 4.5], [15, 11.5]], rgbHex(mulC(hexRgb(c), .8))); s.set(5, 7, '#1a1a1a'); },
  candy: s => { s.circle(8, 8, 3.6, '#ff5aa8'); s.poly([[4.5, 8], [1, 5], [1, 11]], '#ffd0e8'); s.poly([[11.5, 8], [15, 5], [15, 11]], '#ffd0e8'); s.line(6, 6, 10, 10, '#ffffff'); },
  cheese: s => { s.poly([[1.5, 13], [14.5, 13], [14.5, 4]], '#ffd84a'); s.circle(10, 10, 1.3, '#d8a82a'); s.circle(12.5, 7.5, 1, '#d8a82a'); s.circle(6.5, 11.5, .9, '#d8a82a'); },
  key: (s, c) => { s.circle(4.5, 11.5, 3.2, c); s.circle(4.5, 11.5, 1.5, null); s.line(6, 10, 13, 3, c, 2); s.line(11, 5, 13, 7, c, 1); s.line(9, 7, 11, 9, c, 1); },
  crystal: (s, c) => { s.poly([[8, 1], [11, 4], [11, 12], [8, 15], [5, 12], [5, 4]], c); s.line(8, 2, 8, 14, rgbHex(mixC(hexRgb(c), [255, 255, 255], .6))); s.poly([[12, 8], [14, 10], [13, 14], [11, 13]], c); },
  clock: s => { s.circle(8, 8.5, 6.2, '#e8b830'); s.circle(8, 8.5, 4.6, '#fff6dc'); s.line(8, 8.5, 8, 5, '#2a2a2a'); s.line(8, 8.5, 10.5, 9.5, '#2a2a2a'); s.set(8, 1.5, '#e8b830'); },
  star: s => { const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 3 : 7; pts.push([8 + Math.cos(a) * r, 8.5 + Math.sin(a) * r]); } s.poly(pts, '#ffe45a'); s.circle(8, 8.5, 1.6, '#c46aff'); },
  charm: s => { s.line(4, 2, 8, 7, '#d8c8a0'); s.line(12, 2, 8, 7, '#d8c8a0'); s.circle(8, 10, 3.6, '#ffd23f'); s.circle(8, 10, 2, '#5ad06a'); },
  igniter: s => { s.poly([[3, 5], [10, 5], [12, 7], [12, 9], [10, 11], [3, 11], [3, 9], [9, 9], [9, 7], [3, 7]], '#9aa0a8'); s.poly([[11, 11], [14, 13], [12, 15], [9, 13]], '#3a3a40'); s.set(13, 10, '#ffd04a'); },
  crown: s => { s.poly([[2, 13], [2, 5], [5, 9], [8, 3], [11, 9], [14, 5], [14, 13]], '#ffd23f'); s.set(8, 10, '#ff3a5c'); s.set(5, 11, '#3e6dff'); s.set(11, 11, '#5affa0'); },
  armor: (s, c) => { s.poly([[3, 3], [6, 3], [8, 5], [10, 3], [13, 3], [14, 7], [12, 7], [12, 14], [4, 14], [4, 7], [2, 7]], c); s.line(8, 6, 8, 13, rgbHex(mulC(hexRgb(c), .75))); },
  pickaxe: (s, c) => {
    s.line(2.5, 13.5, 9.5, 6.5, STICK, 2);
    for (let t = -1; t <= 1.001; t += 0.05) { const x = 9.5 + 4.6 * t + 1.6 * (1 - t * t), y = 5.5 + 4.6 * t - 1.6 * (1 - t * t); s.set(x, y, c); if (Math.abs(t) < .8) s.set(x - .7, y - .7, c); }
  },
  axe: (s, c) => { s.line(2.5, 13.5, 10.5, 5.5, STICK, 2); s.poly([[7, 3], [10, 1], [14, 5], [12, 8], [9, 7]], c); },
  shovel: (s, c) => { s.line(2.5, 13.5, 9.5, 6.5, STICK, 2); s.poly([[9, 6], [11, 2], [14, 2], [14, 5], [10, 7]], c); },
  bucket: (s, c) => { s.line(3.5, 5, 8, 1.5, '#8a8e96'); s.line(8, 1.5, 12.5, 5, '#8a8e96'); s.poly([[3, 5], [13, 5], [11.5, 14.5], [4.5, 14.5]], '#b8bcc6'); s.poly([[4, 6], [12, 6], [11.6, 8], [4.4, 8]], c || '#5a5e66'); },
  sword: (s, c) => { s.line(5, 11, 13.5, 2.5, c, 2); s.set(14, 1.5, c); s.line(3, 8, 8, 13, '#6a4a2a', 1); s.line(2, 14, 4.5, 11.5, STICK, 2); },
};

const ICON_URL = {};
function makeItemIcon(def) {
  const s = new Sprite();
  const [shape, col] = def.icon || ['coal'];
  (ICON_SHAPES[shape] || ICON_SHAPES.coal)(s, col);
  return s.canvas(32);
}
function makeBlockIcon(b) {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  if (b.render === R_CROSS) { ctx.drawImage(TILE_CANVAS[b.tex[2]], 0, 0, 32, 32); return c; }
  const top = TILE_CANVAS[b.tex[0]], side = TILE_CANVAS[b.tex[2]], front = TILE_CANVAS[b.tex[3]];
  // draw each face to its own buffer so source-atop shading only hits that face
  const draw = (img, m, shade) => {
    const t = document.createElement('canvas'); t.width = t.height = 32; const tc = t.getContext('2d'); tc.imageSmoothingEnabled = false;
    tc.setTransform(...m); tc.drawImage(img, 0, 0);
    if (shade) { tc.setTransform(1, 0, 0, 1, 0, 0); tc.globalCompositeOperation = 'source-atop'; tc.fillStyle = `rgba(0,0,0,${shade})`; tc.fillRect(0, 0, 32, 32); }
    ctx.drawImage(t, 0, 0);
  };
  draw(front, [15 / 16, 7.5 / 16, 0, 15.5 / 16, 1, 8.5], 0.22);
  draw(side, [15 / 16, -7.5 / 16, 0, 15.5 / 16, 16, 16], 0.42);
  draw(top, [15 / 16, -7.5 / 16, 15 / 16, 7.5 / 16, 1, 8.5], 0);
  return c;
}
function buildIcons() {
  for (const b of BLOCKS) if (b.render !== R_NONE) ICON_URL[b.id] = makeBlockIcon(b).toDataURL();
  for (const id in ITEMS) ICON_URL[id] = makeItemIcon(ITEMS[id]).toDataURL();
}
function iconURL(id) { return ICON_URL[id] || ''; }

// Small HUD sprites (hearts, food, bubbles)
function hudSprite(kind, state) {
  const s = new Sprite();
  if (kind === 'heart') {
    const c = state === 0 ? '#3a1a22' : '#ff3a4a';
    s.circle(5.5, 6, 3.5, c); s.circle(10.5, 6, 3.5, c); s.poly([[2.2, 7], [13.8, 7], [8, 14]], c);
    if (state === 1) for (let y = 0; y < 16; y++) for (let x = 8; x < 16; x++) if (s.px[y * 16 + x]) s.set(x, y, '#3a1a22');
    if (state > 0) s.set(5, 5, '#ffc0c8');
  } else if (kind === 'food') {
    const c = state === 0 ? '#3a2a1a' : '#c8783a';
    s.circle(9.5, 6.5, 4.4, c); s.line(5, 10, 2.5, 13, state === 0 ? '#3a3a3a' : '#f2eee2', 2);
    if (state === 1) for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) if (s.px[y * 16 + x]) s.set(x, y, '#3a2a1a');
  } else if (kind === 'bubble') {
    s.circle(8, 8, 5, state ? '#7ad0ff' : '#1a2a3a'); if (state) s.set(6, 6, '#ffffff');
  }
  return s.canvas(18).toDataURL();
}
