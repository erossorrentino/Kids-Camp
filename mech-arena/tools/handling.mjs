/**
 * Stick handling test.
 *
 * "Whichever way the stick points is the way the mech moves" -- checked on
 * a light and an assault, because a heavy is where it used to go wrong: an
 * Atlas told to go right kept drifting forward for half a second and took
 * up to three seconds to face the new way.
 *
 * Two checks per chassis, both on game time (a software renderer can take a
 * second per frame):
 *   - from a standstill, each of eight stick directions is the direction of
 *     travel on screen;
 *   - at full speed, swinging the stick round is answered within half a
 *     second, travel and body both.
 *
 *   node tools/handling.mjs
 */
import { chromium } from '/tmp/claude-0/pwtest/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 8143;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(PORT, r));
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});

const failures = [];
const check = (label, ok, detail) => {
  console.log(`    ${ok ? 'ok  ' : 'FAIL'} ${label} — ${detail}`);
  if (!ok) failures.push(label);
};

for (const chassis of ['wasp', 'atlas']) {
  console.log(`\n== ${chassis} ==`);
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', e => failures.push('PAGEERROR ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game?.booted, null, { timeout: 60000 });
  await page.evaluate((c) => {
    const g = window.__game;
    g.progression.hangar[0].chassisId = c;
    g.startMatch({ mode: 'tdm', mapId: 'duneline', difficulty: 'recruit' });
  }, chassis);
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const g = window.__game;
    g.intro = null; g.match.countdown = 0;
    g.setTouchMode(true);
    g.controller.moveStyle = 'steer'; g.controller.aimAssist = 0; g.controller.autoFire = false;
    // Nobody shoots the test pilot: a stagger would read as bad steering.
    for (const m of g.match.mechs) if (m !== g.match.player.mech) m.position.x += 2000;
  });

  const simWait = async (s) => {
    const t0 = await page.evaluate(() => window.__game.match.time);
    await page.waitForFunction(({ t0, s }) => window.__game.match.time - t0 >= s, { t0, s }, { timeout: 90000, polling: 30 });
  };
  /* Travel and body error against the stick, in degrees, in SCREEN space.
   * Left and right are taken from the camera's own orientation, never from
   * the game's idea of which way is right: this test used to share the
   * game's convention, and passed for weeks while stick-left walked the
   * mech right across the screen. */
  const errors = (x, z) => page.evaluate(({ x, z }) => {
    const g = window.__game, m = g.match.player.mech, cam = g.engine.camera;
    const V = cam.position.constructor;
    const R = new V(1, 0, 0).applyQuaternion(cam.quaternion).setY(0).normalize();
    const F = new V(0, 0, -1).applyQuaternion(cam.quaternion).setY(0).normalize();
    const d = (p, q) => Math.atan2(Math.sin(p - q), Math.cos(p - q));
    const onScreen = (wx, wz) => Math.atan2(wx * R.x + wz * R.z, wx * F.x + wz * F.z);
    const want = Math.atan2(x, z);
    const vx = m.velocity.x, vz = m.velocity.z;
    return {
      move: Math.abs(d(onScreen(vx, vz), want)) * 57.3,
      body: Math.abs(d(onScreen(Math.sin(m.yaw), Math.cos(m.yaw)), want)) * 57.3,
      speed: Math.hypot(vx, vz),
    };
  }, { x, z });

  /** Where the mech is on the screen, in pixels: the ground truth. */
  const screenX = () => page.evaluate(() => {
    const g = window.__game, m = g.match.player.mech;
    const p = m.position.clone(); p.y += m.height * 0.5; p.project(g.engine.camera);
    return (p.x * 0.5 + 0.5) * innerWidth;
  });
  const stick = (x, z) => page.evaluate(({ x, z }) => window.__game.input.setTouchMove(x, z), { x, z });

  // The plainest possible check: stick left, the mech moves left in the
  // picture; stick right, it moves right. Both handling styles, because
  // they reach the legs by different roads.
  for (const style of ['strafe', 'steer']) {
    await page.evaluate((s) => { window.__game.controller.moveStyle = s; }, style);
    for (const [name, x, sign] of [['left', -1, -1], ['right', 1, 1]]) {
      await stick(0, 0);
      await simWait(0.6);
      const x0 = await screenX();
      await stick(x, 0);
      await simWait(0.8);
      const x1 = await screenX();
      check(`${style}: stick ${name} moves the mech ${name} on screen`, Math.sign(x1 - x0) === sign && Math.abs(x1 - x0) > 5,
        `${x0.toFixed(0)}px -> ${x1.toFixed(0)}px`);
    }
  }

  // Eight directions from a standstill.
  const DIRS = [['up', 0, 1], ['up-right', 0.707, 0.707], ['right', 1, 0], ['down-right', 0.707, -0.707],
                ['down', 0, -1], ['down-left', -0.707, -0.707], ['left', -1, 0], ['up-left', -0.707, 0.707]];
  const worst = { move: 0, name: '' };
  for (const [name, x, z] of DIRS) {
    await stick(0, 0);
    await page.waitForFunction(() => {
      const m = window.__game.match.player.mech;
      return Math.hypot(m.velocity.x, m.velocity.z) < 1;
    }, null, { timeout: 90000, polling: 30 });
    await stick(x, z);
    await simWait(0.6);
    const e = await errors(x, z);
    if (e.move > worst.move) { worst.move = e.move; worst.name = name; }
  }
  check('every stick direction is the direction of travel', worst.move < 5,
    `worst ${worst.move.toFixed(1)}° (${worst.name})`);

  // Swinging the stick round at speed.
  await stick(0, 1);
  await simWait(1.2);
  for (const [name, x, z] of [['up to right', 1, 0], ['right to down', 0, -1], ['down to left', -1, 0]]) {
    await stick(x, z);
    await simWait(0.5);
    const e = await errors(x, z);
    check(`${name} answered within half a second`, e.move < 8 && e.body < 10,
      `travel ${e.move.toFixed(1)}° off, body ${e.body.toFixed(1)}° off, speed ${e.speed.toFixed(1)}`);
  }
  await page.close();
}

await browser.close();
server.close();
if (failures.length) {
  console.log(`\nHANDLING FAIL (${failures.length})`);
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('\nHANDLING PASS');
