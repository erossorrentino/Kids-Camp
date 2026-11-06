import * as THREE from 'three';
import { G } from '../core/G.js';
import { icon } from './icons.js';
import { ITEMS } from '../game/items.js';
import { EPOCHS } from '../world/epochs.js';
import { ELEMENTS } from '../combat/combat.js';
import { regionAt, REGION_EPOCH_NAMES } from '../world/worldmap.js';

const _p = new THREE.Vector3();
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

export class HUD {
  constructor() {
    const root = document.getElementById('ui-root');
    this.root = el('div', 'hud');
    this.root.hidden = true;
    root.appendChild(this.root);
    // vitals
    this.vitals = el('div', 'vitals', `
      <div class="lv"><span class="lv-n">1</span></div>
      <div class="bars">
        <div class="bar hp"><div class="ghost"></div><div class="fill"></div><span class="val"></span></div>
        <div class="bar mp"><div class="fill"></div></div>
        <div class="bar xp"><div class="fill"></div></div>
      </div>`);
    this.root.appendChild(this.vitals);
    this.hpFill = this.vitals.querySelector('.hp .fill');
    this.hpGhost = this.vitals.querySelector('.hp .ghost');
    this.hpVal = this.vitals.querySelector('.hp .val');
    this.mpFill = this.vitals.querySelector('.mp .fill');
    this.xpFill = this.vitals.querySelector('.xp .fill');
    this.lvN = this.vitals.querySelector('.lv-n');
    this.hpGhostV = 1;
    // compass
    this.compass = el('div', 'compass', '<div class="strip"></div><div class="tick"></div>');
    this.root.appendChild(this.compass);
    this.strip = this.compass.querySelector('.strip');
    // clock / epoch
    this.clock = el('div', 'clock', `<div class="medal"><span class="glyph"></span></div><div class="clock-text"><div class="age"></div><div class="time"></div><div class="region"></div></div>`);
    this.root.appendChild(this.clock);
    // quest tracker
    this.tracker = el('div', 'tracker');
    this.root.appendChild(this.tracker);
    // elements
    this.elements = el('div', 'elements');
    this.elRunes = [];
    for (let i = 0; i < 4; i++) {
      const r = el('div', 'rune r' + i, `<img alt="" src="${icon('el' + i)}"><span class="key">${i + 1}</span>`);
      this.elements.appendChild(r);
      this.elRunes.push(r);
    }
    this.stance = el('div', 'stance-tag', 'WIND');
    this.elements.appendChild(this.stance);
    this.imbueTag = el('div', 'imbue-tag');
    this.elements.appendChild(this.imbueTag);
    this.root.appendChild(this.elements);
    // quick item
    this.quick = el('div', 'quick', `<img alt=""><span class="n"></span><span class="key">G</span>`);
    this.root.appendChild(this.quick);
    // prompt
    this.prompt = el('div', 'prompt');
    this.root.appendChild(this.prompt);
    // boss bar
    this.boss = el('div', 'bossbar', '<div class="name"></div><div class="bar"><div class="ghost"></div><div class="fill"></div></div><div class="poise"><div class="fill"></div></div>');
    this.boss.hidden = true;
    this.root.appendChild(this.boss);
    // feed + toasts + banner
    this.feed = el('div', 'feed');
    this.root.appendChild(this.feed);
    this.toasts = el('div', 'toasts');
    this.root.appendChild(this.toasts);
    this.bannerEl = el('div', 'banner', '<div class="b-title"></div><div class="b-sub"></div>');
    root.appendChild(this.bannerEl);
    // damage vignette used when the post-processing chain is off (phones)
    this.vig = el('div', 'dmg-vignette');
    root.appendChild(this.vig);
    // damage vignette value
    this.damage = 0;
    // overlay canvas
    this.canvas = document.getElementById('overlay');
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.feedItems = new Map();
    this.lastQuick = null;
    this.compassMarkers = [];
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.dpr = dpr;
  }

  show(v) {
    this.root.hidden = !v;
  }

  toast(text, kind = '') {
    const t = el('div', 'toast ' + kind, text);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 2800);
    setTimeout(() => t.remove(), 3500);
  }

  pickup(id, n, total) {
    let it = this.feedItems.get(id);
    if (it) {
      it.n += n;
      it.el.querySelector('.n').textContent = '+' + it.n;
      it.el.querySelector('.t').textContent = total;
      clearTimeout(it.timer);
      it.el.classList.remove('out');
    } else {
      const e = el('div', 'feed-item', `<img alt="" src="${icon(id)}"><span class="name">${ITEMS[id]?.name || id}</span><span class="n">+${n}</span><span class="t">${total}</span>`);
      this.feed.appendChild(e);
      it = { el: e, n };
      this.feedItems.set(id, it);
    }
    it.timer = setTimeout(() => {
      it.el.classList.add('out');
      setTimeout(() => { it.el.remove(); this.feedItems.delete(id); }, 500);
    }, 2600);
  }

  banner(title, sub = '', kind = '') {
    const b = this.bannerEl;
    b.className = 'banner show ' + kind;
    b.querySelector('.b-title').textContent = title;
    b.querySelector('.b-sub').textContent = sub;
    clearTimeout(this._bt);
    this._bt = setTimeout(() => (b.className = 'banner ' + kind), 3600);
  }

  epochBanner(e) {
    const ep = EPOCHS[e];
    this.banner(ep.name, ep.sub, 'epoch e' + e);
  }

  setVignette(v) {
    const o = Math.min(0.85, v).toFixed(2);
    if (this._vig !== o) { this._vig = o; this.vig.style.opacity = o; }
  }

  damageFlash(a) {
    this.damage = Math.min(1, this.damage + a);
  }

  elementChanged() {}

  setBoss(b) {
    this.bossRef = b;
    this.boss.hidden = !b;
    if (b) {
      this.boss.querySelector('.name').textContent = b.title || b.name;
      this.bossGhost = 1;
    }
  }

  setTracker(lines) {
    // lines: [{title, steps:[text], kind}]
    this.tracker.innerHTML = '';
    for (const q of lines) {
      const d = el('div', 'tq ' + (q.kind || ''));
      d.appendChild(el('div', 'tq-title', q.title));
      for (const s of q.steps) d.appendChild(el('div', 'tq-step', s));
      this.tracker.appendChild(d);
    }
  }

  update(dt) {
    const P = G.player;
    if (!P || this.root.hidden) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }
    const hp = P.hp / P.maxHp;
    this.hpFill.style.width = (hp * 100).toFixed(1) + '%';
    if (this.hpGhostV > hp) this.hpGhostV = Math.max(hp, this.hpGhostV - dt * 0.4);
    else this.hpGhostV = hp;
    this.hpGhost.style.width = (this.hpGhostV * 100).toFixed(1) + '%';
    this.hpVal.textContent = `${Math.ceil(P.hp)} / ${P.maxHp}`;
    this.vitals.querySelector('.hp').style.setProperty('--w', P.maxHp / 100);
    this.mpFill.style.width = ((P.mana / P.maxMana) * 100).toFixed(1) + '%';
    this.xpFill.style.width = ((P.xp / P.xpForNext()) * 100).toFixed(1) + '%';
    this.lvN.textContent = P.level;
    this.vitals.classList.toggle('low', hp < 0.25);
    // elements
    for (let i = 0; i < 4; i++) {
      const r = this.elRunes[i];
      const unlocked = G.magic?.unlocked(i);
      r.classList.toggle('active', P.element === i);
      r.classList.toggle('locked', !unlocked);
    }
    this.stance.textContent = P.stance === 'wind' ? 'STANCE · WIND' : 'STANCE · STONE';
    this.stance.className = 'stance-tag ' + P.stance;
    if (P.imbue) {
      this.imbueTag.textContent = `${ELEMENTS[P.imbue.el].name} blade ${Math.ceil(P.imbue.t)}s`;
      this.imbueTag.style.color = ELEMENTS[P.imbue.el].css;
      this.imbueTag.hidden = false;
    } else this.imbueTag.hidden = true;
    // quick item
    const q = G.game?.quickItem();
    if (q !== this.lastQuick) {
      this.lastQuick = q;
      if (q) this.quick.querySelector('img').src = icon(q);
    }
    this.quick.hidden = !q;
    if (q) this.quick.querySelector('.n').textContent = G.game.count(q);
    // clock
    const atmo = G.atmo;
    const ep = EPOCHS[G.epochs.current];
    const t = atmo.timeOfDay;
    const hh = Math.floor(t), mm = Math.floor((t - hh) * 60);
    this.clock.querySelector('.glyph').textContent = ep.glyph;
    this.clock.querySelector('.age').textContent = ep.name;
    this.clock.querySelector('.time').textContent = `Day ${atmo.day} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    if (!G.game?.inPocket) {
      const reg = regionAt(P.pos.x, P.pos.z);
      this.clock.querySelector('.region').textContent = REGION_EPOCH_NAMES[reg.id]?.[G.epochs.current] || reg.name;
    } else this.clock.querySelector('.region').textContent = 'The Rift';
    this.clock.style.setProperty('--accent', ep.accent);
    document.documentElement.style.setProperty('--accent', ep.accent);
    // compass
    this.updateCompass();
    // prompt
    const it = G.game?.currentInteractable;
    if (it && !G.ui?.blocking) {
      const key = G.input.lastDevice === 'pad' ? 'Y' : 'E';
      this.prompt.innerHTML = `<span class="k">${key}</span>${it.verb || 'Interact'}<b>${it.label || ''}</b>`;
      this.prompt.hidden = false;
    } else this.prompt.hidden = true;
    // boss
    const b = this.bossRef;
    if (b) {
      const f = Math.max(0, b.hp / b.maxHp);
      this.boss.querySelector('.fill').style.width = (f * 100).toFixed(2) + '%';
      if (this.bossGhost > f) this.bossGhost = Math.max(f, this.bossGhost - dt * 0.25);
      this.boss.querySelector('.ghost').style.width = (this.bossGhost * 100).toFixed(2) + '%';
      this.boss.querySelector('.poise .fill').style.width = ((1 - Math.max(0, b.poise) / b.maxPoise) * 100).toFixed(1) + '%';
      if (b.dead) this.setBoss(null);
    }
    // damage vignette
    this.damage = Math.max(0, this.damage - dt * 1.2);
    const low = hp < 0.3 ? (0.3 - hp) * 1.5 : 0;
    G.post.grade.uniforms.uDamage.value = Math.max(this.damage, low);
    this.drawOverlay(dt);
  }

  updateCompass() {
    const yaw = G.cam.yaw;
    // facing direction angle: camera looks along (-sin yaw, -cos yaw)
    const heading = Math.atan2(-Math.sin(yaw), -Math.cos(yaw)); // angle from +Z toward +X
    const W = 420;
    const items = [
      { a: Math.PI, t: 'N' }, { a: Math.PI / 2, t: 'E' }, { a: 0, t: 'S' }, { a: -Math.PI / 2, t: 'W' },
      { a: (Math.PI * 3) / 4, t: '·' }, { a: Math.PI / 4, t: '·' }, { a: -Math.PI / 4, t: '·' }, { a: (-Math.PI * 3) / 4, t: '·' },
    ];
    const P = G.player.pos;
    const marks = G.game?.compassMarkers() || [];
    let html = '';
    const place = (ang, inner, cls) => {
      let d = ang - heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) > 1.25) return;
      const x = W / 2 + (d / 1.25) * (W / 2);
      html += `<span class="${cls}" style="left:${x.toFixed(1)}px;opacity:${(1 - Math.abs(d) / 1.3).toFixed(2)}">${inner}</span>`;
    };
    for (const i of items) place(i.a, i.t, i.t === '·' ? 'cp dot' : 'cp card');
    for (const m of marks) {
      const ang = Math.atan2(m.x - P.x, m.z - P.z);
      const dist = Math.hypot(m.x - P.x, m.z - P.z);
      place(ang, `<i style="--c:${m.color || '#f3c66b'}"></i>${m.showDist ? `<em>${Math.round(dist)}m</em>` : ''}`, 'cp mark ' + (m.kind || ''));
    }
    this.strip.innerHTML = html;
  }

  project(x, y, z) {
    _p.set(x, y, z).project(G.camera);
    if (_p.z > 1 || _p.z < -1) return null;
    return [(_p.x * 0.5 + 0.5) * this.canvas.width, (-_p.y * 0.5 + 0.5) * this.canvas.height];
  }

  drawOverlay(dt) {
    const c = this.ctx;
    const W = this.canvas.width, H = this.canvas.height, d = this.dpr;
    c.clearRect(0, 0, W, H);
    const P = G.player;
    // enemy health bars & alerts
    for (const e of G.enemies) {
      if (e.dead || e.removed || e.boss) continue;
      const dist = e.distTo(P.pos);
      if (dist > 35) continue;
      const s = this.project(e.pos.x, e.pos.y + e.height + 0.45, e.pos.z);
      if (!s) continue;
      const showBar = e.hp < e.maxHp || e.state !== 'idle';
      if (showBar) {
        const w = 64 * d, h = 5 * d;
        c.fillStyle = 'rgba(10,10,20,0.6)';
        c.fillRect(s[0] - w / 2 - d, s[1] - d, w + 2 * d, h + 2 * d);
        c.fillStyle = 'rgba(255,220,180,0.35)';
        c.fillRect(s[0] - w / 2, s[1], w * Math.max(0, e.hpShown / e.maxHp), h);
        c.fillStyle = e.staggered ? '#ffd86b' : '#e8566a';
        c.fillRect(s[0] - w / 2, s[1], w * Math.max(0, e.hp / e.maxHp), h);
        // poise
        const pf = 1 - Math.max(0, e.poise) / e.maxPoise;
        if (pf > 0.05) {
          c.fillStyle = 'rgba(255,216,107,0.9)';
          c.fillRect(s[0] - (w / 2) * pf, s[1] + h + 2 * d, w * pf, 2 * d);
        }
        if (e.level > 1) {
          c.font = `${10 * d}px "Alegreya Sans", sans-serif`;
          c.fillStyle = '#ffd86b';
          c.fillText('Lv ' + e.level, s[0] - w / 2, s[1] - 4 * d);
        }
        // statuses
        let sx = s[0] + w / 2 + 4 * d;
        const st = e.status;
        const dots = [[st.burn > 0, '#ff8a4c'], [st.chill > 0 || st.frozen > 0, '#9fe6ff'], [st.shock > 0, '#c9a8ff'], [st.slow > 0 || st.fracture > 0, '#f6d77a']];
        for (const [on, col] of dots) if (on) { c.fillStyle = col; c.beginPath(); c.arc(sx, s[1] + h / 2, 3 * d, 0, 7); c.fill(); sx += 8 * d; }
      }
      if (e.alertIcon > 0) {
        c.font = `bold ${22 * d}px "Cormorant Garamond", serif`;
        c.textAlign = 'center';
        c.fillStyle = `rgba(255,${120},${60},${Math.min(1, e.alertIcon * 2)})`;
        c.fillText('!', s[0], s[1] - 12 * d);
        c.textAlign = 'left';
      }
    }
    // lock-on reticle
    const lt = P.lockTarget;
    if (lt && !lt.dead) {
      const s = this.project(lt.pos.x, lt.pos.y + lt.height * 0.6, lt.pos.z);
      if (s) {
        const r = (lt.boss ? 22 : 14) * d;
        c.save();
        c.translate(s[0], s[1]);
        c.rotate(G.time * 0.8);
        c.strokeStyle = lt.staggered ? '#ffd86b' : '#ffffff';
        c.lineWidth = 2 * d;
        for (let i = 0; i < 4; i++) {
          c.rotate(Math.PI / 2);
          c.beginPath();
          c.moveTo(r, 0);
          c.lineTo(r + 7 * d, 0);
          c.stroke();
        }
        c.restore();
        c.fillStyle = lt.staggered ? '#ffd86b' : '#ffffff';
        c.beginPath();
        c.arc(s[0], s[1], 2.5 * d, 0, 7);
        c.fill();
        if (lt.staggered && !lt.boss && lt.distTo(P.pos) < 3.5) {
          c.font = `600 ${14 * d}px "Alegreya Sans SC", sans-serif`;
          c.textAlign = 'center';
          c.fillStyle = '#ffd86b';
          c.fillText('ATTACK · CHRONO STRIKE', s[0], s[1] + 34 * d);
          c.textAlign = 'left';
        }
      }
    }
    // stamina wheel beside the player
    if (P.stamina < P.maxStamina - 0.5 || P.exhausted) {
      const s = this.project(P.pos.x, P.pos.y + 1.4, P.pos.z);
      if (s) {
        const x = s[0] + 48 * d, y = s[1] - 10 * d;
        const r = 15 * d;
        const f = P.stamina / P.maxStamina;
        c.lineWidth = 5 * d;
        c.strokeStyle = 'rgba(10,12,20,0.55)';
        c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
        const flash = P.exhausted ? 0.5 + 0.5 * Math.sin(G.time * 10) : 1;
        c.strokeStyle = P.exhausted ? `rgba(255,90,90,${flash})` : f < 0.25 ? '#ffb15a' : '#b4e36c';
        c.beginPath(); c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); c.stroke();
        if (P.maxStamina > 100) {
          c.strokeStyle = 'rgba(255,255,255,0.25)';
          c.lineWidth = 1 * d;
          c.beginPath(); c.arc(x, y, r + 5 * d, 0, Math.PI * 2); c.stroke();
        }
      }
    }
    // charge ring for spells / heavy
    const ch = P.chargeLevel || (G.magic?.castHold > 0.1 ? Math.min(1, G.magic.castHold / 0.45) : 0);
    if (ch > 0.02) {
      const s = this.project(P.pos.x, P.pos.y + 1.2, P.pos.z);
      if (s) {
        c.strokeStyle = ch >= 1 ? '#fff2c0' : 'rgba(255,240,200,0.6)';
        c.lineWidth = 2 * d;
        c.beginPath(); c.arc(s[0], s[1], 34 * d, -Math.PI / 2, -Math.PI / 2 + ch * Math.PI * 2); c.stroke();
      }
    }
    // world waypoint marker
    const wp = G.game?.activeWaypoint();
    if (wp) {
      const s = this.project(wp.x, (wp.y ?? G.terrain.heightAt(wp.x, wp.z)) + 3, wp.z);
      const dist = Math.hypot(wp.x - P.pos.x, wp.z - P.pos.z);
      if (s && dist > 12) {
        c.fillStyle = wp.color || '#f3c66b';
        c.beginPath();
        c.moveTo(s[0], s[1]);
        c.lineTo(s[0] - 7 * d, s[1] - 14 * d);
        c.lineTo(s[0] + 7 * d, s[1] - 14 * d);
        c.closePath();
        c.fill();
        c.font = `600 ${12 * d}px "Alegreya Sans", sans-serif`;
        c.textAlign = 'center';
        c.fillStyle = 'rgba(255,245,220,0.9)';
        c.fillText(Math.round(dist) + 'm', s[0], s[1] - 18 * d);
        c.textAlign = 'left';
      }
    }
    // damage numbers
    c.textAlign = 'center';
    for (const n of G.fx.numbers) {
      const s = this.project(n.x, n.y, n.z);
      if (!s) continue;
      const a = n.t < 0.75 ? 1 : 1 - (n.t - 0.75) / 0.35;
      const pop = n.t < 0.1 ? 1 + (0.1 - n.t) * 6 : 1;
      if (n.text) {
        c.font = `700 ${(n.big ? 17 : 13) * d * pop}px "Alegreya Sans SC", sans-serif`;
        c.globalAlpha = Math.max(0, a);
        c.lineWidth = 3 * d;
        c.strokeStyle = 'rgba(0,0,0,0.55)';
        c.strokeText(n.text, s[0], s[1]);
        c.fillStyle = n.color;
        c.fillText(n.text, s[0], s[1]);
      } else {
        c.font = `800 ${(n.big ? 26 : 18) * d * pop}px "Alegreya Sans", sans-serif`;
        c.globalAlpha = Math.max(0, a);
        c.lineWidth = 3 * d;
        c.strokeStyle = 'rgba(0,0,0,0.6)';
        c.strokeText(n.v, s[0], s[1]);
        c.fillStyle = n.color;
        c.fillText(n.v, s[0], s[1]);
      }
    }
    c.globalAlpha = 1;
    c.textAlign = 'left';
    // crosshair while aiming a spell without a lock target
    if (G.magic && G.input.down('cast') && !P.lockTarget) {
      c.strokeStyle = 'rgba(255,255,255,0.75)';
      c.lineWidth = 1.5 * d;
      c.beginPath();
      c.arc(W / 2, H / 2, 6 * d, 0, 7);
      c.stroke();
    }
    // fade
    if (G.fx.fade > 0) {
      c.fillStyle = `rgba(0,0,0,${Math.min(1, G.fx.fade)})`;
      c.fillRect(0, 0, W, H);
    }
  }
}
