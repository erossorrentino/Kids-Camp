/**
 * Phone and tablet test.
 *
 * Loads the *published* page -- the artifact build inside the host's own
 * document skeleton, light background and all -- at phone, tablet and
 * desktop sizes, and checks the two things a player notices first:
 *
 *   1. the frame is painted (a page that never draws shows the host's white
 *      background through a transparent canvas), and
 *   2. the mech in the hangar is on screen and not behind a panel.
 *
 * Then it plays the game with a finger: stick, look drag and trigger.
 *
 *   node tools/mobile.mjs
 */
import { chromium, devices } from '/tmp/claude-0/pwtest/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { decodePNG, stats } from './png.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist-artifact');
const OUT = process.env.SMOKE_OUT || '/tmp/claude-0/shots';
const PORT = 8142;

const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json' };

/* The Artifact host wraps the published fragment in this. It sets a light
   page background, which is precisely what shows through if the game fails
   to paint -- so the test keeps it. */
const HOST_HEAD = `<!doctype html><html><head><meta charset=utf8>`
  + `<meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">`
  + `<style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);`
  + `padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;padding:0;`
  + `font:14px -apple-system,sans-serif;background:#faf9f5;color:#141413}`
  + `[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n`;

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/' || p === '/index.html') {
      const page = await readFile(join(DIST, 'index.html'), 'utf8');
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(HOST_HEAD + page + '\n</body></html>');
      return;
    }
    const file = join(DIST, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(PORT, r));
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--no-sandbox', '--disable-dev-shm-usage', '--ignore-gpu-blocklist'],
});

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`    ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures.push(`${label}${detail ? ' — ' + detail : ''}`);
};

const shot = async (page, name) => {
  const file = join(OUT, name + '.png');
  const buf = await page.screenshot({ path: file });
  return decodePNG(buf);
};

const PROFILES = [
  { name:'phone',   viewport:{ width:390,  height:780  }, touch:true,  scale:2 },
  { name:'tablet',  viewport:{ width:820,  height:1180 }, touch:true,  scale:2 },
  { name:'desktop', viewport:{ width:1440, height:810  }, touch:false, scale:1 },
];

for (const prof of PROFILES) {
  console.log(`\n== ${prof.name} ${prof.viewport.width}x${prof.viewport.height}${prof.touch ? ' touch' : ''} ==`);
  const ctx = await browser.newContext({
    viewport: prof.viewport,
    deviceScaleFactor: prof.scale,
    hasTouch: prof.touch,
    isMobile: prof.touch,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + (e.stack || e.message).split('\n')[0]));
  page.on('console', m => { if (m.type() === 'error') errors.push('console ' + m.text()); });
  // The browser asks for a favicon the served fragment does not have; the
  // real host supplies one. Everything else that 404s is a broken link.
  page.on('response', (r) => {
    if (r.status() === 404 && !/favicon/.test(r.url())) errors.push('404 ' + r.url());
  });
  const ignorable = (e) => /Failed to load resource/.test(e) && !errors.some(x => x.startsWith('404 '));

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
  let booted = true;
  try { await page.waitForFunction(() => window.__game?.booted, null, { timeout: 40000 }); }
  catch { booted = false; }
  check('boots', booted);
  if (!booted) { await ctx.close(); continue; }
  await page.waitForTimeout(1200);

  check('no boot-error panel', !(await page.evaluate(() => {
    const b = document.getElementById('boot-error');
    return !!b && !b.classList.contains('hidden');
  })));

  const picked = await page.evaluate(() => window.__game.progression.settings.quality);
  check('the device picks a preset it can carry', prof.touch ? picked === 'low' : !!picked, picked);

  // ---- the page is painted, not showing the host's white page through --
  let img = await shot(page, `m-${prof.name}-01-title`);
  let st = stats(img);
  check('title screen is not white', st.white < 0.02 && st.mean < 0.5,
    `white ${(st.white * 100).toFixed(1)}% mean ${st.mean.toFixed(2)}`);

  // ---- hangar ----------------------------------------------------------
  await page.evaluate(() => window.__game.menus.open('hangar'));
  await page.waitForTimeout(1400);
  img = await shot(page, `m-${prof.name}-02-hangar`);
  st = stats(img);
  check('hangar is not white', st.white < 0.02, `white ${(st.white * 100).toFixed(1)}%`);

  const bay = await page.evaluate(() => {
    const g = window.__game;
    const hs = g.hangarScene;
    const el = document.querySelector('[data-stage-window]');
    const r = el ? el.getBoundingClientRect() : null;
    if (!hs.model || !r) return { ok:false, reason: hs.model ? 'no stage element' : 'no model' };
    // Where the mech's centre of mass lands on screen.
    const box = hs.model.root;
    box.updateWorldMatrix(true, false);
    const p = box.position.clone();
    p.y += (hs.frameHeight || 10) * 0.5;
    p.project(g.engine.camera);
    const x = (p.x * 0.5 + 0.5) * innerWidth;
    const y = (-p.y * 0.5 + 0.5) * innerHeight;
    const hit = document.elementFromPoint(Math.round(x), Math.round(y));
    return {
      ok: true,
      stage: { x:r.left, y:r.top, w:r.width, h:r.height },
      screen: { x, y },
      inStage: x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8,
      onScreen: x > 0 && x < innerWidth && y > 0 && y < innerHeight && p.z < 1,
      covered: !!hit?.closest?.('.panel'),
      coveredBy: hit ? (hit.className || hit.tagName) : null,
    };
  });
  check('hangar has a stage and a model', bay.ok, bay.reason || '');
  if (bay.ok) {
    check('mech is on screen', bay.onScreen, JSON.stringify(bay.screen));
    check('mech is inside the stage', bay.inStage,
      `mech ${bay.screen.x.toFixed(0)},${bay.screen.y.toFixed(0)} stage ${JSON.stringify(bay.stage)}`);
    check('mech is not behind a panel', !bay.covered, String(bay.coveredBy));
    // Pixels: the bay is lit, so the area around the mech must have contrast.
    const s = prof.scale;
    const near = stats(img, (bay.screen.x - 40) * s, (bay.screen.y - 40) * s, 80 * s, 80 * s);
    check('something is drawn where the mech is', near.sd > 0.012 && near.max > 0.10,
      `sd ${near.sd.toFixed(3)} max ${near.max.toFixed(2)}`);
  }

  // ---- the narrow-screen tabs -------------------------------------------
  if (prof.viewport.width <= 880) {
    const tabs = await page.evaluate(() => {
      const t = [...document.querySelectorAll('[data-htab]')];
      return { count: t.length, visible: t.length ? getComputedStyle(t[0].parentElement).display !== 'none' : false };
    });
    check('hangar tabs are offered', tabs.count === 3 && tabs.visible, JSON.stringify(tabs));
    await page.click('[data-htab="view"]');
    await page.waitForTimeout(700);
    const hidden = await page.evaluate(() =>
      [...document.querySelectorAll('.hangar-layout > .panel')].every(p => getComputedStyle(p).display === 'none'));
    check('VIEW MECH clears the panels', hidden);
    await shot(page, `m-${prof.name}-03-viewmech`);
    await page.click('[data-htab="loadout"]');
    await page.waitForTimeout(500);
  } else {
    const cols = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.hangar-layout')).gridTemplateColumns);
    check('desktop keeps three columns', cols.split(' ').length === 3, cols);
  }

  // ---- a match, played with a finger ------------------------------------
  await page.evaluate(() => window.__game.startMatch({ mode:'tdm', mapId:'foundry', difficulty:'regular' }));
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const g = window.__game; if (g.intro) g.intro = null; g.match.countdown = 0; });
  await page.waitForTimeout(600);

  const tc = await page.evaluate(() => {
    const el = document.getElementById('touch-controls');
    return { present: !!el, shown: el && !el.classList.contains('hidden'),
             bodyClass: document.body.classList.contains('touch-ui'),
             aimMode: window.__game.input.aimMode };
  });
  if (prof.touch) {
    check('on-screen controls appear', tc.shown && tc.bodyClass, JSON.stringify(tc));
    check('aiming switches to drag', tc.aimMode === 'touch', tc.aimMode);
    const handling = await page.evaluate(() => {
      const c = window.__game.controller;
      return { style:c.moveStyle, assist:c.aimAssist, auto:c.autoFire, group:c.fireGroup };
    });
    check('arena handling on a stick', handling.style === 'steer' && handling.assist > 0
      && handling.auto === true && handling.group === 'all', JSON.stringify(handling));

    // Walk: press the stick and hold it forward.
    const stick = await page.locator('#tc-stick').boundingBox();
    const cx = stick.x + stick.width / 2, cy = stick.y + stick.height / 2;
    const before = await page.evaluate(() => {
      const m = window.__game.match.player.mech;
      return { x:m.position.x, z:m.position.z, yaw:m.aimYaw };
    });
    await page.touchscreen.tap(cx, cy);     // wakes audio + proves it is tappable
    const t = await page.context().newCDPSession(page);
    // Deflect by the stick's own radius, so both screen sizes get a full push.
    const throwPx = stick.width * 0.45;
    await t.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{ x:cx, y:cy, id:1 }] });
    await t.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{ x:cx, y:cy - throwPx, id:1 }] });
    await page.waitForTimeout(1600);
    const moving = await page.evaluate(() => {
      const m = window.__game.match.player.mech;
      return { speed:Math.hypot(m.velocity.x, m.velocity.z), stick:window.__game.input.touch.move };
    });
    await t.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
    check('the stick walks the mech', moving.speed > 1.5,
      `speed ${moving.speed.toFixed(1)} stick ${JSON.stringify(moving.stick)}`);

    // Push the stick left: the mech has to travel left across the screen,
    // not sidestep while still facing forward. Let the previous run's
    // momentum bleed off first, or it shows up as forward travel.
    await page.waitForFunction(() => {
      const m = window.__game.match.player.mech;
      return Math.hypot(m.velocity.x, m.velocity.z) < 4;
    }, null, { timeout: 6000 }).catch(() => {});
    const from = await page.evaluate(() => {
      const m = window.__game.match.player.mech;
      return { x:m.position.x, z:m.position.z, yaw:m.aimYaw, style:window.__game.controller.moveStyle };
    });
    await t.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{ x:cx, y:cy, id:4 }] });
    await t.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{ x:cx - throwPx, y:cy, id:4 }] });
    await page.waitForTimeout(2000);
    const to = await page.evaluate(() => {
      const m = window.__game.match.player.mech;
      return { x:m.position.x, z:m.position.z, yaw:m.yaw };
    });
    await t.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
    // Camera-left in world space, from the heading the player had when they pushed.
    const dx = to.x - from.x, dz = to.z - from.z;
    const leftX = -Math.cos(from.yaw), leftZ = Math.sin(from.yaw);
    const leftward = dx * leftX + dz * leftZ;
    const forward = dx * Math.sin(from.yaw) + dz * Math.cos(from.yaw);
    // How far it gets depends on what is in the way; the direction does not.
    check('stick left sends the mech left', from.style === 'steer' && leftward > 1 && leftward > Math.abs(forward),
      `left ${leftward.toFixed(1)}m forward ${forward.toFixed(1)}m style ${from.style}`);
    // And the legs face the way it is travelling, which is what makes it read
    // as walking left rather than crabbing sideways. Measured against the
    // actual travel, since aim assist may have turned the torso meanwhile.
    const facing = await page.evaluate(() => window.__game.match.player.mech.yaw);
    const travel = Math.atan2(dx, dz);
    const dAng = Math.abs(Math.atan2(Math.sin(facing - travel), Math.cos(facing - travel)));
    check('and the legs turn to follow', dAng < 0.9, `${dAng.toFixed(2)} rad off travel`);

    // Look: drag across the middle of the viewport.
    const midX = prof.viewport.width / 2, midY = prof.viewport.height * 0.42;
    await t.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{ x:midX, y:midY, id:2 }] });
    await t.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{ x:midX - 90, y:midY, id:2 }] });
    await t.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => window.__game.match.player.mech.aimYaw);
    check('dragging turns the torso', Math.abs(after - before.yaw) > 0.05,
      `${before.yaw.toFixed(2)} -> ${after.toFixed(2)}`);

    // Trigger. Fire everything, so the check does not depend on which gun
    // happens to be selected or how long its cycle is.
    const snap = () => page.evaluate(() => {
      const m = window.__game.match.player.mech;
      return {
        shots: m.shotsFired,
        heat: m.heat,
        ammo: m.weapons.reduce((a, w) => a + (w && w.ammo > 0 ? w.ammo : 0), 0),
        cooling: m.weapons.some(w => w && w.cooldown > 0),
      };
    });
    const gun = await page.locator('#tc-group').boundingBox();
    await page.touchscreen.tap(gun.x + gun.width / 2, gun.y + gun.height / 2);
    const fire = await page.locator('#tc-fire').boundingBox();
    const fx = fire.x + fire.width / 2, fy = fire.y + fire.height / 2;
    const before2 = await snap();
    await t.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{ x:fx, y:fy, id:3 }] });
    const held = await page.evaluate(() => window.__game.input.mouse.left);
    await page.waitForTimeout(1800);
    const after2 = await snap();
    await t.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
    check('the trigger pulls', held, 'mouse.left while held');
    const didFire = after2.shots > before2.shots || after2.heat > before2.heat + 0.5
      || after2.ammo < before2.ammo || after2.cooling;
    check('weapons actually fire', didFire,
      `shots ${before2.shots}->${after2.shots} heat ${before2.heat.toFixed(1)}->${after2.heat.toFixed(1)} `
      + `ammo ${before2.ammo}->${after2.ammo} cooling ${after2.cooling}`);
    await shot(page, `m-${prof.name}-04-match`);
  } else {
    check('no on-screen controls on a desktop', !tc.shown);
    await shot(page, `m-${prof.name}-04-match`);
  }

  img = decodePNG(await page.screenshot());
  st = stats(img);
  check('the match is not white', st.white < 0.03 && st.mean < 0.6,
    `white ${(st.white * 100).toFixed(1)}% mean ${st.mean.toFixed(2)}`);

  // ---- losing the graphics context ------------------------------------
  // What a phone does when it runs out of texture memory. The canvas turns
  // transparent while the context is away, so without a painted background
  // and a message this is exactly the "everything went white" report.
  const lost = await page.evaluate(() => {
    const gl = window.__game.engine.renderer.getContext();
    window.__lose = gl.getExtension('WEBGL_lose_context');
    if (!window.__lose) return false;
    window.__lose.loseContext();
    return true;
  });
  if (lost) {
    await page.waitForTimeout(800);
    check('a lost context says so', await page.evaluate(() =>
      !document.getElementById('gpu-notice').classList.contains('hidden')));
    const ls = stats(decodePNG(await page.screenshot()));
    check('a lost context does not go white', ls.white < 0.05, `white ${(ls.white * 100).toFixed(1)}%`);
    await page.evaluate(() => window.__lose.restoreContext());
    await page.waitForTimeout(3000);
    const back = await page.evaluate(() => ({
      stillLost: window.__game.engine.contextLost,
      quality: window.__game.progression.settings.quality,
      draws: window.__game.engine.stats.draw,
      noticeGone: document.getElementById('gpu-notice').classList.contains('hidden'),
      failPanel: !document.getElementById('boot-error').classList.contains('hidden'),
    }));
    check('the game comes back', !back.stillLost && back.draws > 0 && back.noticeGone && !back.failPanel,
      JSON.stringify(back));
    check('it comes back lighter', back.quality === 'low', back.quality);
    const rs = stats(decodePNG(await page.screenshot(), ));
    check('and paints again', rs.white < 0.05 && rs.sd > 0.01,
      `white ${(rs.white * 100).toFixed(1)}% sd ${rs.sd.toFixed(3)}`);
    await shot(page, `m-${prof.name}-05-recovered`);
  }

  const real = errors.filter(e => !ignorable(e));
  check('no console or page errors', real.length === 0, real.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
server.close();

if (failures.length) {
  console.log(`\nMOBILE FAIL (${failures.length})`);
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('\nMOBILE PASS');
