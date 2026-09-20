/**
 * HEADS-UP DISPLAY
 * ------------------------------------------------------------------
 * Reads the match and the player's mech every frame and writes into the
 * static DOM defined in index.html. Nothing here mutates game state.
 *
 * The expensive parts (killfeed rows, weapon slots, respawn cards) are
 * only rebuilt when their underlying data actually changes.
 */
import * as THREE from 'three';
import { LOCATIONS, LOCATION_NAMES, MECH_BY_ID } from '../data/mechs.js';
import { SKIN_BY_ID, DEFAULT_SKIN } from '../data/skins.js';
import { TEAM_COLORS } from '../game/match.js';
import { clamp, lerp } from '../core/rng.js';

const $ = (id) => document.getElementById(id);

/* Paper-doll geometry: one rect per section, drawn as inline SVG. */
const DOLL = {
  HD: { x: 30, y: 2,  w: 14, h: 11 },
  CT: { x: 26, y: 15, w: 22, h: 32 },
  LT: { x: 12, y: 15, w: 12, h: 28 },
  RT: { x: 50, y: 15, w: 12, h: 28 },
  LA: { x: 1,  y: 17, w: 9,  h: 36 },
  RA: { x: 64, y: 17, w: 9,  h: 36 },
  LL: { x: 24, y: 49, w: 11, h: 38 },
  RL: { x: 39, y: 49, w: 11, h: 38 },
};

export class HUD {
  constructor(engine, audio) {
    this.engine = engine;
    this.audio = audio;
    this.root = $('hud');
    this.el = {
      reticle: $('reticle'), spread: $('ret-spread'), lock: $('ret-lock'), lockArc: $('ret-lock-arc'),
      hitMarker: $('hit-marker'), vignette: $('damage-vignette'),
      heatWarn: $('heat-warning'), shutdown: $('shutdown-banner'),
      scoreA: $('score-a'), scoreB: $('score-b'), timer: $('timer'), modeLabel: $('mode-label'),
      objectives: $('objectives'), killfeed: $('killfeed'), toast: $('event-toast'),
      paperdoll: $('paperdoll'),
      barHp: $('bar-hp'), valHp: $('val-hp'),
      barShield: $('bar-shield'), valShield: $('val-shield'),
      barHeat: $('bar-heat'), valHeat: $('val-heat'), redline: $('heat-redline'),
      barJets: $('bar-jets'), valJets: $('val-jets'),
      weapons: $('weapon-panel'),
      abilityPanel: $('ability-panel'), abilityIcon: $('ability-icon'),
      abilityName: $('ability-name'), abilityKey: $('ability-key'), abilityCd: $('ability-cd'),
      radar: $('radar'), radarCanvas: $('radar-canvas'),
      speed: $('speed-val'),
      respawn: $('respawn-overlay'), respawnKiller: $('respawn-killer'), respawnChoices: $('respawn-choices'),
      scoreboard: $('scoreboard'),
      fps: $('fps'),
    };
    this.ctx2d = this.el.radarCanvas.getContext('2d');
    this._weaponRows = [];
    this._feedRows = [];
    this._dollParts = {};
    this._lastMech = null;
    this._damageFlash = 0;
    this._hitFlash = 0;
    this._toastTimer = 0;
    this.markers = [];
    this._buildDoll();
    this._screenPos = new THREE.Vector3();
  }

  show() { this.root.classList.remove('hidden'); this.root.setAttribute('aria-hidden', 'false'); }
  hide() { this.root.classList.add('hidden'); this.root.setAttribute('aria-hidden', 'true'); }

  _buildDoll() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 74 88');
    for (const [loc, d] of Object.entries(DOLL)) {
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('x', d.x); r.setAttribute('y', d.y);
      r.setAttribute('width', d.w); r.setAttribute('height', d.h);
      r.setAttribute('rx', 2);
      r.setAttribute('class', 'pd-part');
      r.setAttribute('fill', '#3ce08a');
      svg.appendChild(r);
      this._dollParts[loc] = r;
    }
    this.el.paperdoll.innerHTML = '';
    this.el.paperdoll.appendChild(svg);
  }

  /* ================================================================ */
  update(match, mech, controller, dt) {
    this._updateTop(match);
    this._updateObjectives(match);
    this._updateFeed(match);
    this._updateToast(dt);
    this._updateFps();

    if (!mech || !mech.alive) {
      this.el.reticle.style.opacity = '0';
      this.el.heatWarn.classList.add('hidden');
      this.el.shutdown.classList.add('hidden');
      this._fadeFlashes(dt);
      this._drawRadar(match, null);
      return;
    }
    this.el.reticle.style.opacity = '1';

    this._updateStatus(mech);
    this._updateDoll(mech);
    this._updateWeapons(mech, controller);
    this._updateAbility(mech);
    this._updateReticle(match, mech, controller);
    this._drawRadar(match, mech);
    this.el.speed.textContent = Math.round(Math.hypot(mech.velocity.x, mech.velocity.z) * 3.6);

    this.el.heatWarn.classList.toggle('hidden', mech.heatFraction < 0.8 || mech.shutdown);
    this.el.shutdown.classList.toggle('hidden', !mech.shutdown);

    this._fadeFlashes(dt);
  }

  _fadeFlashes(dt) {
    this._damageFlash = Math.max(0, this._damageFlash - dt * 1.9);
    this.el.vignette.style.opacity = this._damageFlash.toFixed(3);
  }

  _updateTop(match) {
    const isFFA = match.mode.teams > 2;
    if (isFFA) {
      const me = match.player?.team;
      const mine = match.scoreFor(me);
      let best = 0;
      for (const p of match.players) best = Math.max(best, match.scoreFor(p.team));
      this.el.scoreA.textContent = mine;
      this.el.scoreB.textContent = best;
      this.el.scoreA.parentElement.title = 'You';
      this.el.scoreB.parentElement.title = 'Leader';
    } else {
      this.el.scoreA.textContent = match.score.a;
      this.el.scoreB.textContent = match.score.b;
    }
    const t = Math.max(0, match.clock);
    const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
    this.el.timer.textContent = `${mm}:${ss.toString().padStart(2, '0')}`;
    this.el.timer.classList.toggle('urgent', t < 30);
    this.el.modeLabel.textContent = match.state === 'countdown'
      ? `DROPPING IN ${Math.ceil(match.countdown)}`
      : match.mode.name;
  }

  _updateObjectives(match) {
    const show = match.mode.objective === 'points' || match.mode.objective === 'king';
    this.el.objectives.classList.toggle('hidden', !show);
    if (!show) return;
    if (this._objEls?.length !== match.zones.length) {
      this.el.objectives.innerHTML = '';
      this._objEls = match.zones.map((z) => {
        const d = document.createElement('div');
        d.className = 'objective';
        d.innerHTML = `<div class="name"><span>${z.name}</span><em class="pct"></em></div><div class="cap"><i></i></div>`;
        this.el.objectives.appendChild(d);
        return { root: d, pct: d.querySelector('.pct'), fill: d.querySelector('.cap i') };
      });
    }
    match.zones.forEach((z, i) => {
      const e = this._objEls[i];
      const active = match.mode.objective !== 'king' || i === match.activeZone;
      e.root.classList.toggle('owned-a', z.owner === 'a');
      e.root.classList.toggle('owned-b', z.owner === 'b');
      e.root.classList.toggle('contested', !!z.contested && active);
      e.root.style.opacity = active ? '1' : '0.32';
      e.pct.textContent = z.owner ? z.owner.toUpperCase() : '--';
      e.fill.style.right = `${(1 - z.progress) * 100}%`;
      e.fill.style.background = z.owner === 'a' ? '#49d6ff' : z.owner === 'b' ? '#ff6a4d' : '#aabbcc';
    });
  }

  _updateFeed(match) {
    const want = match.events.slice(-6);
    if (this._feedSignature === want.length + ':' + (want[want.length - 1]?.t || 0)) return;
    this._feedSignature = want.length + ':' + (want[want.length - 1]?.t || 0);
    this.el.killfeed.innerHTML = '';
    for (const e of want) {
      const row = document.createElement('div');
      row.className = 'kf';
      const kc = e.killerTeam === 'a' ? 'a' : e.killerTeam === 'b' ? 'b' : '';
      const vc = e.victimTeam === 'a' ? 'a' : e.victimTeam === 'b' ? 'b' : '';
      row.innerHTML = `<span class="${kc}">${escape(e.killer)}</span><span class="w">&#9656;</span><span class="${vc}">${escape(e.victim)}</span>`;
      this.el.killfeed.appendChild(row);
    }
  }

  _updateStatus(m) {
    const hp = m.healthFraction;
    setBar(this.el.barHp, hp);
    this.el.barHp.className = hp < 0.22 ? 'crit' : hp < 0.45 ? 'low' : '';
    this.el.valHp.textContent = Math.round(hp * 100) + '%';

    const sh = m.maxShield > 0 ? m.shield / m.maxShield : 0;
    setBar(this.el.barShield, sh);
    this.el.valShield.textContent = Math.round(m.shield);

    const heat = m.heatFraction;
    setBar(this.el.barHeat, heat);
    this.el.valHeat.textContent = Math.round(heat * 100) + '%';
    this.el.redline.style.left = '78%';

    const jets = m.jets.fuel > 0 ? m.jetFuel / m.jets.fuel : 0;
    setBar(this.el.barJets, jets);
    this.el.valJets.textContent = m.jets.fuel > 0 ? Math.round(jets * 100) + '%' : '—';
  }

  _updateDoll(m) {
    for (const loc of LOCATIONS) {
      const el = this._dollParts[loc];
      if (!el) continue;
      const max = m.maxArmour[loc] + m.maxStructure[loc];
      const cur = m.armour[loc] + m.structure[loc];
      if (m.destroyed[loc]) { el.setAttribute('fill', '#2a2e33'); el.setAttribute('opacity', '0.4'); continue; }
      el.setAttribute('opacity', '1');
      const f = max > 0 ? cur / max : 1;
      // Armour green -> structure orange -> critical red.
      const col = m.armour[loc] > 0
        ? lerpHex(0x3ce08a, 0xffb454, 1 - m.armour[loc] / Math.max(1, m.maxArmour[loc]))
        : lerpHex(0xff8a3d, 0xc9142a, 1 - m.structure[loc] / Math.max(1, m.maxStructure[loc]));
      el.setAttribute('fill', '#' + col.toString(16).padStart(6, '0'));
    }
  }

  _updateWeapons(m, controller) {
    if (this._weaponMech !== m) {
      this._weaponMech = m;
      this.el.weapons.innerHTML = '';
      this._weaponRows = m.weapons.map((w, i) => {
        const row = document.createElement('div');
        row.className = 'wslot' + (w ? '' : ' empty');
        row.innerHTML = `<span class="idx">${i + 1}</span>`
          + `<span class="grp"></span>`
          + `<span class="wname">${w ? escape(w.def.name) : '— empty —'}</span>`
          + `<span class="wammo"></span><i class="cool"></i>`;
        this.el.weapons.appendChild(row);
        return { root: row, ammo: row.querySelector('.wammo'), cool: row.querySelector('.cool'), grp: row.querySelector('.grp') };
      });
    }
    const group = controller?.fireGroup || 'single';
    m.weapons.forEach((w, i) => {
      const r = this._weaponRows[i];
      if (!r || !w) return;
      const selected = group === 'single' ? i === m.selected : m.weaponGroups[group === 'all' ? 'all' : group]?.includes(i);
      r.root.classList.toggle('selected', !!selected);
      r.root.classList.toggle('destroyed', w.destroyed);
      r.grp.textContent = w.group_key === 'alpha' ? 'A' : 'B';

      let txt, cls = 'wammo';
      if (w.destroyed) { txt = 'WRECKED'; cls += ' out'; }
      else if (w.reloading > 0) { txt = 'RELOAD'; cls += ' out'; }
      else if (w.jammed > 0) { txt = 'JAMMED'; cls += ' out'; }
      else if (w.def.ammo < 0) { txt = '∞'; cls += ' inf'; }
      else {
        const mag = w.mag < 0 ? '' : w.mag + '/';
        txt = `${mag}${w.ammo < 0 ? '∞' : w.ammo}`;
        if ((w.mag === 0 && w.ammo === 0) || w.ammo === 0 && w.mag <= 0) cls += ' out';
      }
      r.ammo.textContent = txt;
      r.ammo.className = cls;

      const cd = w.reloading > 0
        ? 1 - w.reloading / (w.def.reload * m.reloadMul)
        : w.def.mode === 'charge' ? w.charge
        : 1 - clamp(w.cooldown / (60 / Math.max(1, w.def.rpm)), 0, 1);
      r.cool.style.width = `${clamp(cd, 0, 1) * 100}%`;
      r.cool.style.background = w.def.mode === 'charge' && w.charge > 0 ? '#ffb454' : '#49d6ff';
    });
  }

  _updateAbility(m) {
    const a = m.ability;
    this.el.abilityIcon.textContent = a.icon;
    this.el.abilityName.textContent = a.name;
    const ready = m.abilityCd <= 0 && !m.abilityActive;
    this.el.abilityPanel.classList.toggle('ready', ready);
    this.el.abilityPanel.classList.toggle('active', m.abilityActive);
    const pct = m.abilityActive
      ? (a.duration > 0 ? m.abilityTime / a.duration : 1)
      : 1 - m.abilityCd / (a.cooldown * m.cooldownMul);
    this.el.abilityCd.style.width = `${clamp(pct, 0, 1) * 100}%`;
    this.el.abilityCd.style.background = m.abilityActive ? '#ffb454' : ready ? '#5df2a0' : '#b47cff';
    this.el.abilityKey.textContent = m.abilityActive
      ? (a.duration > 0 ? m.abilityTime.toFixed(1) + 's' : 'ACTIVE')
      : ready ? 'READY — Q' : Math.ceil(m.abilityCd) + 's';
  }

  _updateReticle(match, m, controller) {
    // Spread ring reflects the currently selected weapon's real cone.
    const w = m.weapons[m.selected];
    let spread = 0;
    if (w && !w.destroyed) {
      spread = (w.def.spread || 0) * m.spreadMul * m.spreadBase
             * (m.grounded ? 1 : 1.55)
             * (1 + Math.hypot(m.velocity.x, m.velocity.z) / Math.max(1, m.maxSpeed) * 0.6);
    }
    const px = clamp(6 + spread * 26, 6, 84);
    this.el.spread.setAttribute('r', px.toFixed(1));

    // Lock indicator.
    const locking = m.lockProgress > 0;
    this.el.reticle.classList.toggle('locking', locking);
    this.el.lock.classList.toggle('hidden', !m.lockedTarget);
    const circ = 2 * Math.PI * 52;
    this.el.lockArc.setAttribute('stroke-dasharray', `${(m.lockProgress * circ).toFixed(1)} ${circ.toFixed(1)}`);

    // Friend/foe colouring from what the crosshair is over.
    const aim = controller?.crosshairWorld(m, 900);
    let over = null;
    if (aim) {
      const eye = m.eyePosition(_v1);
      const dir = _v2.copy(aim).sub(eye).normalize();
      let bestT = eye.distanceTo(aim) + 2;
      for (const o of match.aliveMechs()) {
        if (o === m) continue;
        const to = _v3.subVectors(o.position.clone().setY(o.position.y + o.height * 0.5), eye);
        const t = to.dot(dir);
        if (t < 0 || t > bestT) continue;
        const perp = to.addScaledVector(dir, -t).length();
        if (perp < o.radius * 1.15) { bestT = t; over = o; }
      }
    }
    this.el.reticle.classList.toggle('hostile', !!over && over.team !== m.team);
    this.el.reticle.classList.toggle('friendly', !!over && over.team === m.team);
    this.hoverTarget = over;
    m.target = over || m.lockedTarget || m.target;
  }

  /* ---- radar ---- */
  _drawRadar(match, mech) {
    const c = this.ctx2d;
    const W = 320, H = 320, cx = W / 2, cy = H / 2;
    c.clearRect(0, 0, W, H);

    const jammed = mech ? mech.jammedFor > 0 : false;
    this.el.radar.classList.toggle('jammed', jammed);

    // Rings + crosshair.
    c.strokeStyle = 'rgba(120,190,220,0.22)';
    c.lineWidth = 1.5;
    for (const r of [0.33, 0.66, 1]) {
      c.beginPath(); c.arc(cx, cy, r * cx * 0.94, 0, 7); c.stroke();
    }
    c.beginPath(); c.moveTo(cx, 0); c.lineTo(cx, H); c.moveTo(0, cy); c.lineTo(W, cy); c.stroke();

    // Sweep line.
    const sweep = (performance.now() * 0.0011) % (Math.PI * 2);
    const grad = c.createLinearGradient(cx, cy, cx + Math.cos(sweep) * cx, cy + Math.sin(sweep) * cy);
    grad.addColorStop(0, 'rgba(73,214,255,0.0)');
    grad.addColorStop(1, 'rgba(73,214,255,0.5)');
    c.strokeStyle = grad; c.lineWidth = 3;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(sweep) * cx * 0.94, cy + Math.sin(sweep) * cy * 0.94); c.stroke();

    if (!mech) return;

    const range = mech.sensorRange;
    const scale = (cx * 0.94) / range;
    const cos = Math.cos(-mech.aimYaw), sin = Math.sin(-mech.aimYaw);

    // Objective markers.
    for (const z of match.zones) {
      if (match.mode.objective === 'king' && match.zones.indexOf(z) !== match.activeZone) continue;
      const dx = z.pos.x - mech.position.x, dz = z.pos.z - mech.position.z;
      const rx = dx * cos - dz * sin, rz = dx * sin + dz * cos;
      const px = cx + rx * scale, py = cy + rz * scale;
      c.strokeStyle = z.owner === 'a' ? '#49d6ff' : z.owner === 'b' ? '#ff6a4d' : '#aabbcc';
      c.lineWidth = 2;
      c.beginPath(); c.arc(clamp(px, 8, W - 8), clamp(py, 8, H - 8), 9, 0, 7); c.stroke();
    }

    for (const o of match.aliveMechs()) {
      if (o === mech) continue;
      const hostile = o.team !== mech.team;
      if (hostile) {
        if (o.radarHidden && o.revealedUntil < match.time) continue;
        if (jammed && o.revealedUntil < match.time) continue;
        const d = o.position.distanceTo(mech.position);
        const known = o.revealedUntil > match.time || o.taggedUntil > match.time || d < range;
        if (!known) continue;
      }
      let dx = o.position.x - mech.position.x, dz = o.position.z - mech.position.z;
      if (hostile && o.radarBlur) { dx += (Math.random() - 0.5) * 26; dz += (Math.random() - 0.5) * 26; }
      const rx = dx * cos - dz * sin, rz = dx * sin + dz * cos;
      let px = cx + rx * scale, py = cy + rz * scale;
      const edge = Math.hypot(px - cx, py - cy) > cx * 0.94;
      if (edge) {
        const a = Math.atan2(py - cy, px - cx);
        px = cx + Math.cos(a) * cx * 0.94;
        py = cy + Math.sin(a) * cy * 0.94;
      }
      c.fillStyle = hostile ? '#ff5a4d' : o.isPlayer ? '#ffffff' : '#49d6ff';
      c.save();
      c.translate(px, py);
      c.rotate(-o.aimYaw + mech.aimYaw);
      // Triangles point where the contact is facing -- free tactical info.
      c.beginPath();
      const s = edge ? 5 : 7 + (o.chassis.tons / 100) * 5;
      c.moveTo(0, -s); c.lineTo(s * 0.72, s * 0.7); c.lineTo(-s * 0.72, s * 0.7);
      c.closePath(); c.fill();
      if (o === mech.lockedTarget) { c.strokeStyle = '#ffd24e'; c.lineWidth = 2; c.stroke(); }
      c.restore();
      // Vertical offset tick: above or below you.
      const dy = o.position.y - mech.position.y;
      if (Math.abs(dy) > 8) {
        c.fillStyle = hostile ? 'rgba(255,90,77,0.8)' : 'rgba(73,214,255,0.8)';
        c.fillRect(px - 1, py + (dy > 0 ? -16 : 11), 2, 5);
      }
    }

    // Own facing arrow.
    c.fillStyle = '#ffffff';
    c.beginPath(); c.moveTo(cx, cy - 9); c.lineTo(cx + 6, cy + 7); c.lineTo(cx - 6, cy + 7); c.closePath(); c.fill();
  }

  /* ---- events ---- */
  onMatchEvent(e) {
    switch (e.type) {
      case 'hit':
        this.el.hitMarker.classList.remove('show', 'kill');
        void this.el.hitMarker.offsetWidth;   // restart the animation
        this.el.hitMarker.classList.add('show');
        if (e.killing) this.el.hitMarker.classList.add('kill');
        this.audio.play(e.killing ? 'kill' : 'hit');
        break;
      case 'taken':
        this._damageFlash = Math.min(1, this._damageFlash + clamp(e.amount / 300, 0.08, 0.6));
        break;
      case 'kill':
        this.toast('TARGET DESTROYED', e.victim?.name || '');
        break;
      case 'death':
        this.toast('MECH DESTROYED', e.killer ? 'by ' + e.killer.name : '');
        break;
      case 'go':
        this.toast('ENGAGE', '');
        break;
      case 'capture':
        this.toast(`${e.zone.name} CAPTURED`, e.team === 'a' ? 'FRIENDLY' : 'HOSTILE');
        break;
      case 'zoneRotate':
        this.toast('ZONE RELOCATED', e.zone.name);
        break;
      case 'pickup':
        this.toast(e.pad.type.label, e.pad.type.desc);
        break;
    }
  }

  toast(text, sub = '') {
    if (!text) { this.el.toast.classList.remove('show'); this._toastTimer = 0; return; }
    this.el.toast.innerHTML = escape(text) + (sub ? `<small>${escape(sub)}</small>` : '');
    this.el.toast.classList.add('show');
    this._toastTimer = 2.2;
  }

  _updateToast(dt) {
    if (this._toastTimer > 0) {
      this._toastTimer -= dt;
      if (this._toastTimer <= 0) this.el.toast.classList.remove('show');
    }
  }

  /* ---- match intro ---- */
  setIntro(mapDef, mode, tournament) {
    if (!this._introEl) {
      const el = document.createElement('div');
      el.id = 'intro-card';
      el.innerHTML = `<div class="in-mode"></div><div class="in-map"></div>
        <div class="in-sub"></div><div class="in-skip">any key to skip</div>`;
      this.root.appendChild(el);
      this._introEl = el;
    }
    const el = this._introEl;
    el.style.display = '';
    el.classList.remove('gone');
    void el.offsetWidth;
    el.querySelector('.in-mode').textContent = tournament
      ? `${tournament.name} · ROUND ${tournament.round + 1}/${tournament.total}`
      : mode.name;
    el.querySelector('.in-map').textContent = mapDef.name;
    el.querySelector('.in-sub').textContent = tournament
      ? tournament.label
      : (mapDef.blurb || '');
  }

  clearIntro() {
    if (!this._introEl) return;
    this._introEl.classList.add('gone');
    setTimeout(() => { if (this._introEl?.classList.contains('gone')) this._introEl.style.display = 'none'; }, 700);
  }

  /* ---- kill cam ---- */
  showKillCam(kc) {
    if (!this._killCamEl) {
      const el = document.createElement('div');
      el.id = 'killcam';
      el.innerHTML = `<div class="kc-title">MECH DESTROYED</div>
        <div class="kc-by"></div><div class="kc-sub"></div>`;
      this.root.appendChild(el);
      this._killCamEl = el;
    }
    this._killCamEl.style.display = '';
    this._killCamEl.querySelector('.kc-by').textContent = kc.name ? kc.name : 'THE ARENA';
    this._killCamEl.querySelector('.kc-sub').textContent = kc.chassis || '';
  }

  hideKillCam() {
    if (this._killCamEl) this._killCamEl.style.display = 'none';
  }

  /* ---- respawn screen ---- */
  showRespawn(entry, killerName, onPick) {
    this.el.respawn.classList.remove('hidden');
    this.el.respawnKiller.textContent = killerName ? `Destroyed by ${killerName}` : '';
    this.el.respawnChoices.innerHTML = '';
    entry.hangar.forEach((b, i) => {
      const chassis = MECH_BY_ID[b.chassisId];
      if (!chassis) return;
      const skin = SKIN_BY_ID[b.skinId] || SKIN_BY_ID[DEFAULT_SKIN];
      const card = document.createElement('div');
      card.className = 'respawn-card';
      card.innerHTML = `<div class="rc-chip" style="background:linear-gradient(140deg,${skin.primary},${skin.secondary})"></div>`
        + `<div class="rc-name">${escape(chassis.name)}</div>`
        + `<div class="rc-class">${chassis.classLabel} · ${chassis.tons}t</div>`;
      card.onclick = () => { this.audio.play('ui'); onPick(i); };
      this.el.respawnChoices.appendChild(card);
    });
  }

  hideRespawn() { this.el.respawn.classList.add('hidden'); }

  /* ---- scoreboard ---- */
  setScoreboard(match, open) {
    this.el.scoreboard.classList.toggle('hidden', !open);
    if (!open) return;
    const rows = match.players
      .map(p => ({ ...p, sc: p.score }))
      .sort((a, b) => b.sc - a.sc);
    this.el.scoreboard.innerHTML = `<h3>${escape(match.mode.name)} — ${escape(match.world.def.name)}</h3>`
      + '<table><thead><tr><th>PILOT</th><th>MECH</th><th>K</th><th>D</th><th>A</th><th>DMG</th><th>HEAL</th><th>SCORE</th></tr></thead><tbody>'
      + rows.map(p => `<tr class="${p.team === 'a' ? 'a' : p.team === 'b' ? 'b' : ''}${p.isPlayer ? ' me' : ''}">`
        + `<td>${escape(p.name)}${p.juggernaut ? ' ★' : ''}${p.eliminated ? ' <span class="muted">OUT</span>' : ''}</td>`
        + `<td class="muted">${escape(p.mech?.chassis.name || '—')}</td>`
        + `<td>${p.kills}</td><td>${p.deaths}</td><td>${p.assists}</td>`
        + `<td>${Math.round(p.damage)}</td><td>${Math.round(p.healing)}</td><td>${p.score}</td></tr>`).join('')
      + '</tbody></table>';
  }

  _updateFps() {
    const s = this.engine.stats;
    if (!this.fpsOn) return;
    this.el.fps.textContent = `${s.fps} fps\n${s.draw} draws\n${(s.tris / 1000).toFixed(0)}k tris`;
  }

  setFpsVisible(v) {
    this.fpsOn = v;
    this.el.fps.classList.toggle('hidden', !v);
  }
}

/* ---------------- helpers ---------------- */
function setBar(el, frac) { el.style.transform = `scaleX(${clamp(frac, 0, 1)})`; }

function lerpHex(a, b, t) {
  t = clamp(t, 0, 1);
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(lerp(ar, br, t)) << 16) | (Math.round(lerp(ag, bg, t)) << 8) | Math.round(lerp(ab, bb, t));
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
