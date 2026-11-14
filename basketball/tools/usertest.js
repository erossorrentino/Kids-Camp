// Plays full games through the human-input path (G.input) with a scripted "user",
// to catch stalls or broken control logic that CPU-vs-CPU tests never touch.
const fs = require('fs'), vm = require('vm'), path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'js');
let code = ['00-config.js', '01-util.js', '02-sim-core.js', '03-sim-ai.js'].map((f) => fs.readFileSync(path.join(SRC, f), 'utf8').replace(/^'use strict';/, '')).join('\n');
code += '\n;globalThis.__api = { G, EV, TEAMS, newGame, stepGame, DT, CT, resumeHalftime, hoopX, distRim };';
const ctx = vm.createContext({ console, Math, Date, Object, Array, Number, JSON });
vm.runInContext(code, ctx);
const { G, EV, TEAMS, newGame, stepGame, DT, CT, resumeHalftime, hoopX, distRim } = ctx.__api;
const N = +(process.argv[2] || 4), diff = process.argv[3] || 'pro';
let tot = { us: 0, them: 0, grades: {}, ev: {} };
for (let g = 0; g < N; g++) {
  newGame({ home: TEAMS[g % 8], away: TEAMS[(g + 3) % 8], userTeam: 0, difficulty: diff, qLen: 120, seed: 500 + g });
  let t = 0, holdShot = 0, lastKey = '', stall = 0, maxStall = 0, stallKey = '';
  while (G.state !== 'final' && t < 60 * 60 * 40) {
    const I = G.input, p = G.ctrl;
    I.mx = 0; I.mz = 0; I.sprint = false;
    if (G.state === 'halftime') resumeHalftime();
    if (p && G.state === 'live') {
      if (p.hasBall && p.act !== 'shoot') {
        const hx = hoopX(p.team), d = distRim(p);
        const dx = hx - p.x, dz = -p.z, l = Math.hypot(dx, dz) || 1;
        I.mx = dx / l; I.mz = dz / l; I.sprint = d > 8;
        if (holdShot === 0 && (d < 9 || (d < 25 && Math.random() < 0.004) || G.shotClock < 4)) { I.pShoot = true; I.shoot = true; holdShot = 1; }
        else if (Math.random() < 0.006) I.pPass = true;
        else if (Math.random() < 0.005) I.pMove = true;
      } else if (p.act === 'shoot' && p.shot && p.shot.timed && !p.shot.released) {
        // release near the ideal with some human error
        I.shoot = p.actT < p.shot.ideal + (Math.random() - 0.5) * 0.06;
      } else { I.shoot = false; holdShot = 0; }
      if (!p.hasBall && G.offense !== 0) {
        const h = G.ball.holder;
        if (h) { const dx = h.x - p.x, dz = h.z - p.z, l = Math.hypot(dx, dz) || 1; if (l > 3) { I.mx = dx / l; I.mz = dz / l; I.sprint = l > 10; } if (l < 3.5 && Math.random() < 0.01) I.pMove = true; }
        else { const b = G.ball; const dx = b.x - p.x, dz = b.z - p.z, l = Math.hypot(dx, dz) || 1; I.mx = dx / l; I.mz = dz / l; I.sprint = true; }
        if (Math.random() < 0.002) I.pPass = true;
      }
      if (!p.hasBall && G.offense === 0 && G.ball.state === 'held' && Math.random() < 0.003) I.pPass = true;
    }
    if (G.state === 'ft' && G.ft && G.ft.shooter === p && G.ft.placed) {
      if (p.act !== 'shoot') { I.pShoot = true; I.shoot = true; }
      else if (p.shot && p.shot.timed) I.shoot = p.actT < p.shot.ideal + (Math.random() - 0.5) * 0.05;
    }
    stepGame(DT); t++;
    for (const e of EV) { tot.ev[e.type] = (tot.ev[e.type] || 0) + 1; if (e.type === 'release' && e.user) tot.grades[e.grade] = (tot.grades[e.grade] || 0) + 1; }
    EV.length = 0;
    const key = G.state + '|' + G.ball.state + '|' + (G.dead ? G.dead.phase : '') + '|' + (G.ball.holder ? G.ball.holder.id : '');
    if (key === lastKey) { stall += DT; if (stall > maxStall) { maxStall = stall; stallKey = key; } } else { lastKey = key; stall = 0; }
  }
  const us = G.teams[0], them = G.teams[1];
  const ustats = us.players.reduce((a, p) => { for (const k in p.st) a[k] = (a[k] || 0) + p.st[k]; return a; }, {});
  console.log(`G${g} ${G.state} Q${G.quarter} USER ${us.def.id} ${us.score} - ${them.score} ${them.def.id} | user fg ${ustats.fgm}/${ustats.fga} 3p ${ustats.tpm}/${ustats.tpa} ft ${ustats.ftm}/${ustats.fta} ast ${ustats.ast} to ${ustats.to} stl ${ustats.stl} | maxStall ${maxStall.toFixed(1)}s [${stallKey}]`);
  tot.us += us.score; tot.them += them.score;
}
console.log('avg score user', (tot.us / N).toFixed(1), 'cpu', (tot.them / N).toFixed(1));
console.log('user release grades', JSON.stringify(tot.grades));
console.log('events', Object.entries(tot.ev).filter(([k]) => !['dribble', 'jump', 'catch', 'pass', 'bounce', 'rim', 'backboard'].includes(k)).map(([k, v]) => k + ':' + (v / N).toFixed(1)).join(' '));
