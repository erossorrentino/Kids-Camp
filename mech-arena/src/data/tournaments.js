/**
 * TOURNAMENT CIRCUIT
 * ------------------------------------------------------------------
 * A tournament is a fixed run of matches against escalating opposition.
 * You enter with the lance you have, you cannot change it between rounds,
 * and a loss ends the run. Finishing one pays far better than the same
 * number of casual matches and unlocks something you cannot buy.
 *
 * Rounds name a mode and either a specific arena or `null` for a random
 * one, so a circuit has a shape without being the same five maps forever.
 */

export const TOURNAMENTS = [
  {
    id:'rookie', name:'ROOKIE CIRCUIT', tier:1, rank:1,
    entryFee:0, purse:3200, xp:1800,
    blurb:'Three rounds against cadets and line pilots. The circuit everyone starts on.',
    reward:{ kind:'skin', id:'crimson.stripe.gloss', label:'Crimson Lance (Gloss)' },
    rounds:[
      { mode:'duel',  map:'boneyard',  difficulty:'recruit', label:'Opening Duel' },
      { mode:'tdm',   map:null,        difficulty:'recruit', label:'Lance Action' },
      { mode:'tdm',   map:'plaza',     difficulty:'regular', label:'Circuit Final' },
    ],
  },
  {
    id:'regional', name:'REGIONAL TROPHY', tier:2, rank:4,
    entryFee:1500, purse:9000, xp:4200,
    blurb:'Four rounds, three biomes, and an objective match you cannot brawl your way out of.',
    reward:{ kind:'skin', id:'obsidian.chevron.gloss', label:'Obsidian Edge (Chevron)' },
    rounds:[
      { mode:'tdm',     map:'refinery',   difficulty:'regular', label:'Refinery Heat' },
      { mode:'control', map:'oasis',      difficulty:'regular', label:'Basin Control' },
      { mode:'ffa',     map:'scrapline',  difficulty:'veteran', label:'Scrapline Free-For-All' },
      { mode:'tdm',     map:'downtown',   difficulty:'veteran', label:'Regional Final' },
    ],
  },
  {
    id:'national', name:'NATIONAL SERIES', tier:3, rank:8,
    entryFee:4500, purse:22000, xp:9500,
    blurb:'Four rounds against veterans. One of them is Last Lance: your hangar is your lives.',
    reward:{ kind:'mech', id:'quickdraw', label:'QUICKDRAW chassis' },
    rounds:[
      { mode:'control',   map:'caldera',    difficulty:'veteran', label:'Caldera Hold' },
      { mode:'king',      map:'mesa',       difficulty:'veteran', label:'Mesa Hardpoint' },
      { mode:'attrition', map:'glacier',    difficulty:'veteran', label:'Last Lance' },
      { mode:'tdm',       map:'station',    difficulty:'elite',   label:'National Final' },
    ],
  },
  {
    id:'champion', name:'CHAMPIONSHIP', tier:4, rank:13,
    entryFee:12000, purse:56000, xp:22000,
    blurb:'Five rounds against elite pilots, including a Juggernaut match and a rooftop duel.',
    reward:{ kind:'skin', id:'gold.flames.chrome', label:'Aurum Standard (Flame Front, Chrome)' },
    rounds:[
      { mode:'tdm',        map:'shipyard',    difficulty:'elite', label:'Void Shipyard' },
      { mode:'juggernaut', map:'thunderhead', difficulty:'elite', label:'Juggernaut Run' },
      { mode:'duel',       map:'rooftops',    difficulty:'elite', label:'Rooftop Duel' },
      { mode:'control',    map:'undercity',   difficulty:'elite', label:'Undercity Control' },
      { mode:'tdm',        map:'plaza',       difficulty:'ace',   label:'Championship Final' },
    ],
  },
  {
    id:'legend', name:'LEGEND GAUNTLET', tier:5, rank:19,
    entryFee:30000, purse:150000, xp:60000,
    blurb:'Five rounds against aces with no easy draws. Nobody finishes this on their first attempt.',
    reward:{ kind:'mech', id:'direwolf', label:'DIRE WOLF chassis' },
    rounds:[
      { mode:'attrition',  map:'trench',      difficulty:'ace', label:'Abyssal Attrition' },
      { mode:'ffa',        map:'obsidianfld', difficulty:'ace', label:'Obsidian Free-For-All' },
      { mode:'king',       map:'avalanche',   difficulty:'ace', label:'Avalanche Hardpoint' },
      { mode:'juggernaut', map:'craterfield', difficulty:'ace', label:'Juggernaut Gauntlet' },
      { mode:'tdm',        map:null,          difficulty:'ace', label:'The Gauntlet Final' },
    ],
  },
];

export const TOURNAMENT_BY_ID = Object.fromEntries(TOURNAMENTS.map(t => [t.id, t]));

/**
 * Some rounds name an arena that does not exist as a map id (they were
 * written as flavour). Resolve those to a random legal arena for the mode
 * rather than crashing or silently falling back to the same map.
 */
export function resolveRoundMap(round, mapsForMode, rng = Math.random) {
  if (round.map) return round.map;
  const pool = mapsForMode(round.mode);
  return pool.length ? pool[Math.floor(rng() * pool.length)].id : null;
}
