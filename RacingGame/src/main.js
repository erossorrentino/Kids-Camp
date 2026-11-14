// Apex Velocity: app shell, main loop and game flow.
import { Graphics } from './gfx/renderer.js';
import { Showroom } from './game/showroom.js';
import { RaceScene } from './game/raceScene.js';
import { Input } from './game/input.js';
import { UI, toggleFullscreen } from './ui/menus.js';
import { audio } from './audio/audio.js';
import { loadProfile, saveProfile, resetProfile, isTouchFirst } from './core/save.js';
import { catalog, CAR_COUNT, formatPrice } from './data/cars.js';
import { effectiveStats } from './data/parts.js';
import { SERIES, seriesEvents, buildField, seriesUnlocked, PRIZE_SPLIT } from './data/events.js';
import { TRACKS, trackById } from './data/tracks.js';
import { hashString } from './core/rng.js';

// Error reports (see index.html). A no-op outside the published page.
const D = window.__diag || { log() {}, set() {}, send() { return false; }, hasDb: false, state: 'none' };
const MARK = 'apexVelocity.loading'; // set while something heavy loads; if it is still there at next start-up, the page crashed
const GFX_VERSION = 8;
const setMark = (v) => { try { if (v) localStorage.setItem(MARK, v); else localStorage.removeItem(MARK); } catch (e) { /* ignore */ } };
const TIER_DOWN = { ultra: 'medium', high: 'medium', medium: 'low', low: 'lite' };

class App {
  constructor() {
    const root = document.getElementById('app');
    this.view = document.createElement('div');
    this.view.className = 'view';
    root.appendChild(this.view);
    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay';
    root.appendChild(this.overlay);
    this.profile = loadProfile();
    this.root = root;
    this.isTouch = isTouchFirst();
    const st = this.profile.settings;
    // Phones and Chromebooks get the new safe defaults once (a higher setting can be picked again in Settings)
    if (st.gfxVersion !== GFX_VERSION) {
      if (this.isTouch || /CrOS/.test(navigator.userAgent)) st.quality = null;
      st.gfxVersion = GFX_VERSION;
    }
    // Did the page die while loading last time (out of memory, graphics crash)? Then use Lite.
    try {
      const m = localStorage.getItem(MARK);
      if (m) { D.log('crash-recovered', m, true); st.quality = 'lite'; st.liteLocked = true; this.crashRecovered = m; }
    } catch (e) { /* ignore */ }
    setMark('boot');
    window.addEventListener('pagehide', () => setMark(null));
    saveProfile(this.profile);
    if (this.isTouch) root.classList.add('is-touch');
    // touchscreen laptops/Chromebooks: switch to touch controls once the screen is actually touched
    window.addEventListener('touchstart', () => this.enableTouch(), { passive: true });
    // stop pinch-zoom / double-tap zoom on phones
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
    try {
      this.gfx = new Graphics(this.view);
    } catch (e) {
      setMark(null);
      window.__bootError?.('This device or browser could not start 3D graphics (WebGL 2). Try opening the game in the latest Chrome or Safari.\n(' + (e && e.message ? e.message : e) + ')', 'E-GL');
      throw e;
    }
    D.set('gpu', this.gfx.gpu);
    D.set('gl', this.gfx.caps);
    // if the GPU drops the 3D context (common on phones when memory is low), recover
    this.gfx.renderer.domElement.addEventListener('webglcontextlost', (ev) => {
      ev.preventDefault();
      this.contextLost = true;
      const was = this.gfx.qualityName;
      this.profile.settings.quality = 'lite';
      this.profile.settings.liteLocked = true;
      this.save();
      setMark(null);
      this.problem('E-LOST', 'Graphics restarting…', 'This device ran out of graphics memory, so the game is switching to Lite graphics. If nothing happens in a few seconds, tap Reload.',
        `context lost at ${was} in ${this.mode}`, [['Reload the game', () => location.reload()]]);
    });
    this.gfx.renderer.domElement.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      D.log('context-restored');
      document.querySelector('.notice')?.remove();
      this.ui.pauseMenu(false);
      if (this.race) { try { this.race.dispose(); } catch (e) { /* ignore */ } this.race = null; }
      this.gfx.setQuality('lite');
      this.showroom.contextRestored();
      this.showroom.setLite(true);
      this.enterMenu('home');
      this.ui.toast('Graphics were switched to Lite so the game runs on this device.');
    });
    this.setQuality(this.profile.settings.quality || this.autoQuality(), false);
    D.log('app-start', `${this.gfx.qualityName}${this.profile.settings.quality ? ' (saved)' : ' (auto)'} touch=${this.isTouch}`);
    audio.setVolume(this.profile.settings.volume);
    this.input = new Input(root);
    this.showroom = new Showroom(this.gfx);
    this.showroom.attachControls(this.view);
    this.ui = new UI(this);
    this.prCache = new Uint16Array(CAR_COUNT);
    this.prDone = 0;
    this.mode = 'menu';
    this.enterMenu('home');
    this.last = performance.now();
    window.addEventListener('blur', () => { if (this.mode === 'race' && this.race && !this.race.paused) this.togglePause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'race' && this.race && !this.race.paused) this.togglePause(); });
    const unlock = () => { audio.init(); };
    for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(ev, unlock);
    // errors outside the frame loop (button handlers etc.) go into the error report
    let jsErrors = 0;
    const jsError = (m) => { if (jsErrors++ < 8 && !/ResizeObserver/.test(m)) D.log('js-error', m, true); };
    window.addEventListener('error', (ev) => jsError((ev.message || 'error') + (ev.filename ? ` (${String(ev.filename).split('/').pop()}:${ev.lineno})` : '')));
    window.addEventListener('unhandledrejection', (ev) => jsError('promise: ' + String((ev.reason && (ev.reason.message || ev.reason)) || 'unknown')));
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    window.__app = this;
    window.__appStarted = true;
    const boot = document.getElementById('boot');
    if (boot) { boot.style.transition = 'opacity .4s'; boot.style.opacity = '0'; setTimeout(() => boot.remove(), 450); }
    this.watch = { frames: 0, white: 0 };
    this.goodFrames = 0;
    if (this.crashRecovered) setTimeout(() => this.ui.toast('The game closed unexpectedly last time, so graphics were set to Lite.'), 1200);
  }

  enableTouch() {
    if (this.isTouch) return;
    this.isTouch = true;
    this.root.classList.add('is-touch');
    if (this.mode === 'race') {
      if (!this.input.touchEl) this.input.buildTouchControls(this.overlay);
      this.input.touchEl.style.display = '';
    }
  }

  autoQuality() {
    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    const gpu = this.gfx.gpu || '';
    if ((navigator.deviceMemory || 4) <= 2) return 'lite'; // very little memory
    if (/SwiftShader|llvmpipe|Software|Mali-4|Mali-T|PowerVR|Adreno \(TM\) [2-5]\d\d\b/i.test(gpu)) return 'lite'; // old or software graphics
    if (this.isTouch && small) return 'lite'; // phones: start safe (Settings can raise it)
    if (/CrOS/.test(navigator.userAgent)) return 'low'; // Chromebooks
    if (this.isTouch) return 'low'; // tablets
    if (/Intel|Adreno|Mali|Apple GPU/i.test(gpu)) return 'medium';
    return 'high';
  }

  // Full-screen notice that works even while the menus are hidden (during races)
  notice(title, text, buttons = [], code = '', detail = '') {
    let el = document.querySelector('.notice');
    if (!el) { el = document.createElement('div'); el.className = 'notice'; this.overlay.appendChild(el); }
    el.innerHTML = `<div class="n-box"><h2></h2><div class="n-code"></div><p></p><div class="n-detail"></div><div class="n-actions"></div><div class="n-report"></div><small class="n-gpu"></small></div>`;
    el.querySelector('h2').textContent = title;
    el.querySelector('p').textContent = text;
    el.querySelector('.n-code').textContent = code ? 'Error code: ' + code : '';
    el.querySelector('.n-detail').textContent = detail ? String(detail).slice(0, 300) : '';
    el.querySelector('.n-gpu').textContent = 'Graphics chip: ' + (this.gfx.gpu || 'unknown') + ' · graphics: ' + this.gfx.qualityName;
    for (const [label, fn] of buttons) {
      const b = document.createElement('button');
      b.className = 'btn primary';
      b.textContent = label;
      b.onclick = () => { el.remove(); fn(); };
      el.querySelector('.n-actions').appendChild(b);
    }
    if (code) {
      // error report: saved automatically when allowed, otherwise offered as a button
      const rp = el.querySelector('.n-report');
      const refresh = (ok) => {
        if (ok === true || D.state === 'saved') rp.textContent = 'Error report saved. Claude can read it now.';
        else if (D.hasDb && !rp.querySelector('button')) {
          const b = document.createElement('button');
          b.className = 'btn small';
          b.textContent = 'Send error report';
          b.onclick = () => { b.remove(); rp.textContent = 'Sending…'; if (!D.send()) rp.textContent = ''; };
          rp.textContent = '';
          rp.appendChild(b);
        }
      };
      D.onSaved = refresh;
      refresh(null);
    }
    return el;
  }

  // A problem the player should know about: shows a notice with an error code and files an error report
  problem(code, title, text, detail = '', buttons = [['OK', () => {}]]) {
    D.log(code, detail || text, true);
    return this.notice(title, text, buttons, code, detail);
  }

  // Performance watchdog: if frames stay very slow even at the lowest render
  // resolution, step graphics down a level (e.g. Ultra picked on a Chromebook).
  perfCheck(dt) {
    const p = this.perf || (this.perf = { t: 0, n: 0, sum: 0, cool: 6 });
    p.cool -= dt; p.sum += dt; p.n++; p.t += dt;
    if (p.t < 2) return;
    const avg = p.sum / p.n;
    p.t = 0; p.sum = 0; p.n = 0;
    if (p.cool > 0 || this.contextLost) return;
    if (avg > 1 / 18 && this.gfx.renderScale <= 0.56) {
      const q = this.gfx.qualityName;
      const next = q === 'ultra' ? 'high' : q === 'high' ? 'medium' : q === 'medium' ? 'low' : q === 'low' ? 'lite' : null;
      if (!next) return;
      D.log('slow', `${Math.round(1 / avg)} fps at ${q} -> ${next}`);
      this.applyQualityLive(next);
      p.cool = 6;
      const msg = `Graphics lowered to ${next[0].toUpperCase() + next.slice(1)} to keep the game smooth on this device.`;
      if (this.mode === 'race' && this.race) this.race.hud?.toast(msg, 3); else this.ui.toast(msg);
    }
  }

  // Switch quality while a race (or the menu) is on screen
  applyQualityLive(q) {
    if (this.perf) this.perf.cool = 8; // give a manual change a moment before judging speed
    this.profile.settings.quality = q;
    this.save();
    this.gfx.setQuality(q);
    const lite = !!this.gfx.quality.lite;
    this.showroom.setLite(lite);
    if (this.mode === 'race' && this.race) {
      if (lite) this.race.goLite();
      else if (this.race.isLite) { this.restartRace(); return; } // leaving Lite needs the scene rebuilt
      this.gfx.buildComposer(this.race.scene, this.race.camera, this.race.env?.preset?.bloom ?? 0.2);
    } else if (this.mode === 'menu') this.gfx.buildComposer(this.showroom.scene, this.showroom.camera, 0.22);
  }

  restartRace() {
    const race = this.race;
    if (!race || !this.raceOpts) return;
    this.ui.pauseMenu(false);
    const { opts, after } = this.raceOpts;
    race.dispose(); this.race = null;
    this.startRace(opts, after);
  }

  setQuality(q, rebuild = true) {
    this.gfx.setQuality(q);
    if (this.showroom) this.showroom.setLite(!!this.gfx.quality.lite);
    if (rebuild && this.mode === 'menu') this.gfx.buildComposer(this.showroom.scene, this.showroom.camera, 0.22);
  }

  save() { saveProfile(this.profile); }

  resetSave() {
    this.profile = resetProfile();
    this.save();
    this.ui.updateWallet();
  }

  activeCar() {
    const p = this.profile;
    let entry = p.garage.find((g) => g.uid === p.activeUid) || p.garage[0];
    const car = catalog()[entry.carId];
    return { entry, car, stats: effectiveStats(car, entry.parts || {}) };
  }

  // Performance ratings for the dealership, computed in the background
  stepPR(budget = 6) {
    if (this.prDone >= CAR_COUNT) return;
    const t0 = performance.now();
    const cars = catalog();
    while (this.prDone < CAR_COUNT && performance.now() - t0 < budget) {
      const c = cars[this.prDone];
      this.prCache[this.prDone] = effectiveStats(c).pr;
      this.prDone++;
    }
  }
  ensurePR() { while (this.prDone < CAR_COUNT) this.stepPR(1000); }

  buyCar(car, paint) {
    const p = this.profile;
    if (p.credits < car.price) return false;
    p.credits -= car.price;
    const uid = 'g' + p.nextUid++;
    p.garage.push({ uid, carId: car.id, paint: paint ?? undefined, parts: {}, bought: Date.now(), wins: 0, races: 0 });
    p.activeUid = uid;
    this.save();
    return true;
  }
  sellValue(entry) {
    const car = catalog()[entry.carId];
    return Math.round((car.price * 0.6 + (entry.partsSpent || 0) * 0.5) / 100) * 100;
  }
  sellCar(entry) {
    const p = this.profile;
    if (p.garage.length <= 1) return;
    p.credits += this.sellValue(entry);
    p.garage = p.garage.filter((g) => g !== entry);
    if (p.activeUid === entry.uid) p.activeUid = p.garage[0].uid;
    this.save();
  }

  // ---------------------------------------------------------------------------
  // Hide on-screen race buttons and release anything held down
  hideTouchControls() {
    const el = this.input.touchEl;
    if (el) {
      el.style.display = 'none';
      el.querySelectorAll('.on').forEach((b) => b.classList.remove('on'));
    }
    for (const k in this.input.touch) this.input.touch[k] = k === 'steer' ? 0 : false;
  }

  enterMenu(screen = 'home', params) {
    this.mode = 'menu';
    this.root.classList.remove('racing');
    this.hideTouchControls();
    this.gfx.buildComposer(this.showroom.scene, this.showroom.camera, 0.22);
    this.gfx.setGrade({ saturation: 1.05, contrast: 1.05, vignette: 0.45 });
    this.gfx.renderer.toneMappingExposure = 0.85;
    this.ui.setVisible(true);
    this.ui.show(screen, params);
    this.input.capture = false;
  }

  async startRace(opts, after) {
    if (this.isTouch) toggleFullscreen(true);
    this.hideTouchControls();
    this.root.classList.add('racing');
    this.ui.setVisible(false);
    this.ui.modalEl.classList.remove('show');
    const tr = trackById(opts.trackId);
    const ld = this.ui.loading(tr.name, opts.title || '');
    this.mode = 'loading';
    if (this.race) { this.race.dispose(); this.race = null; }
    const a = opts.playerOverride || this.activeCar();
    const s = this.profile.settings;
    const race = new RaceScene(this, {
      ...opts, settings: s,
      player: { car: a.car, stats: a.stats, custom: a.entry },
      onFinish: (r) => this.finishRace(r, after),
    });
    const q0 = this.gfx.qualityName;
    const t0 = performance.now();
    setMark(`race ${opts.trackId} ${q0}`);
    D.log('race-load', `${opts.trackId} ${q0} cars=${opts.field.length + 1}`);
    try {
      await race.load((p, msg) => ld.set(p, msg));
    } catch (e) {
      console.error(e);
      setMark(null);
      ld.close();
      try { race.dispose(); } catch (e2) { /* ignore */ }
      const msg = (e && e.message ? e.message : String(e)) + (e && e.stack ? ' @ ' + String(e.stack).split('\n').slice(1, 3).join(' ').trim() : '');
      if (this.contextLost) return; // the context-lost handler takes over
      if (!this.gfx.quality.lite && !opts._retried) {
        // try once more with the simplest graphics before giving up
        D.log('race-load-failed', `${q0}: ${msg} -> retry in lite`, true);
        this.profile.settings.liteLocked = true;
        this.applyQualityLive('lite');
        return this.startRace({ ...opts, _retried: true }, after);
      }
      this.enterMenu('home');
      this.problem('E-RACE', 'The race could not start', 'Something went wrong while getting the race ready. Try again, or pick another track.', msg);
      return;
    }
    if (this.contextLost) return;
    ld.close();
    D.log('race-ready', `${Math.round(performance.now() - t0)} ms`);
    this.race = race;
    this.raceOpts = { opts, after };
    this.mode = 'race';
    this.goodFrames = 0;
    this.watch = { frames: 0, white: 0 };
    this.input.capture = true;
    if (this.isTouch && !this.input.touchEl) this.input.buildTouchControls(this.overlay);
    if (this.input.touchEl) this.input.touchEl.style.display = this.isTouch ? '' : 'none';
    this.last = performance.now();
  }

  startCareerRace(series, event) {
    const a = this.activeCar();
    const p = this.profile;
    const seed = hashString(event.id) + (p.stats.races * 7919);
    const field = buildField(series.req, a.stats, 7, seed, p.settings.difficulty);
    const gridPos = { easy: 3, normal: 5, hard: 7 }[p.settings.difficulty] ?? 5;
    this.startRace({ trackId: event.track, laps: event.laps, field, gridPos, title: `${series.name} · Race ${event.index + 1}` }, { kind: 'career', series, event });
  }

  startQuickRace(q) {
    const a = this.activeCar();
    const p = this.profile;
    const field = q.opponents > 0 ? buildField({}, a.stats, q.opponents, (Math.random() * 1e9) | 0, p.settings.difficulty) : [];
    const n = field.length + 1;
    this.startRace({ trackId: q.track, laps: q.laps, field, gridPos: Math.floor(n * 0.6), envOverride: q.env === 'auto' ? null : q.env, title: 'Quick Race' }, { kind: 'quick', q });
  }

  testDrive(car, custom = {}) {
    const stats = effectiveStats(car, {});
    const track = TRACKS[Math.floor(Math.random() * TRACKS.length)].id;
    const entry = { paint: custom.paint, parts: {} };
    this.startRace({ trackId: track, laps: 2, field: [], gridPos: 0, title: 'Test Drive', playerOverride: { car, stats, entry } }, { kind: 'test', car });
  }

  finishRace(r, after) {
    const p = this.profile;
    const race = this.race;
    const info = { title: '', prize: 0, bonus: 0, on: {} };
    const pos = r.position;
    const fps = race ? race.avgFps() : 0;
    D.log('race-end', `P${pos} ${fps} fps ${this.gfx.qualityName} scale=${this.gfx.renderScale}`);
    // ran smoothly on Lite and nothing has gone wrong on this device: offer nicer graphics
    if (this.gfx.quality.lite && fps >= 45 && !p.settings.liteLocked) {
      info.offerUpgrade = () => { D.log('upgrade-try', 'low'); this.applyQualityLive('low'); this.ui.toast('Graphics set to Low. If anything looks wrong the game will switch back by itself.'); };
    }
    if (after.kind === 'career') {
      const { series, event } = after;
      const before = SERIES.filter((s) => seriesUnlocked(s, p)).map((s) => s.id);
      info.title = `${series.name} · ${trackById(event.track).name}`;
      info.prize = pos <= PRIZE_SPLIT.length ? Math.round((event.purse * PRIZE_SPLIT[pos - 1]) / 100) * 100 : 0;
      const prev = p.career[event.id] || 99;
      p.career[event.id] = Math.min(prev, pos);
      const evs = seriesEvents(series);
      if (!p.seriesDone[series.id] && evs.every((e) => p.career[e.id] === 1)) { p.seriesDone[series.id] = true; info.bonus = series.bonus; }
      const after2 = SERIES.filter((s) => seriesUnlocked(s, p)).map((s) => s.id);
      const newly = after2.filter((id) => !before.includes(id));
      if (newly.length) info.unlocked = `New series unlocked: ${newly.map((id) => SERIES.find((s) => s.id === id).name).join(', ')}`;
      const next = evs[event.index + 1];
      if (next) info.next = true;
      info.on.next = () => this.startCareerRace(series, next);
      info.on.again = () => this.startCareerRace(series, event);
      info.on.menu = () => this.enterMenu('series', series.id);
    } else if (after.kind === 'quick') {
      info.title = `Quick Race · ${trackById(after.q.track).name}`;
      info.prize = after.q.opponents >= 3 ? [1500, 800, 400][pos - 1] || 0 : 0;
      info.on.again = () => this.startQuickRace(after.q);
      info.on.menu = () => this.enterMenu('quick');
    } else {
      info.title = `Test Drive · ${after.car.name}`;
      info.on.again = () => this.testDrive(after.car);
      info.on.menu = () => { this.enterMenu('dealer'); this.ui.carDetail(after.car); };
    }
    const earned = info.prize + info.bonus;
    p.credits += earned;
    if (after.kind !== 'test') {
      p.stats.races++;
      if (pos === 1) p.stats.wins++;
      if (pos <= 3) p.stats.podiums++;
      p.stats.earned += earned;
    }
    this.save();
    // tear down the race and show results over the menu backdrop
    if (race) race.dispose();
    this.race = null;
    this.mode = 'menu';
    this.gfx.buildComposer(this.showroom.scene, this.showroom.camera, 0.22);
    this.gfx.renderer.toneMappingExposure = 0.85;
    this.gfx.setGrade({ saturation: 1.05, contrast: 1.05, vignette: 0.45 });
    this.showroom.setFrame(-0.3);
    this.root.classList.remove('racing');
    this.hideTouchControls();
    this.input.capture = false;
    const wrapOn = (fn) => () => { this.ui.setVisible(true); fn(); };
    for (const k in info.on) info.on[k] = wrapOn(info.on[k]);
    this.ui.results(r, info);
  }

  togglePause() {
    const race = this.race;
    if (!race) return;
    const paused = !race.paused;
    race.pause(paused);
    if (paused) {
      this._pauseHandlers = this.pauseHandlers();
      this.ui.pauseMenu(true, this._pauseHandlers);
    } else this.ui.pauseMenu(false);
  }

  pauseHandlers() {
    return {
      resume: () => this.togglePause(),
      restart: () => this.restartRace(),
      camera: () => { this.race.hudCam(this.race.rcam.next()); },
      quality: () => {
        const order = ['lite', 'low', 'medium', 'high', 'ultra'];
        const q = order[(order.indexOf(this.gfx.qualityName) + 1) % order.length];
        D.log('quality', q + ' (pause menu)');
        this.applyQualityLive(q); // leaving Lite restarts the race with the new graphics
        if (this.race && this.race.paused) this.ui.pauseMenu(true, this._pauseHandlers);
      },
      line: () => {
        const s = this.profile.settings;
        s.assists.line = !s.assists.line;
        this.race.guide.visible = s.assists.line;
        this.save();
        this.ui.pauseMenu(true, this._pauseHandlers);
      },
      quit: () => {
        const race = this.race;
        this.ui.pauseMenu(false);
        setMark(null);
        race.dispose(); this.race = null;
        this.enterMenu('home');
      },
    };
  }

  // White-screen watchdog: if the 3D view comes out (almost) pure white for a
  // while, fall back to the simplest graphics settings.
  checkWhite() {
    const w = this.watch;
    if (!w || w.done || this.contextLost) return;
    w.frames++;
    if (w.frames < 20 || w.frames % 15 !== 0) return;
    if (w.frames > 600) { w.done = true; return; }
    const gl = this.gfx.renderer.getContext();
    const cw = gl.drawingBufferWidth, ch = gl.drawingBufferHeight;
    const px = new Uint8Array(4);
    let white = 0, n = 0, lo = 255, hi = 0;
    for (let i = 1; i <= 5; i++) for (let j = 1; j <= 5; j++) {
      gl.readPixels(Math.floor((cw * i) / 6), Math.floor((ch * j) / 6), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      n++;
      if (px[0] > 244 && px[1] > 244 && px[2] > 244) white++;
      lo = Math.min(lo, px[0], px[1], px[2]); hi = Math.max(hi, px[0], px[1], px[2]);
    }
    // broken picture: three quarters of the screen blown out to pure white (a few things, like
    // the car's shadow, can still draw), or - in a race - one flat colour everywhere
    const blank = this.mode === 'race' && hi - lo <= 10;
    if (white >= 19 || blank) w.white++; else w.white = 0;
    if (w.white >= 3) {
      w.kind = blank && white < 19 ? `flat colour ${lo}-${hi}` : `white ${white}/${n}`;
      // step down: High/Ultra -> Medium -> Low (direct drawing) -> Lite (plain shading)
      const q = this.gfx.qualityName;
      const next = TIER_DOWN[q];
      if (next) {
        D.log('white', `${w.kind} at ${q} in ${this.mode} -> ${next}`, true);
        this.profile.settings.liteLocked = true;
        this.applyQualityLive(next);
        this.watch = { frames: 0, white: 0 };
        const msg = `The picture was not drawing properly on this device, so graphics were switched to ${next[0].toUpperCase() + next.slice(1)}.`;
        if (this.mode === 'race' && this.race) this.race.hud?.toast(msg, 4);
        else this.ui.toast(msg);
      } else {
        w.done = true;
        this.problem('E-WHITE', 'The 3D picture isn\'t showing', 'This device is having trouble drawing the 3D graphics, even on the simplest setting. Try opening the game in the Chrome or Safari browser, or on another device.', `${w.kind} at lite in ${this.mode}`);
      }
    }
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.contextLost) return;
    try {
      if (this.mode === 'race' && this.race) {
        this.race.frame(dt);
      } else if (this.mode === 'menu') {
        this.stepPR(4);
        this.showroom.update(dt);
        this.showroom.processThumbs(12);
        this.gfx.render(dt, {});
      }
      if (this.mode === 'race' || this.mode === 'menu') {
        this.checkWhite(); this.perfCheck(dt);
        // a couple of seconds of normal frames: whatever was loading did not crash the page
        if (++this.goodFrames === 120) setMark(null);
      }
      this.badFrames = 0;
    } catch (e) {
      console.error(e);
      this.badFrames = (this.badFrames || 0) + 1;
      const msg = (e && e.message ? e.message : String(e)) + (e && e.stack ? ' @ ' + String(e.stack).split('\n').slice(1, 3).join(' ').trim() : '');
      if (this.badFrames === 1) D.log('frame-error', `${this.mode} ${this.gfx.qualityName}: ${msg}`, true);
      // the same failure on every frame means the game is stuck: stop the race and say so
      if (this.badFrames === 20 && !this._loopErr) {
        this._loopErr = true;
        if (this.mode === 'race' && this.race) {
          try { this.ui.pauseMenu(false); this.race.dispose(); } catch (e2) { /* ignore */ }
          this.race = null;
          try { this.enterMenu('home'); } catch (e2) { /* ignore */ }
          this.problem('E-LOOP', 'The game hit a problem', 'The race had to stop. You can try again from the menu.', msg);
        } else this.problem('E-LOOP', 'The game hit a problem', 'Something is not working properly. Reloading the game usually fixes it.', msg, [['Reload the game', () => location.reload()], ['OK', () => {}]]);
      }
    }
  }
}

// The display font loads after start-up so a slow or blocked font server can
// never hold the game on a blank screen (the system font is used meanwhile).
function loadFont() {
  try {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Titillium+Web:ital,wght@0,300;0,400;0,600;0,700;0,900;1,700;1,900&display=swap';
    (document.head || document.body).appendChild(l);
  } catch (e) { /* fonts are optional */ }
}

function boot() {
  loadFont();
  const msg = document.getElementById('boot-msg'), bar = document.getElementById('boot-bar');
  if (msg) msg.textContent = 'Starting the engines…';
  if (bar) bar.style.width = '96%';
  // let the loading screen paint before the heavy start-up work
  setTimeout(() => {
    try { new App(); } catch (e) {
      console.error(e);
      setMark(null);
      const shown = document.getElementById('boot-err')?.textContent;
      const where = e && e.stack ? ' @ ' + String(e.stack).split('\n').slice(1, 3).join(' ').trim() : '';
      if (!shown) window.__bootError?.((e && e.message ? e.message : String(e)) + where, 'E-BOOT');
    }
  }, 40);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
export { formatPrice };
