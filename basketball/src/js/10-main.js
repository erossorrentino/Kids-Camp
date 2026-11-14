'use strict';
/* ============================================================
   Boot and main loop: fixed 60 Hz simulation, interpolated
   rendering, menus running over a live CPU game.
   ============================================================ */

let lastT = 0, acc = 0, errCount = 0;

function frame(t) {
  requestAnimationFrame(frame);
  const rdt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 1 / 60;
  lastT = t;
  try { tick(rdt); } catch (err) { if (errCount++ < 3) console.error(err); }
}
function tick(rdt) {
  const inp = pollInput();
  if (APP.screen) menuInput(inp);
  else if (APP.running && inp.pPause) pauseGame();
  const simOn = APP.mode === 'attract' ? true : APP.running && !APP.paused && !APP.screen && !(R.show > 0);
  if (simOn && APP.running) {
    const w = stickToWorld(inp.sx, inp.sy), I = G.input;
    I.mx = w.x; I.mz = w.z; I.sprint = inp.sprint; I.shoot = inp.shoot;
    I.pShoot = I.pShoot || inp.pShoot; I.pPass = I.pPass || inp.pPass; I.pMove = I.pMove || inp.pMove; I.pAlt = I.pAlt || inp.pAlt;
  }
  let scale = 1;
  if (R.slowmo > 0) { R.slowmo -= rdt; scale = 0.3; }
  if (simOn && G.state !== 'none') {
    acc += rdt * scale;
    let n = 0;
    while (acc >= DT && n < 8) { snapshotPrev(); stepGame(DT); handleEvents(); acc -= DT; n++; }
    if (n === 8) acc = 0;
    R.alpha = clamp(acc / DT, 0, 1);
  }
  if (APP.running && APP.finalT > 0 && !APP.paused && !APP.screen) {
    APP.finalT -= rdt;
    if (APP.finalT <= 0 && !APP.shownFinal) { APP.shownFinal = true; if (APP.mode === 'threept') showTPResult(); else showBox('final'); }
  }
  if (APP.mode === 'attract' && G.state === 'final') {
    APP.attractT = (APP.attractT || 0) + rdt;
    if (APP.attractT > 5) { APP.attractT = 0; startAttract(); }
  }
  autoQuality(rdt);
  updateHUD(rdt);
  crowdUpdate(rdt);
  renderFrame(simOn ? rdt * scale : 0, rdt);
}

/* Auto graphics: watch the frame rate for a few seconds and step down a tier if it can't keep up */
const AQ = { t: 0, n: 0, checks: 0 };
function autoQuality(rdt) {
  if (SET.quality !== 'auto' || AQ.checks >= 2 || /[?&]q=/.test(location.search)) return;
  AQ.t += rdt; AQ.n++;
  if (AQ.t < 1.5) { AQ.n = 0; return; }
  if (AQ.t > 5) {
    const fps = AQ.n / (AQ.t - 1.5);
    AQ.t = 0; AQ.n = 0; AQ.checks++;
    if (fps < 42) setQuality(R.quality === 'high' ? 'medium' : 'low');
    else AQ.checks = 2;
  }
}
function unlockAudio() {
  const first = !AU.on;
  audioInit();
  if (first && AU.on) {
    applySettings();
    if (APP.mode === 'attract') { AU.sfx.gain.value = AU.vol.sfx * 0.3; musicStart(); crowdBase(0.06); }
  }
}

async function boot() {
  const bootEl = document.getElementById('boot');
  if (!window.THREE) {
    bootEl.innerHTML = '<div class="err">The 3D engine could not load. Check your connection and reload the page.</div>';
    return;
  }
  APP.isTouch = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
  if (APP.isTouch) IN.device = 'touch';
  inputInit();
  try {
    await Promise.race([
      Promise.all([document.fonts.load('800 40px "Barlow Condensed"'), document.fonts.load('900 40px "Barlow Condensed"'), document.fonts.load('700 40px "Barlow Condensed"')]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch (e) { /* fall back to system fonts */ }
  try {
    let q = 'high';
    try { const s = JSON.parse(localStorage.getItem('hk-settings') || '{}'); if (s.quality && s.quality !== 'auto') q = s.quality; } catch (e) { /* ignore */ }
    const m = location.search.match(/[?&]q=(high|medium|low)/); if (m) q = m[1];
    initRender(document.getElementById('gl'), q);
  } catch (e) {
    bootEl.innerHTML = '<div class="err">WebGL is not available in this browser, so the arena cannot be drawn. Try a current version of Chrome, Edge, Firefox or Safari.</div>';
    console.error(e);
    return;
  }
  loadSettings();
  touchInit(document.getElementById('touch'));
  wireScreens();
  startAttract();
  bootEl.remove();
  showScreen('home');
  addEventListener('resize', resizeRender);
  addEventListener('pointerdown', unlockAudio);
  addEventListener('keydown', unlockAudio);
  document.addEventListener('visibilitychange', () => { if (document.hidden && APP.running && !APP.paused && !APP.screen) pauseGame(); });
  requestAnimationFrame(frame);
}
boot();
