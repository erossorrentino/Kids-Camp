'use strict';
/* ============================================================
   Court geometry, league data, difficulty tables.
   Units are feet and seconds everywhere in the simulation.
   ============================================================ */

const CT = {
  HL: 47, HW: 25,                 // half length / half width of the court
  RIM_X: 41.75, RIM_Y: 10, RIM_R: 0.75, RIM_TUBE: 0.035,
  BB_X: 43, BB_HW: 3, BB_BOT: 9, BB_TOP: 12.5,
  BALL_R: 0.39,
  THREE_R: 23.75, CORNER_Z: 22, CORNER_X: 32.8,
  KEY_HW: 8, FT_X: 28,
  G: 32.17,
};
const DT = 1 / 60;

/* Rating order: tpt mid ins dnk hnd pas spd def stl blk reb */
function mkP(n, pos, h, num, r, skin, hair, acc) {
  return { n, pos, h, num, tpt: r[0], mid: r[1], ins: r[2], dnk: r[3], hnd: r[4], pas: r[5],
    spd: r[6], def: r[7], stl: r[8], blk: r[9], reb: r[10], skin, hair, acc: acc || 0 };
}

const TEAMS = [
  { id: 'HCL', city: 'Harbor City', name: 'Leviathans', c1: '#0e8f9b', c2: '#08243f', c3: '#7df3e1',
    style: 'Pace and space around an elite lead guard',
    roster: [
      mkP('Tavian Rhodes', 'PG', 74, 3, [91, 86, 80, 62, 94, 90, 90, 70, 78, 30, 42], 4, 1, 1),
      mkP('Milo Castellan', 'SG', 77, 11, [84, 80, 76, 74, 80, 74, 82, 76, 70, 40, 48], 1, 2, 0),
      mkP('Dre Okonjo', 'SF', 80, 24, [74, 76, 84, 88, 74, 70, 84, 84, 72, 62, 66], 5, 3, 2),
      mkP('Bastien Leroux', 'PF', 82, 32, [70, 72, 82, 84, 58, 62, 70, 80, 50, 74, 84], 2, 1, 0),
      mkP('Anders Holt', 'C', 85, 50, [40, 58, 86, 88, 42, 55, 58, 86, 40, 90, 92], 0, 4, 0),
    ] },
  { id: 'MSA', city: 'Mesa', name: 'Scorpions', c1: '#e2531c', c2: '#1a1412', c3: '#ffd166',
    style: 'Fastest team in the league, lives above the rim',
    roster: [
      mkP('Zeke Marlowe', 'PG', 75, 0, [78, 80, 88, 86, 90, 84, 96, 74, 84, 38, 44], 4, 3, 1),
      mkP('Rico Santangelo', 'SG', 78, 7, [80, 82, 86, 92, 82, 70, 90, 72, 74, 48, 52], 2, 2, 0),
      mkP('Jamal Whitlock', 'SF', 80, 21, [72, 74, 88, 95, 74, 66, 88, 80, 70, 66, 70], 5, 1, 2),
      mkP('Tomas Varga', 'PF', 81, 14, [76, 74, 78, 80, 60, 64, 74, 76, 52, 68, 78], 1, 4, 0),
      mkP('Obi Adeyemi', 'C', 83, 44, [35, 52, 86, 93, 40, 48, 72, 82, 46, 88, 88], 5, 0, 1),
    ] },
  { id: 'NGY', city: 'Northgate', name: 'Yetis', c1: '#2f6fb7', c2: '#0c1f3a', c3: '#d8f1ff',
    style: 'Length everywhere, the stingiest defense around',
    roster: [
      mkP('Kai Lindqvist', 'PG', 76, 5, [80, 78, 74, 60, 84, 86, 80, 88, 90, 40, 50], 0, 2, 0),
      mkP('Devon Ashby', 'SG', 78, 9, [82, 78, 74, 70, 76, 70, 80, 86, 82, 50, 52], 4, 1, 2),
      mkP('Malik Thornbury', 'SF', 81, 33, [72, 76, 80, 82, 70, 68, 78, 90, 76, 74, 72], 5, 3, 0),
      mkP('Sven Halvorsen', 'PF', 83, 41, [68, 72, 82, 80, 52, 60, 66, 88, 48, 84, 88], 0, 4, 1),
      mkP('Bo Kowalczyk', 'C', 87, 55, [30, 50, 84, 84, 35, 50, 50, 94, 36, 97, 95], 1, 0, 0),
    ] },
  { id: 'DLT', city: 'Delta', name: 'Herons', c1: '#1f7a55', c2: '#10261c', c3: '#f4e9c9',
    style: 'Five shooters on the floor at all times',
    roster: [
      mkP('Remy Thibodeaux', 'PG', 73, 1, [93, 88, 72, 45, 90, 88, 86, 64, 74, 25, 38], 3, 2, 1),
      mkP('Cass Fontenot', 'SG', 77, 13, [95, 90, 72, 60, 78, 74, 80, 68, 66, 35, 44], 1, 4, 0),
      mkP('Isaiah Greer', 'SF', 79, 22, [88, 84, 78, 74, 74, 70, 80, 74, 66, 48, 58], 5, 1, 0),
      mkP('Lamar Devereaux', 'PF', 81, 30, [86, 80, 76, 70, 58, 64, 70, 72, 48, 60, 74], 4, 3, 2),
      mkP('Moses Tindall', 'C', 83, 45, [74, 74, 80, 78, 45, 62, 60, 78, 40, 80, 84], 5, 0, 0),
    ] },
  { id: 'IRF', city: 'Iron Ridge', name: 'Forge', c1: '#3a3f47', c2: '#15171a', c3: '#ff7a1a',
    style: 'Bully ball: paint points and second chances',
    roster: [
      mkP('Nico Brandt', 'PG', 75, 2, [78, 82, 82, 66, 86, 84, 82, 78, 76, 36, 48], 1, 1, 0),
      mkP('Jax Holloway', 'SG', 78, 10, [76, 82, 84, 84, 78, 68, 82, 80, 70, 50, 56], 4, 2, 1),
      mkP('Terrence Pike', 'SF', 80, 23, [70, 78, 88, 88, 72, 66, 80, 84, 68, 66, 74], 5, 3, 0),
      mkP('Viktor Draganov', 'PF', 82, 34, [60, 72, 90, 88, 55, 60, 66, 86, 46, 80, 92], 0, 1, 2),
      mkP('Hank Mulroney', 'C', 84, 52, [28, 56, 93, 92, 38, 52, 54, 88, 38, 88, 97], 1, 0, 0),
    ] },
  { id: 'SOL', city: 'Solano', name: 'Novas', c1: '#c81d63', c2: '#2a0b1c', c3: '#ffd23f',
    style: 'Ball movement and a point guard who sees everything',
    roster: [
      mkP('Mateo Quiroga', 'PG', 75, 8, [84, 84, 84, 60, 96, 98, 86, 66, 80, 28, 42], 3, 4, 1),
      mkP('Sol Benitez', 'SG', 77, 4, [88, 86, 78, 72, 82, 76, 84, 70, 70, 38, 46], 2, 1, 0),
      mkP('Andre Fairweather', 'SF', 80, 17, [80, 82, 84, 86, 78, 74, 84, 76, 68, 58, 64], 5, 2, 2),
      mkP('Koji Tanabe', 'PF', 81, 27, [82, 80, 78, 76, 62, 72, 74, 74, 52, 64, 76], 1, 1, 0),
      mkP('Emeka Nwosu', 'C', 84, 40, [45, 62, 88, 90, 44, 60, 64, 82, 42, 86, 90], 5, 3, 0),
    ] },
  { id: 'PCS', city: 'Pinecrest', name: 'Stags', c1: '#7a1f2e', c2: '#220a0f', c3: '#e0b030',
    style: 'Veteran craft and a deadly mid-range game',
    roster: [
      mkP('Wes Calloway', 'PG', 74, 6, [80, 90, 78, 50, 86, 90, 78, 74, 78, 30, 44], 1, 0, 0),
      mkP('Darius Penn', 'SG', 78, 12, [78, 93, 82, 78, 80, 70, 80, 78, 70, 44, 54], 5, 1, 1),
      mkP('Leo Abernathy', 'SF', 80, 20, [76, 88, 80, 76, 72, 70, 76, 80, 66, 56, 66], 2, 2, 0),
      mkP('Gus Oyelaran', 'PF', 82, 35, [64, 84, 84, 80, 54, 62, 66, 82, 46, 76, 86], 5, 3, 2),
      mkP('Tiny Marchetti', 'C', 86, 54, [30, 66, 88, 86, 36, 54, 50, 86, 36, 90, 93], 1, 4, 0),
    ] },
  { id: 'CHR', city: 'Crown Heights', name: 'Regents', c1: '#5a32a8', c2: '#170c2e', c3: '#cfd3e0',
    style: 'One superstar wing who can score from anywhere',
    roster: [
      mkP('Julian Voss', 'PG', 75, 15, [82, 80, 78, 62, 86, 86, 84, 76, 78, 32, 44], 0, 1, 0),
      mkP('Amari Sinclair', 'SG', 79, 18, [90, 92, 92, 94, 90, 80, 90, 82, 80, 60, 62], 5, 2, 1),
      mkP('Pierce Langford', 'SF', 80, 25, [78, 78, 78, 78, 70, 66, 78, 80, 66, 56, 64], 1, 4, 0),
      mkP('Cedric Okoro', 'PF', 82, 31, [62, 70, 82, 84, 52, 58, 70, 82, 48, 78, 86], 5, 0, 2),
      mkP('Magnus Petrov', 'C', 85, 51, [34, 56, 84, 84, 38, 54, 52, 86, 38, 90, 92], 0, 1, 0),
    ] },
];

function playerOvr(p) {
  const w = {
    PG: { tpt: 1.2, mid: 0.9, ins: 0.8, dnk: 0.2, hnd: 1.4, pas: 1.3, spd: 1.1, def: 0.8, stl: 0.7, blk: 0.1, reb: 0.2 },
    SG: { tpt: 1.3, mid: 1.1, ins: 0.9, dnk: 0.4, hnd: 1.0, pas: 0.8, spd: 1.0, def: 0.9, stl: 0.6, blk: 0.2, reb: 0.3 },
    SF: { tpt: 0.9, mid: 0.9, ins: 1.1, dnk: 0.6, hnd: 0.8, pas: 0.6, spd: 0.9, def: 1.1, stl: 0.5, blk: 0.5, reb: 0.6 },
    PF: { tpt: 0.5, mid: 0.7, ins: 1.2, dnk: 0.7, hnd: 0.3, pas: 0.4, spd: 0.5, def: 1.2, stl: 0.2, blk: 0.9, reb: 1.3 },
    C:  { tpt: 0.1, mid: 0.4, ins: 1.4, dnk: 0.8, hnd: 0.1, pas: 0.3, spd: 0.3, def: 1.3, stl: 0.1, blk: 1.3, reb: 1.4 },
  }[p.pos];
  let s = 0, t = 0;
  for (const k in w) { s += p[k] * w[k]; t += w[k]; }
  return Math.round(Math.min(99, s / t + 9));
}
function teamRatings(T) {
  const r = T.roster; let off = 0, def = 0, ovr = 0;
  for (const p of r) {
    off += (Math.max(p.tpt, p.mid) + p.ins + p.hnd * 0.5 + p.pas * 0.5) / 3;
    def += (p.def * 1.5 + p.stl * 0.5 + p.blk * 0.5 + p.reb * 0.5) / 3;
    ovr += playerOvr(p);
  }
  return { off: Math.round(off / 5 + 6), def: Math.round(def / 5 + 14), ovr: Math.round(ovr / 5) };
}
for (const T of TEAMS) { for (const p of T.roster) p.ovr = playerOvr(p); T.rt = teamRatings(T); }

/* win = half width (seconds) of the perfect-release window for the human shooter */
const DIFFS = {
  rookie:  { name: 'Rookie',   win: 0.058, boost: 0.95, cpuShot: 0.84, react: 1.75, think: 0.55, cpuSteal: 0.45, jump: 0.30, noise: 1.6, userSteal: 1.1, cpuFoul: 1.2 },
  pro:     { name: 'Pro',      win: 0.044, boost: 0.90, cpuShot: 0.95, react: 1.30, think: 0.42, cpuSteal: 0.75, jump: 0.46, noise: 1.0, userSteal: 0.8, cpuFoul: 1.0 },
  allstar: { name: 'All-Star', win: 0.034, boost: 0.86, cpuShot: 1.03, react: 1.00, think: 0.34, cpuSteal: 1.00, jump: 0.60, noise: 0.7, userSteal: 0.65, cpuFoul: 0.9 },
  legend:  { name: 'Legend',   win: 0.026, boost: 0.80, cpuShot: 1.10, react: 0.85, think: 0.28, cpuSteal: 1.20, jump: 0.72, noise: 0.5, userSteal: 0.52, cpuFoul: 0.8 },
};

/* Half-court spots in attack coordinates (the hoop being attacked sits at +41.75, 0) */
const SPOTS = {
  top: [15.5, 0], slotR: [18.6, 10], slotL: [18.6, -10],
  wingR: [24.4, 18.2], wingL: [24.4, -18.2],
  cornerR: [39, 23.3], cornerL: [39, -23.3],
  postR: [35, 7.6], postL: [35, -7.6],
  elbowR: [28.5, 7.6], elbowL: [28.5, -7.6],
  dunkR: [39.6, 9.5], dunkL: [39.6, -9.5],
};
