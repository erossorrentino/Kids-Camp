// Characters you can buy with prize money and play your career as. Each one
// has its own look, lifts every skill (`all`) with bigger boosts to their
// signature skills (`boost`) on top of the skills you've trained,
// and brings special abilities (the same advantage traits the pros have).
// Your own created golfer is always available as "yourself".
import { TRAITS } from './traits.js';
import { generatePros, proById } from './players.js';

export const CHAR_TIERS = {
  rookie: { name: 'Rookie', color: '#7fd05a' },
  pro: { name: 'Pro', color: '#5fb2ff' },
  star: { name: 'Star', color: '#c792ff' },
  legend: { name: 'Legend', color: '#f2c230' },
};

// look fields: shirt, pants, cap (hat colour), skin, hair, gender, hat, hairStyle,
// beard, pattern, accent, vest, shorts, socks, glove, shoe, shades, belt
export const CHARACTERS = [
  {
    id: 'bex', name: 'Birdie Bex', tier: 'rookie', price: 25000,
    tagline: 'Never met a putt she didn’t like.',
    boost: { putting: 7, shortGame: 5 }, all: 4, abilities: ['lag'],
    look: { gender: 'f', shirt: '#ff5fa2', pattern: 'stripes', accent: '#ffffff', pants: '#f1f1f1', hat: 'visor', cap: '#ffffff', hairStyle: 'ponytail', hair: '#d9a441', skin: '#f5d0b5', glove: '#ff5fa2', shoe: '#ff5fa2', belt: '#ffffff' },
  },
  {
    id: 'tank', name: 'Tank Tucker', tier: 'rookie', price: 50000,
    tagline: 'Hits it hard and finds it anywhere.',
    boost: { power: 8, recovery: 4 }, all: 5, abilities: ['rough'],
    look: { gender: 'm', shirt: '#5b6b3a', pattern: 'checks', accent: '#3f4a26', pants: '#2b2d25', hat: 'bucket', cap: '#7a8450', hairStyle: 'short', hair: '#3b2a1f', beard: 'beard', skin: '#d49a73', shoe: '#6b4a2e', belt: '#3b2a1f' },
  },
  {
    id: 'sunny', name: 'Sunny Santos', tier: 'rookie', price: 70000,
    tagline: 'Fairways and sunshine, every day.',
    boost: { accuracy: 7, consistency: 6 }, all: 6, abilities: ['fairway'],
    look: { gender: 'm', shirt: '#ffd23f', pattern: 'solid', pants: '#f1f1f1', shorts: true, socks: '#ffffff', hat: 'visor', cap: '#ffffff', hairStyle: 'curly', hair: '#1e1a18', skin: '#b87d56', shoe: '#ffd23f', belt: '#1d3557' },
  },
  {
    id: 'maple', name: 'Maple McGregor', tier: 'pro', price: 350000,
    tagline: 'Grew up playing in a gale.',
    boost: { wind: 10, irons: 6, mental: 4 }, all: 11, abilities: ['windw'],
    look: { gender: 'm', shirt: '#f1faee', pants: '#6b705c', vest: '#2e6b4f', pattern: 'solid', accent: '#c1121f', hat: 'flat', cap: '#8a6d4d', hairStyle: 'short', hair: '#b5532b', beard: 'mustache', skin: '#f5d0b5', shoe: '#6b4a2e', belt: '#3b2a1f' },
  },
  {
    id: 'kai', name: 'Kai “Spin” Nakamura', tier: 'pro', price: 450000,
    tagline: 'Makes the ball dance on the greens.',
    boost: { irons: 9, shortGame: 8 }, all: 11, abilities: ['spin'],
    look: { gender: 'm', shirt: '#111111', pattern: 'hoops', accent: '#2ec4b6', pants: '#111111', hat: 'cap', cap: '#2ec4b6', hairStyle: 'short', hair: '#111111', skin: '#e8b996', glove: '#111111', shoe: '#2ec4b6', belt: '#2ec4b6' },
  },
  {
    id: 'rosa', name: 'Rosa Relámpago', tier: 'pro', price: 550000,
    tagline: 'Lightning off the tee.',
    boost: { power: 10, accuracy: 5 }, all: 13, abilities: ['bomber'],
    look: { gender: 'f', shirt: '#e63946', pattern: 'hoops', accent: '#ffffff', pants: '#1d3557', hat: 'cap', cap: '#e63946', hairStyle: 'bun', hair: '#2a1a12', skin: '#d49a73', glove: '#ffffff', shoe: '#e63946', belt: '#ffffff' },
  },
  {
    id: 'ace', name: 'Ace Armstrong', tier: 'star', price: 3000000,
    tagline: 'Flag hunter. Aims at the pin, every time.',
    boost: { irons: 10, accuracy: 10, consistency: 5 }, all: 20, abilities: ['darts'],
    look: { gender: 'm', shirt: '#ffffff', pants: '#1d3557', vest: '#1d3557', pattern: 'solid', hat: 'cap', cap: '#ffffff', hairStyle: 'short', hair: '#6b4a2e', shades: true, skin: '#f5d0b5', shoe: '#1d3557', belt: '#c9a227' },
  },
  {
    id: 'luna', name: 'Luna Lark', tier: 'star', price: 3750000,
    tagline: 'Calm as moonlight on a 10-foot putt.',
    boost: { putting: 12, mental: 9, shortGame: 5 }, all: 21, abilities: ['putter', 'iceman'],
    look: { gender: 'f', shirt: '#9d7ad6', pattern: 'argyle', accent: '#f1e6ff', pants: '#2b2d42', hat: 'beanie', cap: '#f1e6ff', hairStyle: 'long', hair: '#e8e2d0', skin: '#f5d0b5', glove: '#9d7ad6', shoe: '#ffffff', belt: '#9d7ad6' },
  },
  {
    id: 'duke', name: 'Duke Dawson', tier: 'star', price: 4500000,
    tagline: 'Reaches every par 5 in two. Yee-haw.',
    boost: { power: 13, recovery: 7, consistency: 4 }, all: 22, abilities: ['bomber', 'par5'],
    look: { gender: 'm', shirt: '#a4161a', pattern: 'checks', accent: '#f1faee', pants: '#3a4a6b', hat: 'cowboy', cap: '#7a5230', hairStyle: 'short', hair: '#6b4a2e', beard: 'beard', skin: '#e8b996', shoe: '#7a5230', belt: '#c9a227' },
  },
  {
    id: 'sandman', name: 'The Sandman', tier: 'legend', price: 14000000,
    tagline: 'Bunkers are just big practice greens.',
    boost: { shortGame: 12, recovery: 12, consistency: 8, putting: 6 }, all: 27, abilities: ['sand', 'magician'],
    look: { gender: 'm', shirt: '#e9dcb4', pattern: 'stripes', accent: '#c8b27a', pants: '#c8b27a', hat: 'bucket', cap: '#f3ead0', hairStyle: 'bald', hair: '#cfc6b0', beard: 'goatee', shades: true, skin: '#8d5a3b', shoe: '#c8b27a', belt: '#6b4a2e' },
  },
  {
    id: 'clutch', name: 'Captain Clutch', tier: 'legend', price: 25000000,
    tagline: 'Wants the last putt to win. Always makes it.',
    boost: { mental: 14, putting: 10, accuracy: 8, irons: 8, consistency: 8 }, all: 29, abilities: ['clutch', 'manager', 'iceman'],
    look: { gender: 'm', shirt: '#111111', vest: '#c9a227', pattern: 'solid', accent: '#c9a227', pants: '#111111', hat: 'cap', cap: '#c9a227', hairStyle: 'short', hair: '#1e1a18', beard: 'stubble', skin: '#6b4029', glove: '#c9a227', shoe: '#c9a227', belt: '#c9a227' },
  },
  {
    id: 'eagle', name: 'Golden Eagle', tier: 'legend', price: 40000000,
    tagline: 'The greatest of all time. Everything, better.',
    boost: { power: 10, accuracy: 10, irons: 10, shortGame: 10, putting: 10, recovery: 8, mental: 8, wind: 8, consistency: 10 }, all: 30, abilities: ['striker', 'darts', 'putter'],
    look: { gender: 'm', shirt: '#ffffff', pattern: 'hoops', accent: '#f2c230', pants: '#ffffff', hat: 'cap', cap: '#f2c230', hairStyle: 'short', hair: '#e8d9a8', shades: true, skin: '#e8b996', glove: '#f2c230', shoe: '#f2c230', belt: '#f2c230' },
  },
];

export const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));

// ---- the tour pros are for sale too ----
// Price by overall rating, log-linear between these anchors
const PRICE_AT = [[56, 12e3], [60, 20e3], [65, 80e3], [70, 300e3], [75, 900e3], [80, 2.5e6], [85, 6.5e6], [90, 16e6], [95, 32e6], [99, 50e6]];
function niceMoney(v) {
  const step = v >= 1e7 ? 5e5 : v >= 1e6 ? 5e4 : v >= 1e5 ? 5e3 : 1e3;
  return Math.round(v / step) * step;
}
export function priceForOvr(ovr) {
  for (let i = 1; i < PRICE_AT.length; i++) {
    const [a, pa] = PRICE_AT[i - 1], [b, pb] = PRICE_AT[i];
    if (ovr <= b) {
      const t = Math.max(0, (ovr - a) / (b - a));
      return niceMoney(Math.exp(Math.log(pa) + t * (Math.log(pb) - Math.log(pa))));
    }
  }
  return 50e6;
}
// Big names cost a little more
export function proPrice(pro) {
  return niceMoney(priceForOvr(pro.ovr) * (pro.star ? 1.25 : 1));
}

// Anything in the players market: a special player or a tour pro
export function marketItem(id) {
  const ch = CHAR_BY_ID[id];
  if (ch) return { id, kind: 'special', name: ch.name, price: ch.price, look: ch.look };
  const p = proById(id);
  if (p) return { id, kind: 'pro', name: p.name, price: proPrice(p), look: p.look, pro: p };
  return null;
}

export function tourPros() {
  return generatePros();
}

// The golfer as they actually play: a special player adds their boost and
// abilities to your skills; a tour pro plays exactly as themselves, with
// their skills, strengths and weaknesses, and their look
export function playAs(g) {
  const pro = g && !CHAR_BY_ID[g.char] && g.char ? proById(g.char) : null;
  if (pro) return { ...g, stats: { ...pro.stats }, traits: [...pro.traits], look: { ...pro.look, gender: pro.gender }, gender: pro.gender, charName: pro.name };
  const ch = g && CHAR_BY_ID[g.char];
  if (!ch) return { ...g, charName: '' };
  const stats = { ...g.stats };
  for (const k of Object.keys(stats)) stats[k] = Math.min(99, stats[k] + charBoostOf(ch, k));
  const traits = [...new Set([...(g.traits || []), ...ch.abilities])];
  return { ...g, stats, traits, look: { ...ch.look }, gender: ch.look.gender, charName: ch.name };
}

// A character lifts every skill by `all`, and their signature skills by more
export function charBoostOf(ch, k) {
  return ch ? (ch.boost[k] || 0) + (ch.all || 0) : 0;
}

export function abilityList(ch) {
  return ch.abilities.map((id) => TRAITS[id]).filter(Boolean);
}
