// Sponsors: companies pay you to wear their logo on your cap and shirt, or
// to put their name on your bag. Better brands come knocking as you climb
// the world ranking. Deals pay every event you play, plus bonuses for
// top-10 finishes and wins, and run to the end of the season.
import { RNG, mixSeed } from '../util/rng.js';

export const BRANDS = [
  { id: 'sprout', name: 'Sprout Sports Drink', short: 'SPROUT', bg: '#7fd05a', fg: '#0b1a13' },
  { id: 'rocket', name: 'Rocket Burgers', short: 'ROCKET', bg: '#e63946', fg: '#ffffff' },
  { id: 'zoom', name: 'Zoom Motors', short: 'ZOOM', bg: '#1d3557', fg: '#f1faee' },
  { id: 'comet', name: 'Comet Watches', short: 'COMET', bg: '#111111', fg: '#f2c230' },
  { id: 'whale', name: 'Blue Whale Bank', short: 'BLUE WHALE', bg: '#3a86ff', fg: '#ffffff' },
  { id: 'galaxy', name: 'Galaxy Phones', short: 'GALAXY', bg: '#6a4c93', fg: '#ffffff' },
  { id: 'thunder', name: 'Thunder Tyres', short: 'THUNDER', bg: '#ffca3a', fg: '#1b1b1b' },
  { id: 'maple', name: 'Maple Crunch Cereal', short: 'MAPLE', bg: '#f4a261', fg: '#3b2a1f' },
  { id: 'pixel', name: 'Pixel Games', short: 'PIXEL', bg: '#ff006e', fg: '#ffffff' },
  { id: 'arctic', name: 'Arctic Air', short: 'ARCTIC', bg: '#90e0ef', fg: '#1d3557' },
  { id: 'nimbus', name: 'Nimbus Sneakers', short: 'NIMBUS', bg: '#f1faee', fg: '#e63946' },
  { id: 'crown', name: 'Crown Jewellers', short: 'CROWN', bg: '#2b2d42', fg: '#e9c46a' },
];
export const BRAND_BY_ID = Object.fromEntries(BRANDS.map((b) => [b.id, b]));

// Deal sizes by the world ranking you need to be offered them
export const SPONSOR_TIERS = [
  { need: 501, name: 'Local', per: [2000, 4000], top10: 5000, win: 20000 },
  { need: 300, name: 'Regional', per: [5000, 8000], top10: 10000, win: 40000 },
  { need: 150, name: 'National', per: [10000, 18000], top10: 20000, win: 90000 },
  { need: 60, name: 'Global', per: [25000, 40000], top10: 40000, win: 200000 },
  { need: 20, name: 'Superstar', per: [60000, 90000], top10: 80000, win: 400000 },
  { need: 5, name: 'Legend', per: [120000, 180000], top10: 150000, win: 800000 },
];
export const SLOTS = { hat: 'Cap & shirt', bag: 'Golf bag' };

// This season's offers for a ranking: two per slot, fixed for the season
export function sponsorOffers(c, rank) {
  const out = [];
  SPONSOR_TIERS.forEach((tier, ti) => {
    if (rank > tier.need) return;
    for (const slot of Object.keys(SLOTS)) {
      const rng = new RNG(mixSeed('sponsor', c.created || 1, c.year, ti, slot));
      for (let k = 0; k < 2; k++) {
        const brand = BRANDS[rng.int(0, BRANDS.length - 1)];
        const per = Math.round(rng.float(tier.per[0], tier.per[1]) / 500) * 500 * (slot === 'bag' ? 0.6 : 1);
        out.push({ key: `${ti}-${slot}-${k}`, tier: ti, tierName: tier.name, slot, brand: brand.id, perEvent: Math.round(per), top10: Math.round(tier.top10 * (slot === 'bag' ? 0.6 : 1)), win: Math.round(tier.win * (slot === 'bag' ? 0.6 : 1)) });
      }
    }
  });
  // best deals first
  return out.sort((a, b) => b.tier - a.tier || b.perEvent - a.perEvent);
}

// What your deals pay for this week's finish (pos null = missed cut)
export function sponsorPay(c, pos) {
  const lines = [];
  for (const [slot, d] of Object.entries(c.sponsors || {})) {
    if (!d) continue;
    const b = BRAND_BY_ID[d.brand];
    let amt = d.perEvent;
    let what = 'event fee';
    if (pos === 1) { amt += d.win; what = 'event fee + win bonus'; }
    else if (pos && pos <= 10) { amt += d.top10; what = 'event fee + top-10 bonus'; }
    lines.push({ slot, name: b.name, what, amount: amt });
  }
  return { total: lines.reduce((a, l) => a + l.amount, 0), lines };
}

// Cap/shirt logo and bag logo for the golfer's look
export function sponsorLook(c) {
  const s = c && c.sponsors;
  if (!s) return {};
  const out = {};
  if (s.hat) { const b = BRAND_BY_ID[s.hat.brand]; out.logo = { text: b.short, bg: b.bg, fg: b.fg }; }
  if (s.bag) { const b = BRAND_BY_ID[s.bag.brand]; out.bagLogo = { text: b.short, bg: b.bg, fg: b.fg }; }
  return out;
}
