/**
 * RARITY
 * ------------------------------------------------------------------
 * Every weapon and every chassis carries one of five rarities, read
 * straight off its tier. The rule a player can rely on:
 *
 *   rarer is better, and rarer costs more.
 *
 * "Costs more" is strict, not a tendency: prices are laid out in bands so
 * that every Rare is dearer than every Common, every Epic dearer than every
 * Rare, and so on. Within a band, the bigger and stronger item is dearer.
 *
 * "Better" is `power`, a damage multiplier a weapon of that rarity gets on
 * top of its archetype. Chassis are already graded by tier -- a Mythic
 * assault has four times a Common light's armour -- so for them rarity is
 * the label and the price band, not an extra multiplier.
 */

export const RARITIES = [
  { id: 'common',    name: 'Common',    tier: 1, stars: 1, color: '#b9c6d2', glow: 'rgba(185,198,210,.35)', power: 1.00,
    weaponBand: [0, 2400],      mechBand: [0, 5000] },
  { id: 'rare',      name: 'Rare',      tier: 2, stars: 2, color: '#3fa9ff', glow: 'rgba(63,169,255,.45)',  power: 1.07,
    weaponBand: [3000, 7500],   mechBand: [6000, 13000] },
  { id: 'epic',      name: 'Epic',      tier: 3, stars: 3, color: '#b35cff', glow: 'rgba(179,92,255,.5)',   power: 1.15,
    weaponBand: [8500, 16000],  mechBand: [15000, 24000] },
  { id: 'legendary', name: 'Legendary', tier: 4, stars: 4, color: '#ffb13b', glow: 'rgba(255,177,59,.55)',  power: 1.24,
    weaponBand: [18000, 32000], mechBand: [26000, 38000] },
  { id: 'mythic',    name: 'Mythic',    tier: 5, stars: 5, color: '#ff4d6d', glow: 'rgba(255,77,109,.55)',  power: 1.34,
    weaponBand: [36000, 60000], mechBand: [40000, 60000] },
];

export const RARITY_BY_ID = Object.fromEntries(RARITIES.map(r => [r.id, r]));

/** @param {number} tier 1..5 */
export function rarityForTier(tier) {
  const t = Math.max(1, Math.min(5, Math.round(tier || 1)));
  return RARITIES[t - 1];
}

/**
 * Lay prices out in rarity bands. Items keep their relative order within a
 * band (bigger, stronger, later in the ladder costs more), and anything that
 * was free stays free -- the starter kit is not for sale.
 *
 * @param {Array<{rarity:string, cost:number}>} items mutated in place
 * @param {'weaponBand'|'mechBand'} bandKey
 */
export function bandPrices(items, bandKey) {
  for (const r of RARITIES) {
    const group = items.filter(i => i.rarity === r.id && i.cost > 0).sort((a, b) => a.cost - b.cost);
    const [lo, hi] = r[bandKey];
    const floor = Math.max(lo, 100);
    group.forEach((item, i) => {
      const t = group.length > 1 ? i / (group.length - 1) : 0.5;
      item.cost = Math.round((floor + (hi - floor) * t) / 100) * 100;
    });
  }
}
