/* Gridiron Kings — boot, main loop and game flow. */
(function () {
  'use strict';
  const FG = window.FG;
  const U = FG.util, D = FG.data, UI = FG.ui, A = FG.audio, SV = FG.save, GX = FG.gfx, IN = FG.input;
  const $ = (s) => document.querySelector(s);
  const STEP = 1 / 60;
  const GAME = { match: null, paused: false, done: false, acc: 0, last: 0, info: null, frame: 0 };

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
    const m = new FG.Match({ home, away, user: 0, quarterSec: s.settings.qtr * 60, level, autoSwitch: s.settings.autoSwitch });
    GAME.match = m; GAME.info = { mode: opts.mode, opp, mult, kits }; GAME.paused = false; GAME.done = false; GAME.acc = 0;
    const wr = Math.random();
    const weather = opts.weather || (wr < 0.6 ? 'clear' : wr < 0.82 ? 'snow' : 'rain');
    GAME.info.weather = weather;
    GX.setupMatch(m, kits, [me.name, opp.name], weather);
    $('#app').hidden = true; $('#veil').classList.add('off');
    $('#overlay').hidden = true; $('#overlay').innerHTML = ''; $('#overlay').className = 'overlay';
    UI.hudStart(m, kits);
    IN.reset(); IN.active = true;
    A.unlock(); A.crowdStart();
    UI.banner(me.name + ' vs ' + opp.name, (opts.mode === 'division' ? 'Division ' + s.division : 'Exhibition') + (weather === 'snow' ? ' · Snow game' : weather === 'rain' ? ' · Rain game' : ' · Clear night'), 2600);
  };

  GAME.callPlay = function (id) {
    const m = GAME.match;
    if (!m || GAME.paused) return;
    if (m.choose(id)) UI.hidePlaycall();
  };

  function drain(m) {
    for (const e of m.events) {
      GX.onEvent(e, m);
      const d = e.data;
      switch (e.type) {
        case 'call': if (d.side) UI.showPlaycall(m); break;
        case 'lineup': UI.hidePlaycall(); if (m.userOnOffense()) GX.showRoutes(m.routePreview()); else GX.clearRoutes(); break;
        case 'snap': A.hike(); A.crowdLevel(0.55); UI.clearResult(); break;
        case 'throw': A.throw(); break;
        case 'catch': A.catchPop(); if (d.contested) A.ooh(); break;
        case 'drop': case 'breakup': A.ooh(); break;
        case 'tackle': A.hit(d.big); A.whistle(false); A.crowdLevel(0.3); if (d.big) UI.banner('Big hit!', d.name, 1300); break;
        case 'engage': break;
        case 'move': A.click(); break;
        case 'broken': A.hit(false); break;
        case 'kick': A.boot(); break;
        case 'int': A.ooh(); UI.bigFx('Intercepted!', d.name, d.user); if (d.user) A.cheer(); break;
        case 'td': if (d.user) A.cheer(); else A.groan(); A.horn(); UI.bigFx(d.pick ? 'Pick six!' : 'Touchdown!', d.name, d.user); break;
        case 'xp': UI.banner(d.good ? 'Extra point is good' : 'Extra point missed', m.teams[0].short + ' ' + m.score[0] + ' – ' + m.score[1] + ' ' + m.teams[1].short, 1700); break;
        case 'fg': if (d.good) { if (d.user) A.cheer(); else A.groan(); } else A.ooh(); UI.bigFx(d.good ? "It's good!" : 'No good', d.dist + '-yard field goal', d.good === d.user); break;
        case 'safety': UI.bigFx('Safety!', '2 points', d.user); break;
        case 'firstdown': if (d.user) A.crowdLevel(0.7); break;
        case 'result': if (m.state === 'dead' && e.data.kind !== 'fg') UI.resultLine(d); if (d.kind === 'incomplete' || d.kind === 'out') A.whistle(false); break;
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

  GAME.leave = function () {
    GAME.match = null; GAME.paused = false;
    GX.clearMatch(); UI.hudStop(); A.crowdStop(); IN.active = false; IN.reset();
    const o = $('#overlay'); o.hidden = true; o.innerHTML = ''; o.className = 'overlay';
    $('#app').hidden = false; $('#veil').classList.remove('off'); $('#fade').style.opacity = 0;
    UI.show('home'); UI.refreshTop(true);
  };
  GAME.pause = function () {
    if (!GAME.match || GAME.done || GAME.paused) return;
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
      if (!GAME.paused) {
        GAME.acc += dt;
        let n = 0;
        while (GAME.acc >= STEP && n < 4) {
          m.basis = GX.basis;
          try { m.step(STEP, IN.state); } catch (e) { console.error(e); reportOnce(e); }
          IN.consume();
          GAME.acc -= STEP; n++;
          try { drain(m); } catch (e) { console.error(e); reportOnce(e); }
        }
        if (n === 4) GAME.acc = 0;
      }
      GX.render(GAME.paused ? 0 : dt, m);
      UI.hudUpdate();
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
      if (!m || GAME.paused || m.state !== 'call') return false;
      const id = UI.callByIndex(n - 1);
      if (id) { A.click(); GAME.callPlay(id); }
      return true;
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
      try { ok = GX.init($('#gl'), SV.data.settings.quality); } catch (e) { console.error(e); GX.failed = true; ok = false; }
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

  FG.game = GAME;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
