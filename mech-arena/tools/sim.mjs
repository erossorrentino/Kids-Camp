/**
 * Headless match simulator.
 *
 * Boots the game once, then for each arena starts a match and steps the
 * simulation directly -- no waiting on real time and no rendering cost per
 * step. Reports whether mechs actually find each other and fight, which is
 * the failure mode a screenshot cannot show you.
 *
 *   node tools/sim.mjs                 all maps, 90 simulated seconds each
 *   node tools/sim.mjs refinery,mesa   just those
 *   SIM_SECONDS=180 node tools/sim.mjs
 */
import { chromium } from '/tmp/claude-0/pwtest/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 8321;
const SECONDS = +(process.env.SIM_SECONDS || 90);
const MODE = process.env.SIM_MODE || 'tdm';
const DIFF = process.env.SIM_DIFF || 'veteran';
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    const b = await readFile(f);
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
    res.end(b);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(PORT, r));

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push((e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
page.on('console', m => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });

await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game?.booted, null, { timeout: 60000 });

// Stop the render loop: we only care about the simulation, and software
// rasterising ten mechs is two orders of magnitude slower than stepping them.
await page.evaluate(() => {
  const g = window.__game;
  g._renderPaused = true;
  const orig = g.loop;
  g.loop = () => { if (!g._renderPaused) orig(); else requestAnimationFrame(g.loop); };
});

const maps = process.argv[2]
  ? process.argv[2].split(',')
  : await page.evaluate(() => window.__MAP_IDS);

const rows = [];
for (const mapId of maps) {
  const r = await page.evaluate(async ([mapId, mode, diff, seconds]) => {
    const g = window.__game;
    g.startMatch({ mode, mapId, difficulty: diff });
    const m = g.match;
    const dt = 1 / 60;
    const steps = Math.round(seconds / dt);
    const startPos = m.mechs.map(x => x.position.clone());
    let maxMoved = 0, stuck = 0, nanSeen = false;
    for (let i = 0; i < steps; i++) {
      m.update(dt, null);
      if (m.state === 'over') break;
      if ((i % 600) === 0) {
        for (const x of m.mechs) {
          if (!isFinite(x.position.x) || !isFinite(x.position.y) || !isFinite(x.position.z)) nanSeen = true;
        }
      }
    }
    for (let i = 0; i < m.mechs.length; i++) {
      const before = startPos[i];
      if (!before) continue;
      const d = m.mechs[i].position.distanceTo(before);
      maxMoved = Math.max(maxMoved, d);
      if (d < 20) stuck++;
    }
    const damage = Math.round(m.players.reduce((a, p) => a + p.damage, 0));
    const kills = m.players.reduce((a, p) => a + p.kills, 0);
    const deaths = m.players.reduce((a, p) => a + p.deaths, 0);
    const shots = m.combat.projectiles.length;
    const heat = m.mechs.length ? m.mechs.reduce((a, x) => a + x.heatFraction, 0) / m.mechs.length : 0;
    const shutdowns = m.mechs.filter(x => x.shutdown).length;
    return {
      map: mapId, time: +m.time.toFixed(0), state: m.state,
      damage, kills, deaths, shots, stuck, nanSeen,
      maxMoved: +maxMoved.toFixed(0),
      avgHeat: +(heat * 100).toFixed(0), shutdowns,
      score: `${m.score.a}-${m.score.b}`,
    };
  }, [mapId, MODE, DIFF, SECONDS]);
  rows.push(r);
  // The training range has no hostile fire and no human at the controls,
  // so zero damage there is the correct result, not a failure.
  const bad = r.nanSeen || (MODE !== 'training' && r.damage < 500);
  console.log(
    `${bad ? 'BAD ' : '    '}${r.map.padEnd(13)} t=${String(r.time).padStart(3)}s ` +
    `dmg=${String(r.damage).padStart(6)} kills=${String(r.kills).padStart(3)} ` +
    `score=${r.score.padStart(7)} moved=${String(r.maxMoved).padStart(4)}m ` +
    `stuck=${r.stuck} heat=${r.avgHeat}% ${r.nanSeen ? 'NaN!' : ''}`);
}

await browser.close();
server.close();

const bad = rows.filter(r => r.nanSeen || (MODE !== 'training' && r.damage < 500));
const totalKills = rows.reduce((a, r) => a + r.kills, 0);
console.log(`\n${rows.length} arenas, ${totalKills} kills, median damage ` +
  `${median(rows.map(r => r.damage))}`);
if (pageErrors.length) {
  console.error(`\n${pageErrors.length} page error(s):`);
  for (const e of [...new Set(pageErrors)].slice(0, 12)) console.error('  ' + e);
}
if (bad.length) {
  console.error(`\n${bad.length} arena(s) produced almost no combat: ${bad.map(b => b.map).join(', ')}`);
  process.exit(1);
}
if (pageErrors.length) process.exit(1);
console.log('SIM PASS');

function median(a) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
