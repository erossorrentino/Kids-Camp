// Apex Velocity: app shell, main loop and game flow.
import { Graphics } from './gfx/renderer.js';
import { Showroom } from './game/showroom.js';
import { RaceScene } from './game/raceScene.js';
import { Input } from './game/input.js';
import { UI, toggleFullscreen } from './ui/menus.js';
import { audio } from './audio/audio.js';
import { loadProfile, saveProfile, resetProfile } from './core/save.js';
import { catalog, CAR_COUNT, formatPrice } from './data/cars.js';
import { effectiveStats } from './data/parts.js';
import { SERIES, seriesEvents, buildField, seriesUnlocked, PRIZE_SPLIT } from './data/events.js';
import { TRACKS, trackById } from './data/tracks.js';
import { hashString } from './core/rng.js';

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
    this.isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (this.isTouch) root.classList.add('is-touch');
    // stop pinch-zoom / double-tap zoom on phones
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
    try {
      this.gfx = new Graphics(this.view);
    } catch (e) {
      window.__bootError?.('This browser could not start 3D graphics (WebGL 2). Try the latest Chrome, Edge, Firefox or Safari, or turn on hardware acceleration.\n\n(' + (e && e.message ? e.message : e) + ')');
      throw e;
    }
    // if the GPU drops the 3D context (common on phones when memory is low), recover
    this.gfx.renderer.domElement.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); this.contextLost = true; this.ui?.toast('Graphics paused… restoring'); });
    this.gfx.renderer.domElement.addEventListener('webglcontextrestored', () => { this.contextLost = false; this.setQuality('low'); this.profile.settings.quality = 'low'; this.save(); this.enterMenu('home'); });
    this.setQuality(this.profile.settings.quality || this.autoQuality(), false);
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
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    window.__app = this;
    window.__appStarted = true;
    const boot = document.getElementById('boot');
    if (boot) { boot.style.transition = 'opacity .4s'; boot.style.opacity = '0'; setTimeout(() => boot.remove(), 450); }
    this.watch = { frames: 0, white: 0 };
  }

  autoQuality() {
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    if (touch && small) return 'low';
    if (touch) return 'medium';
    return 'high';
  }

  setQuality(q, rebuild = true) {
    this.gfx.setQuality(q);
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
  enterMenu(screen = 'home', params) {
    this.mode = 'menu';
    this.root.classList.remove('racing');
    this.gfx.buildComposer(this.showroom.scene, this.showroom.camera, 0.22);
    this.gfx.setGrade({ saturation: 1.05, contrast: 1.05, vignette: 0.45 });
    this.gfx.renderer.toneMappingExposure = 0.85;
    this.ui.setVisible(true);
    this.ui.show(screen, params);
    this.input.capture = false;
  }

  async startRace(opts, after) {
    if (this.isTouch) toggleFullscreen(true);
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
    try {
      await race.load((p, msg) => ld.set(p, msg));
    } catch (e) {
      console.error(e);
      ld.close();
      this.ui.toast('Something went wrong loading the race 😢');
      this.enterMenu('home');
      return;
    }
    ld.close();
    this.race = race;
    this.raceOpts = { opts, after };
    this.mode = 'race';
    this.watch = { frames: 0, white: 0 };
    this.input.capture = true;
    if (this.input.isTouchDevice() && !this.input.touchEl) this.input.buildTouchControls(this.overlay);
    if (this.input.touchEl) this.input.touchEl.style.display = '';
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
    if (this.input.touchEl) this.input.touchEl.style.display = 'none';
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
      restart: () => {
        const race = this.race;
        this.ui.pauseMenu(false);
        const { opts, after } = this.raceOpts;
        race.dispose(); this.race = null;
        this.startRace(opts, after);
      },
      camera: () => { this.race.hudCam(this.race.rcam.next()); },
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
    let white = 0, n = 0;
    for (let i = 1; i <= 5; i++) for (let j = 1; j <= 5; j++) {
      gl.readPixels(Math.floor((cw * i) / 6), Math.floor((ch * j) / 6), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      n++;
      if (px[0] > 245 && px[1] > 245 && px[2] > 245) white++;
    }
    if (white >= n - 2) w.white++; else w.white = 0;
    if (w.white >= 3) {
      w.done = true;
      if (this.gfx.qualityName !== 'low') {
        this.profile.settings.quality = 'low';
        this.save();
        this.setQuality('low');
        if (this.race) { this.gfx.buildComposer(this.race.scene, this.race.camera, 0); }
        this.ui.toast('The picture was too bright on this device, so graphics were switched to Low. You can change this in Settings.');
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
      if (this.mode === 'race' || this.mode === 'menu') this.checkWhite();
    } catch (e) {
      console.error(e);
      if (!this._loopErr) { this._loopErr = true; this.ui?.toast('Something went wrong: ' + (e && e.message ? e.message : e)); }
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
      const shown = document.getElementById('boot-err')?.textContent;
      if (!shown) window.__bootError?.(e && e.message ? e.message : e);
    }
  }, 40);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
export { formatPrice };
