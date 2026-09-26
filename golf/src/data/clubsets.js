// Club models. A golfer's bag holds one model per category (driver, fairway
// woods + hybrid, irons, wedges, putter). Every model trades one strength
// for another, the way real equipment does:
//   speed    ball speed off the face (distance)
//   launch   degrees added to launch angle
//   spin     backspin multiplier
//   forgive  0..1, 0.5 = average: shrinks random dispersion and how much a
//            crooked swing hurts (big sweet spot)
//   work     shot-shaping multiplier (how much the Shape control bends it)
//   bias     built-in curve, degrees of spin-axis tilt (- = draw)
//   sand     0..1 share of the bunker penalty removed (negative = worse)
//   rough    0..1 share of the rough penalty removed
//   deck     driver only: hit it off the fairway without the usual penalty
// Putters use aim (start-line error), pace (speed error), nerve (yips help),
// read (putt preview length).

export const CLUB_CATS = {
  driver: { label: 'Driver', clubs: ['DR'] },
  woods: { label: 'Woods & Hybrid', clubs: ['3W', '5W', '4H'] },
  irons: { label: 'Irons', clubs: ['5I', '6I', '7I', '8I', '9I', 'PW'] },
  wedges: { label: 'Wedges', clubs: ['GW', 'SW', 'LW'] },
  putter: { label: 'Putter', clubs: ['PT'] },
};

export const CAT_OF = {};
for (const [cat, v] of Object.entries(CLUB_CATS)) for (const c of v.clubs) CAT_OF[c] = cat;

const D = (o) => ({ speed: 1, launch: 0, spin: 1, forgive: 0.5, work: 1, bias: 0, sand: 0, rough: 0, deck: false, ...o });
const P = (o) => ({ aim: 1, pace: 1, nerve: 0, read: 1, ...o });

export const CLUB_MODELS = [
  // ---------------- drivers ----------------
  D({ id: 'd-starter', cat: 'driver', brand: 'Clubhouse', name: 'Starter 460', price: 0, speed: 0.985, spin: 1.05, forgive: 0.6,
    look: { head: '#2b2f36', crown: '#2b2f36', style: 'wood', size: 1.0 }, pros: ['Free', 'Fairly forgiving'], cons: ['Short', 'A bit spinny'] }),
  D({ id: 'd-rocket', cat: 'driver', brand: 'Velocor', name: 'Rocket 460', price: 65000, speed: 1.02, spin: 0.92, launch: -0.4, forgive: 0.35,
    look: { head: '#1b1d22', crown: '#c8322c', style: 'wood', size: 1.0 }, pros: ['+6 to 8 yds', 'Low spin'], cons: ['Mishits fly offline'] }),
  D({ id: 'd-stable', cat: 'driver', brand: 'Northline', name: 'Stable Max', price: 55000, speed: 0.995, spin: 1.08, launch: 1.0, forgive: 0.88,
    look: { head: '#1d2733', crown: '#2f5ea8', style: 'wood', size: 1.08 }, pros: ['Huge sweet spot', 'Easy high launch'], cons: ['Extra spin balloons into wind'] }),
  D({ id: 'd-draw', cat: 'driver', brand: 'Aimwell', name: 'Draw Bias D', price: 25000, speed: 0.995, forgive: 0.66, bias: -4,
    look: { head: '#23262b', crown: '#2a9d8f', style: 'wood', size: 1.04 }, pros: ['Built-in draw fights a slice'], cons: ['Good swings can hook'] }),
  D({ id: 'd-tour', cat: 'driver', brand: 'Grainline', name: 'TS 8.5° Tour', price: 95000, speed: 1.015, spin: 0.84, launch: -1.4, forgive: 0.28, work: 1.35,
    look: { head: '#101113', crown: '#101113', style: 'wood', size: 0.94 }, pros: ['Piercing low-spin flight', 'Shapes both ways'], cons: ['Unforgiving', 'Needs speed to launch'] }),
  D({ id: 'd-mini', cat: 'driver', brand: 'Velocor', name: 'Mini 300', price: 70000, speed: 0.985, launch: 0.4, forgive: 0.75, deck: true,
    look: { head: '#2b2f36', crown: '#e9c46a', style: 'wood', size: 0.86 }, pros: ['Hit it off the fairway', 'Easy to find the short grass'], cons: ['Shorter off the tee'] }),
  D({ id: 'd-elite', cat: 'driver', brand: 'Velocor', name: 'Rocket LS Limited', price: 1200000, speed: 1.03, spin: 0.9, forgive: 0.58, work: 1.15,
    look: { head: '#0d0e10', crown: '#d9b44a', style: 'wood', size: 1.0 }, pros: ['Longest on tour', 'Forgiving for its speed'], cons: ['Costs a fortune'] }),
  // ---------------- woods & hybrid ----------------
  D({ id: 'w-starter', cat: 'woods', brand: 'Clubhouse', name: 'Starter Woods', price: 0, speed: 0.985, forgive: 0.6,
    look: { head: '#2b2f36', crown: '#2b2f36', style: 'wood', size: 1 }, pros: ['Free'], cons: ['A little short'] }),
  D({ id: 'w-launch', cat: 'woods', brand: 'Northline', name: 'HighLaunch Woods', price: 25000, speed: 0.99, launch: 1.6, forgive: 0.82, spin: 1.05,
    look: { head: '#1d2733', crown: '#2f5ea8', style: 'wood', size: 1.05 }, pros: ['Gets airborne from any lie', 'Lands soft'], cons: ['Less roll'] }),
  D({ id: 'w-tour', cat: 'woods', brand: 'Grainline', name: 'Tour Woods', price: 60000, speed: 1.015, spin: 0.92, forgive: 0.35, work: 1.3,
    look: { head: '#101113', crown: '#101113', style: 'wood', size: 0.95 }, pros: ['Long and workable'], cons: ['Punishes mishits'] }),
  D({ id: 'w-rescue', cat: 'woods', brand: 'Aimwell', name: 'Rescue Hybrids', price: 45000, speed: 1.0, forgive: 0.72, rough: 0.35, launch: 0.6,
    look: { head: '#2b2f36', crown: '#8ac926', style: 'wood', size: 0.95 }, pros: ['Cuts through the rough'], cons: ['Harder to shape'], work: 0.8 }),
  // ---------------- irons ----------------
  D({ id: 'i-starter', cat: 'irons', brand: 'Clubhouse', name: 'Game Improvement', price: 0, speed: 1.0, spin: 0.96, forgive: 0.66, work: 0.9,
    look: { head: '#b8bec6', accent: '#3a86ff', style: 'cavity', size: 1.1 }, pros: ['Free', 'Forgiving'], cons: ['Less spin into greens'] }),
  D({ id: 'i-blade', cat: 'irons', brand: 'Grainline', name: 'MB Blades', price: 90000, speed: 0.99, spin: 1.08, forgive: 0.14, work: 1.5,
    look: { head: '#d7dce2', accent: '#d7dce2', style: 'blade', size: 0.92 }, pros: ['Max spin and control', 'Shape every shot'], cons: ['Tiny sweet spot'] }),
  D({ id: 'i-cavity', cat: 'irons', brand: 'Northline', name: 'CB Cavity Backs', price: 70000, speed: 1.0, spin: 1.03, forgive: 0.55, work: 1.15,
    look: { head: '#c9ced5', accent: '#c1121f', style: 'cavity', size: 1.0 }, pros: ['Balanced feel and forgiveness'], cons: ['No standout strength'] }),
  D({ id: 'i-distance', cat: 'irons', brand: 'Velocor', name: 'Hot Face Distance', price: 80000, speed: 1.035, spin: 0.87, launch: -0.8, forgive: 0.65, work: 0.85,
    look: { head: '#aab1ba', accent: '#f2c230', style: 'cavity', size: 1.08 }, pros: ['About a club longer'], cons: ['Hard to stop on greens'] }),
  D({ id: 'i-sgi', cat: 'irons', brand: 'Aimwell', name: 'Super Game Improvement', price: 60000, speed: 1.015, spin: 0.95, launch: 2.0, forgive: 0.95, work: 0.55,
    look: { head: '#9ea6b0', accent: '#2a9d8f', style: 'cavity', size: 1.2 }, pros: ['Almost impossible to mishit', 'High launch'], cons: ['Barely shapes', 'Balloons in wind'] }),
  D({ id: 'i-forged', cat: 'irons', brand: 'Velocor', name: 'Forged Players Distance', price: 180000, speed: 1.02, spin: 1.0, forgive: 0.6, work: 1.15,
    look: { head: '#cfd4da', accent: '#1b1b1b', style: 'cavity', size: 1.0 }, pros: ['Long, soft, forgiving'], cons: ['Pricey'] }),
  D({ id: 'i-elite', cat: 'irons', brand: 'Grainline', name: 'Tour Forged Limited', price: 900000, speed: 1.012, spin: 1.08, forgive: 0.55, work: 1.35,
    look: { head: '#e3e6ea', accent: '#d9b44a', style: 'blade', size: 0.96 }, pros: ['Tour spin with a forgiving core'], cons: ['Costs a fortune'] }),
  // ---------------- wedges ----------------
  D({ id: 'we-starter', cat: 'wedges', brand: 'Clubhouse', name: 'Starter Wedges', price: 0, forgive: 0.55,
    look: { head: '#b8bec6', style: 'wedge', size: 1 }, pros: ['Free'], cons: ['Average spin'] }),
  D({ id: 'we-spin', cat: 'wedges', brand: 'Northline', name: 'Spin Milled', price: 40000, spin: 1.18, forgive: 0.45,
    look: { head: '#d0d4d9', style: 'wedge', size: 1 }, pros: ['+18% spin: checks and zips back'], cons: ['Less forgiving'] }),
  D({ id: 'we-bounce', cat: 'wedges', brand: 'Aimwell', name: 'High Bounce', price: 20000, spin: 0.96, sand: 0.5, rough: 0.25, forgive: 0.62,
    look: { head: '#9ea6b0', style: 'wedge', size: 1.06 }, pros: ['Glides through sand and rough'], cons: ['A bit less spin'] }),
  D({ id: 'we-tour', cat: 'wedges', brand: 'Grainline', name: 'Low Bounce Tour', price: 55000, spin: 1.1, work: 1.3, sand: -0.2, forgive: 0.4,
    look: { head: '#5d4a3a', style: 'wedge', size: 0.96 }, pros: ['Crisp spin off firm turf', 'Shape your chips'], cons: ['Digs in bunkers'] }),
  D({ id: 'we-elite', cat: 'wedges', brand: 'Velocor', name: 'Raw Forged', price: 400000, spin: 1.15, sand: 0.3, forgive: 0.6, work: 1.15,
    look: { head: '#7a5e44', style: 'wedge', size: 1 }, pros: ['Spin plus bunker help'], cons: ['Costs a fortune'] }),
  // ---------------- putters ----------------
  P({ id: 'p-starter', cat: 'putter', brand: 'Clubhouse', name: 'Classic Blade', price: 0, look: { head: '#8f959c', style: 'blade' }, pros: ['Free'], cons: ['Nothing special'] }),
  P({ id: 'p-mallet', cat: 'putter', brand: 'Northline', name: 'Spider Mallet', price: 25000, aim: 0.68, pace: 1.06,
    look: { head: '#1b1b1b', accent: '#c1121f', style: 'mallet' }, pros: ['Rolls it on your line'], cons: ['Pace a little jumpy'] }),
  P({ id: 'p-milled', cat: 'putter', brand: 'Grainline', name: 'Milled Blade', price: 55000, aim: 1.08, pace: 0.72,
    look: { head: '#c9ced5', style: 'blade' }, pros: ['Dialed-in speed control'], cons: ['Less forgiving on line'] }),
  P({ id: 'p-counter', cat: 'putter', brand: 'Aimwell', name: 'Counterbalanced', price: 60000, aim: 0.85, nerve: 0.7,
    look: { head: '#2b2f36', accent: '#f2c230', style: 'mallet' }, pros: ['Calms the yips and nerves'], cons: ['Heavy, slower feel'] }),
  P({ id: 'p-arm', cat: 'putter', brand: 'Velocor', name: 'Arm-Lock', price: 120000, aim: 0.78, pace: 0.9, read: 1.1,
    look: { head: '#23262b', accent: '#2f5ea8', style: 'mallet' }, pros: ['Steady on line and pace', 'Slightly longer read'], cons: ['Pricey'] }),
  P({ id: 'p-elite', cat: 'putter', brand: 'Grainline', name: 'Tour Circle T', price: 700000, aim: 0.72, pace: 0.72, nerve: 0.4, read: 1.15,
    look: { head: '#d9dde2', accent: '#c1121f', style: 'blade' }, pros: ['The best roll money can buy'], cons: ['Costs a fortune'] }),
];

export const MODEL_BY_ID = Object.fromEntries(CLUB_MODELS.map((m) => [m.id, m]));

export const STARTER_BAG = { driver: 'd-starter', woods: 'w-starter', irons: 'i-starter', wedges: 'we-starter', putter: 'p-starter' };

export function normBag(bag) {
  const b = { ...STARTER_BAG, ...(bag || {}) };
  for (const k of Object.keys(STARTER_BAG)) {
    const m = MODEL_BY_ID[b[k]];
    if (!m || m.cat !== k) b[k] = STARTER_BAG[k];
  }
  return b;
}

// The model that a given club (e.g. '7I') comes from in this bag
export function gearFor(bag, clubId) {
  const b = normBag(bag);
  return MODEL_BY_ID[b[CAT_OF[clubId]]];
}

// Bars for the shop (0-100, 50 = tour average)
export function modelBars(m) {
  const bar = (v, range, invert = false, center = 1) => Math.round(Math.max(0, Math.min(100, 50 + ((invert ? center - v : v - center) / range) * 50)));
  if (m.cat === 'putter') {
    return { 'Aim (start line)': bar(m.aim, 0.35, true), 'Pace control': bar(m.pace, 0.3, true), Nerves: Math.round(50 + m.nerve * 50), 'Read length': bar(m.read, 0.2) };
  }
  const out = { Distance: bar(m.speed, 0.035), Forgiveness: Math.round(m.forgive * 100), Spin: bar(m.spin, 0.18), Shaping: bar(m.work, 0.5) };
  if (m.sand || m.rough) out['Sand / rough'] = Math.round(50 + Math.max(m.sand, m.rough) * 100);
  return out;
}

// Pros get a bag that suits them
export function proBag(arch, rankFrac, pick) {
  const top = rankFrac < 0.15;
  const mid = rankFrac < 0.5;
  const bag = { ...STARTER_BAG };
  const choose = (opts) => pick(opts);
  if (arch === 'bomber') { bag.driver = top ? choose(['d-elite', 'd-tour', 'd-rocket']) : choose(['d-rocket', 'd-tour']); bag.irons = choose(['i-distance', 'i-forged', 'i-cavity']); }
  else if (arch === 'precise') { bag.driver = choose(['d-stable', 'd-mini', 'd-tour']); bag.irons = top ? choose(['i-elite', 'i-blade']) : choose(['i-blade', 'i-cavity']); }
  else if (arch === 'wedge') { bag.wedges = top ? 'we-elite' : choose(['we-spin', 'we-tour']); bag.irons = choose(['i-cavity', 'i-blade']); bag.driver = choose(['d-rocket', 'd-stable']); }
  else if (arch === 'putter') { bag.putter = top ? 'p-elite' : choose(['p-milled', 'p-arm', 'p-mallet']); bag.driver = choose(['d-stable', 'd-rocket']); }
  else if (arch === 'grinder') { bag.driver = choose(['d-stable', 'd-mini', 'd-draw']); bag.wedges = choose(['we-bounce', 'we-spin']); bag.woods = 'w-rescue'; }
  else if (arch === 'legend') { bag.irons = choose(['i-blade', 'i-elite']); bag.putter = choose(['p-milled', 'p-counter']); bag.woods = choose(['w-tour', 'w-launch']); bag.driver = choose(['d-stable', 'd-tour']); }
  else { bag.driver = choose(['d-rocket', 'd-stable', 'd-elite']); bag.irons = choose(['i-cavity', 'i-forged']); }
  if (!mid) {
    // lower-ranked pros often play cheaper gear
    for (const k of Object.keys(bag)) if (pick([true, false, false])) bag[k] = STARTER_BAG[k];
  }
  if (bag.woods === STARTER_BAG.woods && mid) bag.woods = choose(['w-tour', 'w-launch', 'w-rescue']);
  if (bag.wedges === STARTER_BAG.wedges && mid) bag.wedges = choose(['we-spin', 'we-bounce', 'we-tour']);
  if (bag.putter === STARTER_BAG.putter && mid) bag.putter = choose(['p-mallet', 'p-milled', 'p-counter']);
  return bag;
}

// Small scoring effects of a bag for the AI simulation
export function bagSimFx(bag) {
  const b = normBag(bag);
  const d = MODEL_BY_ID[b.driver], i = MODEL_BY_ID[b.irons], w = MODEL_BY_ID[b.wedges], p = MODEL_BY_ID[b.putter];
  return {
    driveYds: (d.speed - 1) * 300,
    fairwayPct: (d.forgive - 0.5) * 0.06,
    ironProx: 1 - (i.forgive - 0.5) * 0.08 - (i.spin - 1) * 0.3,
    scramble: (w.spin - 1) * 0.15 + w.sand * 0.03,
    puttOdds: 1 + (1 - p.aim) * 0.12 + (1 - p.pace) * 0.08,
  };
}
