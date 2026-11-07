// Headless smoke test: boots the built game, plays through the core systems and
// fails on any console error / page exception. Screenshots go to test/shots/.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('playwright')); }
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = 'file://' + path.resolve(here, '../dist/driftlands.html');
const shots = path.resolve(here, 'shots');
fs.mkdirSync(shots, { recursive: true });
const errors = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: path.join(shots, n + '.png') });
const G = (fn, arg) => page.evaluate(fn, arg);
const hold = async (key, ms) => { await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key); };

await page.goto(file);
await page.waitForFunction(() => !!window.__driftlands, null, { timeout: 60000 });
await wait(2500);
await shot('01_title');
await page.click('#btnNew');
await wait(2000);
await shot('02_start_on_deck');
const fps = await G(() => window.__driftlands.fps);
console.log('fps (swiftshader):', fps && fps.toFixed(1));

// walk + jump + double jump + glide off the ship
await hold('KeyW', 600);
await page.keyboard.press('Space'); await wait(250); await page.keyboard.press('Space'); await wait(250); await page.keyboard.press('Space');
await wait(1200);
await shot('03_glide');
console.log('player mode after glide input:', await G(() => window.__driftlands.player.mode));

// teleport near home island ground and test bow + fire + grapple
await G(() => { const g = window.__driftlands; const h = g.islands.home; g.player.respawnOnShip(); g.player.pos.set(h.pos.x, h.pos.y + h.topH(0, 0) + 1, h.pos.z); g.player.vel.set(0, 0, 0); g.player.platform = null; g.player.onGround = false; g.player.camPitch = -0.2; });
await wait(800);
await page.keyboard.press('Digit2');
await page.mouse.move(640, 360);
await page.mouse.down(); await wait(500); await page.mouse.up();
await wait(400);
await page.mouse.down({ button: 'right' }); await wait(100); await page.mouse.up({ button: 'right' });
await wait(1500);
await shot('04_fire_arrow');
console.log('burning fuel nodes:', await G(() => window.__driftlands.combat.burning.length));

// oil + explosion
await G(() => { const g = window.__driftlands; g.combat.clouds.push({ pos: g.player.pos.clone().add(new g.player.pos.constructor(6, 1, 0)), radius: 5, life: 10, ignite: true }); });
await wait(600);
await shot('05_explosion');

// spawn enemies around player and shock them in the rain
await G(() => { const g = window.__driftlands; g.world.weather = 'storm'; g.world.rain = 1; for (let i = 0; i < 3; i++) g.combat.spawn(i ? 'wisp' : 'husk', g.player.pos.clone().add(new g.player.pos.constructor(4 + i * 2, 3, -6)), g.islands.home); g.save.rescued.push('volta'); g.combat.selectElement(2); });
await wait(300);
await G(() => { const g = window.__driftlands; const e = g.combat.enemies[0]; g.combat.hitEnemy(e, 30, 2, null); g.world.strike(g.player.pos.clone().add(new g.player.pos.constructor(10, 0, 0)), 0.2); });
await wait(1500);
await shot('06_combat_storm');

// helm and fly
await G(() => { const g = window.__driftlands; g.combat.clearAll(); g.player.respawnOnShip(); g.player.enterHelm(); });
await page.keyboard.down('KeyW'); await page.keyboard.down('KeyD'); await wait(2500); await page.keyboard.up('KeyD'); await wait(1500); await page.keyboard.up('KeyW');
await shot('07_flying');
console.log('ship speed:', await G(() => window.__driftlands.ship.speed.toFixed(1)));

// rescue nearest survivor via teleport + E
await G(() => { const g = window.__driftlands; g.player.leaveHelm(); const n = g.progress.npcs[0]; const p = g.progress.npcWorld(n); g.player.pos.copy(p).add(new p.constructor(1.5, 0.5, 0)); g.player.platform = null; g.player.onGround = false; });
await wait(700);
await page.keyboard.press('KeyE');
await wait(900);
await shot('08_rescue_dialog');
await page.keyboard.press('KeyE');
console.log('rescued:', await G(() => window.__driftlands.save.rescued.join(',')));

// open chest
await G(() => { const g = window.__driftlands; const isl = g.islands.list.find((i) => i.chests.some((c) => !c.opened)); const c = isl.chests.find((c) => !c.opened); g.player.pos.set(isl.pos.x + c.x + 1.5, isl.pos.y + c.y + 0.5, isl.pos.z + c.z); g.player.onGround = false; });
await wait(700);
await page.keyboard.press('KeyE');
await wait(600);
console.log('resources:', JSON.stringify(await G(() => window.__driftlands.save.res)));

// workshop menu
await G(() => { const g = window.__driftlands; g.save.res.shards += 500; g.save.res.scrap += 200; g.player.respawnOnShip(); });
await wait(400);
await page.keyboard.press('KeyB');
await wait(500);
await shot('09_workshop');
await page.click('button[data-up="0"]');
await page.click('.tabs button[data-tab="crew"]'); await wait(200);
await page.click('.tabs button[data-tab="paint"]'); await wait(200);
await page.click('#btnCloseMenu');
console.log('engine level:', await G(() => window.__driftlands.save.upg.engine));

// storm dive
await G(() => { const g = window.__driftlands; const r = g.storm.rifts[0]; g.ship.pos.set(r.pos.x, r.pos.y + 12, r.pos.z); g.player.respawnOnShip(); g.player.enterHelm(); g.storm.cooldown = 0; });
await wait(800);
console.log('storm active:', await G(() => window.__driftlands.storm.active));
await page.keyboard.down('KeyW'); await wait(2500); await page.keyboard.up('KeyW');
await shot('10_storm_dive');
await G(() => { const g = window.__driftlands; g.storm.collected = 3; g.storm.end('escaped'); });
await wait(600);
await shot('11_storm_summary');
await page.click('#btnSumOk');
console.log('cores after dive:', await G(() => window.__driftlands.save.res.cores));

// sinking + rising
await G(() => { const g = window.__driftlands; g.islands.list.forEach((i) => { i.age = 999; }); g.islands.sinkTimer = 0; });
await wait(500);
await G(() => { const g = window.__driftlands; const s = g.islands.list.find((i) => i.sinking); if (s) s.pos.y = -500; });
await wait(800);
console.log('rising islands:', await G(() => window.__driftlands.islands.list.filter((i) => i.rising).length));

// night time look
await G(() => { const g = window.__driftlands; g.player.leaveHelm(); g.world.timeOfDay = 0.78; g.world.weather = 'clear'; });
await wait(1500);
await shot('12_dusk');
await G(() => { const g = window.__driftlands; g.world.timeOfDay = 0.95; });
await wait(1200);
await shot('13_night');

// let it run for a while to catch intermittent errors
await G(() => { const g = window.__driftlands; g.world.timeOfDay = 0.35; });
await wait(4000);
console.log('fps end:', (await G(() => window.__driftlands.fps)).toFixed(1), 'pixelRatio:', await G(() => window.__driftlands.pr));
await browser.close();
const real = errors.filter((e) => !/GPU stall|swiftshader|WebGL-|Automatic fallback|pointer lock|requestPointerLock|PointerLock/i.test(e));
console.log('console errors/warnings:', real.length);
real.slice(0, 30).forEach((e) => console.log('  ', e));
console.log(errors.length - real.length, 'ignored env messages');
process.exit(real.length ? 1 : 0);
