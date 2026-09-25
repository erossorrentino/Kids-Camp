/**
 * TITAN CLASH — entry point
 * ------------------------------------------------------------------
 * Owns the application state machine (menu <-> match), the fixed-step
 * simulation loop and the wiring between systems. Everything else is a
 * module that does one job.
 */
import * as THREE from 'three';
import { Engine, QUALITY, suggestQuality, qualityCeiling } from './core/engine.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { FX } from './world/fx.js';
import { Arena } from './world/arena.js';
import { setSurfaceBudget } from './world/textures.js';
import { setSkinBudget } from './world/skinTexture.js';
import { Sky } from './world/sky.js';
import { CockpitRig } from './world/cockpitRig.js';
import { Match, setTeamPalette, TEAM_COLORS } from './game/match.js';
import { PlayerController } from './game/player.js';
import { HUD } from './ui/hud.js';
import { Menus } from './ui/menus.js';
import { HangarScene } from './ui/hangarScene.js';
import { Progression } from './ui/progression.js';
import { Tutorial } from './ui/tutorial.js';
import { Markers } from './ui/markers.js';
import { TouchControls, isTouchDevice } from './ui/touch.js';
import { MAPS, MAP_BY_ID, mapsForMode, BIOMES } from './data/maps.js';
import { TOURNAMENTS } from './data/tournaments.js';
import { clamp } from './core/rng.js';

const MAX_FRAME = 1 / 20;     // never simulate more than a 50ms step
const FIXED = 1 / 120;        // physics substep

class Game {
  constructor() {
    this.canvas = document.getElementById('viewport');
    this.progression = new Progression();
    const s = this.progression.settings;

    // Until the player picks a preset themselves, the device picks it. A
    // phone or a low-end Chromebook cannot carry the desktop texture budget,
    // and the way it fails is the whole screen going blank mid-match.
    if (s.qualityAuto !== false) {
      const want = suggestQuality();
      if (want !== s.quality) this.progression.setSetting('quality', want);
    }
    applyBudget(this.progression.settings.quality);

    this.engine = new Engine(this.canvas, this.progression.settings.quality);
    this.engine.fovBase = s.fov;
    this.engine.fovTarget = s.fov;

    this.input = new Input(this.canvas);
    this.input.sensitivity = s.sensitivity;
    this.input.touchSensitivity = s.touchSensitivity ?? this.input.touchSensitivity;
    this.input.invertY = s.invertY;

    this.audio = new Audio();
    this.audio.volume = s.volume;

    this.fx = new FX(this.engine.scene, QUALITY[s.quality].particles);
    this.fx.setCamera(this.engine.camera);

    this.hud = new HUD(this.engine, this.audio);
    this.hud.setFpsVisible(s.showFps);

    this.sky = new Sky(this.engine.scene);
    this.cockpit = new CockpitRig(this.engine.scene);
    this.tutorial = new Tutorial(this.audio);
    this.markers = new Markers(this.engine.camera);
    this.markers.setVisible(false);
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

    // On a phone or a tablet the keyboard and the mouse are not there to be
    // used. The on-screen controls write the same intent, so the simulation
    // is unchanged -- see src/ui/touch.js.
    this.touchMode = s.touchControls === 'on'
      || (s.touchControls !== 'off' && isTouchDevice());
    this.touch = new TouchControls({
      input: this.input,
      canvas: this.canvas,
      onMenu: () => this.togglePause(),
      onAutoFire: (on) => {
        this.progression.setSetting('autoFire', on ? 'on' : 'off');
        this._applyHandling();
        this.audio.play('ui');
        this.hud.toast(on ? 'AUTO-FIRE ON' : 'AUTO-FIRE OFF',
          on ? 'The guns shoot whatever the reticle is on' : 'Hold FIRE to shoot');
      },
    });
    if (this.touchMode) this.input.setTouchMode(true);
    // A Chromebook or a Windows laptop with a touchscreen reports a fine
    // pointer, so it does not look like a phone until somebody taps it.
    addEventListener('touchstart', () => {
      if (this.touchMode || this.progression.settings.touchControls === 'off') return;
      this.setTouchMode(true);
    }, { passive: true, once: false });

    this.state = 'menu';
    this.booted = false;
    this.match = null;
    this.arena = null;
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.paused = false;
    this._pendingRespawn = false;
    this.killCam = null;
    this.intro = null;

    // Adaptive quality: a mech arena is unplayable below ~40fps, and the
    // right response to a slow machine is fewer shadows, not a slideshow.
    this.autoQuality = s.autoQuality !== false;
    // A machine that had to start on the lightest preset should not be
    // climbed back to the heaviest one just because a quiet minute went
    // smoothly -- that is how a phone ends up losing its context again.
    this.maxQuality = qualityCeiling();
    this._perfWindow = [];
    this._perfCooldown = 6;

    // Apply the saved accessibility settings before anything renders.
    this.shakeScale = s.shake ?? 1;
    this._applyTeamPalette(s.colourMode || 'default');
    this._applyUiScale(s.uiScale ?? 1);
    this.markers.showNumbers = s.damageNumbers !== false;
    this.markers.showPlates = s.nameplates !== false;

    this._dmgAcc = new Map();       // target mech -> the number climbing over it
    this._wireGlobal();
    this._wireContextLoss();
    this._applyHandling();
  }

  /* ---------------------------------------------------------------- */
  _wireGlobal() {
    const hint = document.getElementById('pointer-hint');
    this.input.onLockChange = (locked) => {
      if (this.state === 'match' && this.input.aimMode === 'lock') hint.classList.toggle('hidden', locked);
      else hint.classList.add('hidden');
    };
    // If pointer lock is refused -- an embedded frame without permission,
    // say -- say so once and explain the controls that do work.
    this.input.onAimModeChange = (mode) => {
      hint.classList.add('hidden');
      if (mode !== 'steer') return;
      this.hud.toast('MOUSE STEERING', 'Move toward an edge to turn · click to fire');
      const notice = document.getElementById('aim-mode');
      if (!notice) return;
      notice.classList.remove('hidden');
      setTimeout(() => notice.classList.add('hidden'), 11000);
    };

    this.canvas.addEventListener('click', () => {
      this.audio.resume();
      if (this.state === 'match' && !this._pendingRespawn && this.input.aimMode === 'lock') {
        this.input.requestLock();
      }
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

  /**
   * Scale the HUD and menus. The stylesheet is written in pixels, so this
   * uses `zoom` on the two containers rather than the root font size, which
   * would do nothing. World markers are deliberately excluded: their
   * positions are computed in screen pixels and zoom would offset them.
   */
  _applyUiScale(scale) {
    const z = Math.max(0.6, Math.min(2, scale || 1));
    for (const id of ['hud', 'ui-root']) {
      const el = document.getElementById(id);
      if (el) el.style.zoom = z === 1 ? '' : String(z);
    }
    document.documentElement.style.setProperty('--ui-scale', String(z));
  }

  /** Push a team palette into both the 3D accents and the CSS variables. */
  _applyTeamPalette(name) {
    const p = setTeamPalette(name);
    const hex = (n) => '#' + n.toString(16).padStart(6, '0');
    document.documentElement.style.setProperty('--team-a', hex(p.a));
    document.documentElement.style.setProperty('--team-b', hex(p.b));
  }

  /** Turn the on-screen controls on or off at runtime. */
  setTouchMode(on) {
    if (this.touchMode === on) return;
    this.touchMode = on;
    this.input.setTouchMode(on);
    this.touch.setVisible(on && this.state === 'match');
    if (on) this.input.releaseLock();
    this._applyHandling();
  }

  /**
   * Movement style, aim assist and auto-fire. All three default to 'auto',
   * which means the arena-shooter handling on a stick and the simulation
   * handling on a mouse -- a thumb cannot track a running mech the way a
   * mouse can, and a mouse does not want its aim nudged.
   */
  _applyHandling() {
    const s = this.progression.settings;
    const touch = this.touchMode;
    // Steering is the default everywhere now, keyboard included: left means
    // the machine goes left, which is what an arena game means by left. The
    // simulation convention is still one setting away.
    const style = s.moveStyle || 'auto';
    this.controller.moveStyle = style === 'auto' ? 'steer' : style;

    const assist = s.aimAssist || 'auto';
    this.controller.aimAssist = assist === 'auto' ? (touch ? 0.85 : 0)
      : assist === 'strong' ? 1 : assist === 'light' ? 0.5 : 0;

    const auto = s.autoFire || 'auto';
    this.controller.autoFire = auto === 'auto' ? touch : auto === 'on';
    this.touch.setAutoFire?.(this.controller.autoFire);
  }

  /**
   * The graphics context can be taken away -- a phone reclaiming memory, a
   * driver reset, a backgrounded tab. Three re-uploads what it needs when
   * the context comes back, so the game pauses, drops to the lightest
   * preset and carries on rather than leaving a blank page.
   */
  _wireContextLoss() {
    const notice = document.getElementById('gpu-notice');
    this.engine.onContextLost = () => {
      this._contextLostAt = performance.now();
      notice?.classList.remove('hidden');
      clearTimeout(this._gpuTimer);
      this._gpuTimer = setTimeout(() => {
        if (!this.engine.contextLost) return;
        window.__bootFail?.('The graphics context was lost and did not come back.',
          'This usually means the device ran out of graphics memory.');
      }, 9000);
    };
    this.engine.onContextRestored = () => {
      clearTimeout(this._gpuTimer);
      notice?.classList.add('hidden');
      // Come back lighter, and stay there: whatever the budget was, this
      // device could not hold it.
      this.maxQuality = 'low';
      if (this.progression.settings.quality !== 'low') {
        this.progression.setSetting('quality', 'low');
        this.applySetting('quality', 'low');
        this.hud?.toast?.('GRAPHICS REDUCED', 'Recovered from a graphics reset');
      }
      applyBudget('low');
      this.lastTime = performance.now();
      this.accumulator = 0;
    };
  }

  applySetting(key, value) {
    switch (key) {
      case 'quality':
        this.engine.setQuality(value);
        this.fx.q = QUALITY[value].particles;
        // Resizing the generated textures throws away everything cached, so
        // it happens between matches -- or on the recovery path, where
        // freeing that memory is the entire point.
        if (this.state !== 'match') applyBudget(value);
        break;
      case 'sensitivity': this.input.sensitivity = value; break;
      case 'touchSensitivity': this.input.touchSensitivity = value; break;
      case 'touchControls':
        this.setTouchMode(value === 'on' || (value !== 'off' && isTouchDevice()));
        break;
      case 'moveStyle': case 'aimAssist': case 'autoFire':
        this._applyHandling();
        break;
      case 'invertY': this.input.invertY = value; break;
      case 'volume': this.audio.setVolume(value); break;
      case 'fov': this.engine.fovBase = value; this.engine.fovTarget = value; break;
      case 'showFps': this.hud.setFpsVisible(value); break;
      case 'autoQuality': this.autoQuality = value !== false; break;
      case 'colourMode': this._applyTeamPalette(value); break;
      case 'uiScale': this._applyUiScale(value); break;
      case 'shake': this.shakeScale = value ?? 1; break;
      case 'damageNumbers': this.markers.showNumbers = value !== false; break;
      case 'nameplates': this.markers.showPlates = value !== false; break;
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
    window.__booted = true;
    this.menus.open('title');
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  /* ---------------------------------------------------------------- */
  startMatch({ mode, mapId, difficulty, tournament = null }) {
    this.audio.resume();
    // Size the generated textures for the preset before the arena builds any.
    applyBudget(this.progression.settings.quality);
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
    // Interior maps have a roof; a skydome behind it would only z-fight
    // with the ceiling and cost fill rate for nothing.
    if (this.arena.interior) this.sky.detach();
    else {
      const sunDir = this.engine.sun.position.clone().sub(this.engine.sunTarget.position).normalize();
      this.sky.apply(this.arena.biome, def, sunDir);
      this.engine.scene.background = null;   // the dome is the background now
    }
    this.controller.world = this.arena;

    this.tournamentRound = tournament;
    this.match = new Match({
      engine: this.engine,
      world: this.arena,
      fx: this.fx,
      audio: this.audio,
      mode,
      // A circuit round is fought with the lance locked in at entry.
      hangar: tournament ? this.progression.runHangar() : this.progression.toMatchHangar(),
      difficulty,
      progression: this.progression,
      quality: QUALITY[this.progression.settings.quality],
    });
    this.match.onEvent = (e) => this.onMatchEvent(e);
    // Aim assist and auto-fire need to know who is on the field.
    this.controller.match = this.match;
    // One trigger for everything is the arena convention, and it is the only
    // thing that makes sense with a thumb on a FIRE button.
    if (this.touchMode) this.controller.fireGroup = 'all';
    this.match.onLightning = () => this.sky.strike();

    this.state = 'match';
    this.paused = false;
    this._pendingRespawn = false;
    this.killCam = null;
    this.intro = null;
    this.hud.show();
    this.markers.setVisible(true);
    if (this.touchMode) this.touch.setVisible(true);
    this.hud.hideRespawn();
    // The intro card names the arena, so the centre-screen toast would just
    // be the same words twice.
    this.hud.toast('', '');
    if (this.match.mode.tutorial) {
      this.tutorial.start({ mech: this.match.player.mech, match: this.match, controller: this.controller, input: this.input });
    } else {
      this.tutorial.stop();
    }
    // A short establishing sweep before the drop. It runs inside the
    // countdown, so it costs no match time, and any input skips it.
    this.intro = {
      time: 4.2, total: 4.2,
      centre: new THREE.Vector3(0, this.arena.safeGround(0, 0), 0),
      radius: this.arena.half * 0.9,
      angle: Math.random() * Math.PI * 2,
      height: this.arena.half * 0.55,
    };
    this.match.countdown += this.intro.total;
    this.hud.setIntro(def, this.match.mode, tournament);

    this.audio.ambience(def.biome);
    this.input.requestLock();
    this.accumulator = 0;
    this.lastTime = performance.now();
    this._matchStartTime = performance.now();
  }

  endMatch(result) {
    const award = this.progression.awardMatch(result, this.match.mode.id);
    const circuit = this.tournamentRound ? this.progression.advanceRun(result, award) : null;
    this.tournamentRound = null;
    const seconds = (performance.now() - this._matchStartTime) / 1000;
    const chassisId = this.match.player?.mech?.chassis.id;
    if (chassisId) this.progression.recordMechUse(chassisId, seconds);

    this.state = 'menu';
    this.tutorial.stop();
    this.killCam = null;
    this.intro = null;
    this.hud.hideKillCam();
    this.cockpit.setVisible(false);
    this.markers.setVisible(false);
    this.touch.setVisible(false);
    this.menus.suspended = false;
    this.input.releaseLock();
    this.hud.hide();
    this.hud.hideRespawn();
    this.hud.setScoreboard(this.match, false);
    document.getElementById('pointer-hint').classList.add('hidden');

    this.sky.detach();
    this.audio.stopAmbience();
    this.audio.stopAllLoops();
    if (this.arena) { this.engine.scene.remove(this.arena.group); this.arena.dispose(); this.arena = null; }
    if (this.match) { this.match.dispose(); this.match = null; }
    this._dmgAcc.clear();
    this.controller.match = null;
    this.controller.assistTarget = null;

    this.menus.showResults(result, award, circuit);
  }

  onMatchEvent(e) {
    this.hud.onMatchEvent(e);
    this._lastEvent = e;
    this._markerFeedback(e);
    if (e.type === 'playerDown') {
      this._pendingRespawn = true;
      this.input.releaseLock();
      // Hold on whoever did it for a beat before offering the respawn
      // screen. Seeing the kill is most of how a player learns what went
      // wrong; cutting straight to a menu throws that away.
      const killer = e.killer && e.killer.alive ? e.killer : null;
      this.killCam = {
        target: killer,
        anchor: (killer ? killer.position : e.lastPosition || this.engine.camera.position).clone(),
        name: killer ? killer.name : null,
        chassis: killer ? killer.chassis.name : null,
        time: killer ? 2.8 : 1.6,
        angle: Math.random() * Math.PI * 2,
        entry: e.entry,
      };
      this.hud.showKillCam(this.killCam);
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
    if (this._renderDead) return;
    requestAnimationFrame(this.loop);
    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (!isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, MAX_FRAME);

    this.engine.tickStats(dt);
    if (this.state === 'match') this._adaptQuality(dt);

    if (this.state === 'match' && this.match) {
      this._updateMatch(dt);
    } else {
      this._cockpitMech = null;
      this.hangarScene.update(dt);
      this.fx.update(dt);
    }

    this.engine.update(dt, this._grade());
    if (this._cockpitMech) this.cockpit.update(dt, this.engine.camera, this._cockpitMech);
    try {
      this.engine.render();
    } catch (err) {
      this._onRenderError(err);
    }
    this.input.endFrame();
  };

  /**
   * A frame that throws must not leave an empty window. The post chain is
   * the part most likely to fail on an unusual driver, so the first failure
   * drops to a plain forward render; only if that fails too does the game
   * give up, and then it says so.
   */
  _onRenderError(err) {
    this._renderFails = (this._renderFails || 0) + 1;
    console.error('render failed', err);
    if (this._renderFails === 1 && this.engine.postEnabled) {
      this.engine.setPostEnabled(false);
      this.hud?.toast?.('EFFECTS OFF', 'Post-processing failed on this device');
      return;
    }
    if (this._renderFails >= 4) {
      this._renderDead = true;
      window.__bootFail?.('The graphics pipeline stopped responding.', err);
    }
  }

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

    const mech = m.player?.mech;

    if (this.intro) this._updateIntro(dt, mech);
    else if (this.killCam) this._updateKillCam(dt);

    // The cockpit frame only exists in first person, and only while alive.
    // It is seated on the camera after engine.update() applies shake, so the
    // frame shakes with the view instead of against it.
    const inCockpit = this.controller.view === 'cockpit' && !!mech?.alive && !this.killCam && !this.intro;
    this.cockpit.setVisible(inCockpit);
    if (inCockpit && this._cockpitSkinFor !== mech.id) {
      this._cockpitSkinFor = mech.id;
      this.cockpit.applySkin(mech.model.materials.skin);
    }
    this._cockpitMech = inCockpit ? mech : null;

    // Visual systems run at frame rate.
    this.sky.update(dt, this.engine.camera);
    this.fx.update(dt);
    const shake = this.fx.consumeShake() * this.shakeScale;
    if (shake > 0) this.engine.shake(shake);
    if (this.tutorial.active) {
      this.tutorial.update(dt,
        { mech, match: m, controller: this.controller, input: this.input },
        this._lastEvent);
      this._lastEvent = null;
    }
    this._fadeCloseMechs(m, mech);
    // Nameplates over an establishing flyover are noise, and they collide
    // with the intro card.
    this.markers.setVisible(!this.intro);
    this.markers.update(dt, m, mech, this.controller);
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

  /**
   * Step the quality preset down when frame times stay bad, and back up
   * when there is headroom to spare. Uses a rolling window of frame times
   * rather than the displayed FPS so one stutter never triggers it.
   */
  _adaptQuality(dt) {
    if (!this.autoQuality || this.paused) return;
    this._perfCooldown -= dt;
    this._perfWindow.push(dt);
    if (this._perfWindow.length > 180) this._perfWindow.shift();
    if (this._perfCooldown > 0 || this._perfWindow.length < 120) return;

    const sorted = [...this._perfWindow].sort((a, b) => a - b);
    // The 80th-percentile frame time: what the game feels like, not its best case.
    const p80 = sorted[Math.floor(sorted.length * 0.8)];
    const order = ['low', 'medium', 'high', 'ultra'];
    const i = order.indexOf(this.progression.settings.quality);

    const ceiling = Math.min(order.indexOf(this.maxQuality || 'ultra'), order.length - 1);
    let next = null;
    if (p80 > 1 / 34 && i > 0) next = order[i - 1];
    else if (p80 < 1 / 110 && i < ceiling) next = order[i + 1];
    if (!next) return;

    this.progression.setSetting('quality', next);
    this.applySetting('quality', next);
    this.hud.toast('GRAPHICS ' + (order.indexOf(next) < i ? 'REDUCED' : 'RAISED'), next.toUpperCase());
    this._perfCooldown = 14;
    this._perfWindow.length = 0;
  }

  /**
   * Establishing sweep: a slow high orbit that eases down onto the
   * player's mech, handing over to the normal chase camera as it lands.
   */
  _updateIntro(dt, mech) {
    const it = this.intro;
    it.time -= dt;
    const t = clamp(1 - it.time / it.total, 0, 1);
    const ease = t * t * (3 - 2 * t);

    it.angle += dt * 0.22;
    const cam = this.engine.camera;

    // Start high and wide over the arena, finish just behind the mech.
    const wide = _introA.set(
      it.centre.x + Math.cos(it.angle) * it.radius,
      it.centre.y + it.height,
      it.centre.z + Math.sin(it.angle) * it.radius,
    );
    let look = it.centre;

    if (mech) {
      const back = _introB.set(-Math.sin(mech.aimYaw), 0, -Math.cos(mech.aimYaw));
      const close = _introC.copy(mech.position)
        .addScaledVector(back, mech.height * 1.9)
        .setY(mech.position.y + mech.height * 1.1);
      wide.lerp(close, ease * ease);
      look = _introD.copy(it.centre).lerp(
        _introE.copy(mech.position).setY(mech.position.y + mech.height * 0.6), ease);
    }

    cam.position.copy(wide);
    cam.lookAt(look);

    // Skipping: any movement key, a click, or the ability key.
    const skipped = this.input.mouse.left || this.input.mouseEdges.left
      || this.input.isDown('forward') || this.input.isDown('jump') || this.input.pressed('ability');
    if (it.time <= 0 || skipped) this._endIntro();
  }

  _endIntro() {
    if (!this.intro) return;
    // Give the countdown back whatever sweep time is left.
    if (this.match) this.match.countdown = Math.min(this.match.countdown, 3.4);
    this.intro = null;
    this.hud.clearIntro();
  }

  /**
   * Orbit the killer (or the wreck) while the death beat plays, then hand
   * over to the respawn picker.
   */
  _updateKillCam(dt) {
    const kc = this.killCam;
    kc.time -= dt;
    kc.angle += dt * 0.45;

    // Track a live killer; a wreck or a hazard death just holds position.
    if (kc.target?.alive) kc.anchor.lerp(kc.target.position, clamp(dt * 3, 0, 1));

    const height = kc.target?.height || 10;
    const dist = height * 2.4 + 10;
    const cam = this.engine.camera;
    const want = _kcWant.set(
      kc.anchor.x + Math.cos(kc.angle) * dist,
      kc.anchor.y + height * 1.25,
      kc.anchor.z + Math.sin(kc.angle) * dist,
    );
    // Do not bury the camera in a wall.
    if (this.arena) {
      const dir = _kcDir.copy(want).sub(kc.anchor);
      const len = dir.length();
      dir.multiplyScalar(1 / len);
      const hit = this.arena.raycast(kc.anchor, dir, len + 1);
      if (hit) want.copy(kc.anchor).addScaledVector(dir, Math.max(5, hit.t - 1.2));
    }
    cam.position.lerp(want, clamp(dt * 4, 0, 1));
    cam.lookAt(kc.anchor.x, kc.anchor.y + height * 0.5, kc.anchor.z);

    if (kc.time > 0) return;

    this.killCam = null;
    this.intro = null;
    this.hud.hideKillCam();
    if (this.state !== 'match' || !this.match) return;
    this.hud.showRespawn(kc.entry, kc.name, (i) => {
      if (this.match?.respawnPlayer(i)) {
        this._pendingRespawn = false;
        this.hud.hideRespawn();
        this.input.requestLock();
      }
    });
  }

  /** Floating numbers for damage dealt, and a ring segment for damage taken. */
  _markerFeedback(e) {
    const me = this.match?.player?.mech;
    if (e.type === 'hit' && e.target) {
      // Hits on the same machine inside a third of a second add up into one
      // number that climbs; a sustained burst starts a fresh one every
      // second and a half so the total stays readable.
      const now = performance.now();
      const acc = this._dmgAcc.get(e.target);
      if (!e.killing && acc && now - acc.last < 330 && now - acc.start < 1500) {
        acc.total += e.amount;
        acc.last = now;
        if (this.markers.bump(acc.rec, acc.total, acc.total >= 150 ? 'crit' : 'hit')) return;
      }
      const p = e.target.position.clone();
      p.y += e.target.height * (0.45 + Math.random() * 0.3);
      p.x += (Math.random() - 0.5) * 2;
      p.z += (Math.random() - 0.5) * 2;
      const rec = this.markers.damage(p, e.amount, e.killing ? 'kill' : e.amount >= 150 ? 'crit' : 'hit');
      if (e.killing) { this._dmgAcc.delete(e.target); return; }
      const slot = acc || {};
      slot.rec = rec; slot.total = e.amount; slot.start = now; slot.last = now;
      this._dmgAcc.set(e.target, slot);
    } else if (e.type === 'taken' && me) {
      const from = e.from || e.attacker?.position;
      const angle = from
        ? Math.atan2(from.x - me.position.x, from.z - me.position.z)
        : me.aimYaw + Math.PI;
      this.markers.incoming(angle, e.amount);
    }
  }

  /**
   * Third-person cameras get blocked by whatever walks in front of them.
   * Any mech that is not yours and is crowding the lens fades out rather
   * than filling the screen.
   */
  _fadeCloseMechs(match, playerMech) {
    const cam = this.engine.camera;
    const cockpit = this.controller.view === 'cockpit';
    for (const other of match.mechs) {
      if (!other.alive) continue;
      const isSelf = other === playerMech;
      if (isSelf && !cockpit) { other.screenFade = 1; continue; }
      const d = other.position.distanceTo(cam.position);
      const near = isSelf ? other.radius + 6 : other.radius + 7;
      const far = near + 6;
      other.screenFade = clamp((d - near) / (far - near), isSelf ? 0 : 0.12, 1);
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

/** Push a quality preset's texture budget into the generators. */
function applyBudget(quality) {
  const q = QUALITY[quality] || QUALITY.high;
  setSurfaceBudget({ size: q.tex, sets: q.sets });
  setSkinBudget({ size: q.skin, rough: q.skinRough, skins: q.skins });
}

const _fwd = new THREE.Vector3();
const _kcWant = new THREE.Vector3();
const _kcDir = new THREE.Vector3();
const _introA = new THREE.Vector3();
const _introB = new THREE.Vector3();
const _introC = new THREE.Vector3();
const _introD = new THREE.Vector3();
const _introE = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

let game = null;
try {
  if (window.__hasWebGL === false) throw new Error('WebGL is unavailable in this browser.');
  game = new Game();
  window.__game = game;      // handy for debugging from the console
  window.__MAP_IDS = MAPS.map(m => m.id);
  window.__TOURNAMENTS = TOURNAMENTS;
  game.boot().catch(err => {
    console.error(err);
    window.__bootFail?.('The arena failed while starting up.', err);
  });
} catch (err) {
  console.error(err);
  window.__bootFail?.('The arena could not start on this device.', err);
}
