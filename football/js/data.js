/* Gridiron Kings — data: utilities, fictional player database, teams, lineup slots, packs, economy.
   Every player and team is invented. The database is generated from a fixed seed, so a save
   only needs to store player ids. */
(function () {
  'use strict';
  const FG = (window.FG = window.FG || {});

  /* ---------- utilities ---------- */
  const U = (FG.util = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    rng(seed) {
      let s = seed >>> 0;
      return function () {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    angDiff(a, b) {
      let d = a - b;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return d;
    },
    fmt: (n) => Math.round(n).toLocaleString('en-US'),
    esc: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    hexToRgb(hex) { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; },
    shade(hex, amt) {
      const [r, g, b] = U.hexToRgb(hex);
      const f = (v) => Math.round(U.clamp(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt), 0, 255));
      return '#' + [f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
    },
    lum(hex) { const [r, g, b] = U.hexToRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; },
    colorDist(a, b) { const A = U.hexToRgb(a), B = U.hexToRgb(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); },
  });

  /* ---------- names ---------- */
  const FIRST = 'Marcus,Jalen,Tyler,DeShawn,Caleb,Jordan,Isaiah,Trevor,Malik,Brandon,Cody,Darius,Elijah,Garrett,Hunter,Jamal,Kendrick,Mason,Nate,Owen,Preston,Quentin,Reggie,Tre,Xavier,Zach,Andre,Bryce,Cam,Dante,Ezra,Grant,Javon,Keenan,Logan,Miles,Noah,Rashad,Sam,Terrell,Victor,Wyatt,Aaron,Brock,Colt,Devin,Evan,Isaac,Jace,Kyle,Luke,Myles,Omar,Peyton,Ryan,Tyrone,Austin,Blake,Chase,Drew,Ethan,Gavin,Jaylen,Kobe,Riley,Seth,Tucker,Ty,Wes,Amari,Bo,Cedric,Darnell,Emmanuel,Felix,Hakeem,Ike,Jonah,Kai,Leon,Mateo,Nico,Rocco,Silas,Tavon,Uriah,Vince,Zion,Diego,Kenji,Tama,Lars,Sione,Chidi'.split(',');
  const LAST = 'Johnson,Williams,Brown,Davis,Harris,Robinson,Walker,Young,King,Wright,Scott,Green,Baker,Adams,Nelson,Hill,Campbell,Mitchell,Roberts,Carter,Phillips,Turner,Parker,Collins,Edwards,Stewart,Morris,Murphy,Cook,Rogers,Morgan,Cooper,Peterson,Reed,Bailey,Bell,Howard,Ward,Cox,Richardson,Wood,Watson,Brooks,Bennett,Gray,James,Hughes,Price,Sanders,Myers,Long,Ross,Foster,Powell,Jenkins,Perry,Russell,Sullivan,Coleman,Butler,Barnes,Fisher,Henderson,Patterson,Reynolds,Hamilton,Graham,Wallace,Griffin,Hayes,Ford,Gibson,Ellis,Stevens,Porter,Hicks,Crawford,Boyd,Warren,Dixon,Burns,Gordon,Shaw,Holmes,Rice,Hunt,Black,Daniels,Palmer,Mills,Knight,Ferguson,Stone,Hawkins,Dunn,Perkins,Spencer,Lawson,Fields,Okafor,Tuilagi,Fonoti,Mauga,Alvarez,Ramirez,Moreno,Nakamura,Kowalski,Lindqvist,OConnor,Fitzgerald,McAllister,Delgado,Achebe,Faleolo,Brennan,Castillo,Dubois,Vance,Whitfield,Kingsley,Ashford,Blackwood'.split(',').map((n) => (n === 'OConnor' ? "O'Connor" : n));
  const BLOCKED = new Set(['Lamar Jackson', 'Josh Allen', 'Mike Evans', 'Bryce Young', 'Caleb Williams', 'Marcus Allen', 'Miles Sanders', 'Chase Young', 'Devin White', 'Davante Adams', 'Jordan Love', 'Isaiah Likely', 'Aaron Jones', 'Tyler Boyd', 'Kyle Pitts', 'Jalen Hurts', 'Myles Garrett', 'Darius Slay', 'Andre Johnson', 'Keenan Allen', 'Jamal Adams', 'Grant Hill', 'Isaiah Simmons', 'Evan Engram', 'Peyton Hillis', 'Ty Law', 'Cam Ward', 'Bo Jackson', 'Jaylen Waddle', 'Tyrone Wheatley', 'Ryan Fitzpatrick', 'Malik Nabers', 'Drew Brees', 'Jordan Howard', 'Andre Reed', 'Isaac Bruce', 'Ezra Cleveland', 'Seth Roberts', 'Brandon Cooks', 'Myles Jack', 'Jalen Ramsey', 'Garrett Wilson', 'Darnell Mooney', 'Nate Burleson']);

  /* ---------- teams ---------- */
  const CLUBS = [
    { id: 'AUR', name: 'Aurora Comets', c1: '#0fb5a6', c2: '#ffffff', helm: '#0b2545', pants: '#0b2545', crest: 0 },
    { id: 'RED', name: 'Redwood Rangers', c1: '#b3202f', c2: '#f2c744', helm: '#b3202f', pants: '#f2c744', crest: 1 },
    { id: 'HAR', name: 'Harbor Ironclads', c1: '#3d4654', c2: '#ff7f11', helm: '#ff7f11', pants: '#3d4654', crest: 2 },
    { id: 'SOL', name: 'Solstice Suns', c1: '#ffb000', c2: '#5a1a86', helm: '#5a1a86', pants: '#ffffff', crest: 3 },
    { id: 'NOR', name: 'Northgate Huskies', c1: '#1f4fd6', c2: '#ffffff', helm: '#c9d3dd', pants: '#c9d3dd', crest: 0 },
    { id: 'VUL', name: 'Vulcan Forge', c1: '#ff5a1f', c2: '#1a1a1a', helm: '#1a1a1a', pants: '#1a1a1a', crest: 1 },
    { id: 'EMR', name: 'Emerald Gators', c1: '#0c7f45', c2: '#ffd23f', helm: '#0c7f45', pants: '#ffffff', crest: 2 },
    { id: 'ROY', name: 'Royal Knights', c1: '#4b2bb8', c2: '#f5c542', helm: '#f5c542', pants: '#4b2bb8', crest: 3 },
    { id: 'FAL', name: 'Falcon Hawks', c1: '#6ec6ff', c2: '#12264f', helm: '#12264f', pants: '#ffffff', crest: 0 },
    { id: 'BLK', name: 'Blackthorn Ravens', c1: '#1b1b22', c2: '#d9a400', helm: '#1b1b22', pants: '#d9a400', crest: 1 },
    { id: 'COR', name: 'Coral Bay Marlins', c1: '#0e8f94', c2: '#ff7b6b', helm: '#ffffff', pants: '#ffffff', crest: 2 },
    { id: 'GRA', name: 'Granite Wolves', c1: '#55606e', c2: '#9fd0ff', helm: '#9fd0ff', pants: '#55606e', crest: 3 },
    { id: 'SUN', name: 'Sunport Stingrays', c1: '#1340a8', c2: '#f2a900', helm: '#f2a900', pants: '#1340a8', crest: 0 },
    { id: 'CRM', name: 'Crimson Bison', c1: '#7a0f1f', c2: '#e9d9a8', helm: '#e9d9a8', pants: '#e9d9a8', crest: 1 },
    { id: 'GLA', name: 'Glacier Yetis', c1: '#e9eef5', c2: '#2a6fd6', helm: '#2a6fd6', pants: '#2a6fd6', crest: 2 },
    { id: 'THU', name: 'Thunder Storm', c1: '#2c2a9c', c2: '#ffe14d', helm: '#ffe14d', pants: '#2c2a9c', crest: 3 },
  ];
  const KITS = [
    { name: 'Prime Gold', c1: '#ffc72c', c2: '#111827', helm: '#111827', pants: '#ffc72c' },
    { name: 'Fire Red', c1: '#d7263d', c2: '#ffffff', helm: '#ffffff', pants: '#ffffff' },
    { name: 'Royal Blue', c1: '#1c53e8', c2: '#ffffff', helm: '#c9d3dd', pants: '#c9d3dd' },
    { name: 'Forest', c1: '#127a3e', c2: '#ffd23f', helm: '#ffd23f', pants: '#ffffff' },
    { name: 'Midnight', c1: '#151826', c2: '#35e0c2', helm: '#35e0c2', pants: '#151826' },
    { name: 'Arctic', c1: '#f4f7fb', c2: '#d7263d', helm: '#d7263d', pants: '#d7263d' },
    { name: 'Violet', c1: '#6a2fd6', c2: '#ffffff', helm: '#ffffff', pants: '#6a2fd6' },
    { name: 'Orange Crush', c1: '#ff6a13', c2: '#1a1a1a', helm: '#1a1a1a', pants: '#ffffff' },
  ];

  /* ---------- tiers ---------- */
  const TIERS = [
    { id: 'bronze', name: 'Bronze', min: 50, max: 64, count: 130 },
    { id: 'silver', name: 'Silver', min: 65, max: 74, count: 120 },
    { id: 'gold', name: 'Gold', min: 75, max: 82, count: 105 },
    { id: 'elite', name: 'Elite', min: 83, max: 88, count: 56 },
    { id: 'legend', name: 'Legend', min: 89, max: 93, count: 30 },
    { id: 'mythic', name: 'Mythic', min: 94, max: 99, count: 14 },
  ];
  const TIER_BY_ID = {};
  TIERS.forEach((t, i) => { t.rank = i; TIER_BY_ID[t.id] = t; });

  /* ---------- positions ---------- */
  const POS_NAME = { QB: 'Quarterback', RB: 'Running back', WR: 'Wide receiver', TE: 'Tight end', OL: 'Offensive line', DL: 'Defensive line', LB: 'Linebacker', CB: 'Cornerback', S: 'Safety', K: 'Kicker' };
  const POS_GROUP = { QB: 'QB', RB: 'SK', WR: 'SK', TE: 'SK', OL: 'OL', DL: 'FR', LB: 'FR', CB: 'DB', S: 'DB', K: 'K' };
  const POS_WEIGHTS = [['QB', 6], ['RB', 8], ['WR', 14], ['TE', 6], ['OL', 17], ['DL', 14], ['LB', 11], ['CB', 11], ['S', 9], ['K', 4]];
  const STAT_KEYS = ['spd', 'str', 'agi', 'cth', 'thp', 'tac', 'tkl', 'blk', 'cov', 'kpw', 'kac', 'awr'];
  const LO = -42;
  const TPL = {
    QB: { spd: -15, str: -16, agi: -8, cth: -30, thp: 4, tac: 3, tkl: LO, blk: LO, cov: LO, kpw: LO, kac: LO, awr: 4 },
    RB: { spd: 4, str: -2, agi: 5, cth: -6, thp: LO, tac: LO, tkl: -36, blk: -14, cov: -36, kpw: LO, kac: LO, awr: -2 },
    WR: { spd: 6, str: -18, agi: 4, cth: 5, thp: LO, tac: LO, tkl: -38, blk: -22, cov: -30, kpw: LO, kac: LO, awr: 0 },
    TE: { spd: -8, str: 1, agi: -6, cth: -1, thp: LO, tac: LO, tkl: -30, blk: 0, cov: -34, kpw: LO, kac: LO, awr: -1 },
    OL: { spd: -30, str: 6, agi: -18, cth: -40, thp: LO, tac: LO, tkl: -26, blk: 5, cov: LO, kpw: LO, kac: LO, awr: 0 },
    DL: { spd: -12, str: 6, agi: -3, cth: -40, thp: LO, tac: LO, tkl: 1, blk: -26, cov: -30, kpw: LO, kac: LO, awr: -2 },
    LB: { spd: -5, str: -1, agi: -4, cth: -24, thp: LO, tac: LO, tkl: 4, blk: -24, cov: -6, kpw: LO, kac: LO, awr: 1 },
    CB: { spd: 6, str: -18, agi: 4, cth: -12, thp: LO, tac: LO, tkl: -10, blk: -30, cov: 5, kpw: LO, kac: LO, awr: 0 },
    S: { spd: 2, str: -10, agi: 0, cth: -14, thp: LO, tac: LO, tkl: 0, blk: -28, cov: 2, kpw: LO, kac: LO, awr: 3 },
    K: { spd: -30, str: -30, agi: -30, cth: LO, thp: LO, tac: LO, tkl: LO, blk: LO, cov: LO, kpw: 4, kac: 4, awr: -5 },
  };
  const CARD_STATS = {
    QB: [['thp', 'ARM'], ['tac', 'ACC'], ['awr', 'AWR'], ['spd', 'SPD'], ['agi', 'AGI'], ['str', 'STR']],
    RB: [['spd', 'SPD'], ['agi', 'AGI'], ['str', 'STR'], ['cth', 'CTH'], ['awr', 'AWR'], ['blk', 'BLK']],
    WR: [['spd', 'SPD'], ['cth', 'CTH'], ['agi', 'AGI'], ['awr', 'AWR'], ['str', 'STR'], ['blk', 'BLK']],
    TE: [['cth', 'CTH'], ['blk', 'BLK'], ['str', 'STR'], ['spd', 'SPD'], ['agi', 'AGI'], ['awr', 'AWR']],
    OL: [['blk', 'BLK'], ['str', 'STR'], ['awr', 'AWR'], ['agi', 'AGI'], ['spd', 'SPD'], ['tkl', 'TKL']],
    DL: [['str', 'STR'], ['tkl', 'TKL'], ['agi', 'AGI'], ['spd', 'SPD'], ['awr', 'AWR'], ['cov', 'COV']],
    LB: [['tkl', 'TKL'], ['spd', 'SPD'], ['str', 'STR'], ['cov', 'COV'], ['awr', 'AWR'], ['agi', 'AGI']],
    CB: [['cov', 'COV'], ['spd', 'SPD'], ['agi', 'AGI'], ['cth', 'CTH'], ['tkl', 'TKL'], ['awr', 'AWR']],
    S: [['cov', 'COV'], ['tkl', 'TKL'], ['spd', 'SPD'], ['awr', 'AWR'], ['agi', 'AGI'], ['cth', 'CTH']],
    K: [['kpw', 'KPW'], ['kac', 'KAC'], ['awr', 'AWR'], ['str', 'STR'], ['spd', 'SPD'], ['agi', 'AGI']],
  };
  const NUMS = { QB: [[1, 19]], RB: [[20, 39]], WR: [[10, 19], [80, 89]], TE: [[80, 89]], OL: [[60, 79]], DL: [[90, 99]], LB: [[40, 59]], CB: [[20, 39]], S: [[20, 49]], K: [[1, 9]] };

  function posFit(pp, sp) {
    if (pp === sp) return 0;
    const a = POS_GROUP[pp], b = POS_GROUP[sp];
    if (a === 'QB' || b === 'QB' || a === 'K' || b === 'K') return -35;
    if (a === b) return -6;
    if ((a === 'OL' && b === 'FR') || (a === 'FR' && b === 'OL')) return -10;
    if ((a === 'SK' && b === 'DB') || (a === 'DB' && b === 'SK')) return -12;
    return -22;
  }
  function effStats(card, slotPos) {
    const fit = posFit(card.pos, slotPos);
    const out = { ovr: card.ovr + fit };
    STAT_KEYS.forEach((k) => { out[k] = U.clamp(card.st[k] + fit, 15, 99); });
    return out;
  }

  /* ---------- lineup: 11 offense, 11 defense, 1 kicker ---------- */
  const LINEUP = [
    { side: 'O', pos: 'QB', role: 'QB', ux: 50, uy: 60 },
    { side: 'O', pos: 'RB', role: 'RB', ux: 50, uy: 84 },
    { side: 'O', pos: 'WR', role: 'X', ux: 7, uy: 30 },
    { side: 'O', pos: 'WR', role: 'Z', ux: 88, uy: 56 },
    { side: 'O', pos: 'WR', role: 'SL', ux: 18, uy: 56 },
    { side: 'O', pos: 'TE', role: 'TE', ux: 92, uy: 30 },
    { side: 'O', pos: 'OL', role: 'LT', ux: 23, uy: 30 },
    { side: 'O', pos: 'OL', role: 'LG', ux: 36.5, uy: 30 },
    { side: 'O', pos: 'OL', role: 'C', ux: 50, uy: 30 },
    { side: 'O', pos: 'OL', role: 'RG', ux: 63.5, uy: 30 },
    { side: 'O', pos: 'OL', role: 'RT', ux: 77, uy: 30 },
    { side: 'D', pos: 'DL', role: 'LE', ux: 26, uy: 72 },
    { side: 'D', pos: 'DL', role: 'DT1', ux: 42, uy: 72 },
    { side: 'D', pos: 'DL', role: 'DT2', ux: 58, uy: 72 },
    { side: 'D', pos: 'DL', role: 'RE', ux: 74, uy: 72 },
    { side: 'D', pos: 'LB', role: 'WLB', ux: 28, uy: 48 },
    { side: 'D', pos: 'LB', role: 'MLB', ux: 50, uy: 48 },
    { side: 'D', pos: 'LB', role: 'SLB', ux: 72, uy: 48 },
    { side: 'D', pos: 'CB', role: 'CB1', ux: 7, uy: 52 },
    { side: 'D', pos: 'CB', role: 'CB2', ux: 93, uy: 52 },
    { side: 'D', pos: 'S', role: 'FS', ux: 34, uy: 20 },
    { side: 'D', pos: 'S', role: 'SS', ux: 66, uy: 20 },
    { side: 'K', pos: 'K', role: 'K', ux: 86, uy: 86 },
  ];
  const ROLE_NAME = { QB: 'QB', RB: 'RB', X: 'WR', Z: 'WR', SL: 'Slot', TE: 'TE', LT: 'LT', LG: 'LG', C: 'C', RG: 'RG', RT: 'RT', LE: 'LE', DT1: 'DT', DT2: 'DT', RE: 'RE', WLB: 'WLB', MLB: 'MLB', SLB: 'SLB', CB1: 'CB', CB2: 'CB', FS: 'FS', SS: 'SS', K: 'K' };

  /* ---------- player database ---------- */
  const players = [];
  const byId = {};
  (function generate() {
    const r = U.rng(20261117);
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const used = new Set();
    let n = 0;
    const total = POS_WEIGHTS.reduce((a, w) => a + w[1], 0);
    TIERS.forEach((tier) => {
      const poss = [];
      POS_WEIGHTS.forEach(([p, w]) => { const k = Math.max(1, Math.round((w / total) * tier.count)); for (let i = 0; i < k; i++) poss.push(p); });
      while (poss.length < tier.count) poss.push(pick(POS_WEIGHTS)[0]);
      for (let i = poss.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [poss[i], poss[j]] = [poss[j], poss[i]]; }
      poss.length = tier.count;
      for (let i = 0; i < tier.count; i++) {
        const pos = poss[i];
        const ovr = tier.min + Math.floor(Math.pow(r(), 1.45) * (tier.max - tier.min + 1));
        let first, last, key, guard = 0;
        do { first = pick(FIRST); last = pick(LAST); key = first + ' ' + last; } while ((used.has(key) || BLOCKED.has(key)) && guard++ < 80);
        used.add(key);
        const st = {};
        STAT_KEYS.forEach((k) => { st[k] = Math.round(U.clamp(ovr + TPL[pos][k] + (r() * 8 - 4), 20, 99)); });
        const rng = pick(NUMS[pos]);
        const num = rng[0] + Math.floor(r() * (rng[1] - rng[0] + 1));
        const skin = Math.floor(r() * 6);
        const hc = r();
        const hairCol = skin >= 3 ? (hc < 0.88 ? 0 : hc < 0.95 ? 1 : 6) : hc < 0.3 ? 0 : hc < 0.6 ? 1 : hc < 0.8 ? 2 : hc < 0.93 ? 3 : hc < 0.98 ? 4 : 6;
        const p = {
          id: 'g' + (n++).toString(36), first, last, name: first[0] + '. ' + last,
          club: pick(CLUBS).id, pos, ovr, tier: tier.id, st, num,
          look: { skin, hair: Math.floor(r() * 8), hairCol, beard: r() < 0.55 ? 0 : 1 + Math.floor(r() * 3), brow: Math.floor(r() * 3), eyeBlack: r() < 0.45 },
        };
        players.push(p);
        byId[p.id] = p;
      }
    });
  })();
  const byTier = {};
  TIERS.forEach((t) => { byTier[t.id] = players.filter((p) => p.tier === t.id); });

  /* ---------- economy ---------- */
  const sellPrice = (ovr) => Math.max(10, Math.round((12 * Math.pow(1.155, ovr - 50)) / 5) * 5);
  const buyPrice = (ovr) => Math.round((sellPrice(ovr) * 4.5) / 10) * 10;
  /* Packs. theme = [gradient top, gradient bottom, ink]. Optional filters: pos (positions), club,
     top (only the best third of each tier at that stat). cat groups them in the store. */
  const SG = { silver: 45, gold: 45, elite: 9, legend: 1 };
  const PACKS = [
    { id: 'daily', cat: 'free', name: 'Daily Pack', short: 'Daily', price: 0, cards: 3, daily: true, badge: 'Free', blurb: 'Free once a day. Come back tomorrow for another.', odds: { bronze: 68, silver: 27, gold: 4.7, elite: 0.3 }, theme: ['#56f0d6', '#0a5c61', '#03221f'] },
    { id: 'rookie', cat: 'free', name: 'Rookie Pack', short: 'Rookie', price: 300, cards: 5, blurb: '5 young players. One is guaranteed Silver or better.', odds: { bronze: 62, silver: 30, gold: 7.4, elite: 0.6 }, guarantee: { silver: 75, gold: 23, elite: 2 }, theme: ['#4fe39a', '#0b6b3c', '#022b16'] },
    { id: 'lucky', cat: 'free', name: 'Lucky Pack', short: 'Lucky', price: 750, cards: 3, badge: 'Long shot', blurb: 'Cheap, with a tiny chance at a Legend or a Mythic.', odds: { bronze: 70, silver: 20, gold: 5, elite: 3, legend: 1.5, mythic: 0.5 }, theme: ['#9dff6a', '#1d7a1a', '#05230a'] },
    { id: 'mystery', cat: 'free', name: 'Mystery Pack', short: '???', price: 2000, cards: 5, mystery: true, badge: 'Surprise', blurb: 'Somewhere between 3 and 7 players, of any tier.', odds: { bronze: 35, silver: 30, gold: 22, elite: 9, legend: 3, mythic: 1 }, theme: ['#3a3f4b', '#07090d', '#ffd23f'] },

    { id: 'bronze', cat: 'classic', name: 'Bronze Pack', short: 'Bronze', price: 500, cards: 4, blurb: '4 players. Mostly Bronze, with a shot at Silver.', odds: { bronze: 80, silver: 18, gold: 1.9, elite: 0.1 }, theme: ['#e0a878', '#7d4c2c', '#2a1508'] },
    { id: 'silver', cat: 'classic', name: 'Silver Pack', short: 'Silver', price: 1200, cards: 4, blurb: '4 players. Mostly Silver, Gold is possible.', odds: { bronze: 25, silver: 60, gold: 13.5, elite: 1.4, legend: 0.1 }, theme: ['#f4f7fa', '#8996a5', '#161d28'] },
    { id: 'gold', cat: 'classic', name: 'Gold Pack', short: 'Gold', price: 4500, cards: 5, blurb: '5 players. Mostly Gold, Elite is possible.', odds: { silver: 30, gold: 60, elite: 8.8, legend: 1.1, mythic: 0.1 }, theme: ['#ffe680', '#b27d10', '#2b1e00'] },
    { id: 'elite', cat: 'classic', name: 'Elite Pack', short: 'Elite', price: 11000, cards: 5, blurb: '5 players. One is guaranteed Elite or better.', odds: { gold: 55, elite: 36, legend: 8, mythic: 1 }, guarantee: { elite: 82, legend: 15, mythic: 3 }, theme: ['#7b4bff', '#1b0d5c', '#f6efff'] },
    { id: 'legend', cat: 'classic', name: 'Legend Pack', short: 'Legend', price: 32000, cards: 6, blurb: '6 players. One is guaranteed Legend or Mythic.', odds: { gold: 30, elite: 50, legend: 17, mythic: 3 }, guarantee: { legend: 85, mythic: 15 }, theme: ['#c41a22', '#120305', '#ffe2a0'] },
    { id: 'mythic', cat: 'classic', name: 'Mythic Pack', short: 'Mythic', price: 90000, cards: 3, badge: 'Rarest', blurb: '3 players. One is guaranteed Mythic, the best cards in the game.', odds: { elite: 50, legend: 40, mythic: 10 }, guarantee: { mythic: 100 }, theme: ['#8df3ff', '#c86bff', '#14082e'], holo: true },

    { id: 'qb', cat: 'position', name: 'Quarterback Pack', short: 'QB', price: 3000, cards: 4, pos: ['QB'], blurb: '4 quarterbacks. Find your franchise passer.', odds: SG, theme: ['#2b4bd6', '#0a1240', '#ffd23f'] },
    { id: 'rb', cat: 'position', name: 'Running Back Pack', short: 'RB', price: 3000, cards: 4, pos: ['RB'], blurb: '4 running backs who love contact.', odds: SG, theme: ['#ff8a2a', '#7a2e05', '#1f0b00'] },
    { id: 'wr', cat: 'position', name: 'Receiver Pack', short: 'WR', price: 3000, cards: 4, pos: ['WR'], blurb: '4 wide receivers to stretch the field.', odds: SG, theme: ['#6ec6ff', '#13507a', '#04182a'] },
    { id: 'te', cat: 'position', name: 'Tight End Pack', short: 'TE', price: 2500, cards: 3, pos: ['TE'], blurb: '3 tight ends who block and catch.', odds: SG, theme: ['#c99a64', '#5b3a1a', '#1d0f02'] },
    { id: 'ol', cat: 'position', name: 'Lineman Pack', short: 'OL', price: 3000, cards: 5, pos: ['OL'], blurb: '5 offensive linemen to protect your quarterback.', odds: SG, theme: ['#9aa5b5', '#333c4a', '#0b0f15'] },
    { id: 'dl', cat: 'position', name: 'Pass Rusher Pack', short: 'DL', price: 3000, cards: 4, pos: ['DL'], blurb: '4 defensive linemen who chase quarterbacks.', odds: SG, theme: ['#ff4a4a', '#5c0a0a', '#1f0202'] },
    { id: 'lb', cat: 'position', name: 'Linebacker Pack', short: 'LB', price: 3000, cards: 4, pos: ['LB'], blurb: '4 linebackers who tackle everything.', odds: SG, theme: ['#2fbf71', '#0b4a29', '#021a0d'] },
    { id: 'db', cat: 'position', name: 'Secondary Pack', short: 'DB', price: 3000, cards: 4, pos: ['CB', 'S'], blurb: '4 cornerbacks and safeties to stop the pass.', odds: SG, theme: ['#b07bff', '#3b1a7a', '#12052b'] },
    { id: 'k', cat: 'position', name: 'Kicker Pack', short: 'K', price: 800, cards: 3, pos: ['K'], blurb: '3 kickers with big legs.', odds: { bronze: 30, silver: 40, gold: 25, elite: 4.5, legend: 0.5 }, theme: ['#f2ff7a', '#7a8a10', '#1d2202'] },

    { id: 'jumbo', cat: 'special', name: 'Jumbo Pack', short: 'Jumbo', price: 2600, cards: 10, badge: '10 players', blurb: '10 players! Mostly Bronze and Silver.', odds: { bronze: 55, silver: 38, gold: 6.5, elite: 0.5 }, theme: ['#ff7ac8', '#7a1450', '#26031a'] },
    { id: 'mega', cat: 'special', name: 'Mega Pack', short: 'Mega', price: 20000, cards: 8, guaranteeN: 2, badge: 'Best value', blurb: '8 players. Two are guaranteed Elite or better.', odds: { silver: 15, gold: 62, elite: 19, legend: 3.5, mythic: 0.5 }, guarantee: { elite: 80, legend: 17, mythic: 3 }, theme: ['#ffcf4a', '#4a1a8a', '#fff3c4'] },
    { id: 'superstar', cat: 'special', name: 'Superstar Pack', short: 'Star', price: 15000, cards: 1, badge: '1 big player', blurb: 'Just one player, and he is Elite or better.', odds: { elite: 70, legend: 25, mythic: 5 }, theme: ['#ffffff', '#c9a227', '#2b1e00'] },
    { id: 'speed', cat: 'special', name: 'Speed Pack', short: 'Speed', price: 5000, cards: 4, top: 'spd', blurb: '4 of the fastest players in the league.', odds: SG, theme: ['#fff04a', '#1a1a1a', '#1a1a1a'] },
    { id: 'power', cat: 'special', name: 'Power Pack', short: 'Power', price: 5000, cards: 4, top: 'str', blurb: '4 of the strongest players. Big hits guaranteed.', odds: SG, theme: ['#ff5a36', '#240404', '#fff1e8'] },
    { id: 'hands', cat: 'special', name: 'Sure Hands Pack', short: 'Hands', price: 5000, cards: 4, top: 'cth', pos: ['WR', 'TE', 'RB'], blurb: '4 pass catchers with the safest hands.', odds: SG, theme: ['#35e0c2', '#0d3b52', '#ecfffb'] },
    { id: 'offense', cat: 'special', name: 'Offense Pack', short: 'Offense', price: 6000, cards: 5, pos: ['QB', 'RB', 'WR', 'TE', 'OL'], blurb: '5 offensive players. Mostly Gold.', odds: { silver: 30, gold: 58, elite: 10.5, legend: 1.4, mythic: 0.1 }, theme: ['#ff6a3d', '#7a1a05', '#fff0e6'] },
    { id: 'defense', cat: 'special', name: 'Defense Pack', short: 'Defense', price: 6000, cards: 5, pos: ['DL', 'LB', 'CB', 'S'], blurb: '5 defensive players. Mostly Gold.', odds: { silver: 30, gold: 58, elite: 10.5, legend: 1.4, mythic: 0.1 }, theme: ['#3d7bff', '#060c24', '#e6eeff'] },
  ];
  CLUBS.forEach((c) => {
    const dark = U.shade(c.c1, -0.55);
    PACKS.push({ id: 'team-' + c.id, cat: 'team', club: c.id, name: c.name + ' Pack', short: c.id, price: 3500, cards: 4, blurb: '4 players from the ' + c.name + '.', odds: { silver: 40, gold: 50, elite: 9, legend: 1 }, theme: [c.c1, dark, U.lum(c.c1) > 0.6 ? '#10131a' : c.c2 === c.c1 ? '#ffffff' : c.c2] });
  });
  const PACK_BY_ID = {};
  PACKS.forEach((p) => (PACK_BY_ID[p.id] = p));
  const TIER_ORDER = TIERS.map((t) => t.id);
  function rollTier(odds, r) {
    const tot = Object.values(odds).reduce((a, b) => a + b, 0);
    let x = r() * tot;
    for (const k of Object.keys(odds)) { x -= odds[k]; if (x <= 0) return k; }
    return Object.keys(odds)[0];
  }
  function packPool(pack, tierId) {
    let pool = byTier[tierId];
    if (pack.pos) pool = pool.filter((p) => pack.pos.includes(p.pos));
    if (pack.club) pool = pool.filter((p) => p.club === pack.club);
    if (pack.top) pool = pool.slice().sort((a, b) => b.st[pack.top] - a.st[pack.top]).slice(0, Math.max(3, Math.ceil(pool.length / 3)));
    return pool;
  }
  /* pick a player of the rolled tier that fits the pack; if none exist, the nearest tier below, then above */
  function drawFor(pack, tierId, r, taken) {
    const k = TIER_ORDER.indexOf(tierId), order = [k];
    for (let d = 1; d < TIER_ORDER.length; d++) { if (k - d >= 0) order.push(k - d); if (k + d < TIER_ORDER.length) order.push(k + d); }
    for (const i of order) {
      const pool = packPool(pack, TIER_ORDER[i]).filter((p) => !taken.includes(p));
      if (pool.length) return pool[Math.floor(r() * pool.length)];
    }
    const any = byTier[tierId].filter((p) => !taken.includes(p));
    return any[Math.floor(r() * any.length)];
  }
  function openPack(packId, r) {
    r = r || Math.random;
    const pack = PACK_BY_ID[packId], out = [];
    const n = pack.mystery ? 3 + Math.floor(r() * 5) : pack.cards;
    const gN = pack.guarantee ? pack.guaranteeN || 1 : 0;
    for (let i = 0; i < n; i++) out.push(drawFor(pack, rollTier(i >= n - gN ? pack.guarantee : pack.odds, r), r, out));
    return out.sort((a, b) => a.ovr - b.ovr);
  }
  /* four team packs are on sale each day */
  function featuredTeams(day) {
    const r = U.rng(day * 7919 + 101), ids = CLUBS.map((c) => c.id), out = [];
    while (out.length < 4) { const i = Math.floor(r() * ids.length); out.push(ids.splice(i, 1)[0]); }
    return out;
  }

  function starterSquad(r) {
    r = r || Math.random;
    const want = LINEUP.map((s) => s.pos).concat(['RB', 'WR', 'LB', 'CB']);
    const out = [];
    want.forEach((pos) => {
      let pool = byTier.bronze.filter((p) => p.pos === pos && p.ovr <= 60 && !out.includes(p));
      if (!pool.length) pool = byTier.bronze.filter((p) => p.pos === pos && !out.includes(p));
      out.push(pool[Math.floor(r() * pool.length)]);
    });
    return out.map((p) => p.id);
  }

  function bestLineup(ownedIds) {
    const pool = ownedIds.map((id) => byId[id]).filter(Boolean);
    const res = new Array(LINEUP.length).fill(null), used = new Set();
    const order = LINEUP.map((s, i) => i).sort((a, b) => ((LINEUP[a].pos === 'QB' || LINEUP[a].pos === 'K') ? -1 : 0) - ((LINEUP[b].pos === 'QB' || LINEUP[b].pos === 'K') ? -1 : 0));
    for (const pass of [0, 1]) {
      order.forEach((i) => {
        if (res[i]) return;
        let best = null, bs = -1e9;
        pool.forEach((p) => {
          if (used.has(p.id)) return;
          const fit = posFit(p.pos, LINEUP[i].pos);
          if (pass === 0 && fit < 0) return;
          if (p.ovr + fit > bs) { bs = p.ovr + fit; best = p; }
        });
        if (best) { res[i] = best.id; used.add(best.id); }
      });
    }
    return res;
  }

  function unitRating(slotIds, side) {
    let sum = 0, w = 0;
    LINEUP.forEach((s, i) => {
      if (side && s.side !== side) return;
      const p = byId[slotIds[i]];
      const k = s.pos === 'QB' ? 2 : s.pos === 'K' ? 0.5 : 1;
      if (p) sum += (p.ovr + posFit(p.pos, s.pos)) * k;
      w += k;
    });
    return w ? Math.round(sum / w) : 0;
  }
  const teamRating = (slots) => unitRating(slots, null);

  /* ---------- divisions ---------- */
  const DIVISIONS = [];
  for (let d = 10; d >= 1; d--) {
    DIVISIONS[d] = {
      id: d, oppRating: [0, 91, 88, 85, 81, 77, 73, 69, 65, 61, 57][d], mult: 1 + (10 - d) * 0.25, ptsToPromote: d === 1 ? 9 : 7,
      reward: [0, 'legend', 'legend', 'elite', 'elite', 'elite', 'gold', 'gold', 'gold', 'silver', 'silver'][d],
    };
  }

  /* ---------- AI opponents ---------- */
  function buildAITeam(opts) {
    const r = U.rng(opts.seed || 1);
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    let club = pick(CLUBS), guard = 0;
    while (opts.avoidColor && U.colorDist(club.c1, opts.avoidColor) < 120 && guard++ < 12) club = pick(CLUBS);
    const usedIds = new Set(opts.exclude || []);
    const ids = LINEUP.map((s) => {
      let c = players.filter((p) => p.pos === s.pos && !usedIds.has(p.id) && Math.abs(p.ovr - opts.target) <= 3);
      if (!c.length) c = players.filter((p) => p.pos === s.pos && !usedIds.has(p.id)).sort((a, b) => Math.abs(a.ovr - opts.target) - Math.abs(b.ovr - opts.target)).slice(0, 3);
      const p = pick(c);
      usedIds.add(p.id);
      return p.id;
    });
    let kit = { c1: club.c1, c2: club.c2, helm: club.helm, pants: club.pants };
    if (opts.avoidColor && U.colorDist(kit.c1, opts.avoidColor) < 150) kit = { c1: '#f3f5f8', c2: club.c1, helm: club.helm, pants: club.pants === '#ffffff' ? club.c1 : club.pants };
    return { name: club.name, short: club.id, club: club.id, kit, slots: ids, rating: teamRating(ids) };
  }

  function marketStock(seed, ownedIds) {
    const r = U.rng(seed * 7919 + 13);
    const owned = new Set(ownedIds);
    const quota = [['bronze', 2], ['silver', 4], ['gold', 5], ['elite', 3], ['legend', 1], ['mythic', 1]];
    const out = [];
    quota.forEach(([tier, k]) => {
      const pool = byTier[tier].filter((p) => !owned.has(p.id));
      for (let i = 0; i < k && pool.length; i++) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    });
    return out;
  }

  FG.data = {
    CLUBS, KITS, TIERS, TIER_BY_ID, POS_NAME, POS_GROUP, STAT_KEYS, CARD_STATS, LINEUP, ROLE_NAME, PACKS, PACK_BY_ID, DIVISIONS,
    players, byId, byTier, club: (id) => CLUBS.find((c) => c.id === id), featuredTeams,
    posFit, effStats, sellPrice, buyPrice, openPack, starterSquad, bestLineup, unitRating, teamRating, buildAITeam, marketStock,
  };
})();
