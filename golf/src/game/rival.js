// Your rival: a tour pro ranked just ahead of you who turns up at your
// events, talks a lot, and keeps a head-to-head record with you. Pass them
// by enough and a new, better rival steps up.
import { proById } from '../data/players.js';
import { RNG, mixSeed } from '../util/rng.js';

const TAUNTS = [
  'Hope you brought extra balls, {you}. You\'ll need them.',
  'My caddie says you slice it like a bread machine.',
  'I\'ve seen better swings on a playground.',
  'Save me a seat at the prize-giving, {you}. Front row.',
  'Nice hat, {you}. Shame about the putting.',
  'I practise more before breakfast than you do all week.',
  'The trophy already knows my name.',
  'Try not to hit the grandstand this time.',
  'Bet you can\'t reach the fairway from the ladies\' tee.',
  'I\'ll wave to you from the top of the leaderboard.',
  'My dog putts better than you. And he\'s a very good dog.',
  'Is that a golf bag or a lost-and-found box?',
];
const AFTER_WIN = [ // you beat them
  'That was luck. Pure luck.',
  'I had a sore thumb. That\'s the only reason.',
  'Enjoy it while it lasts, {you}.',
  'Fine. You win this time. THIS time.',
  'The wind was clearly on your side.',
];
const AFTER_LOSS = [ // they beat you
  'Told you so. Better luck next week!',
  'Don\'t feel bad, {you}. I\'m just that good.',
  'Want some putting lessons? My rates are very reasonable.',
  'Same time next week? I love winning.',
  'Maybe try the other end of the club, {you}.',
];

function fill(s, you) { return s.replaceAll('{you}', you.split(' ')[0]); }

// A pro a few places above you in the world ranking
export function pickRival(c, rankings, humanId, seed = 0) {
  const rows = rankings.filter((r) => r.id !== humanId && r.id !== c.golfer.char && (!c.rival || r.id !== c.rival.id));
  const me = rankings.find((r) => r.id === humanId);
  const myRank = me ? me.rank : 501;
  const rng = new RNG(mixSeed('rival', c.created || 1, c.year, c.week, seed));
  const lo = Math.max(1, myRank - 45), hi = Math.max(1, myRank - 6);
  let pool = rows.filter((r) => r.rank >= lo && r.rank <= hi);
  if (!pool.length) pool = rows.slice(0, 6);
  const pick = pool[rng.int(0, pool.length - 1)];
  return { id: pick.id, since: `${c.year}-${c.week}`, w: 0, l: 0, t: 0, taunt: fill(rng.pick(TAUNTS), c.golfer.name), last: null };
}

export function rivalTaunt(c, key) {
  const rng = new RNG(mixSeed('taunt', c.created || 1, key));
  return fill(rng.pick(TAUNTS), c.golfer.name);
}

// After an event you both played: who finished ahead?
export function rivalResult(c, res, humanId) {
  const r = c.rival;
  if (!r) return null;
  const me = res.find((x) => x.id === humanId);
  const them = res.find((x) => x.id === r.id);
  if (!me || !them) return null;
  let beat;
  if (me.made !== them.made) beat = me.made ? 1 : -1;
  else beat = me.toPar < them.toPar ? 1 : me.toPar > them.toPar ? -1 : 0;
  if (beat > 0) r.w++; else if (beat < 0) r.l++; else r.t++;
  const rng = new RNG(mixSeed('after', c.created || 1, c.year, c.week));
  const quote = beat > 0 ? fill(rng.pick(AFTER_WIN), c.golfer.name) : beat < 0 ? fill(rng.pick(AFTER_LOSS), c.golfer.name) : 'A tie? I\'ll take that. For now.';
  r.last = { beat, quote, myText: me.posText, theirText: them.posText };
  return { name: proById(r.id).name, id: r.id, beat, quote, me: me.posText, them: them.posText, w: r.w, l: r.l, t: r.t };
}

export function rivalName(c) {
  return c.rival ? proById(c.rival.id).name : '';
}
