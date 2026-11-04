// Clubs are calibrated to published tour-average launch monitor numbers
// (ball speed, launch angle, backspin) so a "tour average" swing (speed
// factor 1.0, 100% power) produces tour-average carries. A bag holds 14
// clubs, as the Rules of Golf allow.

const MPH = 0.44704;

export const CLUBS = [
  { id: 'DR', name: 'Driver',        short: 'DR', kind: 'wood',   loft: 10.5, speed: 167 * MPH, launch: 10.9, spin: 2686,  length: 1.14 },
  { id: '3W', name: '3 Wood',        short: '3W', kind: 'wood',   loft: 15,   speed: 158 * MPH, launch: 9.6,  spin: 3655,  length: 1.07 },
  { id: '5W', name: '5 Wood',        short: '5W', kind: 'wood',   loft: 18,   speed: 152 * MPH, launch: 9.9,  spin: 4350,  length: 1.05 },
  { id: '4H', name: '4 Hybrid',      short: '4H', kind: 'hybrid', loft: 21,  speed: 146 * MPH, launch: 10.4, spin: 4437,  length: 1.01 },
  { id: '5I', name: '5 Iron',        short: '5i', kind: 'iron',   loft: 25,   speed: 132 * MPH, launch: 12.1, spin: 5361,  length: 0.97 },
  { id: '6I', name: '6 Iron',        short: '6i', kind: 'iron',   loft: 28,   speed: 127 * MPH, launch: 14.1, spin: 6231,  length: 0.955 },
  { id: '7I', name: '7 Iron',        short: '7i', kind: 'iron',   loft: 32,   speed: 120 * MPH, launch: 16.3, spin: 7097,  length: 0.94 },
  { id: '8I', name: '8 Iron',        short: '8i', kind: 'iron',   loft: 36,   speed: 115 * MPH, launch: 18.1, spin: 7998,  length: 0.925 },
  { id: '9I', name: '9 Iron',        short: '9i', kind: 'iron',   loft: 40,   speed: 109 * MPH, launch: 20.4, spin: 8647,  length: 0.915 },
  { id: 'PW', name: 'Pitching Wedge', short: 'PW', kind: 'wedge', loft: 45,   speed: 102 * MPH, launch: 24.2, spin: 9304,  length: 0.905 },
  { id: 'GW', name: 'Gap Wedge',     short: 'GW', kind: 'wedge',  loft: 50,   speed: 95 * MPH,  launch: 27.5, spin: 9700,  length: 0.895 },
  { id: 'SW', name: 'Sand Wedge',    short: 'SW', kind: 'wedge',  loft: 56,   speed: 87 * MPH,  launch: 31.0, spin: 10000, length: 0.89 },
  { id: 'LW', name: 'Lob Wedge',     short: 'LW', kind: 'wedge',  loft: 60,   speed: 78 * MPH,  launch: 35.0, spin: 10200, length: 0.885 },
  { id: 'PT', name: 'Putter',        short: 'PT', kind: 'putter', loft: 3,    speed: 0,         launch: 1.5,  spin: 0,     length: 0.86 },
];

export const CLUB_BY_ID = Object.fromEntries(CLUBS.map((c) => [c.id, c]));

// Ball parameters are multipliers on the reference physics.
//   speed   ball speed off the face (distance)
//   spinD   backspin on driver / woods (less spin = more roll, less curve)
//   spinW   backspin on irons / wedges (stopping power on greens)
//   side    how much a mis-hit curves (hook / slice)
//   drag    aerodynamic drag (lower = better into the wind)
//   lift    trajectory height
//   wind    how much wind moves the ball
//   putt    putting consistency (higher = truer roll)
//   soft    >0 helps slower swings, hurts fast swings (compression)
export const BALLS = [
  {
    id: 'range', name: 'Practice Range', brand: 'Clubhouse', price: 0,
    speed: 0.965, spinD: 1.08, spinW: 0.86, side: 1.12, drag: 1.06, lift: 1.0, wind: 1.1, putt: 0.9, soft: 0,
    pros: ['Free'], cons: ['Short', 'Curves more', 'Weak stopping power'],
  },
  {
    id: 'tourbal', name: 'Tour Balance', brand: 'Northline', price: 0,
    speed: 1.0, spinD: 1.0, spinW: 1.0, side: 1.0, drag: 1.0, lift: 1.0, wind: 1.0, putt: 1.0, soft: 0,
    pros: ['No weaknesses', 'Tour-average numbers'], cons: ['No standout strength'],
  },
  {
    id: 'distmax', name: 'Distance Max 2', brand: 'Velocor', price: 45000,
    speed: 1.022, spinD: 0.82, spinW: 0.8, side: 0.9, drag: 0.99, lift: 0.97, wind: 0.95, putt: 0.95, soft: 0,
    pros: ['+5 to 8 yds off the tee', 'Low spin, rolls out'], cons: ['Hard to stop on greens', 'Firm putting feel'],
  },
  {
    id: 'spinpro', name: 'Spin Control Pro', brand: 'Northline', price: 60000,
    speed: 0.99, spinD: 1.12, spinW: 1.22, side: 1.15, drag: 1.0, lift: 1.03, wind: 1.05, putt: 1.05, soft: 0,
    pros: ['Wedges check and spin back', 'Soft feel on greens'], cons: ['Hooks and slices curve more', 'Slightly shorter'],
  },
  {
    id: 'straight', name: 'Straight Shot', brand: 'Aimwell', price: 35000,
    speed: 0.985, spinD: 0.92, spinW: 0.9, side: 0.58, drag: 1.0, lift: 0.98, wind: 0.95, putt: 0.95, soft: 0,
    pros: ['Hooks and slices curve 40% less'], cons: ['Can’t shape shots much', 'Less stopping power'],
  },
  {
    id: 'windcut', name: 'Wind Cutter', brand: 'Velocor', price: 80000,
    speed: 1.0, spinD: 0.95, spinW: 0.95, side: 0.95, drag: 0.93, lift: 0.9, wind: 0.72, putt: 1.0, soft: 0,
    pros: ['Wind moves it 28% less', 'Piercing flight'], cons: ['Lower flight lands hotter'],
  },
  {
    id: 'softfeel', name: 'Soft Feel 60', brand: 'Clubhouse', price: 25000,
    speed: 1.0, spinD: 0.95, spinW: 0.97, side: 0.92, drag: 1.0, lift: 1.02, wind: 1.02, putt: 1.08, soft: 1,
    pros: ['Extra distance for slow swings', 'Soft putting feel'], cons: ['Loses distance for big hitters'],
  },
  {
    id: 'hilaunch', name: 'High Launch Lite', brand: 'Aimwell', price: 55000,
    speed: 1.005, spinD: 1.0, spinW: 1.05, side: 1.0, drag: 1.01, lift: 1.13, wind: 1.22, putt: 1.0, soft: 0.5,
    pros: ['High carry, lands soft', 'Easy to stop on firm greens'], cons: ['Balloons in the wind'],
  },
  {
    id: 'puttpro', name: 'Putter’s Choice', brand: 'Grainline', price: 70000,
    speed: 0.99, spinD: 1.02, spinW: 1.04, side: 1.02, drag: 1.0, lift: 1.0, wind: 1.0, putt: 1.3, soft: 0,
    pros: ['Truest roll on the greens'], cons: ['Slightly shorter off the tee'],
  },
  {
    id: 'links', name: 'Links Runner', brand: 'Grainline', price: 50000,
    speed: 1.005, spinD: 0.9, spinW: 0.88, side: 0.93, drag: 0.95, lift: 0.9, wind: 0.82, putt: 1.0, soft: 0,
    pros: ['Low and running, good in wind', 'Great on firm courses'], cons: ['Won’t hold soft greens'],
  },
  {
    id: 'urethane', name: 'Tour Urethane X', brand: 'Northline', price: 250000,
    speed: 1.012, spinD: 0.95, spinW: 1.12, side: 0.94, drag: 0.98, lift: 1.0, wind: 0.95, putt: 1.1, soft: 0,
    pros: ['Long and spinny', 'Tour-level all-rounder'], cons: ['Expensive'],
  },
  {
    id: 'elite', name: 'Elite Tour Limited', brand: 'Velocor', price: 1500000,
    speed: 1.022, spinD: 0.9, spinW: 1.15, side: 0.85, drag: 0.96, lift: 1.0, wind: 0.85, putt: 1.15, soft: 0,
    pros: ['Best ball on tour', 'Long, straight, spinny'], cons: ['Costs a fortune'],
  },
];

export const BALL_BY_ID = Object.fromEntries(BALLS.map((b) => [b.id, b]));

// Ball ratings for the shop bars (0-100, where 50 is tour average)
export function ballBars(b) {
  const bar = (v, range, invert = false) => {
    const d = (invert ? 1 - v : v - 1) / range;
    return Math.round(Math.max(0, Math.min(100, 50 + d * 50)));
  };
  return {
    Distance: bar(b.speed, 0.025),
    'Green Spin': bar(b.spinW, 0.22),
    Straightness: bar(b.side, 0.42, true),
    'Wind Control': bar(b.wind, 0.28, true),
    Putting: bar(b.putt, 0.3),
  };
}
