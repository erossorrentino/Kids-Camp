// 100 championship courses across 8 styles. Each course stores its routing
// (par, yardage, stroke index, seed per hole); the hole generator builds the
// actual terrain, hazards, and greens from those seeds on demand.
import { RNG, clamp } from '../util/rng.js';

// Visual + gameplay personality of each course style
export const STYLES = {
  Parkland: {
    desc: 'Tree-lined fairways, lush grass, ponds and classic bunkering.',
    colors: { fairway: '#69ab3f', rough: '#3b7428', deep: '#2c5a1f', green: '#6fb043', fringe: '#5fa33a', sand: '#e8dcb5', tee: '#62a53e', far: '#2e5a22', water: '#2c5f6e' },
    terrain: { amp: 3.5, freq: 1 / 150, elev: 12 }, trees: { density: 1.0, kinds: ['oak', 'oak', 'pine', 'birch'] },
    water: 0.35, bunkers: [3, 6], fairwayWidth: [13, 19], firm: 0.45, stimp: 12, wind: [2, 12], scenery: 'hills', fog: '#b9cbd6',
  },
  Links: {
    desc: 'Firm, rumpled seaside ground, deep pot bunkers and wind off the sea.',
    colors: { fairway: '#9aa954', rough: '#7c8a44', deep: '#b8a768', green: '#86a447', fringe: '#8ea44b', sand: '#d9c9a0', tee: '#8fa44d', far: '#8a8a52', water: '#3b6475' },
    terrain: { amp: 2.4, freq: 1 / 60, elev: 6 }, trees: { density: 0.04, kinds: ['bush'] },
    water: 0.08, bunkers: [4, 9], potBunkers: true, fairwayWidth: [15, 22], firm: 0.85, stimp: 10.5, wind: [8, 24], scenery: 'ocean', fog: '#c6cfd3', fescue: true,
  },
  Desert: {
    desc: 'Emerald fairways carved through sand and rock, with cacti waiting in the waste areas.',
    colors: { fairway: '#6aa841', rough: '#4f8a33', deep: '#d8b98a', green: '#72b548', fringe: '#62a83d', sand: '#f0dfb8', tee: '#6aa841', far: '#c9a574', water: '#2f7d8c' },
    terrain: { amp: 4, freq: 1 / 130, elev: 16 }, trees: { density: 0.35, kinds: ['cactus', 'cactus', 'palm'] },
    water: 0.25, bunkers: [3, 6], fairwayWidth: [14, 20], firm: 0.7, stimp: 12.5, wind: [3, 14], scenery: 'mesas', fog: '#e3cfae', waste: true,
  },
  Mountain: {
    desc: 'Big elevation changes, thin air and alpine pines under snowy peaks.',
    colors: { fairway: '#5b9a3b', rough: '#3d7429', deep: '#2d5b20', green: '#6bab44', fringe: '#5c9f38', sand: '#e6dcc0', tee: '#5f9e3c', far: '#35602a', water: '#3a6f8a' },
    terrain: { amp: 5.5, freq: 1 / 180, elev: 26 }, trees: { density: 1.1, kinds: ['pine', 'pine', 'pine', 'birch'] },
    water: 0.3, bunkers: [2, 5], fairwayWidth: [14, 20], firm: 0.5, stimp: 11.5, wind: [2, 14], scenery: 'alps', fog: '#c3d3e0', altitude: 1600,
  },
  Coastal: {
    desc: 'Clifftop holes along the ocean with ocean carries and ocean winds.',
    colors: { fairway: '#63a241', rough: '#4a8231', deep: '#3a6a28', green: '#71b247', fringe: '#62a53c', sand: '#efe3c2', tee: '#64a33f', far: '#4a7a33', water: '#256a86' },
    terrain: { amp: 3.5, freq: 1 / 140, elev: 12 }, trees: { density: 0.35, kinds: ['cypress', 'pine', 'bush'] },
    water: 0.35, bunkers: [3, 6], fairwayWidth: [14, 20], firm: 0.6, stimp: 12, wind: [6, 20], scenery: 'ocean', fog: '#c8d8e0',
  },
  Forest: {
    desc: 'Narrow corridors cut through tall pines, where accuracy beats power.',
    colors: { fairway: '#4f9235', rough: '#387026', deep: '#2b5a1e', green: '#62a63d', fringe: '#539935', sand: '#e0d6b5', tee: '#529535', far: '#244a1a', water: '#2d5563' },
    terrain: { amp: 4, freq: 1 / 150, elev: 14 }, trees: { density: 1.6, kinds: ['pine', 'pine', 'oak'] },
    water: 0.25, bunkers: [2, 5], fairwayWidth: [11, 16], firm: 0.45, stimp: 11.5, wind: [0, 8], scenery: 'hills', fog: '#aebfb0',
  },
  Tropical: {
    desc: 'Palm-fringed resort holes, turquoise lagoons and trade winds.',
    colors: { fairway: '#5fae3e', rough: '#43902e', deep: '#347524', green: '#70bc49', fringe: '#5eae3b', sand: '#f7efd6', tee: '#62ae3f', far: '#3e7f2a', water: '#1f8fa0' },
    terrain: { amp: 3, freq: 1 / 140, elev: 9 }, trees: { density: 0.55, kinds: ['palm', 'palm', 'palm', 'bush'] },
    water: 0.55, bunkers: [3, 7], fairwayWidth: [15, 21], firm: 0.4, stimp: 11, wind: [5, 17], scenery: 'ocean', fog: '#cde3e6',
  },
  Heathland: {
    desc: 'Sandy soil, purple heather rough and scattered birch and pine.',
    colors: { fairway: '#7fa648', rough: '#6b8a3c', deep: '#7a5a73', green: '#7caf4a', fringe: '#76a445', sand: '#e3d3a8', tee: '#7aa447', far: '#56653a', water: '#3c6070' },
    terrain: { amp: 3.2, freq: 1 / 110, elev: 9 }, trees: { density: 0.6, kinds: ['birch', 'pine', 'pine'] },
    water: 0.12, bunkers: [3, 7], fairwayWidth: [13, 19], firm: 0.7, stimp: 11.5, wind: [3, 14], scenery: 'hills', fog: '#c7c9c4', heather: true,
  },
};

const LOCATIONS = {
  Parkland: [['Georgia', 'USA'], ['Ohio', 'USA'], ['New York', 'USA'], ['Pennsylvania', 'USA'], ['Surrey', 'ENG'], ['Bavaria', 'GER'], ['Chiba', 'JPN'], ['Ontario', 'CAN'], ['Kildare', 'IRL'], ['Milan', 'ITA'], ['Gyeonggi', 'KOR'], ['Victoria', 'AUS'], ['Texas', 'USA'], ['Madrid', 'ESP']],
  Links: [['Fife', 'SCO'], ['Ayrshire', 'SCO'], ['East Lothian', 'SCO'], ['County Antrim', 'NIR'], ['County Kerry', 'IRL'], ['Lancashire', 'ENG'], ['Kent', 'ENG'], ['Tasmania', 'AUS'], ['Jutland', 'DEN'], ['Oregon', 'USA']],
  Desert: [['Arizona', 'USA'], ['Nevada', 'USA'], ['Dubai', 'UAE'], ['Abu Dhabi', 'UAE'], ['California', 'USA'], ['Baja California', 'MEX'], ['Utah', 'USA']],
  Mountain: [['Colorado', 'USA'], ['Valais', 'SUI'], ['Tyrol', 'AUT'], ['Alberta', 'CAN'], ['British Columbia', 'CAN'], ['Hokkaido', 'JPN'], ['Queenstown', 'NZL'], ['Montana', 'USA']],
  Coastal: [['California', 'USA'], ['Western Cape', 'RSA'], ['Algarve', 'POR'], ['New South Wales', 'AUS'], ['South Carolina', 'USA'], ['Normandy', 'FRA'], ['Hawke’s Bay', 'NZL'], ['Nova Scotia', 'CAN']],
  Forest: [['North Carolina', 'USA'], ['Black Forest', 'GER'], ['Stockholm', 'SWE'], ['Michigan', 'USA'], ['Wisconsin', 'USA'], ['Karuizawa', 'JPN'], ['Oslo', 'NOR'], ['Belgium', 'BEL']],
  Tropical: [['Hawaii', 'USA'], ['Phuket', 'THA'], ['Riviera Maya', 'MEX'], ['Mauritius', 'MRI'], ['Bali', 'INA'], ['Florida', 'USA'], ['Dominican Republic', 'DOM'], ['Fiji', 'FIJ'], ['Jeju', 'KOR']],
  Heathland: [['Surrey', 'ENG'], ['Berkshire', 'ENG'], ['Utrecht', 'NED'], ['Hamburg', 'GER'], ['Lower Saxony', 'GER'], ['Melbourne Sandbelt', 'AUS'], ['Brabant', 'BEL']],
};

const NAME_PARTS = {
  Parkland: { a: ['Oak', 'Willow', 'Cedar', 'Maple', 'Chestnut', 'Elm', 'Laurel', 'Brook', 'Hawthorn', 'Magnolia', 'Aspen', 'Silver', 'Crooked', 'Old'], b: ['Hollow', 'Park', 'Creek', 'Valley', 'Ridge', 'Hills', 'Run', 'Grove', 'Meadows', 'Brook'], c: ['Country Club', 'Golf Club', 'National', 'Golf & CC'] },
  Links: { a: ['Royal', 'Old', 'Kings', 'St. Colm’s', 'Castle', 'North', 'Western', 'Machrie', 'Carrick', 'Dunraven', 'Ballyshane', 'Gull'], b: ['Dunes', 'Strand', 'Head', 'Point', 'Sands', 'Bay', 'Firth', 'Links', 'Shore'], c: ['Links', 'Golf Links', 'Golf Club'] },
  Desert: { a: ['Saguaro', 'Red Mesa', 'Copper', 'Sandstone', 'Coyote', 'Dune', 'Sun', 'Mirage', 'Ocotillo', 'Scorpion', 'Falcon'], b: ['Canyon', 'Ridge', 'Wells', 'Springs', 'Rock', 'Trail', 'Flats', 'Pass'], c: ['Golf Club', 'Desert Course', 'Golf Resort'] },
  Mountain: { a: ['Eagle', 'Summit', 'Glacier', 'Timberline', 'Silver Peak', 'Alpine', 'Elk', 'Crestone', 'Snowmass', 'High'], b: ['Ridge', 'Lodge', 'Pass', 'Meadow', 'Peak', 'Basin', 'Heights'], c: ['Golf Club', 'Mountain Course', 'Club'] },
  Coastal: { a: ['Cypress', 'Pelican', 'Seal', 'Lighthouse', 'Cliffside', 'Harbor', 'Surf', 'Whale', 'Tern', 'Albatross'], b: ['Point', 'Bluffs', 'Cove', 'Cliffs', 'Bay', 'Head', 'Shores'], c: ['Golf Links', 'Golf Club', 'Ocean Course'] },
  Forest: { a: ['Whispering', 'Tall', 'Black', 'Hidden', 'Longleaf', 'Deer', 'Owl', 'Bear', 'Fox', 'Timber'], b: ['Pines', 'Woods', 'Forest', 'Hollow', 'Glen', 'Timbers', 'Run'], c: ['Golf Club', 'Club', 'National'] },
  Tropical: { a: ['Coral', 'Lagoon', 'Palm', 'Mango', 'Turtle', 'Blue', 'Hibiscus', 'Paradise', 'Orchid', 'Reef'], b: ['Bay', 'Beach', 'Cove', 'Isle', 'Point', 'Sands', 'Grove'], c: ['Resort Course', 'Golf Club', 'Plantation Course'] },
  Heathland: { a: ['Heather', 'Gorse', 'Sunning', 'Wood', 'Swinley', 'Walton', 'Fern', 'Bracken', 'Kingswood', 'Hollin'], b: ['Hill', 'Heath', 'Common', 'Down', 'Wood', 'Moor', 'Lea'], c: ['Golf Club', 'Heath Club', 'Golf Club (Old)'] },
};

const DESIGNERS = ['A. W. Tillinghurst', 'Harry Coltrane', 'Donald Rossmore', 'Alister MacKinley', 'Pete Dyson', 'Tom Fazzio', 'Robert Trent Joyce', 'Old Tom Morrow', 'C. B. Macdonnell', 'Bill Coorey & Ben Crenshore', 'Gil Hansen', 'Tom Doakes'];

const COUNTRY_NAMES = { USA: 'United States', ENG: 'England', SCO: 'Scotland', NIR: 'Northern Ireland', IRL: 'Ireland', GER: 'Germany', JPN: 'Japan', CAN: 'Canada', ITA: 'Italy', KOR: 'South Korea', AUS: 'Australia', ESP: 'Spain', DEN: 'Denmark', UAE: 'United Arab Emirates', MEX: 'Mexico', SUI: 'Switzerland', AUT: 'Austria', NZL: 'New Zealand', RSA: 'South Africa', POR: 'Portugal', FRA: 'France', SWE: 'Sweden', NOR: 'Norway', BEL: 'Belgium', THA: 'Thailand', MRI: 'Mauritius', INA: 'Indonesia', DOM: 'Dominican Republic', FIJ: 'Fiji', NED: 'Netherlands' };

const STYLE_COUNTS = { Parkland: 20, Links: 13, Desert: 11, Mountain: 11, Coastal: 13, Forest: 11, Tropical: 11, Heathland: 10 };

function routing(rng, par) {
  // Returns 18 pars. Par 72: 4x3, 10x4, 4x5. Par 71: 4x3, 11x4, 3x5. Par 70: 4x3, 12x4, 2x5
  const fives = par === 72 ? 4 : par === 71 ? 3 : 2;
  for (let attempt = 0; attempt < 200; attempt++) {
    const p = new Array(18).fill(4);
    const threes = [];
    for (const nine of [0, 9]) {
      const opts = [2, 3, 4, 5, 6, 7].map((h) => h + nine);
      rng.shuffle(opts);
      threes.push(opts[0], opts[1]);
    }
    for (const t of threes) p[t] = 3;
    let placed = 0;
    const slots = rng.shuffle([...Array(18).keys()]);
    for (const s of slots) {
      if (placed >= fives) break;
      if (p[s] !== 4 || s === 0) continue;
      if ((s > 0 && p[s - 1] === 5) || (s < 17 && p[s + 1] === 5)) continue;
      p[s] = 5;
      placed++;
    }
    const adj3 = p.some((v, i) => i > 0 && v === 3 && p[i - 1] === 3);
    if (placed === fives && !adj3) return p;
  }
  return [4, 5, 3, 4, 4, 3, 4, 5, 4, 4, 5, 3, 4, 4, 3, 4, 5, 4];
}

let CACHE = null;

export function generateCourses() {
  if (CACHE) return CACHE;
  const rng = new RNG(777001);
  const courses = [];
  const usedNames = new Set();
  let n = 0;
  for (const [style, count] of Object.entries(STYLE_COUNTS)) {
    const parts = NAME_PARTS[style];
    for (let i = 0; i < count; i++) {
      let name;
      for (let t = 0; t < 50; t++) {
        const a = rng.pick(parts.a);
        const b = rng.pick(parts.b);
        name = `${a} ${b} ${rng.pick(parts.c)}`;
        const key = `${a} ${b}`;
        if (!usedNames.has(key)) { usedNames.add(key); break; }
      }
      const [region, cc] = rng.pick(LOCATIONS[style]);
      const par = rng.weighted([72, 71, 70], (p) => (p === 72 ? 6 : p === 71 ? 3 : 2));
      const pars = routing(rng, par);
      const difficulty = clamp(rng.gauss(0, 1), -2, 2.2); // + is harder
      const targetYards = Math.round(7150 + difficulty * 140 + (par - 71) * 180 + rng.gauss(0, 60) + (style === 'Mountain' ? 150 : 0));
      const holes = pars.map((p, h) => {
        let y = p === 3 ? rng.gauss(192, 26) : p === 4 ? rng.gauss(438, 38) : rng.gauss(570, 26);
        y = p === 3 ? clamp(y, 135, 255) : p === 4 ? clamp(y, 330, 515) : clamp(y, 515, 625);
        return { n: h + 1, par: p, yards: Math.round(y), seed: (rng.next() * 2 ** 31) | 0 };
      });
      // Scale non-par-3 yardages toward the course's target length
      const sum = holes.reduce((s, h) => s + h.yards, 0);
      const k = targetYards / sum;
      for (const h of holes) {
        const lo = h.par === 3 ? 130 : h.par === 4 ? 320 : 505;
        const hi = h.par === 3 ? 260 : h.par === 4 ? 525 : 640;
        h.yards = Math.round(clamp(h.yards * k, lo, hi));
      }
      // Stroke index: longer relative to par = harder
      const rel = holes.map((h) => ({ n: h.n, d: h.yards / (h.par === 3 ? 190 : h.par === 4 ? 430 : 565) + rng.float(-0.05, 0.05) }));
      rel.sort((a, b) => b.d - a.d);
      rel.forEach((r, i) => { holes[r.n - 1].si = i + 1; });
      const st = STYLES[style];
      n++;
      courses.push({
        id: `c${n}`,
        name,
        style,
        region,
        country: cc,
        countryName: COUNTRY_NAMES[cc] || cc,
        par,
        yards: holes.reduce((s, h) => s + h.yards, 0),
        holes,
        difficulty: Math.round((difficulty + 2) * 10) / 10, // 0..4.2
        stars: clamp(Math.round(difficulty + 3), 1, 5),
        stimp: Math.round((st.stimp + difficulty * 0.5 + rng.float(-0.5, 0.5)) * 2) / 2,
        firm: clamp(st.firm + rng.float(-0.1, 0.1), 0.2, 0.95),
        wind: st.wind,
        designer: rng.pick(DESIGNERS),
        est: rng.int(1890, 2021),
        signature: rng.int(1, 18),
        seed: (rng.next() * 2 ** 31) | 0,
      });
    }
  }
  // Order by country/style variety for browsing: keep as generated but interleave styles
  CACHE = courses;
  return courses;
}

export function courseById(id) {
  return generateCourses().find((c) => c.id === id);
}
