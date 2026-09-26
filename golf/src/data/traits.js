// Traits are the advantages / disadvantages that make each pro play
// differently. Every trait works in BOTH places a pro can appear:
//   - the AI scoring simulation (fields named for the sim: driveYds, fairwayPct...)
//   - when YOU play as that pro, through the physics / swing (speedDrive, driverErr...)

export const TRAITS = {
  // ---- advantages ----
  bomber:    { name: 'Bomber', kind: 'adv', desc: '+12 yds off the tee', fx: { driveYds: 12, speedDrive: 1.035 } },
  fairway:   { name: 'Fairway Finder', kind: 'adv', desc: '+8% fairways hit; driver misses curve 30% less', fx: { fairwayPct: 0.08, driverErr: 0.7 } },
  darts:     { name: 'Dart Thrower', kind: 'adv', desc: 'Approach shots finish 15% closer; iron misses 25% smaller', fx: { ironProx: 0.85, ironErr: 0.75 } },
  magician:  { name: 'Short-Game Magician', kind: 'adv', desc: '+8% up-and-downs; chips and pitches 35% tighter', fx: { scramble: 0.08, chipErr: 0.65 } },
  sand:      { name: 'Sand Wizard', kind: 'adv', desc: 'Bunker shots lose half the usual distance penalty', fx: { bunker: 0.5 } },
  putter:    { name: 'Putting Machine', kind: 'adv', desc: 'Holes more putts; putt preview line 50% longer', fx: { puttOdds: 1.25, puttPreview: 1.5 } },
  clutch:    { name: 'Clutch Performer', kind: 'adv', desc: 'Raises their game in contention on the final day', fx: { pressure: 1 } },
  windw:     { name: 'Wind Whisperer', kind: 'adv', desc: 'Wind moves the ball 35% less', fx: { wind: 0.65 } },
  bounce:    { name: 'Bounce-Back', kind: 'adv', desc: 'Birdie chance goes up right after a bogey', fx: { bounceBack: 1 } },
  streaky:   { name: 'Birdie Streaks', kind: 'adv', desc: 'Birdies come in bunches', fx: { streak: 1 } },
  links:     { name: 'Links Specialist', kind: 'adv', desc: 'Extra sharp on links and seaside courses', fx: { styleBonus: { Links: 1, Coastal: 1 } } },
  home:      { name: 'Home Hero', kind: 'adv', desc: 'Plays better at courses in their home country', fx: { home: 1 } },
  spin:      { name: 'Spin Doctor', kind: 'adv', desc: '+15% backspin with irons and wedges', fx: { spinMult: 1.15, ironProx: 0.95 } },
  striker:   { name: 'Pure Striker', kind: 'adv', desc: 'Dialed distance control: 25% less random dispersion', fx: { dispersion: 0.75, ironProx: 0.93 } },
  rough:     { name: 'Rough Rider', kind: 'adv', desc: 'Loses 40% less from the rough', fx: { rough: 0.6 } },
  par5:      { name: 'Par-5 Predator', kind: 'adv', desc: 'Reaches par 5s in two far more often', fx: { par5: 1 } },
  manager:   { name: 'Course Manager', kind: 'adv', desc: 'Rarely makes double bogey', fx: { blowup: 0.6 } },
  lag:       { name: 'Lag Master', kind: 'adv', desc: 'Almost never three-putts', fx: { lag: 0.6 } },
  iceman:    { name: 'Ice in the Veins', kind: 'adv', desc: 'No nerves over the closing holes', fx: { pressure: 0.6, lateFade: -0.5 } },
  // ---- disadvantages ----
  short:     { name: 'Short Hitter', kind: 'dis', desc: '-12 yds off the tee', fx: { driveYds: -12, speedDrive: 0.965 } },
  wild:      { name: 'Wild Driver', kind: 'dis', desc: '-10% fairways; driver misses curve 40% more', fx: { fairwayPct: -0.1, driverErr: 1.4 } },
  yips:      { name: 'The Yips', kind: 'dis', desc: 'Can twitch and miss short putts', fx: { shortPuttMiss: 0.07, yips: 1 } },
  choker:    { name: 'Choker', kind: 'dis', desc: 'Wilts under pressure when in contention', fx: { pressure: -1 } },
  hothead:   { name: 'Hot Head', kind: 'dis', desc: 'After a bogey, the next hole gets harder', fx: { hotHead: 1 } },
  windh:     { name: 'Hates the Wind', kind: 'dis', desc: 'Wind moves the ball 30% more', fx: { wind: 1.3 } },
  sandphob:  { name: 'Bunker Phobia', kind: 'dis', desc: 'Bunker shots lose 60% more distance', fx: { bunker: 1.6 } },
  slowstart: { name: 'Slow Starter', kind: 'dis', desc: 'Struggles over the first three holes', fx: { slowStart: 1 } },
  hook:      { name: 'Hook Prone', kind: 'dis', desc: 'Every full shot drifts left', fx: { shapeBias: -4, fairwayPct: -0.03 } },
  slice:     { name: 'Slice Prone', kind: 'dis', desc: 'Every full shot drifts right', fx: { shapeBias: 4, fairwayPct: -0.03 } },
  tires:     { name: 'Tires Late', kind: 'dis', desc: 'Loses sharpness over the last five holes', fx: { lateFade: 1 } },
  roughh:    { name: 'Rough Hater', kind: 'dis', desc: 'Loses 50% more from the rough', fx: { rough: 1.5 } },
  blowup:    { name: 'Blow-Up Prone', kind: 'dis', desc: 'Double bogeys sneak onto the card', fx: { blowup: 1.6 } },
  threeputt: { name: 'Three-Putt Risk', kind: 'dis', desc: 'Lag putts finish well past or short', fx: { lag: 1.5 } },
  fastfear:  { name: 'Fast Green Fear', kind: 'dis', desc: 'Putting suffers when greens run fast', fx: { fastGreens: 1 } },
};

export const TRAIT_IDS = Object.keys(TRAITS);

// Merge a list of trait ids into one effect bundle with neutral defaults.
export function traitEffects(ids = []) {
  const fx = {
    driveYds: 0, speedDrive: 1, fairwayPct: 0, driverErr: 1, ironProx: 1, ironErr: 1,
    scramble: 0, chipErr: 1, bunker: 1, puttOdds: 1, puttPreview: 1, pressure: 0, wind: 1,
    bounceBack: 0, streak: 0, styleBonus: {}, home: 0, spinMult: 1, dispersion: 1, rough: 1,
    par5: 0, blowup: 1, lag: 1, lateFade: 0, shortPuttMiss: 0, yips: 0, hotHead: 0,
    slowStart: 0, shapeBias: 0, fastGreens: 0,
  };
  const mult = new Set(['speedDrive', 'driverErr', 'ironProx', 'ironErr', 'chipErr', 'bunker', 'puttOdds', 'puttPreview', 'wind', 'spinMult', 'dispersion', 'rough', 'blowup', 'lag']);
  for (const id of ids) {
    const t = TRAITS[id];
    if (!t) continue;
    for (const [k, v] of Object.entries(t.fx)) {
      if (k === 'styleBonus') Object.assign(fx.styleBonus, v);
      else if (mult.has(k)) fx[k] *= v;
      else fx[k] += v;
    }
  }
  return fx;
}
