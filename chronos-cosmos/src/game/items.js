// Item catalogue: materials, consumables, gear and key items.
export const ITEMS = {
  wood: { name: 'Wood', type: 'material', color: '#b07b48', desc: 'Sturdy timber. Chop trees with your blade to gather it.' },
  stone: { name: 'Stone', type: 'material', color: '#9a978f', desc: 'Broken from boulders. The backbone of any shelter.' },
  fiber: { name: 'Plant Fiber', type: 'material', color: '#8cbf5a', desc: 'Tough stems twisted into cord. Dropped by Thornlings.' },
  herb: { name: 'Sunbloom', type: 'material', color: '#ffd24a', desc: 'A golden flower that hums with warmth. Brewed into tonics.' },
  iron: { name: 'Iron Ore', type: 'material', color: '#8d96a8', desc: 'Dense ore from constructs and dark boulders.' },
  crystal: { name: 'Star Crystal', type: 'material', color: '#8fe0ff', desc: 'Crystals that grow only in the Age of Stars.' },
  ember: { name: 'Ember Core', type: 'material', color: '#ff8a4c', desc: 'Still-warm hearts of the Ash Husks.' },
  hide: { name: 'Beast Hide', type: 'material', color: '#a3825e', desc: 'Thick hide from wolves and hounds.' },
  starShard: { name: 'Star Shard', type: 'currency', color: '#fff2b0', desc: 'Condensed time. Earned in the rifts, spent on rare gear and rift boons.' },
  tonic: { name: 'Sunbloom Tonic', type: 'consumable', color: '#ffb84a', heal: 45, desc: 'Restores 45 health.' },
  draught: { name: 'Aether Draught', type: 'consumable', color: '#72dcff', mana: 70, desc: 'Restores 70 aether.' },
  stew: { name: 'Hearth Stew', type: 'consumable', color: '#d9824a', heal: 120, stamina: true, desc: 'Fully restores health and stamina.' },
  shardDawn: { name: 'Shard of Dawn', type: 'key', color: '#ffe08a', desc: 'One third of the Chrono Heart, warm as a summer morning.' },
  shardEmber: { name: 'Shard of Embers', type: 'key', color: '#ff7a3a', desc: 'One third of the Chrono Heart, it smoulders against your palm.' },
  shardStar: { name: 'Shard of Stars', type: 'key', color: '#9fd8ff', desc: 'One third of the Chrono Heart, cold and full of distant light.' },
  starChart: { name: "Lyra's Star Chart", type: 'key', color: '#c9b6ff', desc: 'A hand-drawn map of the heavens, annotated in a tiny, eager hand.' },
  journal: { name: "Lyra's Journal", type: 'key', color: '#c9b6ff', desc: 'Found buried beneath Hearthmere a thousand years later.' },
  seed: { name: 'Sunheart Seed', type: 'key', color: '#ffd24a', desc: 'A seed that glows faintly. Plant it somewhere it can grow for a very long time.' },
};

export const MATERIALS = ['wood', 'stone', 'fiber', 'herb', 'iron', 'crystal', 'ember', 'hide', 'starShard'];
export const CONSUMABLES = ['tonic', 'draught', 'stew'];

export const SWORDS = {
  wayfarer: { name: "Wayfarer's Blade", dmg: 0, color: 0xd9dee6, glow: 0x8fe0ff, length: 1.0 },
  iron: { name: 'Ironheart Sword', dmg: 6, color: 0xb9c2cf, glow: 0x9fe0ff, length: 1.08 },
  starsteel: { name: 'Starsteel Edge', dmg: 13, color: 0xbfe6ff, glow: 0x6fd8ff, length: 1.12 },
  chrono: { name: 'Chrono Saber', dmg: 22, color: 0xffe9b0, glow: 0xffd86b, length: 1.18, curve: true },
};
export const ARMORS = {
  traveler: { name: "Traveler's Garb", armor: 0, cloth: 0x27345e, cape: 0x7a1f2b },
  hide: { name: 'Hidewarden Cloak', armor: 12, cloth: 0x4a3a2a, cape: 0x5a3a20 },
  covenant: { name: 'Covenant Plate', armor: 24, cloth: 0x3a3f4a, cape: 0x2a3a6a },
  astral: { name: 'Astral Raiment', armor: 34, cloth: 0x2a2a5a, cape: 0x3a6aa0, capeGlow: 0x3a6aff },
};

export const RECIPES = [
  { id: 'tonic', out: 'tonic', n: 1, cost: { herb: 2, fiber: 1 }, cat: 'Brews', station: 'any' },
  { id: 'draught', out: 'draught', n: 1, cost: { crystal: 1, herb: 1 }, cat: 'Brews', station: 'any' },
  { id: 'stew', out: 'stew', n: 1, cost: { hide: 1, herb: 2, wood: 1 }, cat: 'Brews', station: 'fire' },
  { id: 'sword_iron', gear: 'sword', key: 'iron', cost: { iron: 6, wood: 3, hide: 1 }, cat: 'Blades', station: 'fire' },
  { id: 'sword_starsteel', gear: 'sword', key: 'starsteel', cost: { iron: 6, crystal: 6, ember: 3 }, cat: 'Blades', station: 'fire', req: 'sword_iron' },
  { id: 'sword_chrono', gear: 'sword', key: 'chrono', cost: { starShard: 8, crystal: 5, ember: 5 }, cat: 'Blades', station: 'fire', req: 'sword_starsteel' },
  { id: 'armor_hide', gear: 'armor', key: 'hide', cost: { hide: 6, fiber: 4 }, cat: 'Armor', station: 'fire' },
  { id: 'armor_covenant', gear: 'armor', key: 'covenant', cost: { iron: 8, hide: 3, ember: 2 }, cat: 'Armor', station: 'fire', req: 'armor_hide' },
  { id: 'armor_astral', gear: 'armor', key: 'astral', cost: { crystal: 8, starShard: 5, fiber: 4 }, cat: 'Armor', station: 'fire', req: 'armor_covenant' },
  { id: 'glider', upgrade: 'glider', cost: { crystal: 4, fiber: 6, hide: 2 }, cat: 'Wayfaring', station: 'fire', desc: 'Dawnwing glider: lighter, faster glides.' },
  { id: 'vigor', upgrade: 'stamina', cost: { herb: 4, ember: 2, crystal: 2 }, cat: 'Wayfaring', station: 'fire', desc: '+20 maximum stamina.', repeat: 3 },
];
