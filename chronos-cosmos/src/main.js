import * as THREE from 'three';
import { G } from './core/G.js';
import { patchFogChunks, TIME_UNIFORM, PLAYER_UNIFORM, WIND_UNIFORM, WET_UNIFORM } from './core/shaderlib.js';
import { createRenderer, QUALITY, QUALITY_ORDER } from './core/renderer.js';
import { LightPool } from './core/lights.js';
import { createTextures, radialTexture } from './core/textures.js';
import { Input } from './core/input.js';
import { CameraRig } from './core/camera.js';
import { CollisionWorld } from './core/collision.js';
import { Terrain } from './world/terrain.js';
import { Atmosphere } from './world/sky.js';
import { Water } from './world/water.js';
import { Vegetation, GrassField } from './world/foliage.js';
import { EpochManager } from './world/epochmanager.js';
import { World } from './world/world.js';
import { START } from './world/worldmap.js';
import { FX } from './fx/fx.js';
import { WeaponTrail } from './fx/trails.js';
import { Combat } from './combat/combat.js';
import { Magic } from './combat/magic.js';
import { Player } from './actors/player.js';
import { Spawner } from './actors/enemies.js';
import { HUD } from './ui/hud.js';
import { Game } from './game/game.js';
import { buildWorld } from './world/content.js';
import { Quests } from './game/quests.js';
import { Dialogue } from './game/dialogue.js';
import { Cutscene } from './game/cutscene.js';
import { Story } from './game/story.js';
import { DIALOGUES, QUESTS } from './game/storydata.js';
import { BossManager } from './actors/boss.js';
import { Building } from './game/building.js';
import { Rift } from './game/rift.js';
import { Mounts } from './actors/mount.js';
import { Weather } from './world/weather.js';
import { Audio } from './core/audio.js';
import { UI } from './ui/ui.js';
import { TouchControls } from './ui/touch.js';
import { Tutorial } from './game/tutorial.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
function setLoad(p, msg) {
  const f = document.getElementById('load-fill');
  if (f) f.style.width = Math.round(p * 100) + '%';
  if (msg) {
    const m = document.getElementById('load-msg');
    if (m) m.textContent = msg;
  }
}

const params = new URLSearchParams(location.search);

// What kind of device are we on? Phones and Chromebooks get lighter
// defaults; the adaptive quality system steps down further if needed.
function detectDevice() {
  const ua = navigator.userAgent;
  const touch = navigator.maxTouchPoints > 1 || 'ontouchstart' in window;
  const iPad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPhone|iPod/.test(ua) || (/Android/.test(ua) && /Mobile/.test(ua)) || (/Mobi/.test(ua) && touch)) return 'phone';
  if (iPad || /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) return 'tablet';
  if (/CrOS/.test(ua)) return 'chromebook';
  return 'desktop';
}
const DEVICE_QUALITY = { phone: 'mobile', tablet: 'low', chromebook: 'low', desktop: 'high' };

function fatal(msg) {
  const m = document.getElementById('load-msg');
  if (m) m.innerHTML = msg;
  const b = document.querySelector('.load-bar');
  if (b) b.style.display = 'none';
}

async function boot() {
  try {
    const raw = localStorage.getItem('chronos-cosmos-settings');
    if (raw) Object.assign(G.settings, JSON.parse(raw));
  } catch (e) {}
  G.device = detectDevice();
  document.documentElement.classList.add('dev-' + G.device);
  if (!G.settings.manualQuality) {
    const want = DEVICE_QUALITY[G.device];
    const cur = QUALITY_ORDER.indexOf(G.settings.quality);
    const def = QUALITY_ORDER.indexOf(want);
    G.settings.quality = QUALITY_ORDER[cur < 0 ? def : Math.min(cur, def)];
  }
  if (params.get('q')) G.settings.quality = params.get('q');
  if (!QUALITY[G.settings.quality]) G.settings.quality = 'high';
  const light = G.settings.quality === 'mobile' || G.settings.quality === 'low';
  G.cheap = light;
  patchFogChunks();
  let created;
  try {
    created = createRenderer(document.getElementById('viewport'));
  } catch (e) {
    fatal('Your browser could not start 3D graphics (WebGL). Try updating it, or turn on hardware acceleration in its settings.');
    throw e;
  }
  const { renderer, scene, camera, applyQuality } = created;
  if (!G.webgl2) {
    fatal('This browser does not support WebGL 2, which the game needs for its 3D world. Please update it (Chrome, Safari 15+, Edge or Firefox).');
    return;
  }
  G.applyQuality = applyQuality;
  const q = (G.qualityCfg = QUALITY[G.settings.quality]);
  G.quality = G.settings.quality;
  renderer.shadowMap.enabled = q.shadows;
  setLoad(0.04, 'Painting stone and timber…');
  await nextFrame();
  G.tex = createTextures(light ? 256 : 512);
  G.glowTex = radialTexture(64, 0, 2);
  setLoad(0.12, 'Raising the mountains of Aeloria…');
  await nextFrame();
  const terrain = (G.terrain = new Terrain(light ? 256 : 512));
  await terrain.generate((p) => setLoad(0.12 + p * 0.3), nextFrame);
  scene.add(terrain.buildMesh());
  setLoad(0.44, 'Filling Mirror Lake…');
  await nextFrame();
  G.collision = new CollisionWorld(terrain);
  G.atmo = new Atmosphere(scene);
  G.atmo.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
  G.lights = new LightPool(scene, q.lights);
  G.water = new Water(scene, terrain);
  G.epochs = new EpochManager();
  setLoad(0.5, 'Planting the Thornwood…');
  await nextFrame();
  G.veg = new Vegetation(scene, terrain, G.collision, G.tex);
  G.veg.scatter(q.trees);
  const gq = q.grass;
  G.grass = [new GrassField(terrain, { count: 85000 * gq, size: gq < 0.2 ? 44 : 70, height: 0.62, width: gq < 0.2 ? 0.11 : 0.08, segments: gq < 0.2 ? 3 : 4, seed: 3 })];
  if (gq >= 0.5) G.grass.push(new GrassField(terrain, { count: 30000 * gq, size: 180, height: 0.6, width: 0.22, segments: 3, seed: 8, inner: 30 }));
  if (gq >= 0.25) G.grass.push(new GrassField(terrain, { count: 5000 * gq, size: 90, height: 0.55, width: 0.14, flower: true, seed: 12 }));
  if (gq >= 0.5) G.grass.push(new GrassField(terrain, { count: 50000 * gq, size: 26, height: 0.55, width: 0.058, segments: 4, seed: 21 }));
  for (const g of G.grass) scene.add(g.mesh);
  setLoad(0.65, 'Waking the creatures…');
  await nextFrame();
  G.world = new World();
  G.fx = new FX(scene);
  G.trails = new WeaponTrail(scene);
  G.combat = new Combat();
  G.slowmo = (s, d) => G.combat.slowmo(s, d);
  G.magic = new Magic();
  G.input = new Input(renderer.domElement);
  G.input.wantLock = true;
  G.cam = new CameraRig(camera);
  G.player = new Player();
  G.player.addTo(scene);
  G.enemies = [];
  G.hud = new HUD();
  G.game = new Game();
  G.loot = G.world;
  setLoad(0.8, 'Building Hearthmere…');
  await nextFrame();
  buildWorld();
  if (!G.spawner) G.spawner = new Spawner([]);
  setLoad(0.9, 'Teaching the villagers their lines…');
  await nextFrame();
  G.audio = new Audio();
  G.quests = new Quests(QUESTS);
  G.dialogue = new Dialogue(DIALOGUES);
  G.cutscene = new Cutscene();
  G.story = new Story();
  G.story.build();
  G.bosses = new BossManager();
  G.build = new Building();
  G.rift = new Rift();
  G.mount = G.mounts = new Mounts();
  G.weather = new Weather();
  G.ui = new UI();
  G.tutorial = new Tutorial();
  G.input.canLock = () => G.state === 'play' && !G.ui.blocking && !G.cutscene.active;
  G.touch = new TouchControls();

  const sx = START.x, sz = START.z;
  G.player.spawn(sx, terrain.heightAt(sx, sz) + 0.1, sz);
  G.cam.smoothTarget.copy(G.player.pos);
  G.epochs.setInstant(0);
  G.atmo.update(0, true);
  G.atmo.updateEnvironment(renderer, true);
  setLoad(0.96, 'Preparing shaders…');
  await nextFrame();
  // compile materials up front so the first seconds of play don't stutter
  try {
    if (renderer.compileAsync) await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 8000))]);
    else renderer.compile(scene, camera);
  } catch (e) {}
  setLoad(1, 'Ready');

  window.__cc = { G, THREE };
  startLoop();
  // When the page is updated in place by its host, carry the run across.
  const hot = window.claude && window.claude.hot;
  try {
    hot?.snapshot?.(() => (G.state === 'play' ? { save: G.game.snapshot() } : null));
  } catch (e) {}
  const start = (data) => {
    if (data && data.save) {
      G.audio.init();
      G.game.apply(data.save);
      G.story.restoreFollowers();
      G.epochs.locked = !data.save.flags.shift_unlocked;
      G.ui.beginPlay();
      return;
    }
    if (params.has('play')) {
      document.getElementById('loading').classList.add('gone');
      G.ui.startNew(true);
    } else G.ui.showTitle();
  };
  try {
    if (hot && hot.ready) hot.ready(start);
    else start((hot && hot.data) || {});
  } catch (e) {
    start({});
  }
}

let last = performance.now();
const manual = params.has('manual');
function startLoop() {
  G.state = G.state || 'title';
  const frame = (fixedDt) => {
    const now = performance.now();
    const rdt = fixedDt || Math.min(0.05, (now - last) / 1000);
    last = now;
    step(rdt);
    if (!manual) requestAnimationFrame(() => frame());
  };
  window.__cc_step = (n = 1, dt = 1 / 30) => {
    for (let i = 0; i < n; i++) {
      G.noRender = i < n - 1;
      frame(dt);
    }
    G.noRender = false;
  };
  if (!manual) requestAnimationFrame(() => frame());
}

const _sun = new THREE.Vector3();
function step(rdt) {
  G.time += rdt;
  TIME_UNIFORM.value = G.time;
  const inp = G.input;
  inp.update(rdt);
  const playing = G.state === 'play';
  const paused = !!G.ui?.paused;
  // time scales: hitstop > slowmo > perfect-dodge
  let worldScale = 1, playerScale = 1;
  if (G.hitstop > 0) {
    G.hitstop -= rdt;
    worldScale = playerScale = 0.03;
  } else if (G.combat.slowT > 0) {
    G.combat.slowT -= rdt;
    worldScale = playerScale = G.combat.slowScale;
  }
  if (G.worldSlow && G.worldSlow.t > 0) {
    G.worldSlow.t -= rdt;
    worldScale *= G.worldSlow.scale;
    playerScale *= 0.92;
    G.post.grade.uniforms.uSlow.value = Math.min(1, G.worldSlow.t * 2);
  } else G.post.grade.uniforms.uSlow.value *= 0.9;
  if (G.ui && G.ui.timeScale !== undefined && G.ui.timeScale !== 1) {
    worldScale *= G.ui.timeScale;
    playerScale *= G.ui.timeScale;
  }
  const dt = paused ? 0 : rdt;
  G.dt = dt;
  G.gameTime += dt * worldScale;
  if (!paused) G.tickTimers(dt);
  if (playing && !paused) {
    G.game.update(dt);
    G.ui?.update?.(dt);
    G.epochs.update(dt);
    G.player.update(dt * playerScale);
    G.spawner?.update(dt);
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      const e = G.enemies[i];
      e.update(dt * worldScale);
      if (e.removed) G.enemies.splice(i, 1);
    }
    G.combat.update(dt * worldScale);
    G.magic.update(dt * playerScale);
    G.world.update(dt * worldScale);
    G.content?.update?.(dt, worldScale);
    G.trails.update(dt * playerScale);
    G.mount?.update?.(dt * playerScale);
    G.build?.update?.(dt);
    G.rift?.update?.(dt * worldScale, dt * playerScale);
    G.bosses?.update?.(dt);
  }
  if (playing) G.tutorial?.update(paused ? 0 : dt, rdt);
  G.touch?.update(rdt);
  if (!playing || paused) {
    G.ui?.update?.(rdt);
    if (!paused) G.content?.update?.(rdt * 0.5, 1);
  }
  G.cutscene?.update?.(rdt);
  G.fx.update(dt * worldScale);
  // camera
  if (G.state === 'title') G.ui?.titleCamera?.(rdt);
  else if (!G.cutscene?.active && G.state !== 'photo') G.cam.update(rdt, G.player);
  // atmosphere & world shaders
  const frozenTime = G.state !== 'play' || paused || !!G.game.inPocket;
  if (G.state === 'title') G.atmo.update(rdt * 0.5, false);
  else G.atmo.update(dt, frozenTime);
  const cam = G.camera.position;
  G.atmo.follow(G.state === 'play' ? G.player.pos : cam, G.camera);
  G.atmo.updateEnvironment(G.renderer, false);
  G.weather?.update?.(dt);
  WIND_UNIFORM.value.set(1 + Math.sin(G.time * 0.05) * 0.4 + (G.weather?.state.wind || 0), 0.4 + Math.cos(G.time * 0.07) * 0.3);
  WET_UNIFORM.value = G.weather ? G.weather.state.wet : 0;
  PLAYER_UNIFORM.value.copy(G.state === 'play' ? G.player.pos : cam);
  for (const g of G.grass) g.update(cam, G.water.level);
  G.veg.update(cam);
  G.water.update(rdt, G.atmo, G.weather?.state);
  G.fx.updateAmbient(rdt, cam, G.game.inPocket ? 3 : G.epochs.current, G.atmo.state.night || 0, G.weather?.state || { rain: 0, ash: 0, snow: 0 });
  // post uniforms
  const gr = G.post.grade.uniforms;
  _sun.copy(G.atmo.uniforms.uSunDir.value).multiplyScalar(2000).add(cam).project(G.camera);
  gr.uSun.value.set(_sun.x * 0.5 + 0.5, _sun.y * 0.5 + 0.5, 0);
  const onScreen = _sun.z < 1 && Math.abs(_sun.x) < 1.6 && Math.abs(_sun.y) < 1.6;
  const rays = G.qualityCfg.rays && onScreen && G.atmo.uniforms.uSunDir.value.y > -0.02 && !G.game.inPocket ? 0.85 * (1 - (G.weather?.state.cloud || 0) * 0.6) : 0;
  gr.uRays.value += (rays - gr.uRays.value) * Math.min(1, rdt * 3);
  gr.uTime.value = G.time;
  gr.uCA.value *= 0.92;
  G.post.grain.uniforms.uTime.value = G.time;
  G.hud.update(rdt);
  G.audio?.update?.(rdt);
  G.lights.update(cam);
  if (!G.noRender) {
    if (G.usePost) G.post.composer.render(rdt);
    else G.renderer.render(G.scene, G.camera);
  }
  G.hud.setVignette?.(G.usePost ? 0 : G.post.grade.uniforms.uDamage.value);
  inp.endFrame();
}

boot().catch((e) => {
  console.error(e);
  const m = document.getElementById('load-msg');
  if (m) m.textContent = 'Something went wrong while loading: ' + e.message;
});
