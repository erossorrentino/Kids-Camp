/**
 * Browser smoke test.
 *
 * Serves the game over http (ES modules need a real origin), boots it in
 * headless Chromium with a GPU-less WebGL backend, then drives it through
 * a full match: title -> deploy -> launch -> simulate -> screenshots.
 *
 * Fails loudly on any console error or uncaught exception, which is the
 * only reliable way to catch runtime bugs in this codebase from a shell.
 */
import { chromium } from '/tmp/claude-0/pwtest/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = process.env.SMOKE_OUT || '/tmp/claude-0/shots';
const PORT = 8123;

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise(r => server.listen(PORT, r));
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--no-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });

const errors = [];
const logs = [];
page.on('console', (m) => {
  const t = m.type();
  logs.push(`[${t}] ${m.text()}`);
  if (t === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + (e.stack || e.message)));

const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  try { await fn(); console.log('ok'); }
  catch (e) { console.log('FAIL'); errors.push(`${name}: ${e.message}`); }
};

await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });

await step('boot', async () => {
  await page.waitForFunction(() => window.__game && window.__game.menus, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
});
await page.screenshot({ path: join(OUT, '01-title.png') });

await step('hangar', async () => {
  await page.evaluate(() => window.__game.menus.open('hangar'));
  await page.waitForTimeout(1600);
});
await page.screenshot({ path: join(OUT, '02-hangar.png') });

await step('garage', async () => {
  await page.evaluate(() => window.__game.menus.open('garage'));
  await page.waitForTimeout(700);
});
await page.screenshot({ path: join(OUT, '03-garage.png') });

await step('pilot', async () => {
  await page.evaluate(() => window.__game.menus.open('pilot'));
  await page.waitForTimeout(500);
});
await page.screenshot({ path: join(OUT, '04-pilot.png') });

await step('deploy screen', async () => {
  await page.evaluate(() => window.__game.menus.open('deploy'));
  await page.waitForTimeout(700);
});
await page.screenshot({ path: join(OUT, '05-deploy.png') });

const MAPS_TO_TEST = (process.env.SMOKE_MAPS || 'refinery,duneline,mesa,downtown,station').split(',');
const MODE = process.env.SMOKE_MODE || 'tdm';

for (const mapId of MAPS_TO_TEST) {
  await step(`match on ${mapId}`, async () => {
    await page.evaluate(([mapId, mode]) => {
      window.__game.startMatch({ mode, mapId, difficulty: 'veteran' });
    }, [mapId, MODE]);
    await page.waitForTimeout(5200);
    const st = await page.evaluate(() => {
      const g = window.__game, m = g.match;
      return {
        mechs: m.mechs.length,
        alive: m.mechs.filter(x => x.alive).length,
        time: +m.time.toFixed(1),
        state: m.state,
        colliders: g.arena.colliders.length,
        fps: g.engine.stats.fps,
        draws: g.engine.stats.draw,
        tris: g.engine.stats.tris,
        projectiles: m.combat.projectiles.length,
        events: m.events.length,
        playerAlive: !!m.player?.mech?.alive,
        playerPos: m.player?.mech ? [
          +m.player.mech.position.x.toFixed(1),
          +m.player.mech.position.y.toFixed(1),
          +m.player.mech.position.z.toFixed(1)] : null,
        totalDamage: Math.round(m.players.reduce((a, p) => a + p.damage, 0)),
      };
    });
    console.log('\n   ', JSON.stringify(st));
    if (st.mechs === 0) throw new Error('no mechs spawned');
    if (!st.playerPos) throw new Error('player mech missing');
    if (!isFinite(st.playerPos[0]) || !isFinite(st.playerPos[1])) throw new Error('player position is NaN');
  });
  await page.screenshot({ path: join(OUT, `10-match-${mapId}.png`) });
}

await step('combat frame', async () => {
  // Software rendering runs at a few frames a second, so the countdown has
  // not elapsed in wall time. Start the fight and simulate into the middle
  // of it, then let one frame render so the shot shows a real firefight.
  await page.evaluate(() => {
    const g = window.__game;
    g.match.state = 'live';
    g.match.countdown = 0;
    for (let i = 0; i < 2400; i++) g.match.update(1 / 60, null);
  });
  await page.waitForTimeout(1600);
});
await page.screenshot({ path: join(OUT, '09-combat.png') });

await step('cockpit view', async () => {
  await page.evaluate(() => { window.__game.controller.view = 'cockpit'; });
  await page.waitForTimeout(900);
});
await page.screenshot({ path: join(OUT, '11-cockpit.png') });
await page.evaluate(() => { window.__game.controller.view = 'chase'; });

await step('long sim (60s of match time)', async () => {
  await page.evaluate(() => {
    const g = window.__game;
    // Drive the simulation directly, far faster than real time, to shake
    // out anything that only shows up deep into a match.
    for (let i = 0; i < 3600; i++) g.match.update(1 / 60, g.controller);
  });
  const st = await page.evaluate(() => {
    const m = window.__game.match;
    return {
      state: m.state, time: +m.time.toFixed(1), score: m.score,
      events: m.events.length, alive: m.mechs.filter(x => x.alive).length,
      damage: Math.round(m.players.reduce((a, p) => a + p.damage, 0)),
      kills: m.players.reduce((a, p) => a + p.kills, 0),
    };
  });
  console.log('\n   ', JSON.stringify(st));
  if (st.damage === 0) throw new Error('no damage dealt in 60s of combat — bots are not fighting');
  if (st.kills === 0 && st.damage < 2500) throw new Error(`only ${st.damage} damage and no kills in 60s`);
});
await page.screenshot({ path: join(OUT, '12-after-sim.png') });

await browser.close();
server.close();

if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  for (const e of [...new Set(errors)].slice(0, 25)) console.error('  ' + e);
  process.exit(1);
}
console.log('\nSMOKE PASS — no console or page errors');
