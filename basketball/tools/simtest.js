// Headless balance / stability harness: runs CPU-vs-CPU games on the real sim code.
const fs = require('fs'), vm = require('vm'), path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'js');
const files = ['00-config.js', '01-util.js', '02-sim-core.js', '03-sim-ai.js'];
let code = files.map(f => fs.readFileSync(path.join(SRC, f), 'utf8').replace(/^'use strict';/, '')).join('\n');
code += '\n;globalThis.__api = { G, EV, TEAMS, newGame, stepGame, DT, CT, DIFFS };';
const ctx = vm.createContext({ console, Math, Date, Object, Array, Number, JSON, Set, Map });
vm.runInContext(code, ctx, { filename: 'sim.js' });
const { G, EV, TEAMS, newGame, stepGame, DT } = ctx.__api;

const N = +(process.argv[2] || 8), qLen = +(process.argv[3] || 180), verbose = process.argv[4] === 'v';
const agg = { pts: 0, fga: 0, fgm: 0, tpa: 0, tpm: 0, fta: 0, ftm: 0, reb: 0, oreb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, games: 0, dunks: 0, time: 0 };
const evc = {}; const shots = {}; let poss = 0;
let problems = 0;
for (let g = 0; g < N; g++) {
  const h = TEAMS[g % 8], a = TEAMS[(g * 3 + 1) % 8 === g % 8 ? (g + 1) % 8 : (g * 3 + 1) % 8];
  newGame({ home: h, away: a, userTeam: -1, auto: true, difficulty: 'pro', qLen, seed: 1000 + g * 7919 });
  let steps = 0, lastState = '', stateT = 0, maxStall = 0, stallState = '';
  const maxSteps = 60 * (qLen * 4 * 6 + 600);
  while (G.state !== 'final' && steps < maxSteps) {
    stepGame(DT); steps++;
    for (const e of EV) { evc[e.type] = (evc[e.type] || 0) + 1; if (e.type === 'dunk') agg.dunks++; if (e.type==='possession'||e.type==='dead') poss++; if (e.type==='release' && e.shotType!=='ft') { const k = e.shotType==='jump' ? (e.three?'three':(e.p.shot.dist>10?'mid':'close')) : e.shotType; const o = shots[k] || (shots[k]={n:0,m:0,c:0}); o.n++; if (e.made) o.m++; o.c += e.contest; } if (verbose && ['score','whistle','steal','block','foul','periodEnd','rebound','turnover'].includes(e.type)) console.log(G.quarter, G.clock.toFixed(1), e.type, e.reason || e.why || '', e.p ? e.p.d.n : e.by ? e.by.d.n : '', e.pts || ''); }
    EV.length = 0;
    const key = G.state + '|' + G.ball.state + '|' + (G.dead ? G.dead.phase : '');
    if (key === lastState) { stateT += DT; if (stateT > maxStall) { maxStall = stateT; stallState = key; } } else { lastState = key; stateT = 0; }
    for (const p of G.players) if (!isFinite(p.x) || !isFinite(p.z) || !isFinite(p.y)) { console.log('NaN player', p.d.n, G.state); problems++; steps = maxSteps; break; }
    if (!isFinite(G.ball.x) || !isFinite(G.ball.y)) { console.log('NaN ball', G.state, G.ball.state); problems++; break; }
  }
  if (G.state !== 'final') { console.log('GAME DID NOT FINISH', h.id, a.id, 'state', G.state, G.ball.state, 'Q', G.quarter, G.clock.toFixed(1), G.dead && G.dead.phase); problems++; }
  const line = [];
  for (const T of G.teams) {
    const s = { pts: T.score };
    for (const p of T.players) for (const k in p.st) { if (k !== 'pts') s[k] = (s[k] || 0) + p.st[k]; }
    for (const k in s) agg[k] += s[k];
    line.push(`${T.def.id} ${T.score} (fg ${s.fgm}/${s.fga} 3p ${s.tpm}/${s.tpa} ft ${s.ftm}/${s.fta} reb ${s.reb} ast ${s.ast} stl ${s.stl} blk ${s.blk} to ${s.to} pf ${s.pf})`);
  }
  agg.games++; agg.time += G.time;
  console.log(`G${g} Q${G.quarter} ${line.join('  |  ')}  realT ${(G.time / 60).toFixed(1)}m maxStall ${maxStall.toFixed(1)}s [${stallState}]`);
}
const tg = agg.games * 2;
console.log('--- per team per game ---');
console.log(`pts ${(agg.pts / tg).toFixed(1)}  FG% ${(100 * agg.fgm / agg.fga).toFixed(1)} (${(agg.fga / tg).toFixed(1)} att)  3P% ${(100 * agg.tpm / agg.tpa).toFixed(1)} (${(agg.tpa / tg).toFixed(1)} att)  FT% ${(100 * agg.ftm / Math.max(1, agg.fta)).toFixed(1)} (${(agg.fta / tg).toFixed(1)} att)`);
console.log(`reb ${(agg.reb / tg).toFixed(1)} (oreb ${(agg.oreb / tg).toFixed(1)})  ast ${(agg.ast / tg).toFixed(1)}  stl ${(agg.stl / tg).toFixed(1)}  blk ${(agg.blk / tg).toFixed(1)}  to ${(agg.to / tg).toFixed(1)}  pf ${(agg.pf / tg).toFixed(1)}  dunks ${(agg.dunks / tg).toFixed(1)}`);
console.log('events/game:', Object.entries(evc).map(([k, v]) => k + ':' + (v / agg.games).toFixed(1)).join(' '));
console.log('shots:', Object.entries(shots).map(([k,o])=>`${k} ${(o.n/tg).toFixed(1)}/g ${(100*o.m/o.n).toFixed(0)}% c=${(o.c/o.n).toFixed(2)}`).join(' | '), ' poss/team/game', (poss/tg).toFixed(1), ' sec/poss', (agg.games*4*qLen/poss).toFixed(1));
console.log('avg wall-clock per game (min):', (agg.time / agg.games / 60).toFixed(1), ' problems:', problems);
