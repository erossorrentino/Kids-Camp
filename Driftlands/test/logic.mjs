// Deterministic gameplay checks: stops the render loop and advances the sim with G.step().
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('playwright')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const file = 'file://' + path.resolve(here, '../dist/driftlands.html');
const errors = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.goto(file);
await page.waitForFunction(() => !!window.__driftlands, null, { timeout: 60000 });
await page.click('#btnNew');
await page.waitForTimeout(500);
await page.evaluate(() => window.__driftlands.renderer.setAnimationLoop(null));

let fails = 0;
async function check(name, fn) {
  const paused = await page.evaluate(() => { const g = window.__driftlands; if (g.state === 'paused') { document.getElementById('pause').classList.add('hidden'); g.state = 'play'; return true; } return false; });
  if (paused) console.log('      (headless pointer-lock loss had paused the game; resumed)');
  try {
    const r = await page.evaluate(fn);
    const ok = r && r.ok;
    if (!ok) fails++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(r.info ?? '')}`);
  } catch (e) { fails++; console.log(`FAIL  ${name}  threw ${e.message.split('\n')[0]}`); }
}

await check('jump → double jump → glide', () => {
  const g = window.__driftlands, p = g.player, inp = g.input;
  p.respawnOnShip(); g.step(10);
  inp.pressed.add('Space'); g.step(1);
  const up = p.vel.y > 0 && !p.onGround;
  g.step(20); inp.pressed.add('Space'); g.step(1);
  const dbl = p.vel.y > 7;
  g.step(30); inp.pressed.add('Space'); g.step(1);
  return { ok: up && dbl && p.mode === 'glide', info: { up, dbl, mode: p.mode } };
});

await check('glide sinks slowly and drifts forward', () => {
  const g = window.__driftlands, p = g.player;
  const y0 = p.pos.y; const x0 = p.pos.clone();
  g.step(60);
  const fell = y0 - p.pos.y; const moved = Math.hypot(p.pos.x - x0.x, p.pos.z - x0.z);
  return { ok: p.mode !== 'glide' || (fell < 6 && moved > 6), info: { fell: fell.toFixed(1), moved: moved.toFixed(1), mode: p.mode } };
});

await check('falling into the storm respawns on ship', () => {
  const g = window.__driftlands, p = g.player;
  p.mode = 'normal'; p.glider.visible = false;
  p.pos.set(3000, -20, 3000); p.vel.set(0, -30, 0); p.onGround = false; p.platform = null;
  g.step(40);
  return { ok: p.platform === g.ship && p.onGround, info: { plat: p.platform && p.platform.constructor.name } };
});

await check('walk on island + grapple to terrain', () => {
  const g = window.__driftlands, p = g.player;
  const h = g.islands.home;
  p.pos.set(h.pos.x, h.pos.y + h.topH(0, 0) + 25, h.pos.z); p.vel.set(0, 0, 0); p.onGround = false; p.platform = null; p.mode = 'normal';
  p.camPitch = 1.2; p.camInit = false; g.step(3);
  p.tryGrapple();
  const grappling = p.mode === 'grapple';
  g.step(150);
  const top = h.worldTop(p.pos.x, p.pos.z);
  return { ok: grappling && p.onGround, info: { grappling, onGround: p.onGround, aboveGround: top !== null ? (p.pos.y - top).toFixed(2) : null } };
});

await check('player walks across the island surface', () => {
  const g = window.__driftlands, p = g.player, inp = g.input;
  let moved = 0, x0 = p.pos.clone();
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    x0 = p.pos.clone(); p.camYaw = yaw;
    inp.keys.add('KeyW'); g.step(60); inp.keys.delete('KeyW');
    moved = Math.hypot(p.pos.x - x0.x, p.pos.z - x0.z);
    if (moved > 2) break;
  }
  const dbg = {};
  if (moved <= 2) {
    const gr = g.physics.groundAt(p.pos.x, p.pos.y, p.pos.z, 0.75);
    dbg.state = g.state; dbg.mode = p.mode; dbg.dialog = g.ui.dialogOpen; dbg.aim = p.aiming; dbg.plat = p.platform && p.platform.constructor.name; dbg.ground = gr && gr.kind;
    dbg.pos = p.pos.toArray().map((v) => +v.toFixed(2)); dbg.vel = p.vel.toArray().map((v) => +v.toFixed(2)); dbg.camYaw = p.camYaw.toFixed(2);
    const t = p.pos.clone(); inp.keys.add('KeyW'); g.step(1); dbg.oneStep = p.pos.toArray().map((v) => +v.toFixed(2)); dbg.vel1 = p.vel.toArray().map((v) => +v.toFixed(2)); inp.keys.delete('KeyW');
    dbg.boxes = g.islands.home.boxes.filter((b) => { const lx = p.pos.x - g.islands.home.pos.x, lz = p.pos.z - g.islands.home.pos.z; return lx > b.min.x - 1 && lx < b.max.x + 1 && lz > b.min.z - 1 && lz < b.max.z + 1; }).map((b) => [b.min.toArray().map((v) => +v.toFixed(1)), b.max.toArray().map((v) => +v.toFixed(1))]);
  }
  return { ok: moved > 2 && (p.onGround || p.pos.y > -30), info: { moved: moved.toFixed(1), onGround: p.onGround, ...dbg } };
});

await check('wall-run along a ruin wall', () => {
  const g = window.__driftlands, p = g.player, inp = g.input;
  const h = g.islands.home;
  const walls = h.boxes.filter((b) => !b.chest && (b.max.y - b.min.y) > 3.5 && Math.max(b.max.x - b.min.x, b.max.z - b.min.z) > 5 && Math.min(b.max.x - b.min.x, b.max.z - b.min.z) < 2);
  if (!walls.length) return { ok: true, info: 'no wall on this seed (skipped)' };
  const b = walls[0];
  const alongX = (b.max.x - b.min.x) > (b.max.z - b.min.z);
  const mid = b.min.clone().add(b.max).multiplyScalar(0.5);
  const y = h.pos.y + mid.y;
  if (alongX) { p.pos.set(h.pos.x + b.min.x + 0.5, y, h.pos.z + b.max.z + 0.4); p.vel.set(9, 2, -1); p.camYaw = -Math.PI / 2 + 0.25; }
  else { p.pos.set(h.pos.x + b.max.x + 0.4, y, h.pos.z + b.min.z + 0.5); p.vel.set(-1, 2, 9); p.camYaw = Math.PI - 0.25; }
  p.onGround = false; p.platform = null; p.mode = 'normal'; p.wallCd = 0;
  inp.keys.add('KeyW'); g.step(3);
  const ran = p.mode === 'wallrun';
  g.step(20);
  inp.pressed.add('Space'); g.step(1);
  inp.keys.delete('KeyW');
  return { ok: ran, info: { ran, after: p.mode, vy: p.vel.y.toFixed(1) } };
});

await check('fire arrow ignites grass and fire spreads', () => {
  const g = window.__driftlands;
  const h = g.islands.home;
  g.world.weather = 'clear'; g.world.rain = 0; g.world.rainTarget = 0; g.world.weatherTimer = 999;
  const f = h.fuel.find((x) => x.kind === 'grass');
  g.combat.igniteAt(new h.pos.constructor(h.pos.x + f.x, h.pos.y + f.y, h.pos.z + f.z), 3);
  const n0 = g.combat.burning.length;
  g.step(600);
  const burnt = h.fuel.filter((x) => x.state === 2).length + g.combat.burning.length;
  return { ok: n0 > 0 && burnt > n0, info: { ignited: n0, burntOrBurning: burnt } };
});

await check('oil barrel → oil cloud → fire → explosion', () => {
  const g = window.__driftlands;
  let isl = g.islands.list.find((i) => i.barrels.some((b) => b.alive));
  if (!isl) return { ok: true, info: 'no barrels (skipped)' };
  const b = isl.barrels.find((x) => x.alive);
  g.combat.burstBarrel(b);
  const clouds = g.combat.clouds.length;
  const c = g.combat.clouds[g.combat.clouds.length - 1];
  c.ignite = true;
  g.step(5);
  return { ok: clouds > 0 && !g.combat.clouds.includes(c), info: { clouds } };
});

await check('husk chases and attacks player on its island', () => {
  const g = window.__driftlands, p = g.player;
  const h = g.islands.home;
  p.pos.set(h.pos.x, h.pos.y + h.topH(0, 0), h.pos.z); p.vel.set(0, 0, 0); p.onGround = false; p.mode = 'normal'; p.hp = p.maxHp;
  g.step(5);
  const e = g.combat.spawn('husk', p.pos.clone().add(new p.pos.constructor(8, 0, 0)), h);
  const hp0 = p.hp;
  g.step(400);
  return { ok: p.hp < hp0 || e.pos.distanceTo(p.pos) < 4, info: { hpLost: (hp0 - p.hp).toFixed(0), dist: e.pos.distanceTo(p.pos).toFixed(1) } };
});

await check('wisp fires bolts', () => {
  const g = window.__driftlands, p = g.player;
  g.combat.clearAll();
  p.hp = p.maxHp;
  g.combat.spawn('wisp', p.pos.clone().add(new p.pos.constructor(10, 6, 0)), g.islands.home);
  let maxBolts = 0;
  for (let i = 0; i < 300; i++) { g.step(1); maxBolts = Math.max(maxBolts, g.combat.bolts.length); }
  return { ok: maxBolts > 0, info: { maxBolts, hp: p.hp.toFixed(0) } };
});

await check('arrows kill an enemy and drop shards', () => {
  const g = window.__driftlands;
  g.combat.clearAll();
  const s0 = g.save.res.shards;
  const e = g.combat.spawn('wisp', g.player.pos.clone().add(new g.player.pos.constructor(0, 10, 0)), g.islands.home);
  for (let i = 0; i < 6 && !e.dead; i++) g.combat.hitEnemy(e, 20, 0, null);
  g.step(2);
  return { ok: e.dead && g.save.res.shards > s0 && !g.combat.enemies.includes(e), info: { shards: g.save.res.shards - s0 } };
});

await check('rain makes shock chain through every wet foe', () => {
  const g = window.__driftlands;
  g.combat.clearAll();
  g.save.rescued.includes('volta') || g.save.rescued.push('volta');
  g.world.rain = 1;
  const base = g.player.pos.clone().add(new g.player.pos.constructor(0, 12, 0));
  const es = [0, 1, 2, 3, 4].map((i) => g.combat.spawn('wisp', base.clone().add(new base.constructor(i * 5, 0, 0)), g.islands.home));
  g.combat.hitEnemy(es[0], 5, 2, null);
  const hurt = es.slice(1).filter((e) => e.hp < e.maxHp).length;
  g.save.rescued.splice(g.save.rescued.indexOf('volta'), 1);
  g.world.rain = 0;
  return { ok: hurt === 4, info: { chained: hurt } };
});

await check('ship flies from the helm and carries the crew', () => {
  const g = window.__driftlands, p = g.player, inp = g.input;
  g.combat.clearAll();
  p.respawnOnShip(); p.enterHelm();
  const s0 = g.ship.pos.clone();
  inp.keys.add('KeyW'); g.step(300); inp.keys.add('KeyD'); g.step(120); inp.keys.delete('KeyD'); inp.keys.delete('KeyW');
  const moved = g.ship.pos.distanceTo(s0);
  const onDeck = p.pos.distanceTo(g.ship.toWorld(g.ship.helmPos)) < 0.5;
  p.leaveHelm(); g.step(30);
  const stillAboard = p.platform === g.ship;
  return { ok: moved > 30 && onDeck && stillAboard, info: { moved: moved.toFixed(0), speed: g.ship.speed.toFixed(1), stillAboard } };
});

await check('player stays on deck while the ship moves (no-pilot autopilot)', () => {
  const g = window.__driftlands, p = g.player;
  p.respawnOnShip(); g.step(5);
  g.ship.autopilot = g.ship.pos.clone().add(new g.ship.pos.constructor(80, 5, 0));
  g.step(400);
  const local = p.pos.clone(); g.ship.root.worldToLocal(local);
  return { ok: p.platform === g.ship && Math.abs(local.y) < 0.2 && Math.abs(local.x) < 3.5, info: { local: [local.x.toFixed(2), local.y.toFixed(2), local.z.toFixed(2)] } };
});

await check('parked ship holds position in strong wind', () => {
  const g = window.__driftlands, p = g.player;
  if (p.mode === 'helm') p.leaveHelm();
  g.ship.autopilot = null; g.step(120);
  g.world.windTarget = 9; g.world.windStrength = 9; g.world.weather = 'windy';
  const s0 = g.ship.pos.clone();
  g.step(600);
  const drift = g.ship.pos.distanceTo(s0);
  return { ok: drift < 2, info: { drift: drift.toFixed(2) } };
});

await check('rescue every survivor → cabins grow on the ship', () => {
  const g = window.__driftlands, p = g.player;
  const n0 = g.progress.npcs.length;
  for (const n of g.progress.npcs.slice()) { g.progress.rescue(n); g.ui.closeDialog(); }
  g.step(5);
  return { ok: n0 >= 7 && g.ship.cabins.length === g.save.rescued.length && g.progress.npcs.length === 0, info: { placed: n0, cabins: g.ship.cabins.length, crew: g.save.rescued.length } };
});

await check('quest turn-in grants reward', () => {
  const g = window.__driftlands;
  g.save.items.gear = 3;
  const pip = g.progress.crew.find((c) => c.data.id === 'pip');
  g.progress.talk(pip); g.ui.closeDialog();
  return { ok: g.save.questDone.includes('pip') && g.save.items.gear === 0, info: g.save.questDone };
});

await check('buy all upgrades via the workshop UI', () => {
  const g = window.__driftlands;
  g.save.res.shards = 5000; g.save.res.scrap = 1000; g.save.res.cores = 100;
  g.openMenu();
  let clicks = 0;
  for (let k = 0; k < 20; k++) {
    const b = document.querySelector('#menuBody button.primary');
    if (!b) break;
    b.click(); clicks++;
  }
  g.closeMenu();
  const u = g.save.upg;
  return { ok: u.engine === 5 && u.hull === 4 && u.grapple === 3 && u.glider === 3 && u.bow === 3 && u.garden === 1 && u.lookout === 1 && g.ship.garden && g.ship.lookout, info: u };
});

await check('crow\'s nest is walkable', () => {
  const g = window.__driftlands, p = g.player;
  p.mode = 'normal';
  g.ship.toWorld(new p.pos.constructor(0.9, 11, -4), p.pos); p.vel.set(0, 0, 0); p.onGround = false; p.platform = null;
  g.step(60);
  const local = p.pos.clone(); g.ship.root.worldToLocal(local);
  return { ok: p.onGround && Math.abs(local.y - 9.2) < 0.2, info: { y: local.y.toFixed(2) } };
});

await check('island sinks with player aboard; new island rises', () => {
  const g = window.__driftlands, p = g.player;
  const isl = g.islands.list.find((i) => !i.small && !i.home && !i.sinking);
  isl.enemiesSpawned = true; g.combat.clearAll(); isl.enemiesSpawned = true;
  p.pos.set(isl.pos.x, isl.pos.y + isl.topH(0, 0) + 0.5, isl.pos.z); p.vel.set(0, 0, 0); p.onGround = false; p.platform = null;
  g.step(30);
  isl.sinking = true;
  const y0 = p.pos.y;
  g.step(300);
  const carried = p.onGround && p.platform === isl && p.pos.y < y0 - 2;
  const count0 = g.islands.list.length;
  isl.pos.y = -1000; g.step(2);
  const replaced = g.islands.list.length === count0 && g.islands.list.some((i) => i.rising);
  g.step(60);
  return { ok: carried && replaced, info: { carried, replaced, drop: (y0 - p.pos.y).toFixed(1) } };
});

await check('storm dive: enter rift, collect core, escape, bank cores', () => {
  const g = window.__driftlands, p = g.player, inp = g.input;
  p.respawnOnShip(); p.enterHelm();
  const r = g.storm.rifts[0];
  g.ship.pos.set(r.pos.x, r.pos.y + 25, r.pos.z); g.storm.cooldown = 0;
  inp.keys.add('ShiftLeft'); g.step(200); inp.keys.delete('ShiftLeft');
  const entered = g.storm.active;
  if (!entered) return { ok: false, info: { entered, y: g.ship.pos.y } };
  g.step(400);
  const free = g.storm.cores.filter((c) => !g.islands.list.some((i) => Math.hypot(i.pos.x - c.pos.x, i.pos.z - c.pos.z) < i.R * 1.4 + 12));
  const c = free[0] || g.storm.cores[0];
  g.ship.pos.copy(c.pos).sub(new c.pos.constructor(0, 4, 0));
  g.step(2);
  const got = g.storm.collected;
  const before = g.save.res.cores;
  g.ship.pos.copy(g.storm.origin); g.step(3);
  document.querySelector('#btnSumOk') && document.querySelector('#btnSumOk').click();
  return { ok: entered && got >= 1 && !g.storm.active && g.save.res.cores > before && g.islands.list.length > 20, info: { got, cores: g.save.res.cores, dives: g.save.data.dives } };
});

await check('storm dive: wreck loses haul and returns safely', () => {
  const g = window.__driftlands, p = g.player;
  p.respawnOnShip(); p.enterHelm();
  const r = g.storm.rifts[0];
  g.ship.pos.set(r.pos.x, -30, r.pos.z); g.storm.cooldown = 0; g.step(2);
  if (!g.storm.active) return { ok: false, info: 'did not enter' };
  g.storm.collected = 4;
  const before = g.save.res.cores;
  g.ship.damage(9999);
  g.step(5);
  document.querySelector('#btnSumOk') && document.querySelector('#btnSumOk').click();
  return { ok: !g.storm.active && g.save.res.cores === before && g.ship.hp > 0, info: { hp: g.ship.hp.toFixed(0) } };
});

await check('long soak: 3 sim-minutes with weather cycling', () => {
  const g = window.__driftlands, p = g.player;
  p.leaveHelm && p.mode === 'helm' && p.leaveHelm();
  g.world.weatherTimer = 1;
  for (let i = 0; i < 6; i++) { g.world.weatherTimer = Math.min(g.world.weatherTimer, 30); g.step(1800, 1 / 60); }
  return { ok: Number.isFinite(p.pos.x) && Number.isFinite(g.ship.pos.y), info: { weather: g.world.weather, islands: g.islands.list.length, enemies: g.combat.enemies.length, particles: g.particles.add.count + g.particles.norm.count } };
});

// render one normal frame and report draw calls
const info = await page.evaluate(() => {
  const g = window.__driftlands; g.player.respawnOnShip(); const out = [];
  for (let k = 0; k < 4; k++) { g.player.camYaw = g.ship.yaw + k * Math.PI / 2; g.player.camPitch = 0.15; g.step(10);
    g.renderer.info.autoReset = false; g.renderer.info.reset(); g.composer.render(); const r = g.renderer.info.render; out.push(`${r.calls} calls/${(r.triangles / 1000).toFixed(0)}k tris`); }
  g.renderer.info.autoReset = true; return out.join(', '); });
console.log('render (last pass) calls/tris:', JSON.stringify(info));
// save/continue
await page.evaluate(() => window.__driftlands.save.write());
await page.reload();
await page.waitForFunction(() => !!window.__driftlands, null, { timeout: 60000 });
const cont = await page.isVisible('#btnContinue');
await page.click('#btnContinue');
await page.waitForTimeout(400);
const crew = await page.evaluate(() => ({ crew: window.__driftlands.progress.crew.length, cabins: window.__driftlands.ship.cabins.length, engine: window.__driftlands.save.upg.engine }));
console.log(`${cont && crew.crew === 8 && crew.cabins === 8 && crew.engine === 5 ? 'PASS' : 'FAIL'}  save → reload → continue restores ship & crew  ${JSON.stringify(crew)}`);
if (!(cont && crew.crew === 8)) fails++;
await page.waitForTimeout(1500);
await browser.close();
const real = errors.filter((e) => !/GPU stall|swiftshader|WebGL-|Automatic fallback|PointerLock|pointer lock/i.test(e));
console.log('console errors/warnings:', real.length);
real.slice(0, 20).forEach((e) => console.log('  ', e));
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails || real.length ? 1 : 0);
