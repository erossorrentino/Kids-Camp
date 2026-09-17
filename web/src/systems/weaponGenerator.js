import { mulberry32, pick, randRange } from '../utils/rng.js';
import { WEAPONS } from '../config.js';

// Every variant is a reskin/retune of one of the 5 hand-modeled archetypes
// (see entities/gun.js) — same shape, procedurally varied name/finish/stats,
// exactly like the 500-entry mission pool is procedural targets layered on a
// handful of `kind`s (see missionGenerator.js). Buying one from a GUN_SHOP
// (see ShopManager.getShopItems) re-tunes and re-tints that archetype's
// inventory slot rather than adding a 6th weapon slot.
const ARCHETYPES = ['pistol', 'rifle', 'shotgun', 'rocket', 'railgun'];

const PREFIXES = [
  'Vypr', 'Hornet', 'Reaper', 'Widow', 'Talon', 'Ghost', 'Ronin', 'Nomad', 'Cobra', 'Havoc',
  'Judge', 'Specter', 'Blackout', 'Rampart', 'Warden', 'Fenrir', 'Basilisk', 'Kestrel', 'Marauder', 'Onyx',
  'Vanta', 'Cinder', 'Wraith', 'Grudge', 'Longtooth', 'Ironclad', 'Nightfall', 'Rustbelt', 'Deadbolt', 'Sable',
];
const SUFFIXES = [
  'Mk.II', 'Custom', 'Tactical', 'Elite', 'Compact', 'Longslide', 'Silenced', 'Combat', 'Urban', 'Stealth',
  'Precision', 'Overwatch', 'Street', 'Cartel', 'Midnight', 'Chrome', 'Carbon', 'Signature', 'Bootleg', 'Prototype',
  'Heavy', 'Rapid', 'Ported', 'Match Grade', 'Blackmarket', 'Syndicate',
];
const TINTS = [
  0x2b2d30, 0x8a1010, 0x1a5a8a, 0xd4af37, 0x33d6ff, 0x2a2a2a, 0x556b2f,
  0xaaaaaa, 0xff6a00, 0x9a2fd9, 0x0e3f0e, 0xffffff, 0x7a1fa2, 0x0e1826,
];

// Deterministic (fixed seed) so the catalog is stable across reloads/plays.
export function generateWeaponVariants(count = 1000, seed = 445566) {
  const rng = mulberry32(seed);
  const list = [];
  for (let i = 0; i < count; i++) {
    const tier = i / count;
    const archetype = ARCHETYPES[i % ARCHETYPES.length]; // even spread: 200 of each
    const base = WEAPONS.find((w) => w.id === archetype);
    const qualityMul = 0.85 + tier * 0.7 + randRange(rng, -0.08, 0.08);
    const price = Math.round((250 + tier * tier * 220000) * randRange(rng, 0.85, 1.2) / 5) * 5;

    list.push({
      id: `GUN_${String(i + 1).padStart(4, '0')}`,
      archetype,
      name: `${pick(rng, PREFIXES)} ${pick(rng, SUFFIXES)}`,
      tint: pick(rng, TINTS),
      price,
      damage: Math.max(1, Math.round(base.damage * qualityMul)),
      fireRate: +(base.fireRate * randRange(rng, 0.9, 1.15)).toFixed(2),
      maxAmmo: Math.max(1, Math.round(base.maxAmmo * randRange(rng, 0.9, 1.3))),
      spread: +Math.max(0.0008, base.spread * randRange(rng, 0.75, 1.05)).toFixed(4),
      pellets: base.pellets,
      projectile: base.projectile,
      projectileSpeed: base.projectileSpeed,
      splashRadius: base.splashRadius,
      blastDamage: base.blastDamage ? Math.round(base.blastDamage * qualityMul) : undefined,
      pierce: base.pierce,
    });
  }
  return list;
}

// A short one-line stat summary shown in the shop row so a bought gun isn't
// a total mystery ("RIFLE-class · DMG 31 · RATE 8.4/s").
export function describeWeaponVariant(v) {
  return `${v.archetype.toUpperCase()}-class · DMG ${v.damage} · RATE ${v.fireRate}/s`;
}
