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
  // The bay is the mech preview. It was invisible for a long time because
  // the menu's own background was 97% opaque over it, which no amount of
  // checking the scene graph would have revealed.
  const ok = await page.evaluate(() => {
    const g = window.__game, hs = g.hangarScene;
    const screen = document.querySelector('#ui-root .screen');
    const bg = screen ? getComputedStyle(screen).backgroundImage : '';
    // Pull the largest alpha out of the background gradient stops.
    const alphas = [...bg.matchAll(/rgba?\([^)]*?,\s*([0-9.]+)\s*\)/g)].map(m => parseFloat(m[1]));
    return {
      hasModel: !!hs.model,
      inScene: !!hs.model?.root.parent,
      seeThrough: !!screen?.classList.contains('see-through'),
      maxAlpha: alphas.length ? Math.max(...alphas) : 1,
    };
  });
  if (!ok.hasModel || !ok.inScene) throw new Error('hangar has no mech on the turntable');
  if (!ok.seeThrough) throw new Error('hangar screen is not marked see-through');
  if (ok.maxAlpha > 0.95) throw new Error(`hangar background is opaque (alpha ${ok.maxAlpha}) and hides the bay`);
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

await step('a one-shot kill credits the killer', async () => {
  const r = await page.evaluate(() => {
    const g = window.__game, m = g.match;
    m.state = 'live'; m.countdown = 0;
    const victim = m.mechs.find(x => x.alive && !x.isPlayer && x.healthFraction > 0.99);
    const killer = m.mechs.find(x => x.alive && x !== victim && x.team !== victim.team);
    if (!victim || !killer) return { skipped: true };
    victim.iFrames = 0;
    victim.lastDamagedBy = null;      // never been hit before
    const killsBefore = killer.kills;
    m.applyDamage(victim, killer, 1e6, { location: 'CT' });
    const feed = m.events[m.events.length - 1];
    return { killer: killer.name, feedKiller: feed?.killer, credited: killer.kills - killsBefore };
  });
  if (r.skipped) return;
  if (r.credited !== 1) throw new Error(`killer was not credited (${r.credited} kills)`);
  if (r.feedKiller !== r.killer) throw new Error(`killfeed says "${r.feedKiller}", expected "${r.killer}"`);
  console.log('\n   ', JSON.stringify(r));
});

await step('death -> kill cam -> respawn', async () => {
  const downed = await page.evaluate(() => {
    const g = window.__game;
    g.match.state = 'live';
    g.match.countdown = 0;
    // The combat step above runs forty simulated seconds, so the player may
    // already be down. Put them back in a mech before killing them again.
    if (!g.match.player.mech) {
      g.killCam = null;
      g.hud.hideKillCam();
      g.hud.hideRespawn();
      g.match.respawnPlayer(0);
    }
    const me = g.match.player.mech;
    if (!me) throw new Error('could not put the player back in a mech');
    me.iFrames = 0;   // a fresh spawn is invulnerable for a moment
    const killer = g.match.mechs.find(m => m.alive && m.team !== me.team);
    // Delete the player's mech outright, crediting a live enemy.
    me.lastDamagedBy = killer || null;
    g.match.applyDamage(me, killer, 1e6, { location: 'CT' });
    return { alive: !!g.match.player.mech, killCam: !!g.killCam, killer: g.killCam?.name || null };
  });
  if (downed.alive) throw new Error('player mech survived a million damage');
  if (!downed.killCam) throw new Error('no kill cam after death');

  // The kill cam runs on frame time, which is very slow under software
  // rendering, so drive it directly rather than waiting it out.
  const respawned = await page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 400 && g.killCam; i++) g._updateKillCam(0.05);
    const overlay = document.getElementById('respawn-overlay');
    const shown = overlay && !overlay.classList.contains('hidden');
    const cards = overlay ? overlay.querySelectorAll('.respawn-card').length : 0;
    if (shown && cards) overlay.querySelector('.respawn-card').click();
    return { shown, cards, alive: !!g.match.player.mech, pending: g._pendingRespawn };
  });
  if (!respawned.shown) throw new Error('respawn overlay never appeared');
  if (!respawned.cards) throw new Error('respawn overlay had no mechs to pick');
  if (!respawned.alive) throw new Error('picking a mech did not respawn the player');
  console.log('\n   ', JSON.stringify({ ...downed, ...respawned }));
});
await page.screenshot({ path: join(OUT, '13-respawned.png') });

await step('cockpit view', async () => {
  await page.evaluate(() => { window.__game.controller.view = 'cockpit'; });
  await page.waitForTimeout(1600);
  const ok = await page.evaluate(() => ({
    rigVisible: window.__game.cockpit.visible,
    inScene: !!window.__game.cockpit.group.parent,
    bars: window.__game.cockpit.bars.length,
  }));
  if (!ok.rigVisible || !ok.inScene) throw new Error('cockpit rig did not appear: ' + JSON.stringify(ok));
  if (ok.bars !== 3) throw new Error('cockpit instruments missing');
  // Present is not the same as visible: project each strip and check it
  // lands inside the viewport.
  const onScreen = await page.evaluate(() => {
    const g = window.__game, cam = g.engine.camera;
    cam.updateMatrixWorld();
    return g.cockpit.bars.map(b => {
      const p = b.mesh.getWorldPosition(new b.mesh.position.constructor()).project(cam);
      return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), inside: Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z < 1 };
    });
  });
  if (!onScreen.every(b => b.inside)) {
    throw new Error('cockpit instruments are off screen: ' + JSON.stringify(onScreen));
  }
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
  const wrecks = await page.evaluate(() => {
    const m = window.__game.match;
    return { count: m.wrecks.length, inScene: m.wrecks.filter(w => !!w.root.parent).length, cap: m.maxWrecks };
  });
  console.log('    wrecks', JSON.stringify(wrecks));
  const gun = await page.evaluate(() => {
    const m = window.__game.match;
    m._end('a', 'TEST');
    const rows = m.result.players.filter(p => p.shotsFired > 0);
    return {
      shooters: rows.length,
      worst: Math.min(...rows.map(r => r.accuracy)),
      best: Math.max(...rows.map(r => r.accuracy)),
      anyOverOne: rows.some(r => r.shotsHit > r.shotsFired),
      weapons: rows.filter(r => r.bestWeapon).length,
    };
  });
  console.log('    gunnery', JSON.stringify(gun));
  const comms = await page.evaluate(() => {
    const m = window.__game.match;
    return { lines: m.comms.length, sample: m.comms.slice(-2).map(c => `${c.name}: ${c.text}`) };
  });
  console.log('    comms', JSON.stringify(comms));
  if (!gun.shooters) throw new Error('nobody fired a shot in a minute of combat');
  if (gun.anyOverOne) throw new Error('a pilot hit more times than they fired');
  if (gun.best > 1 || gun.worst < 0) throw new Error('accuracy outside 0..1');
  if (!gun.weapons) throw new Error('no top weapon recorded for any shooter');
  if (st.kills > 0 && wrecks.count === 0) throw new Error('kills happened but no wrecks were left');
  if (wrecks.count !== wrecks.inScene) throw new Error('a wreck was detached from the scene but still tracked');
  if (wrecks.count > wrecks.cap) throw new Error('wreck cap exceeded');
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
