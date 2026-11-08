// A race: builds the venue and the field, runs physics/AI/race control,
// drives cameras, effects, audio and the HUD, and reports the result.
import * as THREE from 'three';
import { Track, DS } from '../sim/track.js';
import { trackById } from '../data/tracks.js';
import { Environment } from '../gfx/environment.js';
import { buildTrackScene } from '../gfx/trackBuilder.js';
import { buildCar, makeVisualSpec } from '../gfx/carModel.js';
import { Effects, RacingLineGuide } from '../gfx/effects.js';
import { Vehicle, SURFACES } from '../sim/vehicle.js';
import { AIDriver, speedProfile } from '../sim/ai.js';
import { Race } from '../sim/race.js';
import { RaceCamera, CAMERA_MODES } from './camera.js';
import { HUD } from '../ui/hud.js';
import { audio } from '../audio/audio.js';
import { visualOptionsFor } from '../data/cars.js';
import { clamp, lerp } from '../core/rng.js';

const hexCss = (c) => '#' + new THREE.Color(c).getHexString();

export class RaceScene {
  constructor(app, opts) {
    this.app = app;
    this.opts = opts;
    this.gfx = app.gfx;
    this.input = app.input;
    this.paused = false;
    this.time = 0;
    this.finishedTimer = -1;
    this.done = false;
  }

  async load(progress = () => {}) {
    const o = this.opts;
    const gfx = this.gfx;
    const tick = () => new Promise((r) => setTimeout(r, 0));
    progress(0.05, 'Surveying the circuit…');
    await tick();
    const def = trackById(o.trackId);
    this.track = new Track(def);
    const scene = new THREE.Scene();
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.25, 32000);
    const envName = o.envOverride || def.env;
    this.env = new Environment(scene, gfx.renderer, envName, gfx.quality);
    this.night = !!this.env.preset.night;
    this.wet = !!this.env.preset.rain;
    progress(0.2, 'Laying tarmac and painting curbs…');
    await tick();
    this.venue = buildTrackScene(this.track, this.env, gfx.quality);
    scene.add(this.venue.group);
    progress(0.6, 'Rolling the cars onto the grid…');
    await tick();

    // ---- entrants
    const settings = o.settings;
    const n = o.field.length + 1;
    const gridPos = clamp(o.gridPos ?? Math.floor(n / 2), 0, n - 1);
    const entrants = [];
    let slot = 0;
    const fieldQueue = o.field.slice();
    const quality = gfx.quality;
    for (let k = 0; k < n; k++) {
      const gs = this.track.gridSlot(slot++);
      if (k === gridPos) {
        // player
        const P = o.player;
        const vis = makeVisualSpec(P.car.body, P.car.seed, visualOptionsFor(P.car, P.custom));
        const model = buildCar(vis, { detail: 2, night: this.night });
        model.root.rotation.order = 'YXZ';
        scene.add(model.root);
        const veh = new Vehicle(P.stats.physics, this.track, {
          assists: settings.assists, manual: settings.manual,
          halfWidth: model.dims.W / 2, halfLength: (model.dims.front - model.dims.rear) / 2, wet: this.wet,
        });
        veh.reset(gs.s, gs.d);
        const e = { id: 'player', isPlayer: true, name: 'You', car: P.car, stats: P.stats, veh, model, total: gs.s - this.track.length, mass: P.stats.physics.mass, color: hexCss(vis.paint), vis };
        e.prevS = veh.proj.s;
        entrants.push(e);
        this.player = e;
      } else {
        const f = fieldQueue.shift();
        const vis = makeVisualSpec(f.car.body, f.car.seed + k * 17, { ...visualOptionsFor(f.car, {}), number: f.number, livery: f.car.race ? undefined : (Math.random() < 0.5 ? 'race' : 'race_stripes'), race: true });
        const model = buildCar(vis, { detail: quality.carDetail >= 2 ? 1 : 0, night: this.night });
        model.root.rotation.order = 'YXZ';
        scene.add(model.root);
        const ai = new AIDriver(this.track, f.stats.physics, { skill: f.skill * (this.wet ? 0.97 : 1), seed: k * 101 + 7, name: f.name, halfWidth: model.dims.W / 2, halfLength: (model.dims.front - model.dims.rear) / 2 });
        ai.place(gs.s, gs.d);
        ai.total = gs.s - this.track.length;
        entrants.push({ id: 'ai' + k, isPlayer: false, name: f.name, car: f.car, stats: f.stats, ai, model, mass: f.stats.physics.mass, color: hexCss(vis.paint), vis });
      }
      if (k % 3 === 2) { progress(0.6 + (k / n) * 0.3, 'Rolling the cars onto the grid…'); await tick(); }
    }
    this.entrants = entrants;
    this.race = new Race(this.track, entrants, { laps: o.laps });
    this.race.updatePositions();

    // ---- helpers
    this.effects = new Effects(scene, { rain: this.wet, night: this.night });
    this.playerProfile = speedProfile(this.track, this.player.stats.physics, 0.97);
    this.guide = new RacingLineGuide(scene, this.track, this.playerProfile);
    this.guide.visible = !!settings.assists.line;
    this.rcam = new RaceCamera(this.camera, this.track);
    this.rcam.setMode(settings.camera || 0);
    this.hud = new HUD(this.app.overlay, this.track, { units: settings.units });
    if (this.night) {
      this.player.model.setHeadlights(true);
      const spot = new THREE.SpotLight(0xfff4e0, 900, 120, 0.5, 0.6, 1.6);
      spot.castShadow = false;
      this.player.model.root.add(spot);
      spot.position.set(0, 0.7, this.player.model.dims.front);
      const tgt = new THREE.Object3D();
      tgt.position.set(0, 0, this.player.model.dims.front + 25);
      this.player.model.root.add(tgt);
      spot.target = tgt;
      for (const e of entrants) e.model.setHeadlights(true);
    }
    gfx.buildComposer(scene, this.camera, this.env.preset.bloom);
    const grade = { night: { saturation: 1.12, contrast: 1.06, tint: [0.95, 0.98, 1.06], vignette: 0.42 }, sunset: { saturation: 1.12, contrast: 1.05, tint: [1.05, 0.98, 0.92], vignette: 0.38 },
      desert: { saturation: 1.06, contrast: 1.05, tint: [1.04, 1.0, 0.95] }, snow: { saturation: 1.0, contrast: 1.04, tint: [0.97, 1.0, 1.05] }, golden: { saturation: 1.1, contrast: 1.05, tint: [1.04, 1.0, 0.94] } }[envName];
    gfx.setGrade(grade || {});
    progress(0.95, 'Warming up the tyres…');
    await tick();
    // warm up shaders
    this.updateVisuals(0);
    this.rcam.update(0.016, this.camTarget());
    this.env.update(0, this.player.model.root.position, 0);
    gfx.renderer.compile(scene, this.camera);
    progress(1, 'Ready!');
    this.initAudio();
    this.lastLights = 0;
    this.preStart = 1.6; // seconds of grid view before lights start
  }

  initAudio() {
    if (!audio.ctx) return;
    const c = this.player.car;
    this.voice = audio.createEngine({ sound: c.sound, cyl: c.cyl, ev: c.ev, gain: 1.0, turbo: !!(this.opts.player.custom.parts?.turbo) });
    this.aiVoices = [0, 1].map(() => null);
    this.aiVoiceOwners = [null, null];
    this.squeal = audio.noiseLayer('bandpass', 900, 5);
    this.wind = audio.noiseLayer('bandpass', 600, 0.6);
    this.rumble = audio.noiseLayer('lowpass', 220, 0.8);
    this.crowd = audio.noiseLayer('bandpass', 1100, 0.4);
  }

  camTarget() {
    const p = this.player, v = p.veh, d = p.model.dims;
    return { x: v.x, y: v.y, z: v.z, heading: v.heading, vx: v.vx, vz: v.vz, speed: v.speed, roll: v.groundRoll || 0, L: d.front - d.rear, H: d.H, nitro: v.nitroOn, s: v.proj.s };
  }

  pause(p = true) { this.paused = p; if (this.voice) this.voice.update(900, 0, { vol: p ? 0 : 1 }); }

  frame(dt) {
    if (this.done) return;
    dt = Math.min(dt, 1 / 20);
    const input = this.input.update(dt);
    // auto-accelerate assist (great on phones): full throttle unless braking
    if (this.opts.settings.assists.autoGas && input.brake < 0.1 && !input.handbrake) input.throttle = 1;
    const actions = this.input.consumeActions();
    if (actions.has('pause')) { this.app.togglePause(); }
    if (actions.has('mute')) audio.toggleMute();
    if (this.paused) { this.render(0); return; }
    this.time += dt;
    const race = this.race, P = this.player, veh = P.veh;
    if (actions.has('camera')) this.hudCam(this.rcam.next());
    if (actions.has('shiftUp') && this.opts.settings.manual) veh.shift(1);
    if (actions.has('shiftDown') && this.opts.settings.manual) veh.shift(-1);
    if (actions.has('reset') && race.state === 'racing') this.resetPlayer();

    // pre-start / lights
    if (race.state === 'grid') {
      this.preStart -= dt;
      if (this.preStart <= 0) race.startLights();
    }
    race.update(dt);
    for (const ev of race.drainEvents()) this.onRaceEvent(ev);

    const racing = race.state === 'racing' || race.state === 'finished';
    // ---- simulate
    const sub = Math.ceil(dt / (1 / 120));
    const sdt = dt / sub;
    const playerDone = P.finished;
    const autopilot = playerDone; // after the flag the car cruises
    for (let k = 0; k < sub; k++) {
      if (racing) {
        let inp = input;
        if (autopilot || this.autoDrive) inp = this.autopilotInput(this.autoDrive && !autopilot ? 0.93 : 0.7);
        const safe = this.safeSpeed();
        veh.update(sdt, inp, { safeSpeed: safe });
      } else {
        // on the grid: rev the engine but stay put
        veh.rpm = lerp(veh.rpm, (veh.p.idle || 800) + input.throttle * (veh.p.redline * 0.75 - (veh.p.idle || 800)), 1 - Math.exp(-sdt * 6));
      }
      for (const e of this.entrants) if (e.ai) e.ai.update(sdt, this.aiOthers || (this.aiOthers = this.entrants.map((x) => x.ai || x)), { rubber: this.rubberFor(e) });
    }
    // player progress
    let ds = veh.proj.s - P.prevS;
    const L = this.track.length;
    if (ds < -L / 2) ds += L; else if (ds > L / 2) ds -= L;
    P.total += ds; P.prevS = veh.proj.s;
    P.d = veh.proj.d;
    P.v = veh.speed;
    // wrong way detection
    const rel = Math.cos(veh.heading - this.track.heading[veh.proj.i]);
    P.wrongWay = rel < -0.3 && veh.speed > 4 ? (P.wrongWay || 0) + dt : 0;
    // stuck detection -> auto reset
    if (racing && !playerDone && veh.speed < 1.5 && veh.offTrack) { this.stuck = (this.stuck || 0) + dt; if (this.stuck > 4) this.resetPlayer(); } else this.stuck = 0;
    race.postUpdate(dt);
    for (const ev of race.drainEvents()) this.onRaceEvent(ev);

    // ---- visuals
    this.updateVisuals(dt);
    this.rcam.update(dt, this.camTarget(), { groundAt: this.venue.terrainHeight ? (x, z) => Math.max(this.venue.terrainHeight(x, z), veh.y) : null, rumble: veh.surface === 'curb' ? clamp(veh.speed / 30, 0, 1) : veh.offTrack ? 0.5 * clamp(veh.speed / 20, 0, 1) : 0 });
    if (veh.impact > 1.5) {
      this.rcam.addShake(clamp(veh.impact / 12, 0, 1));
      const i = veh.proj.i, side = veh.proj.d > 0 ? 1 : -1;
      const wx = veh.x + this.track.lx[i] * side * P.model.dims.W * 0.5, wz = veh.z + this.track.lz[i] * side * P.model.dims.W * 0.5;
      this.effects.sparks(wx, veh.y, wz, Math.sin(veh.heading) * 0.5 - this.track.lx[i] * side * 0.5, Math.cos(veh.heading) * 0.5 - this.track.lz[i] * side * 0.5, veh.impact);
      audio.impact(veh.impact);
    }
    this.guide.update(veh.proj.s, veh.speed);
    this.effects.update(dt, this.camera, this.rcam.vel);
    this.env.update(dt, veh, this.time);
    this.venue.update(dt, this.time);
    this.updateAudio(dt);
    this.hud.update(dt, race, P, {
      rpm: veh.rpm, redline: veh.p.redline, gear: veh.gear < 0 ? 'R' : racing || veh.speed > 0.5 ? String(veh.gear + 1) : 'N', speed: veh.speed,
      nitro: veh.nitro, nitroMax: veh.nitroMax, nitroOn: veh.nitroOn, limiter: veh.revLimiter,
      abs: veh.assists.abs, tcs: veh.assists.tcs, absActive: veh.assists.abs && P.input_brake, tcsActive: veh.assists.tcs && veh.spin > 0.02,
      wrongWay: P.wrongWay > 1.2, cameraName: CAMERA_MODES[this.rcam.mode],
    });
    P.input_brake = input.brake > 0.5 && veh.speed > 5;

    // finish sequence
    if (P.finished) {
      if (this.finishedTimer < 0) { this.finishedTimer = 0; this.rcam.setMode(4); }
      this.finishedTimer += dt;
      if (this.finishedTimer > 6) this.finish();
    }
    if (!this.skipRender) this.render(dt);
  }

  // Test/debug helper: advance the simulation without drawing frames
  simulate(seconds, step = 1 / 30) {
    this.skipRender = true;
    for (let t = 0; t < seconds && !this.done; t += step) this.frame(step);
    this.skipRender = false;
  }

  hudCam(name) { this.hud.toast(`<small>CAMERA</small> ${name}`, 1.2, 'cam'); }

  rubberFor(e) {
    // mild rubber-banding keeps races close for younger players
    const P = this.player;
    const gap = e.ai.total - P.total;
    const k = this.opts.settings.difficulty === 'easy' ? 1.5 : this.opts.settings.difficulty === 'hard' ? 0.5 : 1;
    if (gap > 150) return -0.025 * k;
    if (gap > 60) return -0.012 * k;
    if (gap < -250) return 0.02 * k;
    return 0;
  }

  safeSpeed() {
    if (!this.opts.settings.assists.autoBrake) return 0;
    const v = this.player.veh;
    const i = v.proj.i, N = this.track.N;
    // look ahead by the braking distance
    let m = 1e9;
    const steps = Math.ceil((v.speed * 1.8 + 20) / DS);
    for (let k = 0; k < steps; k++) {
      const target = this.playerProfile[(i + k) % N];
      // speed allowed now given we can brake ~0.85g over k*DS metres
      const allowed = Math.sqrt(target * target + 2 * 8.3 * v.p.mu * k * DS);
      m = Math.min(m, allowed);
    }
    return m;
  }

  autopilotInput(k = 0.7) {
    const v = this.player.veh, tr = this.track;
    const look = Math.max(8, v.speed * 0.5);
    const f = tr.frameAt(v.proj.s + look);
    const tx = f.x + f.lx * tr.raceLine[f.i], tz = f.z + f.lz * tr.raceLine[f.i];
    const a = Math.atan2(tx - v.x, tz - v.z) - v.heading;
    const ang = Math.atan2(Math.sin(a), Math.cos(a));
    let target = 1e9;
    for (let q = 0; q < 14; q++) target = Math.min(target, this.playerProfile[(v.proj.i + q) % tr.N]);
    target *= k;
    return { throttle: v.speed < target ? (k > 0.8 ? 1 : 0.6) : 0, brake: v.speed > target + 1 ? Math.min(1, (v.speed - target) / 3) : 0, steer: clamp(ang * 2.5 / Math.max(0.1, v.maxSteer(v.speed) * 2), -1, 1), analog: true };
  }

  resetPlayer() {
    const v = this.player.veh;
    const s = v.proj.s;
    const f = this.track.frameAt(s);
    v.reset(s, clamp(this.track.raceLine[f.i], -f.hw + 2, f.hw - 2), 0);
    this.player.prevS = v.proj.s;
    this.hud.message('RESET', 1);
  }

  onRaceEvent(ev) {
    const hud = this.hud;
    switch (ev.type) {
      case 'light':
        hud.setLights(ev.n);
        this.venue.setStartLights(ev.n);
        audio.beep(false);
        break;
      case 'go':
        hud.setLights(0, true);
        setTimeout(() => hud.setLights(0, false), 600);
        this.venue.setStartLights(0);
        hud.message('GO!', 1.2, 'go');
        audio.beep(true);
        if (this.crowd) { this.crowd.set(0.06); setTimeout(() => this.crowd && this.crowd.set(0.015), 3000); }
        break;
      case 'lap':
        hud.toast(`<small>LAP ${ev.lap}</small> ${fmt(ev.time)}${ev.best ? ' <em>BEST</em>' : ''}`, 2.5, ev.best ? 'best' : '');
        break;
      case 'finalLap':
        hud.message('FINAL LAP', 2, 'final');
        break;
      case 'position':
        if (ev.to < ev.from) hud.toast(`<small>OVERTAKE</small> P${ev.to}`, 1.2, 'up');
        break;
      case 'contact':
        this.rcam.addShake(clamp(ev.strength / 10, 0.05, 0.8));
        if (ev.strength > 2) audio.impact(ev.strength * 0.8);
        break;
      case 'finish': {
        const p = ev.position;
        hud.message(p === 1 ? 'YOU WIN!' : `FINISHED P${p}`, 5, p <= 3 ? 'win' : 'final');
        if (p <= 3) { audio.fanfare(); audio.crowdCheer(3.5); }
        break;
      }
      default: break;
    }
  }

  updateVisuals(dt) {
    const tr = this.track;
    for (const e of this.entrants) {
      const m = e.model;
      if (e.veh) {
        const v = e.veh;
        m.root.position.set(v.x, v.y, v.z);
        m.root.rotation.set(lerp(m.root.rotation.x, v.groundPitch || 0, dt ? 1 - Math.exp(-dt * 12) : 1), v.heading, lerp(m.root.rotation.z, v.groundRoll || 0, dt ? 1 - Math.exp(-dt * 12) : 1));
        const roll = clamp(-v.ayLocal * 0.0065, -0.07, 0.07);
        const pitch = clamp(-v.ax * 0.0055, -0.05, 0.05);
        m.update(dt, { steer: v.steer, speed: v.vLong, roll, pitch, braking: (this.input.state.brake > 0.1 && v.gear >= 0) || v.lockup > 0 });
        // effects
        const slipSmoke = clamp((v.slipRear - 0.14) * 3.5, 0, 1) * clamp((v.speed - 4) / 10, 0, 1) + clamp(v.spin, 0, 1) * 0.45 + (this.input.state.handbrake && v.speed > 5 ? 0.6 : 0);
        const surf = SURFACES[v.surface];
        const flame = (v.shiftEvent !== e.lastShift && v.lastShift > 0 && v.rpm > v.p.redline * 0.8 && !v.p.ev) || v.nitroOn;
        if (v.shiftEvent !== e.lastShift && v.lastShift > 0 && !v.p.ev && v.rpm > v.p.redline * 0.75) audio.backfire(0.5);
        e.lastShift = v.shiftEvent;
        this.effects.carFx(dt, e.id, {
          x: v.x, y: v.y, z: v.z, heading: v.heading, speed: v.speed, vx: v.vx, vz: v.vz,
          smoke: v.offTrack ? 0 : slipSmoke, markRear: v.offTrack ? 0 : Math.max(slipSmoke, v.lockup), markFront: v.lockup,
          onAsphalt: !v.offTrack, dust: v.offTrack && v.speed > 3 ? surf?.dust : null, wet: this.wet,
          wheels: this.wheelOffsets(e), flame: flame ? 1 : 0, nitro: v.nitroOn, exhausts: this.exhaustOffsets(e),
        });
      } else {
        const a = e.ai;
        m.root.position.set(a.x, a.y, a.z);
        m.root.rotation.set(a.groundPitch || 0, a.heading, a.groundRoll || 0);
        m.update(dt, { steer: a.steer, speed: a.v, roll: a.roll, pitch: a.braking ? 0.02 : -0.005, braking: a.braking });
        if (this.wet && dt) this.effects.carFx(dt, e.id, { x: a.x, y: a.y, z: a.z, heading: a.heading, speed: a.v, vx: 0, vz: 0, wet: true, wheels: this.wheelOffsets(e), smoke: 0, markRear: 0, markFront: 0 });
      }
    }
    void tr;
  }

  wheelOffsets(e) {
    if (!e._wheels) e._wheels = e.model.wheels.map((w) => ({ x: w.pivot.position.x, z: w.pivot.position.z, rear: !w.isFront, width: 0.12 }));
    return e._wheels;
  }
  exhaustOffsets(e) {
    if (!e._ex) { const d = e.model.dims; e._ex = [{ x: d.W * 0.25, y: 0.28, z: d.rear }, { x: -d.W * 0.25, y: 0.28, z: d.rear }]; }
    return e._ex;
  }

  updateAudio(dt) {
    if (!audio.ctx) return;
    if (!this.voice) this.initAudio();
    if (!this.voice) return;
    const v = this.player.veh, inp = this.input.state;
    const racing = this.race.state === 'racing' || this.race.state === 'finished';
    const thr = this.player.finished ? 0.3 : inp.throttle;
    this.voice.update(v.rpm, v.shiftTimer > 0 ? 0.1 : thr, { limiter: v.revLimiter });
    // tyres
    const slip = v.offTrack ? 0 : clamp((Math.max(v.slipRear, v.slipFront * 0.8) - 0.1) * 3, 0, 1) * clamp(v.speed / 10, 0, 1) + v.lockup * 0.6 + clamp(v.spin, 0, 1) * 0.5;
    this.squeal?.set(Math.min(0.32, slip * 0.32), 700 + slip * 500);
    this.wind?.set(clamp(v.speed / 90, 0, 1) ** 2 * 0.16, 400 + v.speed * 10);
    const rum = v.offTrack ? clamp(v.speed / 25, 0, 1) * 0.35 : v.surface === 'curb' ? clamp(v.speed / 25, 0, 1) * 0.3 * (0.5 + 0.5 * Math.sign(Math.sin(this.time * v.speed * 3))) : 0;
    this.rumble?.set(rum, v.offTrack ? 260 : 140);
    // two nearest AI engines (panned)
    const cam = this.camera;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const cands = this.entrants.filter((e) => e.ai).map((e) => ({ e, d: Math.hypot(e.ai.x - cam.position.x, e.ai.z - cam.position.z) })).sort((a, b) => a.d - b.d).slice(0, 2);
    for (let k = 0; k < 2; k++) {
      const c = cands[k];
      if (!c) { if (this.aiVoices[k]) { this.aiVoices[k].stop(); this.aiVoices[k] = null; } continue; }
      if (this.aiVoiceOwners[k] !== c.e) {
        if (this.aiVoices[k]) this.aiVoices[k].stop();
        this.aiVoices[k] = audio.createEngine({ sound: c.e.car.sound, cyl: c.e.car.cyl, ev: c.e.car.ev, gain: 0.55, pannable: true });
        this.aiVoiceOwners[k] = c.e;
      }
      const a = c.e.ai;
      const dx = a.x - cam.position.x, dz = a.z - cam.position.z;
      const pan = (dx * right.x + dz * right.z) / Math.max(c.d, 1);
      const vol = clamp(1 / (1 + c.d * 0.06), 0, 1) * (racing ? 1 : 0.6);
      this.aiVoices[k]?.update(a.rpm, a.braking ? 0.1 : 0.85, { vol, pan, dist: c.d });
    }
  }

  render(dt) {
    const v = this.player.veh;
    const sp = clamp((v.speed - 25) / 70, 0, 1) * (this.rcam.mode <= 1 ? 1 : 0.6) + (v.nitroOn ? 0.35 : 0);
    this.gfx.render(dt, { speed: clamp(sp, 0, 1) });
    this.gfx.trackFrame(dt || 0.016);
  }

  finish() {
    if (this.done) return;
    this.done = true;
    const race = this.race;
    // classify everyone; estimate times for cars still running
    const res = race.entrants.map((e) => {
      let time;
      if (e.finished) time = e.finishTime;
      else {
        const total = e.ai ? e.ai.total : e.total;
        const remaining = race.laps * this.track.length + this.track.length - total - this.track.length;
        const avg = Math.max(10, total / Math.max(1, race.time));
        time = race.time + Math.max(0, remaining) / avg;
      }
      return { name: e.name, isPlayer: e.isPlayer, car: e.car, time, best: e.bestLap, color: e.color };
    }).sort((a, b) => a.time - b.time);
    const pos = res.findIndex((r) => r.isPlayer) + 1;
    this.opts.onFinish?.({ results: res, position: pos, bestLap: this.player.bestLap, laps: race.laps });
  }

  dispose() {
    this.done = true;
    this.voice?.stop();
    this.aiVoices?.forEach((v) => v && v.stop());
    this.squeal?.stop(); this.wind?.stop(); this.rumble?.stop(); this.crowd?.stop();
    this.hud?.dispose();
    this.effects?.dispose();
    this.guide?.dispose();
    for (const e of this.entrants || []) e.model.dispose();
    this.venue?.dispose();
    this.env?.dispose();
    this.gfx.dispose();
  }
}

function fmt(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}
