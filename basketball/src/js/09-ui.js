'use strict';
/* ============================================================
   UI: menus, matchup picker, HUD, shot meter, box scores,
   and the event router that turns sim events into sound and
   on-screen feedback.
   ============================================================ */

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const APP = { screen: null, back: null, running: false, paused: false, mode: 'attract', focus: 0, finalT: 0, shownFinal: false,
  mu: { a: 0, b: 1, kind: 'play', shooter: 0 }, hudCache: {}, meterHold: 0, introT: 0, isTouch: false };
const SET = { quality: 'auto', camera: 'broadcast', difficulty: 'pro', qLen: 180, autoSwitch: true, meter: true, voice: false, master: 80, crowd: 80, music: 50, touch: 'auto', side: 'home' };
const OPTS = {
  camera: [['broadcast', 'Broadcast'], ['close', 'Close'], ['sky', 'Skycam']],
  difficulty: [['rookie', 'Rookie'], ['pro', 'Pro'], ['allstar', 'All-Star'], ['legend', 'Legend']],
  qLen: [[120, '2 min'], [180, '3 min'], [300, '5 min'], [480, '8 min'], [720, '12 min']],
  autoSwitch: [[true, 'On'], [false, 'Off']], meter: [[true, 'On'], [false, 'Off']], voice: [[false, 'Off'], [true, 'On']],
  master: [[0, '0'], [20, '20'], [40, '40'], [60, '60'], [80, '80'], [100, '100']],
  crowd: [[0, '0'], [20, '20'], [40, '40'], [60, '60'], [80, '80'], [100, '100']],
  music: [[0, '0'], [20, '20'], [40, '40'], [60, '60'], [80, '80'], [100, '100']],
  touch: [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']],
  quality: [['auto', 'Auto'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']],
  side: [['home', 'Home'], ['away', 'Away']],
};
const SET_LABELS = { quality: 'Graphics', camera: 'Camera', difficulty: 'Difficulty', qLen: 'Quarter length', autoSwitch: 'Auto-switch on defense', meter: 'Shot meter', voice: 'Announcer voice', master: 'Master volume', crowd: 'Crowd volume', music: 'Menu music', touch: 'Touch controls', side: 'Your court' };

function loadSettings() {
  try { const s = JSON.parse(localStorage.getItem('hk-settings') || '{}'); for (const k in SET) if (k in s) SET[k] = s[k]; } catch (e) { /* storage unavailable */ }
  try { const m = JSON.parse(localStorage.getItem('hk-matchup') || 'null'); if (m) { APP.mu.a = m.a | 0; APP.mu.b = m.b | 0; } } catch (e) { /* ignore */ }
  APP.mu.a = ((APP.mu.a % 8) + 8) % 8; APP.mu.b = ((APP.mu.b % 8) + 8) % 8;
  if (APP.mu.a === APP.mu.b) APP.mu.b = (APP.mu.a + 1) % 8;
  applySettings();
}
function saveSettings() {
  try { localStorage.setItem('hk-settings', JSON.stringify(SET)); localStorage.setItem('hk-matchup', JSON.stringify({ a: APP.mu.a, b: APP.mu.b })); } catch (e) { /* ignore */ }
}
function applySettings() {
  R.camMode = SET.camera;
  if (R.r && SET.quality !== 'auto' && R.quality !== SET.quality) setQuality(SET.quality);
  AU.vol.master = SET.master / 100; AU.vol.crowd = SET.crowd / 100; AU.vol.music = SET.music / 100;
  VOICE.on = !!SET.voice;
  if (G.state !== 'none') G.autoSwitch = SET.autoSwitch;
  setVolumes();
}
function cycle(key, dir) {
  const o = OPTS[key];
  let i = o.findIndex((e) => e[0] === SET[key]);
  i = (i + dir + o.length) % o.length;
  SET[key] = o[i][0];
  applySettings(); saveSettings();
}
function optLabel(key) { const e = OPTS[key].find((x) => x[0] === SET[key]); return e ? e[1] : String(SET[key]); }

/* ---------------- screens & navigation ---------------- */
function showScreen(id, back) {
  $$('.screen').forEach((s) => s.classList.remove('on'));
  APP.screen = id; APP.back = back || null; APP.focus = 0;
  if (!id) return;
  const el = $('#' + id);
  if (id === 'matchup') renderMatchup();
  if (id === 'settings') renderSettings();
  el.classList.add('on');
  focusables().forEach((f) => f.classList.remove('sel'));
  setFocus(id === 'matchup' ? focusables().indexOf($('#muStart')) : 0);
}
function focusables() {
  if (!APP.screen) return [];
  const el = $('#' + APP.screen);
  return $$('.tcard[data-nav], .item, .opt, .btn', el).filter((e) => e.offsetParent !== null);
}
function setFocus(i) {
  const f = focusables();
  if (!f.length) return;
  APP.focus = (i + f.length) % f.length;
  f.forEach((e, j) => e.classList.toggle('sel', j === APP.focus));
}
function menuInput(inp) {
  const f = focusables();
  if (!f.length) return;
  const cur = f[APP.focus];
  if (inp.mUp) { setFocus(APP.focus - 1); SFX.ui('move'); }
  if (inp.mDown) { setFocus(APP.focus + 1); SFX.ui('move'); }
  if (inp.mLeft || inp.mRight) {
    const d = inp.mRight ? 1 : -1;
    if (cur && cur.dataset.key) { cycleOpt(cur.dataset.key, d); SFX.ui('move'); }
    else if (cur && cur.dataset.team) { cycleTeam(cur.dataset.team, d); SFX.ui('move'); }
    else if (cur && cur.classList.contains('btn')) { setFocus(APP.focus + d); SFX.ui('move'); }
  }
  if (inp.mOk && cur) activate(cur);
  if (inp.mBack) goBack();
}
function goBack() {
  SFX.ui('back');
  if (APP.screen === 'pause') { resumeGame(); return; }
  if (APP.back) { const b = APP.back; showScreen(b, b === 'pause' ? null : b === 'home' ? null : 'home'); return; }
  if (APP.screen && APP.screen !== 'home' && !APP.running) showScreen('home');
}
function activate(el) {
  if (el.dataset.key) { cycleOpt(el.dataset.key, 1); SFX.ui('move'); return; }
  if (el.dataset.team) { cycleTeam(el.dataset.team, 1); SFX.ui('move'); return; }
  const a = el.dataset.act;
  if (!a) return;
  SFX.ui('ok');
  switch (a) {
    case 'play': APP.mu.kind = 'play'; showScreen('matchup', 'home'); break;
    case 'watch': APP.mu.kind = 'watch'; showScreen('matchup', 'home'); break;
    case 'threept': APP.mu.kind = 'threept'; APP.mu.shooter = bestShooter(TEAMS[APP.mu.a]); showScreen('matchup', 'home'); break;
    case 'howto': showScreen('howto', APP.screen === 'pause' ? 'pause' : 'home'); break;
    case 'settings': showScreen('settings', APP.screen === 'pause' ? 'pause' : 'home'); break;
    case 'back': goBack(); break;
    case 'start': startFromMatchup(); break;
    case 'resume': resumeGame(); break;
    case 'box': showBox('pause'); break;
    case 'restart': restartGame(); break;
    case 'quit': quitToMenu(); break;
    case 'continue': showScreen(null); APP.paused = false; resumeHalftime(); break;
    case 'again': restartGame(); break;
    case 'menu': quitToMenu(); break;
    case 'boxback': showScreen('pause'); break;
  }
}
function wireScreens() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('.item, .opt, .btn, .tcard[data-nav], .arrow');
    if (!el || !APP.screen) return;
    if (el.classList.contains('arrow')) { cycleTeam(el.dataset.team, +el.dataset.d); SFX.ui('move'); e.stopPropagation(); return; }
    const f = focusables(), i = f.indexOf(el);
    if (i >= 0) setFocus(i);
    if (el.classList.contains('opt') && el.dataset.key) {
      const r = el.getBoundingClientRect();
      cycleOpt(el.dataset.key, e.clientX < r.left + r.width * 0.35 ? -1 : 1); SFX.ui('move'); return;
    }
    activate(el);
  });
  document.addEventListener('mousemove', (e) => {
    const el = e.target.closest && e.target.closest('.item, .btn');
    if (!el || !APP.screen) return;
    const i = focusables().indexOf(el);
    if (i >= 0 && i !== APP.focus) setFocus(i);
  });
  $('#tPause').addEventListener('click', () => { if (APP.running && !APP.paused) pauseGame(); });
}

/* ---------------- matchup ---------------- */
function bestShooter(T) { let bi = 0; T.roster.forEach((p, i) => { if (p.tpt > T.roster[bi].tpt) bi = i; }); return bi; }
function teamCard(T, label, which) {
  const r = T.rt;
  const bar = (k, v) => `<div class="rt"><span>${k}</span><span class="bar"><i style="width:${clamp((v - 60) / 39, 0.05, 1) * 100}%"></i></span><b>${v}</b></div>`;
  const roster = T.roster.map((p) => `<div><span class="pos">${p.pos}</span><span>${p.n}</span><span class="ov">${p.ovr}</span></div>`).join('');
  return `<div class="band" data-id="${T.id}" style="background:linear-gradient(120deg, ${T.c1} 0%, ${shade(T.c1, -0.35)} 70%, ${T.c2} 100%)">
      <div class="arrows"><button class="arrow" data-team="${which}" data-d="-1" aria-label="Previous team">‹</button><button class="arrow" data-team="${which}" data-d="1" aria-label="Next team">›</button></div>
      <div class="side">${label}</div><div class="city">${T.city}</div><div class="name">${T.name}</div><div class="style">${T.style}</div></div>
    <div class="body">${bar('OVR', r.ovr)}${bar('OFF', r.off)}${bar('DEF', r.def)}<div class="roster">${roster}</div></div>`;
}
function renderMatchup() {
  const k = APP.mu.kind, A = TEAMS[APP.mu.a], B = TEAMS[APP.mu.b];
  $('#muEyebrow').textContent = k === 'threept' ? 'All-Star Saturday' : k === 'watch' ? 'Spectator mode' : 'Exhibition';
  $('#muTitle').textContent = k === 'threept' ? 'Pick your shooter' : k === 'watch' ? 'Pick the matchup' : 'Choose your matchup';
  const ca = $('#cardA'), cb = $('#cardB');
  ca.innerHTML = teamCard(A, k === 'watch' ? 'Home' : k === 'threept' ? 'Team' : 'You', 'a');
  ca.dataset.nav = '1'; ca.dataset.team = 'a';
  cb.style.display = k === 'threept' ? 'none' : ''; $('.vs').style.display = k === 'threept' ? 'none' : '';
  if (k !== 'threept') { cb.innerHTML = teamCard(B, k === 'watch' ? 'Away' : 'CPU', 'b'); cb.dataset.nav = '1'; cb.dataset.team = 'b'; }
  else { delete cb.dataset.nav; }
  const opts = k === 'threept' ? ['shooter', 'camera'] : k === 'watch' ? ['qLen', 'camera'] : ['difficulty', 'qLen', 'side', 'camera'];
  $('#muOpts').innerHTML = opts.map((o) => {
    if (o === 'shooter') { const p = A.roster[APP.mu.shooter]; return `<button class="opt" data-key="shooter"><span class="l">Shooter</span><span class="v">${p.n} · ${p.tpt}</span></button>`; }
    return `<button class="opt" data-key="${o}"><span class="l">${SET_LABELS[o]}</span><span class="v">${optLabel(o)}</span></button>`;
  }).join('');
  $('#muStart').textContent = k === 'threept' ? 'Start round' : k === 'watch' ? 'Watch' : 'Tip off';
  setFocus(APP.focus);
}
function cycleTeam(which, d) {
  const mu = APP.mu;
  if (which === 'a') { do { mu.a = (mu.a + d + 8) % 8; } while (mu.kind !== 'threept' && mu.a === mu.b); mu.shooter = bestShooter(TEAMS[mu.a]); }
  else { do { mu.b = (mu.b + d + 8) % 8; } while (mu.b === mu.a); }
  saveSettings();
  const keep = APP.focus; renderMatchup(); setFocus(keep);
}
function cycleOpt(key, d) {
  if (key === 'shooter') { APP.mu.shooter = (APP.mu.shooter + d + 5) % 5; }
  else cycle(key, d);
  const keep = APP.focus;
  if (APP.screen === 'matchup') renderMatchup(); else if (APP.screen === 'settings') renderSettings();
  setFocus(keep);
}
function renderSettings() {
  const keys = ['quality', 'camera', 'difficulty', 'qLen', 'autoSwitch', 'meter', 'voice', 'master', 'crowd', 'music', 'touch'];
  $('#setList').innerHTML = keys.map((k) => `<button class="opt" data-key="${k}"><span class="l">${SET_LABELS[k]}</span><span class="v">${optLabel(k)}</span></button>`).join('');
  setFocus(APP.focus);
}

/* ---------------- game flow ---------------- */
function startFromMatchup() {
  const mu = APP.mu, k = mu.kind;
  saveSettings();
  if (k === 'threept') { startGame({ mode: 'threept', home: TEAMS[mu.a], away: TEAMS[(mu.a + 1) % 8], shooter: mu.shooter }); return; }
  const you = TEAMS[mu.a], cpu = TEAMS[mu.b];
  const homeIsYou = SET.side === 'home' || k === 'watch';
  startGame({ mode: k === 'watch' ? 'watch' : 'game', home: homeIsYou ? you : cpu, away: homeIsYou ? cpu : you, userTeam: k === 'watch' ? -1 : homeIsYou ? 0 : 1 });
}
function startGame(cfg) {
  APP.last = cfg;
  newGame({ mode: cfg.mode === 'threept' ? 'threept' : 'game', home: cfg.home, away: cfg.away, userTeam: cfg.userTeam == null ? 0 : cfg.userTeam,
    auto: cfg.mode === 'watch', difficulty: SET.difficulty, qLen: SET.qLen, autoSwitch: SET.autoSwitch, shooter: cfg.shooter });
  G.attract = false;
  buildPlayers(); R.snapCam = true; R.slowmo = 0;
  APP.running = true; APP.paused = false; APP.mode = cfg.mode; APP.shownFinal = false; APP.finalT = 0;
  showScreen(null);
  $('#hud').classList.add('on');
  $('#tphud').classList.toggle('on', cfg.mode === 'threept');
  $('#bug').style.display = cfg.mode === 'threept' ? 'none' : '';
  $('#ticker').innerHTML = '';
  musicStop(); crowdBase(0.13); if (AU.on) AU.sfx.gain.setTargetAtTime(AU.vol.sfx, now(), 0.1);
  if (cfg.mode !== 'threept') showIntro(cfg.home, cfg.away);
  else showIntroTP();
  drawRibbon(cfg.mode === 'threept' ? 'THREE-POINT CONTEST  •  HARDWOOD KINGS  •  ' : null);
}
function restartGame() { if (APP.last) startGame(APP.last); }
function quitToMenu() {
  APP.running = false; APP.paused = false;
  $('#hud').classList.remove('on');
  startAttract();
  showScreen('home');
}
function pauseGame() {
  if (!APP.running || APP.paused || G.state === 'final') return;
  APP.paused = true;
  $('#pauseInfo').textContent = APP.mode === 'threept' ? 'Three-point contest' : `${G.teams[0].def.id} ${G.teams[0].score} – ${G.teams[1].score} ${G.teams[1].def.id} · ${qLabel()} ${fmtClock(G.clock)}`;
  $$('#pause [data-act="box"]').forEach((b) => (b.style.display = APP.mode === 'threept' ? 'none' : ''));
  showScreen('pause');
  if (window.speechSynthesis) try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
}
function resumeGame() { showScreen(null); APP.paused = false; }
function startAttract() {
  const a = Math.floor(Math.random() * 8); let b = Math.floor(Math.random() * 7); if (b >= a) b++;
  newGame({ mode: 'game', home: TEAMS[a], away: TEAMS[b], userTeam: -1, auto: true, difficulty: 'allstar', qLen: 150, autoSwitch: true });
  G.attract = true; APP.mode = 'attract';
  buildPlayers(); R.snapCam = true; R.slowmo = 0;
  $('#hud').classList.remove('on');
  if (AU.on) { AU.sfx.gain.setTargetAtTime(AU.vol.sfx * 0.3, now(), 0.1); musicStart(); }
  crowdBase(0.06);
}

/* ---------------- HUD ---------------- */
function qLabel() { const q = G.quarter; return q <= 4 ? ['1ST', '2ND', '3RD', '4TH'][q - 1] : (q === 5 ? 'OT' : (q - 4) + 'OT'); }
function fmtClock(t) {
  t = Math.max(0, t);
  if (t < 60) return t.toFixed(1);
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}
function shortName(p) { const parts = p.d.n.split(' '); return parts.slice(1).join(' ') || parts[0]; }
function setTxt(el, v) { if (el.textContent !== v) el.textContent = v; }
function updateHUD(rdt) {
  if (!APP.running || G.state === 'none') return;
  const H = APP.hudCache;
  if (APP.mode === 'threept') { updateTPHud(); }
  else {
    const T0 = G.teams[0], T1 = G.teams[1];
    [[$('#bugA'), T1], [$('#bugB'), T0]].forEach(([el, T]) => {
      if (el.dataset.t !== T.def.id) {
        el.dataset.t = T.def.id;
        $('.sw', el).style.background = T.def.c1;
        $('.ab', el).textContent = T.def.id;
      }
      const sc = $('.sc', el), v = String(T.score);
      if (sc.textContent !== v) { sc.textContent = v; sc.classList.remove('flash'); void sc.offsetWidth; sc.classList.add('flash'); }
      setTxt($('.bonus', el), G.teams[1 - T.idx].fouls >= 5 ? 'BONUS' : '');
      el.classList.toggle('has', G.offense === T.idx && (G.state === 'live' || G.state === 'dead'));
    });
    setTxt($('#bugQ'), qLabel());
    setTxt($('#bugT'), fmtClock(G.clock));
    const s = Math.ceil(Math.max(0, G.shotClock));
    const sv = G.state === 'live' || G.state === 'dead' ? (G.shotClock > G.clock && G.clock < 24 ? '' : String(s)) : '';
    const se = $('#bugS'); setTxt(se, sv); se.classList.toggle('low', s <= 5);
  }
  // player tag
  const c = G.ctrl, show = c && G.userTeam >= 0 && !G.auto;
  $('#ptag').style.display = show && innerWidth > 760 ? '' : 'none';
  if (show) {
    if (H.pt !== c) {
      H.pt = c;
      $('#ptNum').textContent = c.d.num; $('#ptNum').style.background = c.team.def.c1;
      $('#ptName').textContent = c.d.n; $('#ptInfo').textContent = `${c.d.pos} · ${c.d.ovr} OVR · 3PT ${c.d.tpt} · DNK ${c.d.dnk}`;
    }
    $('#ptStam').style.width = c.stam.toFixed(0) + '%';
    $('#ptStam').style.background = c.stam < 25 ? 'var(--bad)' : c.stam < 55 ? 'var(--warn)' : 'var(--good)';
  }
  updateHint(c, show);
  updateMeter(rdt);
  // intro card
  if (APP.introT > 0) { APP.introT -= rdt; if (APP.introT <= 0) $('#intro').classList.remove('on'); }
  // touch controls
  const wantTouch = SET.touch === 'on' || (SET.touch === 'auto' && APP.isTouch && IN.device === 'touch');
  const tOn = wantTouch && APP.running && !APP.paused && !APP.screen && G.userTeam >= 0 && !G.auto;
  $('#touch').classList.toggle('on', tOn); IN.touch.on = tOn;
  $('#tPause').classList.toggle('on', APP.running && !APP.paused && !APP.screen && (APP.isTouch || SET.touch === 'on'));
  if (tOn) {
    const off = G.offense === G.userTeam, hb = c && c.hasBall;
    const lbl = { shoot: APP.mode === 'threept' || hb ? 'Shoot' : off ? 'Jump' : 'Block', pass: hb ? 'Pass' : 'Switch', move: hb ? 'Move' : off ? 'Move' : 'Steal', alt: hb ? 'Screen' : 'Switch' };
    for (const k in lbl) { const b = $(`#tBtns [data-btn="${k}"]`); if (b && b.textContent !== lbl[k]) b.textContent = lbl[k]; }
  }
}
function updateHint(c, show) {
  const el = $('#hint');
  if (!show || IN.device === 'touch') { if (el.style.display !== 'none') el.style.display = 'none'; return; }
  el.style.display = '';
  const pad = IN.device === 'pad';
  const K = pad ? { shoot: 'X', pass: 'A', move: 'B', alt: 'Y', sprint: 'RT' } : { shoot: 'Space', pass: 'E', move: 'Q', alt: 'R', sprint: 'Shift' };
  let items;
  if (APP.mode === 'threept') items = [[K.shoot, 'hold and release to shoot']];
  else if (G.state === 'ft' || G.state === 'ftcut') items = G.ft && G.ft.shooter === c ? [[K.shoot, 'hold and release for the free throw']] : [['', 'Free throw']];
  else if (c.hasBall) items = [[K.shoot, 'shoot'], [K.pass, 'pass'], [K.move, 'dribble move'], [K.alt, 'call screen'], [K.sprint, 'sprint']];
  else if (G.offense === c.team.idx) items = [[K.pass, 'switch player'], [K.shoot, 'jump'], [K.sprint, 'sprint']];
  else items = [[K.shoot, 'block · hold for hands up'], [K.move, 'steal'], [K.pass, 'switch'], [K.sprint, 'sprint']];
  const html = items.map(([k, t]) => (k ? `<span><kbd>${k}</kbd> ${t}</span>` : `<span>${t}</span>`)).join('');
  if (APP.hudCache.hint !== html) { APP.hudCache.hint = html; el.innerHTML = html; }
}
function updateMeter(rdt) {
  const m = $('#meter'), c = G.ctrl;
  const S = c && c.shot;
  const active = SET.meter && c && G.userTeam === c.team.idx && !G.auto && c.act === 'shoot' && S && S.timed && !S.released;
  if (active) {
    APP.meterHold = 0.7; APP.meterP = c;
    const full = S.ideal * 1.25;
    $('.fill', m).style.height = clamp(c.actT / full, 0, 1) * 100 + '%';
    const w = S.win / full * 100, ctr = S.ideal / full * 100;
    const win = $('.win', m); win.style.bottom = (ctr - w) + '%'; win.style.height = (2 * w) + '%';
    m.className = '';
  } else if (APP.meterHold > 0) APP.meterHold -= rdt;
  const vis = active || APP.meterHold > 0;
  m.style.display = vis ? 'block' : 'none';
  if (vis && APP.meterP) {
    const p = APP.meterP;
    const s = projectToScreen(p.x, p.y + p.hgt * 0.75, p.z);
    m.style.left = (s.x + 34) + 'px'; m.style.top = (s.y - 60) + 'px';
  }
}
function updateTPHud() {
  const tp = G.tp;
  if (!tp) return;
  setTxt($('#tpTime'), Math.max(0, tp.time).toFixed(1));
  setTxt($('#tpScore'), String(tp.score));
  let html = '';
  for (let r = 0; r < 5; r++) {
    html += '<span class="rk">';
    for (let i = 0; i < 5; i++) {
      const idx = r * 5 + i, v = tp.shots[idx];
      html += `<i class="${v == null ? '' : v > 0 ? (v === 2 ? 'mm' : 'm') : 'x'}"></i>`;
    }
    html += '</span>';
  }
  if (APP.hudCache.tp !== html) { APP.hudCache.tp = html; $('#tpRacks').innerHTML = html; }
}
function ticker(text) {
  const t = $('#ticker');
  const d = document.createElement('div'); d.textContent = text; t.appendChild(d);
  while (t.children.length > 3) t.removeChild(t.firstChild);
  setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 5200);
}
function banner(big, small) {
  const b = $('#banner');
  $('b', b).textContent = big; const s = $('span', b); s.textContent = small || ''; s.style.display = small ? '' : 'none';
  b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
}
function feedback(p, text, color, sub) {
  const f = $('#fb');
  const s = projectToScreen(p.x, p.y + p.hgt + 1.6, p.z);
  f.style.left = s.x + 'px'; f.style.top = s.y + 'px'; f.style.color = color;
  f.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
  f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
}
function showIntro(home, away) {
  $('#introEy').textContent = `${DIFFS[SET.difficulty].name} · ${SET.qLen / 60}-minute quarters`;
  $('#introTeams').innerHTML = `<div style="background:${away.c1}">${away.city} ${away.name}</div><span class="vs2">at</span><div style="background:${home.c1}">${home.city} ${home.name}</div>`;
  $('#intro').classList.add('on'); APP.introT = 2.6;
}
function showIntroTP() {
  const sh = G.tp.sh;
  $('#introEy').textContent = 'Three-point contest · 60 seconds';
  $('#introTeams').innerHTML = `<div style="background:${sh.team.def.c1}">${sh.d.n}</div>`;
  $('#intro').classList.add('on'); APP.introT = 1.8;
}

/* ---------------- box score ---------------- */
function boxRows(T) {
  const tot = mkStats();
  let rows = T.players.map((p) => {
    const s = p.st; for (const k in tot) tot[k] += s[k];
    return `<tr><td>${p.d.n} <span class="muted">${p.d.pos}</span></td><td>${s.pts}</td><td>${s.reb}</td><td>${s.ast}</td><td>${s.stl}</td><td>${s.blk}</td><td>${s.fgm}-${s.fga}</td><td>${s.tpm}-${s.tpa}</td><td>${s.ftm}-${s.fta}</td><td>${s.oreb}</td><td>${s.to}</td><td>${s.pf}</td></tr>`;
  }).join('');
  const pct = (m, a) => (a ? ' ' + Math.round(100 * m / a) + '%' : '');
  rows += `<tr class="tot"><td>Totals</td><td>${tot.pts}</td><td>${tot.reb}</td><td>${tot.ast}</td><td>${tot.stl}</td><td>${tot.blk}</td><td>${tot.fgm}-${tot.fga}${pct(tot.fgm, tot.fga)}</td><td>${tot.tpm}-${tot.tpa}${pct(tot.tpm, tot.tpa)}</td><td>${tot.ftm}-${tot.fta}</td><td>${tot.oreb}</td><td>${tot.to}</td><td>${tot.pf}</td></tr>`;
  return `<tr class="team"><td colspan="12">${T.def.city} ${T.def.name}</td></tr>` + rows;
}
function gameScore(p) { const s = p.st; return s.pts + s.reb * 1.1 + s.ast * 1.4 + s.stl * 2 + s.blk * 2 - s.to * 1.2 - (s.fga - s.fgm) * 0.4; }
function showBox(kind) {
  const T0 = G.teams[0], T1 = G.teams[1];
  const fin = kind === 'final', half = kind === 'half';
  $('#boxEyebrow').textContent = fin ? 'Final' : half ? 'Halftime' : `${qLabel()} quarter · ${fmtClock(G.clock)}`;
  const win = T0.score === T1.score ? -1 : T0.score > T1.score ? 0 : 1;
  $('#boxTitle').textContent = fin ? `${G.teams[win].def.name} win${G.quarter > 4 ? ' in overtime' : ''}` : half ? 'Halftime report' : 'Box score';
  $('#boxScore').innerHTML = [T1, T0].map((T) => `<div class="ts ${fin && win !== T.idx ? 'lose' : ''}"><span class="sw" style="background:${T.def.c1}"></span>${T.def.id} ${T.score}</div>`).join('');
  let best = null;
  const pool = fin ? G.teams[win].players : G.players;
  for (const p of pool) if (!best || gameScore(p) > gameScore(best)) best = p;
  const s = best.st;
  $('#boxPog').innerHTML = `<span class="eyebrow">${fin ? 'Player of the game' : 'Top performer'}</span><b>${best.d.n}</b><span class="muted">${best.team.def.id} · ${s.pts} PTS · ${s.reb} REB · ${s.ast} AST · ${s.fgm}/${s.fga} FG</span>`;
  $('#boxTable').innerHTML = `<thead><tr><th>Player</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>FG</th><th>3PT</th><th>FT</th><th>OREB</th><th>TO</th><th>PF</th></tr></thead><tbody>${boxRows(T1)}${boxRows(T0)}</tbody>`;
  $('#boxActions').innerHTML = fin ? '<button class="btn ghost" data-act="menu">Main menu</button><button class="btn" data-act="again">Rematch</button>'
    : half ? '<button class="btn" data-act="continue">Start 2nd half</button>' : '<button class="btn" data-act="boxback">Back</button>';
  $('#boxPog').style.display = '';
  $('#boxTable').parentNode.style.display = '';
  showScreen('boxscreen', kind === 'pause' ? 'pause' : null);
  setFocus(focusables().length - 1);
}
function showTPResult() {
  const tp = G.tp, sh = tp.sh;
  const rating = tp.score >= 27 ? 'Legendary' : tp.score >= 22 ? 'All-Star' : tp.score >= 17 ? 'Starter' : tp.score >= 12 ? 'Rotation' : 'Keep practicing';
  let best = 0; try { best = +(localStorage.getItem('hk-tp-best') || 0); if (tp.score > best) localStorage.setItem('hk-tp-best', String(tp.score)); } catch (e) { /* ignore */ }
  $('#boxEyebrow').textContent = 'Three-point contest';
  $('#boxTitle').textContent = `${tp.score} points`;
  $('#boxScore').innerHTML = `<div class="ts"><span class="sw" style="background:${sh.team.def.c1}"></span>${sh.d.n}</div>`;
  const made = tp.shots.filter((v) => v > 0).length, taken = tp.shots.filter((v) => v != null).length;
  $('#boxPog').innerHTML = `<span class="eyebrow">${rating}</span><b>${made} of ${taken} made</b><span class="muted">${tp.score > best ? 'New personal best' : 'Personal best ' + Math.max(best, tp.score)} · Money balls count double</span>`;
  $('#boxTable').parentNode.style.display = 'none';
  $('#boxActions').innerHTML = '<button class="btn ghost" data-act="menu">Main menu</button><button class="btn" data-act="again">Shoot again</button>';
  showScreen('boxscreen');
  setFocus(1);
}

/* ---------------- event router ---------------- */
const GRADE_TXT = { perfect: ['Excellent', 'var(--good)'], early1: ['Slightly early', 'var(--warn)'], late1: ['Slightly late', 'var(--warn)'],
  early2: ['Early', '#ff9f43'], late2: ['Late', '#ff9f43'], early3: ['Very early', 'var(--bad)'], late3: ['Very late', 'var(--bad)'] };
function contestTxt(c) { return c < 0.15 ? 'Wide open' : c < 0.4 ? 'Lightly contested' : c < 0.7 ? 'Contested' : 'Smothered'; }
function isUserTeam(ti) { return G.userTeam >= 0 && !G.auto && ti === G.userTeam; }
function handleEvents() {
  const quiet = G.attract;
  for (const e of EV) {
    if (AU.on) {
      switch (e.type) {
        case 'dribble': SFX.dribble(e.v, e.x); break;
        case 'bounce': SFX.bounce(e.v, e.x); break;
        case 'rim': SFX.rim(e.v); break;
        case 'backboard': SFX.backboard(e.v); break;
        case 'whistle': SFX.whistle(); break;
        case 'buzzer': SFX.buzzer(); break;
        case 'periodEnd': break;
        case 'catch': SFX.catch_(); break;
        case 'move': SFX.squeak(e.p.x); break;
        case 'block': SFX.block(); break;
        case 'dunk': SFX.dunk(); break;
      }
    }
    switch (e.type) {
      case 'score': onScoreEv(e, quiet); break;
      case 'dunk':
        R.shake = 1; R.excite = Math.max(R.excite, 1); R.flashRate = Math.max(R.flashRate, 0.3); rimShake(e.p.team.dir);
        if (!quiet) R.flash = 0.18;
        if (!quiet || Math.random() < 0.5) { R.slowmo = 0.75; R.slowSide = e.p.team.dir; }
        break;
      case 'release':
        if (e.user && !quiet) {
          const gt = GRADE_TXT[e.grade];
          if (gt) {
            const m = $('#meter');
            m.className = e.grade === 'perfect' ? 'res-perfect' : /1$/.test(e.grade) ? 'res-ok' : 'res-bad';
            feedback(e.p, gt[0], gt[1], e.shotType === 'ft' ? '' : contestTxt(e.contest));
            if (e.grade === 'perfect') { SFX.ui('perfect'); startTrail('perfect'); }
          } else if (e.shotType !== 'jump') feedback(e.p, e.shotType === 'dunk' ? 'Rim attack' : 'Layup', 'var(--chalk)', contestTxt(e.contest));
        }
        break;
      case 'block':
        R.excite = Math.max(R.excite, 0.8); crowdRoar(0.8, 1.6); R.flashRate = Math.max(R.flashRate, 0.12);
        if (!quiet) { banner('Rejected', e.by.d.n); ticker(`${shortName(e.by)} blocks ${shortName(e.on)}`); say(`Rejected by ${shortName(e.by)}!`, true); }
        break;
      case 'steal':
        crowdRoar(0.5, 1.2);
        if (!quiet) { ticker(`${shortName(e.by)} ${e.pass ? 'picks off the pass' : 'strips ' + shortName(e.from)}`); if (isUserTeam(e.by.team.idx)) banner('Stolen', e.by.d.n); }
        break;
      case 'poke': case 'deflect': if (!quiet) ticker(`${shortName(e.by)} gets a hand on it`); break;
      case 'ankle':
        R.excite = 1; crowdRoar(1, 2.4);
        if (!quiet) { banner('Ankles!', `${shortName(e.by)} drops ${shortName(e.on)}`); say(`Oh! ${shortName(e.by)} broke his ankles!`, true); }
        break;
      case 'whistle':
        if (!quiet) { ticker(e.reason); if (/And one/.test(e.reason)) { banner('And one!'); crowdRoar(1, 2); say('And one!', true); } }
        break;
      case 'foul': if (!quiet) ticker(`Foul on ${shortName(e.by)} (${e.by.st.pf})`); break;
      case 'turnover':
        if (!quiet && e.why === 'shotclock') banner('Shot clock', 'Violation');
        else if (!quiet && e.why === 'backcourt') banner('Backcourt', 'Violation');
        else if (!quiet && e.why === 'charge') banner('Charge!', shortName(e.p));
        break;
      case 'periodEnd':
        crowdRoar(0.6, 2); backboardLights();
        if (!quiet && G.mode !== 'threept') banner(`End of ${qLabel()}`, `${G.teams[1].def.id} ${G.teams[1].score} – ${G.teams[0].score} ${G.teams[0].def.id}`);
        break;
      case 'periodStart': if (!quiet) ticker(`${qLabel()} quarter underway`); break;
      case 'halftime': if (!quiet) { APP.paused = true; setTimeout(() => showBox('half'), 200); } break;
      case 'final':
        R.excite = 1.2; crowdRoar(1, 4); R.flashRate = 0.45; startConfetti(G.teams[e.winner].def);
        if (!quiet) { const w = G.teams[e.winner]; banner('Final', `${w.def.name} win`); say(`That's the ball game. ${w.def.city} wins it.`, true); APP.finalT = 3.2; }
        break;
      case 'tipWon': if (!quiet) ticker(`${G.teams[e.team].def.name} win the tip`); break;
      case 'tpGo': banner('Go!'); break;
      case 'tpDone': APP.finalT = 1.6; break;
      case 'switch': SFX.ui('move'); break;
      case 'miss':
        if (!quiet && G.quarter >= 4 && G.clock < 30 && Math.abs(G.teams[0].score - G.teams[1].score) <= 3) crowdGroan();
        break;
    }
  }
  EV.length = 0;
}
function onScoreEv(e, quiet) {
  const p = e.p, T = p.team;
  if (AU.on && e.swish) SFX.swish();
  netSwish(T.dir);
  const homeTeam = e.team === 0;
  const big = e.three || e.dunk || G.clockExpired;
  R.excite = Math.max(R.excite, homeTeam ? (big ? 1 : 0.6) : 0.25);
  if (big) R.flashRate = Math.max(R.flashRate, 0.14);
  if (!e.ft) crowdRoar(homeTeam ? (big ? 1 : 0.65) : 0.3, big ? 2.4 : 1.5);
  if (quiet) return;
  if (G.mode === 'threept') { if (e.money) feedback(p, '+2', '#ff4fd8'); return; }
  const n = shortName(p);
  let line;
  if (e.ft) line = `${n} makes the free throw`;
  else if (e.dunk) line = pick([`${n} throws it down!`, `${n} with the slam`, `${n} hammers it home`]);
  else if (e.three) line = pick([`${n} drains the three`, `${n} from downtown!`, `${n} buries it from deep`]);
  else if (G.lastRelease && G.lastRelease.p === p && G.lastRelease.type === 'layup') line = pick([`${n} finishes at the rim`, `${n} lays it in`, `${n} gets the roll`]);
  else line = pick([`${n} knocks down the jumper`, `${n} pulls up and hits`, `${n} cashes the mid-range`]);
  if (e.assist) line += ` (ast ${shortName(e.assist)})`;
  ticker(line);
  if (G.clockExpired && !e.ft) { banner('Buzzer beater!', p.d.n); say(`At the buzzer! ${n}!`, true); }
  else if (e.dunk) { banner(pick(['Slam!', 'Posterized!', 'Jam!']), p.d.n); say(pick([`${n}, throws it down!`, `Oh what a slam by ${n}!`]), true); }
  else if (e.three && isUserTeam(T.idx) && e.swish) banner('Splash', p.d.n);
  else if (e.three) say(pick([`${n} for three. Bang!`, `${n} from deep. Got it!`]), false);
}
