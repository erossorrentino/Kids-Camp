// Fairway Legends: app controller. Wires the 3D world, the HUD, the menus,
// the career and tournaments together.
import * as THREE from '../vendor/three.module.min.js';
import { World } from './render/world.js';
import { HUD } from './ui/hud.js';
import { Screens } from './ui/screens.js';
import { SwingInput } from './ui/swing.js';
import { modal, toast, esc, fmtToPar, money } from './ui/dom.js';
import { eventIntro, roundSummary, eventResults, scorecardModal, boardModal, scorecardHtml, bestShotCard } from './ui/eventScreens.js';
import { ReplayDirector } from './game/replay.js';
import { PRIZE_CARS, CAR_COLORS } from './render/prizes.js';
import { sponsorOffers, sponsorLook, BRAND_BY_ID } from './game/sponsors.js';
import { RoundController } from './game/round.js';
import * as career from './game/career.js';
import * as tourn from './game/tournament.js';
import { loadCareer, saveCareer, deleteCareer, loadSettings, saveSettings, initCloud, hasCloud, flushSaves, onSaveStatus, saveStatus, setRemoteHandler, loadRecords, saveRecords } from './game/storage.js';
import { MiniGame, MINI_PRIZES, betterScore, GAMES } from './game/minigames.js';
import { miniMenu, miniResults, partySetup, partyResults, partyCardModal, PARTY_TIERS } from './ui/modeScreens.js';
import { Party, PARTY_COLORS } from './game/party.js';
import { YD } from './sim/hole.js';
import { dailyChallenge, dayKey, loadDaily, saveDaily, recordDaily, liveStreak, dailyReward, beatsTarget } from './game/daily.js';
import { dailyScreen, cupScreen, cupResults } from './ui/modeScreens.js';
import { cupTeams, cupCourse, simMatch, matchText, opponentScores, CUP_HOLES, CUP_PRIZE } from './game/cup.js';
import { initAudio, setSound, sfx, setAmbience, startMusic, stopMusic } from './audio.js';
import { quiet } from './game/commentary.js';
import { applyWeather, rollWeather } from './game/weather.js';
import { proById, generatePros } from './data/players.js';
import { generateCourses, courseById } from './data/courses.js';
import { HoleModel } from './sim/hole.js';
import { RNG, mixSeed } from './util/rng.js';
import { traitEffects } from './data/traits.js';
import { BALL_BY_ID } from './data/equipment.js';
import { MODEL_BY_ID, normBag } from './data/clubsets.js';
import { scoringBonuses } from './data/tour.js';
import { CHAR_BY_ID, playAs, marketItem } from './data/characters.js';

const $ = (id) => document.getElementById(id);

const app = {
  settings: loadSettings(),
  records: loadRecords(),
  miniOpts: null,
  pickFor: 'quick',
  career: null,
  round: null,
  aimHold: 0,
  quickOpts: null,
  playersOpts: { q: '', sort: 'rank', limit: 120 },
  coursesOpts: { q: '', style: '' },
  fromHub: false,
  cloudSave: false,
  nameOf(id, short = false) {
    if (id === tourn.HUMAN_ID) return app.career ? app.career.golfer.name : 'You';
    const p = proById(id);
    if (!p) return id;
    return short ? `${p.first[0]}. ${p.last}` : p.name;
  },
};
window.__app = app;

// ---------------- phone layout ----------------
// Phones (in either orientation) get a compact HUD; the class is on <html>
function applyLayout() {
  const w = window.innerWidth, h = window.innerHeight;
  const root = document.documentElement;
  root.classList.toggle('compact', Math.min(w, h) < 540 || w < 700);
  root.classList.toggle('portrait', h > w);
}

// ---------------- problems ----------------
// Anything that goes wrong shows a card with a way out instead of leaving a
// frozen or blank screen. Progress is saved first.
let errShown = false;
app.reportError = (err) => {
  console.error(err);
  if (errShown) return;
  errShown = true;
  if (app.career) saveCareer(app.career, { now: true });
  const msg = String((err && (err.message || err)) || 'Unknown error').slice(0, 200);
  const m = modal(`<h3>Something went wrong</h3><p>The game hit a problem${app.round ? ' during your round' : ''}. ${app.career ? 'Your career is saved up to your last shot.' : ''}</p><p class="muted small">${esc(msg)}</p>
    <div class="actions"><button class="btn primary" data-reload>Reload the game</button><button class="btn" data-lowq>Reload with low graphics</button><button class="btn" data-close>Keep going</button></div>`, { onClose: () => { setTimeout(() => { errShown = false; }, 15000); } });
  m.el.querySelector('[data-reload]').addEventListener('click', () => reloadGame(false));
  m.el.querySelector('[data-lowq]').addEventListener('click', () => reloadGame(true));
};

function reloadGame(lowGraphics) {
  if (lowGraphics) { app.settings.quality = 'low'; saveSettings(app.settings); }
  if (app.career) saveCareer(app.career, { now: true });
  setTimeout(() => location.reload(), 400);
}

window.addEventListener('error', (e) => {
  const msg = String(e.message || '');
  // Only the game's own code: ignore resize-observer noise and scripts the
  // host page adds
  if (!e.error || /ResizeObserver|Script error/i.test(msg)) return;
  const where = `${e.filename || ''} ${e.error.stack || ''}`;
  if (!/\/src\/|three\.module/.test(where)) return;
  app.reportError(e.error);
});

// The device can take the 3D graphics away (low memory, switching apps).
// Show what is happening, and offer a lighter reload if it doesn't recover.
let gfxTimer = 0;
function gfxNotice(on) {
  let el = document.getElementById('gfxNotice');
  clearTimeout(gfxTimer);
  if (!on) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'gfxNotice';
    el.className = 'gfx-notice';
    el.innerHTML = '<div class="spinner"></div><b>Reloading the 3D view…</b><span>Your device paused the graphics. Your progress is saved.</span><button class="btn primary" hidden>Reload with low graphics</button>';
    el.querySelector('button').addEventListener('click', () => reloadGame(true));
    document.body.appendChild(el);
  }
  if (app.career) saveCareer(app.career, { now: true });
  gfxTimer = setTimeout(() => { const b = el.querySelector('button'); if (b) b.hidden = false; }, 4000);
}

// Save when the page is hidden or closed (switching apps on a phone)
function saveNow() {
  if (app.career) saveCareer(app.career, { now: true });
  flushSaves();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
window.addEventListener('pagehide', saveNow);

app.saveText = () => {
  const st = saveStatus();
  if (st.cloud) return '✓ Progress saved to your account';
  if (hasCloud()) return st.local ? '✓ Progress saved on this device · syncing to your account' : 'Saving to your account…';
  return st.local ? '✓ Progress saved on this device' : '⚠ This browser is blocking saves';
};

// A saved career turned up in the account after the game had already
// started without it (slow connection): let the player pick
setRemoteHandler((remote) => new Promise((resolve) => {
  const cur = app.career;
  const adopt = () => {
    app.career = career.upgradeSave(remote);
    saveCareer(app.career);
    if (!app.round) { if (document.querySelector('.title-screen')) showTitle(); else if (app.fromHub) goHub(); }
    toast(`Loaded ${remote.golfer.name}'s saved career`);
    resolve();
  };
  if (!cur) { adopt(); return; }
  if (cur.created === remote.created) {
    if ((remote.savedAt || 0) > (cur.savedAt || 0) && !app.round) adopt(); else resolve();
    return;
  }
  const info = (c) => `${esc(c.golfer.name)} · ${c.year} week ${c.week}`;
  const m = modal(`<h3>We found your saved career</h3><p>Your account has <b>${info(remote)}</b> saved, but this device is playing <b>${info(cur)}</b>. Which one do you want to keep?</p>
    <div class="actions"><button class="btn primary" data-saved>Load ${esc(remote.golfer.name)}</button><button class="btn" data-keep>Keep ${esc(cur.golfer.name)}</button></div>`, { onClose: () => resolve() });
  m.el.querySelector('[data-saved]').addEventListener('click', () => {
    if (app.round) { endRound(); }
    m.close();
    adopt();
  });
  m.el.querySelector('[data-keep]').addEventListener('click', () => m.close());
}));

// ---------------- boot ----------------
function boot() {
  applyLayout();
  window.addEventListener('resize', applyLayout);
  window.addEventListener('orientationchange', () => setTimeout(applyLayout, 250));
  app.world = new World($('view'), app.settings);
  app.world.onContextLost = () => gfxNotice(true);
  app.world.onContextRestored = () => gfxNotice(false);
  app.hud = new HUD($('hud'), app);
  app.hud.root.hidden = true;
  app.screens = new Screens($('screens'), app);
  app.swing = new SwingInput($('view'), app);
  setSound(app.settings.sound);
  document.addEventListener('pointerdown', () => initAudio(), { once: false });
  setupKeys();
  startMenuScene();
  app.loadingSave = true;
  app.screens.title(false, '', true);
  requestAnimationFrame(loop);
  loadCareer().then((c) => {
    app.cloudSave = hasCloud();
    app.loadingSave = false;
    if (c) app.career = career.upgradeSave(c);
    if (!app.round && document.querySelector('.title-screen')) showTitle();
    document.title = 'Fairway Legends';
    document.body.dataset.ready = '1';
  });
  initCloud().then(() => { app.cloudSave = hasCloud(); });
  onSaveStatus(() => {
    const el = document.getElementById('saveLine');
    if (el) el.textContent = app.saveText();
  });
}

const NICKS = ['The Rocket', 'Birdie Machine', 'Ice Cold', 'The Wizard', 'Big Hitter', 'Captain Putt', 'The Shark', 'Lucky', 'Thunder', 'The Professor', 'Laser', 'Smooth'];
function nicknameModal() {
  const c = app.career;
  if (!c) return;
  const m = modal(`<h3>Your nickname</h3><p class="muted">The crowd and the commentators will use it.</p>
    <input id="nickIn" maxlength="18" value="${esc(c.golfer.nickname || '')}" placeholder="The Rocket" style="width:100%">
    <div class="chips" style="margin-top:10px">${NICKS.map((n) => `<button class="chipbtn" data-nick="${esc(n)}">${esc(n)}</button>`).join('')}</div>
    <div class="actions"><button class="btn primary" data-save>Save</button><button class="btn" data-clear>No nickname</button></div>`);
  const inp = m.el.querySelector('#nickIn');
  m.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-nick]');
    if (b) inp.value = b.dataset.nick;
    if (e.target.closest('[data-save]') || e.target.closest('[data-clear]')) {
      const v = e.target.closest('[data-clear]') ? '' : inp.value.trim().slice(0, 18);
      if (v) c.golfer.nickname = v; else delete c.golfer.nickname;
      saveCareer(c);
      m.close();
      app.screens.hub(c, app.screens.tab || 'golfer');
    }
  });
}

function careerInfo() {
  const c = app.career;
  if (!c) return '';
  return `${c.golfer.name}${c.golfer.nickname ? ` “${c.golfer.nickname}”` : ''} · World #${career.rankOf(c)} · ${c.year} week ${c.week}`;
}

function showTitle() {
  app.fromHub = false;
  app.screens.title(!!app.career, careerInfo());
}

// A slowly orbiting camera around a signature green behind the menus
function startMenuScene() {
  const courses = generateCourses();
  const pick = courses[Math.floor(Math.random() * courses.length)];
  const hole = new HoleModel(pick, pick.signature - 1);
  app.menuHole = hole;
  // the view behind the menus changes: mostly afternoon, sometimes sunset or night
  const r = Math.random();
  const menuCond = { timeOfDay: r < 0.18 ? 0.93 : 0.62, night: r > 0.86, weather: pick.style === 'Links' && Math.random() < 0.5 ? 'cloudy' : 'sunny', windMph: 5 };
  app.world.setConditions(menuCond, hole.style, hole.teeHeading);
  setAmbience({ rain: 0, night: menuCond.night });
  app.world.loadHole(hole, { crowd: false });
  app.world.aim.setVisible(false);
  app.world.ball.setVisible(false);
  app.world.hidePlayers();
  app.menuT = 0;
  menuCamera(0, true);
}

function menuCamera(dt, snap = false) {
  const h = app.menuHole;
  if (!h) return;
  app.menuT += dt * 0.05;
  const a = app.menuT + h.finalHeading + Math.PI * 0.8;
  const p = h.pin;
  const r = 70;
  app.world.setCamera(new THREE.Vector3(p.x + Math.sin(a) * r, p.y + 24, p.z - Math.cos(a) * r), new THREE.Vector3(p.x, p.y + 2, p.z), 48, 2);
  app.world.focus.set(p.x, p.y, p.z);
  if (snap) app.world.snapCamera();
}

let last = performance.now();
function loop(now) {
  // timeScale exists so automated playtests can fast-forward; it is 1 in play
  const real = Math.max(0, (now - last) / 1000);
  const dt = Math.min(0.05, real) * (app.timeScale || 1);
  last = now;
  requestAnimationFrame(loop);
  try {
    if (app.round) {
      if (app.aimHold) app.round.nudgeAim(app.aimHold * dt * (app.round.putting ? 0.12 : 0.35));
      app.round.fast = !!app.fastHold;
      app.round.update(dt);
    } else if (app.replay) {
      app.replay.update(dt);
    } else {
      menuCamera(dt);
    }
    // music on the menus only
    if (!app.round && !app.replay && app.settings.music && app.settings.sound) startMusic();
    else stopMusic();
    app.world.perf.active = !!app.round;
    app.world.frame(dt, real);
  } catch (e) {
    app.reportError(e);
  }
}

// ---------------- keys ----------------
function setupKeys() {
  const down = new Set();
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    const r = app.round;
    if (!r) return;
    if (document.querySelector('.modal-wrap')) return;
    const k = e.key.toLowerCase();
    if (down.has(k) && !['arrowleft', 'arrowright', 'a', 'd'].includes(k)) return;
    down.add(k);
    if (k === 'arrowleft' || k === 'a') { app.aimHold = -1; e.preventDefault(); }
    else if (k === 'arrowright' || k === 'd') { app.aimHold = 1; e.preventDefault(); }
    else if (k === 'arrowup' || k === 'w') { r.cycleClub(1); e.preventDefault(); }
    else if (k === 'arrowdown' || k === 's') { r.cycleClub(-1); e.preventDefault(); }
    else if (k === ' ') { app.fastHold = true; if (r.phase === 'intro') r.skipIntro(); e.preventDefault(); }
    else if (k === 'v') r.toggleView();
    else if (k === 'g') r.toggleGrid();
    else if (k === 'r' && r.putting) r.cyclePuttScale(1);
    else if (k === 'c') app.onHudAction('card');
    else if (k === 'l') app.onHudAction('board');
    else if (k === 'escape') app.onHudAction('pause');
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    down.delete(k);
    if (['arrowleft', 'arrowright', 'a', 'd'].includes(k)) app.aimHold = 0;
    if (k === ' ') app.fastHold = false;
  });
  $('view').addEventListener('wheel', (e) => {
    if (!app.round || app.swing.state) return;
    e.preventDefault();
    app.round.cycleClub(e.deltaY > 0 ? -1 : 1);
  }, { passive: false });
  // Hold anywhere during flight to fast-forward (touch)
  $('view').addEventListener('pointerdown', () => { if (app.round && app.round.phase === 'flight') app.fastHold = true; });
  $('view').addEventListener('pointerup', () => { if (app.round && app.round.phase === 'flight') app.fastHold = false; });
}

// ---------------- HUD actions ----------------
app.onHudAction = (a, d = {}) => {
  const r = app.round;
  if (!r) return;
  sfx.click();
  switch (a) {
    case 'clubUp': r.cycleClub(1); break;
    case 'clubDown': r.cycleClub(-1); break;
    case 'view': r.toggleView(); break;
    case 'grid': r.toggleGrid(); break;
    case 'scale': r.cyclePuttScale(1); break;
    case 'shape': app.hud.toggleShape(); break;
    case 'shapeReset': r.setShape({ x: 0, y: 0 }); break;
    case 'card': if (r.party) partyCardModal(r.course, r.party); else scorecardModal(r.course, r.scores, r.holeStats); break;
    case 'board': if (r.opts.tournament) boardModal(r.opts.tournament, app.nameOf); else if (r.mode) modeBoardModal(r.mode); else if (r.party) partyCardModal(r.course, r.party); break;
    case 'sim': confirmSim(); break;
    case 'pause': pauseMenu(); break;
    case 'modeTarget': if (r.mode && r.mode.pickTarget) r.mode.pickTarget(r, parseInt(d.i, 10)); break;
    case 'modeQuit': quitRound(); break;
    default: break;
  }
};

function confirmSim() {
  const r = app.round;
  if (!r || !['aim', 'intro'].includes(r.phase)) return;
  const m = modal(`<h3>Simulate hole ${r.holeIndex + 1}?</h3><p>The hole is scored using your golfer's skills and traits instead of playing it shot by shot.${r.strokes ? ' Shots already taken still count.' : ''}</p><div class="actions"><button class="btn primary" data-go>Simulate</button><button class="btn" data-close>Keep playing</button></div>`);
  m.el.querySelector('[data-go]').addEventListener('click', () => { m.close(); r.simCurrentHole(); });
}

function pauseMenu() {
  const r = app.round;
  const t = r.opts.tournament;
  const m = modal(`
    <h3>Paused</h3>
    <div class="menu pause">
      <button class="mbtn" data-p="resume"><span>Resume</span></button>
      <button class="mbtn" data-p="card"><span>Scorecard</span></button>
      ${t ? '<button class="mbtn" data-p="board"><span>Leaderboard</span></button>' : ''}
      <button class="mbtn" data-p="howto"><span>How to play</span></button>
      <label class="set"><span>Sound</span><input type="checkbox" data-p="sound" ${app.settings.sound ? 'checked' : ''}></label>
      <button class="mbtn ghost" data-p="quit"><span>${t ? 'Save & exit to hub' : 'Quit round'}</span><small>${t ? 'Saved after every shot: you carry on from exactly where you stopped' : ''}</small></button>
    </div>`);
  m.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    const p = b.dataset.p;
    if (p === 'sound') { app.settings.sound = b.checked; setSound(b.checked); saveSettings(app.settings); return; }
    m.close();
    if (p === 'card') { if (r.party) partyCardModal(r.course, r.party); else scorecardModal(r.course, r.scores, r.holeStats); }
    else if (p === 'board') boardModal(t, app.nameOf);
    else if (p === 'howto') app.screens.howto();
    else if (p === 'quit') quitRound();
  });
}

function endRound() {
  setAmbience({ rain: 0, night: false });
  quiet();
  if (app.round) app.round.destroy();
  app.round = null;
  app.hud.detach();
  app.aimHold = 0;
  app.world.hidePlayers();
  app.world.ball.setVisible(false);
  startMenuScene();
}

function quitRound() {
  const r = app.round;
  const t = r && r.opts.tournament;
  const mode = r && r.mode;
  endRound();
  if (t) { saveCareer(app.career, { now: true }); goHub(); }
  else if (mode && mode.kind === 'range') miniDone(mode);
  else if (mode) openMini({});
  else if (r && r.party) openParty({});
  else showTitle();
}

// ---------------- screen actions ----------------
app.onAction = (a, d, elx) => {
  initAudio();
  const c = app.career;
  switch (a) {
    case 'title': showTitle(); break;
    case 'back': app.fromHub && c ? goHub() : showTitle(); break;
    case 'continue': goHub(); break;
    case 'newCareer':
      if (app.loadingSave) { toast('Still loading your saved career…'); break; }
      if (c) {
        const m = modal(`<h3>Start a new career?</h3><p>This replaces ${esc(c.golfer.name)}'s career (world #${career.rankOf(c)}). This can't be undone.</p><div class="actions"><button class="btn danger" data-go>Replace career</button><button class="btn" data-close>Keep it</button></div>`);
        m.el.querySelector('[data-go]').addEventListener('click', () => { m.close(); newCareerDraft(); });
      } else newCareerDraft();
      break;
    case 'look': app.draft.look[d.field] = d.v; app.screens.newCareer(app.draft); break;
    case 'createCareer': createCareer(); break;
    case 'tab': app.screens.hub(c, d.t); break;
    case 'hub': goHub(); break;
    case 'enter': enterEvent(d.id); break;
    case 'resumeEvent': eventIntro(app.screens, app, c, c.active.t); break;
    case 'viewBoard': boardModal(c.active.t, app.nameOf); break;
    case 'skipWeek': {
      const m = modal(`<h3>Skip week ${c.week}?</h3><p>The tour plays on without you. Your ranking points keep decaying.</p><div class="actions"><button class="btn primary" data-go>Skip week</button><button class="btn" data-close>Cancel</button></div>`);
      m.el.querySelector('[data-go]').addEventListener('click', () => {
        m.close();
        const s = career.skipWeek(c);
        saveCareer(c);
        toast(`Week ${s.week} done. World rank #${s.rankAfter}.`);
        if (s.seasonEnd) toast(`Season ${s.seasonEnd.year} is over. Welcome to ${c.year}!`, 4000);
        goHub();
      });
      break;
    }
    case 'playRound': startTournamentRound(); break;
    case 'simRound': simTournamentRound(); break;
    case 'nextRound': nextTournamentRound(); break;
    case 'finishEvent': finishEvent(); break;
    case 'buyBall': {
      const b = BALL_BY_ID[d.id];
      if (c.golfer.money >= b.price && !c.golfer.balls.includes(b.id)) {
        c.golfer.money -= b.price;
        c.golfer.balls.push(b.id);
        c.golfer.ball = b.id;
        saveCareer(c);
        toast(`${b.name} is in your bag`);
      }
      app.screens.hub(c, 'shop');
      break;
    }
    case 'useBall': c.golfer.ball = d.id; saveCareer(c); app.screens.hub(c, 'shop'); break;
    case 'shopTab': if (d.t === 'chars') { app.screens.hub(c, 'players'); break; } app.screens.shopTab = d.t; app.screens.hub(c, 'shop'); break;
    case 'buyClub': {
      const m = MODEL_BY_ID[d.id];
      if (m && c.golfer.money >= m.price && !c.golfer.clubs.includes(m.id)) {
        c.golfer.money -= m.price;
        c.golfer.clubs.push(m.id);
        c.golfer.bag = { ...normBag(c.golfer.bag), [m.cat]: m.id };
        saveCareer(c);
        sfx.click();
        toast(`${m.brand} ${m.name} is in your bag`);
      }
      app.screens.hub(c, 'shop');
      break;
    }
    case 'buyChar': {
      const it = marketItem(d.id);
      const g = c.golfer;
      if (it && g.money >= it.price && !g.chars.includes(it.id)) {
        g.money -= it.price;
        g.chars.push(it.id);
        g.char = it.id;
        saveCareer(c, { now: true });
        sfx.applause(0.6);
        toast(`${it.name} joined your team! You're playing as ${it.name.split(' ')[0]}.`);
      }
      document.querySelectorAll('.modal-wrap').forEach((m) => m.remove());
      app.screens.hub(c, 'players');
      break;
    }
    case 'useChar': {
      const g = c.golfer;
      if (!d.id) { g.char = null; toast('Playing as yourself'); }
      else if (g.chars.includes(d.id)) { g.char = d.id; toast(`Playing as ${marketItem(d.id).name}`); }
      saveCareer(c);
      document.querySelectorAll('.modal-wrap').forEach((m) => m.remove());
      app.screens.hub(c, app.screens.tab || 'players');
      break;
    }
    case 'charInfo': if (CHAR_BY_ID[d.id]) app.screens.charCard(c, d.id); else app.screens.proCard(d.id); break;
    case 'playersView': app.screens.playersView = d.t; app.screens.buyOpts.limit = 24; app.screens.hub(c, 'players'); break;
    case 'moreBuy': app.screens.buyOpts.limit += 24; app.screens.hub(c, 'players'); break;
    case 'useClub': {
      const m = MODEL_BY_ID[d.id];
      if (m) { c.golfer.bag = { ...normBag(c.golfer.bag), [m.cat]: m.id }; saveCareer(c); toast(`Switched to ${m.brand} ${m.name}`); }
      app.screens.hub(c, 'shop');
      break;
    }
    case 'players': app.fromHub = false; app.playersOpts = { q: '', sort: 'rank', limit: 120 }; app.screens.players(app.playersOpts); break;
    case 'morePlayers': app.playersOpts.limit += 150; app.screens.players(app.playersOpts); break;
    case 'pro': app.screens.proCard(d.id); break;
    case 'pickPro':
      if (app.pickFor === 'mini') { app.miniOpts.proId = d.id; openMini({}); break; }
      app.quickOpts.proId = d.id; app.quickOpts.ball = proById(d.id).ball; app.screens.quick(app.quickOpts); break;
    case 'playAsPro': {
      document.querySelectorAll('.modal-wrap').forEach((m) => m.remove());
      openQuick({ proId: d.id });
      break;
    }
    case 'courses': app.coursesOpts = { q: '', style: '' }; app.screens.courses(app.coursesOpts); break;
    case 'courseStyle': app.coursesOpts.style = d.s; app.screens.courses(app.coursesOpts); break;
    case 'course': app.screens.courseCard(d.id); break;
    case 'pickCourse':
      if (app.pickFor === 'mini') { app.miniOpts.courseId = d.id; openMini({}); break; }
      if (app.pickFor === 'party') { app.partyOpts.courseId = d.id; openParty({}); break; }
      app.quickOpts.courseId = d.id; app.screens.quick(app.quickOpts); break;
    case 'pickBack': if (app.pickFor === 'mini') openMini({}); else if (app.pickFor === 'party') openParty({}); else app.onAction('quick'); break;
    case 'minigames': openMini({}); break;
    case 'miniPickCourse': app.pickFor = 'mini'; app.screens.courses({ ...app.coursesOpts, pick: true }); break;
    case 'miniPickPro': app.pickFor = 'mini'; app.screens.players({ ...app.playersOpts, pick: true }); break;
    case 'miniUseMine': app.miniOpts.proId = null; openMini({}); break;
    case 'miniSky': app.miniOpts.sky = d.s; openMini({}); break;
    case 'playMini': startMini(d.g); break;
    case 'daily': openDaily(); break;
    case 'cup': openCup(); break;
    case 'cupPlay': playCup(false); break;
    case 'cupSim': playCup(true); break;
    case 'playDaily': { const ch = dailyChallenge(dayKey()); startMini(ch.kind, ch); break; }
    case 'watchBest': if (app.lastBestShot) watchReplay(app.lastBestShot); break;
    case 'nickname': nicknameModal(); break;
    case 'signSponsor': {
      const off = sponsorOffers(c, career.rankOf(c)).find((o) => o.key === d.k);
      if (off) {
        c.sponsors[off.slot] = off;
        if (!c.achievements.sponsor) c.achievements.sponsor = { year: c.year, week: c.week };
        saveCareer(c);
        sfx.applause(0.6);
        toast(`You signed with ${BRAND_BY_ID[off.brand].name}! Their name is on your ${off.slot === 'hat' ? 'cap and shirt' : 'bag'}.`, 3600);
      }
      app.screens.hub(c, 'sponsors');
      break;
    }
    case 'party': openParty({}); break;
    case 'partyPickCourse': app.pickFor = 'party'; app.screens.courses({ ...app.coursesOpts, pick: true }); break;
    case 'partyAdd': if (app.partyOpts.players.length < 4) { const n = app.partyOpts.players.length; app.partyOpts.players.push({ name: `Player ${n + 1}`, who: 'club' }); } openParty({}); break;
    case 'partyRemove': app.partyOpts.players.splice(parseInt(d.i, 10), 1); if (app.partyOpts.players.length !== 2 && app.partyOpts.format === 'match') app.partyOpts.format = 'stroke'; openParty({}); break;
    case 'partyFormat': app.partyOpts.format = d.f; openParty({}); break;
    case 'startParty': startParty(); break;
    case 'playCourse': document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()); openQuick({ courseId: d.id }); break;
    case 'quick': app.pickFor = 'quick'; app.quickOpts ? app.screens.quick(app.quickOpts) : openQuick({}); break;
    case 'pickCourseList': app.pickFor = 'quick'; app.screens.courses({ ...app.coursesOpts, pick: true }); break;
    case 'pickProList': app.pickFor = 'quick'; app.screens.players({ ...app.playersOpts, pick: true }); break;
    case 'useMyGolfer': app.quickOpts.proId = null; app.quickOpts.ball = c ? c.golfer.ball : 'tourbal'; app.screens.quick(app.quickOpts); break;
    case 'startQuick': startQuick(); break;
    case 'howto': app.screens.howto(); break;
    case 'settings': app.screens.settings(app.settings, !!c); break;
    case 'resetCareer': {
      const m = modal(`<h3>Delete your career?</h3><p>${esc(c.golfer.name)} and all results will be erased. This can't be undone.</p><div class="actions"><button class="btn danger" data-go>Delete career</button><button class="btn" data-close>Cancel</button></div>`);
      m.el.querySelector('[data-go]').addEventListener('click', () => { m.close(); deleteCareer(); app.career = null; showTitle(); toast('Career deleted'); });
      break;
    }
    default: break;
  }
};

app.onFilter = (k, v) => {
  if (k === 'players') { app.playersOpts.q = v; app.playersOpts.limit = 120; rerenderList('players'); }
  else if (k === 'playersSort') { app.playersOpts.sort = v; rerenderList('players'); }
  else if (k === 'courses') { app.coursesOpts.q = v; rerenderList('courses'); }
  else if (k === 'rank') { app.screens.rankFilter = v; rerenderList('rank'); }
  else if (k === 'buy') { app.screens.buyOpts.q = v; app.screens.buyOpts.limit = 24; rerenderList('buy'); }
  else if (k === 'buySort') { app.screens.buyOpts.sort = v; rerenderList('buy'); }
  else if (k === 'buyAfford') { app.screens.buyOpts.afford = v === 'yes'; app.screens.buyOpts.limit = 24; rerenderList('buy'); }
};

// Re-render a list screen while keeping focus in its search box
function rerenderList(kind) {
  const active = document.activeElement;
  const pos = active && active.selectionStart;
  const pick = !!document.querySelector('[data-a="pickPro"], [data-a="pickCourse"]');
  if (kind === 'players') app.screens.players({ ...app.playersOpts, pick });
  else if (kind === 'courses') app.screens.courses({ ...app.coursesOpts, pick });
  else if (kind === 'rank') app.screens.hub(app.career, 'rankings');
  else if (kind === 'buy') app.screens.hub(app.career, 'players');
  const inp = document.querySelector(`[data-filter="${kind === 'rank' ? 'rank' : kind}"]`);
  if (inp && active && active.dataset && active.dataset.filter) {
    inp.focus();
    try { inp.setSelectionRange(pos, pos); } catch (e) { /* select elements */ }
  }
}

app.onSetting = (k, v) => {
  const s = app.settings;
  if (k === 'rounds' || k === 'swingSens') s[k] = parseFloat(v);
  else s[k] = v;
  if (k === 'sound') setSound(v);
  saveSettings(s);
  toast('Saved');
};

app.onField = (k, v) => {
  if (k.startsWith('q.')) { app.quickOpts[k.slice(2)] = v; return; }
  if (k.startsWith('party.')) {
    const [, key, idx] = k.split('.');
    if (key === 'name') app.partyOpts.players[+idx].name = v;
    else if (key === 'who') { app.partyOpts.players[+idx].who = v; openParty({}); }
    else app.partyOpts[key] = v;
    return;
  }
  if (app.draft) {
    if (k === 'name') app.draft.name = v;
    else if (k === 'nickname') app.draft.nickname = v;
    else if (k === 'country') app.draft.country = v;
    else if (k === 'gender') app.draft.gender = v;
    else if (k.startsWith('look.')) {
      const key = k.slice(5);
      app.draft.look[key] = v;
      if (key === 'hairStyle') app.draft.gender = ['ponytail', 'long', 'bun'].includes(v) ? 'f' : 'm';
      // the pattern colour row only shows for patterned shirts, so redraw
      if (key === 'pattern' || key === 'shorts') app.screens.newCareer(app.draft);
      else app.screens.refreshDraftPreview(app.draft);
    }
  }
};

// ---------------- career ----------------
function newCareerDraft() {
  app.draft = {
    name: '', country: 'USA', gender: 'm',
    look: { shirt: '#1d3557', pants: '#e9e4d8', cap: '#f1faee', skin: '#e8b996', hair: '#3b2a1f', hat: 'cap', hairStyle: 'short', beard: 'none', pattern: 'solid', accent: '#f1faee', vest: '', shorts: '', shades: '' },
  };
  app.screens.newCareer(app.draft);
}

function createCareer() {
  const d = app.draft;
  const name = (document.getElementById('f-name')?.value || d.name).trim();
  if (!name) { toast('Give your golfer a name'); document.getElementById('f-name')?.focus(); return; }
  // everyone starts with the same skills and no traits
  const c = career.newCareer({ name, country: d.country, gender: d.gender, look: d.look });
  const nick = (document.getElementById('f-nick')?.value || d.nickname || '').trim();
  if (nick) c.golfer.nickname = nick.slice(0, 18);
  app.career = c;
  saveCareer(c);
  app.draft = null;
  goHub();
  setTimeout(() => {
    modal(`<h3>Welcome to the tour, ${esc(name)}</h3><p>You're ranked <b>#501</b> in the world. The Challenger Tour is open to you every week; win there (or climb into the top 125) to earn World Tour starts. You also have <b>two sponsor invitations</b> to try a World Tour event early.</p><p>Your skills are fixed. To get better, win prize money and <b>buy better players</b> in the <b>Players</b> tab: you have enough for your first one already.</p><p>Tip: open <b>How to play</b> from the menu for the swing, putting and aiming controls.</p><div class="actions"><button class="btn primary" data-close>Let's go</button></div>`);
  }, 200);
}

function goHub() {
  if (!app.career) { showTitle(); return; }
  app.fromHub = true;
  app.screens.hub(app.career, app.screens.tab || 'week');
  // one-time note for careers started when skills could be trained
  const r = app.career.skillsReset;
  if (r) {
    delete app.career.skillsReset;
    saveCareer(app.career);
    modal(`<h3>Skills are now fixed</h3><p>Every golfer now starts with the same skills and no strengths or weaknesses. The only way to get better is to <b>buy a better player</b> in the <b>Players</b> tab.</p>${r.refund ? `<p>Your ${r.points} skill point${r.points === 1 ? '' : 's'} ${r.points === 1 ? 'was' : 'were'} paid back as <b>${esc(money(r.refund))}</b> to spend on players.</p>` : ''}<div class="actions"><button class="btn primary" data-a="tab" data-t="players" data-close>See the players</button><button class="btn" data-close>OK</button></div>`);
  }
}

function enterEvent(id) {
  const c = app.career;
  const ev = career.thisWeek(c).events.find((e) => e.id === id);
  if (!ev) return;
  try {
    const t = career.startEvent(c, ev, app.settings.rounds);
    tourn.simAIRound(t, 0);
    c.active.hs = { birdies: 0, eagles: 0, aces: 0, albatross: 0, holesPlayed: 0, bogeyFree: false, bestRound: null };
    saveCareer(c);
    eventIntro(app.screens, app, c, t);
  } catch (e) {
    toast(e.message);
  }
}

function roundCond(t) {
  const c = t.cond[t.round];
  return { ...c, seed: mixSeed(t.seed, 'r', t.round) };
}

function startTournamentRound() {
  const c = app.career;
  const t = c.active.t;
  const course = courseById(t.courseId);
  const hp = tourn.humanPlayer(t);
  const done = (hp.scores[t.round] || []).filter((v) => v != null).length;
  const holeStats = [];
  app.screens.hide();
  const g = playAs(c.golfer); // you, as your active character
  const round = new RoundController(app, {
    course,
    holeList: [...Array(18).keys()],
    startPos: done,
    scores: hp.scores[t.round] || [],
    golfer: { name: g.name, stats: g.stats, traits: g.traits, ball: g.ball, bag: g.bag, look: { ...g.look, ...sponsorLook(c) }, gender: g.gender },
    cond: roundCond(t),
    tournament: t,
    crowd: true,
    // carry on mid-hole if the game was closed between shots
    resume: c.active.shot && c.active.shot.round === t.round ? c.active.shot : null,
    onShotState: (st) => { c.active.shot = { ...st, round: t.round }; saveCareer(c); },
    leaderboardFn: () => tourn.leaderboard(t),
    simHole: (i) => tourn.simHumanHole(t, g, i),
    onHoleDone: (i, strokes, hs) => {
      c.active.shot = null;
      tourn.recordHumanHole(t, i, strokes, hs.simmed);
      holeStats[i] = hs;
      trackHole(c, course.holes[i].par, strokes, hs);
      saveCareer(c);
      // tell them what a good hole just earned
      if (!hs.simmed) {
        const rel = strokes - course.holes[i].par;
        const b = scoringBonuses(t.tour);
        const earned = (strokes === 1 ? b.ace : 0) + (rel <= -3 ? b.albatross : rel === -2 ? b.eagle : rel === -1 ? b.birdie : 0);
        if (earned) setTimeout(() => toast(`+${money(earned)} ${strokes === 1 ? 'hole-in-one' : rel <= -3 ? 'albatross' : rel === -2 ? 'eagle' : 'birdie'} bonus`), 900);
      }
    },
    prizeCar: prizeCarFor(t, course, c),
    nickname: c.golfer.nickname || '',
    onShot: (sh) => trackShot(c, sh),
    onAceCar: (car) => {
      c.golfer.money += car.value;
      c.garage = c.garage || [];
      c.garage.push({ name: car.name, color: car.color, value: car.value, event: t.name, year: c.year, hole: car.hole + 1 });
      c.active.carWon = true;
      if (!c.achievements.car) c.achievements.car = { year: c.year, week: c.week };
      saveCareer(c, { now: true });
      setTimeout(() => toast(`You won the ${car.name}! It's in your trophy room (worth ${money(car.value)}).`, 5000), 1800);
    },
    onRoundDone: (scores, hstats) => {
      app.lastBestShot = round.bestShot || null;
      trackRound(c, scores, hstats);
      endRound();
      afterHumanRound();
    },
  });
  app.round = round;
  app.hud.attach(round);
  round.start();
}

// One par 3 in every tournament has a car for a hole-in-one
function prizeCarFor(t, course, c) {
  if (c.active && c.active.carWon) return null;
  const par3 = course.holes.map((h, i) => ({ h, i })).filter((x) => x.h.par === 3);
  if (!par3.length) return null;
  const rng = new RNG(mixSeed(t.seed, 'car'));
  const pick = par3[par3.length - 1];
  const model = PRIZE_CARS[rng.int(0, PRIZE_CARS.length - 1)];
  const bump = { CH: 0.6, WT: 1, MAJ: 1.5, FIN: 2 }[t.tour] || 1;
  return { hole: pick.i, name: model.name, value: Math.round((model.value * bump) / 1000) * 1000, color: CAR_COLORS[rng.int(0, CAR_COLORS.length - 1)] };
}

// Watch a saved shot again on its own hole, then come back to this screen
function watchReplay(shot) {
  const html = app.screens.root.innerHTML;
  const scroll = app.screens.root.scrollTop;
  app.screens.hide();
  const course = shot.course || courseById(shot.courseId);
  const hole = new HoleModel(course, shot.holeIndex, { pinDay: shot.cond.pinDay || 0, ...(shot.holeOpts || {}) });
  app.world.setConditions(shot.cond, hole.style, hole.teeHeading);
  setAmbience({ rain: shot.cond.weather === 'rain' ? 0.7 : 0, night: !!shot.cond.night });
  app.world.loadHole(hole, { crowd: shot.crowd });
  app.world.setGolfer(shot.look);
  const g = app.world.golfer;
  g.setClub(shot.club.kind, shot.club.length);
  g.placeAt(shot.start, shot.heading);
  // the golfer holds the finish while the ball flies
  g.setBackswing(shot.putt ? 0.5 : 1);
  g.swing(shot.putt ? 0.5 : 1, null);
  for (let k = 0; k < 60; k++) g.update(0.05);
  const cad = app.world.caddie;
  if (cad) cad.place(shot.start, shot.heading, shot.putt, (x, z) => hole.heightAt(x, z));
  const ov = document.createElement('div');
  ov.className = 'replay-overlay';
  ov.innerHTML = `<div class="replaytag"><span class="rt-live"><i></i>Replay</span><span class="rt-label">${esc(shot.label)}</span><span class="rt-skip">Tap to finish</span></div>`;
  document.body.appendChild(ov);
  const done = () => {
    if (!app.replay) return;
    app.replay = null;
    ov.remove();
    setAmbience({ rain: 0, night: false });
    app.world.hidePlayers();
    app.world.ball.setVisible(false);
    startMenuScene();
    app.screens.show(html);
    app.screens.root.scrollTop = scroll;
  };
  ov.addEventListener('pointerdown', () => { if (app.replay) app.replay.finish(); });
  app.replay = new ReplayDirector(app.world, hole, shot, done);
  app.world.snapCamera();
}

// Career records from individual shots: longest drive, longest putt, hole-outs
function trackShot(c, sh) {
  const s = c.stats;
  if (sh.teeShot && sh.outcome === 'rest' && (sh.surface === 'fairway' || sh.surface === 'first')) s.longestDrive = Math.max(s.longestDrive || 0, sh.total);
  if (sh.outcome === 'holed' && sh.putt) s.longestPutt = Math.max(s.longestPutt || 0, sh.from);
  if (sh.outcome === 'holed' && !sh.putt && sh.strokes > 1) s.holeOuts = (s.holeOuts || 0) + 1;
}

function trackHole(c, par, strokes, hs) {
  const s = c.stats;
  const hsum = c.active && c.active.hs;
  s.holes++;
  s.strokes += strokes;
  s.par += par;
  const rel = strokes - par;
  if (!hs.simmed && hsum) {
    hsum.holesPlayed++;
    if (rel === -1) { s.birdies++; hsum.birdies++; }
    if (rel === -2) { s.eagles++; hsum.eagles++; }
    if (rel <= -3) { hsum.albatross++; }
    if (strokes === 1) { s.aces++; hsum.aces++; }
    if (hs.fairway !== null && hs.fairway !== undefined) { s.fairwayChances++; if (hs.fairway) s.fairways++; }
    if (hs.gir !== null && hs.gir !== undefined) { s.girChances = (s.girChances || 0) + 1; if (hs.gir) s.gir++; }
    if (hs.putts != null) s.putts += hs.putts;
  }
}

function trackRound(c, scores) {
  const tot = scores.reduce((a, b) => a + (b || 0), 0);
  c.stats.rounds++;
  if (c.active) {
    const course = courseById(c.active.t.courseId);
    const birdies = scores.filter((s, i) => s != null && s < course.holes[i].par).length;
    c.stats.mostBirdies = Math.max(c.stats.mostBirdies || 0, birdies);
  }
  if (c.stats.best == null || tot < c.stats.best) c.stats.best = tot;
  const hsum = c.active && c.active.hs;
  if (hsum) {
    if (hsum.bestRound == null || tot < hsum.bestRound) hsum.bestRound = tot;
    const course = courseById(c.active.t.courseId);
    const bogeyFree = scores.every((s, i) => s == null || s <= course.holes[i].par);
    if (bogeyFree && scores.filter((s) => s != null).length === 18) hsum.bogeyFree = true;
  }
}

function afterHumanRound() {
  const c = app.career;
  const t = c.active.t;
  const r = t.round;
  const fr = tourn.finishRound(t);
  const missedCut = tourn.humanMissedCut(t);
  saveCareer(c);
  roundSummary(app.screens, app, c, t, { round: r, done: fr.done, missedCut, holeStats: [], bestShot: app.lastBestShot });
}

function simTournamentRound() {
  const c = app.career;
  const t = c.active.t;
  const hp = tourn.humanPlayer(t);
  c.active.shot = null;
  if (!hp.scores[t.round]) hp.scores[t.round] = [];
  for (let i = 0; i < 18; i++) {
    if (hp.scores[t.round][i] == null) tourn.recordHumanHole(t, i, tourn.simHumanHole(t, playAs(c.golfer), i), true);
  }
  const course = courseById(t.courseId);
  hp.scores[t.round].forEach((s, i) => trackHole(c, course.holes[i].par, s, { simmed: true }));
  trackRound(c, hp.scores[t.round]);
  afterHumanRound();
}

function nextTournamentRound() {
  const c = app.career;
  const t = c.active.t;
  tourn.simAIRound(t, t.round);
  saveCareer(c);
  eventIntro(app.screens, app, c, t);
}

function finishEvent() {
  const c = app.career;
  const t = c.active.t;
  // Missed cut: the rest of the field plays on
  while (true) {
    const r = t.round;
    const pending = t.players.some((p) => p.status === 'active' && p.id !== tourn.HUMAN_ID && !p.scores[r]);
    if (pending) tourn.simAIRound(t, r);
    const hp = tourn.humanPlayer(t);
    if (hp.status === 'active' && !(hp.scores[r] && hp.scores[r].length === 18)) break; // shouldn't happen
    const fr = tourn.finishRound(t);
    if (fr.done) break;
  }
  t.finished = true;
  const tied = tourn.playoffNeeded(t);
  if (tied && tied.includes(tourn.HUMAN_ID)) {
    startPlayoff(tied);
    return;
  }
  if (tied) tourn.simPlayoff(t, tied);
  completeEventWeek();
}

function startPlayoff(tied, scores = []) {
  const c = app.career;
  const t = c.active.t;
  const res = tourn.simPlayoff(t, tied, scores);
  if (!res.pending) { completeEventWeek(); return; }
  const names = res.alive.filter((id) => id !== tourn.HUMAN_ID).map((id) => app.nameOf(id)).join(', ');
  const m = modal(`<h3>Sudden-death playoff!</h3><p>You're tied for the lead with ${esc(names)}. Playoff hole ${res.hole + 1}: the 18th. Lowest score wins; ties play again.</p><div class="actions"><button class="btn primary" data-go>Play the 18th</button><button class="btn" data-sim>Simulate it</button></div>`);
  const course = courseById(t.courseId);
  const go = (sim) => {
    m.close();
    if (sim) {
      startPlayoff(tied, [...scores, tourn.simHumanHole(t, playAs(c.golfer), 17, 1000 + scores.length)]);
      return;
    }
    app.screens.hide();
    const g = playAs(c.golfer);
    const round = new RoundController(app, {
      course, holeList: [17], golfer: { name: g.name, stats: g.stats, traits: g.traits, ball: g.ball, bag: g.bag, look: { ...g.look, ...sponsorLook(c) }, gender: g.gender },
      cond: { ...t.cond[t.rounds - 1], seed: mixSeed(t.seed, 'po', scores.length) }, crowd: true,
      onRoundDone: (sc) => { endRound(); startPlayoff(tied, [...scores, sc[17]]); },
    });
    app.round = round;
    app.hud.attach(round);
    round.start();
  };
  m.el.querySelector('[data-go]').addEventListener('click', () => go(false));
  m.el.querySelector('[data-sim]').addEventListener('click', () => go(true));
}

function completeEventWeek() {
  const c = app.career;
  const t = c.active.t;
  const hs = c.active.hs;
  const summary = career.completeWeek(c, hs);
  saveCareer(c, { now: true });
  if (summary.humanResult && summary.humanResult.pos === 1) sfx.applause(1.4);
  eventResults(app.screens, app, c, t, summary);
}

// ---------------- quick round ----------------
function openQuick(pre) {
  const courses = generateCourses();
  const base = app.quickOpts || {
    courseId: courses[Math.floor(Math.random() * courses.length)].id,
    proId: null, holes: '18', ball: app.career ? app.career.golfer.ball : 'tourbal', wind: 'course', greens: 'course', time: '0.5', pin: '0', weather: 'course',
  };
  app.quickOpts = { ...base, ...pre };
  if (pre.proId) app.quickOpts.ball = proById(pre.proId).ball;
  app.screens.quick(app.quickOpts);
}

// The golfer for a quick round or mini-game: a chosen pro, your career
// golfer (as the player you're playing as), or a club pro
function golferFor(proId, ball) {
  if (proId) {
    const p = proById(proId);
    return { name: p.name, stats: p.stats, traits: p.traits, ball: ball || p.ball, bag: p.bag, look: p.look, gender: p.gender, proId };
  }
  if (app.career) {
    const g = playAs(app.career.golfer);
    return { name: g.name, stats: g.stats, traits: g.traits, ball: ball || g.ball, bag: g.bag, look: { ...g.look, ...sponsorLook(app.career) }, gender: g.gender };
  }
  const s = { power: 70, accuracy: 70, irons: 70, shortGame: 70, putting: 70, recovery: 70, mental: 70, wind: 70, consistency: 70 };
  return { name: 'Club Pro', stats: s, traits: [], ball: ball || 'tourbal', look: { shirt: '#2a9d8f', pants: '#2b2d42', cap: '#ffffff', skin: '#e8b996' }, gender: 'm' };
}

function startQuick() {
  const q = app.quickOpts;
  const course = courseById(q.courseId);
  const rng = new RNG(Date.now() & 0xffffff);
  const golfer = golferFor(q.proId, q.ball);
  const windMph = { calm: rng.float(0, 3), breezy: rng.float(8, 12), windy: rng.float(15, 22), gale: rng.float(25, 32) }[q.wind] ?? rng.float(course.wind[0], course.wind[1]);
  const cond = {
    windMph, windDir: rng.float(0, Math.PI * 2), gust: 0.15,
    stimp: q.greens === 'course' ? course.stimp : parseFloat(q.greens),
    firm: course.firm, timeOfDay: 0.5,
    pinDay: parseInt(q.pin, 10), seed: rng.int(1, 1e9),
  };
  applyWeather(cond, !q.weather || q.weather === 'course' ? rollWeather(course.style, rng) : q.weather, q.time, rng);
  const holeList = q.holes === 'front' ? [...Array(9).keys()] : q.holes === 'back' ? [...Array(9).keys()].map((i) => i + 9) : q.holes === 'sig' ? [course.signature - 1] : [...Array(18).keys()];
  // match play against a pro, if chosen
  let versus = null;
  if (q.vs) {
    const pro = q.vs === 'rival' && app.career && app.career.rival ? proById(app.career.rival.id) : generatePros()[rng.int(0, 49)];
    versus = { name: pro.name, id: pro.id, scores: opponentScores(pro, course, holeList, cond, cond.seed) };
  }
  app.screens.hide();
  const round = new RoundController(app, {
    course, holeList, golfer, cond, crowd: false, versus, nickname: !q.proId && app.career ? app.career.golfer.nickname || '' : '',
    onRoundDone: (scores, hstats) => {
      app.lastBestShot = round.bestShot || null;
      const vs = round.versus ? { name: round.versus.name, text: round.versusText(round.versus.decided ? round.versus.decided.left : 0), up: round.versus.up } : null;
      endRound();
      quickSummary(course, scores, hstats, golfer, holeList, vs);
    },
  });
  app.round = round;
  app.hud.attach(round);
  round.start();
}

// ---------------- mini-games ----------------
function openMini(pre) {
  const courses = generateCourses();
  const base = app.miniOpts || { courseId: courses[Math.floor(Math.random() * courses.length)].id, proId: null };
  app.miniOpts = { ...base, ...pre };
  app.pickFor = 'mini';
  app.fromHub = false;
  miniMenu(app.screens, app, app.miniOpts);
}

function startMini(kind, daily = null) {
  if (!app.miniOpts) openMini({});
  const o = app.miniOpts;
  const course = courseById(daily ? daily.courseId : o.courseId);
  const rng = new RNG(daily ? daily.seed : Date.now() & 0xffffff);
  const golfer = golferFor(daily ? null : o.proId);
  // mini-games are played in pleasant conditions: a light, steady breeze
  const cond = {
    windMph: kind === 'putt' ? 0 : rng.float(2, kind === 'range' ? 6 : 9), windDir: rng.float(0, Math.PI * 2), gust: 0.08,
    stimp: course.stimp, firm: course.firm, timeOfDay: rng.float(0.35, 0.7), pinDay: 1, seed: rng.int(1, 1e9),
  };
  if (daily) { cond.windMph = daily.windMph; cond.windDir = daily.windDir; cond.seed = daily.seed; }
  const sky = daily ? daily.sky : o.sky || 'day';
  applyWeather(cond, sky === 'rain' ? 'rain' : 'sunny', sky === 'night' ? 'night' : sky === 'sunset' ? '0.93' : String(cond.timeOfDay), rng);
  const mode = new MiniGame(kind, { course, golfer, seed: cond.seed, units: app.settings.units, cond });
  mode.daily = daily;
  app.screens.hide();
  const round = new RoundController(app, {
    course: mode.course, holeList: [mode.holeIndex], golfer, cond, crowd: kind === 'ctp' || kind === 'putt',
    mode, holeOpts: mode.holeOpts,
    onRoundDone: () => { endRound(); miniDone(mode); },
  });
  app.round = round;
  app.hud.attach(round);
  round.start();
}

function fmtLong(m) {
  return app.settings.units === 'meters' ? `${Math.round(m)} m` : `${Math.round(m / YD)} yds`;
}
function fmtShort(m) {
  if (app.settings.units === 'meters') return `${m.toFixed(1)} m`;
  const ft = m / 0.3048;
  const f = Math.floor(ft), inch = Math.round((ft - f) * 12);
  return inch === 12 ? `${f + 1} ft` : `${f} ft ${inch} in`;
}

function miniDone(mode) {
  const res = mode.result();
  const recs = app.records;
  const extra = { fmt: fmtLong, fmtSmall: fmtShort };
  if (mode.daily) { dailyDone(mode, res, extra); return; }
  if (res.kind === 'range') {
    if (res.best && betterScore('drive', res.best, recs.rangeDrive && recs.rangeDrive.score)) {
      recs.rangeDrive = { score: res.best, text: fmtLong(res.best), name: res.course.name, date: Date.now() };
      extra.record = true;
      saveRecords(recs);
    }
    miniResults(app.screens, app, res, extra);
    return;
  }
  const scored = res.kind === 'ctp' ? res.score < Infinity : res.score > 0;
  if (scored && betterScore(res.kind, res.score, recs[res.kind] && recs[res.kind].score)) {
    recs[res.kind] = { score: res.score, text: res.scoreText, name: res.course.name, date: Date.now() };
    extra.record = true;
    saveRecords(recs);
  }
  // weekly prize money for the career golfer
  const c = app.career;
  if (c && !mode.golfer.proId) {
    extra.prizeOn = true;
    const wk = `${c.year}-${c.week}`;
    if (!c.mini || c.mini.week !== wk) c.mini = { week: wk, played: {} };
    if (!c.mini.played[res.kind]) {
      const prize = MINI_PRIZES[res.pos - 1] || 1000;
      c.mini.played[res.kind] = true;
      c.golfer.money += prize;
      extra.prize = prize;
      saveCareer(c, { now: true });
      if (res.pos === 1) sfx.applause(1.2);
    } else extra.prizeNote = 'You already collected this week\'s prize for this game. Play a career event to move to next week.';
  }
  miniResults(app.screens, app, res, extra);
}

// ---------------- play with friends ----------------
function openParty(pre) {
  const courses = generateCourses();
  const base = app.partyOpts || {
    courseId: courses[Math.floor(Math.random() * courses.length)].id,
    format: 'stroke', holes: '3', wind: 'course', time: '0.5', weather: 'sunny',
    players: [{ name: app.career ? app.career.golfer.name.split(' ')[0] : 'Player 1', who: app.career ? 'career' : 'club' }, { name: 'Player 2', who: 'club' }],
  };
  app.partyOpts = { ...base, ...pre };
  app.pickFor = 'party';
  app.fromHub = false;
  partySetup(app.screens, app, app.partyOpts);
}

// A golfer for one of the friends: the career golfer, a skill tier, or a pro
const TIER_LOOKS = [
  { hat: 'cap', hairStyle: 'short', pants: '#2b2d42', skin: '#e8b996' },
  { hat: 'visor', hairStyle: 'ponytail', pants: '#f1f1f1', skin: '#d49a73', gender: 'f' },
  { hat: 'bucket', hairStyle: 'curly', pants: '#1b1b1b', skin: '#8d5a3b', shorts: true },
  { hat: 'flat', hairStyle: 'short', pants: '#6b705c', skin: '#f5d0b5', beard: 'stubble' },
];
function partyGolfer(who, i) {
  if (who === 'career' && app.career) return golferFor(null);
  if (PARTY_TIERS[who]) {
    const lv = PARTY_TIERS[who].level;
    const stats = { power: lv, accuracy: lv, irons: lv, shortGame: lv, putting: lv, recovery: lv, mental: lv, wind: lv, consistency: lv };
    const lk = TIER_LOOKS[i % TIER_LOOKS.length];
    return { name: PARTY_TIERS[who].name, stats, traits: [], ball: 'tourbal', look: { ...lk, shirt: PARTY_COLORS[i], cap: '#ffffff', hair: '#3b2a1f', shoe: PARTY_COLORS[i] }, gender: lk.gender || 'm' };
  }
  if (proById(who)) return golferFor(who);
  return golferFor(null);
}

function startParty() {
  const o = app.partyOpts;
  if (!o) { openParty({}); return; }
  // pick up any names typed but not yet committed
  document.querySelectorAll('[data-field^="party.name."]').forEach((el) => { o.players[+el.dataset.field.split('.')[2]].name = el.value; });
  const course = courseById(o.courseId);
  const rng = new RNG(Date.now() & 0xffffff);
  const players = o.players.map((pl, i) => ({ name: (pl.name || '').trim() || `Player ${i + 1}`, color: PARTY_COLORS[i], golfer: partyGolfer(pl.who, i) }));
  const n = { 3: 3, 6: 6 }[o.holes];
  const start = n ? rng.int(0, 18 - n) : 0;
  const holeList = n ? [...Array(n).keys()].map((k) => start + k) : o.holes === 'front' ? [...Array(9).keys()] : o.holes === 'back' ? [...Array(9).keys()].map((k) => k + 9) : [...Array(18).keys()];
  const windMph = { calm: rng.float(0, 3), breezy: rng.float(8, 12), windy: rng.float(15, 22) }[o.wind] ?? rng.float(course.wind[0], course.wind[1]);
  const cond = {
    windMph, windDir: rng.float(0, Math.PI * 2), gust: 0.15, stimp: course.stimp, firm: course.firm,
    timeOfDay: 0.5, pinDay: 0, seed: rng.int(1, 1e9),
  };
  applyWeather(cond, !o.weather || o.weather === 'course' ? rollWeather(course.style, rng) : o.weather, o.time, rng);
  const party = new Party(players, o.format, course, holeList);
  app.screens.hide();
  const round = new RoundController(app, {
    course, holeList, golfer: players[0].golfer, cond, crowd: false, party,
    onRoundDone: () => {
      app.lastBestShot = round.bestShot || null;
      endRound();
      sfx.applause(1.2);
      partyResults(app.screens, app, party);
    },
  });
  app.round = round;
  app.hud.attach(round);
  round.start();
}

// ---------------- the Legends Cup ----------------
function openCup() {
  const c = app.career;
  if (!c) return;
  const teams = cupTeams(c, career.rankings(c), tourn.HUMAN_ID);
  const course = cupCourse(c);
  app.cupInfo = { teams, courseId: course.id };
  app.fromHub = true;
  cupScreen(app.screens, app, c, app.cupInfo, career.golferOVR(c.golfer));
}

function cupCond(c, course) {
  const rng = new RNG(mixSeed('cupcond', c.year));
  const cond = { windMph: rng.float(3, 12), windDir: rng.float(0, Math.PI * 2), gust: 0.12, stimp: course.stimp + 0.5, firm: course.firm, timeOfDay: 0.8, pinDay: 2, seed: mixSeed('cupseed', c.year) };
  return applyWeather(cond, rng.chance(0.15) ? 'cloudy' : 'sunny', '0.8', rng);
}

function playCup(sim) {
  const c = app.career;
  const info = app.cupInfo;
  if (!c || !info) return;
  const course = courseById(info.courseId);
  const holes = [...Array(CUP_HOLES).keys()];
  const cond = cupCond(c, course);
  const rival = info.teams.rival;
  const g = playAs(c.golfer);
  if (sim) {
    const me = { stats: g.stats, traits: g.traits, bag: g.bag };
    const r = simMatch(me, rival, course, holes, cond, mixSeed('cupme', c.year, Date.now() & 0xffff));
    finishCup(r.up, r.left);
    return;
  }
  const scores = opponentScores(rival, course, holes, cond, mixSeed('cupme', c.year));
  app.screens.hide();
  const round = new RoundController(app, {
    course, holeList: holes, cond, crowd: true,
    golfer: { name: g.name, stats: g.stats, traits: g.traits, ball: g.ball, bag: g.bag, look: { ...g.look, ...sponsorLook(c) }, gender: g.gender },
    versus: { name: rival.name, id: rival.id, scores },
    onRoundDone: () => {
      const v = round.versus;
      app.lastBestShot = round.bestShot || null;
      endRound();
      finishCup(v.up, v.decided ? v.decided.left : 0);
    },
  });
  app.round = round;
  app.hud.attach(round);
  round.start();
}

function finishCup(myUp, myLeft) {
  const c = app.career;
  const info = app.cupInfo;
  const course = courseById(info.courseId);
  const holes = [...Array(CUP_HOLES).keys()];
  const cond = cupCond(c, course);
  const t = info.teams;
  const matches = [{ aName: c.golfer.name, bName: t.rival.name, up: myUp, text: matchText(myUp, myLeft, 'You', t.rival.name.split(' ').slice(-1)[0]), mine: true }];
  t.mates.forEach((m, k) => {
    const w = t.world[k];
    if (!w) return;
    const r = simMatch(m, w, course, holes, cond, mixSeed('cupmatch', c.year, k));
    matches.push({ aName: m.name, bName: w.name, up: r.up, text: matchText(r.up, r.left, m.last, w.last) });
  });
  const pts = [0, 0];
  for (const m of matches) {
    if (m.up > 0) pts[0] += 1; else if (m.up < 0) pts[1] += 1; else { pts[0] += 0.5; pts[1] += 0.5; }
  }
  const won = pts[0] > pts[1], tied = pts[0] === pts[1];
  const prize = won ? CUP_PRIZE.win : tied ? Math.round((CUP_PRIZE.win + CUP_PRIZE.lose) / 2) : CUP_PRIZE.lose;
  c.golfer.money += prize;
  c.cup = { year: c.year, done: true, won, pts };
  c.cups = c.cups || [];
  if (won) {
    c.cups.push({ year: c.year, score: `${pts[0]}-${pts[1]}`, course: course.name });
    if (!c.achievements.cup) c.achievements.cup = { year: c.year, week: c.week };
    sfx.applause(1.6);
  }
  if (c.rival) { if (myUp > 0) c.rival.w++; else if (myUp < 0) c.rival.l++; else c.rival.t++; }
  saveCareer(c, { now: true });
  cupResults(app.screens, app, c, { matches, pts, won, tied, prize });
}

// ---------------- daily challenge ----------------
function openDaily() {
  app.fromHub = false;
  const ch = dailyChallenge(dayKey());
  dailyScreen(app.screens, app, ch, loadDaily());
}

function dailyDone(mode, res, extra) {
  const ch = mode.daily;
  const d = loadDaily();
  const better = (a, b) => betterScore(ch.kind, a, b);
  const scored = ch.kind === 'ctp' ? res.score < Infinity : res.score > 0;
  const rec = recordDaily(d, ch, scored ? res.score : (ch.kind === 'ctp' ? Infinity : 0), better);
  extra.daily = { ch, beat: beatsTarget(ch, res.score), newlyBeat: rec.newlyBeat, streak: rec.streak, best: rec.day.best, improved: rec.improved };
  const c = app.career;
  if (c && rec.newlyBeat && !rec.day.paid) {
    const pay = dailyReward(rec.streak);
    rec.day.paid = true;
    c.golfer.money += pay;
    extra.prize = pay;
    saveCareer(c, { now: true });
  }
  if (rec.newlyBeat) sfx.applause(1.2);
  saveDaily(d);
  miniResults(app.screens, app, res, extra);
}

function modeBoardModal(mode) {
  const rows = mode.board();
  modal(`<h3>${esc(GAMES[mode.kind].name)}</h3><div class="table-wrap"><table class="tbl"><thead><tr><th>Pos</th><th>Player</th><th>Score</th></tr></thead><tbody>${rows.map((r) => `<tr class="${r.you ? 'me' : ''}"><td>${r.pos}</td><td>${esc(r.you ? 'You' : r.name)}</td><td><b>${esc(r.text)}</b>${r.you && r.partial ? ' <span class="muted small">(so far)</span>' : ''}</td></tr>`).join('')}</tbody></table></div><div class="actions"><button class="btn" data-close>Close</button></div>`);
}

function quickSummary(course, scores, hstats, golfer, holeList, vs = null) {
  let s = 0, p = 0;
  for (const i of holeList) { if (scores[i] != null) { s += scores[i]; p += course.holes[i].par; } }
  app.screens.show(`
    <div class="page narrow">
      <header class="page-head"><h2>${esc(course.name)}</h2><span class="pill">${esc(golfer.name)}</span></header>
      <section class="card result-hero ${s < p || (vs && vs.up > 0) ? 'good' : ''} ${vs && vs.up > 0 ? 'win' : ''}"><div class="rh-score"><b>${s}</b><span class="${s - p < 0 ? 'tp-under' : s - p > 0 ? 'tp-over' : 'tp-even'}">${fmtToPar(s - p)}</span></div><div><div class="rh-pos">${vs ? esc(vs.up > 0 ? `You beat ${vs.name}!` : vs.up < 0 ? `${vs.name} wins the match` : 'Match halved') : 'Round complete'}</div><div class="muted">${vs ? `${esc(vs.text)} · ` : ''}${holeList.filter((i) => scores[i] != null).length} hole${holeList.length > 1 ? 's' : ''} · par ${p}</div></div></section>
      ${bestShotCard(app.lastBestShot)}
      ${scorecardHtml(course, scores, hstats)}
      <div class="actions"><button class="btn primary big" data-a="startQuick">Play again</button><button class="btn" data-a="quick">Change setup</button><button class="btn" data-a="title">Main menu</button></div>
    </div>`);
}

boot();
