/**
 * IRON VANGUARD — entry point
 * ------------------------------------------------------------------
 * Owns the application state machine (menu <-> match), the fixed-step
 * simulation loop and the wiring between systems. Everything else is a
 * module that does one job.
 */
import * as THREE from 'three';
import { Engine, QUALITY } from './core/engine.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { FX } from './world/fx.js';
import { Arena } from './world/arena.js';
import { Match } from './game/match.js';
import { PlayerController } from './game/player.js';
import { HUD } from './ui/hud.js';
import { Menus } from './ui/menus.js';
import { HangarScene } from './ui/hangarScene.js';
import { Progression } from './ui/progression.js';
import { MAPS, MAP_BY_ID, mapsForMode, BIOMES } from './data/maps.js';
import { clamp } from './core/rng.js';

const MAX_FRAME = 1 / 20;     // never simulate more than a 50ms step
const FIXED = 1 / 120;        // physics substep

class Game {
  constructor() {
    this.canvas = document.getElementById('viewport');
    this.progression = new Progression();
    const s = this.progression.settings;

    this.engine = new Engine(this.canvas, s.quality);
    this.engine.fovBase = s.fov;
    this.engine.fovTarget = s.fov;

    this.input = new Input(this.canvas);
    this.input.sensitivity = s.sensitivity;
    this.input.invertY = s.invertY;

    this.audio = new Audio();
    this.audio.volume = s.volume;

    this.fx = new FX(this.engine.scene, QUALITY[s.quality].particles);
    this.fx.setCamera(this.engine.camera);

    this.hud = new HUD(this.engine, this.audio);
    this.hud.setFpsVisible(s.showFps);

    this.hangarScene = new HangarScene(this.engine);

    this.menus = new Menus({
      progression: this.progression,
      hangarScene: this.hangarScene,
      audio: this.audio,
      engine: this.engine,
      onDeploy: (opts) => this.startMatch(opts),
      onSetting: (k, v) => this.applySetting(k, v),
    });

    this.controller = new PlayerController(this.input, this.engine, null, this.audio);

    this.state = 'menu';
    this.booted = false;
    this.match = null;
    this.arena = null;
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.paused = false;
    this._pendingRespawn = false;

    this._wireGlobal();
  }

  /* ---------------------------------------------------------------- */
  _wireGlobal() {
    this.input.onLockChange = (locked) => {
      const hint = document.getElementById('pointer-hint');
      if (this.state === 'match') hint.classList.toggle('hidden', locked);
      else hint.classList.add('hidden');
    };

    this.canvas.addEventListener('click', () => {
      this.audio.resume();
      if (this.state === 'match' && !this._pendingRespawn) this.input.requestLock();
    });

    addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.state === 'match') this.togglePause();
      if (e.code === 'Backquote') {
        const v = !this.progression.settings.showFps;
        this.progression.setSetting('showFps', v);
        this.hud.setFpsVisible(v);
      }
    });

    // Any first gesture unlocks WebAudio.
    const resume = () => this.audio.resume();
    addEventListener('pointerdown', resume, { once: false });
    addEventListener('keydown', resume, { once: false });
  }

  applySetting(key, value) {
    switch (key) {
      case 'quality':
        this.engine.setQuality(value);
        this.fx.q = QUALITY[value].particles;
        break;
      case 'sensitivity': this.input.sensitivity = value; break;
      case 'invertY': this.input.invertY = value; break;
      case 'volume': this.audio.setVolume(value); break;
      case 'fov': this.engine.fovBase = value; this.engine.fovTarget = value; break;
      case 'showFps': this.hud.setFpsVisible(value); break;
    }
  }

  /* ---------------------------------------------------------------- */
  async boot() {
    const fill = document.getElementById('load-fill');
    const text = document.getElementById('load-text');
    const steps = [
      ['Priming reactors…', 0.2],
      ['Compiling shaders…', 0.45],
      ['Loading chassis registry…', 0.7],
      ['Calibrating targeting computers…', 0.9],
      ['Ready', 1.0],
    ];
    for (const [msg, pct] of steps) {
      text.textContent = msg;
      fill.style.width = (pct * 100) + '%';
      await frame();
    }
    const loading = document.getElementById('loading');
    loading.classList.add('done');
    setTimeout(() => loading.remove(), 600);

    this.booted = true;
    this.menus.open('title');
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  /* ---------------------------------------------------------------- */
  startMatch({ mode, mapId, difficulty }) {
    this.audio.resume();
    this.menus.close();
    this.menus.suspended = true;
    this.hangarScene.leave();

    // Pick the arena.
    const pool = mapsForMode(mode);
    const def = mapId === 'random'
      ? pool[Math.floor(Math.random() * pool.length)]
      : (MAP_BY_ID[mapId] || pool[0]);

    // Tear down any previous world.
    if (this.arena) { this.engine.scene.remove(this.arena.group); this.arena.dispose(); }
    if (this.match) this.match.dispose();

    this.arena = new Arena(def, QUALITY[this.progression.settings.quality]);
    this.engine.scene.add(this.arena.group);
    this.engine.applyBiome(this.arena.biome, { interior: this.arena.interior });
    this.controller.world = this.arena;

    this.match = new Match({
      engine: this.engine,
      world: this.arena,
      fx: this.fx,
      audio: this.audio,
      mode,
      hangar: this.progression.toMatchHangar(),
      difficulty,
      progression: this.progression,
      quality: QUALITY[this.progression.settings.quality],
    });
    this.match.onEvent = (e) => this.onMatchEvent(e);

    this.state = 'match';
    this.paused = false;
    this._pendingRespawn = false;
    this.hud.show();
    this.hud.hideRespawn();
    this.hud.toast(def.name, BIOMES[def.biome].label);
    this.input.requestLock();
    this.accumulator = 0;
    this.lastTime = performance.now();
    this._matchStartTime = performance.now();
  }

  endMatch(result) {
    const award = this.progression.awardMatch(result, this.match.mode.id);
    const seconds = (performance.now() - this._matchStartTime) / 1000;
    const chassisId = this.match.player?.mech?.chassis.id;
    if (chassisId) this.progression.recordMechUse(chassisId, seconds);

    this.state = 'menu';
    this.menus.suspended = false;
    this.input.releaseLock();
    this.hud.hide();
    this.hud.hideRespawn();
    this.hud.setScoreboard(this.match, false);
    document.getElementById('pointer-hint').classList.add('hidden');

    if (this.arena) { this.engine.scene.remove(this.arena.group); this.arena.dispose(); this.arena = null; }
    if (this.match) { this.match.dispose(); this.match = null; }

    this.menus.showResults(result, award);
  }

  onMatchEvent(e) {
    this.hud.onMatchEvent(e);
    if (e.type === 'playerDown') {
      this._pendingRespawn = true;
      this.input.releaseLock();
      const killer = e.entry?.mech?.lastDamagedBy?.name;
      this.hud.showRespawn(e.entry, killer, (i) => {
        if (this.match?.respawnPlayer(i)) {
          this._pendingRespawn = false;
          this.hud.hideRespawn();
          this.input.requestLock();
        }
      });
    }
    if (e.type === 'matchEnd') {
      setTimeout(() => this.endMatch(e.result), 1400);
    }
  }

  togglePause() {
    if (this.state !== 'match') return;
    this.paused = !this.paused;
    if (this.paused) {
      this.input.releaseLock();
      this._pauseModal();
    } else {
      document.querySelector('.pause-back')?.remove();
      this.input.requestLock();
    }
  }

  _pauseModal() {
    const back = document.createElement('div');
    back.className = 'modal-back pause-back';
    back.innerHTML = `<div class="modal" style="max-width:420px;text-align:center">
      <h3>PAUSED</h3>
      <div class="row" style="justify-content:center;margin-top:10px">
        <button class="btn primary" data-resume>RESUME</button>
        <button class="btn danger" data-abort>ABANDON MATCH</button>
      </div>
      <p class="tiny muted" style="margin-top:14px;line-height:1.7">
        The simulation keeps running while this is open — mechs do not politely wait.</p>
    </div>`;
    document.body.appendChild(back);
    back.querySelector('[data-resume]').onclick = () => this.togglePause();
    back.querySelector('[data-abort]').onclick = () => {
      back.remove();
      this.paused = false;
      if (this.match) {
        this.match._end(this.match.player.team === 'a' ? 'b' : 'a', 'ABANDONED');
      }
    };
  }

  /* ---------------------------------------------------------------- */
  loop = () => {
    requestAnimationFrame(this.loop);
    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (!isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, MAX_FRAME);

    this.engine.tickStats(dt);

    if (this.state === 'match' && this.match) {
      this._updateMatch(dt);
    } else {
      this.hangarScene.update(dt);
      this.fx.update(dt);
    }

    this.engine.update(dt, this._grade());
    this.engine.render();
    this.input.endFrame();
  };

  _updateMatch(dt) {
    const m = this.match;

    // Fixed-step the simulation so heavy frames do not change physics.
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED && steps < 12) {
      m.update(FIXED, this.controller);
      this.accumulator -= FIXED;
      steps++;
    }
    if (steps >= 12) this.accumulator = 0;   // give up rather than spiral

    // Visual systems run at frame rate.
    this.fx.update(dt);
    const shake = this.fx.consumeShake();
    if (shake > 0) this.engine.shake(shake);

    const mech = m.player?.mech;
    this.hud.update(m, mech, this.controller, dt);
    this.hud.setScoreboard(m, this.controller.scoreboardOpen);

    // Audio listener follows the camera.
    const cam = this.engine.camera;
    cam.getWorldDirection(_fwd);
    _right.crossVectors(_fwd, _up).normalize();
    this.audio.setListener(cam.position, _fwd, _right);

    // Engine hum tracks throttle.
    if (mech && mech.alive) {
      const spd = Math.hypot(mech.velocity.x, mech.velocity.z) / Math.max(1, mech.maxSpeed);
      this.audio.loop('engine', { f0: 46, type: 'sawtooth', vol: 0.035 });
      this.audio.setLoop('engine', { f0: 42 + spd * 34 + mech.heatFraction * 10, vol: 0.03 + spd * 0.035 });
    } else {
      this.audio.stopLoop('engine');
    }
  }

  _grade() {
    const mech = this.match?.player?.mech;
    if (!mech || !mech.alive) return { damage: 0, heat: 0, emp: 0, cockpit: false };
    return {
      damage: clamp(1 - mech.healthFraction, 0, 1) * 0.85,
      heat: clamp((mech.heatFraction - 0.5) / 0.5, 0, 1),
      emp: clamp(mech.jammedFor / 2, 0, 1),
      cockpit: this.controller.view === 'cockpit',
    };
  }
}

function frame() { return new Promise(r => requestAnimationFrame(() => setTimeout(r, 14))); }

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

const game = new Game();
window.__game = game;      // handy for debugging from the console
game.boot();
