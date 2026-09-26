// Fairway Legends: app controller. Wires the 3D world, the HUD, the menus,
// the career and tournaments together.
import * as THREE from '../vendor/three.module.min.js';
import { World } from './render/world.js';
import { HUD } from './ui/hud.js';
import { Screens } from './ui/screens.js';
import { SwingInput } from './ui/swing.js';
import { modal, toast, esc, fmtToPar } from './ui/dom.js';
import { eventIntro, roundSummary, eventResults, scorecardModal, boardModal, scorecardHtml } from './ui/eventScreens.js';
import { RoundController } from './game/round.js';
import * as career from './game/career.js';
import * as tourn from './game/tournament.js';
import { loadCareer, saveCareer, deleteCareer, loadSettings, saveSettings, initCloud, hasCloud } from './game/storage.js';
import { initAudio, setSound, sfx } from './audio.js';
import { proById, generatePros } from './data/players.js';
import { generateCourses, courseById } from './data/courses.js';
import { HoleModel } from './sim/hole.js';
import { RNG, mixSeed } from './util/rng.js';
import { traitEffects } from './data/traits.js';
import { BALL_BY_ID } from './data/equipment.js';

const $ = (id) => document.getElementById(id);

const app = {
  settings: loadSettings(),
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

// ---------------- boot ----------------
function boot() {
  app.world = new World($('view'), app.settings);
  app.hud = new HUD($('hud'), app);
  app.hud.root.hidden = true;
  app.screens = new Screens($('screens'), app);
  app.swing = new SwingInput($('view'), app);
  setSound(app.settings.sound);
  document.addEventListener('pointerdown', () => initAudio(), { once: false });
  setupKeys();
  startMenuScene();
  app.screens.title(false);
  requestAnimationFrame(loop);
  loadCareer().then((c) => {
    app.cloudSave = hasCloud();
    if (c) {
      app.career = c;
      if (!app.round) showTitle();
    }
    document.title = 'Fairway Legends';
    document.body.dataset.ready = '1';
  });
  initCloud().then(() => { app.cloudSave = hasCloud(); });
}

function careerInfo() {
  const c = app.career;
  if (!c) return '';
  return `${c.golfer.name} · World #${career.rankOf(c)} · ${c.year} week ${c.week}`;
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
  app.world.setConditions({ timeOfDay: 0.62, overcast: pick.style === 'Links' }, hole.style, hole.teeHeading);
  app.world.loadHole(hole, { crowd: false });
  app.world.aim.setVisible(false);
  app.world.ball.setVisible(false);
  if (app.world.golfer) app.world.golfer.root.visible = false;
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
  const dt = Math.min(0.05, (now - last) / 1000) * (app.timeScale || 1);
  last = now;
  if (app.round) {
    if (app.aimHold) app.round.nudgeAim(app.aimHold * dt * (app.round.putting ? 0.12 : 0.35));
    app.round.fast = !!app.fastHold;
    app.round.update(dt);
  } else {
    menuCamera(dt);
  }
  app.world.frame(dt);
  requestAnimationFrame(loop);
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
app.onHudAction = (a) => {
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
    case 'card': scorecardModal(r.course, r.scores, r.holeStats); break;
    case 'board': if (r.opts.tournament) boardModal(r.opts.tournament, app.nameOf); break;
    case 'sim': confirmSim(); break;
    case 'pause': pauseMenu(); break;
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
      <button class="mbtn ghost" data-p="quit"><span>${t ? 'Save & exit to hub' : 'Quit round'}</span><small>${t ? 'Completed holes are saved; resume from the next hole' : ''}</small></button>
    </div>`);
  m.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    const p = b.dataset.p;
    if (p === 'sound') { app.settings.sound = b.checked; setSound(b.checked); saveSettings(app.settings); return; }
    m.close();
    if (p === 'card') scorecardModal(r.course, r.scores, r.holeStats);
    else if (p === 'board') boardModal(t, app.nameOf);
    else if (p === 'howto') app.screens.howto();
    else if (p === 'quit') quitRound();
  });
}

function endRound() {
  if (app.round) app.round.destroy();
  app.round = null;
  app.hud.detach();
  app.aimHold = 0;
  if (app.world.golfer) app.world.golfer.root.visible = false;
  app.world.ball.setVisible(false);
  startMenuScene();
}

function quitRound() {
  const t = app.round && app.round.opts.tournament;
  endRound();
  if (t) { saveCareer(app.career); goHub(); }
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
      if (c) {
        const m = modal(`<h3>Start a new career?</h3><p>This replaces ${esc(c.golfer.name)}'s career (world #${career.rankOf(c)}). This can't be undone.</p><div class="actions"><button class="btn danger" data-go>Replace career</button><button class="btn" data-close>Keep it</button></div>`);
        m.el.querySelector('[data-go]').addEventListener('click', () => { m.close(); newCareerDraft(); });
      } else newCareerDraft();
      break;
    case 'draftStat': {
      const k = d.k, dd = +d.d;
      const dr = app.draft;
      if (dd > 0 && dr.bonus > 0 && dr.stats[k] < 75) { dr.stats[k]++; dr.bonus--; }
      if (dd < 0 && dr.stats[k] > career.DEFAULT_STATS[k]) { dr.stats[k]--; dr.bonus++; }
      app.screens.newCareer(dr);
      break;
    }
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
    case 'upgrade': if (career.upgradeStat(c, d.k)) { saveCareer(c); sfx.click(); } app.screens.hub(c, 'golfer'); break;
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
    case 'players': app.fromHub = false; app.playersOpts = { q: '', sort: 'rank', limit: 120 }; app.screens.players(app.playersOpts); break;
    case 'morePlayers': app.playersOpts.limit += 150; app.screens.players(app.playersOpts); break;
    case 'pro': app.screens.proCard(d.id); break;
    case 'pickPro': app.quickOpts.proId = d.id; app.quickOpts.ball = proById(d.id).ball; app.screens.quick(app.quickOpts); break;
    case 'playAsPro': {
      document.querySelectorAll('.modal-wrap').forEach((m) => m.remove());
      openQuick({ proId: d.id });
      break;
    }
    case 'courses': app.coursesOpts = { q: '', style: '' }; app.screens.courses(app.coursesOpts); break;
    case 'courseStyle': app.coursesOpts.style = d.s; app.screens.courses(app.coursesOpts); break;
    case 'course': app.screens.courseCard(d.id); break;
    case 'pickCourse': app.quickOpts.courseId = d.id; app.screens.quick(app.quickOpts); break;
    case 'playCourse': document.querySelectorAll('.modal-wrap').forEach((m) => m.remove()); openQuick({ courseId: d.id }); break;
    case 'quick': app.quickOpts ? app.screens.quick(app.quickOpts) : openQuick({}); break;
    case 'pickCourseList': app.screens.courses({ ...app.coursesOpts, pick: true }); break;
    case 'pickProList': app.screens.players({ ...app.playersOpts, pick: true }); break;
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
};

// Re-render a list screen while keeping focus in its search box
function rerenderList(kind) {
  const active = document.activeElement;
  const pos = active && active.selectionStart;
  const pick = !!document.querySelector('[data-a="pickPro"], [data-a="pickCourse"]');
  if (kind === 'players') app.screens.players({ ...app.playersOpts, pick });
  else if (kind === 'courses') app.screens.courses({ ...app.coursesOpts, pick });
  else if (kind === 'rank') app.screens.hub(app.career, 'rankings');
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
  if (app.draft) {
    if (k === 'name') app.draft.name = v;
    else if (k === 'country') app.draft.country = v;
    else if (k === 'gender') app.draft.gender = v;
    else if (k === 'adv') app.draft.adv = v;
    else if (k === 'dis') app.draft.dis = v;
  }
};

// ---------------- career ----------------
function newCareerDraft() {
  app.draft = {
    name: '', country: 'USA', gender: 'm',
    look: { shirt: '#1d3557', pants: '#e9e4d8', cap: '#f1faee', skin: '#e8b996', hair: '#3b2a1f' },
    stats: { ...career.DEFAULT_STATS }, bonus: 12, adv: '', dis: '',
  };
  app.screens.newCareer(app.draft);
}

function createCareer() {
  const d = app.draft;
  const name = (document.getElementById('f-name')?.value || d.name).trim();
  if (!name) { toast('Give your golfer a name'); document.getElementById('f-name')?.focus(); return; }
  if (d.adv && !d.dis) { toast('A strength needs a weakness to go with it'); return; }
  const c = career.newCareer({ name, country: d.country, gender: d.gender, look: d.look, stats: d.stats });
  c.golfer.traits = [d.adv, d.dis].filter(Boolean);
  if (d.bonus > 0) c.golfer.sp += d.bonus;
  app.career = c;
  saveCareer(c);
  app.draft = null;
  goHub();
  setTimeout(() => {
    modal(`<h3>Welcome to the tour, ${esc(name)}</h3><p>You're ranked <b>#501</b> in the world. The Challenger Tour is open to you every week; win there (or climb into the top 125) to earn World Tour starts. You also have <b>two sponsor invitations</b> to try a World Tour event early.</p><p>Tip: open <b>How to play</b> from the menu for the swing, putting and aiming controls.</p><div class="actions"><button class="btn primary" data-close>Let's go</button></div>`);
  }, 200);
}

function goHub() {
  if (!app.career) { showTitle(); return; }
  app.fromHub = true;
  app.screens.hub(app.career, app.screens.tab || 'week');
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
  const g = c.golfer;
  const round = new RoundController(app, {
    course,
    holeList: [...Array(18).keys()],
    startPos: done,
    scores: hp.scores[t.round] || [],
    golfer: { name: g.name, stats: g.stats, traits: g.traits, ball: g.ball, look: g.look, gender: g.gender },
    cond: roundCond(t),
    tournament: t,
    crowd: true,
    leaderboardFn: () => tourn.leaderboard(t),
    simHole: (i) => tourn.simHumanHole(t, g, i),
    onHoleDone: (i, strokes, hs) => {
      tourn.recordHumanHole(t, i, strokes, hs.simmed);
      holeStats[i] = hs;
      trackHole(c, course.holes[i].par, strokes, hs);
      saveCareer(c);
    },
    onRoundDone: (scores, hstats) => {
      trackRound(c, scores, hstats);
      endRound();
      afterHumanRound();
    },
  });
  app.round = round;
  app.hud.attach(round);
  round.start();
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
  roundSummary(app.screens, app, c, t, { round: r, done: fr.done, missedCut, holeStats: [] });
}

function simTournamentRound() {
  const c = app.career;
  const t = c.active.t;
  const hp = tourn.humanPlayer(t);
  if (!hp.scores[t.round]) hp.scores[t.round] = [];
  for (let i = 0; i < 18; i++) {
    if (hp.scores[t.round][i] == null) tourn.recordHumanHole(t, i, tourn.simHumanHole(t, c.golfer, i), true);
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
      startPlayoff(tied, [...scores, tourn.simHumanHole(t, c.golfer, 17, 1000 + scores.length)]);
      return;
    }
    app.screens.hide();
    const g = c.golfer;
    const round = new RoundController(app, {
      course, holeList: [17], golfer: { name: g.name, stats: g.stats, traits: g.traits, ball: g.ball, look: g.look, gender: g.gender },
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
  saveCareer(c);
  if (summary.humanResult && summary.humanResult.pos === 1) sfx.applause(1.4);
  eventResults(app.screens, app, c, t, summary);
}

// ---------------- quick round ----------------
function openQuick(pre) {
  const courses = generateCourses();
  const base = app.quickOpts || {
    courseId: courses[Math.floor(Math.random() * courses.length)].id,
    proId: null, holes: '18', ball: app.career ? app.career.golfer.ball : 'tourbal', wind: 'course', greens: 'course', time: '0.5', pin: '0',
  };
  app.quickOpts = { ...base, ...pre };
  if (pre.proId) app.quickOpts.ball = proById(pre.proId).ball;
  app.screens.quick(app.quickOpts);
}

function startQuick() {
  const q = app.quickOpts;
  const course = courseById(q.courseId);
  const rng = new RNG(Date.now() & 0xffffff);
  let golfer;
  if (q.proId) {
    const p = proById(q.proId);
    golfer = { name: p.name, stats: p.stats, traits: p.traits, ball: q.ball, look: p.look, gender: p.gender };
  } else if (app.career) {
    const g = app.career.golfer;
    golfer = { name: g.name, stats: g.stats, traits: g.traits, ball: q.ball, look: g.look, gender: g.gender };
  } else {
    const s = { power: 70, accuracy: 70, irons: 70, shortGame: 70, putting: 70, recovery: 70, mental: 70, wind: 70, consistency: 70 };
    golfer = { name: 'Club Pro', stats: s, traits: [], ball: q.ball, look: { shirt: '#2a9d8f', pants: '#2b2d42', cap: '#ffffff', skin: '#e8b996' }, gender: 'm' };
  }
  const windMph = { calm: rng.float(0, 3), breezy: rng.float(8, 12), windy: rng.float(15, 22), gale: rng.float(25, 32) }[q.wind] ?? rng.float(course.wind[0], course.wind[1]);
  const cond = {
    windMph, windDir: rng.float(0, Math.PI * 2), gust: 0.15,
    stimp: q.greens === 'course' ? course.stimp : parseFloat(q.greens),
    firm: course.firm, timeOfDay: parseFloat(q.time), overcast: course.style === 'Links' ? rng.chance(0.5) : rng.chance(0.12),
    pinDay: parseInt(q.pin, 10), seed: rng.int(1, 1e9),
  };
  const holeList = q.holes === 'front' ? [...Array(9).keys()] : q.holes === 'back' ? [...Array(9).keys()].map((i) => i + 9) : q.holes === 'sig' ? [course.signature - 1] : [...Array(18).keys()];
  app.screens.hide();
  const round = new RoundController(app, {
    course, holeList, golfer, cond, crowd: false,
    onRoundDone: (scores, hstats) => {
      endRound();
      quickSummary(course, scores, hstats, golfer, holeList);
    },
  });
  app.round = round;
  app.hud.attach(round);
  round.start();
}

function quickSummary(course, scores, hstats, golfer, holeList) {
  let s = 0, p = 0;
  for (const i of holeList) { if (scores[i] != null) { s += scores[i]; p += course.holes[i].par; } }
  app.screens.show(`
    <div class="page narrow">
      <header class="page-head"><h2>${esc(course.name)}</h2><span class="pill">${esc(golfer.name)}</span></header>
      <section class="card result-hero ${s < p ? 'good' : ''}"><div class="rh-score"><b>${s}</b><span class="${s - p < 0 ? 'tp-under' : s - p > 0 ? 'tp-over' : 'tp-even'}">${fmtToPar(s - p)}</span></div><div><div class="rh-pos">Round complete</div><div class="muted">${holeList.length} hole${holeList.length > 1 ? 's' : ''} · par ${p}</div></div></section>
      ${scorecardHtml(course, scores, hstats)}
      <div class="actions"><button class="btn primary big" data-a="startQuick">Play again</button><button class="btn" data-a="quick">Change setup</button><button class="btn" data-a="title">Main menu</button></div>
    </div>`);
}

boot();
