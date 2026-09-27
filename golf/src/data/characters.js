// Characters you can buy with prize money and play your career as. Each one
// has its own look, lifts every skill (`all`) with bigger boosts to their
// signature skills (`boost`) on top of the skills you've trained,
// and brings special abilities (the same advantage traits the pros have).
// Your own created golfer is always available as "yourself".
import { TRAITS } from './traits.js';

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
    boost: { putting: 7, shortGame: 5 }, all: 2, abilities: ['lag'],
    look: { gender: 'f', shirt: '#ff5fa2', pattern: 'stripes', accent: '#ffffff', pants: '#f1f1f1', hat: 'visor', cap: '#ffffff', hairStyle: 'ponytail', hair: '#d9a441', skin: '#f5d0b5', glove: '#ff5fa2', shoe: '#ff5fa2', belt: '#ffffff' },
  },
  {
    id: 'tank', name: 'Tank Tucker', tier: 'rookie', price: 60000,
    tagline: 'Hits it hard and finds it anywhere.',
    boost: { power: 8, recovery: 4 }, all: 2, abilities: ['rough'],
    look: { gender: 'm', shirt: '#5b6b3a', pattern: 'checks', accent: '#3f4a26', pants: '#2b2d25', hat: 'bucket', cap: '#7a8450', hairStyle: 'short', hair: '#3b2a1f', beard: 'beard', skin: '#d49a73', shoe: '#6b4a2e', belt: '#3b2a1f' },
  },
  {
    id: 'sunny', name: 'Sunny Santos', tier: 'rookie', price: 90000,
    tagline: 'Fairways and sunshine, every day.',
    boost: { accuracy: 7, consistency: 6 }, all: 2, abilities: ['fairway'],
    look: { gender: 'm', shirt: '#ffd23f', pattern: 'solid', pants: '#f1f1f1', shorts: true, socks: '#ffffff', hat: 'visor', cap: '#ffffff', hairStyle: 'curly', hair: '#1e1a18', skin: '#b87d56', shoe: '#ffd23f', belt: '#1d3557' },
  },
  {
    id: 'maple', name: 'Maple McGregor', tier: 'pro', price: 250000,
    tagline: 'Grew up playing in a gale.',
    boost: { wind: 10, irons: 6, mental: 4 }, all: 3, abilities: ['windw'],
    look: { gender: 'm', shirt: '#f1faee', pants: '#6b705c', vest: '#2e6b4f', pattern: 'solid', accent: '#c1121f', hat: 'flat', cap: '#8a6d4d', hairStyle: 'short', hair: '#b5532b', beard: 'mustache', skin: '#f5d0b5', shoe: '#6b4a2e', belt: '#3b2a1f' },
  },
  {
    id: 'kai', name: 'Kai “Spin” Nakamura', tier: 'pro', price: 400000,
    tagline: 'Makes the ball dance on the greens.',
    boost: { irons: 9, shortGame: 8 }, all: 3, abilities: ['spin'],
    look: { gender: 'm', shirt: '#111111', pattern: 'hoops', accent: '#2ec4b6', pants: '#111111', hat: 'cap', cap: '#2ec4b6', hairStyle: 'short', hair: '#111111', skin: '#e8b996', glove: '#111111', shoe: '#2ec4b6', belt: '#2ec4b6' },
  },
  {
    id: 'rosa', name: 'Rosa Relámpago', tier: 'pro', price: 600000,
    tagline: 'Lightning off the tee.',
    boost: { power: 10, accuracy: 5 }, all: 3, abilities: ['bomber'],
    look: { gender: 'f', shirt: '#e63946', pattern: 'hoops', accent: '#ffffff', pants: '#1d3557', hat: 'cap', cap: '#e63946', hairStyle: 'bun', hair: '#2a1a12', skin: '#d49a73', glove: '#ffffff', shoe: '#e63946', belt: '#ffffff' },
  },
  {
    id: 'ace', name: 'Ace Armstrong', tier: 'star', price: 1200000,
    tagline: 'Flag hunter. Aims at the pin, every time.',
    boost: { irons: 10, accuracy: 10, consistency: 5 }, all: 5, abilities: ['darts'],
    look: { gender: 'm', shirt: '#ffffff', pants: '#1d3557', vest: '#1d3557', pattern: 'solid', hat: 'cap', cap: '#ffffff', hairStyle: 'short', hair: '#6b4a2e', shades: true, skin: '#f5d0b5', shoe: '#1d3557', belt: '#c9a227' },
  },
  {
    id: 'luna', name: 'Luna Lark', tier: 'star', price: 2000000,
    tagline: 'Calm as moonlight on a 10-foot putt.',
    boost: { putting: 12, mental: 9, shortGame: 5 }, all: 5, abilities: ['putter', 'iceman'],
    look: { gender: 'f', shirt: '#9d7ad6', pattern: 'argyle', accent: '#f1e6ff', pants: '#2b2d42', hat: 'beanie', cap: '#f1e6ff', hairStyle: 'long', hair: '#e8e2d0', skin: '#f5d0b5', glove: '#9d7ad6', shoe: '#ffffff', belt: '#9d7ad6' },
  },
  {
    id: 'duke', name: 'Duke Dawson', tier: 'star', price: 3000000,
    tagline: 'Reaches every par 5 in two. Yee-haw.',
    boost: { power: 13, recovery: 7, consistency: 4 }, all: 5, abilities: ['bomber', 'par5'],
    look: { gender: 'm', shirt: '#a4161a', pattern: 'checks', accent: '#f1faee', pants: '#3a4a6b', hat: 'cowboy', cap: '#7a5230', hairStyle: 'short', hair: '#6b4a2e', beard: 'beard', skin: '#e8b996', shoe: '#7a5230', belt: '#c9a227' },
  },
  {
    id: 'sandman', name: 'The Sandman', tier: 'legend', price: 6000000,
    tagline: 'Bunkers are just big practice greens.',
    boost: { shortGame: 12, recovery: 12, consistency: 8, putting: 6 }, all: 7, abilities: ['sand', 'magician'],
    look: { gender: 'm', shirt: '#e9dcb4', pattern: 'stripes', accent: '#c8b27a', pants: '#c8b27a', hat: 'bucket', cap: '#f3ead0', hairStyle: 'bald', hair: '#cfc6b0', beard: 'goatee', shades: true, skin: '#8d5a3b', shoe: '#c8b27a', belt: '#6b4a2e' },
  },
  {
    id: 'clutch', name: 'Captain Clutch', tier: 'legend', price: 10000000,
    tagline: 'Wants the last putt to win. Always makes it.',
    boost: { mental: 14, putting: 10, accuracy: 8, irons: 8, consistency: 8 }, all: 9, abilities: ['clutch', 'manager', 'iceman'],
    look: { gender: 'm', shirt: '#111111', vest: '#c9a227', pattern: 'solid', accent: '#c9a227', pants: '#111111', hat: 'cap', cap: '#c9a227', hairStyle: 'short', hair: '#1e1a18', beard: 'stubble', skin: '#6b4029', glove: '#c9a227', shoe: '#c9a227', belt: '#c9a227' },
  },
  {
    id: 'eagle', name: 'Golden Eagle', tier: 'legend', price: 15000000,
    tagline: 'The greatest of all time. Everything, better.',
    boost: { power: 10, accuracy: 10, irons: 10, shortGame: 10, putting: 10, recovery: 8, mental: 8, wind: 8, consistency: 10 }, all: 12, abilities: ['striker', 'darts', 'putter'],
    look: { gender: 'm', shirt: '#ffffff', pattern: 'hoops', accent: '#f2c230', pants: '#ffffff', hat: 'cap', cap: '#f2c230', hairStyle: 'short', hair: '#e8d9a8', shades: true, skin: '#e8b996', glove: '#f2c230', shoe: '#f2c230', belt: '#f2c230' },
  },
];

export const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));

// The golfer as they actually play: your trained stats plus the active
// character's boost and abilities, wearing the character's look
export function playAs(g) {
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
