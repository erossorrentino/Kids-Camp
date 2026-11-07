// Renders curated gameplay moments to test/shots/scene_*.png (sim-stepped, deterministic framing).
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('playwright')); }
const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.resolve(here, 'shots'); fs.mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('file://' + path.resolve(here, '../dist/driftlands.html'));
await page.waitForFunction(() => !!window.__driftlands, null, { timeout: 60000 });
await page.click('#btnNew');
await page.evaluate(() => { const g = window.__driftlands; g.renderer.setAnimationLoop(null); g.setPR(1); document.getElementById('toasts').innerHTML = ''; g.ui.toasts.forEach((t) => t.el.remove()); g.ui.toasts = []; });
async function scene(name, setup) {
  await page.evaluate(setup);
  await page.evaluate(() => { const g = window.__driftlands; g.ui.toasts.forEach((t) => t.el.remove()); g.ui.toasts = []; g.composer.render(); });
  await page.screenshot({ path: path.join(shots, `scene_${name}.png`) });
  console.log('shot', name);
}
await scene('1_island_walk', () => {
  const g = window.__driftlands, p = g.player, h = g.islands.list.find((i) => !i.small && i.tier === 0 && !i.home) || g.islands.home;
  g.world.timeOfDay = 0.33; g.world.weather = 'clear'; g.world.rain = 0; g.world.stormFactor = 0; g.world.weatherTimer = 999;
  p.pos.set(h.pos.x + 4, h.pos.y + h.topH(4, 0) + 1, h.pos.z); p.vel.set(0, 0, 0); p.onGround = false; p.platform = null; p.mode = 'normal';
  p.camYaw = 0.6; p.camPitch = 0.22; p.camInit = false; g.step(90);
});
await scene('2_glide', () => {
  const g = window.__driftlands, p = g.player, h = g.islands.home;
  p.pos.set(h.pos.x - 30, h.pos.y + 30, h.pos.z + 20); p.vel.set(0, 0, 0); p.onGround = false; p.platform = null;
  p.mode = 'glide'; p.glider.visible = true; p.camYaw = -0.9; p.camPitch = 0.12; p.camInit = false; g.step(50);
});
await scene('3_fire', () => {
  const g = window.__driftlands, p = g.player, h = g.islands.home;
  p.mode = 'normal'; p.glider.visible = false;
  const f = h.fuel.filter((x) => x.kind === 'grass').sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
  const dir = Math.atan2(f.z, f.x);
  const px = f.x - Math.cos(dir) * 0 - 12, pz = f.z;
  p.pos.set(h.pos.x + px, h.pos.y + h.topH(px, pz) + 0.5, h.pos.z + pz); p.vel.set(0, 0, 0); p.onGround = false; p.platform = null;
  g.combat.igniteAt(new p.pos.constructor(h.pos.x + f.x, h.pos.y + f.y + 0.5, h.pos.z + f.z), 4);
  p.camYaw = -Math.PI / 2; p.camPitch = 0.25; p.camInit = false; g.step(300);
});
await scene('4_combat', () => {
  const g = window.__driftlands, p = g.player;
  g.combat.clearAll();
  g.save.rescued.push('volta');
  for (let i = 0; i < 3; i++) g.combat.spawn('wisp', p.pos.clone().add(new p.pos.constructor(-10 + i * 4, 5 + i, -8 - i * 3)), null);
  g.combat.spawn('husk', p.pos.clone().add(new p.pos.constructor(-6, 0, -3)), g.islands.islandUnder(p.pos.x, p.pos.z));
  p.camYaw = -Math.PI / 2 + 0.4; p.camPitch = 0.12; g.step(40);
  g.combat.element = 2; g.combat.hitEnemy(g.combat.enemies[0], 8, 2, null);
  g.combat.explode(p.pos.clone().add(new p.pos.constructor(-7, 1, -10)), 6, 0);
  g.step(4);
});
await scene('5_ship_cabins', () => {
  const g = window.__driftlands, p = g.player;
  g.combat.clearAll();
  for (const n of g.progress.npcs.slice(0, 5)) { g.progress.rescue(n); g.ui.closeDialog(); }
  g.ship.buildGarden(); g.ship.buildLookout();
  g.world.timeOfDay = 0.72;
  p.respawnOnShip(); p.enterHelm(); g.input.keys.add('KeyW'); g.step(200); g.input.keys.delete('KeyW');
  p.helmYawOffset = 2.3; p.camPitch = 0.35; g.step(3); p.helmYawOffset = 2.3; p.helmIdle = 0; g.step(1);
});
await scene('6_storm_dive', () => {
  const g = window.__driftlands, p = g.player;
  const r = g.storm.rifts[0]; g.ship.pos.set(r.pos.x, -30, r.pos.z); g.storm.cooldown = 0; g.step(3);
  g.step(120); p.helmYawOffset = 0.5; p.camPitch = 0.2;  g.step(2);
});
await scene('7_night', () => {
  const g = window.__driftlands, p = g.player;
  g.storm.end('escaped'); document.getElementById('summary').classList.add('hidden'); g.state = 'play';
  g.world.timeOfDay = 0.9; g.step(60); p.helmYawOffset = 0.0; p.camPitch = 0.25; g.step(2);
});
console.log('errors:', errs.length, errs.slice(0, 5));
await browser.close();
