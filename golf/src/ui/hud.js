// In-round heads-up display, broadcast-graphics style.
import { YD } from '../sim/hole.js';
import { CLUBS } from '../data/equipment.js';
import { esc, fmtToPar, toParClass } from './dom.js';
import { drawHoleMap } from './holemap.js';

const MM_W = 132, MM_H = 224;

export class HUD {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.round = null;
    root.innerHTML = `
      <div class="hud-top">
        <div class="holecard panel" id="hc">
          <div class="hc-row1"><span class="hc-hole" id="hcHole">HOLE 1</span><span class="hc-par" id="hcPar">PAR 4</span><span class="hc-yds" id="hcYds">400 YDS</span></div>
          <div class="hc-row2"><span>Shot <b id="hcShot">1</b></span><span>Today <b id="hcToday" class="tp-even">E</b></span><span id="hcPos"></span><span id="hcPressure" class="pressure" hidden>Pressure</span></div>
        </div>
        <div class="lie panel" id="lie"><span class="lie-name" id="lieName">Tee Box</span><span class="lie-pct" id="liePct"></span><span class="lie-notes" id="lieNotes"></span></div>
        <div class="lbstrip panel" id="lbStrip" hidden></div>
      </div>
      <div class="minimap panel" id="mm">
        <canvas id="mmBase" width="${MM_W * 2}" height="${MM_H * 2}"></canvas>
        <canvas id="mmOver" width="${MM_W * 2}" height="${MM_H * 2}"></canvas>
        <div class="mm-cap">Tap the map to aim</div>
      </div>
      <div class="hud-bottom">
        <div class="clubbox panel">
          <button class="icon-btn" data-h="clubDown" aria-label="Previous club">&#9664;</button>
          <div class="club-mid">
            <div class="club-model" id="clubModel"></div>
            <div class="club-name" id="clubName">Driver</div>
            <div class="club-carry" id="clubCarry">Full carry 275 yds</div>
          </div>
          <button class="icon-btn" data-h="clubUp" aria-label="Next club">&#9654;</button>
          <div class="ball-name" id="ballName"></div>
        </div>
        <div class="distbox panel">
          <div class="dist-main"><b id="distPin">400</b><span id="distUnit"> yds to pin</span></div>
          <div class="dist-sub" id="distSub">plays 410</div>
          <div class="wind"><div class="wind-arrow" id="windArrow">&#10148;</div><span id="windTxt">8 mph</span></div>
        </div>
        <div class="btnrow">
          <button class="hbtn" data-h="shape" id="btnShape" title="Shot shape (S)"><span class="shape-ball"><i id="shapeDot"></i></span>Shape</button>
          <button class="hbtn" data-h="view" id="btnView" title="Camera view (V)">View</button>
          <button class="hbtn" data-h="grid" id="btnGrid" title="Green slope grid (G)" hidden>Grid</button>
          <button class="hbtn" data-h="scale" id="btnScale" title="Putter range (R)" hidden>Range</button>
          <button class="hbtn" data-h="card" title="Scorecard (C)">Card</button>
          <button class="hbtn" data-h="board" id="btnBoard" title="Leaderboard (L)" hidden>Board</button>
          <button class="hbtn" data-h="sim" title="Simulate this hole with your stats">Sim hole</button>
          <button class="hbtn" data-h="pause" title="Menu (Esc)">Menu</button>
        </div>
      </div>
      <div class="aimbtns">
        <button class="aim-btn" data-hold="left" aria-label="Aim left">&#9664;</button>
        <button class="aim-btn" data-hold="right" aria-label="Aim right">&#9654;</button>
      </div>
      <div class="shape-pop panel" id="shapePop" hidden>
        <div class="shape-title">Strike point</div>
        <div class="shape-pad" id="shapePad"><i id="shapePadDot"></i><span class="sp-t">Low / less spin</span><span class="sp-b">High / more spin</span><span class="sp-l">Draw</span><span class="sp-r">Fade</span></div>
        <button class="hbtn" data-h="shapeReset">Center</button>
      </div>
      <div class="swing-hint" id="swingHint">Press and <b>pull down</b> to swing back, then <b>push straight up</b> through the ball</div>
      <div class="meter" id="meter" hidden>
        <div class="meter-bar"><div class="meter-fill" id="meterFill"></div><div class="meter-100"></div></div>
        <div class="meter-txt" id="meterTxt">0%</div>
      </div>
      <svg class="swing-trail" id="swingTrail"><polyline id="trailLine" points=""/></svg>
      <div class="msg" id="msg" hidden><div class="msg-title" id="msgTitle"></div><div class="msg-sub" id="msgSub"></div></div>
      <div class="stats panel" id="shotStats" hidden></div>
      <div class="intro panel" id="intro" hidden></div>
      <div class="holeres" id="holeRes" hidden></div>
      <div class="loading" id="loading" hidden><div class="spinner"></div><div id="loadingTxt"></div></div>
    `;
    this.$ = (id) => root.querySelector('#' + id);
    this.mmBase = this.$('mmBase');
    this.mmOver = this.$('mmOver');
    this.bind();
  }

  bind() {
    const root = this.root;
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-h]');
      if (!b || !this.round) return;
      this.app.onHudAction(b.dataset.h);
    });
    // Hold-to-aim buttons
    root.querySelectorAll('[data-hold]').forEach((btn) => {
      const dir = btn.dataset.hold === 'left' ? -1 : 1;
      const start = (e) => { e.preventDefault(); this.app.aimHold = dir; };
      const stop = () => { if (this.app.aimHold === dir) this.app.aimHold = 0; };
      btn.addEventListener('pointerdown', start);
      btn.addEventListener('pointerup', stop);
      btn.addEventListener('pointerleave', stop);
      btn.addEventListener('pointercancel', stop);
    });
    // Minimap aiming
    this.mmOver.addEventListener('pointerdown', (e) => {
      if (!this.round || !this.mm) return;
      const r = this.mmOver.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * MM_W;
      const py = ((e.clientY - r.top) / r.height) * MM_H;
      const w = this.mmToWorld(px, py);
      this.round.aimAt(w.x, w.z);
    });
    // Shot shape pad
    const pad = this.$('shapePad');
    const setFrom = (e) => {
      const r = pad.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 2 - 1;
      const y = ((e.clientY - r.top) / r.height) * 2 - 1;
      const l = Math.hypot(x, y);
      const k = l > 1 ? 1 / l : 1;
      if (this.round) this.round.setShape({ x: x * k, y: y * k });
    };
    pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); setFrom(e); });
    pad.addEventListener('pointermove', (e) => { if (e.buttons) setFrom(e); });
  }

  attach(round) {
    this.round = round;
    this.root.hidden = false;
    this.$('btnBoard').hidden = !round.opts.tournament;
    this.$('lbStrip').hidden = !round.opts.tournament;
    this.$('ballName').textContent = round.ball.name;
  }

  detach() {
    this.round = null;
    this.root.hidden = true;
  }

  loading(text) {
    this.$('loadingTxt').textContent = text;
    this.$('loading').hidden = false;
  }
  loaded() { this.$('loading').hidden = true; }

  units() { return this.app.settings.units; }
  d(m, small = false) {
    if (this.units() === 'meters') return small && m < 20 ? m.toFixed(1) : String(Math.round(m));
    if (small && m / YD < 20) return String(Math.round(m / 0.3048));
    return String(Math.round(m / YD));
  }
  u(m, small = false) {
    if (this.units() === 'meters') return 'm';
    return small && m / YD < 20 ? 'ft' : 'yds';
  }

  setHole(hole, course, strokes, toPar) {
    this.$('hcHole').textContent = `HOLE ${hole.index + 1}`;
    this.$('hcPar').textContent = `PAR ${hole.par}`;
    this.$('hcYds').textContent = this.units() === 'meters' ? `${Math.round(hole.yards * YD)} M` : `${hole.yards} YDS`;
    this.setStrokes(strokes);
    this.setToday(toPar);
    this.updateBoard();
  }
  setStrokes(n) { this.$('hcShot').textContent = String(n + 1); }
  setToday(tp) {
    const el = this.$('hcToday');
    el.textContent = fmtToPar(tp);
    el.className = toParClass(tp);
  }

  setLie(info) {
    this.$('lieName').textContent = info.name;
    this.$('liePct').textContent = info.pct ? `${info.pct}` : '';
    this.$('lieNotes').textContent = info.notes.join(' · ');
    this.$('lie').dataset.lie = info.lie;
  }

  setPutting(p) {
    this.$('btnGrid').hidden = !p;
    this.$('btnScale').hidden = !p;
    this.$('btnShape').hidden = p;
    if (p) this.$('shapePop').hidden = true;
  }
  setGrid(on) { this.$('btnGrid').classList.toggle('on', on); }
  setView(v) { this.$('btnView').textContent = v === 'address' ? 'View' : v === 'overhead' ? 'Overhead' : 'Target'; }

  setShape(s) {
    const dot = this.$('shapeDot');
    dot.style.transform = `translate(${s.x * 7}px, ${s.y * 7}px)`;
    const pd = this.$('shapePadDot');
    pd.style.left = `${50 + s.x * 42}%`;
    pd.style.top = `${50 + s.y * 42}%`;
    this.$('btnShape').classList.toggle('on', Math.abs(s.x) > 0.05 || Math.abs(s.y) > 0.05);
  }
  toggleShape() { this.$('shapePop').hidden = !this.$('shapePop').hidden; }

  setShot(info) {
    this.shot = info;
    const c = info.club;
    this.$('clubName').textContent = c.name;
    this.$('clubModel').textContent = info.model ? `${info.model.brand} ${info.model.name}` : '';
    if (info.putting) this.$('clubCarry').textContent = `Putter range ${this.d(info.puttScale)} ${this.u(info.puttScale)}`;
    else this.$('clubCarry').textContent = info.carry ? `Full carry ${this.d(info.carry)} ${this.u(info.carry)}` : '';
    const small = info.putting;
    this.$('distPin').textContent = this.d(info.dist, small);
    this.$('distUnit').textContent = ` ${this.u(info.dist, small)} to pin`;
    const elevTxt = Math.abs(info.elev) >= 0.3 ? `${info.elev > 0 ? 'Up' : 'Down'} ${this.units() === 'meters' ? Math.abs(info.elev).toFixed(1) + ' m' : Math.round(Math.abs(info.elev) / 0.3048) + ' ft'}` : 'Level';
    this.$('distSub').textContent = info.putting ? elevTxt : `Plays ${this.d(info.playsLike)} · ${elevTxt}`;
    this.$('windTxt').textContent = this.units() === 'meters' ? `${(info.windMph * 0.447).toFixed(1)} m/s` : `${Math.round(info.windMph)} mph`;
    const pr = this.$('hcPressure');
    pr.hidden = !(info.pressure > 0);
  }

  showSwingHint(v) {
    // Coach the first two swings, then get out of the way
    this.$('swingHint').hidden = !v || (this.app.swingsDone || 0) >= 2;
  }

  // Swing meter
  meterShow(x, y) {
    const m = this.$('meter');
    m.hidden = false;
    m.style.left = `${x + 34}px`;
    m.style.top = `${Math.max(10, y - 20)}px`;
    this.meterSet(0);
  }
  meterSet(p, phase = 'back') {
    const fill = this.$('meterFill');
    fill.style.height = `${Math.min(110, p * 100) / 1.1}%`;
    fill.classList.toggle('over', p > 1.0);
    fill.classList.toggle('down', phase === 'down');
    this.meterPct = p;
    this.updateMeterText();
  }
  setPowerCarry(m, putt) {
    this.meterCarry = m;
    this.meterPutt = putt;
    this.updateMeterText();
  }
  updateMeterText() {
    const p = this.meterPct || 0;
    const m = this.meterCarry;
    const dist = m != null ? `${this.d(m, this.meterPutt)} ${this.u(m, this.meterPutt)}` : '';
    this.$('meterTxt').innerHTML = `<b>${Math.round(p * 100)}%</b><span>${dist}</span>`;
  }
  meterHide() { this.$('meter').hidden = true; this.trail([]); }
  trail(points, quality = 0) {
    const pl = this.$('trailLine');
    pl.setAttribute('points', points.map((p) => `${p.x},${p.y}`).join(' '));
    pl.setAttribute('class', quality > 10 ? 'bad' : quality > 3 ? 'meh' : 'good');
  }

  message(title, sub = '', tone = 'neutral') {
    const m = this.$('msg');
    this.$('msgTitle').textContent = title;
    this.$('msgSub').textContent = sub;
    m.dataset.tone = tone;
    m.hidden = false;
    m.classList.remove('pop');
    void m.offsetWidth;
    m.classList.add('pop');
    clearTimeout(this._msgT);
    this._msgT = setTimeout(() => { m.hidden = true; }, 2400);
  }

  showShotStats(s) {
    const el = this.$('shotStats');
    const u = this.units();
    const dist = (m) => (u === 'meters' ? `${m.toFixed(1)} m` : `${(m / YD).toFixed(1)} yds`);
    const rows = s.putt
      ? [['Ball speed', `${s.ballSpeed.toFixed(1)} mph`], ['Roll', dist(s.total)]]
      : [
          ['Ball speed', `${s.ballSpeed.toFixed(1)} mph`],
          ['Launch', `${s.launch.toFixed(1)}°`],
          ['Spin', `${Math.round(s.spin).toLocaleString()} rpm`],
          ['Carry', dist(s.carry)],
          ['Total', dist(s.total)],
          ['Height', u === 'meters' ? `${s.apex.toFixed(0)} m` : `${Math.round(s.apex / 0.3048)} ft`],
          ['Curve', `${dist(Math.abs(s.curve))} ${s.curve > 0.5 ? 'R' : s.curve < -0.5 ? 'L' : ''}`],
          ['Land angle', s.landAngle != null ? `${s.landAngle.toFixed(0)}°` : '—'],
        ];
    const dev = s.dev || 0;
    const swingTxt = Math.abs(dev) < 3 ? 'Pure strike' : `Swing path ${Math.abs(dev).toFixed(0)}° ${dev > 0 ? 'right' : 'left'}`;
    el.innerHTML = `<div class="st-head">${esc(s.club)}<span>${esc(swingTxt)}</span></div>${rows.map(([k, v]) => `<div class="st-row"><span>${k}</span><b>${v}</b></div>`).join('')}${s.note ? `<div class="st-note">${esc(s.note)}</div>` : ''}`;
    el.hidden = false;
    clearTimeout(this._stT);
    this._stT = setTimeout(() => { el.hidden = true; }, 5200);
  }

  hideTransient() {
    this.$('shapePop').hidden = true;
  }

  showIntro(hole, course, wind) {
    const el = this.$('intro');
    const d = hole.describe();
    const yds = this.units() === 'meters' ? `${Math.round(hole.yards * YD)} m` : `${hole.yards} yds`;
    el.innerHTML = `
      <div class="in-num">${hole.index + 1}</div>
      <div class="in-body">
        <div class="in-title">Par ${hole.par} · ${yds}</div>
        <div class="in-sub">${esc(d.shape)} · ${esc(d.elevText)} · Stroke index ${hole.info.si}</div>
        <div class="in-sub">${d.hazards.length ? esc(d.hazards.join(' · ')) : 'No hazards in play'}</div>
        <div class="in-course">${esc(course.name)}</div>
      </div>
      <div class="in-skip">Tap to skip</div>`;
    el.hidden = false;
  }
  hideIntro() { this.$('intro').hidden = true; }

  holeResult(strokes, par, name, toPar) {
    const el = this.$('holeRes');
    const rel = strokes - par;
    const cls = rel <= -2 ? 'eagle' : rel === -1 ? 'birdie' : rel === 0 ? 'par' : rel === 1 ? 'bogey' : 'double';
    el.className = `holeres ${cls}`;
    el.innerHTML = `<div class="hr-name">${esc(name)}</div><div class="hr-sub">${strokes} on a par ${par} · Today ${fmtToPar(toPar)}</div>`;
    el.hidden = false;
    this.$('msg').hidden = true;
    this.setToday(toPar);
    clearTimeout(this._hrT);
    this._hrT = setTimeout(() => { el.hidden = true; }, 2500);
    this.updateBoard();
  }

  updateBoard() {
    const r = this.round;
    const el = this.$('lbStrip');
    if (!r || !r.opts.tournament || !r.opts.leaderboardFn) return;
    const lb = r.opts.leaderboardFn();
    const me = lb.find((x) => x.human);
    const nameOf = this.app.nameOf;
    const top = lb.slice(0, 5);
    if (me && !top.includes(me)) top.push(me);
    el.innerHTML = `<div class="lb-title">${esc(r.opts.tournament.name)} · R${r.opts.tournament.round + 1}</div>` + top.map((x) => `
      <div class="lb-row${x.human ? ' me' : ''}"><span class="lb-pos">${x.pos}</span><span class="lb-name">${esc(x.human ? 'You' : nameOf(x.id, true))}</span><span class="lb-tp ${toParClass(x.toPar)}">${fmtToPar(x.toPar)}</span><span class="lb-thru">${x.thru === 18 ? 'F' : x.thru || '-'}</span></div>`).join('');
    const pos = me ? me.pos : '';
    this.$('hcPos').textContent = pos ? `Pos ${pos}` : '';
  }

  // ---------------- minimap ----------------
  buildMinimap(hole) {
    const g = this.mmBase.getContext('2d');
    this.mm = drawHoleMap(g, hole, MM_W, MM_H, { sc: 2 });
  }

  mmToWorld(px, py) { return this.mm.toWorld(px, py); }
  worldToMm(x, z) { return this.mm.toMap(x, z); }

  drawMinimapOverlay(round) {
    if (!this.mm || !round.hole) return;
    const g = this.mmOver.getContext('2d');
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.clearRect(0, 0, MM_W, MM_H);
    const h = round.hole;
    const pin = this.worldToMm(h.pin.x, h.pin.z);
    const b = round.flight && round.phase === 'flight' && round.flight.p ? round.flight.p : round.ballPos;
    const bp = this.worldToMm(b.x, b.z);
    if (round.phase === 'aim' && round.pred && !round.putting) {
      const lp = this.worldToMm(round.pred.land.x, round.pred.land.z);
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 1.2;
      g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(bp.x, bp.y); g.lineTo(lp.x, lp.y); g.stroke();
      g.setLineDash([]);
      g.beginPath(); g.arc(lp.x, lp.y, 4, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = '#f2c230';
    g.fillRect(pin.x - 0.6, pin.y - 7, 1.2, 7);
    g.beginPath(); g.moveTo(pin.x + 0.6, pin.y - 7); g.lineTo(pin.x + 5, pin.y - 5.5); g.lineTo(pin.x + 0.6, pin.y - 4); g.fill();
    g.fillStyle = '#fff';
    g.strokeStyle = '#000';
    g.lineWidth = 1;
    g.beginPath(); g.arc(bp.x, bp.y, 2.6, 0, Math.PI * 2); g.fill(); g.stroke();
  }

  frame(round, dt) {
    if (!round || !round.hole) return;
    this.drawMinimapOverlay(round);
    // wind arrow relative to the camera
    const cam = this.app.world.camera;
    const dir = cam.getWorldDirection(this._v || (this._v = cam.position.clone()));
    const camH = Math.atan2(dir.x, -dir.z);
    const rel = round.wind.dir - camH;
    this.$('windArrow').style.transform = `rotate(${(rel * 180) / Math.PI - 90}deg)`;
  }
}

export function clubList() {
  return CLUBS;
}
