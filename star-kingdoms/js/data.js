/* Star Kingdoms — static game data: planets, factions, army roster, buildings. */
(function (SK) {
  'use strict';

  /* ==================================================================
     PLANETS
     Each entry drives terrain shape, palette, sky, weather, props,
     enemy faction look, and the territories you fight over.
     ================================================================== */
  const PLANETS = [
    {
      id: 'verdania',
      name: 'Verdania Prime',
      epithet: 'Cradle of the Bloom',
      blurb: 'A humid jungle world of spore-lit canopies and mushroom towers. Your dynasty was founded under its green moons.',
      order: 0,
      unlockCost: 0,
      seed: 1337,
      audioRoot: 98,
      gravity: 1.0,
      faction: {
        id: 'thornguard', name: 'Thornguard Covenant',
        motto: 'The roots remember every trespass.',
        skin: 0x7fbf6a, suit: 0x2f5d3f, trim: 0xc9ff6e, visor: 0xbfff5a, accent: 0xe4ff9a,
        traits: 'Bark-plated infantry that regrow their armour between waves.'
      },
      sky: { top: 0x1d4436, bottom: 0x92d3a0, horizon: 0x5fae82, fog: 0x63ac84, fogNear: 90, fogFar: 430 },
      sun: { color: 0xfff3c4, intensity: 1.25, dir: [0.45, 0.72, 0.3] },
      hemi: { sky: 0x9fe6c4, ground: 0x1c3324, intensity: 0.5 },
      rim: { color: 0x59ffb0, intensity: 0.32 },
      terrain: {
        amp: 24, freq: 0.0062, ridge: 0.28, plateau: 0.0,
        low: 0x27573a, mid: 0x3d7540, high: 0x6fa052, peak: 0xa8c877,
        detail: 0x1f4a2e, water: { level: -13, color: 0x15625c, opacity: 0.8 }
      },
      props: [
        { kind: 'sporeTree', count: 190, minH: -3, maxH: 26, scale: [1.0, 2.3] },
        { kind: 'mushroom', count: 150, minH: -5, maxH: 18, scale: [0.7, 2.0] },
        { kind: 'rock', count: 90, minH: -4, maxH: 30, scale: [0.6, 1.8], color: 0x3c5a42 },
        { kind: 'grassTuft', count: 700, minH: -4, maxH: 22, scale: [0.6, 1.4] }
      ],
      weather: { kind: 'spores', color: 0xcaff8a, count: 900, speed: 0.6, size: 0.55 },
      citadel: {
        id: 'v-citadel', name: 'The Hollow Throne', tier: 3, x: -25, z: -175,
        blurb: 'The Covenant grew their capital inside a dead god-tree. Everything in it is alive and everything in it is angry.',
        warlord: {
          name: 'Marrowking Vell', title: 'Root of the Covenant',
          taunt: 'You walk on my roots, sovereign. They remember.',
          hp: 18000, dmg: 190, range: 9, speed: 3.6, atkRate: 1.1, scale: 3.0,
          abilities: ['slam', 'summon'],
          look: { weapon: 'staff', heavy: true, crest: 'horns', cape: true }
        }
      },
      territories: [
        { id: 'v1', name: 'Hollowroot Basin', tier: 1, x: 0, z: 0, home: true },
        { id: 'v2', name: 'Sporefall Terrace', tier: 1, x: -120, z: -95 },
        { id: 'v3', name: 'The Green Spine', tier: 2, x: 140, z: -70 },
        { id: 'v4', name: 'Mirewater Delta', tier: 2, x: -95, z: 135 },
        { id: 'v5', name: 'Canopy Throne', tier: 3, x: 120, z: 130 }
      ]
    },

    {
      id: 'emberforge',
      name: 'Emberforge',
      epithet: 'The Anvil World',
      blurb: 'Basalt plains split by rivers of slow lava. The Magma Legion smelts its war machines in the open caldera.',
      order: 1,
      unlockCost: 900,
      seed: 4242,
      audioRoot: 73.4,
      gravity: 1.15,
      faction: {
        id: 'magma', name: 'Magma Legion',
        motto: 'Everything burns. We simply choose the order.',
        skin: 0xd9683f, suit: 0x3a1410, trim: 0xff7a1a, visor: 0xffb020, accent: 0xffd166,
        traits: 'Heat-shielded shock troops. Their melee weapons run molten.'
      },
      sky: { top: 0x2a0b0b, bottom: 0xff8a3c, horizon: 0xc23a1c, fog: 0x7a2412, fogNear: 60, fogFar: 380 },
      sun: { color: 0xffb066, intensity: 1.15, dir: [-0.4, 0.5, -0.55] },
      hemi: { sky: 0xd4744a, ground: 0x1e0a06, intensity: 0.45 },
      rim: { color: 0xff5722, intensity: 0.55 },
      terrain: {
        amp: 38, freq: 0.0075, ridge: 0.62, plateau: 0.0,
        low: 0x1d1210, mid: 0x36211c, high: 0x5c342a, peak: 0x8a4a33,
        detail: 0x120a09, water: { level: -16, color: 0xff4a0d, opacity: 1.0, lava: true }
      },
      props: [
        { kind: 'obsidianSpike', count: 210, minH: -8, maxH: 40, scale: [0.9, 2.6] },
        { kind: 'rock', count: 190, minH: -10, maxH: 44, scale: [0.7, 2.4], color: 0x241614 },
        { kind: 'emberVent', count: 70, minH: -11, maxH: 20, scale: [0.8, 1.6] }
      ],
      weather: { kind: 'embers', color: 0xff8a3a, count: 700, speed: 2.2, size: 0.4, rising: true },
      citadel: {
        id: 'e-citadel', name: 'The Forge Crown', tier: 5, x: -30, z: 170,
        blurb: 'A foundry built straight into the caldera wall, where the Legion pours its warmachines still glowing.',
        warlord: {
          name: 'Slagmarshal Orun', title: 'Keeper of the Pour',
          taunt: 'I have melted better crowns than yours.',
          hp: 40000, dmg: 290, range: 13, speed: 3.2, atkRate: 1.3, scale: 3.3,
          abilities: ['slam', 'volley', 'summon'],
          look: { weapon: 'cannon', heavy: true, crest: 'horns', cape: true }
        }
      },
      territories: [
        { id: 'e1', name: 'Cinder Flats', tier: 2, x: -110, z: 60 },
        { id: 'e2', name: 'Slagvent Reach', tier: 2, x: 125, z: 100 },
        { id: 'e3', name: 'The Forge Mouth', tier: 3, x: 20, z: -130 },
        { id: 'e4', name: 'Obsidian Crown', tier: 3, x: -150, z: -120 },
        { id: 'e5', name: 'Caldera Prime', tier: 4, x: 155, z: -40 }
      ]
    },

    {
      id: 'cryovault',
      name: 'Cryovault',
      epithet: 'The Sleeping Moon',
      blurb: 'A frozen moon under permanent aurora. Something enormous is buried beneath the ice, and the Sentinels guard it.',
      order: 2,
      unlockCost: 2600,
      seed: 8181,
      audioRoot: 110,
      gravity: 0.7,
      faction: {
        id: 'frost', name: 'Frost Sentinels',
        motto: 'Stillness is the oldest weapon.',
        skin: 0xbfe6ff, suit: 0x1b3550, trim: 0x64e6ff, visor: 0x9df0ff, accent: 0xe4faff,
        traits: 'Cryo-armoured guardians. Their rounds slow whatever they touch.'
      },
      sky: { top: 0x061428, bottom: 0x9fd8f5, horizon: 0x4b90c4, fog: 0x8fc4e8, fogNear: 80, fogFar: 460 },
      sun: { color: 0xdfeeff, intensity: 1.0, dir: [0.2, 0.5, 0.72] },
      hemi: { sky: 0xa8c8e4, ground: 0x24405a, intensity: 0.55 },
      rim: { color: 0x6affd6, intensity: 0.42 },
      aurora: true,
      terrain: {
        amp: 30, freq: 0.0055, ridge: 0.45, plateau: 0.18,
        low: 0x8fb0c8, mid: 0xb6d0e2, high: 0xd6e9f4, peak: 0xeef8ff,
        detail: 0x8fb4cc, water: { level: -15, color: 0x2e7fa8, opacity: 0.7, ice: true }
      },
      props: [
        { kind: 'iceSpire', count: 220, minH: -6, maxH: 34, scale: [1.0, 3.2] },
        { kind: 'rock', count: 120, minH: -6, maxH: 34, scale: [0.6, 1.9], color: 0x9db8cc },
        { kind: 'frozenPine', count: 130, minH: -4, maxH: 22, scale: [1.0, 2.2] }
      ],
      weather: { kind: 'snow', color: 0xffffff, count: 1400, speed: 1.1, size: 0.35 },
      citadel: {
        id: 'c-citadel', name: 'Vault Zero Gate', tier: 6, x: 30, z: 175,
        blurb: 'Whatever the Sentinels were built to guard is directly beneath this gate. They would rather you never found out.',
        warlord: {
          name: 'Sentinel Prime Hesk', title: 'The Last Watch',
          taunt: 'The sleeper is not yours to wake.',
          hp: 62000, dmg: 330, range: 17, speed: 2.9, atkRate: 1.35, scale: 3.5,
          abilities: ['beam', 'slam', 'summon'],
          look: { weapon: 'cannon', shield: true, heavy: true, crest: 'fin', cape: true }
        }
      },
      territories: [
        { id: 'c1', name: 'Rimefall Shelf', tier: 3, x: 100, z: 80 },
        { id: 'c2', name: 'Glasslake Hollow', tier: 3, x: -130, z: 40 },
        { id: 'c3', name: 'The Shatterfield', tier: 4, x: 40, z: -140 },
        { id: 'c4', name: 'Aurora Gate', tier: 4, x: -90, z: -130 },
        { id: 'c5', name: 'Vault Zero', tier: 5, x: 160, z: -60 }
      ]
    },

    {
      id: 'duskara',
      name: 'Duskara',
      epithet: 'Where Two Suns Set',
      blurb: 'Endless rust dunes and bone-white mesas under a double sunset. The Dune Raiders own every water well worth having.',
      order: 3,
      unlockCost: 6400,
      seed: 2024,
      audioRoot: 87.3,
      gravity: 0.9,
      faction: {
        id: 'dune', name: 'Dune Raiders',
        motto: 'The sand keeps what it takes.',
        skin: 0xc79a6a, suit: 0x6b4a2a, trim: 0xffc247, visor: 0xff8f3a, accent: 0xfff0b8,
        traits: 'Fast hit-and-run raiders on stripped-down hoverbikes.'
      },
      sky: { top: 0x3a1a3f, bottom: 0xffb26b, horizon: 0xe8653f, fog: 0xd08a52, fogNear: 70, fogFar: 400 },
      sun: { color: 0xffc98a, intensity: 1.2, dir: [-0.62, 0.32, 0.4] },
      hemi: { sky: 0xd9a97a, ground: 0x402616, intensity: 0.45 },
      rim: { color: 0xff5fa2, intensity: 0.4 },
      twinSun: true,
      terrain: {
        amp: 26, freq: 0.0042, ridge: 0.2, plateau: 0.55, dunes: true,
        low: 0x8a5c34, mid: 0xb2824c, high: 0xd0a469, peak: 0xe4c896,
        detail: 0x8a5a33, water: null
      },
      props: [
        { kind: 'mesa', count: 55, minH: -2, maxH: 30, scale: [1.6, 4.2] },
        { kind: 'cactusSpire', count: 160, minH: -2, maxH: 24, scale: [0.8, 2.0] },
        { kind: 'rock', count: 170, minH: -4, maxH: 30, scale: [0.6, 2.0], color: 0x8f6135 },
        { kind: 'boneArch', count: 40, minH: -2, maxH: 22, scale: [1.2, 2.6] }
      ],
      weather: { kind: 'sand', color: 0xe8b77a, count: 1100, speed: 3.0, size: 0.45, horizontal: true },
      citadel: {
        id: 'd-citadel', name: 'The Thirst Market', tier: 7, x: -170, z: -30,
        blurb: 'Every well on Duskara is owned by whoever holds this mesa. The Raiders have held it for two hundred years.',
        warlord: {
          name: 'Salt-Queen Ifra', title: 'She Who Owns The Water',
          taunt: 'Out here I decide who drinks. Today, nobody.',
          hp: 84000, dmg: 410, range: 24, speed: 4.6, atkRate: 1.1, scale: 3.2,
          abilities: ['volley', 'summon', 'beam'],
          look: { weapon: 'longrifle', crest: 'halo', cape: true }
        }
      },
      territories: [
        { id: 'd1', name: 'Saltglass Pan', tier: 4, x: -120, z: 110 },
        { id: 'd2', name: 'Rustwind Gully', tier: 4, x: 140, z: 60 },
        { id: 'd3', name: 'The Bone Market', tier: 5, x: -60, z: -120 },
        { id: 'd4', name: 'Mesa Nine', tier: 5, x: 150, z: -120 },
        { id: 'd5', name: 'The Last Well', tier: 6, x: 0, z: 160 }
      ]
    },

    {
      id: 'nyxor',
      name: 'Nyxor',
      epithet: 'The Broken Sky',
      blurb: 'Gravity failed here centuries ago. Islands of black rock hang in a violet void, threaded with singing crystal.',
      order: 4,
      unlockCost: 15000,
      seed: 6669,
      audioRoot: 65.4,
      gravity: 0.55,
      faction: {
        id: 'void', name: 'Void Syndicate',
        motto: 'We did not break the sky. We only kept the pieces.',
        skin: 0xb48cd6, suit: 0x241038, trim: 0xd94fff, visor: 0xff4fd8, accent: 0x7af7ff,
        traits: 'Phase-shifting elites with crystal blades and shield harnesses.'
      },
      sky: { top: 0x0a0418, bottom: 0x4a1d6e, horizon: 0x7b2fa8, fog: 0x2d1244, fogNear: 60, fogFar: 420 },
      sun: { color: 0xe0a6ff, intensity: 0.95, dir: [0.3, 0.6, -0.65] },
      hemi: { sky: 0x6a3cb0, ground: 0x120820, intensity: 0.42 },
      rim: { color: 0x36f0ff, intensity: 0.5 },
      nebula: true,
      terrain: {
        amp: 44, freq: 0.0085, ridge: 0.7, plateau: 0.0, shattered: true,
        low: 0x241539, mid: 0x3d2559, high: 0x5c3880, peak: 0x8a5cc0,
        detail: 0x120820, water: null
      },
      props: [
        { kind: 'crystal', count: 260, minH: -12, maxH: 46, scale: [0.9, 3.0] },
        { kind: 'floatRock', count: 90, minH: 6, maxH: 60, scale: [1.4, 4.0] },
        { kind: 'rock', count: 140, minH: -12, maxH: 46, scale: [0.6, 2.2], color: 0x20152f }
      ],
      weather: { kind: 'motes', color: 0xc46bff, count: 1000, speed: 0.4, size: 0.6 },
      citadel: {
        id: 'n-citadel', name: 'The Broken Crown', tier: 8, x: -30, z: 178,
        blurb: 'The throne that shattered this sky is still up there, and something has been sitting on it the whole time.',
        warlord: {
          name: 'Thessaly the Unmade', title: 'Who Broke The Sky',
          taunt: 'I ended a world by sitting still. Try me.',
          hp: 105000, dmg: 540, range: 20, speed: 5.4, atkRate: 0.95, scale: 3.6,
          abilities: ['beam', 'slam', 'volley', 'summon'],
          look: { weapon: 'staff', heavy: true, crest: 'halo', cape: true }
        }
      },
      territories: [
        { id: 'n1', name: 'Shardfall', tier: 5, x: 110, z: 110 },
        { id: 'n2', name: 'The Hush', tier: 6, x: -140, z: 70 },
        { id: 'n3', name: 'Gravewell Spire', tier: 6, x: 60, z: -150 },
        { id: 'n4', name: 'Chorus Deep', tier: 7, x: -110, z: -120 },
        { id: 'n5', name: 'The Broken Throne', tier: 8, x: 165, z: -30 }
      ]
    }
  ];

  /* ==================================================================
     ARMY — the roster is generated, not hand-listed. Twelve combat
     families, each in seven marks, each in twelve traits, gives 1,008
     distinct units. Family decides the role and the silhouette, mark
     decides the power band and cost, trait decides a real mechanical
     rule. None of it is a reskin: every axis changes how the unit plays.
     ================================================================== */

  const PERKS = {
    rapid: { name: 'Rapid Cycling', desc: '20% less time between attacks.' },
    crit: { name: 'Critical Systems', desc: '18% chance to deal double damage.' },
    pierce: { name: 'Armour Piercing', desc: '+35% damage to heavy and armoured units.' },
    multishot: { name: 'Twin Barrels', desc: 'Every attack fires a second shot for 60%.' },
    tough: { name: 'Reinforced Frame', desc: '+22% health.' },
    guard: { name: 'Guard Protocol', desc: 'Takes 20% less damage from everything.' },
    haste: { name: 'Overdrive Servos', desc: '+22% movement speed.' },
    regen: { name: 'Self Repair', desc: 'Restores 2% of max health every second.' },
    reach: { name: 'Extended Optics', desc: '+28% attack range.' },
    splash: { name: 'Frag Payload', desc: 'Attacks splash in a 4m radius.' },
    chain: { name: 'Arc Conduit', desc: 'Damage arcs to one nearby enemy for 45%.' },
    rally: { name: 'Rally Banner', desc: 'Allies within 14m deal 10% more damage.' },
    overload: { name: 'Launch Surge', desc: 'First attack after deploying hits three times as hard.' },
    siegebreaker: { name: 'Siegebreaker', desc: '+45% damage to enemy keeps.' },
    bulwarkAura: { name: 'Shield Projector', desc: 'Allies within 12m take 15% less damage.' },
    swiftHeal: { name: 'Triage Protocol', desc: 'Healing output raised by 35%.' }
  };
  const PERK_LEVELS = [5, 10, 15, 20];

  /* ---- the twelve families ---------------------------------------- */
  const FAMILIES = [
    {
      id: 'vanguard', name: 'Vanguard', role: 'All-round', barracks: 1,
      hp: 240, dmg: 26, range: 12, speed: 5.2, atkRate: 0.85, count: 1, energy: 3,
      look: { weapon: 'rifle', scale: 1.0 },
      tiers: ['Recruit', 'Trooper', 'Vanguard', 'Centurion', 'Praetor', 'Warlord', 'Ascendant'],
      perks: ['rapid', 'crit', 'pierce', 'multishot'],
      desc: 'Standard-issue rifle infantry. Cheap, steady, never the wrong answer.'
    },
    {
      id: 'lancer', name: 'Lancer', role: 'Fast melee', barracks: 1,
      hp: 180, dmg: 48, range: 2.6, speed: 9.0, atkRate: 0.55, count: 2, energy: 3,
      look: { weapon: 'blade', crest: 'fin', scale: 0.95,
        tint: { mix: 0.5, suit: 0x2f7fa8, accent: 0x6effe0, helmet: 0xdff6ff } },
      tiers: ['Runner', 'Duelist', 'Lancer', 'Bladeswarn', 'Edgelord', 'Stormblade', 'Sundering'],
      perks: ['haste', 'crit', 'chain', 'rapid'],
      desc: 'Paired blade-runners who close distance fast and shred single targets.'
    },
    {
      id: 'bulwark', name: 'Bulwark', role: 'Tank', barracks: 2,
      hp: 900, dmg: 30, range: 3.0, speed: 3.4, atkRate: 1.2, count: 1, energy: 5,
      look: { weapon: 'rifle', shield: true, heavy: true, scale: 1.1,
        tint: { mix: 0.55, suit: 0x3f4a5c, helmet: 0x8d9bab } },
      tiers: ['Shieldman', 'Bracer', 'Bulwark', 'Rampart', 'Aegisward', 'Fortress', 'Immovable'],
      perks: ['tough', 'guard', 'bulwarkAura', 'regen'],
      desc: 'A walking shield wall. Soaks fire so everything behind it lives longer.'
    },
    {
      id: 'longshot', name: 'Longshot', role: 'Ranged glass', barracks: 2,
      hp: 150, dmg: 120, range: 34, speed: 4.2, atkRate: 2.0, count: 1, energy: 4,
      look: { weapon: 'longrifle', crest: 'halo', cape: true, scale: 1.0,
        tint: { mix: 0.55, suit: 0x2a2f46, helmet: 0x5f6880, accent: 0xb98cff } },
      tiers: ['Marksman', 'Sharpshot', 'Longshot', 'Deadeye', 'Farsight', 'Horizon', 'Endless'],
      perks: ['reach', 'pierce', 'crit', 'siegebreaker'],
      desc: 'Hits from across the field for enormous damage. Dies to a stiff breeze.'
    },
    {
      id: 'skitter', name: 'Skitter', role: 'Swarm', barracks: 3,
      hp: 90, dmg: 22, range: 2.2, speed: 10.5, atkRate: 0.45, count: 5, energy: 3,
      look: { weapon: null, tiny: true, crest: 'horns', scale: 0.62,
        tint: { mix: 0.6, suit: 0x4a7a2e, accent: 0xc6ff6a, helmet: 0xd8f0a8 } },
      tiers: ['Mite', 'Chitter', 'Skitter', 'Scurry', 'Infest', 'Plague', 'Devouring'],
      perks: ['haste', 'rapid', 'crit', 'chain'],
      desc: 'Five tiny drones. Individually harmless, collectively a real problem.'
    },
    {
      id: 'rocketeer', name: 'Rocketeer', role: 'Splash', barracks: 3,
      hp: 260, dmg: 90, range: 20, speed: 4.4, atkRate: 1.6, count: 1, energy: 5, splash: 6,
      look: { weapon: 'launcher', scale: 1.05,
        tint: { mix: 0.55, suit: 0x8a4526, accent: 0xffb54a, helmet: 0xffd9a0 } },
      tiers: ['Grenadier', 'Mortarman', 'Rocketeer', 'Barrager', 'Saturation', 'Firestorm', 'Cataclysm'],
      perks: ['splash', 'siegebreaker', 'reach', 'multishot'],
      desc: 'Lobbed warheads that damage everything in the blast. The answer to swarms.'
    },
    {
      id: 'aegis', name: 'Aegis', role: 'Support healer', barracks: 4,
      hp: 300, dmg: 0, range: 14, speed: 5.0, atkRate: 1.0, heal: 55, count: 1, energy: 4,
      look: { weapon: 'beamer', crest: 'halo', cape: true, scale: 1.0,
        tint: { mix: 0.62, suit: 0xdfe9ef, trim: 0x5dffa0, accent: 0x9affc8, helmet: 0xffffff } },
      tiers: ['Orderly', 'Medic', 'Aegis', 'Mender', 'Lifeward', 'Restorer', 'Everlasting'],
      perks: ['swiftHeal', 'reach', 'regen', 'rally'],
      desc: 'Beams health into the most wounded ally in range. Never fires a shot.'
    },
    {
      id: 'colossus', name: 'Colossus', role: 'Heavy siege', barracks: 5,
      hp: 2000, dmg: 150, range: 16, speed: 2.8, atkRate: 1.5, splash: 5, count: 1, energy: 8,
      look: { weapon: 'cannon', heavy: true, crest: 'horns', scale: 1.65,
        tint: { mix: 0.6, suit: 0x2b3038, accent: 0xffc247, helmet: 0x6a5230 } },
      tiers: ['Hauler', 'Breaker', 'Colossus', 'Titan', 'Behemoth', 'Worldbreaker', 'Apocalypse'],
      perks: ['siegebreaker', 'tough', 'splash', 'guard'],
      desc: 'Four metres of siege platform. Slow, expensive, and very hard to stop.'
    },
    {
      id: 'phantom', name: 'Phantom', role: 'Infiltrator', barracks: 4,
      hp: 200, dmg: 86, range: 3.2, speed: 11.0, atkRate: 0.7, count: 1, energy: 4,
      keepDR: 0.55,
      look: { weapon: 'blade', crest: null, cape: true, scale: 0.98,
        tint: { mix: 0.62, suit: 0x241a38, trim: 0xa06bff, accent: 0xd9b0ff, helmet: 0x3a2c56 } },
      tiers: ['Shade', 'Creeper', 'Phantom', 'Nightfall', 'Wraith', 'Eclipse', 'Unseen'],
      perks: ['haste', 'crit', 'overload', 'rapid'],
      desc: 'Runs past the guns. Keep fire barely touches it, and it hits hard from behind.'
    },
    {
      id: 'pyre', name: 'Pyre', role: 'Close burn', barracks: 3,
      hp: 380, dmg: 34, range: 7.5, speed: 4.8, atkRate: 0.4, splash: 4.5, count: 1, energy: 4,
      burn: 0.55,
      look: { weapon: 'launcher', scale: 1.05,
        tint: { mix: 0.6, suit: 0x6e2412, trim: 0xff6a1a, accent: 0xffc46a, helmet: 0xff9a4a } },
      tiers: ['Kindler', 'Scorcher', 'Pyre', 'Immolator', 'Conflagrant', 'Infernal', 'Everburning'],
      perks: ['splash', 'rapid', 'tough', 'chain'],
      desc: 'A short cone of continuous flame that keeps burning after the hit lands.'
    },
    {
      id: 'warden', name: 'Warden', role: 'Field commander', barracks: 5,
      hp: 520, dmg: 40, range: 15, speed: 4.6, atkRate: 1.1, count: 1, energy: 5,
      aura: { dmg: 0.14, dr: 0.10, radius: 14 },
      look: { weapon: 'staff', crest: 'halo', cape: true, scale: 1.12,
        tint: { mix: 0.55, suit: 0x1f4a5c, trim: 0x46e0d0, accent: 0xbfffe8, helmet: 0xcfeef0 } },
      tiers: ['Sergeant', 'Captain', 'Warden', 'Marshal', 'Commander', 'Highlord', 'Sovereign'],
      perks: ['rally', 'bulwarkAura', 'guard', 'regen'],
      desc: 'Fights, but earns its cost by making everything standing near it better.'
    },
    {
      id: 'seraph', name: 'Seraph', role: 'Hover skirmisher', barracks: 6,
      hp: 340, dmg: 66, range: 18, speed: 8.2, atkRate: 0.95, count: 1, energy: 6,
      hover: 4.2,
      look: { weapon: 'rifle', crest: 'fin', cape: true, scale: 1.02,
        tint: { mix: 0.58, suit: 0xe8eef6, trim: 0x8fd0ff, accent: 0xffe9a0, helmet: 0xffffff } },
      tiers: ['Glider', 'Skyward', 'Seraph', 'Highwing', 'Empyrean', 'Celestial', 'Firmament'],
      perks: ['haste', 'multishot', 'reach', 'crit'],
      desc: 'Flies above the ground, ignores the terrain entirely, and is hard to pin down.'
    }
  ];

  /* ---- seven marks ------------------------------------------------- */
  const MARKS = [
    { n: 1, roman: 'I', mul: 1.00, energy: 0, command: 1, rarity: 'Common', cost: 1.0 },
    { n: 2, roman: 'II', mul: 1.30, energy: 0, command: 1, rarity: 'Common', cost: 1.5 },
    { n: 3, roman: 'III', mul: 1.68, energy: 1, command: 2, rarity: 'Uncommon', cost: 2.3 },
    { n: 4, roman: 'IV', mul: 2.15, energy: 1, command: 3, rarity: 'Uncommon', cost: 3.4 },
    { n: 5, roman: 'V', mul: 2.75, energy: 2, command: 5, rarity: 'Rare', cost: 5.1 },
    { n: 6, roman: 'VI', mul: 3.50, energy: 2, command: 7, rarity: 'Epic', cost: 7.6 },
    { n: 7, roman: 'VII', mul: 4.45, energy: 3, command: 9, rarity: 'Legendary', cost: 11.4 }
  ];

  /* ---- twelve traits ----------------------------------------------- */
  const TRAITS = [
    { id: 'std', name: '', lab: 0, hp: 1, dmg: 1, spd: 1, energy: 0,
      desc: 'Standard issue. No modifications.' },
    { id: 'warded', name: 'Warded', lab: 1, hp: 1.25, dmg: 1, spd: 0.92, energy: 0,
      tint: { mix: 0.42, suit: 0x55606e, helmet: 0xb8c2cc },
      desc: '+25% health, 8% slower.' },
    { id: 'ashen', name: 'Ashen', lab: 1, hp: 0.88, dmg: 1.2, spd: 1, energy: 0,
      tint: { mix: 0.42, suit: 0x43201a, trim: 0xff7a3a, accent: 0xffc27a },
      desc: '+20% damage, −12% health.' },
    { id: 'swift', name: 'Swift', lab: 2, hp: 0.9, dmg: 1, spd: 1.3, energy: 0,
      tint: { mix: 0.42, suit: 0x1d5c68, trim: 0x5effd8, accent: 0xc0fff0 },
      desc: '+30% movement speed, −10% health.' },
    { id: 'siege', name: 'Siege', lab: 3, hp: 1.05, dmg: 1, spd: 0.95, energy: 0,
      structMul: 1.55,
      tint: { mix: 0.45, suit: 0x4a4230, trim: 0xffc247, accent: 0xffe6a8 },
      desc: '+55% damage to enemy keeps.' },
    { id: 'leech', name: 'Leech', lab: 4, hp: 1, dmg: 0.95, spd: 1, lifesteal: 0.25,
      tint: { mix: 0.45, suit: 0x3d1f42, trim: 0xff5fd0, accent: 0xffb8ec },
      desc: 'Heals for 25% of the damage it deals.' },
    { id: 'volatile', name: 'Volatile', lab: 4, hp: 0.95, dmg: 1.08, spd: 1.05,
      deathBlast: { dmg: 0.9, radius: 7 },
      tint: { mix: 0.48, suit: 0x5c3a10, trim: 0xff9a1a, accent: 0xfff06a },
      desc: 'Detonates when it dies, damaging everything nearby.' },
    { id: 'frosted', name: 'Frosted', lab: 5, hp: 1.08, dmg: 0.95, spd: 0.96,
      slow: { amount: 0.4, time: 2.2 },
      tint: { mix: 0.5, suit: 0x2a4e6e, trim: 0x9fe8ff, accent: 0xeaffff, helmet: 0xdff2ff },
      desc: 'Attacks slow the target by 40% for 2.2 seconds.' },
    { id: 'veiled', name: 'Veiled', lab: 6, hp: 1, dmg: 1.05, spd: 1.14, keepDR: 0.45,
      tint: { mix: 0.5, suit: 0x241f36, trim: 0x8f7aff, accent: 0xc4b8ff, helmet: 0x4a4266 },
      desc: 'Takes 45% less damage from keep guns, and moves faster.' },
    { id: 'thorned', name: 'Thorned', lab: 6, hp: 1.12, dmg: 1, spd: 0.96, reflect: 0.28,
      tint: { mix: 0.48, suit: 0x2f4a2a, trim: 0x9aff5a, accent: 0xd8ffa8 },
      desc: 'Reflects 28% of melee damage back at the attacker.' },
    { id: 'radiant', name: 'Radiant', lab: 7, hp: 1.05, dmg: 1, spd: 1,
      aura: { dmg: 0.14, dr: 0, radius: 13 },
      tint: { mix: 0.5, suit: 0xf0e6c8, trim: 0xffd76a, accent: 0xfff6d0, helmet: 0xfffbe8 },
      desc: 'Allies within 13m deal 14% more damage.' },
    { id: 'gilded', name: 'Gilded', lab: 8, hp: 1.18, dmg: 1.18, spd: 1.08, energy: 1,
      tint: { mix: 0.55, suit: 0x6e5416, trim: 0xffd24a, accent: 0xfff0b0, helmet: 0xffe9a8 },
      desc: '+18% to health, damage and speed, but costs 1 more energy.' }
  ];

  const RARITY_COLOR = {
    Common: '#9fb0c4', Uncommon: '#5dffa0', Rare: '#35e0ff',
    Epic: '#c46bff', Legendary: '#ffb23f'
  };

  /* ---- generate the roster ----------------------------------------- */
  function buildRoster() {
    const out = [];
    for (let f = 0; f < FAMILIES.length; f++) {
      const fam = FAMILIES[f];
      for (let m = 0; m < MARKS.length; m++) {
        const mk = MARKS[m];
        for (let t = 0; t < TRAITS.length; t++) {
          const tr = TRAITS[t];
          const energy = Math.max(2, Math.min(10, Math.round(fam.energy + mk.energy + (tr.energy || 0))));
          const hp = Math.round(fam.hp * mk.mul * tr.hp);
          const dmg = Math.round(fam.dmg * mk.mul * tr.dmg * 10) / 10;
          const heal = fam.heal ? Math.round(fam.heal * mk.mul) : 0;
          const speed = Math.round(fam.speed * tr.spd * 100) / 100;
          const tierName = fam.tiers[mk.n - 1];
          const name = (tr.name ? tr.name + ' ' : '') + tierName;
          // one score so 1,008 units can be ranked and sorted sensibly
          const dps = (dmg || heal) / fam.atkRate;
          const power = Math.round((hp * 0.35 + dps * 6 + fam.range * 3 + speed * 8) / energy * 10);
          out.push({
            id: fam.id + '-' + mk.n + '-' + tr.id,
            family: fam.id, familyName: fam.name, mark: mk.n, markRoman: mk.roman,
            trait: tr.id, traitName: tr.name, name: name,
            role: fam.role, rarity: mk.rarity, power: power,
            energy: energy, hp: hp, dmg: dmg, heal: heal,
            range: fam.range, speed: speed, atkRate: fam.atkRate,
            count: fam.count, splash: fam.splash || 0, burn: fam.burn || 0,
            hover: fam.hover || 0,
            keepDR: Math.max(fam.keepDR || 0, tr.keepDR || 0),
            structMul: tr.structMul || 1,
            lifesteal: tr.lifesteal || 0,
            deathBlast: tr.deathBlast || null,
            slow: tr.slow || null,
            reflect: tr.reflect || 0,
            aura: tr.aura || fam.aura || null,
            barracks: fam.barracks, command: mk.command, lab: tr.lab,
            perks: fam.perks,
            upgradeBase: Math.round(70 * mk.cost * (1 + fam.energy * 0.08)),
            desc: fam.desc, traitDesc: tr.desc,
            look: fam.look, traitTint: tr.tint || null
          });
        }
      }
    }
    return out;
  }

  const UNITS = buildRoster();
  const UNIT_BY_ID = {};
  UNITS.forEach((u) => { UNIT_BY_ID[u.id] = u; });
  function unit(id) { return UNIT_BY_ID[id] || null; }


  /* ---- trophies: one unique unit for each world you fully conquer ---- */
  const TROPHIES = [
    {
      id: 'trophy-verdania', planet: 'verdania', name: 'Thornborn Warden',
      familyName: 'Thornborn', role: 'Regenerating bruiser', rarity: 'Legendary',
      energy: 6, hp: 3200, dmg: 132, range: 6, speed: 5.4, atkRate: 0.9, count: 1,
      reflect: 0.35, lifesteal: 0.2,
      perks: ['regen', 'tough', 'chain', 'rally'],
      look: { weapon: 'staff', heavy: true, crest: 'horns', cape: true, scale: 1.35,
        tint: { mix: 0.72, suit: 0x2f5d3f, trim: 0xc9ff6e, accent: 0xe4ff9a, helmet: 0x8fbf6a } },
      desc: 'Bark-plated and self-healing. It gives back a third of every melee blow.'
    },
    {
      id: 'trophy-emberforge', planet: 'emberforge', name: 'Magmaheart Reaver',
      familyName: 'Magmaheart', role: 'Burning berserker', rarity: 'Legendary',
      energy: 6, hp: 2100, dmg: 190, range: 3.4, speed: 9.4, atkRate: 0.55, count: 1,
      burn: 1.1, splash: 4, deathBlast: { dmg: 1.4, radius: 10 },
      perks: ['haste', 'crit', 'splash', 'rapid'],
      look: { weapon: 'blade', crest: 'horns', cape: true, scale: 1.2,
        tint: { mix: 0.72, suit: 0x3a1410, trim: 0xff7a1a, accent: 0xffd166, helmet: 0xd9683f } },
      desc: 'Sets everything it touches on fire, then detonates when it finally drops.'
    },
    {
      id: 'trophy-cryovault', planet: 'cryovault', name: 'Rimewarden Sentinel',
      familyName: 'Rimewarden', role: 'Freezing anchor', rarity: 'Legendary',
      energy: 7, hp: 4600, dmg: 96, range: 13, speed: 3.2, atkRate: 1.3, count: 1,
      slow: { amount: 0.55, time: 3 }, aura: { dmg: 0, dr: 0.18, radius: 15 },
      perks: ['guard', 'bulwarkAura', 'tough', 'regen'],
      look: { weapon: 'cannon', shield: true, heavy: true, crest: 'fin', scale: 1.5,
        tint: { mix: 0.72, suit: 0x1b3550, trim: 0x64e6ff, accent: 0xe4faff, helmet: 0xbfe6ff } },
      desc: 'Freezes whatever it hits and hardens every ally standing in its shadow.'
    },
    {
      id: 'trophy-duskara', planet: 'duskara', name: 'Dunestalker Prime',
      familyName: 'Dunestalker', role: 'Assassin', rarity: 'Legendary',
      energy: 5, hp: 1500, dmg: 320, range: 26, speed: 10.2, atkRate: 1.5, count: 1,
      keepDR: 0.7,
      perks: ['crit', 'overload', 'haste', 'pierce'],
      look: { weapon: 'longrifle', crest: null, cape: true, scale: 1.08,
        tint: { mix: 0.72, suit: 0x6b4a2a, trim: 0xffc247, accent: 0xfff0b8, helmet: 0xc79a6a } },
      desc: 'Walks through keep fire untouched and removes one target per shot.'
    },
    {
      id: 'trophy-nyxor', planet: 'nyxor', name: 'Voidcrown Seraph',
      familyName: 'Voidcrown', role: 'Flying commander', rarity: 'Legendary',
      energy: 8, hp: 3400, dmg: 210, range: 22, speed: 8.8, atkRate: 0.95, count: 1,
      hover: 5.5, aura: { dmg: 0.22, dr: 0.1, radius: 16 }, splash: 4,
      perks: ['rally', 'multishot', 'reach', 'crit'],
      look: { weapon: 'staff', crest: 'halo', cape: true, scale: 1.3,
        tint: { mix: 0.72, suit: 0x241038, trim: 0xd94fff, accent: 0x7af7ff, helmet: 0xb48cd6 } },
      desc: 'Hovers above the field and makes the whole army around it hit harder.'
    }
  ];

  TROPHIES.forEach((t) => {
    const dps = t.dmg / t.atkRate;
    UNITS.push(Object.assign({
      family: t.id, mark: 7, markRoman: 'VII', trait: 'trophy', traitName: 'Trophy',
      heal: 0, splash: t.splash || 0, burn: t.burn || 0, hover: t.hover || 0,
      keepDR: t.keepDR || 0, structMul: 1.35, lifesteal: t.lifesteal || 0,
      deathBlast: t.deathBlast || null, slow: t.slow || null, reflect: t.reflect || 0,
      aura: t.aura || null, barracks: 1, command: 1, lab: 0,
      upgradeBase: 1400, traitDesc: 'Taken from a fallen Warlord. Cannot be found any other way.',
      power: Math.round((t.hp * 0.35 + dps * 6 + t.range * 3 + t.speed * 8) / t.energy * 10),
      trophy: t.planet, traitTint: null
    }, t));
    UNIT_BY_ID[t.id] = UNITS[UNITS.length - 1];
  });

  const MAX_LEVEL = 20;
  function unitUpgradeCost(def, level) {
    return Math.round(def.upgradeBase * Math.pow(1.42, level - 1));
  }
  function unitPerksAt(def, level) {
    const got = [];
    for (let i = 0; i < PERK_LEVELS.length; i++) {
      if (level >= PERK_LEVELS[i] && def.perks[i]) got.push(def.perks[i]);
    }
    return got;
  }
  /* Is this unit available given the player's buildings? */
  function unitUnlocked(def, buildings, conquered) {
    if (def.trophy) return !!(conquered && conquered[def.trophy]);
    return (buildings.barracks || 0) >= def.barracks &&
      (buildings.command || 0) >= def.command &&
      (buildings.lab || 0) >= def.lab;
  }

  /* ==================================================================
     KINGDOM BUILDINGS
     ================================================================== */
  const BUILDINGS = [
    {
      id: 'command', name: 'Command Spire', max: 10, baseCost: 260, growth: 1.72,
      icon: 'spire',
      effect: (lv) => 'Empire tier ' + lv + ' · +' + (lv * 6) + '% all resource income',
      desc: 'The seat of your dynasty. Its level caps every other building and sets your empire tier.'
    },
    {
      id: 'mine', name: 'Crystal Mine', max: 12, baseCost: 150, growth: 1.55,
      icon: 'mine', currency: 'crystal',
      effect: (lv) => '+' + (lv * 14) + ' crystal / min',
      desc: 'Bores into the mantle for raw power crystal. Crystal pays for construction.'
    },
    {
      id: 'refinery', name: 'Alloy Refinery', max: 12, baseCost: 180, growth: 1.58,
      icon: 'refinery', currency: 'alloy',
      effect: (lv) => '+' + (lv * 10) + ' alloy / min',
      desc: 'Smelts scavenged hull plate into battle alloy. Alloy pays for your army.'
    },
    {
      id: 'barracks', name: 'War Barracks', max: 6, baseCost: 340, growth: 1.9,
      icon: 'barracks',
      effect: (lv) => 'Unlocks unit tier ' + lv + ' · deck size ' + Math.min(8, 3 + lv),
      desc: 'Every level unlocks a new unit type and widens the deck you carry into battle.'
    },
    {
      id: 'lab', name: 'Research Lab', max: 10, baseCost: 300, growth: 1.8,
      icon: 'lab',
      effect: (lv) => '+' + (lv * 5) + '% army damage and health',
      desc: 'Empire-wide combat doctrine. Buffs every unit you will ever deploy.'
    },
    {
      id: 'reactor', name: 'Fusion Reactor', max: 8, baseCost: 280, growth: 1.75,
      icon: 'reactor',
      effect: (lv) => '+' + (lv * 20) + '% battle energy, +' + Math.round(lv * 1.5) + ' max energy',
      desc: 'Field reactors let you deploy faster and bank more energy. Expensive late-game units are unusable without it.'
    },
    {
      id: 'hangar', name: 'Sky Hangar', max: 8, baseCost: 240, growth: 1.7,
      icon: 'hangar',
      effect: (lv) => '+' + (lv * 7) + '% vehicle speed and boost',
      desc: 'Tunes your hoverbike, hovercar and starship. Pure quality of life, and worth it.'
    },
    {
      id: 'shield', name: 'Aegis Shield', max: 8, baseCost: 380, growth: 1.85,
      icon: 'shield',
      effect: (lv) => '+' + (lv * 10) + '% keep health in battle',
      desc: 'Hardens the Keep you must defend during every territory assault.'
    }
  ];

  /* Enemy archetypes per faction — reskins of the roster with faction flavour. */
  /* Which families each faction fields, and the traits they favour. */
  const ENEMY_UNITS = {
    thornguard: { families: ['vanguard', 'lancer', 'bulwark', 'skitter', 'thorned'],
      traits: ['std', 'thorned', 'warded', 'leech'] },
    magma: { families: ['vanguard', 'lancer', 'rocketeer', 'pyre', 'colossus'],
      traits: ['std', 'ashen', 'volatile', 'siege'] },
    frost: { families: ['bulwark', 'longshot', 'vanguard', 'aegis', 'warden'],
      traits: ['std', 'frosted', 'warded', 'radiant'] },
    dune: { families: ['lancer', 'skitter', 'longshot', 'rocketeer', 'phantom'],
      traits: ['std', 'swift', 'veiled', 'ashen'] },
    void: { families: ['colossus', 'longshot', 'phantom', 'warden', 'seraph'],
      traits: ['std', 'veiled', 'gilded', 'radiant'] }
  };
  // strip the stray family id that is really a trait
  ENEMY_UNITS.thornguard.families = ['vanguard', 'lancer', 'bulwark', 'skitter', 'pyre'];

  /* Territory tier -> enemy strength and reward. */
  function tierStats(tier) {
    return {
      hpMul: 1 + (tier - 1) * 0.26,
      dmgMul: 1 + (tier - 1) * 0.20,
      keepHp: 2000 + (tier - 1) * 900,
      homeKeepHp: 2600 + tier * 520,
      aiInterval: Math.max(3.8, 8.0 - tier * 0.35),
      garrison: 1 + Math.floor(tier * 0.4),
      foeCap: 5 + Math.floor(tier * 0.55),
      reward: { crystal: 180 + tier * 145, alloy: 120 + tier * 110 },
      income: { crystal: 5 + tier * 4, alloy: 4 + tier * 3 }
    };
  }

  /* Citadel assaults are longer, harder set pieces: a real keep, constant
     waves, and a Warlord that has to be brought down personally. */
  function citadelStats(cit) {
    const t = cit.tier;
    return {
      hpMul: 1 + (t - 1) * 0.26,
      dmgMul: 1 + (t - 1) * 0.20,
      keepHp: 3400 + (t - 1) * 1500,
      homeKeepHp: 7500 + t * 1900,
      aiInterval: Math.max(3.6, 7.6 - t * 0.35),
      garrison: 3 + Math.floor(t * 0.4),
      foeCap: 6 + Math.floor(t * 0.55),
      reward: { crystal: 900 + t * 420, alloy: 700 + t * 340 },
      income: { crystal: 22 + t * 6, alloy: 18 + t * 5 }
    };
  }

  SK.data = {
    PLANETS, UNITS, BUILDINGS, ENEMY_UNITS, tierStats, citadelStats,
    FAMILIES, MARKS, TRAITS, PERKS, PERK_LEVELS, RARITY_COLOR,
    unit, unitUpgradeCost, unitPerksAt, unitUnlocked, MAX_LEVEL, UNIT_BY_ID, TROPHIES
  };
})(window.SK);
