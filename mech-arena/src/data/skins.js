/**
 * SKIN SYSTEM
 * ------------------------------------------------------------------
 * Skins are generated rather than authored: a colourway (paint scheme)
 * crossed with a pattern and a finish gives every chassis a very large
 * wardrobe without shipping a single texture file. The pattern itself is
 * painted into a canvas at runtime by world/skinTexture.js.
 *
 *   colourways x patterns x finishes  =  the full catalog
 *
 * Each combination gets a deterministic id so a saved garage keeps its
 * paint across sessions.
 */

export const COLOURWAYS = [
  { id:'gunmetal',  name:'Gunmetal',        p:'#4a5058', s:'#2b3038', t:'#c8d2dc', tier:1 },
  { id:'sandstorm', name:'Sandstorm',       p:'#b8a077', s:'#6e5f43', t:'#e8dcc0', tier:1 },
  { id:'forest',    name:'Forest Watch',    p:'#43563f', s:'#26301f', t:'#9bb08a', tier:1 },
  { id:'arctic',    name:'Arctic Shelf',    p:'#c6d2d8', s:'#7d8c96', t:'#ffffff', tier:1 },
  { id:'rust',      name:'Oxide',           p:'#7a4326', s:'#3f2415', t:'#d18a4e', tier:1 },
  { id:'nightops',  name:'Night Ops',       p:'#1a1f26', s:'#0c0f13', t:'#5a6672', tier:1 },
  { id:'urban',     name:'Urban Grey',      p:'#7c8288', s:'#4b5157', t:'#b9c1c7', tier:1 },
  { id:'olive',     name:'Olive Drab',      p:'#5a5c37', s:'#34351f', t:'#a3a473', tier:1 },
  { id:'crimson',   name:'Crimson Lance',   p:'#8e1f28', s:'#4a0f15', t:'#ff6b74', tier:2 },
  { id:'azure',     name:'Azure Guard',     p:'#1f4f8e', s:'#0f2749', t:'#6bb6ff', tier:2 },
  { id:'viper',     name:'Viper Green',     p:'#1f7a4a', s:'#0d3d25', t:'#5cffab', tier:2 },
  { id:'amber',     name:'Amber Signal',    p:'#b8791f', s:'#5e3c0c', t:'#ffc766', tier:2 },
  { id:'violet',    name:'Violet Noble',    p:'#4a2a7a', s:'#24143d', t:'#b48bff', tier:2 },
  { id:'ivory',     name:'Ivory Command',   p:'#ded4c2', s:'#9a8f7c', t:'#3a352c', tier:2 },
  { id:'teal',      name:'Deep Teal',       p:'#1a5f63', s:'#0b3033', t:'#5ce0e8', tier:2 },
  { id:'magenta',   name:'Magenta Circuit', p:'#8e1f6e', s:'#450f35', t:'#ff6bd6', tier:2 },
  { id:'bone',      name:'Bone Reaper',     p:'#d8d2c0', s:'#3a352c', t:'#8e1f28', tier:3 },
  { id:'ember',     name:'Ember Core',      p:'#2b1a18', s:'#1a0f0e', t:'#ff5a2d', tier:3 },
  { id:'glacier',   name:'Glacier Blue',    p:'#8fc4dc', s:'#3f6d85', t:'#e8fbff', tier:3 },
  { id:'toxic',     name:'Toxic Spill',     p:'#4a5a1f', s:'#252d0e', t:'#c8ff2d', tier:3 },
  { id:'obsidian',  name:'Obsidian Edge',   p:'#121418', s:'#06070a', t:'#c8a34e', tier:3 },
  { id:'solarflare',name:'Solar Flare',     p:'#c94a1f', s:'#6b2409', t:'#ffd24e', tier:3 },
  { id:'abyss',     name:'Abyssal',         p:'#0f2136', s:'#05101c', t:'#2de0ff', tier:3 },
  { id:'sakura',    name:'Sakura Wind',     p:'#e8c4cf', s:'#8e5f70', t:'#5a2d3a', tier:3 },
  { id:'chrome',    name:'Liquid Chrome',   p:'#d0d8e0', s:'#98a4b0', t:'#ffffff', tier:4, finishHint:'chrome' },
  { id:'gold',      name:'Aurum Standard',  p:'#c8a34e', s:'#7a5f1f', t:'#ffe9a8', tier:4, finishHint:'chrome' },
  { id:'plasma',    name:'Plasma Bleed',    p:'#2d0f45', s:'#140622', t:'#d64eff', tier:4 },
  { id:'nebula',    name:'Nebula Drift',    p:'#2b1f5a', s:'#120c2d', t:'#7cc4ff', tier:4 },
  { id:'inferno',   name:'Inferno Prime',   p:'#5a0f0f', s:'#2b0505', t:'#ff8a2d', tier:4 },
  { id:'void',      name:'Void Signature',  p:'#080a10', s:'#020306', t:'#8e4eff', tier:5 },
  { id:'prismatic', name:'Prismatic',       p:'#e0e8f0', s:'#6b7f96', t:'#2de0ff', tier:5, finishHint:'iridescent' },
  { id:'champion',  name:'Champion Laurel', p:'#1f1f24', s:'#0c0c0f', t:'#ffd24e', tier:5 },
];

export const PATTERNS = [
  { id:'solid',    name:'Solid',        tier:1 },
  { id:'panel',    name:'Panelled',     tier:1 },
  { id:'stripe',   name:'Lance Stripe', tier:1 },
  { id:'splinter', name:'Splinter',     tier:2 },
  { id:'hexcam',   name:'Hex Camo',     tier:2 },
  { id:'digital',  name:'Digital Camo', tier:2 },
  { id:'chevron',  name:'Chevron',      tier:2 },
  { id:'tiger',    name:'Tiger Stripe', tier:3 },
  { id:'urbanblk', name:'Urban Block',  tier:3 },
  { id:'weathered',name:'Weathered',    tier:3 },
  { id:'circuit',  name:'Circuitry',    tier:4 },
  { id:'shatter',  name:'Shatterline',  tier:4 },
  { id:'flames',   name:'Flame Front',  tier:5 },
];

export const FINISHES = [
  { id:'matte',      name:'Matte',      metal:0.55, rough:0.78, tier:1 },
  { id:'satin',      name:'Satin',      metal:0.70, rough:0.52, tier:1 },
  { id:'gloss',      name:'Gloss',      metal:0.80, rough:0.26, tier:2 },
  { id:'chrome',     name:'Chrome',     metal:1.00, rough:0.08, tier:4 },
  { id:'iridescent', name:'Iridescent', metal:0.95, rough:0.18, tier:5, irid:true },
  { id:'battleworn', name:'Battleworn', metal:0.60, rough:0.88, tier:2, wear:0.55 },
];

export const DECALS = [
  { id:'none',    name:'None',            tier:1 },
  { id:'lance',   name:'Lance Numerals',  tier:1 },
  { id:'skull',   name:'Death\'s Head',   tier:2 },
  { id:'wolf',    name:'Wolf Sigil',      tier:2 },
  { id:'nova',    name:'Nova Burst',      tier:3 },
  { id:'kills',   name:'Kill Tally',      tier:3 },
  { id:'crown',   name:'Champion Crown',  tier:5 },
];

/**
 * The full wardrobe. Rarity and price come from the combined tier of the
 * parts, so a Champion Laurel + Flame Front + Iridescent is genuinely
 * end-game and a Gunmetal + Solid + Matte is free.
 */
export const SKINS = (() => {
  const out = [];
  for (const c of COLOURWAYS) {
    for (const p of PATTERNS) {
      for (const f of FINISHES) {
        const tier = Math.max(c.tier, p.tier, f.tier);
        const score = c.tier + p.tier + f.tier;
        out.push({
          id: `${c.id}.${p.id}.${f.id}`,
          name: `${c.name} ${p.name !== 'Solid' ? p.name : ''}`.trim() + (f.id !== 'matte' ? ` (${f.name})` : ''),
          colourway: c.id, pattern: p.id, finish: f.id,
          primary: c.p, secondary: c.s, trim: c.t,
          metal: f.metal, rough: f.rough, irid: !!f.irid, wear: f.wear || 0,
          tier,
          rarity: score <= 4 ? 'common' : score <= 7 ? 'uncommon' : score <= 10 ? 'rare' : 'legendary',
          cost: score <= 3 ? 0 : Math.round((score ** 2.1) * 90),
        });
      }
    }
  }
  return out;
})();

export const SKIN_BY_ID = Object.fromEntries(SKINS.map(s => [s.id, s]));
export const DEFAULT_SKIN = 'gunmetal.panel.satin';

/** Skins a player has by default (everything free). */
export function starterSkins() {
  return SKINS.filter(s => s.cost === 0).map(s => s.id);
}

/** Deterministic pick so bot mechs still look varied but stable. */
export function skinForSeed(seed) {
  return SKINS[Math.abs(seed | 0) % SKINS.length].id;
}
