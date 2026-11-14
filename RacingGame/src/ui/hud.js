// In-race HUD: position, laps, timing tower, minimap, LED tachometer with
// shift lights, speed, gear, nitro, assists, start lights and messages.
export function fmtTime(t) {
  if (!t || !isFinite(t)) return '-:--.---';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}
const code = (name) => {
  const last = name.split(' ').pop().replace(/[^A-Za-z]/g, '');
  return last.slice(0, 3).toUpperCase();
};

export class HUD {
  constructor(container, track, { units = 'kmh' } = {}) {
    this.units = units;
    const el = document.createElement('div');
    el.className = 'hud';
    el.innerHTML = `
      <div class="hud-tl">
        <div class="hud-pos"><span class="p-label">POS</span><span class="p-val">-</span><span class="p-of">/ -</span></div>
        <div class="hud-lap"><span class="l-label">LAP</span><span class="l-val">-</span></div>
        <div class="hud-tower"></div>
      </div>
      <div class="hud-tr">
        <div class="hud-times">
          <div><span>TIME</span><b class="t-cur">-</b></div>
          <div><span>LAST</span><b class="t-last">-</b></div>
          <div><span>BEST</span><b class="t-best">-</b></div>
        </div>
        <div class="hud-map"><svg viewBox="0 0 200 200"></svg></div>
      </div>
      <div class="hud-br">
        <canvas class="hud-tach" width="300" height="300"></canvas>
        <div class="hud-nitro"><div class="n-fill"></div><span>N₂O</span></div>
      </div>
      <div class="hud-dig"><b class="d-gear">N</b><div class="d-sp"><span class="d-spd">0</span><small>${units === 'mph' ? 'MPH' : 'KM/H'}</small></div><i class="d-n"><i></i></i></div>
      <div class="hud-bl"><span class="as as-abs">ABS</span><span class="as as-tcs">TCS</span><span class="as as-cam"></span></div>
      <div class="hud-lights"><div class="pod"><i></i><i></i></div><div class="pod"><i></i><i></i></div><div class="pod"><i></i><i></i></div><div class="pod"><i></i><i></i></div><div class="pod"><i></i><i></i></div></div>
      <div class="hud-msg"></div>
      <div class="hud-toast"></div>
      <div class="hud-wrong">WRONG WAY</div>`;
    container.appendChild(el);
    this.el = el;
    this.q = (s) => el.querySelector(s);
    this.posVal = this.q('.p-val'); this.posOf = this.q('.p-of');
    this.lapVal = this.q('.l-val');
    this.tCur = this.q('.t-cur'); this.tLast = this.q('.t-last'); this.tBest = this.q('.t-best');
    this.tower = this.q('.hud-tower');
    this.nitroFill = this.q('.n-fill'); this.nitroEl = this.q('.hud-nitro');
    this.absEl = this.q('.as-abs'); this.tcsEl = this.q('.as-tcs'); this.camEl = this.q('.as-cam');
    this.lightsEl = this.q('.hud-lights');
    this.msgEl = this.q('.hud-msg'); this.toastEl = this.q('.hud-toast'); this.wrongEl = this.q('.hud-wrong');
    this.tach = this.q('.hud-tach');
    this.tctx = this.tach.getContext('2d');
    // small speed/gear readout that replaces the big dial on short phone screens
    this.dig = this.q('.hud-dig'); this.dGear = this.q('.d-gear'); this.dSpd = this.q('.d-spd'); this.dN = this.q('.d-n'); this.dNf = this.q('.d-n i');
    this.compact = false; this.compactT = 0; this._dg = ''; this._ds = -1;
    this.buildMap(track);
    this.textTimer = 0;
    this.msgTimer = 0; this.toastTimer = 0;
  }

  buildMap(track) {
    const svg = this.q('.hud-map svg');
    const B = track.bounds;
    const w = B.maxx - B.minx, h = B.maxz - B.minz, sc = 180 / Math.max(w, h);
    this.mapTf = (x, z) => [100 + (x - (B.minx + B.maxx) / 2) * sc, 100 - (z - (B.minz + B.maxz) / 2) * sc];
    let d = '';
    for (let i = 0; i <= track.N; i += 3) {
      const k = i % track.N;
      const [x, y] = this.mapTf(track.x[k], track.z[k]);
      d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    const [sx, sy] = this.mapTf(track.x[0], track.z[0]);
    svg.innerHTML = `<path d="${d}Z" class="m-out"/><path d="${d}Z" class="m-in"/><circle cx="${sx}" cy="${sy}" r="3.5" class="m-start"/><g class="m-cars"></g>`;
    this.mapCars = svg.querySelector('.m-cars');
    this.mapDots = [];
  }

  setLights(n, out = false) {
    const pods = this.lightsEl.querySelectorAll('.pod');
    this.lightsEl.classList.toggle('show', n > 0 || out);
    pods.forEach((p, i) => p.classList.toggle('on', i < n));
  }

  message(text, dur = 1.8, cls = '') {
    this.msgEl.textContent = text;
    this.msgEl.className = 'hud-msg show ' + cls;
    this.msgTimer = dur;
  }
  toast(text, dur = 2.2, cls = '') {
    this.toastEl.innerHTML = text;
    this.toastEl.className = 'hud-toast show ' + cls;
    this.toastTimer = dur;
  }

  update(dt, race, player, info) {
    // timers
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) this.msgEl.classList.remove('show'); }
    if (this.toastTimer > 0) { this.toastTimer -= dt; if (this.toastTimer <= 0) this.toastEl.classList.remove('show'); }
    this.compactT -= dt;
    if (this.compactT <= 0) { this.compactT = 0.5; this.compact = this.dig.offsetWidth > 0; }
    if (this.compact) this.drawDigital(info); else this.drawTach(info);
    this.textTimer -= dt;
    if (this.textTimer > 0) return;
    this.textTimer = 1 / 15;
    const n = race.entrants.length;
    this.posVal.textContent = player.position || '-';
    this.posOf.textContent = '/ ' + n;
    const lap = Math.max(1, Math.min(race.laps, player.lap || 1));
    this.lapVal.textContent = `${lap}/${race.laps}`;
    const cur = race.state === 'racing' || race.state === 'finished' ? race.time - player.lapStart : 0;
    this.tCur.textContent = player.finished ? fmtTime(player.finishTime) : fmtTime(cur);
    this.tLast.textContent = fmtTime(player.lastLap);
    this.tBest.textContent = fmtTime(player.bestLap);
    // nitro
    if (info.nitroMax > 0) {
      this.nitroEl.style.display = '';
      this.nitroFill.style.width = `${(info.nitro / info.nitroMax) * 100}%`;
      this.nitroEl.classList.toggle('on', info.nitroOn);
      this.dN.style.display = ''; this.dNf.style.width = `${(info.nitro / info.nitroMax) * 100}%`;
    } else { this.nitroEl.style.display = 'none'; this.dN.style.display = 'none'; }
    this.absEl.classList.toggle('active', !!info.absActive);
    this.tcsEl.classList.toggle('active', !!info.tcsActive);
    this.absEl.classList.toggle('off', !info.abs);
    this.tcsEl.classList.toggle('off', !info.tcs);
    this.camEl.textContent = info.cameraName || '';
    this.wrongEl.classList.toggle('show', !!info.wrongWay);
    // timing tower
    const order = race.order || race.entrants;
    let html = '';
    order.forEach((e, i) => {
      const gap = i === 0 ? 'Leader' : e.finished ? 'Finished' : '+' + race.gapToLeader(e).toFixed(1);
      html += `<div class="tw-row${e.isPlayer ? ' me' : ''}"><b>${i + 1}</b><i style="background:${e.color}"></i><span>${e.isPlayer ? 'YOU' : code(e.name)}</span><em>${gap}</em></div>`;
    });
    this.tower.innerHTML = html;
    // minimap
    while (this.mapDots.length < order.length) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('r', '4');
      this.mapCars.appendChild(c);
      this.mapDots.push(c);
    }
    race.entrants.forEach((e, i) => {
      const p = e.veh ? e.veh : e.ai;
      const [x, y] = this.mapTf(p.x, p.z);
      const c = this.mapDots[i];
      c.setAttribute('cx', x.toFixed(1)); c.setAttribute('cy', y.toFixed(1));
      c.setAttribute('fill', e.isPlayer ? '#ffffff' : e.color);
      c.setAttribute('r', e.isPlayer ? '5.5' : '3.6');
      c.setAttribute('class', e.isPlayer ? 'me' : '');
    });
  }

  drawDigital(info) {
    const g = String(info.gear);
    if (g !== this._dg) { this._dg = g; this.dGear.textContent = g; }
    this.dGear.classList.toggle('lim', !!info.limiter);
    const spd = Math.round(this.units === 'mph' ? info.speed * 2.23694 : info.speed * 3.6);
    if (spd !== this._ds) { this._ds = spd; this.dSpd.textContent = String(spd); }
  }

  drawTach(info) {
    const c = this.tctx, W = 300, cx = 150, cy = 158, R = 118;
    c.clearRect(0, 0, W, W);
    const red = info.redline || 7000;
    const maxR = Math.ceil((red * 1.08) / 1000) * 1000;
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    const ang = (r) => a0 + (a1 - a0) * Math.min(1, r / maxR);
    // backdrop
    const g = c.createRadialGradient(cx, cy, 20, cx, cy, R + 24);
    g.addColorStop(0, 'rgba(10,14,22,0.82)'); g.addColorStop(1, 'rgba(10,14,22,0.35)');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R + 22, 0, Math.PI * 2); c.fill();
    // track arc
    c.lineCap = 'butt';
    c.lineWidth = 14;
    c.strokeStyle = 'rgba(255,255,255,0.1)';
    c.beginPath(); c.arc(cx, cy, R, a0, a1); c.stroke();
    // redline zone
    c.strokeStyle = 'rgba(255,40,60,0.55)';
    c.beginPath(); c.arc(cx, cy, R, ang(red * 0.97), a1); c.stroke();
    // rpm fill (segmented)
    const rpm = info.rpm || 0;
    const segs = 48;
    for (let i = 0; i < segs; i++) {
      const r0 = (i / segs) * maxR;
      if (r0 > rpm) break;
      const fr = r0 / red;
      c.strokeStyle = fr > 0.94 ? '#ff2d55' : fr > 0.8 ? '#ffb300' : '#2df5c8';
      c.beginPath(); c.arc(cx, cy, R, ang(r0) + 0.005, ang(r0 + maxR / segs) - 0.012); c.stroke();
    }
    // ticks + labels
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.font = '600 15px "Titillium Web", Arial, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const step = maxR > 12000 ? 2000 : 1000;
    for (let r = 0; r <= maxR; r += step) {
      const a = ang(r);
      c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * (R - 10), cy + Math.sin(a) * (R - 10)); c.lineTo(cx + Math.cos(a) * (R - 20), cy + Math.sin(a) * (R - 20)); c.stroke();
      c.fillText(String(r / 1000), cx + Math.cos(a) * (R - 34), cy + Math.sin(a) * (R - 34));
    }
    // needle
    const an = ang(rpm);
    c.strokeStyle = '#ff2d55'; c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(cx + Math.cos(an) * 26, cy + Math.sin(an) * 26); c.lineTo(cx + Math.cos(an) * (R + 6), cy + Math.sin(an) * (R + 6)); c.stroke();
    // shift lights
    const leds = 10;
    for (let i = 0; i < leds; i++) {
      const th = 0.72 + (i / leds) * 0.26;
      const lit = rpm / red > th;
      const flash = rpm / red > 0.97 && Math.floor(performance.now() / 70) % 2;
      const col = i < 4 ? '#2bff88' : i < 7 ? '#ff3344' : '#3d7bff';
      c.fillStyle = lit ? (flash ? '#ffffff' : col) : 'rgba(255,255,255,0.12)';
      c.beginPath(); c.arc(cx - 81 + i * 18, 22, 6, 0, Math.PI * 2); c.fill();
    }
    // gear + speed
    const gear = info.gear;
    c.fillStyle = info.limiter ? '#ff2d55' : '#ffffff';
    c.font = 'italic 900 86px "Titillium Web", Arial, sans-serif';
    c.fillText(gear, cx, cy - 6);
    const spd = this.units === 'mph' ? info.speed * 2.23694 : info.speed * 3.6;
    c.font = '700 40px "Titillium Web", Arial, sans-serif';
    c.fillStyle = '#ffffff';
    c.fillText(String(Math.round(spd)), cx, cy + 62);
    c.font = '600 13px "Titillium Web", Arial, sans-serif';
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillText(this.units === 'mph' ? 'MPH' : 'KM/H', cx, cy + 88);
  }

  dispose() { this.el.remove(); }
}
