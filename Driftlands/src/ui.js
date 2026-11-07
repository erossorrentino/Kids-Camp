import * as THREE from 'three';
import { angleDiff, clamp } from './noise.js';
import { ELEMENTS } from './combat.js';
import { SURVIVORS, ITEMS, UPGRADES } from './progress.js';
import { PAINTS } from './ship.js';
import { MODS } from './storm.js';

const $ = (id) => document.getElementById(id);
const BIOME_COL = ['#7ccf55', '#e0a040', '#5ac8c0', '#c0503a', '#8a4ab0'];

export class UI {
  constructor(G) {
    this.G = G;
    this.toasts = [];
    this.pops = [];
    this.lastRes = {};
    this.mini = $('minimap').getContext('2d');
    this.dialogOpen = false;
    this.tab = 'up';
    this.compassEls = new Map();
    this.buildElements();
    $('btnCloseMenu').onclick = () => G.closeMenu();
    document.querySelectorAll('.tabs button').forEach((b) => {
      b.onclick = () => { this.tab = b.dataset.tab; document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b)); this.renderMenu(); };
    });
  }

  buildElements() {
    const icons = ['🏹', '🔥', '⚡'];
    $('elements').innerHTML = ELEMENTS.map((e, i) => `<div class="el" id="el${i}"><span class="k">${e.key}</span>${icons[i]}<small>${e.name}</small></div>`).join('');
  }

  show(on) { $('hud').classList.toggle('hidden', !on); }

  toast(msg, dur = 3, kind = '') {
    const box = $('toasts');
    if (this.toasts.some((t) => t.msg === msg)) return;
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    box.appendChild(el);
    const t = { el, msg, t: dur };
    this.toasts.push(t);
    while (this.toasts.length > 4) { const o = this.toasts.shift(); o.el.remove(); }
  }

  popText(pos, text, color = '#fff') {
    const el = document.createElement('div');
    el.className = 'pop';
    el.textContent = text;
    el.style.color = color;
    $('pops').appendChild(el);
    this.pops.push({ el, pos: pos.clone(), t: 0 });
    if (this.pops.length > 40) { const o = this.pops.shift(); o.el.remove(); }
  }

  hurt(k) { const h = $('hurt'); h.style.opacity = String(0.5 + k * 0.5); setTimeout(() => { h.style.opacity = '0'; }, 120); }
  flashHull() { const b = $('hullbar'); b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash'); }
  fadeFlash(dur = 0.6) {
    const f = $('fade');
    f.style.transition = 'none'; f.style.opacity = '0.9';
    requestAnimationFrame(() => { f.style.transition = `opacity ${dur}s`; f.style.opacity = '0'; });
  }

  dirName(p) {
    const pp = this.G.player.pos;
    const a = Math.atan2(p.x - pp.x, -(p.z - pp.z)); // 0 = north (-z), +pi/2 = east (+x)
    const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
    return names[(Math.round(a / (Math.PI / 4)) + 8) % 8];
  }

  refresh() {
    const s = this.G.save.res;
    const crew = this.G.save.rescued.length;
    const html = `<div class="chip sh" id="c_sh">◆ ${s.shards}</div><div class="chip sc" id="c_sc">⚙ ${s.scrap}</div>${s.cores || this.G.save.data.dives ? `<div class="chip co" id="c_co">✦ ${s.cores}</div>` : ''}<div class="chip cr">☺ ${crew}/${SURVIVORS.length}</div>`;
    $('res').innerHTML = html;
    for (const [k, id] of [['shards', 'c_sh'], ['scrap', 'c_sc'], ['cores', 'c_co']]) {
      if (this.lastRes[k] !== undefined && this.lastRes[k] !== s[k] && $(id)) $(id).classList.add('bump');
      this.lastRes[k] = s[k];
    }
    for (let i = 0; i < 3; i++) $('el' + i).classList.toggle('locked', !this.G.combat.elementUnlocked(i));
  }

  // ----- goal tracker
  updateGoal() {
    const G = this.G, s = G.save;
    const lines = [];
    const next = this.nextSurvivor();
    if (G.storm.active) lines.push('<b>Storm Dive!</b> Grab Storm Cores (✦), then fly into the golden beam to escape before the storm collapses.');
    else if (!s.rescued.length) {
      if (G.player.mode !== 'helm' && !s.flags.piloted) lines.push('<b>Take the helm:</b> walk to the ship\'s wheel at the stern and press <kbd>E</kbd>.');
      else lines.push(`<b>Rescue a survivor:</b> follow a ★ light beam${next ? ` — ${next.d}m ${this.dirName(next.pos)}` : ''}. Park above the island and jump down!`);
    } else if (s.upg.engine === 1 && s.has('pip')) lines.push('<b>Upgrade your engine</b> at the workbench (<kbd>B</kbd>) — chests and foes give ◆ and ⚙.');
    else if (!s.data.dives && s.upg.engine >= 2) lines.push('<b>Dive the Storm:</b> find a 🌀 Rift on your compass and sink your ship into it for Storm Cores.');
    else if (next && next.inRange) lines.push(`<b>Rescue ${next.s.name} the ${next.s.role}</b> — ${next.d}m ${this.dirName(next.pos)}.`);
    else if (next) lines.push(`<b>${next.s.name}</b> is beyond your engine's range. Upgrade the Aether Engine (needs ✦ Storm Cores from Dives).`);
    else lines.push('<b>Every survivor is home.</b> Keep exploring — islands sink and new ones rise. The sky is never done.');
    let q = 0;
    for (const sv of SURVIVORS) {
      if (q >= 3) break;
      if (s.has(sv.id) && !s.questDone.includes(sv.id)) {
        const have = G.progress.have(sv.quest.item);
        lines.push(`<span class="q">${ITEMS[sv.quest.item].icon} ${sv.name}: ${ITEMS[sv.quest.item].name} ${Math.min(have, sv.quest.need)}/${sv.quest.need}${have >= sv.quest.need ? ' — talk to them!' : ''}</span>`);
        q++;
      }
    }
    const html = lines.join('<br>');
    if (html !== this._goal) { $('goal').innerHTML = html; this._goal = html; }
  }

  nextSurvivor() {
    const G = this.G;
    let best = null;
    for (const n of G.progress.npcs) {
      const pos = G.progress.npcWorld(n);
      const d = Math.round(pos.distanceTo(G.player.pos));
      const inRange = Math.hypot(pos.x, pos.z) < G.ship.range + 20;
      const score = d + (inRange ? 0 : 5000);
      if (!best || score < best.score) best = { s: n.data, pos, d, inRange, score };
    }
    return best;
  }

  // ----- per-frame HUD
  update(dt) {
    const G = this.G;
    const p = G.player;
    // toasts
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      t.t -= dt;
      if (t.t <= 0 && !t.out) { t.out = true; t.el.classList.add('out'); }
      if (t.t <= -0.45) { t.el.remove(); this.toasts.splice(i, 1); }
    }
    // pops
    const w = innerWidth, h = innerHeight;
    const v = new THREE.Vector3();
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const o = this.pops[i];
      o.t += dt;
      v.copy(o.pos); v.y += o.t * 1.6;
      v.project(G.camera);
      if (o.t > 1.3) { o.el.remove(); this.pops.splice(i, 1); continue; }
      if (v.z > 1) { o.el.style.display = 'none'; continue; }
      o.el.style.display = '';
      o.el.style.left = ((v.x * 0.5 + 0.5) * w) + 'px';
      o.el.style.top = ((-v.y * 0.5 + 0.5) * h) + 'px';
      o.el.style.opacity = String(clamp(1.6 - o.t * 1.3, 0, 1));
    }
    // bars
    $('hpbar').querySelector('.fill').style.transform = `scaleX(${clamp(p.hp / p.maxHp, 0, 1)})`;
    $('hullbar').querySelector('.fill').style.transform = `scaleX(${clamp(G.ship.hp / G.ship.maxHp, 0, 1)})`;
    const hasBoost = G.save.questDone.includes('pip');
    $('boostbar').classList.toggle('hidden', !hasBoost || p.mode !== 'helm');
    if (hasBoost) $('boostbar').querySelector('.fill').style.transform = `scaleX(${G.ship.boostFuel})`;
    // elements & crosshair
    for (let i = 0; i < 3; i++) $('el' + i).classList.toggle('active', G.combat.element === i);
    $('elements').classList.toggle('hidden', p.mode === 'helm');
    $('crosshair').classList.toggle('hidden', p.mode === 'helm');
    const off = 88 - 88 * G.combat.charge;
    $('crosshair').querySelector('.charge').style.strokeDashoffset = String(off);
    // weather
    const wd = G.world;
    const ang = Math.atan2(wd.wind.x, -wd.wind.z) - (-p.camYaw);
    const icon = G.storm.active ? '🌀 Storm Realm' : wd.weather === 'storm' ? '⛈ Thunderstorm' : wd.weather === 'windy' ? '🌬 Windy' : (wd.isNight() ? '🌙 Clear night' : '☀ Clear');
    const wHtml = `${icon} · wind <span class="arrow" style="transform:rotate(${(ang * 180 / Math.PI).toFixed(0)}deg)">⬆</span> ${wd.windStrength.toFixed(0)}`;
    if (wHtml !== this._w) { $('weather').innerHTML = wHtml; this._w = wHtml; }
    // hint line
    let hint = '';
    if (p.mode === 'helm') hint = 'W/S throttle · A/D steer · Space rise · Shift sink' + (hasBoost ? ' · F boost' : '') + ' · E leave helm';
    else if (p.mode === 'glide') hint = 'Gliding — Space to fold · W dive · S flare' + (G.save.questDone.includes('juno') ? ' · Shift dash' : '');
    else if (p.mode === 'grapple') hint = 'Space to jump off the line · RMB to release';
    else if (G.ship.outOfRange > 0) hint = '⚠ Beyond your engine\'s range — the storm winds push you back!';
    $('hint').textContent = hint;
    if (G.ship.outOfRange > 0 && p.mode === 'helm' && (!this._oor || G.time - this._oor > 6)) { this._oor = G.time; this.toast('⚠ Beyond engine range! Upgrade the Aether Engine to fly farther', 3, 'warn'); }
    this.updateCompass();
    if (!this._mm || G.time - this._mm > 0.1) { this._mm = G.time; this.drawMinimap(); this.updateGoal(); }
  }

  updateCompass() {
    const G = this.G;
    const box = $('compassInner');
    const yaw = G.player.camYaw;
    const width = box.clientWidth || 500;
    const marks = [];
    const card = [['N', 0], ['NE', -Math.PI / 4], ['E', -Math.PI / 2], ['SE', -Math.PI * 0.75], ['S', Math.PI], ['SW', Math.PI * 0.75], ['W', Math.PI / 2], ['NW', Math.PI / 4]];
    for (const [n, a] of card) marks.push({ key: 'c' + n, html: n, a, cls: 'cm card' });
    const pp = G.player.pos;
    const add = (key, pos, html, color) => {
      const a = Math.atan2(-(pos.x - pp.x), -(pos.z - pp.z));
      const d = Math.round(Math.hypot(pos.x - pp.x, pos.z - pp.z));
      marks.push({ key, a, html: `${html}<span class="d">${d}m</span>`, cls: 'cm', color });
    };
    if (!G.storm.active) {
      for (const n of G.progress.npcs) add('s' + n.data.id, G.progress.npcWorld(n), '★', '#' + n.data.color.toString(16).padStart(6, '0'));
      for (let i = 0; i < G.storm.rifts.length; i++) add('r' + i, G.storm.rifts[i].pos, '🌀', '#d080ff');
      if (G.save.has('wren')) {
        let k = 0;
        for (const isl of G.islands.near(pp, 220)) for (const c of isl.chests) if (!c.opened && k < 6) { add('ch' + isl.id + '_' + k++, new THREE.Vector3(isl.pos.x + c.x, 0, isl.pos.z + c.z), '▣', '#ffd36a'); }
      }
    } else add('exit', G.storm.origin, '⇧ EXIT', '#ffe9a0');
    if (G.player.platform !== G.ship || G.player.mode !== 'helm') { if (G.ship.pos.distanceTo(pp) > 20) add('ship', G.ship.pos, '⛵', '#fff'); }
    const seen = new Set();
    for (const m of marks) {
      const diff = angleDiff(yaw, m.a);
      let el = this.compassEls.get(m.key);
      if (!el) { el = document.createElement('div'); el.className = m.cls; box.appendChild(el); this.compassEls.set(m.key, el); }
      seen.add(m.key);
      if (Math.abs(diff) > Math.PI / 2) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.left = (50 - (diff / (Math.PI / 2)) * 50) + '%';
      if (el._h !== m.html) { el.innerHTML = m.html; el._h = m.html; }
      if (m.color) el.style.color = m.color;
    }
    for (const [k, el] of this.compassEls) if (!seen.has(k)) { el.remove(); this.compassEls.delete(k); }
  }

  drawMinimap() {
    const G = this.G, c = this.mini;
    const S = 400, R = S / 2;
    let range = 260 * (G.save.upg.lookout ? 1.5 : 1) * (G.save.questDone.includes('wren') ? 2 : 1);
    if (G.player.mode === 'helm') range *= 1.4;
    const k = R / range;
    const pp = G.player.pos;
    const yaw = G.player.camYaw;
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath(); c.arc(R, R, R - 2, 0, Math.PI * 2); c.clip();
    const grd = c.createRadialGradient(R, R, 0, R, R, R);
    grd.addColorStop(0, G.storm.active ? 'rgba(70,20,90,.85)' : 'rgba(40,50,100,.75)'); grd.addColorStop(1, 'rgba(15,12,40,.9)');
    c.fillStyle = grd; c.fillRect(0, 0, S, S);
    c.translate(R, R);
    c.rotate(yaw);
    const tx = (x) => (x - pp.x) * k, tz = (z) => (z - pp.z) * k;
    // range ring
    if (!G.storm.active) {
      c.strokeStyle = 'rgba(255,120,120,.5)'; c.lineWidth = 3; c.setLineDash([10, 8]);
      c.beginPath(); c.arc(tx(0), tz(0), G.ship.range * k, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    }
    for (const isl of G.islands.list) {
      const x = tx(isl.pos.x), z = tz(isl.pos.z);
      if (Math.abs(x) > R + 60 || Math.abs(z) > R + 60) continue;
      c.fillStyle = isl.storm ? BIOME_COL[4] : BIOME_COL[isl.tier];
      c.globalAlpha = isl.rising ? 0.4 : 0.85;
      c.beginPath(); c.arc(x, z, Math.max(3, isl.R * k), 0, Math.PI * 2); c.fill();
      if (isl.sinking) { c.strokeStyle = (G.time * 3) % 1 > 0.5 ? '#ff5050' : '#ffb050'; c.lineWidth = 3; c.stroke(); }
      c.globalAlpha = 1;
      if (G.save.has('wren')) for (const ch of isl.chests) if (!ch.opened) { c.fillStyle = '#ffd36a'; c.fillRect(tx(isl.pos.x + ch.x) - 4, tz(isl.pos.z + ch.z) - 4, 8, 8); }
    }
    if (!G.storm.active) {
      for (const r of G.storm.rifts) {
        c.strokeStyle = '#d080ff'; c.lineWidth = 4;
        c.beginPath(); c.arc(tx(r.pos.x), tz(r.pos.z), Math.max(6, r.radius * k), G.time * 2, G.time * 2 + 4.5); c.stroke();
      }
      for (const n of G.progress.npcs) {
        const p = G.progress.npcWorld(n);
        this.star(c, tx(p.x), tz(p.z), 9, '#' + n.data.color.toString(16).padStart(6, '0'));
      }
    } else {
      for (const cc of G.storm.cores) if (!cc.taken) { c.fillStyle = '#ff8af0'; c.beginPath(); c.arc(tx(cc.pos.x), tz(cc.pos.z), 5, 0, 7); c.fill(); }
      c.strokeStyle = '#ffe9a0'; c.lineWidth = 4; c.beginPath(); c.arc(tx(G.storm.origin.x), tz(G.storm.origin.z), 10, 0, 7); c.stroke();
    }
    for (const e of G.combat.enemies) { c.fillStyle = '#ff5a5a'; c.beginPath(); c.arc(tx(e.pos.x), tz(e.pos.z), 4, 0, 7); c.fill(); }
    // ship
    c.save();
    c.translate(tx(G.ship.pos.x), tz(G.ship.pos.z));
    c.rotate(-G.ship.yaw);
    c.fillStyle = '#ffffff'; c.strokeStyle = '#2a1a08'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -14); c.lineTo(8, 10); c.lineTo(0, 6); c.lineTo(-8, 10); c.closePath(); c.fill(); c.stroke();
    c.restore();
    c.restore();
    // player at centre, facing up
    c.fillStyle = '#ffd36a'; c.strokeStyle = '#000'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(R, R - 11); c.lineTo(R + 7, R + 7); c.lineTo(R, R + 3); c.lineTo(R - 7, R + 7); c.closePath(); c.fill(); c.stroke();
    // north marker
    c.save(); c.translate(R, R); c.rotate(yaw);
    c.fillStyle = '#fff'; c.font = 'bold 26px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('N', 0, -R + 22);
    c.restore();
  }
  star(c, x, y, r, col) {
    c.fillStyle = col; c.strokeStyle = '#000'; c.lineWidth = 2;
    c.beginPath();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2; const rr = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    c.closePath(); c.fill(); c.stroke();
  }

  prompt(text) {
    const el = $('prompt');
    if (!text) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    if (el._t !== text) { el.innerHTML = text; el._t = text; }
  }

  // ----- dialog
  dialog(s, kind) {
    const G = this.G;
    const have = G.progress.have(s.quest.item);
    const it = ITEMS[s.quest.item];
    let body = '';
    if (kind === 'hello') body = `<p>"${s.hello}"</p><p class="prog">★ ${s.unlock}</p><p>"${s.quest.ask}"</p>`;
    else if (kind === 'quest') body = `<p>"${s.quest.ask}"</p><p class="prog">${it.icon} ${it.name}: ${Math.min(have, s.quest.need)} / ${s.quest.need}</p><p style="opacity:.8">Reward: ${s.quest.reward}</p>`;
    else if (kind === 'complete') body = `<p>"You did it! Here — this is for you."</p><p class="prog">★ ${s.quest.reward}</p>`;
    else body = `<p>"${['Feels like home up here.', 'Where to next, Captain?', 'I saw a new island rise to the east. Or was it west?', 'The Storm sounds hungry tonight.'][Math.floor(Math.random() * 4)]}"</p><p class="prog">★ ${s.quest.reward}</p>`;
    const col = '#' + s.color.toString(16).padStart(6, '0');
    $('dialog').innerHTML = `<div class="face" style="background:${col}"></div><div><h3>${s.name} <span style="opacity:.7;font-weight:400;font-size:14px">· ${s.role}</span></h3>${body}<div class="close">Press <kbd>E</kbd> or <kbd>Space</kbd> to continue</div></div>`;
    $('dialog').classList.remove('hidden');
    this.dialogOpen = true;
    this.dialogT = 0.3;
  }
  closeDialog() { $('dialog').classList.add('hidden'); this.dialogOpen = false; }

  // ----- workshop menu
  renderMenu() {
    const G = this.G, s = G.save;
    const r = s.res;
    $('menuRes').innerHTML = `<div class="chip sh">◆ ${r.shards}</div><div class="chip sc">⚙ ${r.scrap}</div><div class="chip co">✦ ${r.cores}</div>`;
    const body = $('menuBody');
    if (this.tab === 'up') {
      body.innerHTML = `<div class="cards">${UPGRADES.map((u, i) => {
        const lvl = s.upg[u.id];
        const chk = G.progress.canUpgrade(u);
        const maxed = lvl >= u.max;
        const c = maxed ? null : G.progress.upgradeCost(u);
        const pips = u.max > 1 ? '●'.repeat(lvl) + '○'.repeat(u.max - lvl) : (lvl ? 'Built' : '');
        const cost = c ? `<div class="cost">${c.shards ? `<span class="${r.shards < c.shards ? 'no' : ''}">◆ ${c.shards}</span>` : ''}${c.scrap ? `<span class="${r.scrap < c.scrap ? 'no' : ''}">⚙ ${c.scrap}</span>` : ''}${c.cores ? `<span class="${r.cores < c.cores ? 'no' : ''}">✦ ${c.cores}</span>` : ''}</div>` : '';
        return `<div class="card"><h3>${u.icon} ${u.name}<span class="pips">${pips}</span></h3><p>${maxed ? 'Fully upgraded.' : u.desc(Math.max(1, lvl))}</p>${cost}${!chk.ok && !maxed ? `<div class="why">${chk.why}</div>` : ''}<button data-up="${i}" ${chk.ok ? 'class="primary"' : 'disabled'}>${maxed ? 'Maxed' : u.max === 1 ? 'Build' : 'Upgrade'}</button></div>`;
      }).join('')}</div>`;
      body.querySelectorAll('button[data-up]').forEach((b) => {
        b.onclick = () => { if (G.progress.buy(UPGRADES[+b.dataset.up])) { this.toast(`${UPGRADES[+b.dataset.up].name} upgraded!`, 2.5, 'good'); this.refresh(); this.renderMenu(); } };
      });
    } else if (this.tab === 'crew') {
      body.innerHTML = `<div class="cards">${SURVIVORS.map((sv) => {
        const col = '#' + sv.color.toString(16).padStart(6, '0');
        const has = s.has(sv.id);
        const done = s.questDone.includes(sv.id);
        const it = ITEMS[sv.quest.item];
        const have = G.progress.have(sv.quest.item);
        return `<div class="card"><div class="crew"><div class="face" style="background:${has ? col : '#333'}"></div><div><h3>${has ? sv.name : '???'}</h3><p>${sv.role} · ${['Verdant', 'Amberwild', 'Glasswood', 'Emberfell'][sv.tier]} isles</p></div></div>
          <p>${has ? '★ ' + sv.unlock : 'Not yet rescued. Look for their light beam.'}</p>
          ${has ? `<p class="prog">${done ? '✔ ' + sv.quest.reward : `${it.icon} ${it.name} ${Math.min(have, sv.quest.need)}/${sv.quest.need} → ${sv.quest.reward}`}</p>` : ''}</div>`;
      }).join('')}</div>`;
    } else {
      body.innerHTML = `<p style="opacity:.8;margin-top:0">Balloon paint is purely cosmetic and always free — some colours are earned by playing.</p><div class="swatches">${PAINTS.map((p, i) => {
        const ok = G.progress.paintUnlocked(i);
        const col = '#' + p.color.toString(16).padStart(6, '0'), ac = '#' + p.accent.toString(16).padStart(6, '0');
        return `<div class="sw ${s.paint === i ? 'on' : ''} ${ok ? '' : 'lock'}" data-p="${i}"><div class="c" style="background:repeating-linear-gradient(90deg, ${col} 0 14px, ${ac} 14px 28px)"></div>${p.name}${ok ? '' : `<br><small>🔒 ${p.hint}</small>`}</div>`;
      }).join('')}</div>`;
      body.querySelectorAll('.sw').forEach((el) => {
        el.onclick = () => { const i = +el.dataset.p; if (!G.progress.paintUnlocked(i)) { G.audio.play('error'); return; } s.paint = i; G.ship.applyPaint(); G.player.gliderMat.color.setHex(PAINTS[i].color); G.audio.play('click'); s.write(); this.renderMenu(); };
      });
    }
  }

  // ----- storm dive
  stormStart(mods) {
    this.toast('🌀 STORM DIVE — collect Storm Cores ✦ and escape through the golden beam!', 5, 'warn');
    this.toast('Modifiers: ' + mods.map((m) => `${m.name} (${m.desc})`).join(' · '), 6);
    $('stormhud').classList.remove('hidden');
  }
  stormHud(st) {
    const t = Math.max(0, st.time);
    const el = $('stormhud');
    el.classList.toggle('low', t < 25);
    const html = `<div class="t">${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}</div><div>✦ ${st.collected} cores · Hull ${Math.round(this.G.ship.hp)}</div><div class="m">${st.chosen.map((m) => m.name).join(' · ')}</div>`;
    if (html !== this._sh) { el.innerHTML = html; this._sh = html; }
  }
  stormSummary(result, d) {
    $('stormhud').classList.add('hidden');
    const G = this.G;
    const title = result === 'escaped' ? '<div class="big" style="color:#ffe9a0">ESCAPED!</div><p>You burst out of the Storm with your haul intact.</p>'
      : result === 'collapsed' ? '<div class="big" style="color:#ffb04a">STORM COLLAPSED</div><p>The rift spat you out — half your cores were lost.</p>'
        : '<div class="big" style="color:#ff6a6a">WRECKED</div><p>Your ship was torn apart. The crew patched her up, but the cores are gone.</p>';
    $('summaryBody').innerHTML = `${title}
      <div class="stat"><span>Storm Cores found</span><b>${d.collected}</b></div>
      <div class="stat"><span>Storm Cores banked</span><b style="color:var(--core)">✦ ${d.cores}</b></div>
      <div class="stat"><span>Wisps destroyed</span><b>${d.kills}</b></div>
      <div class="stat"><span>Bonus shards</span><b style="color:#8ff0ff">◆ ${d.shards}</b></div>
      <div class="stat"><span>Modifiers</span><b>${d.mods.map((m) => m.name).join(', ')}</b></div>
      ${G.save.data.dives === 1 ? '<p class="prog">🎨 Unlocked paint: Storm Violet</p>' : ''}
      <button id="btnSumOk" class="primary" style="margin-top:14px">Back to the skies</button>`;
    G.openSummary();
    $('btnSumOk').onclick = () => G.closeSummary();
    this.refresh();
  }
}
