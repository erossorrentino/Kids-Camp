import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Particles } from './particles.js';
import { Physics } from './physics.js';
import { World } from './world.js';
import { IslandManager } from './islands.js';
import { Ship, PAINTS } from './ship.js';
import { Player } from './player.js';
import { Combat } from './combat.js';
import { Progress, Save } from './progress.js';
import { StormDive } from './storm.js';
import { UI } from './ui.js';

const $ = (id) => document.getElementById(id);

class Game {
  constructor() {
    const G = this;
    this.state = 'title';
    this.time = 0;
    this.cameraShake = 0;
    this.canvas = $('c');
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.maxPR = Math.min(window.devicePixelRatio || 1, 1.5);
    this.pr = this.maxPR;
    renderer.setPixelRatio(this.pr);
    renderer.setSize(innerWidth, innerHeight);
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 5000);
    this.camera.position.set(0, 30, 100);
    // post-processing (MSAA render target + bloom)
    const rt = new THREE.WebGLRenderTarget(innerWidth * this.pr, innerHeight * this.pr, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.setPixelRatio(this.pr);
    this.composer.setSize(innerWidth, innerHeight);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.55, 0.6, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.save = new Save();
    this.hasSave = this.save.exists();
    if (this.hasSave) this.save.load();
    this.audio = new Audio();
    this.input = new Input(this.canvas);
    this.particles = new Particles(this.scene);
    this.particles.setScale(innerHeight * this.pr);
    this.physics = new Physics(this);
    this.world = new World(this);
    this.islandRoot = new THREE.Group();
    this.scene.add(this.islandRoot);
    this.islands = new IslandManager(this);
    this.ship = new Ship(this);
    this.player = new Player(this);
    this.combat = new Combat(this);
    this.progress = new Progress(this);
    this.storm = new StormDive(this);
    this.ui = new UI(this);
    this.settings = { sens: 1.4, invertY: false, lowq: false, mute: false };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem('driftlands-settings') || '{}')); } catch (e) { /* ignore */ }
    this.applySettings();

    this.buildWorld(Math.floor(Math.random() * 1e9));
    this.bindUI();
    window.addEventListener('resize', () => this.resize());
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'play' && !this.expectUnlock) this.pause();
      this.expectUnlock = false;
    };
    this.titleAngle = 0;
    this.saveTimer = 20;
    this.perf = { acc: 0, n: 0, cool: 3 };
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
    window.__driftlands = this;
    // test hook: advance the simulation deterministically without rendering
    this.step = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) { this.update(dt); this.input.endFrame(); } };
  }

  buildWorld(seed) {
    this.islands.generate(seed);
    this.storm.makeRifts(seed);
    const home = this.islands.home;
    const top = home.topH(0, home.R * 0.9);
    this.ship.pos.set(0, home.pos.y + Math.max(top, 2) + 3.0, home.edgeR(Math.PI / 2) + 13);
    this.ship.yaw = 0;
    this.ship.root.rotation.y = 0;
    this.ship.update(0, null);
  }

  applySettings() {
    const s = this.settings;
    this.input.sensitivity = 0.0016 * s.sens;
    this.invertY = s.invertY;
    this.audio.setMuted(s.mute);
    this.renderer.shadowMap.enabled = !s.lowq;
    this.world.sun.castShadow = !s.lowq;
    this.bloom.enabled = !s.lowq;
    this.maxPR = s.lowq ? Math.min(1, window.devicePixelRatio || 1) : Math.min(window.devicePixelRatio || 1, 1.5);
    if (this.pr > this.maxPR) this.setPR(this.maxPR);
    $('sens').value = s.sens; $('mute').checked = s.mute; $('lowq').checked = s.lowq; $('invertY').checked = s.invertY;
    try { localStorage.setItem('driftlands-settings', JSON.stringify(s)); } catch (e) { /* ignore */ }
  }

  bindUI() {
    if (this.hasSave) $('btnContinue').classList.remove('hidden');
    $('btnContinue').onclick = () => this.start(false);
    $('btnNew').onclick = () => {
      if (this.hasSave && !confirm('Start a new voyage? Your current progress will be erased.')) return;
      this.start(true);
    };
    $('btnResume').onclick = () => this.resume();
    $('btnReset').onclick = () => {
      if (!confirm('Abandon this voyage and start over? All progress will be lost.')) return;
      this.save.reset(); this.hasSave = false; location.reload();
    };
    $('sens').oninput = (e) => { this.settings.sens = +e.target.value; this.applySettings(); };
    $('mute').onchange = (e) => { this.settings.mute = e.target.checked; this.applySettings(); };
    $('lowq').onchange = (e) => { this.settings.lowq = e.target.checked; this.applySettings(); };
    $('invertY').onchange = (e) => { this.settings.invertY = e.target.checked; this.applySettings(); };
    this.canvas.addEventListener('click', () => { if (this.state === 'play' && !this.input.locked) this.input.lock(); });
  }

  start(fresh) {
    this.audio.start();
    if (fresh) { this.save.reset(); }
    else this.save.load();
    // rebuild ship state from the save
    this.progress.rebuildCrew();
    if (this.save.upg.garden) this.ship.buildGarden();
    if (this.save.upg.lookout) this.ship.buildLookout();
    this.ship.applyPaint();
    this.player.gliderMat.color.setHex(PAINTS[this.save.paint].color);
    this.ship.hp = this.ship.maxHp;
    this.progress.placeAll();
    this.player.hp = this.player.maxHp;
    this.player.respawnOnShip();
    this.player.camYaw = this.ship.yaw + Math.PI; this.player.camPitch = 0.3;
    $('title').classList.add('hidden');
    this.ui.show(true);
    this.ui.refresh();
    this.state = 'play';
    this.input.lock();
    this.save.write();
    this.hasSave = true;
    if (fresh || !this.save.flags.intro) {
      this.save.flags.intro = true;
      setTimeout(() => this.ui.toast('Welcome aboard, Captain! The sky is breaking apart — survivors need you.', 5), 600);
      setTimeout(() => this.ui.toast('Click to look around · coloured light beams (★ on your compass) mark survivors', 5), 2500);
    } else setTimeout(() => this.ui.toast('Welcome back, Captain. The sky has shifted while you were away — new islands await.', 5), 600);
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    $('pause').classList.remove('hidden');
  }
  resume() {
    $('pause').classList.add('hidden');
    this.state = 'play';
    this.input.lock();
    this.clock.getDelta();
  }
  openMenu() {
    this.state = 'menu';
    this.expectUnlock = true;
    this.input.unlock();
    this.ui.tab = this.ui.tab || 'up';
    this.ui.renderMenu();
    $('menu').classList.remove('hidden');
    this.audio.play('click');
  }
  closeMenu() {
    $('menu').classList.add('hidden');
    this.state = 'play';
    this.input.lock();
    this.ui.refresh();
  }
  openSummary() { this.state = 'menu'; this.expectUnlock = true; this.input.unlock(); $('summary').classList.remove('hidden'); }
  closeSummary() { $('summary').classList.add('hidden'); this.state = 'play'; this.input.lock(); }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
    this.particles.setScale(innerHeight * this.pr);
  }
  setPR(pr) {
    this.pr = pr;
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(innerWidth, innerHeight);
    this.particles.setScale(innerHeight * pr);
  }

  helmControls() {
    const inp = this.input;
    return {
      throttle: (inp.down('KeyW') ? 1 : 0) - (inp.down('KeyS') ? 1 : 0),
      turn: (inp.down('KeyD') ? 1 : 0) - (inp.down('KeyA') ? 1 : 0),
      lift: (inp.down('Space') ? 1 : 0) - (inp.down('ShiftLeft') || inp.down('ShiftRight') || inp.down('KeyC') ? 1 : 0),
      boost: inp.down('KeyF'),
    };
  }

  // nearest interactable
  findInteract() {
    const p = this.player;
    if (p.mode === 'helm') return { label: 'Leave the helm', act: () => p.leaveHelm() };
    const pp = p.pos;
    let best = null, bd = 1e9;
    const consider = (pos, r, label, act) => {
      const d = pos.distanceTo(pp);
      if (d < r && d < bd) { bd = d; best = { label, act }; }
    };
    const ship = this.ship;
    if (!this.storm.active || true) {
      consider(ship.toWorld(ship.helmPos), 2.4, 'Take the helm', () => { p.enterHelm(); this.save.flags.piloted = true; });
      consider(ship.toWorld(ship.benchPos), 2.4, 'Open the workshop', () => this.openMenu());
      for (const c of this.progress.crew) consider(ship.toWorld(c.local), 2.6, `Talk to ${c.data.name}`, () => this.progress.talk(c));
    }
    for (const isl of this.islands.near(pp, 8)) {
      for (const c of isl.chests) {
        if (c.opened) continue;
        consider(new THREE.Vector3(isl.pos.x + c.x, isl.pos.y + c.y, isl.pos.z + c.z), 2.8, 'Open chest', () => this.progress.openChest(isl, c));
      }
      const n = isl.survivor;
      if (n && !n.rescued) consider(this.progress.npcWorld(n), 3.5, `Rescue ${n.data.name} the ${n.data.role}`, () => this.progress.rescue(n));
    }
    return best;
  }

  collectPickups() {
    const pp = this.player.pos;
    const c = new THREE.Vector3(pp.x, pp.y + 1, pp.z);
    for (const isl of this.islands.near(pp, 6)) {
      for (const k of isl.pickups) {
        if (k.taken) continue;
        const wx = isl.pos.x + k.mesh.position.x, wy = isl.pos.y + k.mesh.position.y, wz = isl.pos.z + k.mesh.position.z;
        if ((wx - c.x) ** 2 + (wy - c.y) ** 2 + (wz - c.z) ** 2 < 1.9 * 1.9) {
          k.taken = true; k.mesh.visible = false;
          const wp = new THREE.Vector3(wx, wy, wz);
          if (k.kind === 'shard') {
            this.progress.gain({ shards: 5 }, wp);
            this.particles.burst(wp, 18, { color: [0.5, 0.95, 1], speed: 4, size: 0.4, life: 0.6 });
            this.audio.play('pickup');
          } else {
            this.progress.addItem('feather', 1, wp);
            this.particles.burst(wp, 24, { color: [1, 0.9, 0.5], speed: 4, size: 0.4, life: 0.8 });
            this.audio.play('chest');
          }
        }
      }
    }
  }

  frame() {
    let dt = this.clock.getDelta();
    // adaptive resolution
    this.perf.acc += dt; this.perf.n++;
    this.perf.cool -= dt;
    if (this.perf.acc > 1.5) {
      const fps = this.perf.n / this.perf.acc;
      if (this.perf.cool <= 0) {
        if (fps < 42 && this.pr > 0.6) { this.setPR(Math.max(0.6, this.pr - 0.15)); this.perf.cool = 2; }
        else if (fps > 58 && this.pr < this.maxPR) { this.setPR(Math.min(this.maxPR, this.pr + 0.1)); this.perf.cool = 4; }
      }
      this.fps = fps;
      this.perf.acc = 0; this.perf.n = 0;
    }
    dt = Math.min(dt, 1 / 20);
    try {
      this.update(dt);
    } catch (err) {
      console.error(err);
    }
    this.composer.render();
    this.input.endFrame();
  }

  update(dt) {
    const inp = this.input;
    if (this.invertY) inp.mouse.dy = -inp.mouse.dy;
    if (this.state === 'title') {
      this.time += dt;
      this.titleAngle += dt * 0.06;
      this.ship.update(dt, null);
      this.islands.update(dt);
      this.storm.update(dt);
      this.world.update(dt, this.ship.pos);
      this.particles.update(dt);
      const s = this.ship.pos;
      this.camera.position.set(s.x + Math.cos(this.titleAngle) * 46, s.y + 14 + Math.sin(this.titleAngle * 0.7) * 5, s.z + Math.sin(this.titleAngle) * 46);
      this.camera.lookAt(s.x, s.y + 7, s.z);
      this.player.model.visible = false;
      return;
    }
    if (this.state !== 'play') {
      if (this.state === 'menu' && (inp.hit('KeyB') || inp.hit('Escape') || inp.hit('Tab')) && !$('menu').classList.contains('hidden')) this.closeMenu();
      return;
    }
    this.time += dt;
    // dialog blocks movement until dismissed
    if (this.ui.dialogOpen) {
      this.ui.dialogT -= dt;
      if (this.ui.dialogT <= 0 && (inp.hit('KeyE') || inp.hit('Space') || inp.mouse.leftPressed || inp.hit('Escape'))) this.ui.closeDialog();
      inp.pressed.clear(); inp.mouse.leftPressed = false; inp.mouse.left = false; inp.mouse.rightPressed = false;
      inp.keys.delete('Space');
    }
    if (inp.hit('KeyB') || inp.hit('Tab')) {
      if (this.player.platform === this.ship || this.player.mode === 'helm') { this.openMenu(); return; }
      this.ui.toast('Return to your ship to use the workshop (R whistles it over)', 2.5);
    }
    if (inp.hit('KeyM')) { this.settings.mute = !this.settings.mute; this.applySettings(); this.ui.toast(this.settings.mute ? 'Audio muted' : 'Audio on', 1.5); }
    const ctrl = this.player.mode === 'helm' ? this.helmControls() : null;
    this.ship.update(dt, ctrl);
    this.islands.update(dt);
    this.player.update(dt);
    this.combat.update(dt);
    this.storm.update(dt);
    this.progress.update(dt);
    this.world.update(dt, this.player.pos);
    this.particles.update(dt);
    this.player.updateCamera(dt);
    this.collectPickups();
    const it = this.ui.dialogOpen ? null : this.findInteract();
    this.ui.prompt(it ? `<kbd>E</kbd> ${it.label}` : '');
    if (it && inp.hit('KeyE')) it.act();
    this.ui.update(dt);
    this.audio.update(dt, Math.min(1, (this.player.mode === 'glide' ? 0.6 : 0) + this.world.windStrength / 14 + (this.player.mode === 'helm' ? Math.abs(this.ship.speed) / 60 : 0)), this.storm.active);
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) { this.saveTimer = 20; this.save.write(); }
  }
}

function boot() {
  try {
    new Game();
  } catch (err) {
    console.error(err);
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:30px;background:#0b0a1a;color:#fff;font:16px sans-serif;z-index:99';
    d.innerHTML = `<div><h2>Driftlands couldn't start</h2><p>Your browser may not support WebGL 2. Try a recent Chrome, Edge, Firefox or Safari.</p><p style="opacity:.6">${String(err && err.message || err)}</p></div>`;
    document.body.appendChild(d);
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
