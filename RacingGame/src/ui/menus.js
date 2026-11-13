// All menu screens (DOM). Kid-friendly: big buttons, clear numbers, always
// shows what you can afford and what the next upgrade does.
import { catalog, CLASSES, CLASS_KEYS, BRANDS, formatPrice, CAR_COUNT } from '../data/cars.js';
import { PARTS, partCost, partAvailable, effectiveStats } from '../data/parts.js';
import { SERIES, seriesEvents, eligible, reqText, seriesUnlocked, PRIZE_SPLIT } from '../data/events.js';
import { TRACKS, trackById } from '../data/tracks.js';
import { Track } from '../sim/track.js';
import { PAINT_COLORS, RIM_COLORS } from '../gfx/carModel.js';
import { QUALITY } from '../gfx/renderer.js';
import { audio } from '../audio/audio.js';
import { fmtTime } from './hud.js';

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const ENV_LABEL = { noon: 'Midday', morning: 'Morning', golden: 'Golden Hour', sunset: 'Sunset', desert: 'Desert Sun', snow: 'Alpine Day', night: 'Night', overcast: 'Rain' };

// Mini track maps (SVG paths) cached per track
const mapCache = new Map();
export function trackSvg(id, cls = '') {
  if (!mapCache.has(id)) {
    const tr = new Track(trackById(id));
    const B = tr.bounds, w = B.maxx - B.minx, h = B.maxz - B.minz, sc = 90 / Math.max(w, h);
    let d = '';
    for (let i = 0; i <= tr.N; i += 4) {
      const k = i % tr.N;
      d += (i ? 'L' : 'M') + (50 + (tr.x[k] - (B.minx + B.maxx) / 2) * sc).toFixed(1) + ' ' + (50 - (tr.z[k] - (B.minz + B.maxz) / 2) * sc).toFixed(1);
    }
    mapCache.set(id, { d, len: tr.length });
  }
  const m = mapCache.get(id);
  return `<svg class="tmap ${cls}" viewBox="0 0 100 100"><path d="${m.d}Z"/></svg>`;
}
export function trackLength(id) { trackSvg(id); return mapCache.get(id).len; }

export function toggleFullscreen(force) {
  const d = document, el = d.documentElement;
  const isFs = d.fullscreenElement || d.webkitFullscreenElement;
  try {
    if (force === false || (isFs && force !== true)) { (d.exitFullscreen || d.webkitExitFullscreen)?.call(d); return; }
    if (!isFs) {
      const p = (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el, { navigationUI: 'hide' });
      if (p && p.then) p.then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
    }
  } catch (e) { /* not supported (e.g. iPhone Safari) */ }
}

export class UI {
  constructor(app) {
    this.app = app;
    const root = document.createElement('div');
    root.className = 'ui';
    root.innerHTML = `
      <header class="topbar">
        <div class="logo" data-go="home"><span class="lg-a">APEX</span><span class="lg-b">VELOCITY</span></div>
        <nav class="tabs">
          <button data-go="home">Home</button><button data-go="career">Career</button><button data-go="quick">Quick Race</button>
          <button data-go="dealer">Dealership</button><button data-go="garage">Garage</button><button data-go="tuning">Tuning</button><button data-go="settings">Settings</button>
        </nav>
        <button class="fs-btn" aria-label="Full screen" title="Full screen">⛶</button>
        <div class="wallet"><span class="w-label">CREDITS</span><span class="w-val">$0</span></div>
      </header>
      <main class="screen"></main>
      <div class="modal-wrap"></div>
      <div class="ui-toast"></div>`;
    app.overlay.appendChild(root);
    this.root = root;
    this.screenEl = $('.screen', root);
    this.modalEl = $('.modal-wrap', root);
    root.addEventListener('click', (e) => {
      const go = e.target.closest('[data-go]');
      if (go) { audio.init(); audio.click(); this.show(go.dataset.go); }
    });
    $('.fs-btn', root).onclick = () => toggleFullscreen();
    root.addEventListener('mouseover', (e) => { if (e.target.closest('button, .card, .tile')) audio.ctx && audio.hover(); }, { passive: true });
    this.dealer = { search: '', classes: new Set(), brand: '', sort: 'price', afford: false, scroll: 0 };
  }

  get profile() { return this.app.profile; }

  setVisible(v) { this.root.style.display = v ? '' : 'none'; }

  updateWallet() {
    const w = $('.w-val', this.root);
    const target = this.profile.credits;
    const from = this._walletShown ?? target;
    this._walletShown = target;
    if (from === target) { w.textContent = formatPrice(target); return; }
    const t0 = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / 700);
      w.textContent = formatPrice(Math.round(from + (target - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(step);
    };
    step();
    w.parentElement.classList.remove('bump'); void w.offsetWidth; w.parentElement.classList.add('bump');
  }

  toast(msg, cls = '') {
    const t = $('.ui-toast', this.root);
    t.innerHTML = msg;
    t.className = 'ui-toast show ' + cls;
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.classList.remove('show'), 2600);
  }

  modal(html, { onClose } = {}) {
    this.modalEl.innerHTML = `<div class="modal"><button class="m-x" aria-label="Close">✕</button>${html}</div>`;
    this.modalEl.classList.add('show');
    const close = () => { this.modalEl.classList.remove('show', 'side-open'); this.modalEl.innerHTML = ''; onClose && onClose(); };
    $('.m-x', this.modalEl).onclick = close;
    this.modalEl.onclick = (e) => { if (e.target === this.modalEl) close(); };
    return { el: $('.modal', this.modalEl), close };
  }

  show(name, params) {
    this.current = name;
    this.root.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.go === name || (name === 'series' && b.dataset.go === 'career')));
    this.root.classList.remove('full');
    this.screenEl.className = 'screen s-' + name;
    this.updateWallet();
    const fn = { home: this.home, career: this.career, series: this.series, quick: this.quick, dealer: this.dealership, garage: this.garage, tuning: this.tuning, settings: this.settings }[name];
    (fn || this.home).call(this, params);
    this.screenEl.scrollTop = 0;
  }

  // ---------------------------------------------------------------------------
  showActiveCar(offsetX = 0.2) {
    const a = this.app.activeCar();
    this.app.showroom.setCar(a.car, a.entry, { offsetX });
  }

  carBadge(car, stats) {
    return `<span class="pr-badge" title="Performance Rating">PR ${stats.pr}</span><span class="cls-badge cls-${car.cls}">${esc(car.className)}</span>`;
  }

  home() {
    const a = this.app.activeCar();
    const p = this.profile;
    this.showActiveCar(0.2);
    this.screenEl.innerHTML = `
      <div class="home">
        <div class="home-left">
          <div class="tile big" data-go="career"><div class="t-kicker">CAREER</div><div class="t-title">Race for the Championship</div><div class="t-sub">${SERIES.length} series · win prize money</div></div>
          <div class="tile" data-go="quick"><div class="t-kicker">QUICK RACE</div><div class="t-title">Any track, any time</div></div>
          <div class="tile" data-go="dealer"><div class="t-kicker">DEALERSHIP</div><div class="t-title">${CAR_COUNT.toLocaleString()} cars for sale</div></div>
          <div class="tile-row">
            <div class="tile small" data-go="garage"><div class="t-kicker">GARAGE</div><div class="t-title">${p.garage.length} car${p.garage.length > 1 ? 's' : ''}</div></div>
            <div class="tile small" data-go="tuning"><div class="t-kicker">TUNING</div><div class="t-title">Upgrade parts</div></div>
          </div>
        </div>
        <div class="home-car">
          <div class="hc-name">${esc(a.car.name)}</div>
          <div class="hc-meta">${this.carBadge(a.car, a.stats)}<span>${a.stats.hp} hp</span><span>${a.stats.kg} kg</span><span>${a.stats.topKmh} km/h</span><span>0-100 ${a.stats.accel0100}s</span></div>
          <div class="hc-hint">Drag to spin the car</div>
        </div>
        <div class="home-stats"><div><b>${p.stats.races}</b><span>Races</span></div><div><b>${p.stats.wins}</b><span>Wins</span></div><div><b>${p.stats.podiums}</b><span>Podiums</span></div><div><b>${formatPrice(p.stats.earned)}</b><span>Earned</span></div></div>
      </div>`;
    if (!p.welcomeSeen) this.welcome();
  }

  welcome() {
    const a = this.app.activeCar();
    const m = this.modal(`
      <h2>Welcome to Apex Velocity!</h2>
      <p class="lead">Here's <b>${formatPrice(this.profile.credits)}</b> and your first car, the <b>${esc(a.car.name)}</b>.</p>
      <ol class="howto">
        <li><b>Race</b> in the Career to win prize money.</li>
        <li><b>Upgrade</b> your car in the Tuning shop to go faster.</li>
        <li><b>Buy</b> better cars from the Dealership. There are ${CAR_COUNT.toLocaleString()} to collect!</li>
        <li>Work your way up to the <b>Formula Elite World Championship</b>.</li>
      </ol>
      ${this.controlsHtml()}
      <button class="btn primary wide" data-close>LET'S RACE!</button>`, { onClose: () => { this.profile.welcomeSeen = true; this.app.save(); } });
    $('[data-close]', m.el).onclick = () => { audio.init(); audio.click(); m.close(); };
  }

  controlsHtml() {
    if (this.app.isTouch) {
      return `<div class="controls touch-help">
        <div><b>◀ ▶</b> buttons: steer</div><div><b>BRAKE</b>: slow down / reverse</div>
        <div><b>GAS</b>: accelerate${this.profile.settings.assists.autoGas ? ' (Auto accelerate is ON)' : ''}</div><div><b>N2O</b>: nitro boost</div>
        <div><b>CAM</b>: change camera</div><div><b>❚❚</b>: pause</div>
        <div>Turn your phone sideways to race</div><div>🎮 Controllers work too</div></div>`;
    }
    return `<div class="controls">
      <div><kbd>W</kbd>/<kbd>↑</kbd> Accelerate</div><div><kbd>S</kbd>/<kbd>↓</kbd> Brake / Reverse</div>
      <div><kbd>A</kbd><kbd>D</kbd>/<kbd>←</kbd><kbd>→</kbd> Steer</div><div><kbd>Space</kbd> Handbrake</div>
      <div><kbd>N</kbd>/<kbd>Shift</kbd> Nitro</div><div><kbd>C</kbd> Change camera</div>
      <div><kbd>R</kbd> Reset car</div><div><kbd>Esc</kbd> Pause</div>
      <div><kbd>Q</kbd>/<kbd>E</kbd> Gear down/up (manual)</div><div>🎮 Gamepad & touch supported</div></div>`;
  }

  // ---------------------------------------------------------------------------
  career() {
    this.app.showroom.setFrame(0.32);
    const p = this.profile;
    const tiers = [...new Set(SERIES.map((s) => s.tier))];
    const tierNames = { 1: 'Rookie', 2: 'Amateur', 3: 'Pro', 4: 'Elite', 5: 'Legend', 6: 'World Class' };
    this.screenEl.innerHTML = `<div class="panel wide-panel"><h1>Career</h1><p class="sub">Finish in the top 3 of any race in a tier to unlock the next tier. Win every race of a series for a big bonus!</p>
      ${tiers.map((t) => `<h3 class="tier-h">Tier ${t} · ${tierNames[t]}</h3><div class="series-grid">${SERIES.filter((s) => s.tier === t).map((s) => {
        const evs = seriesEvents(s);
        const done = evs.filter((e) => (p.career[e.id] || 99) <= 3).length;
        const wins = evs.filter((e) => p.career[e.id] === 1).length;
        const locked = !seriesUnlocked(s, p);
        return `<div class="card series-card${locked ? ' locked' : ''}" data-series="${s.id}" style="--accent:${s.color}">
          <div class="sc-top"><span class="sc-tier">TIER ${s.tier}</span>${locked ? '<span class="lock">🔒</span>' : wins === evs.length ? '<span class="trophy gold">🏆</span>' : ''}</div>
          <div class="sc-name">${esc(s.name)}</div><div class="sc-desc">${esc(s.desc)}</div>
          <div class="sc-req">${esc(reqText(s.req))}</div>
          <div class="sc-foot"><span>${evs.length} races</span><span class="money">Win ${formatPrice(s.purse)}+</span></div>
          <div class="sc-prog"><i style="width:${(done / evs.length) * 100}%"></i></div></div>`;
      }).join('')}</div>`).join('')}</div>`;
    this.screenEl.querySelectorAll('[data-series]').forEach((c) => {
      c.onclick = () => {
        audio.click();
        const s = SERIES.find((x) => x.id === c.dataset.series);
        if (!seriesUnlocked(s, this.profile)) { audio.error(); this.toast(`🔒 Finish top 3 in a Tier ${s.tier - 1} race to unlock`); return; }
        this.show('series', s.id);
      };
    });
  }

  series(id) {
    const s = SERIES.find((x) => x.id === id);
    const p = this.profile;
    const a = this.app.activeCar();
    const ok = eligible(a.car, a.stats, s.req);
    this.showActiveCar(0.28);
    const evs = seriesEvents(s);
    this.screenEl.innerHTML = `<div class="panel">
      <button class="back" data-go="career">‹ Career</button>
      <h1 style="--accent:${s.color}" class="accent-h">${esc(s.name)}</h1><p class="sub">${esc(s.desc)}</p>
      <div class="req ${ok ? 'ok' : 'bad'}"><b>Entry rules:</b> ${esc(reqText(s.req))}<br>
        Your car: <b>${esc(a.car.name)}</b> (PR ${a.stats.pr}, ${esc(a.car.className)}) ${ok ? '✅ Eligible' : '❌ Not eligible: pick another car in the Garage or buy one'}
        ${ok ? '' : `<div class="req-actions"><button class="btn" data-go="garage">Garage</button><button class="btn" id="findCar">Find an eligible car</button></div>`}</div>
      <div class="events">${evs.map((e, i) => {
        const tr = trackById(e.track);
        const best = p.career[e.id];
        return `<div class="card event-card" data-ev="${i}">
          <div class="ev-map">${trackSvg(e.track)}</div>
          <div class="ev-info"><div class="ev-num">RACE ${i + 1}</div><div class="ev-name">${esc(tr.name)}</div>
            <div class="ev-meta">${e.laps} laps · ${(trackLength(e.track) * e.laps / 1000).toFixed(1)} km · ${ENV_LABEL[tr.env] || tr.env}</div></div>
          <div class="ev-right"><div class="money">${formatPrice(e.purse)}</div>${best ? `<div class="medal m${Math.min(best, 4)}">${best <= 3 ? ['🥇', '🥈', '🥉'][best - 1] : 'P' + best}</div>` : ''}<button class="btn primary">RACE</button></div>
        </div>`;
      }).join('')}</div>
      <div class="bonus">Series bonus for winning every race: <b class="money">${formatPrice(s.bonus)}</b> ${p.seriesDone[s.id] ? '✅ Collected' : ''}</div></div>`;
    this.screenEl.querySelectorAll('[data-ev]').forEach((c) => {
      c.onclick = () => {
        audio.click();
        const a2 = this.app.activeCar();
        if (!eligible(a2.car, a2.stats, s.req)) { audio.error(); this.toast('❌ Your car isn\'t allowed in this series'); return; }
        this.prerace({ series: s, event: evs[+c.dataset.ev] });
      };
    });
    const fc = $('#findCar', this.screenEl);
    if (fc) fc.onclick = () => {
      // jump to the dealership with filters matching the series
      this.dealer.classes = new Set(s.req.cls || []);
      this.dealer.maxPR = s.req.maxPR || 0; this.dealer.minPR = s.req.minPR || 0;
      this.dealer.sort = 'price';
      this.show('dealer');
    };
  }

  prerace({ series, event }) {
    const tr = trackById(event.track);
    const settings = this.profile.settings;
    const m = this.modal(`
      <div class="pre"><div class="pre-map">${trackSvg(event.track, 'big')}</div>
      <div class="pre-info"><div class="ev-num">${esc(series.name)} · RACE ${event.index + 1}</div><h2>${esc(tr.name)}</h2><p>${esc(tr.blurb)}</p>
      <div class="pre-facts"><div><b>${event.laps}</b><span>Laps</span></div><div><b>${(trackLength(event.track) / 1000).toFixed(2)} km</b><span>Lap length</span></div><div><b>${ENV_LABEL[tr.env]}</b><span>Conditions</span></div><div><b>7</b><span>Opponents</span></div></div>
      <div class="prizes">${PRIZE_SPLIT.slice(0, 4).map((f, i) => `<div><span>${['1st', '2nd', '3rd', '4th'][i]}</span><b>${formatPrice(Math.round(event.purse * f / 100) * 100)}</b></div>`).join('')}</div>
      <div class="diff">Difficulty: ${['easy', 'normal', 'hard'].map((d) => `<button class="chip${settings.difficulty === d ? ' on' : ''}" data-diff="${d}">${d[0].toUpperCase() + d.slice(1)}</button>`).join('')}</div>
      <button class="btn primary wide go" data-start>START RACE</button></div></div>`);
    m.el.querySelectorAll('[data-diff]').forEach((b) => b.onclick = () => {
      settings.difficulty = b.dataset.diff; this.app.save();
      m.el.querySelectorAll('[data-diff]').forEach((x) => x.classList.toggle('on', x === b));
    });
    $('[data-start]', m.el).onclick = () => {
      audio.init(); audio.click();
      m.close();
      this.app.startCareerRace(series, event);
    };
  }

  // ---------------------------------------------------------------------------
  quick() {
    this.app.showroom.setFrame(0.3);
    const q = this.quickOpts || (this.quickOpts = { track: TRACKS[0].id, laps: 3, opponents: 7, env: 'auto' });
    const envs = ['auto', 'noon', 'morning', 'golden', 'sunset', 'night', 'overcast'];
    this.screenEl.innerHTML = `<div class="panel wide-panel"><h1>Quick Race</h1><p class="sub">Practice any track with your current car. Opponents are matched to your car's PR. (Small prize: ${formatPrice(1500)} for a win.)</p>
      <div class="track-grid">${TRACKS.map((t) => `<div class="card track-card${q.track === t.id ? ' on' : ''}" data-track="${t.id}">${trackSvg(t.id)}<div class="tc-name">${esc(t.short)}</div><div class="tc-meta">${(trackLength(t.id) / 1000).toFixed(2)} km · ${ENV_LABEL[t.env]}</div></div>`).join('')}</div>
      <div class="opts">
        <label>Laps <input type="range" min="1" max="10" value="${q.laps}" data-opt="laps"><b>${q.laps}</b></label>
        <label>Opponents <input type="range" min="0" max="15" value="${q.opponents}" data-opt="opponents"><b>${q.opponents}</b></label>
        <div class="env-row">Time & weather: ${envs.map((e) => `<button class="chip${q.env === e ? ' on' : ''}" data-env="${e}">${e === 'auto' ? 'Track default' : ENV_LABEL[e]}</button>`).join('')}</div>
      </div>
      <button class="btn primary big-btn" data-startq>START</button></div>`;
    this.screenEl.querySelectorAll('[data-track]').forEach((c) => c.onclick = () => { audio.click(); q.track = c.dataset.track; this.screenEl.querySelectorAll('[data-track]').forEach((x) => x.classList.toggle('on', x === c)); });
    this.screenEl.querySelectorAll('[data-opt]').forEach((r) => r.oninput = () => { q[r.dataset.opt] = +r.value; r.nextElementSibling.textContent = r.value; });
    this.screenEl.querySelectorAll('[data-env]').forEach((b) => b.onclick = () => { q.env = b.dataset.env; this.screenEl.querySelectorAll('[data-env]').forEach((x) => x.classList.toggle('on', x === b)); });
    $('[data-startq]', this.screenEl).onclick = () => { audio.init(); audio.click(); this.app.startQuickRace({ ...q }); };
  }

  // ---------------------------------------------------------------------------
  dealership() {
    const D = this.dealer;
    this.app.showroom.setFrame(0.5);
    this.root.classList.add('full');
    const brands = BRANDS.map((b) => b.name).sort();
    this.screenEl.innerHTML = `<div class="dealer">
      <aside class="filters">
        <h1>Dealership</h1>
        <div class="count"><b class="d-count">0</b> cars</div>
        <input class="search" type="search" placeholder="Search name or brand…" value="${esc(D.search)}">
        <div class="f-h">Sort</div>
        <select class="sort">${[['price', 'Price: low to high'], ['price_d', 'Price: high to low'], ['pr', 'PR: high to low'], ['pr_a', 'PR: low to high'], ['hp', 'Power'], ['name', 'Name']].map(([v, l]) => `<option value="${v}"${D.sort === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <label class="check"><input type="checkbox" class="afford"${D.afford ? ' checked' : ''}> Only cars I can afford</label>
        <div class="f-h">Brand</div>
        <select class="brand"><option value="">All brands</option>${brands.map((b) => `<option${D.brand === b ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select>
        ${D.maxPR || D.minPR ? `<div class="pr-filter">PR ${D.minPR ? '≥ ' + D.minPR : ''} ${D.maxPR ? '≤ ' + D.maxPR : ''} <button class="chip" data-clearpr>✕</button></div>` : ''}
        <div class="f-h">Class</div>
        <div class="chips">${CLASS_KEYS.map((k) => `<button class="chip${D.classes.has(k) ? ' on' : ''}" data-cls="${k}">${esc(CLASSES[k].name)}</button>`).join('')}</div>
      </aside>
      <section class="d-grid-wrap"><div class="d-grid"></div></section>
    </div>`;
    const wrap = $('.d-grid-wrap', this.screenEl), grid = $('.d-grid', this.screenEl);
    const refresh = () => { this.filterCars(); wrap.scrollTop = 0; this.renderGrid(wrap, grid); };
    $('.search', this.screenEl).oninput = (e) => { D.search = e.target.value; refresh(); };
    $('.sort', this.screenEl).onchange = (e) => { D.sort = e.target.value; refresh(); };
    $('.afford', this.screenEl).onchange = (e) => { D.afford = e.target.checked; refresh(); };
    $('.brand', this.screenEl).onchange = (e) => { D.brand = e.target.value; refresh(); };
    const cpr = $('[data-clearpr]', this.screenEl);
    if (cpr) cpr.onclick = () => { D.maxPR = 0; D.minPR = 0; this.show('dealer'); };
    this.screenEl.querySelectorAll('[data-cls]').forEach((b) => b.onclick = () => {
      audio.click();
      const k = b.dataset.cls;
      if (D.classes.has(k)) D.classes.delete(k); else D.classes.add(k);
      b.classList.toggle('on');
      refresh();
    });
    wrap.onscroll = () => this.renderGrid(wrap, grid);
    this._gridResize = () => this.renderGrid(wrap, grid, true);
    window.addEventListener('resize', this._gridResize);
    this.filterCars();
    requestAnimationFrame(() => { wrap.scrollTop = D.scroll || 0; this.renderGrid(wrap, grid, true); });
    grid.onclick = (e) => {
      const c = e.target.closest('[data-car]');
      if (!c) return;
      audio.click();
      D.scroll = wrap.scrollTop;
      this.carDetail(catalog()[+c.dataset.car]);
    };
  }

  filterCars() {
    const D = this.dealer;
    const all = catalog();
    const q = D.search.trim().toLowerCase();
    const credits = this.profile.credits;
    const pr = this.app.prCache;
    const needPR = D.sort === 'pr' || D.sort === 'pr_a' || D.maxPR || D.minPR;
    if (needPR) this.app.ensurePR();
    let list = all.filter((c) => {
      if (D.classes.size && !D.classes.has(c.cls)) return false;
      if (D.brand && c.brand !== D.brand) return false;
      if (D.afford && c.price > credits) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      if (D.maxPR && pr[c.id] > D.maxPR) return false;
      if (D.minPR && pr[c.id] < D.minPR) return false;
      return true;
    });
    const sorters = {
      price: (a, b) => a.price - b.price, price_d: (a, b) => b.price - a.price, hp: (a, b) => b.hp - a.hp,
      name: (a, b) => a.name.localeCompare(b.name), pr: (a, b) => pr[b.id] - pr[a.id], pr_a: (a, b) => pr[a.id] - pr[b.id],
    };
    list.sort(sorters[D.sort] || sorters.price);
    this.filtered = list;
    const cnt = $('.d-count', this.screenEl);
    if (cnt) cnt.textContent = list.length.toLocaleString();
  }

  renderGrid(wrap, grid, force = false) {
    const list = this.filtered || [];
    const W = wrap.clientWidth - 8;
    const cardW = 236, cardH = 236, gap = 14;
    const cols = Math.max(1, Math.floor((W + gap) / (cardW + gap)));
    const rows = Math.ceil(list.length / cols);
    grid.style.height = rows * (cardH + gap) + 'px';
    const top = wrap.scrollTop, vh = wrap.clientHeight;
    const r0 = Math.max(0, Math.floor(top / (cardH + gap)) - 1), r1 = Math.min(rows, Math.ceil((top + vh) / (cardH + gap)) + 1);
    const key = `${r0}_${r1}_${cols}_${list.length}_${list[0]?.id}`;
    if (key === this._gridKey && !force) return;
    this._gridKey = key;
    const owned = new Set(this.profile.garage.map((g) => g.carId));
    const credits = this.profile.credits;
    const pr = this.app.prCache;
    let html = '';
    const offX = Math.max(0, (W - (cols * (cardW + gap) - gap)) / 2);
    for (let r = r0; r < r1; r++) for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx >= list.length) break;
      const car = list[idx];
      const prv = pr[car.id] ? `PR ${pr[car.id]}` : '';
      html += `<div class="card car-card${owned.has(car.id) ? ' owned' : ''}" data-car="${car.id}" style="left:${offX + c * (cardW + gap)}px;top:${r * (cardH + gap)}px">
        <canvas width="240" height="140" data-thumb="${car.id}"></canvas>
        <div class="cc-name">${esc(car.name)}</div>
        <div class="cc-meta"><span class="cls-badge cls-${car.cls}">${esc(car.className)}</span><span>${car.hp} hp</span>${prv ? `<span class="pr-mini">${prv}</span>` : ''}</div>
        <div class="cc-price${car.price > credits ? ' dear' : ''}">${owned.has(car.id) ? 'OWNED' : formatPrice(car.price)}</div></div>`;
    }
    grid.innerHTML = html;
    if (!list.length) grid.innerHTML = '<div class="empty">No cars match. Try fewer filters!</div>';
    grid.querySelectorAll('canvas[data-thumb]').forEach((cv) => this.app.showroom.queueThumb(catalog()[+cv.dataset.thumb], cv));
  }

  carDetail(car) {
    window.removeEventListener('resize', this._gridResize);
    this.root.classList.remove('full');
    this.screenEl.className = 'screen s-detail';
    const st = effectiveStats(car);
    const owned = this.profile.garage.some((g) => g.carId === car.id);
    const afford = this.profile.credits >= car.price;
    let paint = null;
    this.app.showroom.setCar(car, {}, { offsetX: 0.22 });
    const bar = (label, val, max, txt, invert = false) => {
      const f = Math.max(0.03, Math.min(1, invert ? 1 - val / max : val / max));
      return `<div class="stat"><span>${label}</span><div class="sbar"><i style="width:${f * 100}%"></i></div><b>${txt}</b></div>`;
    };
    this.screenEl.innerHTML = `<div class="panel detail">
      <button class="back" data-back>‹ Back to cars</button>
      <div class="d-brand">${esc(car.brand)} · ${car.year}</div>
      <h1>${esc(car.model)} ${esc(car.trim)}</h1>
      <div class="hc-meta">${this.carBadge(car, st)}<span>${car.drive}</span><span>${car.ev ? 'Electric' : car.engine + ' engine'}</span><span>${car.ev ? '1-speed' : car.gears + '-speed'}</span></div>
      <div class="stats">
        ${bar('Power', st.hp, 1600, st.hp + ' hp')}
        ${bar('Weight', st.kg, 2700, st.kg + ' kg', true)}
        ${bar('Top speed', st.topKmh, 490, st.topKmh + ' km/h')}
        ${bar('0-100 km/h', st.accel0100 - 1.5, 15, st.accel0100 + ' s', true)}
        ${bar('Grip', st.mu, 1.9, st.mu.toFixed(2) + 'g')}
        ${bar('Downforce', st.aero, 5.8, st.aero < 0.15 ? 'Low' : st.aero < 1 ? 'Medium' : st.aero < 3 ? 'High' : 'Extreme')}
        ${bar('Performance', st.pr, 1050, 'PR ' + st.pr)}
      </div>
      <div class="f-h">Choose your colour</div>
      <div class="swatches">${PAINT_COLORS.map((c) => `<button class="sw" style="background:${hex(c)}" data-paint="${c}" aria-label="paint ${hex(c)}"></button>`).join('')}</div>
      <div class="price-row"><div class="big-price">${formatPrice(car.price)}</div>
        <div class="buy-actions"><button class="btn" data-test>TEST DRIVE</button><button class="btn primary${afford && !owned ? '' : ' disabled'}" data-buy>${owned ? 'OWNED' : afford ? 'BUY' : 'NEED ' + formatPrice(car.price - this.profile.credits)}</button></div></div>
    </div>`;
    $('[data-back]', this.screenEl).onclick = () => { audio.click(); this.show('dealer'); };
    this.screenEl.querySelectorAll('[data-paint]').forEach((b) => b.onclick = () => {
      audio.click();
      paint = +b.dataset.paint;
      this.screenEl.querySelectorAll('[data-paint]').forEach((x) => x.classList.toggle('on', x === b));
      this.app.showroom.setCar(car, { paint }, { offsetX: 0.22 });
    });
    $('[data-test]', this.screenEl).onclick = () => { audio.init(); audio.click(); this.app.testDrive(car, { paint }); };
    $('[data-buy]', this.screenEl).onclick = () => {
      if (owned) return;
      if (this.profile.credits < car.price) { audio.error(); this.toast(`You need ${formatPrice(car.price - this.profile.credits)} more. Win some races!`); return; }
      const m = this.modal(`<h2>Buy this car?</h2><p class="lead">${esc(car.name)} for <b class="money">${formatPrice(car.price)}</b></p><p>You'll have ${formatPrice(this.profile.credits - car.price)} left.</p><div class="modal-actions"><button class="btn" data-no>Cancel</button><button class="btn primary" data-yes>BUY IT!</button></div>`);
      $('[data-no]', m.el).onclick = () => m.close();
      $('[data-yes]', m.el).onclick = () => {
        this.app.buyCar(car, paint);
        m.close();
        audio.cash();
        this.toast(`🎉 You bought the <b>${esc(car.name)}</b>! It's now your active car.`, 'good');
        this.carDetail(car);
        this.updateWallet();
      };
    };
  }

  // ---------------------------------------------------------------------------
  garage() {
    const p = this.profile;
    this.showActiveCar(0.24);
    const active = p.activeUid;
    this.screenEl.innerHTML = `<div class="panel garage"><h1>Garage</h1><p class="sub">Pick the car you want to race, change its paint, or sell cars you don't drive.</p>
      <div class="g-list">${p.garage.map((g) => {
        const car = catalog()[g.carId];
        const st = effectiveStats(car, g.parts);
        const lv = Object.values(g.parts || {}).reduce((a, b) => a + b, 0);
        return `<div class="card g-card${g.uid === active ? ' on' : ''}" data-uid="${g.uid}">
          <i class="g-color" style="background:${hex(g.paint ?? 0x888888)}"></i>
          <div class="g-info"><div class="cc-name">${esc(car.name)}</div><div class="cc-meta">${this.carBadge(car, st)}<span>${st.hp} hp</span>${lv ? `<span class="up">+${lv} upgrades</span>` : ''}</div></div>
          ${g.uid === active ? '<span class="active-tag">DRIVING</span>' : '<button class="btn small" data-drive>DRIVE</button>'}</div>`;
      }).join('')}</div>
      <div class="g-actions"><button class="btn" data-paintshop>🎨 Paint shop</button><button class="btn" data-go="tuning">🔧 Tuning</button><button class="btn danger" data-sell>Sell car</button></div></div>`;
    this.screenEl.querySelectorAll('[data-uid]').forEach((c) => c.onclick = (e) => {
      audio.click();
      p.activeUid = c.dataset.uid;
      this.app.save();
      this.garage();
      void e;
    });
    $('[data-paintshop]', this.screenEl).onclick = () => { audio.click(); this.paintShop(); };
    $('[data-sell]', this.screenEl).onclick = () => {
      if (p.garage.length <= 1) { audio.error(); this.toast('You need at least one car!'); return; }
      const a = this.app.activeCar();
      const value = this.app.sellValue(a.entry);
      const m = this.modal(`<h2>Sell your car?</h2><p class="lead">${esc(a.car.name)}</p><p>You'll get <b class="money">${formatPrice(value)}</b> (60% of the price plus half of the parts you fitted).</p><div class="modal-actions"><button class="btn" data-no>Keep it</button><button class="btn danger" data-yes>SELL</button></div>`);
      $('[data-no]', m.el).onclick = () => m.close();
      $('[data-yes]', m.el).onclick = () => { this.app.sellCar(a.entry); audio.cash(); m.close(); this.garage(); this.updateWallet(); this.toast(`Sold for ${formatPrice(value)}`, 'good'); };
    };
  }

  paintShop() {
    const a = this.app.activeCar();
    const g = a.entry;
    const finishes = [['gloss', 'Gloss'], ['metallic', 'Metallic'], ['pearl', 'Pearl'], ['matte', 'Matte'], ['chrome', 'Chrome']];
    const liveries = [['none', 'Plain'], ['stripes', 'Racing stripes'], ['sidestripe', 'Side stripe'], ['twotone', 'Two-tone'], ['fade', 'Fade'], ['race', 'Race livery'], ['race_stripes', 'Race + stripes']];
    const m = this.modal(`<h2>Paint shop</h2><p class="sub">Free! Make it yours.</p>
      <div class="f-h">Colour</div><div class="swatches">${PAINT_COLORS.map((c) => `<button class="sw${g.paint === c ? ' on' : ''}" style="background:${hex(c)}" data-k="paint" data-v="${c}"></button>`).join('')}</div>
      <div class="f-h">Accent colour</div><div class="swatches">${PAINT_COLORS.map((c) => `<button class="sw sm${g.accent === c ? ' on' : ''}" style="background:${hex(c)}" data-k="accent" data-v="${c}"></button>`).join('')}</div>
      <div class="f-h">Finish</div><div class="chips">${finishes.map(([v, l]) => `<button class="chip${g.finish === v ? ' on' : ''}" data-k="finish" data-v="${v}">${l}</button>`).join('')}</div>
      <div class="f-h">Livery</div><div class="chips">${liveries.map(([v, l]) => `<button class="chip${(g.livery || 'none') === v ? ' on' : ''}" data-k="livery" data-v="${v}">${l}</button>`).join('')}</div>
      <div class="f-h">Wheels</div><div class="swatches">${RIM_COLORS.map((c) => `<button class="sw sm${g.rim === c ? ' on' : ''}" style="background:${hex(c)}" data-k="rim" data-v="${c}"></button>`).join('')}</div>
      <div class="f-h">Race number</div><input type="number" min="1" max="99" class="num" value="${g.number || 7}">
      <button class="btn primary wide" data-done>DONE</button>`, { onClose: () => this.garage() });
    m.el.classList.add('side');
    this.modalEl.classList.add('side-open');
    m.el.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => {
      audio.click();
      const k = b.dataset.k;
      g[k] = k === 'finish' || k === 'livery' ? b.dataset.v : +b.dataset.v;
      m.el.querySelectorAll(`[data-k="${k}"]`).forEach((x) => x.classList.toggle('on', x === b));
      this.app.save();
      this.showActiveCar(0.3);
    });
    $('.num', m.el).onchange = (e) => { g.number = Math.max(1, Math.min(99, +e.target.value || 7)); this.app.save(); this.showActiveCar(0.3); };
    $('[data-done]', m.el).onclick = () => m.close();
    this.showActiveCar(0.3);
  }

  // ---------------------------------------------------------------------------
  tuning() {
    const a = this.app.activeCar();
    const g = a.entry, car = a.car;
    g.parts ||= {};
    this.showActiveCar(0.26);
    const st = a.stats;
    this.screenEl.innerHTML = `<div class="panel tuning"><h1>Tuning Shop</h1>
      <div class="t-car">${esc(car.name)} ${this.carBadge(car, st)}</div>
      <div class="t-stats"><div><span>Power</span><b class="ts-hp">${st.hp} hp</b></div><div><span>Weight</span><b>${st.kg} kg</b></div><div><span>Top speed</span><b>${st.topKmh} km/h</b></div><div><span>0-100</span><b>${st.accel0100}s</b></div><div><span>PR</span><b class="pr-big">${st.pr}</b></div></div>
      <div class="parts">${PARTS.map((p) => {
        const lvl = g.parts[p.key] || 0;
        const avail = partAvailable(car, p.key);
        const max = p.levels.length;
        const next = lvl < max ? p.levels[lvl] : null;
        const cost = next ? partCost(car, p.key, lvl + 1) : 0;
        let preview = '';
        if (next && avail) {
          const np = { ...g.parts, [p.key]: lvl + 1 };
          const ns = effectiveStats(car, np);
          const dPR = ns.pr - st.pr;
          preview = `<span class="gain">${dPR > 0 ? '+' + dPR + ' PR' : ''}${ns.hp > st.hp ? ` · +${ns.hp - st.hp} hp` : ''}${ns.kg < st.kg ? ` · -${st.kg - ns.kg} kg` : ''}${p.key === 'nitro' ? ' · Nitro boost' : ''}</span>`;
        }
        return `<div class="card part${avail ? '' : ' na'}" data-part="${p.key}">
          <div class="p-icon">${p.icon}</div>
          <div class="p-info"><div class="p-name">${esc(p.name)}</div><div class="p-desc">${avail ? esc(p.desc) : 'Not available for this car'}</div>
            <div class="pips">${p.levels.map((l, i) => `<i class="${i < lvl ? 'on' : ''}" title="${esc(l.name)}"></i>`).join('')}<span>${lvl ? esc(p.levels[lvl - 1].name) : 'Stock'}</span></div></div>
          <div class="p-buy">${avail && next ? `<div class="p-next">${esc(next.name)}</div>${preview}<button class="btn primary small${cost > this.profile.credits ? ' disabled' : ''}" data-buypart>${formatPrice(cost)}</button>` : avail ? '<span class="maxed">MAXED</span>' : ''}</div></div>`;
      }).join('')}</div></div>`;
    this.screenEl.querySelectorAll('[data-buypart]').forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      const key = b.closest('[data-part]').dataset.part;
      const lvl = (g.parts[key] || 0) + 1;
      const cost = partCost(car, key, lvl);
      if (cost > this.profile.credits) { audio.error(); this.toast(`You need ${formatPrice(cost - this.profile.credits)} more`); return; }
      this.profile.credits -= cost;
      g.parts[key] = lvl;
      g.partsSpent = (g.partsSpent || 0) + cost;
      this.app.save();
      audio.cash();
      const p = PARTS.find((x) => x.key === key);
      this.toast(`🔧 Installed <b>${esc(p.levels[lvl - 1].name)} ${esc(p.name)}</b>`, 'good');
      this.tuning();
      this.updateWallet();
    });
  }

  // ---------------------------------------------------------------------------
  settings() {
    const s = this.profile.settings;
    this.app.showroom.setFrame(0.3);
    const tog = (k, label, desc) => `<label class="toggle"><input type="checkbox" data-assist="${k}"${s.assists[k] ? ' checked' : ''}><span class="sw-ui"></span><div><b>${label}</b><small>${desc}</small></div></label>`;
    this.screenEl.innerHTML = `<div class="panel settings"><h1>Settings</h1>
      <div class="f-h">Graphics quality</div><p class="sub" style="margin-bottom:8px">Lite is the simplest and runs on any phone or Chromebook. Higher settings look better but need a stronger device.</p><div class="chips">${Object.entries(QUALITY).map(([k, q]) => `<button class="chip${this.app.gfx.qualityName === k ? ' on' : ''}" data-q="${k}">${q.name}</button>`).join('')}</div>
      <div class="f-h">Difficulty</div><div class="chips">${['easy', 'normal', 'hard'].map((d) => `<button class="chip${s.difficulty === d ? ' on' : ''}" data-diff="${d}">${d[0].toUpperCase() + d.slice(1)}</button>`).join('')}</div>
      <div class="f-h">Driving assists</div>
      <div class="toggles">
        ${tog('line', 'Racing line', 'Coloured line on the track: green = go, red = brake')}
        ${tog('autoGas', 'Auto accelerate', 'The car drives forward by itself: you just steer (and brake). Great on phones!')}
        ${tog('autoBrake', 'Auto brake', 'The car brakes for corners by itself (great for beginners)')}
        ${tog('steering', 'Steering assist', 'Helps catch slides')}
        ${tog('abs', 'ABS', 'Stops the wheels locking when braking hard')}
        ${tog('tcs', 'Traction control', 'Stops wheelspin when accelerating')}
        ${tog('stability', 'Stability control', 'Stops the car spinning out')}
      </div>
      <div class="f-h">Gearbox</div><div class="chips"><button class="chip${!s.manual ? ' on' : ''}" data-man="0">Automatic</button><button class="chip${s.manual ? ' on' : ''}" data-man="1">Manual (Q/E)</button></div>
      <div class="f-h">Speed units</div><div class="chips"><button class="chip${s.units === 'kmh' ? ' on' : ''}" data-units="kmh">km/h</button><button class="chip${s.units === 'mph' ? ' on' : ''}" data-units="mph">mph</button></div>
      <div class="f-h">Volume</div><input type="range" min="0" max="100" value="${Math.round(s.volume * 100)}" class="vol">
      <div class="f-h">Controls</div>${this.controlsHtml()}
      <div class="f-h">Save game</div><button class="btn danger" data-reset>Start over (erase progress)</button>
    </div>`;
    const E = this.screenEl;
    E.querySelectorAll('[data-q]').forEach((b) => b.onclick = () => { s.quality = b.dataset.q; window.__diag?.log('quality', b.dataset.q + ' (settings)'); this.app.setQuality(b.dataset.q); this.app.save(); E.querySelectorAll('[data-q]').forEach((x) => x.classList.toggle('on', x === b)); });
    E.querySelectorAll('[data-diff]').forEach((b) => b.onclick = () => { s.difficulty = b.dataset.diff; this.app.save(); E.querySelectorAll('[data-diff]').forEach((x) => x.classList.toggle('on', x === b)); });
    E.querySelectorAll('[data-assist]').forEach((c) => c.onchange = () => { s.assists[c.dataset.assist] = c.checked; this.app.save(); });
    E.querySelectorAll('[data-man]').forEach((b) => b.onclick = () => { s.manual = b.dataset.man === '1'; this.app.save(); E.querySelectorAll('[data-man]').forEach((x) => x.classList.toggle('on', x === b)); });
    E.querySelectorAll('[data-units]').forEach((b) => b.onclick = () => { s.units = b.dataset.units; this.app.save(); E.querySelectorAll('[data-units]').forEach((x) => x.classList.toggle('on', x === b)); });
    $('.vol', E).oninput = (e) => { s.volume = +e.target.value / 100; audio.setVolume(s.volume); this.app.save(); };
    $('[data-reset]', E).onclick = () => {
      const m = this.modal(`<h2>Erase everything?</h2><p>All your cars, money and career progress will be deleted.</p><div class="modal-actions"><button class="btn" data-no>Cancel</button><button class="btn danger" data-yes>ERASE</button></div>`);
      $('[data-no]', m.el).onclick = () => m.close();
      $('[data-yes]', m.el).onclick = () => { this.app.resetSave(); m.close(); this.show('home'); };
    };
  }

  // ---------------------------------------------------------------------------
  loading(title, sub) {
    let el = $('.loading', this.app.overlay);
    if (!el) { el = document.createElement('div'); el.className = 'loading'; this.app.overlay.appendChild(el); }
    el.innerHTML = `<div class="ld-inner"><div class="ld-kicker">${esc(sub || '')}</div><div class="ld-title">${esc(title)}</div><div class="ld-bar"><i></i></div><div class="ld-msg"></div>
      <div class="ld-tip">Tip: ${esc(TIPS[Math.floor(Math.random() * TIPS.length)])}</div></div>`;
    el.classList.add('show');
    return {
      set: (p, msg) => { $('.ld-bar i', el).style.width = Math.round(p * 100) + '%'; if (msg) $('.ld-msg', el).textContent = msg; },
      close: () => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); },
    };
  }

  pauseMenu(show, handlers) {
    let el = $('.pause', this.app.overlay);
    if (!show) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.className = 'pause'; this.app.overlay.appendChild(el); }
    el.innerHTML = `<div class="p-box"><h2>PAUSED</h2><button class="btn primary wide" data-a="resume">Resume</button><button class="btn wide" data-a="restart">Restart race</button><button class="btn wide" data-a="camera">Change camera</button><button class="btn wide" data-a="line">Racing line: ${this.profile.settings.assists.line ? 'ON' : 'OFF'}</button><button class="btn wide" data-a="quality">Graphics: ${QUALITY[this.app.gfx.qualityName]?.name || ''} (tap to change)</button><button class="btn wide danger" data-a="quit">Quit race</button>${this.controlsHtml()}</div>`;
    el.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => { audio.click(); handlers[b.dataset.a](); });
  }

  results(r, info) {
    const p = this.profile;
    this.setVisible(false);
    const el = document.createElement('div');
    el.className = 'results';
    const pos = r.position;
    const title = pos === 1 ? 'VICTORY!' : pos <= 3 ? 'PODIUM!' : `P${pos}`;
    el.innerHTML = `<div class="r-box">
      <div class="r-pos p${Math.min(pos, 4)}">${title}</div>
      <div class="r-sub">${esc(info.title)}</div>
      <table class="r-table"><thead><tr><th>Pos</th><th>Driver</th><th>Car</th><th>Time</th><th>Best lap</th></tr></thead><tbody>
      ${r.results.map((x, i) => `<tr class="${x.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td><i style="background:${x.color}"></i>${esc(x.isPlayer ? 'You' : x.name)}</td><td>${esc(x.car.name)}</td><td>${i === 0 ? fmtTime(x.time) : '+' + (x.time - r.results[0].time).toFixed(3)}</td><td>${fmtTime(x.best)}</td></tr>`).join('')}
      </tbody></table>
      <div class="r-money">${info.prize ? `<div>Prize money <b class="money">+${formatPrice(info.prize)}</b></div>` : '<div>No prize this time. Upgrade your car and try again!</div>'}
        ${info.bonus ? `<div class="bonus-line">🏆 Series complete bonus <b class="money">+${formatPrice(info.bonus)}</b></div>` : ''}
        ${info.unlocked ? `<div class="unlock-line">🔓 ${esc(info.unlocked)}</div>` : ''}
        <div class="r-total">Credits: <b>${formatPrice(p.credits)}</b></div>
        ${info.offerUpgrade ? '<div class="r-upgrade">That ran smoothly! Want nicer graphics? <button class="btn small" data-upgrade>Try better graphics</button></div>' : ''}</div>
      <div class="r-actions">${info.next ? '<button class="btn primary" data-a="next">NEXT RACE ›</button>' : ''}<button class="btn" data-a="again">Race again</button><button class="btn" data-a="menu">Continue</button></div></div>`;
    this.app.overlay.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    if (info.prize) setTimeout(() => audio.cash(), 500);
    el.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => { audio.click(); el.remove(); info.on[b.dataset.a](); });
    const up = el.querySelector('[data-upgrade]');
    if (up) up.onclick = () => { audio.click(); up.parentElement.remove(); info.offerUpgrade(); };
  }
}

const TIPS = [
  'Brake BEFORE the corner, then accelerate out of it.',
  'Turn on the Racing Line in Settings: green means go, red means brake!',
  'Upgrading tyres gives the biggest boost for corners.',
  'Hold N for a nitro boost if you have a Nitrous upgrade.',
  'Stay right behind a car on a straight to get a slipstream, then pass!',
  'Press C to try different cameras. The hood camera feels super fast!',
  'Press R if you get stuck or spin off the track.',
  'Kerbs (the red and white stripes) are fine to drive on, but grass and gravel slow you down.',
  'Weight reduction makes your car faster everywhere.',
  'Formula Elite cars have so much downforce they corner faster at high speed!',
  'Each tier unlocks when you finish in the top 3 of a race in the tier before.',
];
