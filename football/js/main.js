/* Gridiron Kings — boot, main loop and game flow. */
(function () {
  'use strict';
  const FG = window.FG;
  const U = FG.util, D = FG.data, UI = FG.ui, A = FG.audio, SV = FG.save, GX = FG.gfx, IN = FG.input, C = FG.caster;
  const $ = (s) => document.querySelector(s);
  const STEP = 1 / 60;
  const GAME = { match: null, paused: false, done: false, acc: 0, last: 0, info: null, frame: 0, hold: false, replay: null, skipReplay: false };
  /* recording of the current play, used for instant replays of big moments */
  const REC = { on: false, players: null, frames: [], want: false, done: false, k: 0 };

  GAME.start = function (opts) {
    if (!GX.ready) { UI.toast('3D graphics could not start in this browser, so games are unavailable.', 'warn'); return; }
    const s = SV.data, me = UI.userClub();
    const rating = D.teamRating(s.lineup);
    let opp, level, mult;
    if (opts.mode === 'division') {
      opp = UI.nextOpponent(); level = U.lerp(0.1, 0.95, (10 - s.division) / 9); mult = D.DIVISIONS[s.division].mult;
    } else {
      const F = { easy: [-8, 0.08, 0.4], medium: [-1, 0.4, 0.55], hard: [3, 0.72, 0.75], legend: [8, 0.97, 1] }[opts.diff] || [-1, 0.4, 0.55];
      opp = D.buildAITeam({ target: U.clamp(rating + F[0], 52, 96), seed: Math.floor(Math.random() * 1e6) + 1, avoidColor: me.c1, exclude: s.lineup });
      level = F[1]; mult = F[2];
    }
    const home = { name: me.name, short: me.short, lineup: s.lineup.map((id) => D.byId[id]) };
    const away = { name: opp.name, short: opp.short, lineup: opp.slots.map((id) => D.byId[id]) };
    const kits = [{ c1: me.c1, c2: me.c2, helm: me.helm, pants: me.pants }, opp.kit];
    const wr = Math.random();
    const weather = opts.weather || (wr < 0.6 ? 'clear' : wr < 0.82 ? 'snow' : 'rain');
    const m = new FG.Match({ home, away, user: 0, quarterSec: s.settings.qtr * 60, level, autoSwitch: s.settings.autoSwitch, weather });
    GAME.match = m; GAME.info = { mode: opts.mode, opp, mult, kits }; GAME.paused = false; GAME.done = false; GAME.acc = 0; GAME.replay = null;
    REC.on = false; REC.want = false; REC.done = true; REC.frames.length = 0;
    if (GX.resetCheck) GX.resetCheck();
    GAME.info.weather = weather;
    GX.setupMatch(m, kits, [me.name, opp.name], weather);
    $('#app').hidden = true; $('#veil').classList.add('off');
    $('#overlay').hidden = true; $('#overlay').innerHTML = ''; $('#overlay').className = 'overlay';
    UI.hudStart(m, kits);
    IN.reset(); IN.active = true;
    A.unlock(); A.crowdStart();
    GAME.hold = true;
    UI.coinToss(m, (won) => {
      if (GAME.match !== m) return;
      if (!won) m.setFirstPoss(1);
      GAME.hold = false; GAME.last = performance.now(); GAME.acc = 0;
      if (GX.cam) GX.cam.intro = 1;
      UI.banner(me.name + ' vs ' + opp.name, (opts.mode === 'division' ? 'Division ' + s.division : 'Exhibition') + (weather === 'snow' ? ' · Snow game: players slip a little' : weather === 'rain' ? ' · Rain game: the ball is slippery' : ' · Clear night'), 2600);
      C.startGame(m, weather);
    });
  };

  GAME.callPlay = function (id) {
    const m = GAME.match;
    if (!m || GAME.paused) return;
    if (m.choose(id)) UI.hidePlaycall();
  };

  function drain(m) {
    for (const e of m.events) {
      GX.onEvent(e, m);
      try { C.handle(e, m); } catch (err) { console.warn(err); }
      const d = e.data;
      switch (e.type) {
        case 'call': if (d.side) UI.showPlaycall(m); break;
        case 'autocall': if (d.side === (m.userOnOffense() ? 'O' : 'D')) { UI.hidePlaycall(); const pl = d.side === 'O' ? m.call.off : m.call.def; UI.banner('Coach called it', pl ? pl.name : '', 1500); } break;
        case 'lineup': UI.hidePlaycall(); if (m.userOnOffense()) GX.showRoutes(m.routePreview()); else GX.clearRoutes(); break;
        case 'hot': GX.showRoutes(m.routePreview()); break;
        case 'flag': A.whistle(false); break;
        case 'snap': A.hike(); A.crowdLevel(0.55); UI.clearResult(); UI.hideHot(); recStart(m); break;
        case 'throw': A.throw(); break;
        case 'catch': A.catchPop(); if (d.contested) A.ooh(); break;
        case 'drop': case 'breakup': A.ooh(); break;
        case 'tackle': A.hit(d.big); A.whistle(false); A.crowdLevel(0.3); if (d.big) { UI.banner('Big hit!', d.name, 1300); REC.want = true; } break;
        case 'engage': break;
        case 'move': A.click(); break;
        case 'broken': A.hit(false); break;
        case 'kick': A.boot(); break;
        case 'int': REC.want = true; A.ooh(); UI.bigFx('Intercepted!', d.name, d.user); if (d.user) A.cheer(); break;
        case 'td': REC.want = true; if (d.user) A.cheer(); else A.groan(); A.horn(); UI.bigFx(d.pick ? 'Pick six!' : 'Touchdown!', d.name, d.user); break;
        case 'xp': UI.banner(d.good ? 'Extra point is good' : 'Extra point missed', m.teams[0].short + ' ' + m.score[0] + ' – ' + m.score[1] + ' ' + m.teams[1].short, 1700); break;
        case 'fg': if (d.good) { if (d.user) A.cheer(); else A.groan(); } else A.ooh(); UI.bigFx(d.good ? "It's good!" : 'No good', d.dist + '-yard field goal', d.good === d.user); break;
        case 'safety': UI.bigFx('Safety!', '2 points', d.user); break;
        case 'firstdown': if (d.user) A.crowdLevel(0.7); break;
        case 'result': if (d.gain >= 20) REC.want = true; if (m.state === 'dead' && e.data.kind !== 'fg') UI.resultLine(d); if (d.kind === 'incomplete' || d.kind === 'out') A.whistle(false); break;
        case 'banner': UI.banner(d.text, d.sub, (d.hold || 1.5) * 1000); if (d.text === 'Halftime') A.whistle(true); break;
        case 'final': A.whistle(true); A.horn(); UI.banner('Final', m.teams[0].short + ' ' + m.score[0] + ' – ' + m.score[1] + ' ' + m.teams[1].short, 2400); setTimeout(() => finish(m), 2400); break;
      }
    }
    m.events.length = 0;
  }

  function finish(m) {
    if (GAME.match !== m || GAME.done) return;
    GAME.done = true;
    const s = SV.data, info = GAME.info;
    const pf = m.score[0], pa = m.score[1], tds = m.stats[0].tds;
    const reward = UI.calcReward(pf, pa, tds, info.mult);
    const divisionBefore = s.division;
    let pts = 0, promoted = null;
    s.stats.played++; s.stats.pf += pf; s.stats.pa += pa; s.stats.tds = (s.stats.tds || 0) + tds; s.stats[reward.res]++;
    s.coins += reward.total;
    if (info.mode === 'division') {
      pts = reward.res === 'w' ? 3 : reward.res === 'd' ? 1 : 0;
      s.divPts += pts;
      if (s.divPts >= D.DIVISIONS[s.division].ptsToPromote) {
        s.divPts = 0;
        if (s.division > 1) {
          s.division--;
          const pack = D.DIVISIONS[s.division].reward, bonus = 500 * (11 - s.division);
          s.coins += bonus; s.packs[pack] = (s.packs[pack] || 0) + 1;
          promoted = { title: 'Promoted to Division ' + s.division, text: D.PACK_BY_ID[pack].name + ' and ' + U.fmt(bonus) + ' bonus coins added' };
        } else {
          s.packs.legend = (s.packs.legend || 0) + 1; s.coins += 5000;
          promoted = { title: 'Division 1 champions', text: 'Legend Pack and 5,000 bonus coins added' };
        }
      }
    }
    s.market.seed++;
    SV.commit();
    IN.active = false;
    UI.showResult({ mode: info.mode, divisionBefore, score: m.score, scoring: m.scoring, stats: m.stats, reward, pts, promoted, opp: info.opp });
    if (reward.res === 'w') A.cheer();
  }

  /* ---------- instant replay ---------- */
  function recStart(m) { REC.players = m.field.slice(); REC.frames.length = 0; REC.want = false; REC.done = false; REC.on = true; REC.k = 0; }
  function recFrame(m) {
    if (!REC.on || !REC.players) return;
    if (m.state !== 'live' && (m.stateT > 0.9 || (m.state !== 'dead' && m.state !== 'score'))) { REC.on = false; return; }
    if ((REC.k++ & 1) === 1) return;
    const b = m.ball, P = REC.players;
    REC.frames.push({ p: P.map((p) => [p.x, p.z, p.vx, p.vz, p.dir, p.act, p.actT, p.actDur, p.mood, p.stance, p.kneel, p.job, p.engBy.length || p.eng ? 1 : 0, p.dvx, p.dvz]), b: [b.x, b.y, b.z, b.state, b.holder ? P.indexOf(b.holder) : -1] });
    if (REC.frames.length > 240) REC.frames.shift();
  }
  function startReplay(m) {
    REC.done = true; REC.on = false;
    const fr = REC.frames, start = Math.max(0, fr.length - 150);
    if (fr.length - start < 20) return;
    GAME.replay = { m, frames: fr.slice(start), t: 0, speed: 0.55, saved: m.everyone.map((p) => Object.assign({}, p)), ball: Object.assign({}, m.ball), players: REC.players };
    GAME.skipReplay = false;
    UI.replayStart(); GX.replayStart(m.offT().dir);
    C.line('replay', {}, 1);
    stepReplay(0);
  }
  function stepReplay(dt) {
    const R = GAME.replay, m = R.m;
    R.t += dt * R.speed * 30;
    const n = R.frames.length;
    if (R.t >= n - 1) { endReplay(); return; }
    const i = Math.floor(R.t), u = R.t - i, F0 = R.frames[i], F1 = R.frames[i + 1];
    R.players.forEach((p, k) => {
      const a = F0.p[k], b = F1.p[k];
      p.x = a[0] + (b[0] - a[0]) * u; p.z = a[1] + (b[1] - a[1]) * u; p.vx = a[2]; p.vz = a[3];
      p.dir = a[4] + U.angDiff(b[4], a[4]) * u;
      p.act = a[5]; p.actT = a[6] + (b[5] === a[5] ? (b[6] - a[6]) * u : 0); p.actDur = a[7];
      p.mood = a[8]; p.stance = a[9]; p.kneel = a[10]; p.job = a[11]; p.engBy = a[12] ? [p] : []; p.eng = null; p.dvx = a[13]; p.dvz = a[14];
      p.onField = true;
    });
    const bb = m.ball, a = F0.b, b = F1.b;
    bb.x = a[0] + (b[0] - a[0]) * u; bb.y = a[1] + (b[1] - a[1]) * u; bb.z = a[2] + (b[2] - a[2]) * u;
    bb.state = a[3] === 'air' || a[3] === 'snap' ? 'replay' : a[3];
    bb.holder = a[4] >= 0 ? R.players[a[4]] : null; bb.fl = null; bb.snap = null;
    GX.replayFocus(bb.x, bb.z);
  }
  function endReplay() {
    const R = GAME.replay;
    if (!R) return;
    GAME.replay = null;
    R.m.everyone.forEach((p, k) => Object.assign(p, R.saved[k]));
    Object.assign(R.m.ball, R.ball);
    UI.replayEnd(); GX.replayEnd();
    GAME.last = performance.now(); GAME.acc = 0;
  }

  GAME.leave = function () {
    if (GAME.replay) { GAME.replay = null; UI.replayEnd(); GX.replayEnd(); }
    C.stop();
    GAME.match = null; GAME.paused = false; GAME.hold = false;
    GX.clearMatch(); UI.hudStop(); A.crowdStop(); IN.active = false; IN.reset();
    const o = $('#overlay'); o.hidden = true; o.innerHTML = ''; o.className = 'overlay';
    $('#app').hidden = false; $('#veil').classList.remove('off'); $('#fade').style.opacity = 0;
    UI.show('home'); UI.refreshTop(true);
  };
  GAME.pause = function () {
    if (!GAME.match || GAME.done || GAME.paused || GAME.hold) return;
    GAME.paused = true; IN.reset(); UI.pauseMenu();
  };
  GAME.resume = function () {
    if (!GAME.match) return;
    const o = $('#overlay'); o.hidden = true; o.innerHTML = ''; o.className = 'overlay';
    GAME.paused = false; IN.reset(); GAME.last = performance.now();
  };
  GAME.modalClosed = function () { if (GAME.match && GAME.paused && !GAME.done) UI.pauseMenu(); };
  GAME.quit = function () { GAME.done = true; GAME.leave(); UI.toast('Game forfeited. No coins this time.', 'warn'); };

  let reported = false;
  function reportOnce(e) { if (reported) return; reported = true; UI.toast('Something went wrong: ' + (e && e.message || e), 'warn'); }
  function frame(t) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (t - GAME.last) / 1000 || 0));
    GAME.last = t; GAME.frame++;
    const m = GAME.match;
    if (m) {
      try { IN.poll(); } catch (e) { console.error(e); }
      let rdt = GAME.paused ? 0 : dt;
      if (GAME.replay && !GAME.paused) {
        const S = IN.state;
        if (S.a.pressed || S.b.pressed || S.c.pressed || GAME.skipReplay) { GAME.skipReplay = false; endReplay(); }
        else { try { stepReplay(dt); } catch (e) { console.error(e); endReplay(); } rdt = dt * 0.55; }
        IN.consume();
      } else if (!GAME.paused && !GAME.hold) {
        GAME.acc += dt;
        let n = 0;
        while (GAME.acc >= STEP && n < 4) {
          m.basis = GX.basis;
          try { m.step(STEP, IN.state); } catch (e) { console.error(e); reportOnce(e); }
          IN.consume();
          GAME.acc -= STEP; n++;
          try { drain(m); } catch (e) { console.error(e); reportOnce(e); }
          recFrame(m);
        }
        if (n === 4) GAME.acc = 0;
        if (REC.want && !REC.done && GAME.match === m && ((m.state === 'dead' && m.stateT > 1.05) || (m.state === 'score' && m.stateT > 3.9))) startReplay(m);
      } else IN.consume();
      try { GX.render(rdt, m); } catch (e) { console.error(e); reportOnce(e); }
      try { UI.hudUpdate(); } catch (e) { console.error(e); reportOnce(e); }
      $('#fade').style.opacity = m.fade.toFixed(2);
    } else if (GX.ready && !document.hidden && GAME.frame % 2 === 0 && !$('#overlay').classList.contains('po')) {
      GX.render(dt * 2, null);
    }
  }

  function boot() {
    SV.load();
    A.setOn(SV.data.settings.sound);
    UI.buildNav();
    UI.shownCoins = SV.data.coins;
    UI.show('home');
    IN.bindTouch($('#stickZone'), $('#stick'), $('#knob'), { a: $('#tbA'), b: $('#tbB'), c: $('#tbC') });
    IN.onPause = () => { if (GAME.match && !GAME.done) { if (GAME.paused) GAME.resume(); else GAME.pause(); } };
    IN.onDigit = (n) => {
      const m = GAME.match;
      if (!m || GAME.paused || GAME.hold) return false;
      if (m.state === 'call') {
        const id = UI.callByIndex(n - 1);
        if (id) { A.click(); GAME.callPlay(id); }
        return true;
      }
      if (m.state === 'presnap' && m.userOnOffense() && m.play && m.play.type === 'pass' && !m.play.special) { UI.hotDigit(n); return true; }
      return false;
    };
    IN.onThrow = (i, bullet) => {
      const m = GAME.match;
      if (m && m.state === 'live' && m.ctrl && m.ctrl.job === 'qb' && !m.passed) UI.throwFx(i, bullet);
    };
    C.setOn(SV.data.settings.voice !== false);
    C.onCaption = (t) => UI.caption(t);
    document.addEventListener('pointerdown', () => { if (GAME.replay) GAME.skipReplay = true; });
    GX.onSafe = (level, gaveUp) => {
      SV.data.settings.gfxSafe = level; SV.commit();
      if (!gaveUp) { UI.toast(['', 'Turned off the glow effect so the game shows up on this device', 'Turned off reflections and shadows so the game shows up', 'Switched to the simplest graphics so the game shows up'][level]); return; }
      UI.graphicsTrouble();
    };
    GX.onLost = () => {
      SV.data.settings.gfxSafe = 3; SV.data.settings.quality = 0; SV.commit();
      UI.graphicsLost();
    };
    const no3d = () => {
      document.body.classList.add('no3d');
      UI.toast('3D graphics could not start on this device. The menus still work.', 'warn');
    };
    let triedCdn = false;
    const start3d = () => {
      if (GX.ready || GX.failed) return;
      if (!window.THREE) {
        if (triedCdn) { GX.failed = true; no3d(); return; }
        triedCdn = true;
        const sc = document.createElement('script');
        sc.src = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
        sc.onload = start3d; sc.onerror = () => { GX.failed = true; no3d(); };
        document.head.appendChild(sc);
        return;
      }
      let ok = false;
      try { ok = GX.init($('#gl'), SV.data.settings.quality, SV.data.settings.gfxSafe || 0); } catch (e) { console.error(e); GX.failed = true; ok = false; }
      if (ok) $('#gl').classList.add('on'); else no3d();
    };
    let started = false;
    const go = () => { if (!started) { started = true; start3d(); } };
    const waitFonts = () => { if (document.fonts && document.fonts.load) document.fonts.load('900 40px "Big Shoulders Display"').then(go, go); else go(); };
    if (document.readyState === 'complete') setTimeout(waitFonts, 50); else window.addEventListener('load', () => setTimeout(waitFonts, 50));
    setTimeout(go, 1500);
    window.addEventListener('resize', () => GX.resize());
    if (window.ResizeObserver) new ResizeObserver(() => GX.resize()).observe(document.body);
    document.addEventListener('visibilitychange', () => { if (document.hidden) GAME.pause(); });
    if (!SV.data.onboarded) UI.onboard();
    SV.onCloudLoad = () => {
      if (GAME.match) return;
      const o = $('#overlay');
      if (SV.data.onboarded && !o.classList.contains('po')) { o.hidden = true; o.innerHTML = ''; o.className = 'overlay'; }
      UI.shownCoins = SV.data.coins; A.setOn(SV.data.settings.sound); UI.show('home');
    };
    SV.initCloud();
    requestAnimationFrame(frame);
    window.FG_BOOTED = true;
    const bt = $('#boot');
    if (bt) { bt.classList.add('done'); setTimeout(() => bt.remove(), 600); }
    let lastErr = 0;
    window.addEventListener('error', (e) => {
      if (performance.now() - lastErr < 4000) return;
      lastErr = performance.now();
      UI.toast('Something went wrong: ' + (e.message || 'unknown error'), 'warn');
    });
  }

  GAME.rec = REC;
  FG.game = GAME;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
