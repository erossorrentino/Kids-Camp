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
     ARMY — deployable units, Clash-Royale style cards.
     energy = deploy cost during a battle (bar refills over time)
     ================================================================== */
  const UNITS = [
    {
      id: 'trooper', name: 'Vanguard Trooper', role: 'All-round',
      energy: 3, hp: 240, dmg: 26, range: 12, speed: 5.2, atkRate: 0.85, count: 1,
      build: 'trooper', barracks: 1, upgradeBase: 90,
      desc: 'Standard-issue rifle infantry. Cheap, steady, never the wrong answer.'
    },
    {
      id: 'lancer', name: 'Pulse Lancer', role: 'Fast melee',
      energy: 3, hp: 180, dmg: 48, range: 2.6, speed: 9.0, atkRate: 0.55, count: 2,
      build: 'lancer', barracks: 1, upgradeBase: 110,
      desc: 'Two blade-runners who close distance fast and shred single targets.'
    },
    {
      id: 'bulwark', name: 'Bulwark', role: 'Tank',
      energy: 5, hp: 900, dmg: 30, range: 3.0, speed: 3.4, atkRate: 1.2, count: 1,
      build: 'bulwark', barracks: 2, upgradeBase: 180,
      desc: 'Walking shield wall. Soaks fire so everything behind it lives longer.'
    },
    {
      id: 'sniper', name: 'Longshot', role: 'Ranged glass',
      energy: 4, hp: 150, dmg: 120, range: 34, speed: 4.2, atkRate: 2.0, count: 1,
      build: 'sniper', barracks: 2, upgradeBase: 200,
      desc: 'Hits from across the field for enormous damage. Dies to a stiff breeze.'
    },
    {
      id: 'swarm', name: 'Skitter Pack', role: 'Swarm',
      energy: 3, hp: 90, dmg: 22, range: 2.2, speed: 10.5, atkRate: 0.45, count: 5,
      build: 'swarm', barracks: 3, upgradeBase: 160,
      desc: 'Five tiny drones. Individually harmless, collectively a problem.'
    },
    {
      id: 'rocketeer', name: 'Rocketeer', role: 'Splash',
      energy: 5, hp: 260, dmg: 90, range: 20, speed: 4.4, atkRate: 1.6, count: 1,
      splash: 6, build: 'rocketeer', barracks: 3, upgradeBase: 260,
      desc: 'Lobbed warheads that damage everything in the blast. Answers swarms.'
    },
    {
      id: 'medic', name: 'Aegis Medic', role: 'Support',
      energy: 4, hp: 300, dmg: 0, range: 14, speed: 5.0, atkRate: 1.0, heal: 55,
      count: 1, build: 'medic', barracks: 4, upgradeBase: 300,
      desc: 'Beams health into the most wounded ally in range. Never fires a shot.'
    },
    {
      id: 'warbot', name: 'Colossus Warbot', role: 'Heavy',
      energy: 8, hp: 2000, dmg: 150, range: 16, speed: 2.8, atkRate: 1.5, splash: 5,
      count: 1, build: 'warbot', barracks: 5, upgradeBase: 520,
      desc: 'Four metres of siege platform. Slow, expensive, and very hard to stop.'
    }
  ];

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
      effect: (lv) => '+' + (lv * 8) + '% battle energy regeneration',
      desc: 'Field reactors let you deploy units faster once the shooting starts.'
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
  const ENEMY_UNITS = {
    thornguard: ['trooper', 'lancer', 'bulwark', 'swarm'],
    magma: ['trooper', 'lancer', 'rocketeer', 'bulwark'],
    frost: ['bulwark', 'sniper', 'trooper', 'medic'],
    dune: ['lancer', 'swarm', 'sniper', 'rocketeer'],
    void: ['warbot', 'sniper', 'lancer', 'medic', 'bulwark']
  };

  /* Territory tier -> enemy strength and reward. */
  function tierStats(tier) {
    return {
      hpMul: 1 + (tier - 1) * 0.26,
      dmgMul: 1 + (tier - 1) * 0.20,
      keepHp: 2000 + (tier - 1) * 900,
      homeKeepHp: 1800 + tier * 260,
      aiInterval: Math.max(3.4, 7.6 - tier * 0.42),
      garrison: 1 + Math.floor(tier * 0.4),
      foeCap: 5 + Math.floor(tier * 0.8),
      reward: { crystal: 180 + tier * 145, alloy: 120 + tier * 110 },
      income: { crystal: 5 + tier * 4, alloy: 4 + tier * 3 }
    };
  }

  SK.data = { PLANETS, UNITS, BUILDINGS, ENEMY_UNITS, tierStats };
})(window.SK);
