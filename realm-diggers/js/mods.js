'use strict';
// ============================================================
// Mods: rare power-ups found while mining. Duplicates level them up (max III).
// ============================================================

const RARITY = [
  { name: 'Common', color: '#b7c0cc' },
  { name: 'Uncommon', color: '#5fd36b' },
  { name: 'Rare', color: '#4aa8ff' },
  { name: 'Epic', color: '#b56cff' },
  { name: 'Legendary', color: '#ffa630' },
  { name: 'Mythic', color: '#ff5fd2' },
];

const MODS = [];
const MOD = {};
function mod(key, name, rarity, realm, icon, desc, extra = {}) {
  const m = Object.assign({ key, name, rarity, realm, icon, desc }, extra);
  MODS.push(m); MOD[key] = m; return m;
}
// --- found in any realm
mod('swift', 'Swift Feet', 0, null, '👟', ['Walk 15% faster', 'Walk 30% faster', 'Walk 45% faster']);
mod('spring', 'Spring Legs', 0, null, '🦘', ['Jump a bit higher', 'Jump higher', 'Jump way higher']);
mod('quickpick', 'Quick Pick', 0, null, '⛏️', ['Mine 25% faster', 'Mine 50% faster', 'Mine 75% faster']);
mod('lucky', 'Lucky Miner', 1, null, '🍀', ['15% chance of double ore', '30% chance of double ore', '45% chance of double ore']);
mod('tough', 'Tough Skin', 1, null, '🛡️', ['Take 10% less damage', 'Take 20% less damage', 'Take 30% less damage']);
mod('nighteyes', 'Night Eyes', 1, null, '👁️', ['See a little in the dark', 'See better in the dark', 'See great in the dark']);
mod('stomach', 'Iron Stomach', 1, null, '🍖', ['Get hungry 30% slower', 'Get hungry 50% slower', 'Get hungry 70% slower']);
mod('treefeller', 'Treefeller', 1, null, '🪓', ['Chop whole trees (16 logs)', 'Chop whole trees (32 logs)', 'Chop whole trees (64 logs)']);
mod('regen', 'Regeneration', 2, null, '💗', ['Heal half a heart every 8s', 'Heal half a heart every 5s', 'Heal half a heart every 3s']);
mod('featherfall', 'Feather Fall', 2, null, '🪶', ['50% less fall damage', '75% less fall damage', 'No fall damage']);
mod('doublejump', 'Double Jump', 2, null, '🌀', ['Jump again in mid-air', 'Jump again in mid-air (higher)', 'Triple jump!']);
mod('autosmelt', 'Forge Touch', 2, null, '🔥', ['Ores drop ingots, sand drops glass', 'Also cooks meat you collect', 'Smelted drops x2 chance 20%']);
mod('strength', 'Mighty Arm', 2, null, '💪', ['+2 attack damage', '+4 attack damage', '+6 attack damage']);
mod('veinminer', 'Vein Miner', 3, null, '⛓️', ['Mine whole ore veins (6)', 'Mine whole ore veins (12)', 'Mine whole ore veins (24)']);
mod('widedig', 'Big Dig', 3, null, '💥', ['Mine a 3x3 area', 'Mine a 3x3 area, 20% faster', 'Mine a 3x3 area, 40% faster']);
mod('xray', 'X-Ray Vision', 4, null, '🔍', ['Press X: see ores through walls (12 blocks)', 'Press X: see ores (18 blocks)', 'Press X: see ores (24 blocks)'], { active: 'X' });
mod('jetpack', 'Jetpack', 4, null, '🚀', ['Hold Jump in the air to fly up (2s fuel)', 'Hold Jump in the air (4s fuel)', 'Hold Jump in the air (7s fuel)']);
mod('crafty', 'Crafty Hands', 1, null, '🧰', ['20% chance to craft double', '35% chance to craft double', '50% chance to craft double']);
mod('thorns', 'Spiky Armor', 1, null, '🌵', ['Monsters that hit you take 2 damage', 'Monsters that hit you take 4 damage', 'Monsters that hit you take 6 damage']);
mod('reach', 'Long Arms', 1, null, '🙌', ['Reach 1 block farther', 'Reach 2 blocks farther', 'Reach 3 blocks farther']);
mod('lifesteal', 'Heart Snatcher', 2, null, '💘', ['Hits sometimes heal you', 'Hits often heal you', 'Hits usually heal you']);
mod('geodefinder', 'Geode Finder', 2, null, '🧭', ['Shows the nearest Mod Geode (24 blocks)', 'Shows the nearest Mod Geode (36 blocks)', 'Shows the nearest Mod Geode (48 blocks)']);
mod('pocketpal', 'Pocket Pal', 3, null, '🧚', ['A floating buddy zaps monsters', 'Your buddy zaps harder and faster', 'Your buddy is a monster-zapping hero']);
mod('extralife', 'Second Wind', 4, null, '🌟', ['Instead of fainting, bounce back once (every 3 min)', 'Bounce back stronger (every 2 min)', 'Bounce back at full power (every 90s)']);
// --- realm exclusives
mod('greenthumb', 'Green Thumb', 2, 'greenhollow', '🌱', ['Plants and leaves drop more apples and berries', 'Even more, and plant food fills you double', 'Fruit everywhere!']);
mod('critter', 'Critter Charm', 1, 'greenhollow', '🐾', ['Friendly animals sometimes drop double', 'Friendly animals often drop double', 'Friendly animals always drop double']);
mod('fireproof', 'Fireproof', 2, 'emberdeep', '🌋', ['Lava and fire do not hurt you', 'Lava and fire do not hurt you, swim faster in lava', 'Lava heals you!']);
mod('flamefist', 'Flame Fist', 3, 'emberdeep', '🥊', ['Hits set monsters on fire', 'Hotter fire', 'Blazing fire']);
mod('magmastride', 'Magma Stride', 3, 'emberdeep', '👣', ['Walk on top of lava', 'Walk on lava, faster', 'Run across lava']);
mod('frostbolt', 'Frost Bolt', 4, 'frostveil', '🧊', ['Press Q: shoot an ice bolt that freezes (6 damage)', 'Ice bolt does 9 damage', 'Ice bolt does 12 damage'], { active: 'Q' });
mod('icepath', 'Ice Path', 2, 'frostveil', '❄️', ['Water freezes under your feet', 'Bigger ice path', 'Huge ice path']);
mod('iceskates', 'Ice Skates', 3, 'frostveil', '⛸️', ['Zoom on ice and snow', 'Zoom faster on ice and snow', 'Super zoom on ice and snow']);
mod('glider', 'Glider', 2, 'skyreach', '🪂', ['Hold Jump while falling to glide', 'Glide slower and farther', 'Glide like a bird']);
mod('cloudwalker', 'Cloud Walker', 4, 'skyreach', '☁️', ['Double-tap Jump to fly!', 'Fly faster', 'Fly super fast']);
mod('glow', 'Glow Aura', 2, 'hollowdeep', '💡', ['You glow and light up caves', 'Brighter glow', 'Blazing glow']);
mod('echo', 'Echo Sense', 3, 'hollowdeep', '🦇', ['See creatures through walls', 'See creatures farther', 'See all creatures nearby']);
mod('moonboots', 'Moon Boots', 2, 'lunara', '🌙', ['Low gravity everywhere', 'Even lower gravity', 'Floaty moon walk']);
mod('meteor', 'Meteor Stomp', 4, 'lunara', '☄️', ['Big falls blast nearby monsters', 'Bigger blast', 'Massive blast']);
mod('gills', 'Gills', 2, 'coralabyss', '🐟', ['Breathe underwater', 'Breathe underwater, see clearer', 'Breathe underwater, see clearly']);
mod('waterwalk', 'Water Strider', 2, 'coralabyss', '🌊', ['Walk on top of water (sneak to swim)', 'Walk on water, faster', 'Run across water']);
mod('dolphin', 'Dolphin Kick', 3, 'coralabyss', '🐬', ['Swim super fast', 'Swim faster', 'Swim fastest']);
mod('sweettooth', 'Sweet Tooth', 2, 'sugarland', '🍭', ['Food fills you up double', 'Food also heals a heart', 'Food heals two hearts']);
mod('sugarrush', 'Sugar Rush', 3, 'sugarland', '🧁', ['Eating gives you a speed boost', 'Longer speed boost', 'Huge speed boost']);
mod('bounce', 'Bubblegum Bounce', 3, 'sugarland', '🎈', ['No fall damage, bouncy landings', 'Bouncier', 'Super bouncy']);
mod('wallclimb', 'Raptor Claws', 2, 'dinovalley', '🦎', ['Climb walls by walking into them', 'Climb faster', 'Climb super fast']);
mod('dinofriend', 'Dino Buddy', 3, 'dinovalley', '🦕', ['Dinosaurs will not attack you', 'Dinos and beasts are friendly', 'All animals love you']);
mod('roar', 'Mega Roar', 4, 'dinovalley', '🦖', ['Press F: roar and scare monsters', 'Stronger roar', 'Earth-shaking roar'], { active: 'F' });
mod('blink', 'Prism Blink', 5, 'prismara', '✨', ['Press R: teleport where you look (20 blocks)', 'Teleport up to 32 blocks', 'Teleport up to 48 blocks'], { active: 'R' });
mod('realmmaster', 'Realm Master', 5, 'prismara', '👑', ['+2 hearts, faster, no fall damage', '+3 hearts, even faster', '+4 hearts, fastest']);
mod('rainbowluck', 'Rainbow Luck', 5, 'prismara', '🌈', ['Find mods twice as often', 'Find rarer mods', 'Find mods three times as often']);

// Roll a mod. oreTier = how special the ore is, realm = realm def, y = depth
function rollMod(oreTier, realm, y, luckBonus, owned) {
  let t = oreTier + realm.tier + (y < 20 ? 1 : 0) + luckBonus;
  t = clamp(t, 0, 5);
  const base = [60, 28, 10, 2, 0.35, realm.key === 'prismara' ? 0.03 : 0];
  const w = base.map((b, r) => b * Math.pow(1 + 0.8 * t, r));
  let total = w.reduce((a, b) => a + b, 0), roll = Math.random() * total, rar = 0;
  for (let r = 0; r < 6; r++) { roll -= w[r]; if (roll <= 0) { rar = r; break; } }
  for (let r = rar; r >= 0; r--) {
    const cands = MODS.filter(m => m.rarity === r && (!m.realm || m.realm === realm.key));
    if (!cands.length) continue;
    const ws = cands.map(m => { const lv = owned[m.key] || 0; return lv === 0 ? 3 : lv < 3 ? 1 : 0.2; });
    let s = ws.reduce((a, b) => a + b, 0), k = Math.random() * s;
    for (let i = 0; i < cands.length; i++) { k -= ws[i]; if (k <= 0) return cands[i].key; }
    return cands[cands.length - 1].key;
  }
  return 'swift';
}

// Derived player stats from equipped mods
function computeStats(equipped, owned) {
  const L = k => (equipped.includes(k) ? (owned[k] || 0) : 0);
  const rm = L('realmmaster');
  return {
    speed: 1 + 0.15 * L('swift') + (rm ? 0.15 + rm * 0.08 : 0),
    jump: 1 + 0.12 * L('spring') + (rm ? 0.08 : 0),
    mine: 1 + 0.25 * L('quickpick'),
    lucky: 0.15 * L('lucky'),
    defense: 0.1 * L('tough'),
    nightEyes: [0, 0.12, 0.22, 0.32][L('nighteyes')],
    hungerMul: [1, 0.7, 0.5, 0.3][L('stomach')],
    treefeller: [0, 16, 32, 64][L('treefeller')],
    regen: [0, 8, 5, 3][L('regen')],
    fallMul: rm ? 0 : [1, 0.5, 0.25, 0][L('featherfall')] * (L('bounce') ? 0 : 1),
    airJumps: L('doublejump') ? (L('doublejump') >= 3 ? 2 : 1) : 0,
    airJumpPower: L('doublejump') >= 2 ? 1.1 : 0.95,
    autosmelt: L('autosmelt'),
    strength: 2 * L('strength'),
    vein: [0, 6, 12, 24][L('veinminer')],
    widedig: L('widedig'),
    xray: L('xray'), xrayR: [0, 12, 18, 24][L('xray')],
    jetpack: [0, 2, 4, 7][L('jetpack')],
    fireproof: L('fireproof'),
    flamefist: L('flamefist'),
    icepath: L('icepath'),
    iceskates: L('iceskates'),
    glider: L('glider'),
    fly: L('cloudwalker'),
    glow: L('glow'),
    echo: L('echo'),
    moonboots: L('moonboots'),
    meteor: L('meteor'),
    gills: L('gills'),
    dolphin: L('dolphin'),
    sweettooth: L('sweettooth'),
    bounce: L('bounce'),
    dinofriend: L('dinofriend'),
    roar: L('roar'),
    blink: L('blink'), blinkR: [0, 20, 32, 48][L('blink')],
    bonusHearts: rm ? rm + 1 : 0,
    rainbow: L('rainbowluck'),
    crafty: [0, 0.2, 0.35, 0.5][L('crafty')],
    thorns: 2 * L('thorns'),
    reach: L('reach'),
    lifesteal: [0, 0.2, 0.35, 0.5][L('lifesteal')],
    geodeR: [0, 24, 36, 48][L('geodefinder')],
    pal: L('pocketpal'),
    extralife: L('extralife'),
    greenthumb: L('greenthumb'),
    critter: [0, 0.4, 0.7, 1][L('critter')],
    magmastride: L('magmastride'),
    frostbolt: L('frostbolt'),
    waterwalk: L('waterwalk'),
    wallclimb: L('wallclimb'),
    sugarrush: [0, 8, 12, 18][L('sugarrush')],
  };
}
