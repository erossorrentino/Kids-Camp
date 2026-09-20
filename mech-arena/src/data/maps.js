/**
 * ARENA CATALOG
 * ------------------------------------------------------------------
 * Every arena is a seed plus a biome. world/arenaGenerator.js turns that
 * pair into geometry deterministically, so the same map name always builds
 * the same layout -- players can learn a map, and two clients given the
 * same seed agree on the world.
 *
 * `layout` selects the macro structure the generator lays down:
 *   grid      dense city blocks, right-angle sightlines, lots of corners
 *   canyon    a long central trench with flanking ledges
 *   basin     open bowl with a raised ring -- high ground matters
 *   spires    scattered tall towers, vertical fights, jump-jet country
 *   ruins     broken half-structures, waist-high cover everywhere
 *   platform  suspended decks over a void, hard edges and drop hazards
 *   foundry   interior industrial: pillars, catwalks, tight corridors
 *   dunes     rolling terrain with sparse hard cover, long sightlines
 */

export const BIOMES = {
  industrial: { sky:0x2a3340, fogCol:0x3a4654, fog:[80, 620], sun:0xffe8cc, sunI:2.0, amb:0x44566b, ambI:0.9,
                ground:0x3c4148, accent:0xff8a3d, hazeCol:0x55708c, label:'INDUSTRIAL' },
  desert:     { sky:0xd9b98a, fogCol:0xd8c49a, fog:[140, 900], sun:0xfff0d0, sunI:3.1, amb:0xc8a878, ambI:1.1,
                ground:0xb89a6c, accent:0xffcf66, hazeCol:0xe8d4a8, label:'DESERT' },
  arctic:     { sky:0xa8c4dc, fogCol:0xc8dae8, fog:[90, 700], sun:0xeef6ff, sunI:1.7, amb:0x8ea8c0, ambI:0.85,
                ground:0xb4c6d4, accent:0x7cd8ff, hazeCol:0xd2e2ee, label:'ARCTIC' },
  volcanic:   { sky:0x2a1210, fogCol:0x5a2418, fog:[60, 520], sun:0xff9a55, sunI:1.7, amb:0x8e3a24, ambI:1.25,
                ground:0x2e2422, accent:0xff4a1f, hazeCol:0x8e3a20, label:'VOLCANIC', night:true },
  jungle:     { sky:0x4a6b52, fogCol:0x5f7d63, fog:[45, 400], sun:0xe8ffd0, sunI:1.9, amb:0x4a6b4a, ambI:1.1,
                ground:0x3a4a32, accent:0x7cff9a, hazeCol:0x6b8e70, label:'JUNGLE' },
  orbital:    { sky:0x05070f, fogCol:0x0a1020, fog:[200, 1400], sun:0xffffff, sunI:3.4, amb:0x24304e, ambI:0.9,
                ground:0x2a3038, accent:0x49d6ff, hazeCol:0x162238, label:'ORBITAL', night:true },
  citynight:  { sky:0x0c1018, fogCol:0x141c28, fog:[60, 520], sun:0x9fb4d8, sunI:0.9, amb:0x3a4a62, ambI:1.5,
                ground:0x23282e, accent:0xff4de0, hazeCol:0x2a3852, label:'NIGHT CITY', night:true },
  wasteland:  { sky:0x8a7a68, fogCol:0x9a8a74, fog:[70, 620], sun:0xffe0b0, sunI:2.2, amb:0x8a7a64, ambI:1.0,
                ground:0x6b5f4e, accent:0xffa04e, hazeCol:0xa89478, label:'WASTELAND' },
  underwater: { sky:0x0a2a3a, fogCol:0x0f3a4e, fog:[35, 330], sun:0x9fe8ff, sunI:1.5, amb:0x2a5e74, ambI:1.4,
                ground:0x2a4a52, accent:0x5ce8ff, hazeCol:0x1a5a70, label:'ABYSSAL', night:true },
  storm:      { sky:0x30363f, fogCol:0x3a424c, fog:[40, 360], sun:0xc8d4e4, sunI:1.2, amb:0x38424e, ambI:1.1,
                ground:0x3e4450, accent:0xa8c8ff, hazeCol:0x49535f, label:'STORM' },
};

const M = (id, name, biome, layout, seed, size, opts = {}) => ({
  id, name, biome, layout, seed, size,
  modes: opts.modes || ['tdm', 'ffa', 'control', 'duel'],
  tier: opts.tier || 1,
  hazard: opts.hazard || null,
  blurb: opts.blurb || '',
  verticality: opts.verticality ?? 0.5,
  density: opts.density ?? 0.5,
  ...opts,
});

export const MAPS = [
  /* ---- Industrial ---- */
  M('refinery',    'REFINERY 7',        'industrial', 'foundry',  1071, 460, { verticality:0.6, density:0.75, blurb:'Cracking towers and catwalks. Every fight happens inside forty metres.' }),
  M('drydock',     'DRYDOCK ALPHA',     'industrial', 'platform', 2214, 520, { verticality:0.8, density:0.45, hazard:'fall', blurb:'Suspended repair decks over open water. Mind the gaps.' }),
  M('smeltworks',  'SMELTWORKS',        'industrial', 'foundry',  3390, 420, { verticality:0.55, density:0.8, hazard:'heat', blurb:'Molten channels run between the pillars. Standing near them cooks your reactor.' }),
  M('cargoyard',   'CARGO YARD',        'industrial', 'grid',     4478, 500, { verticality:0.45, density:0.85, blurb:'Stacked containers make a maze that changes every corner.' }),
  M('powerplant',  'FUSION PLANT',      'industrial', 'ruins',    5561, 480, { verticality:0.5,  density:0.7,  blurb:'Cooling stacks and blast walls around a dead reactor core.' }),
  M('railhub',     'RAIL HUB 12',       'industrial', 'grid',     6642, 540, { verticality:0.4,  density:0.6,  blurb:'Long rail sightlines broken by rolling stock and loading gantries.' }),

  /* ---- Desert ---- */
  M('duneline',    'DUNE LINE',         'desert', 'dunes',    7128, 620, { verticality:0.3, density:0.3, blurb:'Almost no cover. Bring something with reach or bring speed.' }),
  M('oasis',       'DEAD OASIS',        'desert', 'basin',    8236, 520, { verticality:0.5, density:0.5, blurb:'A dry basin ringed by cliffs. Whoever holds the rim holds the match.' }),
  M('canyonrun',   'CANYON RUN',        'desert', 'canyon',   9317, 560, { verticality:0.65, density:0.45, blurb:'One long trench with ledges above. Ambush country.' }),
  M('boneyard',    'BONEYARD',          'desert', 'ruins',   10493, 500, { verticality:0.45, density:0.7, blurb:'The wrecks of an entire regiment, left where they fell.' }),
  M('mesa',        'MESA STATION',      'desert', 'spires',  11578, 540, { verticality:0.85, density:0.4, tier:2, blurb:'Flat-topped rock towers connected by bridges. Jump jets strongly advised.' }),
  M('saltflat',    'SALT FLAT',         'desert', 'dunes',   12654, 680, { verticality:0.2, density:0.2, blurb:'A perfectly flat white plain. The purest gunnery test in the circuit.' }),

  /* ---- Arctic ---- */
  M('glacier',     'GLACIER SHELF',     'arctic', 'canyon',  13711, 540, { verticality:0.6, density:0.4, hazard:'ice', blurb:'Ice crevasses and wind-carved walls. Footing is treacherous.' }),
  M('whiteout',    'WHITEOUT',          'arctic', 'basin',   14829, 500, { verticality:0.4, density:0.45, hazard:'blizzard', blurb:'Visibility drops to sixty metres in the squalls. Radar is everything.' }),
  M('icestation',  'ICE STATION KILO',  'arctic', 'grid',    15940, 460, { verticality:0.5, density:0.75, blurb:'A buried research base. Corridors above ground, corridors below.' }),
  M('frozenport',  'FROZEN PORT',       'arctic', 'platform',17015, 520, { verticality:0.7, density:0.5, hazard:'fall', blurb:'Iced-in dock cranes and half-sunk hulls.' }),
  M('avalanche',   'AVALANCHE RIDGE',   'arctic', 'spires',  18124, 560, { verticality:0.8, density:0.35, tier:2, blurb:'Steep ridgelines with narrow saddles between them.' }),

  /* ---- Volcanic ---- */
  M('caldera',     'CALDERA',           'volcanic', 'basin',  19236, 520, { verticality:0.55, density:0.4, hazard:'heat', tier:2, blurb:'A live crater rim. The ambient heat never lets your mech cool properly.' }),
  M('ashfall',     'ASHFALL',           'volcanic', 'ruins',  20347, 500, { verticality:0.45, density:0.65, hazard:'ash', blurb:'A city buried in volcanic ash. Grey on grey on grey.' }),
  M('lavatube',    'LAVA TUBES',        'volcanic', 'foundry',21458, 400, { verticality:0.5, density:0.85, hazard:'heat', tier:2, blurb:'Tight basalt tunnels lit by the glow underfoot.' }),
  M('obsidianfld', 'OBSIDIAN FIELDS',   'volcanic', 'spires', 22569, 540, { verticality:0.75, density:0.45, tier:2, blurb:'Black glass columns that shatter under sustained fire.' }),

  /* ---- Jungle ---- */
  M('overgrowth',  'OVERGROWTH',        'jungle', 'ruins',   23671, 500, { verticality:0.5, density:0.8, blurb:'A reclaimed colony. Thirty metres of visibility and a lot of surprises.' }),
  M('templerun',   'TEMPLE COMPLEX',    'jungle', 'grid',    24782, 480, { verticality:0.6, density:0.7, blurb:'Stepped stone plazas and tight processional avenues.' }),
  M('riverbend',   'RIVER BEND',        'jungle', 'canyon',  25893, 540, { verticality:0.5, density:0.5, hazard:'water', blurb:'A river valley. Wading slows you down and cools you off.' }),
  M('canopy',      'CANOPY PLATFORMS',  'jungle', 'platform',26904, 520, { verticality:0.85, density:0.55, hazard:'fall', tier:2, blurb:'Logging platforms strung between enormous trunks.' }),

  /* ---- Orbital ---- */
  M('station',     'ORBITAL RING',      'orbital', 'platform',27015, 500, { verticality:0.8, density:0.5, hazard:'fall', tier:2, blurb:'Open decks on a habitat ring. The planet turns below you.' }),
  M('shipyard',    'VOID SHIPYARD',     'orbital', 'spires',  28126, 560, { verticality:0.9, density:0.45, hazard:'fall', tier:3, blurb:'Half-built hulls in low gravity. Jumps carry twice as far.', gravity:0.55 }),
  M('docking',     'DOCKING SPINE',     'orbital', 'canyon',  29237, 520, { verticality:0.7, density:0.6, tier:2, blurb:'A kilometre of docking clamps down one central spine.' }),
  M('cargobay',    'CARGO BAY 9',       'orbital', 'foundry', 30348, 420, { verticality:0.55, density:0.85, tier:2, blurb:'Interior hold, mag-locked crates, no sky at all.' }),

  /* ---- Night city ---- */
  M('downtown',    'DOWNTOWN GRID',     'citynight', 'grid',   31459, 540, { verticality:0.7, density:0.85, blurb:'Neon canyons between towers. Corners everywhere, sightlines nowhere.' }),
  M('rooftops',    'ROOFTOP SECTOR',    'citynight', 'platform',32560, 520, { verticality:0.95, density:0.6, hazard:'fall', tier:3, blurb:'Fought entirely above street level. One bad jump ends your mech.' }),
  M('undercity',   'UNDERCITY',         'citynight', 'foundry', 33671, 440, { verticality:0.5, density:0.9, blurb:'Service tunnels under the arcology. Brutally close quarters.' }),
  M('plaza',       'CENTRAL PLAZA',     'citynight', 'basin',   34782, 500, { verticality:0.45, density:0.55, blurb:'An open civic square ringed by terraces. The classic control-point map.' }),

  /* ---- Wasteland ---- */
  M('scrapline',   'SCRAPLINE',         'wasteland', 'ruins',  35893, 520, { verticality:0.5, density:0.75, blurb:'Compacted hulks stacked into walls. Everything here used to be a mech.' }),
  M('craterfield', 'CRATER FIELD',      'wasteland', 'basin',  36904, 560, { verticality:0.4, density:0.4, blurb:'Overlapping bomb craters make rolling cover and terrible footing.' }),
  M('highway',     'BROKEN HIGHWAY',    'wasteland', 'canyon', 37015, 600, { verticality:0.65, density:0.5, blurb:'A collapsed elevated roadway. Fight on it, under it, or through it.' }),
  M('silofield',   'SILO FIELD',        'wasteland', 'spires', 38126, 540, { verticality:0.75, density:0.55, tier:2, blurb:'Missile silos turned cover. Climbable, and they explode.' }),

  /* ---- Abyssal / storm ---- */
  M('trench',      'ABYSSAL TRENCH',    'underwater', 'canyon', 39237, 480, { verticality:0.6, density:0.5, hazard:'water', tier:3, gravity:0.7, blurb:'Deep-sea mining trench. Everything moves slower and hits softer.' }),
  M('seafloor',    'SEAFLOOR ARRAY',    'underwater', 'grid',   40348, 460, { verticality:0.45, density:0.7, hazard:'water', tier:3, gravity:0.7, blurb:'A sensor farm on the abyssal plain, lit only by your own floods.' }),
  M('stormfront',  'STORM FRONT',       'storm', 'dunes',       41459, 600, { verticality:0.35, density:0.35, hazard:'lightning', tier:2, blurb:'Open ground in a supercell. Lightning genuinely does strike the tallest mech.' }),
  M('thunderhead', 'THUNDERHEAD MESA',  'storm', 'spires',      42560, 560, { verticality:0.8, density:0.4, hazard:'lightning', tier:3, blurb:'Rock towers in a permanent electrical storm. Height is power and risk.' }),
];

export const MAP_BY_ID = Object.fromEntries(MAPS.map(m => [m.id, m]));

export function mapsForMode(mode) { return MAPS.filter(m => m.modes.includes(mode)); }
export function randomMap(mode, rng = Math.random) {
  const pool = mapsForMode(mode);
  return pool[Math.floor(rng() * pool.length)];
}
