import * as THREE from 'three';
import { G, WORLD_SIZE, HALF_WORLD } from '../core/G.js';
import { icon } from './icons.js';
import { ITEMS, MATERIALS, CONSUMABLES, RECIPES, SWORDS, ARMORS } from '../game/items.js';
import { EPOCHS } from '../world/epochs.js';
import { POIS, START, LAKE, lakeRadius } from '../world/worldmap.js';
import { Game } from '../game/game.js';
import { SPELLS } from '../combat/magic.js';
import { QUALITY } from '../core/renderer.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

export const SKILLS = [
  { id: 'keen', tree: 'Blade', name: 'Keen Edge', desc: '+15% melee damage.' },
  { id: 'riposte', tree: 'Blade', name: 'Riposte', desc: 'Parries counter-strike automatically and the window widens.', req: 'keen' },
  { id: 'whirlwind', tree: 'Blade', name: 'Whirlwind', desc: 'A fully charged heavy attack becomes a spinning slash.', req: 'riposte' },
  { id: 'flow', tree: 'Aether', name: 'Flow', desc: 'Aether regenerates 45% faster.' },
  { id: 'weaver', tree: 'Aether', name: 'Weaver', desc: 'Spells cost 15% less and woven blades last longer.', req: 'flow' },
  { id: 'deepwell', tree: 'Aether', name: 'Deep Well', desc: '+40 maximum aether.', req: 'weaver', apply: (P) => { P.maxMana += 40; P.mana = P.maxMana; } },
  { id: 'mountaineer', tree: 'Wayfarer', name: 'Mountaineer', desc: 'Climbing costs 30% less stamina.' },
  { id: 'secondwind', tree: 'Wayfarer', name: 'Second Wind', desc: 'Stamina recovers 30% faster.', req: 'mountaineer' },
  { id: 'featherfall', tree: 'Wayfarer', name: 'Featherfall', desc: 'No fall damage, gliding costs far less stamina.', req: 'secondwind' },
  { id: 'timeslip', tree: 'Wayfarer', name: 'Timeslip', desc: 'Perfect dodges slow time for longer.', req: 'mountaineer' },
];

export class UI {
  constructor() {
    this.root = document.getElementById('ui-root');
    this.paused = false;
    this.blocking = false;
    this.timeScale = 1;
    this.menuOpen = false;
    this.tab = 'map';
    this.titleT = 0;
    this.mapImgs = {};
    this.buildTitle();
    this.buildMenu();
    this.buildWheel();
    this.buildModal();
  }

  // ------------------------------------------------------------------ title
  buildTitle() {
    const t = el('div', 'title-screen');
    t.innerHTML = `
      <div class="title-inner">
        <div class="logo"><span class="l1">Chronos</span><span class="amp">&amp;</span><span class="l2">Cosmos</span></div>
        <div class="tagline">Three Ages. One river of time. Every choice ripples.</div>
        <nav class="title-menu">
          <button id="btn-continue" class="tbtn">Continue</button>
          <button id="btn-new" class="tbtn primary">New Journey</button>
          <button id="btn-settings" class="tbtn">Settings</button>
          <button id="btn-controls" class="tbtn">Controls</button>
        </nav>
        <div class="diff">
          <span>Difficulty</span>
          <button data-d="story">Story</button><button data-d="balanced">Balanced</button><button data-d="hard">Hard</button>
        </div>
        <div class="title-foot"><span class="kbm-only">Click the game to capture the mouse · </span><span class="touch-only">Left thumb moves · right thumb looks · tap to strike · </span>Gamepad supported · Best with headphones</div>
      </div>`;
    this.root.appendChild(t);
    this.titleEl = t;
    t.querySelector('#btn-new').onclick = () => {
      if (Game.hasSave()) this.confirm('Start a new journey? Your current save will be replaced.', () => { Game.clearSave(); this.startNew(); });
      else this.startNew();
    };
    t.querySelector('#btn-continue').onclick = () => this.continueGame();
    t.querySelector('#btn-settings').onclick = () => { this.openMenu('settings'); };
    t.querySelector('#btn-controls').onclick = () => { this.openMenu('controls'); };
    t.querySelectorAll('.diff button').forEach((b) => (b.onclick = () => { G.settings.difficulty = b.dataset.d; this.saveSettings(); this.refreshDiff(); }));
    this.refreshDiff();
  }
  refreshDiff() {
    this.titleEl.querySelectorAll('.diff button').forEach((b) => b.classList.toggle('on', b.dataset.d === G.settings.difficulty));
  }

  showTitle() {
    G.state = 'title';
    this.titleEl.hidden = false;
    G.hud.show(false);
    document.getElementById('loading').classList.add('gone');
    this.titleEl.querySelector('#btn-continue').hidden = !Game.hasSave();
    G.epochs.setInstant(0);
    G.atmo.timeOfDay = 16.4;
    G.player.rig.setVisible(false);
  }

  titleCamera(dt) {
    this.titleT += dt;
    const sp = G.content.spire;
    const a = this.titleT * 0.035 + 2.2;
    const r = 150;
    G.camera.position.set(sp.x + Math.sin(a) * r, 34 + Math.sin(this.titleT * 0.1) * 4, sp.z + Math.cos(a) * r);
    G.camera.lookAt(sp.x, sp.y + 45, sp.z);
    if (G.camera.fov !== 50) { G.camera.fov = 50; G.camera.updateProjectionMatrix(); }
    // gentle epoch preview cycle on the title
    const cyc = Math.floor(this.titleT / 14) % 3;
    if (cyc !== this.titleEpoch && !G.epochs.shifting) {
      this.titleEpoch = cyc;
      if (this.titleT > 1) G.epochs.shift(cyc, { force: true, center: new THREE.Vector3(sp.x, sp.y, sp.z), cooldown: 0 });
    }
  }

  beginPlay() {
    // phones: go full screen and landscape where the browser allows it
    if (G.input.lastDevice === 'touch' || G.device === 'phone') {
      try {
        const de = document.documentElement;
        const p = de.requestFullscreen ? de.requestFullscreen({ navigationUI: 'hide' }) : de.webkitRequestFullscreen && de.webkitRequestFullscreen();
        if (p && p.then) p.then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
      } catch (e) {}
    }
    this.titleEl.hidden = true;
    G.state = 'play';
    G.hud.show(true);
    G.player.rig.setVisible(true);
    G.audio?.start();
    G.input.requestLock();
    G.cam.smoothTarget.copy(G.player.pos);
    G.cam.yaw = G.player.yaw + Math.PI;
  }

  startNew(skipIntro) {
    G.audio?.init();
    const S = G.game.state;
    S.difficulty = G.settings.difficulty;
    G.epochs.setInstant(0);
    G.epochs.locked = true;
    G.atmo.timeOfDay = 8.2;
    G.atmo.day = 1;
    const P = G.player;
    P.spawn(START.x, G.terrain.heightAt(START.x, START.z) + 0.1, START.z);
    P.yaw = Math.atan2(LAKE.x - START.x, LAKE.z - START.z);
    G.game.equipSword('wayfarer');
    G.game.equipArmor('traveler');
    this.beginPlay();
    G.quests.start('main1');
    if (skipIntro) return;
    P.mode = 'locked';
    G.story.introCutscene(() => {
      P.mode = 'ground';
      const touch = G.input.lastDevice === 'touch';
      G.hud.toast(touch ? 'Left thumb moves (push fully to sprint) · Right thumb looks around' : 'WASD to move · Mouse to look · Shift to sprint · Space to jump', 'tip');
      G.after(3.5, () => G.hud.toast(touch ? 'Walk up to Lyra and tap Use to talk' : 'Talk to Lyra with E', 'tip'));
    });
  }

  continueGame() {
    G.audio?.init();
    const s = Game.loadRaw();
    if (!s) return this.startNew();
    G.game.apply(s);
    G.story.restoreFollowers();
    G.epochs.locked = !s.flags.shift_unlocked;
    this.beginPlay();
    G.hud.toast('Welcome back, Wayfarer.', 'good');
  }

  // ------------------------------------------------------------------ menu
  buildMenu() {
    const m = el('div', 'menu');
    m.hidden = true;
    m.innerHTML = `
      <div class="menu-frame">
        <header class="menu-head">
          <button class="back" aria-label="Back to the game"><span class="arr">‹</span> Back</button>
          <nav class="tabs">
            <button data-tab="map">Map</button><button data-tab="inventory">Inventory</button><button data-tab="crafting">Crafting</button>
            <button data-tab="journal">Journal</button><button data-tab="skills">Skills</button><button data-tab="feats">Feats</button><button data-tab="settings">Settings</button><button data-tab="controls">Controls</button>
          </nav>
          <button class="photo-btn" title="Photo Mode (V)">Photo</button>
        </header>
        <section class="menu-body"></section>
      </div>`;
    this.root.appendChild(m);
    this.menuEl = m;
    this.body = m.querySelector('.menu-body');
    m.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => this.setTab(b.dataset.tab)));
    m.querySelector('.photo-btn').onclick = () => G.photo?.open();
    m.querySelector('.back').onclick = () => this.closeMenu();
  }

  openMenu(tab) {
    if (!this.menuOpen) this._invScroll = 0;
    this.menuOpen = true;
    this.paused = G.state === 'play';
    this.blocking = true;
    this.menuEl.hidden = false;
    G.input.exitLock();
    G.audio?.sfx('menuOpen');
    this.setTab(tab || this.tab);
  }
  closeMenu() {
    this.menuOpen = false;
    this.paused = false;
    this.blocking = false;
    this.menuEl.hidden = true;
    this.stationFire = false;
    if (G.state === 'play') G.input.requestLock();
    G.audio?.sfx('menuClose');
  }
  setTab(t) {
    this.tab = t;
    this.menuEl.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    const titleOnly = G.state !== 'play';
    this.menuEl.querySelectorAll('.tabs button').forEach((b) => (b.hidden = titleOnly && !['settings', 'controls'].includes(b.dataset.tab)));
    this.menuEl.querySelector('.photo-btn').hidden = titleOnly;
    this.body.innerHTML = '';
    this.body.className = 'menu-body tab-' + t;
    this['tab_' + t]?.();
  }

  tab_feats() {
    G.feats?.render(this.body);
  }

  // ---- map
  mapImage(epoch) {
    if (this.mapImgs[epoch]) return this.mapImgs[epoch];
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    const T = G.terrain;
    const wl = EPOCHS[epoch].water.level;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const wx = -HALF_WORLD + (x / S) * WORLD_SIZE, wz = -HALF_WORLD + (y / S) * WORLD_SIZE;
        const h = T.heightAt(wx, wz);
        const hl = T.heightAt(wx - 3, wz - 3);
        const shade = Math.max(0.45, Math.min(1.35, 1 + (h - hl) * 0.08));
        const m = T.maskAt(wx, wz);
        let r, gg, b;
        if (h < wl) {
          const d = Math.min(1, (wl - h) / 12);
          if (epoch === 2) { r = 40 - d * 20; gg = 60 - d * 30; b = 130 - d * 40; }
          else { r = 70 - d * 40; gg = 120 - d * 50; b = 150 - d * 40; }
        } else if (epoch === 0) {
          r = 110 + m[2] * 70; gg = 140 - m[3] * 30 - m[2] * 30; b = 70;
          if (h > 140) { r = gg = b = 230; }
          if (m[1] > 0.5) { r = 170; gg = 140; b = 100; }
        } else if (epoch === 1) {
          r = 110 + m[2] * 40; gg = 90; b = 80;
          if (h > 140) { r = 120; gg = 115; b = 112; }
          if (h < wl + 15 && Math.hypot(wx - LAKE.x, wz - LAKE.z) < lakeRadius(wx, wz)) { r = 150; gg = 125; b = 95; }
        } else {
          r = 60 + m[2] * 60; gg = 60; b = 120 + m[2] * 30;
          if (h > 140) { r = 210; gg = 220; b = 255; }
        }
        const i = (y * S + x) * 4;
        img.data[i] = Math.min(255, r * shade);
        img.data[i + 1] = Math.min(255, gg * shade);
        img.data[i + 2] = Math.min(255, b * shade);
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    this.mapImgs[epoch] = c;
    return c;
  }

  tab_map() {
    const wrap = el('div', 'map-wrap');
    const cv = el('canvas', 'map-canvas');
    cv.width = cv.height = 1024;
    wrap.appendChild(cv);
    const legend = el('div', 'map-legend', `<h3>${EPOCHS[G.epochs.current].name}</h3><p>Click the map to place a marker. Click it again to remove it.</p>
      <ul><li><i style="--c:#f3c66b"></i>Village</li><li><i style="--c:#9fd8ff"></i>Sun Pillar</li><li><i style="--c:#c9a8ff"></i>Trial</li><li><i style="--c:#d07aff"></i>Rift</li><li><i style="--c:#ffb36a"></i>Campfire</li><li><i style="--c:#ff6a5a"></i>Arena</li><li><i style="--c:#ffe08a"></i>Quest</li></ul>
      <p class="stat">${Object.keys(G.game.state.discovered).length} / ${POIS.length} places discovered · ${G.game.state.motes} Star Motes</p>`);
    wrap.appendChild(legend);
    this.body.appendChild(wrap);
    const draw = () => {
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = true;
      g.drawImage(this.mapImage(G.epochs.current), 0, 0, 1024, 1024);
      const toMap = (x, z) => [((x + HALF_WORLD) / WORLD_SIZE) * 1024, ((z + HALF_WORLD) / WORLD_SIZE) * 1024];
      // edge vignette
      const grd = g.createRadialGradient(512, 512, 380, 512, 512, 720);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(1, 'rgba(8,8,20,0.85)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 1024, 1024);
      const S = G.game.state;
      for (const p of POIS) {
        if (!S.discovered[p.id]) continue;
        const [mx, my] = toMap(p.x, p.z);
        const color = { village: '#f3c66b', arena: '#ff6a5a', pillar: '#9fd8ff', trial: '#c9a8ff', rift: '#d07aff', camp: '#ffb36a', spire: '#fff2c0', astral: '#9fd8ff' }[p.type] || '#ccc';
        g.fillStyle = color;
        g.strokeStyle = 'rgba(10,10,20,0.9)';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(mx, my, p.type === 'village' || p.type === 'spire' ? 9 : 6, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.font = '600 15px "Alegreya Sans", sans-serif';
        g.fillStyle = 'rgba(255,248,230,0.95)';
        g.strokeStyle = 'rgba(0,0,0,0.7)';
        g.lineWidth = 4;
        g.strokeText(p.name, mx + 12, my + 5);
        g.fillText(p.name, mx + 12, my + 5);
      }
      const wp = G.game.activeWaypoint();
      if (wp) {
        const [mx, my] = toMap(wp.x, wp.z);
        g.fillStyle = '#ffe08a';
        g.beginPath();
        g.moveTo(mx, my);
        g.lineTo(mx - 9, my - 18);
        g.lineTo(mx + 9, my - 18);
        g.closePath();
        g.fill();
      }
      const P = G.player;
      const [px, py] = toMap(P.pos.x, P.pos.z);
      g.save();
      g.translate(px, py);
      g.rotate(-P.yaw + Math.PI);
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#000';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, -14);
      g.lineTo(9, 10);
      g.lineTo(0, 5);
      g.lineTo(-9, 10);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    };
    draw();
    cv.onclick = (e) => {
      const r = cv.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * WORLD_SIZE - HALF_WORLD;
      const z = ((e.clientY - r.top) / r.height) * WORLD_SIZE - HALF_WORLD;
      const wp = G.game.waypoint;
      if (wp && Math.hypot(wp.x - x, wp.z - z) < 25) G.game.waypoint = null;
      else G.game.waypoint = { x, z, color: '#ffffff' };
      draw();
    };
  }

  // ---- inventory
  tab_inventory() {
    const S = G.game.state;
    const P = G.player;
    const wrap = el('div', 'inv-wrap');
    const stats = el('div', 'inv-stats inv-card', `
      <h3>Wayfarer · Level ${P.level}</h3>
      <dl>
        <dt>Health</dt><dd>${Math.ceil(P.hp)} / ${P.maxHp}</dd>
        <dt>Aether</dt><dd>${Math.ceil(P.mana)} / ${P.maxMana}</dd>
        <dt>Stamina</dt><dd>${P.maxStamina}</dd>
        <dt>Attack</dt><dd>${Math.round(P.attackPower)}</dd>
        <dt>Armor</dt><dd>${P.armor}</dd>
        <dt>Stance</dt><dd>${P.stance === 'wind' ? 'Wind' : 'Stone'}</dd>
        <dt>Star Motes</dt><dd>${S.motes}</dd>
      </dl>`);
    wrap.appendChild(stats);
    // every section is a card: a grid on big screens, a swipeable row on small ones
    const sec = (title) => { const s = el('div', 'inv-sec inv-card'); s.appendChild(el('h4', '', title)); wrap.appendChild(s); return s; };
    const mats = sec('Materials');
    const grid = el('div', 'item-grid');
    for (const id of MATERIALS) grid.appendChild(this.itemCell(id, S.inv[id] || 0));
    mats.appendChild(grid);
    const cons = sec('Provisions');
    const cg = el('div', 'item-grid');
    for (const id of CONSUMABLES) {
      const c = this.itemCell(id, S.inv[id] || 0, true);
      if (S.inv[id] > 0) {
        const b = el('button', 'mini', 'Use');
        b.onclick = () => { G.game.useItem(id); this.closeMenu(); };
        c.appendChild(b);
        const q = el('button', 'mini ghost', G.game.quickSel === id ? 'Quick ✓' : 'Set quick');
        q.onclick = () => { G.game.quickSel = id; this.setTab('inventory'); };
        c.appendChild(q);
      }
      cg.appendChild(c);
    }
    cons.appendChild(cg);
    const gear = sec('Equipment');
    const eg = el('div', 'gear-list');
    for (const k in SWORDS) {
      if (!S.owned['sword_' + k]) continue;
      const on = S.sword === k;
      const b = el('button', 'gear' + (on ? ' on' : ''), `<b>${SWORDS[k].name}</b><span>+${SWORDS[k].dmg} damage</span>`);
      b.onclick = () => { G.game.equipSword(k); this.setTab('inventory'); };
      eg.appendChild(b);
    }
    for (const k in ARMORS) {
      if (!S.owned['armor_' + k]) continue;
      const on = S.armor === k;
      const b = el('button', 'gear' + (on ? ' on' : ''), `<b>${ARMORS[k].name}</b><span>${ARMORS[k].armor} armor</span>`);
      b.onclick = () => { G.game.equipArmor(k); this.setTab('inventory'); };
      eg.appendChild(b);
    }
    gear.appendChild(eg);
    const keys = Object.keys(ITEMS).filter((k) => ITEMS[k].type === 'key' && S.inv[k] > 0);
    if (keys.length) {
      const ks = sec('Key Items');
      const kg = el('div', 'item-grid');
      for (const id of keys) kg.appendChild(this.itemCell(id, S.inv[id], true));
      ks.appendChild(kg);
    }
    const sp = sec('Spells');
    const sl = el('div', 'spell-list');
    SPELLS.forEach((s, i) => {
      const un = G.game.state.elements[i];
      sl.appendChild(el('div', 'spell' + (un ? '' : ' locked'), `<img alt="" src="${icon('el' + i)}"><div><b>${un ? s.name : '???'}</b><span>${un ? `Tap Q · ${s.cost} aether. Hold Q: ${s.big} · ${s.bigCost}. ${s.desc}` : 'Not yet awakened.'}</span></div>`));
    });
    sp.appendChild(sl);
    const shell = el('div', 'inv-shell');
    shell.appendChild(wrap);
    shell.appendChild(el('button', 'inv-nav prev', '‹'));
    shell.appendChild(el('button', 'inv-nav next', '›'));
    shell.appendChild(el('div', 'inv-dots'));
    this.body.appendChild(shell);
    this.setupCarousel(shell, wrap);
  }

  // Sideways scrolling for the inventory cards: swipe, trackpad, mouse wheel,
  // mouse drag, the arrow buttons, or left/right on keyboard and gamepad.
  setupCarousel(shell, wrap) {
    const prev = shell.querySelector('.prev'), next = shell.querySelector('.next'), dots = shell.querySelector('.inv-dots');
    const cards = [...wrap.children];
    dots.innerHTML = cards.map(() => '<i></i>').join('');
    const step = () => (cards[0] ? cards[0].getBoundingClientRect().width : 300) + 12;
    const sideways = () => wrap.scrollWidth > wrap.clientWidth + 2;
    const update = () => {
      shell.classList.toggle('scrolls', sideways());
      const i = Math.min(cards.length - 1, Math.round(wrap.scrollLeft / step()));
      [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
      prev.disabled = wrap.scrollLeft <= 2;
      next.disabled = wrap.scrollLeft >= wrap.scrollWidth - wrap.clientWidth - 2;
      this._invScroll = wrap.scrollLeft;
    };
    const go = (dir) => wrap.scrollBy({ left: dir * step(), behavior: 'smooth' });
    this.invScroll = go;
    prev.onclick = () => go(-1);
    next.onclick = () => go(1);
    wrap.addEventListener('scroll', update, { passive: true });
    // a plain mouse wheel scrolls sideways, unless the card under it can still scroll down/up
    wrap.addEventListener('wheel', (e) => {
      if (!sideways() || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const card = e.target.closest('.inv-card');
      if (card && card.scrollHeight > card.clientHeight + 2) {
        const atTop = card.scrollTop <= 0, atBottom = card.scrollTop + card.clientHeight >= card.scrollHeight - 1;
        if (!(e.deltaY < 0 && atTop) && !(e.deltaY > 0 && atBottom)) return;
      }
      wrap.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false });
    // drag with the mouse like a touch swipe
    let drag = null;
    wrap.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || !sideways() || e.target.closest('button')) return;
      drag = { x: e.clientX, s: wrap.scrollLeft, id: e.pointerId };
      wrap.setPointerCapture(e.pointerId);
      wrap.style.scrollSnapType = 'none';
    });
    wrap.addEventListener('pointermove', (e) => {
      if (drag && e.pointerId === drag.id) wrap.scrollLeft = drag.s - (e.clientX - drag.x);
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      wrap.style.scrollSnapType = '';
      wrap.scrollTo({ left: Math.round(wrap.scrollLeft / step()) * step(), behavior: 'smooth' });
    };
    wrap.addEventListener('pointerup', end);
    wrap.addEventListener('pointercancel', end);
    // keep your place when the tab re-renders (using an item, equipping gear)
    if (this._invScroll) wrap.scrollLeft = this._invScroll;
    requestAnimationFrame(update);
  }
  itemCell(id, n, wide) {
    const it = ITEMS[id];
    const c = el('div', 'item' + (n ? '' : ' empty') + (wide ? ' wide' : ''), `<img alt="" src="${icon(id)}"><span class="n">${n}</span><div class="tip"><b>${it.name}</b><span>${it.desc}</span></div>`);
    return c;
  }

  // ---- crafting
  tab_crafting() {
    const S = G.game.state;
    const nearFire = this.stationFire || G.content.campfires.some((c) => Math.hypot(c.x - G.player.pos.x, c.z - G.player.pos.z) < 6);
    const wrap = el('div', 'craft-wrap');
    wrap.appendChild(el('p', 'craft-note', nearFire ? 'You are by a fire: every recipe is available.' : 'Brews can be made anywhere. Forging gear needs a campfire.'));
    const cats = {};
    for (const r of RECIPES) (cats[r.cat] = cats[r.cat] || []).push(r);
    for (const cat in cats) {
      const sec = el('div', 'craft-sec');
      sec.appendChild(el('h4', '', cat));
      for (const r of cats[cat]) {
        const owned = r.gear ? S.owned[r.gear + '_' + r.key] : r.upgrade && !r.repeat ? S[r.upgrade === 'glider' ? 'glider' : 'staminaUp'] >= 1 : r.repeat && (S.staminaUp || 0) >= r.repeat;
        const reqOk = !r.req || S.owned[r.req.replace('sword_', 'sword_').replace('armor_', 'armor_')];
        const stationOk = r.station === 'any' || nearFire;
        const afford = G.game.canAfford(r.cost);
        const name = r.out ? ITEMS[r.out].name : r.gear === 'sword' ? SWORDS[r.key].name : r.gear === 'armor' ? ARMORS[r.key].name : r.upgrade === 'glider' ? 'Dawnwing Glider' : 'Vigor Draught';
        const desc = r.out ? ITEMS[r.out].desc : r.gear === 'sword' ? `+${SWORDS[r.key].dmg} damage blade` : r.gear === 'armor' ? `${ARMORS[r.key].armor} armor` : r.desc;
        const row = el('div', 'recipe' + (owned ? ' owned' : '') + (!reqOk ? ' locked' : ''));
        row.innerHTML = `<img alt="" src="${icon(r.out || (r.gear === 'sword' ? 'iron' : r.gear === 'armor' ? 'hide' : 'crystal'))}"><div class="r-main"><b>${name}</b><span>${desc}</span>
          <div class="cost">${Object.entries(r.cost).map(([k, v]) => `<span class="${(S.inv[k] || 0) >= v ? 'ok' : 'no'}"><img alt="" src="${icon(k)}">${S.inv[k] || 0}/${v}</span>`).join('')}</div></div>`;
        const btn = el('button', 'craft-btn', owned ? 'Owned' : !reqOk ? 'Locked' : !stationOk ? 'Needs fire' : 'Craft');
        btn.disabled = owned || !reqOk || !stationOk || !afford;
        btn.onclick = () => {
          if (!G.game.pay(r.cost)) return;
          if (r.out) G.game.give(r.out, r.n || 1);
          else if (r.gear) {
            S.owned[r.gear + '_' + r.key] = true;
            if (r.gear === 'sword') G.game.equipSword(r.key); else G.game.equipArmor(r.key);
            G.hud.banner(name, 'Forged and equipped', 'item');
          } else if (r.upgrade === 'glider') { S.glider = 1; G.hud.banner('Dawnwing Glider', 'Glides are faster and lighter', 'item'); }
          else if (r.upgrade === 'stamina') { S.staminaUp = (S.staminaUp || 0) + 1; G.player.maxStamina += 20; G.hud.banner('Vigor Draught', '+20 maximum stamina', 'item'); }
          G.audio?.sfx('craft');
          this.setTab('crafting');
        };
        row.appendChild(btn);
        sec.appendChild(row);
      }
      wrap.appendChild(sec);
    }
    this.body.appendChild(wrap);
  }

  // ---- journal
  tab_journal() {
    const S = G.game.state;
    const Q = G.quests;
    const wrap = el('div', 'journal-wrap');
    const left = el('div', 'j-quests');
    left.appendChild(el('h3', '', 'Quests'));
    const ids = Object.keys(Q.st);
    const active = ids.filter((id) => !Q.st[id].done);
    const done = ids.filter((id) => Q.st[id].done);
    for (const id of active) {
      const q = Q.defs[id];
      const d = el('div', 'jq ' + (q.kind || 'side') + (Q.tracked === id ? ' tracked' : ''));
      d.innerHTML = `<b>${q.title}</b><span>${Q.stepText(id)}</span>`;
      const steps = el('ol', 'jq-steps');
      q.steps.forEach((s, i) => { if (i < Q.st[id].step) steps.appendChild(el('li', 'done', typeof s.text === 'function' ? s.text(S) : s.text)); });
      d.appendChild(steps);
      const t = el('button', 'mini ghost', Q.tracked === id ? 'Tracking' : 'Track');
      t.onclick = () => { Q.tracked = id; Q.refresh(); this.setTab('journal'); };
      d.appendChild(t);
      left.appendChild(d);
    }
    if (done.length) {
      left.appendChild(el('h4', '', 'Completed'));
      for (const id of done) left.appendChild(el('div', 'jq done', `<b>${Q.defs[id].title}</b>`));
    }
    wrap.appendChild(left);
    const right = el('div', 'j-side');
    right.appendChild(el('h3', '', 'Companions'));
    for (const [k, name, age] of [['lyra', 'Lyra', 'Age of Bloom'], ['kael', 'Kael', 'Age of Ash'], ['oriel', 'Oriel', 'Age of Stars']]) {
      const met = k === 'lyra' ? S.flags.met_lyra : k === 'kael' ? S.flags.met_kael : S.flags.met_oriel;
      const v = S.affinity[k] || 0;
      right.appendChild(el('div', 'comp' + (met ? '' : ' unknown'), `<b>${met ? name : '???'}</b><span>${age}${S.flags[k + '_recruited'] ? ' · Companion' : ''}</span><div class="aff"><div style="width:${Math.max(0, (v + 100) / 2)}%"></div></div><em>${v >= 60 ? 'Devoted' : v >= 30 ? 'Trusting' : v >= 0 ? 'Friendly' : v >= -30 ? 'Wary' : 'Hostile'} (${v})</em>`));
    }
    right.appendChild(el('h3', '', 'Factions'));
    right.appendChild(el('div', 'comp', `<b>Verdant Circle</b><span>Keepers of seeds in the Age of Ash</span><div class="aff"><div style="width:${Math.max(0, Math.min(100, 50 + S.faction.verdant))}%"></div></div>`));
    right.appendChild(el('div', 'comp', `<b>Iron Covenant</b><span>Soldiers holding the line</span><div class="aff"><div style="width:${Math.max(0, Math.min(100, 50 + S.faction.covenant))}%"></div></div>`));
    right.appendChild(el('h3', '', 'Chronicle'));
    const st = S.stats;
    right.appendChild(el('dl', 'chron', `<dt>Foes vanquished</dt><dd>${st.kills}</dd><dt>Perfect parries</dt><dd>${st.parries}</dd><dt>Timeslips</dt><dd>${st.timeslips}</dd><dt>Spells cast</dt><dd>${st.spells}</dd><dt>Ages crossed</dt><dd>${st.shifts}</dd><dt>Rifts sealed</dt><dd>${st.rifts}</dd><dt>Blocks built</dt><dd>${st.built}</dd><dt>Time played</dt><dd>${Math.floor(S.playTime / 3600)}h ${Math.floor((S.playTime % 3600) / 60)}m</dd>`));
    wrap.appendChild(right);
    this.body.appendChild(wrap);
  }

  // ---- skills
  tab_skills() {
    const P = G.player;
    const wrap = el('div', 'skills-wrap');
    wrap.appendChild(el('p', 'sp', `Skill points: <b>${P.skillPoints || 0}</b> · Earn one each level.`));
    const cols = el('div', 'skill-cols');
    for (const tree of ['Blade', 'Aether', 'Wayfarer']) {
      const col = el('div', 'skill-col');
      col.appendChild(el('h4', '', tree));
      for (const s of SKILLS.filter((k) => k.tree === tree)) {
        const has = P.skills.has(s.id);
        const can = !has && (P.skillPoints || 0) > 0 && (!s.req || P.skills.has(s.req));
        const b = el('button', 'skill' + (has ? ' has' : can ? ' can' : ''), `<b>${s.name}</b><span>${s.desc}</span>${s.req && !P.skills.has(s.req) ? `<em>Requires ${SKILLS.find((k) => k.id === s.req).name}</em>` : ''}`);
        b.disabled = !can;
        b.onclick = () => {
          P.skills.add(s.id);
          P.skillPoints--;
          s.apply?.(P);
          G.audio?.sfx('unlock');
          this.setTab('skills');
        };
        col.appendChild(b);
      }
      cols.appendChild(col);
    }
    wrap.appendChild(cols);
    this.body.appendChild(wrap);
  }

  // ---- settings
  tab_settings() {
    const s = G.settings;
    const wrap = el('div', 'settings-wrap');
    const row = (label, ctrl) => { const r = el('label', 'set-row'); r.appendChild(el('span', '', label)); r.appendChild(ctrl); wrap.appendChild(r); return r; };
    const select = (id, opts, val, on) => {
      const sel = el('select');
      sel.id = id;
      for (const [v, t] of opts) { const o = el('option', '', t); o.value = v; if (v === val) o.selected = true; sel.appendChild(o); }
      sel.onchange = () => on(sel.value);
      return sel;
    };
    const range = (id, min, max, step, val, on) => {
      const r = el('input');
      r.type = 'range'; r.id = id; r.min = min; r.max = max; r.step = step; r.value = val;
      r.oninput = () => on(parseFloat(r.value));
      return r;
    };
    row('Graphics quality', select('set-quality', [['mobile', 'Mobile (phones)'], ['low', 'Low (Chromebooks)'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']], s.quality, (v) => { s.quality = v; s.manualQuality = true; G.qualityCfg = QUALITY[v]; G.quality = v; G.applyQuality(); this.saveSettings(); }));
    row('Difficulty', select('set-diff', [['story', 'Story — relaxed, forgiving'], ['balanced', 'Balanced'], ['hard', 'Hard — punishing']], s.difficulty, (v) => { s.difficulty = v; this.saveSettings(); this.refreshDiff(); }));
    row('Mouse sensitivity', range('set-sens', 0.3, 2.5, 0.05, s.sensitivity, (v) => { s.sensitivity = v; this.saveSettings(); }));
    row('Field of view', range('set-fov', 55, 95, 1, s.fov, (v) => { s.fov = v; this.saveSettings(); }));
    row('Camera shake', range('set-shake', 0, 1.5, 0.05, s.shake, (v) => { s.shake = v; this.saveSettings(); }));
    row('Master volume', range('set-vol', 0, 1, 0.01, s.volume, (v) => { s.volume = v; G.audio?.setVolume(); this.saveSettings(); }));
    row('Music volume', range('set-mus', 0, 1, 0.01, s.music, (v) => { s.music = v; G.audio?.setVolume(); this.saveSettings(); }));
    const inv = el('input'); inv.type = 'checkbox'; inv.id = 'set-inv'; inv.checked = s.invertY; inv.onchange = () => { s.invertY = inv.checked; this.saveSettings(); };
    row('Invert camera Y', inv);
    if (G.state === 'play') {
      const acts = el('div', 'set-actions');
      const save = el('button', 'tbtn', 'Save game'); save.onclick = () => G.game.save(false);
      const title = el('button', 'tbtn', 'Quit to title'); title.onclick = () => this.confirm('Return to the title screen? Unsaved progress since your last rest will be saved first.', () => { G.game.save(true); location.reload(); });
      acts.append(save, title);
      wrap.appendChild(acts);
    }
    this.body.appendChild(wrap);
  }
  saveSettings() {
    try { localStorage.setItem('chronos-cosmos-settings', JSON.stringify(G.settings)); } catch (e) {}
  }

  tab_controls() {
    const rows = [
      ['Move', 'W A S D', 'Left stick'], ['Look', 'Mouse', 'Right stick'], ['Sprint (hold) / Dodge (tap)', 'Shift', 'B'], ['Jump · Climb jump · Glide', 'Space', 'A'],
      ['Attack (hold to charge)', 'Left mouse', 'X'], ['Block (hold) / Parry (tap at impact)', 'Right mouse', 'RB'], ['Cast spell (hold for greater spell)', 'Q', 'RT'],
      ['Weave element into blade', 'F', 'LT'], ['Choose element', '1 – 4 / Wheel', 'D-pad ← →'], ['Switch stance', 'R', 'R3'], ['Lock on', 'Tab / Middle mouse', 'LB'],
      ['Shift Age (tap) / Age wheel (hold)', 'T', 'D-pad ↑'], ['Interact · Talk', 'E', 'Y'], ['Quick item', 'G', '—'], ['Sneak', 'C / Ctrl', 'L3'],
      ['Build mode', 'B', '—'], ['Call your mount', 'H', 'D-pad ↓'], ['Map', 'M', 'Back'], ['Journal', 'J', '—'], ['Inventory', 'I', '—'], ['Pause menu', 'Esc / P', 'Start'], ['Photo mode', 'V', '—'], ['Pet Pip the fox', 'E (near Pip)', 'Y'],
    ];
    const t = el('table', 'controls');
    t.innerHTML = `<thead><tr><th>Action</th><th>Keyboard & Mouse</th><th>Gamepad</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r[0]}</td><td><kbd>${r[1]}</kbd></td><td><kbd>${r[2]}</kbd></td></tr>`).join('')}</tbody>`;
    const tips = el('div', 'tips', `<h4>Tips</h4><ul>
      <li>A <b style="color:#ffd86b">golden glint</b> means an attack can be parried. A <b style="color:#ff6a5a">red glint</b> means dodge.</li>
      <li>Dodge at the last instant to trigger a <b>Timeslip</b>: the world slows while you don’t.</li>
      <li>Break an enemy’s posture, then attack while locked on for a <b>Chrono Strike</b>.</li>
      <li>Combine elements: freeze then burn for <b>Thermal Shock</b>, burn then shock for <b>Plasma Burst</b>.</li>
      <li>Fire on the ground creates an updraft. Glide over it to soar.</li>
      <li>Frost turns water into walkable ice.</li>
      <li>Every Age changes the land: a gate rusted shut in one Age may be open in another.</li></ul>`);
    this.body.append(t, tips);
  }

  // ------------------------------------------------------------ modal
  buildModal() {
    const m = el('div', 'modal');
    m.hidden = true;
    m.innerHTML = '<div class="modal-box"><div class="modal-title"></div><div class="modal-body"></div><div class="modal-actions"></div></div>';
    this.root.appendChild(m);
    this.modal = m;
  }
  showModal(title, bodyHtml, actions) {
    const m = this.modal;
    m.querySelector('.modal-title').textContent = title;
    m.querySelector('.modal-body').innerHTML = bodyHtml;
    const a = m.querySelector('.modal-actions');
    a.innerHTML = '';
    for (const [label, fn, cls] of actions) {
      const b = el('button', 'tbtn ' + (cls || ''), label);
      b.onclick = () => { this.hideModal(); fn && fn(); };
      a.appendChild(b);
    }
    m.hidden = false;
    this.blocking = true;
    if (G.state === 'play') this.paused = true;
    G.input.exitLock();
  }
  hideModal() {
    this.modal.hidden = true;
    if (!this.menuOpen) {
      this.blocking = false;
      this.paused = false;
      if (G.state === 'play') G.input.requestLock();
    }
  }
  confirm(text, yes) {
    this.showModal('Are you sure?', `<p>${text}</p>`, [['Cancel', null], ['Yes', yes, 'primary']]);
  }

  openRest(c) {
    const t = G.atmo.timeOfDay;
    const restTo = (h) => {
      G.fx.screenFade(1.5);
      G.after(0.7, () => {
        let dt = h - G.atmo.timeOfDay;
        if (dt <= 0) dt += 24;
        G.atmo.timeOfDay = h;
        if (dt > 0 && h < t) G.atmo.day++;
        G.game.rest(c);
        G.atmo.updateEnvironment(G.renderer, true);
        G.hud.toast('Rested. Wounds healed, enemies have returned.', 'good');
      });
    };
    this.showModal(c.name, `<p>The fire crackles. Rest here to heal, save your journey and let the world turn. Enemies you have defeated will return.</p>`, [
      ['Until dawn', () => restTo(6.5)], ['Until noon', () => restTo(12)], ['Until dusk', () => restTo(18)], ['Until midnight', () => restTo(0.1)],
      ['Craft', () => { this.stationFire = true; this.openMenu('crafting'); }], ['Leave', null],
    ]);
  }

  openRiftMenu(r) {
    const S = G.game.state;
    const boons = G.rift ? G.rift.boonDefs : [];
    const boonHtml = boons.map((b) => `<button class="boon ${S.riftBoons[b.id] ? 'on' : ''}" data-b="${b.id}" ${S.riftBoons[b.id] >= b.max ? 'disabled' : ''}><b>${b.name}</b> <span>${b.desc}</span><em>${S.riftBoons[b.id] || 0}/${b.max} · ${b.cost} ✦</em></button>`).join('');
    this.showModal(r.name, `<p>A wound in time. Inside, endless foes swarm without rest. Survive three minutes and defeat the Rift Warden. Your blade fights on its own in there: move, dodge and choose your upgrades.</p>
      <p class="rift-meta">Rift tier <b>${S.riftTier}</b> · Best: ${S.riftBest ? Math.floor(S.riftBest) + 's' : '—'} · Star Shards: <b>${S.inv.starShard}</b></p>
      <div class="boons">${boonHtml}</div>`, [['Enter the Rift', () => G.rift.enter(r), 'primary'], ['Not now', null]]);
    this.modal.querySelectorAll('.boon').forEach((b) => (b.onclick = () => {
      const def = boons.find((x) => x.id === b.dataset.b);
      if ((S.riftBoons[def.id] || 0) >= def.max || S.inv.starShard < def.cost) return;
      S.inv.starShard -= def.cost;
      S.riftBoons[def.id] = (S.riftBoons[def.id] || 0) + 1;
      G.audio?.sfx('unlock');
      this.hideModal();
      this.openRiftMenu(r);
    }));
  }

  // ------------------------------------------------------------ epoch wheel
  buildWheel() {
    const w = el('div', 'epoch-wheel');
    w.hidden = true;
    w.innerHTML = EPOCHS.map((e, i) => `<div class="ew-opt e${i}" data-e="${i}"><span class="g">${e.glyph}</span><b>${e.name}</b><em>${e.sub}</em></div>`).join('') + '<div class="ew-center">Release to shift</div>';
    this.root.appendChild(w);
    this.wheel = w;
    this.wheelSel = -1;
  }

  update(dt) {
    const inp = G.input;
    G.dialogue?.update(dt);
    if (G.state !== 'play') {
      if (this.menuOpen && inp.hit('pause')) this.closeMenu();
      return;
    }
    if (G.cutscene?.active) return;
    if (!this.modal.hidden) {
      if (inp.hit('pause')) this.hideModal();
      return;
    }
    if (G.dialogue?.active) return;
    if (inp.hit('pause')) {
      if (this.menuOpen) this.closeMenu();
      else if (G.build?.active) G.build.toggle(false);
      else this.openMenu(this.tab === 'map' ? 'map' : this.tab);
      return;
    }
    if (this.menuOpen) {
      if (inp.lastDevice === 'pad' && inp.hit('sprint')) return this.closeMenu();
      if (this.tab === 'inventory' && this.invScroll) {
        if (inp.hit('left') || inp.hit('prevEl')) this.invScroll(-1);
        if (inp.hit('right') || inp.hit('nextEl')) this.invScroll(1);
      }
      for (const [k, t] of [['map', 'map'], ['journal', 'journal'], ['inventory', 'inventory']]) if (inp.hit(k)) { if (this.tab === t) this.closeMenu(); else this.setTab(t); }
      return;
    }
    if (inp.hit('photo')) return G.photo?.open();
    if (inp.hit('map')) return this.openMenu('map');
    if (inp.hit('journal')) return this.openMenu('journal');
    if (inp.hit('inventory')) return this.openMenu('inventory');
    if (G.rift?.active) return;
    // epoch: tap = next, hold = wheel
    if (inp.down('epoch')) {
      this.epochHeld = (this.epochHeld || 0) + dt;
      if (this.epochHeld > 0.28 && this.wheel.hidden && G.epochs.canShift().ok) {
        this.wheelSel = -1;
        this.wheel.hidden = false;
        this.timeScale = 0.2;
        this.wheelAng = 0;
      }
      if (!this.wheel.hidden) {
        this.wheelAng += inp.mouse.dx * 0.01 + inp.moveVec.x * dt * 4;
        const mx = inp.mouse.x - window.innerWidth / 2, my = inp.mouse.y - window.innerHeight / 2;
        let sel = this.wheelSel >= 0 ? this.wheelSel : G.epochs.current;
        const mv = inp.moveVec;
        if (Math.hypot(mv.x, mv.y) > 0.5) sel = Math.round(((Math.atan2(mv.x, -mv.y) / (Math.PI * 2)) * 3 + 3)) % 3;
        else if (inp.lastDevice === 'touch' || inp.lastDevice === 'pad') sel = this.wheelSel >= 0 ? this.wheelSel : (G.epochs.current + 1) % 3;
        else if (!G.input.locked && Math.hypot(mx, my) > 40) sel = Math.round(((Math.atan2(mx, -my) / (Math.PI * 2)) * 3 + 3)) % 3;
        else sel = (((Math.round(this.wheelAng * 0.8) % 3) + 3) % 3);
        this.wheelSel = sel;
        this.wheel.querySelectorAll('.ew-opt').forEach((o) => {
          const i = +o.dataset.e;
          o.classList.toggle('sel', i === sel);
          o.classList.toggle('cur', i === G.epochs.current);
        });
      }
    } else if (this.epochHeld) {
      const held = this.epochHeld;
      this.epochHeld = 0;
      if (!this.wheel.hidden) {
        this.wheel.hidden = true;
        this.timeScale = 1;
        if (this.wheelSel >= 0 && this.wheelSel !== G.epochs.current) G.epochs.shift(this.wheelSel);
      } else if (held <= 0.28) {
        G.epochs.shift((G.epochs.current + 1) % 3);
      }
    }
    if (inp.hit('build')) G.build?.toggle();
    if (inp.hit('whistle')) G.mount?.whistle();
  }
}
