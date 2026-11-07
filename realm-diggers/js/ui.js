'use strict';
// ============================================================
// Settings, HUD, menus, inventory, touch controls
// ============================================================

const $ = id => document.getElementById(id);
const IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches);

const Settings = {
  data: { renderDist: IS_TOUCH ? 4 : 6, sensitivity: 1, fov: 75, volume: 0.7, music: true, showCoords: true, autoJump: IS_TOUCH, difficulty: 'easy', pixelRatio: IS_TOUCH ? 1 : 1.5, touch: 'auto', invertY: false },
  load() {
    const st = safeStorage();
    if (!st) return;
    try { const d = JSON.parse(st.getItem('rd_settings') || '{}'); Object.assign(this.data, d); } catch (e) { /* ignore */ }
  },
  save() { const st = safeStorage(); if (st) try { st.setItem('rd_settings', JSON.stringify(this.data)); } catch (e) { /* ignore */ } },
  touchOn() { return this.data.touch === 'on' || (this.data.touch === 'auto' && IS_TOUCH); },
};

const UI = {
  cursor: null, screen: null, craftCat: 'all', modSel: null, guideTab: 'realms', last: {}, toastN: 0,
  init() {
    const hb = $('hotbar');
    for (let i = 0; i < 9; i++) {
      const s = document.createElement('div'); s.className = 'slot'; s.dataset.i = i;
      s.innerHTML = `<span class="k">${i + 1}</span><img alt=""><span class="n"></span>`;
      s.addEventListener('pointerdown', e => { e.stopPropagation(); Game.player.sel = i; UI.updateHotbar(); });
      hb.appendChild(s);
    }
    this.heartImgs = [hudSprite('heart', 0), hudSprite('heart', 1), hudSprite('heart', 2)];
    this.foodImgs = [hudSprite('food', 0), hudSprite('food', 1), hudSprite('food', 2)];
    this.bubbleImgs = [hudSprite('bubble', 0), hudSprite('bubble', 1)];
    // buttons
    $('btn-howto').onclick = () => { this.guideTab = 'controls'; this.openGuide(true); };
    $('btn-title-settings').onclick = () => this.openSettings('scr-title');
    $('nw-cancel').onclick = () => this.showTitle();
    $('nw-create').onclick = () => this.createWorld();
    for (const segId of ['nw-mode', 'nw-diff']) $(segId).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; for (const x of $(segId).children) x.classList.toggle('on', x === b); });
    $('p-resume').onclick = () => Game.resume();
    $('p-guide').onclick = () => this.openGuide();
    $('p-mods').onclick = () => this.openMods();
    $('p-settings').onclick = () => this.openSettings('scr-pause');
    $('p-quit').onclick = () => Game.quitToTitle();
    $('inv-close').onclick = () => Game.closeUI();
    $('mods-close').onclick = () => Game.closeUI();
    $('guide-close').onclick = () => (this.guideFromTitle ? this.showTitle() : Game.closeUI());
    $('travel-close').onclick = () => Game.closeUI();
    $('settings-done').onclick = () => { Settings.save(); Sound.applyVolume(); this.show(this.settingsBack); if (this.settingsBack === 'scr-pause') Game.applySettings(); };
    $('d-respawn').onclick = () => Game.respawn();
    $('guide-tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; this.guideTab = b.dataset.t; this.renderGuide(); });
    document.addEventListener('pointermove', e => { this.mx = e.clientX; this.my = e.clientY; this.moveCursorItem(); this.moveTooltip(); });
    for (const s of document.querySelectorAll('.screen')) s.addEventListener('contextmenu', e => e.preventDefault());
    TouchPad.init();
  },
  show(id) {
    for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
    this.screen = id || null;
    $('tooltip').hidden = true;
  },
  hideScreens() { this.show(null); },

  // ---------- HUD ----------
  updateHotbar() {
    const p = Game.player, slots = $('hotbar').children;
    for (let i = 0; i < 9; i++) {
      const s = p.inv[i], el = slots[i];
      el.classList.toggle('sel', i === p.sel);
      const img = el.querySelector('img'), n = el.querySelector('.n');
      const url = s ? iconURL(s.id) : '';
      if (img.dataset.u !== url) { img.dataset.u = url; if (url) img.src = url; else img.removeAttribute('src'); img.style.visibility = url ? 'visible' : 'hidden'; }
      n.textContent = s && s.n > 1 ? s.n : '';
    }
    const held = p.inv[p.sel];
    const hid = held ? held.id : 0;
    if (this.last.held !== hid) {
      this.last.held = hid;
      const hi = $('hand-img');
      if (held) { hi.src = iconURL(held.id); hi.style.visibility = 'visible'; } else hi.style.visibility = 'hidden';
      const nm = $('item-name'); nm.textContent = held ? itemName(held.id) : ''; nm.style.opacity = 1;
      clearTimeout(this.nameT); this.nameT = setTimeout(() => { nm.style.opacity = 0; }, 1800);
    }
  },
  updateBars() {
    const p = Game.player, creative = Game.creative;
    const maxHp = Game.maxHp();
    const key = [Math.ceil(p.hp), maxHp, Math.ceil(p.food), Math.ceil(p.air), creative].join(',');
    if (key === this.last.bars) return;
    this.last.bars = key;
    $('bars').style.visibility = creative ? 'hidden' : 'visible';
    let h = '';
    for (let i = 0; i < maxHp / 2; i++) { const v = p.hp - i * 2; h += `<img src="${this.heartImgs[v >= 2 ? 2 : v >= 1 ? 1 : 0]}" alt="">`; }
    $('hearts').innerHTML = h;
    let f = '';
    for (let i = 0; i < 10; i++) { const v = p.food - i * 2; f += `<img src="${this.foodImgs[v >= 2 ? 2 : v >= 1 ? 1 : 0]}" alt="">`; }
    $('food').innerHTML = f;
    let a = '';
    if (!creative && p.air < 10) for (let i = 0; i < 10; i++) a += `<img src="${this.bubbleImgs[p.air > i ? 1 : 0]}" alt="">`;
    $('air').innerHTML = a;
  },
  updateModbar() {
    const g = Game, eq = g.save.equipped;
    let h = '';
    for (const k of eq) {
      const m = MOD[k]; if (!m) continue;
      const lv = g.save.mods[k] || 0, cd = m.active && g.abilityCD[m.active] > 0;
      h += `<span class="modchip${cd ? ' cool' : ''}" style="--rc:${RARITY[m.rarity].color}" title="${m.name}">${m.icon}<small>${'I'.repeat(lv)}</small>${m.active ? `<kbd>${m.active}</kbd>` : ''}</span>`;
    }
    if (h !== this.last.modbar) { $('modbar').innerHTML = h; this.last.modbar = h; }
    for (const [k, id] of [['X', 't-ab-x'], ['R', 't-ab-r'], ['F', 't-ab-f'], ['Q', 't-ab-q']]) {
      const has = eq.some(e => MOD[e] && MOD[e].active === k);
      $(id).hidden = !has || !Settings.touchOn();
    }
  },
  updateInfo() {
    const p = Game.player, r = Game.realm;
    if (this.last.realm !== r.key) { this.last.realm = r.key; $('realm-name').textContent = r.name; document.documentElement.style.setProperty('--realm', r.color); }
    $('coords').textContent = Settings.data.showCoords ? `X ${Math.floor(p.x)}   Y ${Math.floor(p.y)}   Z ${Math.floor(p.z)}` : '';
    const goal = Game.currentGoal();
    if (this.last.goal !== goal) { this.last.goal = goal; $('goal').hidden = !goal; $('goal-text').textContent = goal || ''; }
    let clock = '';
    if (r.sky.mode === 'cycle') { const t = Game.time; const hrs = Math.floor((t * 24 + 6) % 24), mins = Math.floor(((t * 24 * 60) % 60)); clock = `${t < 0.5 ? '☀' : '☾'} ${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`; }
    else clock = r.sky.mode === 'none' ? 'Underground' : 'Endless ' + (r.key === 'lunara' || r.key === 'prismara' ? 'night' : 'day');
    if (Game.rain > 0.5) clock += ' ☂';
    const gh = Game.geode ? `🧭 Mod Geode: ${Math.round(Game.geode.d)} blocks${Game.geode.y + 0.5 < p.y - 2 ? ', below you' : Game.geode.y > p.y + 2 ? ', above you' : ''}` : '';
    if (this.last.geode !== gh) { this.last.geode = gh; $('geode-hint').hidden = !gh; $('geode-hint').textContent = gh; }
    if (this.last.clock !== clock) { this.last.clock = clock; $('clock').textContent = clock; }
    const fuel = Game.stats.jetpack && !Game.creative;
    $('fuel').hidden = !fuel;
    if (fuel) $('fuel-fill').style.width = (p.fuel / Game.stats.jetpack * 100) + '%';
  },
  bossBar(b) {
    $('bossbar').hidden = !b;
    if (b) $('boss-fill').style.width = Math.max(0, b.hp / b.maxHp * 100) + '%';
  },
  toast(msg, color, icon) {
    const t = document.createElement('div'); t.className = 'toast';
    if (color) t.style.setProperty('--tc', color);
    t.innerHTML = (icon ? `<img src="${icon}" alt="">` : '') + `<span>${msg}</span>`;
    const box = $('toasts'); box.appendChild(t);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 2600); setTimeout(() => t.remove(), 3200);
  },
  popup(kicker, title, desc, big, color, ms = 3200) {
    const p = $('popup');
    p.style.setProperty('--rc', color || '#fff');
    p.innerHTML = `<div class="big">${big || ''}</div><div class="kicker">${kicker}</div><div class="title">${title}</div><div class="desc">${desc || ''}</div>`;
    p.hidden = false; p.style.animation = 'none'; void p.offsetWidth; p.style.animation = '';
    clearTimeout(this.popT); this.popT = setTimeout(() => { p.hidden = true; }, ms);
  },
  realmCard(r) {
    const c = $('realm-card');
    c.querySelector('.name').textContent = r.name; c.querySelector('.tag').textContent = r.tagline;
    c.hidden = false; c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
    clearTimeout(this.cardT); this.cardT = setTimeout(() => { c.hidden = true; }, 3700);
  },
  swing() { const h = $('hand'); h.classList.remove('swing'); void h.offsetWidth; h.classList.add('swing'); },
  minimap() {
    const cv = $('minimap'), ctx = cv.getContext('2d'), w = Game.world, p = Game.player;
    if (!this.mmData) this.mmData = ctx.createImageData(64, 64);
    const d = this.mmData.data, px = Math.floor(p.x), pz = Math.floor(p.z), ceil = Game.realm.hasCeiling;
    for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) {
      const x = px - 32 + i, z = pz - 32 + j, o = (j * 64 + i) * 4;
      let y = -1, id = 0;
      if (w.isLoaded(x, z)) {
        const start = ceil ? Math.min(HEIGHT - 1, Math.floor(p.y) + 2) : HEIGHT - 1;
        for (let yy = start; yy >= 0; yy--) { const b = w.blockAt(x, yy, z); if (b && (!ceil || SOLID[b] || LIQ[b])) { if (ceil && yy === start) continue; y = yy; id = b; break; } }
      }
      if (y < 0) { d[o] = d[o + 1] = d[o + 2] = 10; d[o + 3] = 255; continue; }
      const c = AVG_COLOR[id] || [0, 0, 0], k = clamp(0.55 + (y - p.y) * 0.02, 0.35, 1.25);
      d[o] = c[0] * k; d[o + 1] = c[1] * k; d[o + 2] = c[2] * k; d[o + 3] = 255;
    }
    const tmp = this.mmTmp || (this.mmTmp = document.createElement('canvas')); tmp.width = 64; tmp.height = 64;
    tmp.getContext('2d').putImageData(this.mmData, 0, 0);
    ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, 128, 128); ctx.drawImage(tmp, 0, 0, 128, 128);
    for (const m of Mobs.list) {
      const mx = (m.x - p.x) * 2 + 64, mz = (m.z - p.z) * 2 + 64;
      if (mx < 0 || mz < 0 || mx > 128 || mz > 128) continue;
      ctx.fillStyle = m.isBoss ? '#ff5ad8' : m.def.hostile === 1 ? '#ff4a4a' : '#ffffff';
      ctx.fillRect(mx - 2, mz - 2, 4, 4);
    }
    if (Game.geode) {
      let gx = (Game.geode.x + .5 - p.x) * 2, gz = (Game.geode.z + .5 - p.z) * 2;
      const gl = Math.hypot(gx, gz); if (gl > 56) { gx *= 56 / gl; gz *= 56 / gl; }
      const pulse = 4 + Math.sin(performance.now() / 180) * 1.5;
      ctx.save(); ctx.translate(64 + gx, 64 + gz); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ff5ae0'; ctx.fillRect(-pulse, -pulse, pulse * 2, pulse * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(-pulse, -pulse, pulse * 2, pulse * 2);
      ctx.restore();
    }
    ctx.save(); ctx.translate(64, 64); ctx.rotate(-p.yaw);
    ctx.fillStyle = '#ffc24b'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  },

  // ---------- title & save slots ----------
  showTitle() {
    this.show('scr-title');
    Game.state = 'title';
    $('hud').hidden = true; $('touch').hidden = true;
    const box = $('slots'); box.innerHTML = '';
    const st = safeStorage();
    $('storage-note').textContent = st ? 'Your worlds save automatically in this browser.' : 'Saving is turned off in this browser, so worlds last until you close the page.';
    for (let i = 0; i < 3; i++) {
      const meta = Game.slotMeta(i);
      const el = document.createElement('div');
      if (meta) {
        el.className = 'slotcard';
        const pips = REALMS.map(r => `<span class="pip" style="${meta.discovered.includes(r.key) ? `background:${r.color}` : ''}" title="${r.name}"></span>`).join('');
        el.innerHTML = `<div class="meta"><div class="name"></div><div class="sub">${meta.mode === 'creative' ? 'Creative' : 'Survival'} · ${meta.discovered.length}/10 realms · ${meta.mods} mods · ${fmtTime(meta.playTime)}</div><div class="pips">${pips}</div></div>
          <div class="acts"><button class="btn primary" data-a="play">Play</button><button class="btn ghost small" data-a="del" aria-label="Delete world">✕</button></div>`;
        el.querySelector('.name').textContent = meta.name;
        el.querySelector('[data-a=play]').onclick = () => Game.loadSlot(i);
        el.querySelector('[data-a=del]').onclick = e => {
          const b = e.currentTarget;
          if (b.dataset.confirm) { Game.deleteSlot(i); this.showTitle(); return; }
          b.dataset.confirm = '1'; b.textContent = 'Delete?'; b.classList.add('danger');
          setTimeout(() => { if (b.isConnected) { delete b.dataset.confirm; b.textContent = '✕'; b.classList.remove('danger'); } }, 3000);
        };
      } else {
        el.className = 'slotcard empty';
        el.innerHTML = `<div class="meta"><div class="name">Empty slot ${i + 1}</div><div class="sub">Start a brand new adventure</div></div><button class="btn">New world</button>`;
        el.querySelector('button').onclick = () => this.openNewWorld(i);
      }
      box.appendChild(el);
    }
  },
  openNewWorld(slot) {
    this.newSlot = slot;
    $('nw-name').value = 'World ' + (slot + 1);
    $('nw-seed').value = '';
    this.show('scr-new');
    $('nw-name').focus();
  },
  createWorld() {
    const name = $('nw-name').value.trim() || 'My World';
    const mode = $('nw-mode').querySelector('.on').dataset.v;
    const diff = $('nw-diff').querySelector('.on').dataset.v;
    const seedStr = $('nw-seed').value.trim();
    const seed = seedStr ? (/^-?\d+$/.test(seedStr) ? (parseInt(seedStr, 10) >>> 0) : hashStr(seedStr)) : (Math.random() * 4294967296) >>> 0;
    Settings.data.difficulty = diff; Settings.save();
    Game.newGame(this.newSlot, name, mode, seed);
  },

  // ---------- settings ----------
  openSettings(back) {
    this.settingsBack = back;
    const S = Settings.data;
    const rows = [
      ['renderDist', 'View distance', 'range', 2, 12, 1, v => v + ' chunks'],
      ['sensitivity', 'Look speed', 'range', 0.2, 3, 0.1, v => v.toFixed(1)],
      ['fov', 'Field of view', 'range', 55, 100, 1, v => v + '°'],
      ['volume', 'Volume', 'range', 0, 1, 0.05, v => Math.round(v * 100) + '%'],
      ['pixelRatio', 'Sharpness', 'range', 0.5, 2, 0.25, v => v.toFixed(2) + 'x'],
      ['music', 'Music', 'bool'], ['showCoords', 'Show coordinates', 'bool'], ['autoJump', 'Auto-jump', 'bool'], ['invertY', 'Invert look up/down', 'bool'],
      ['difficulty', 'Monsters', 'choice', ['peaceful', 'easy', 'normal']],
      ['touch', 'Touch controls', 'choice', ['auto', 'on', 'off']],
    ];
    const body = $('settings-body'); body.innerHTML = '';
    for (const [k, label, type, a, b, step, fmt] of rows) {
      const r = document.createElement('div'); r.className = 'setrow';
      const id = 'set-' + k;
      if (type === 'range') {
        r.innerHTML = `<label for="${id}">${label}</label><span style="display:flex;gap:8px;align-items:center"><input type="range" id="${id}" min="${a}" max="${b}" step="${step}" value="${S[k]}"><span class="val"></span></span>`;
        const inp = r.querySelector('input'), val = r.querySelector('.val');
        val.textContent = fmt(S[k]);
        inp.oninput = () => { S[k] = parseFloat(inp.value); val.textContent = fmt(S[k]); if (k === 'volume') Sound.applyVolume(); };
      } else if (type === 'bool') {
        r.innerHTML = `<label for="${id}">${label}</label><div class="seg" id="${id}" style="max-width:180px"><button data-v="1">On</button><button data-v="0">Off</button></div>`;
        const seg = r.querySelector('.seg');
        const upd = () => { for (const x of seg.children) x.classList.toggle('on', (x.dataset.v === '1') === !!S[k]); };
        upd(); seg.onclick = e => { const bt = e.target.closest('button'); if (!bt) return; S[k] = bt.dataset.v === '1'; upd(); Sound.applyVolume(); };
      } else {
        r.innerHTML = `<label for="${id}">${label}</label><div class="seg" id="${id}" style="max-width:260px">${a.map(v => `<button data-v="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>`;
        const seg = r.querySelector('.seg');
        const upd = () => { for (const x of seg.children) x.classList.toggle('on', x.dataset.v === S[k]); };
        upd(); seg.onclick = e => { const bt = e.target.closest('button'); if (!bt) return; S[k] = bt.dataset.v; upd(); };
      }
      body.appendChild(r);
    }
    this.show('scr-settings');
  },

  // ---------- inventory & crafting ----------
  openInventory() {
    this.show('scr-inv');
    this.stations = Game.nearStations();
    this.renderInventory(); this.renderCrafting();
  },
  slotEl(stack, onDown, extra = '') {
    const s = document.createElement('div'); s.className = 'slot' + extra;
    s.innerHTML = stack ? `<img src="${iconURL(stack.id)}" alt=""><span class="n">${stack.n > 1 ? stack.n : ''}</span>` : '';
    s.addEventListener('pointerdown', e => { e.preventDefault(); onDown(e); });
    s.addEventListener('contextmenu', e => e.preventDefault());
    if (stack) { s.addEventListener('pointerenter', () => this.showTip(stack.id)); s.addEventListener('pointerleave', () => this.hideTip()); }
    return s;
  },
  renderInventory() {
    const p = Game.player, main = $('inv-main'), hot = $('inv-hot');
    main.innerHTML = ''; hot.innerHTML = '';
    if (Game.creative) {
      $('inv-main').className = 'pal';
      const all = [];
      for (const b of BLOCKS) if (b.cat && b.render !== R_NONE) all.push(b.id);
      for (const id in ITEMS) all.push(+id);
      for (const id of all) main.appendChild(this.slotEl({ id, n: 1 }, e => {
        const d = itemDef(id); const stack = { id, n: e.shiftKey || e.button === 2 ? 1 : d.stack };
        if (this.cursor && this.cursor.id === id) this.cursor.n = Math.min(d.stack, this.cursor.n + stack.n); else this.cursor = stack;
        this.updateCursorItem();
      }));
    } else {
      $('inv-main').className = 'grid9';
      for (let i = 9; i < 36; i++) main.appendChild(this.slotEl(p.inv[i], e => this.slotClick(i, e)));
    }
    for (let i = 0; i < 9; i++) hot.appendChild(this.slotEl(p.inv[i], e => this.slotClick(i, e), i === p.sel ? ' sel' : ''));
    const ar = $('inv-armor'); ar.innerHTML = '';
    ar.appendChild(this.slotEl(p.armor, e => this.slotClick('armor', e)));
    $('armor-val').textContent = p.armor ? `${Math.round(itemDef(p.armor.id).armor * 100)}% less damage` : 'Put armor here';
    const st = this.stations;
    $('stations').innerHTML = `<span>${st.bench ? '<b>✓</b>' : '✗'} Workbench</span><span>${st.furnace ? '<b>✓</b>' : '✗'} Furnace</span>`;
    this.updateCursorItem();
    this.updateHotbar();
  },
  slotClick(i, e) {
    Sound.init();
    const p = Game.player;
    const get = () => (i === 'armor' ? p.armor : p.inv[i]);
    const set = v => { if (i === 'armor') p.armor = v; else p.inv[i] = v; };
    let s = get(), c = this.cursor;
    if (e.shiftKey && s && !c && i !== 'armor') {
      const to = i < 9 ? [9, 36] : [0, 9];
      const d = itemDef(s.id);
      for (let k = to[0]; k < to[1] && s.n > 0; k++) { const t = p.inv[k]; if (t && t.id === s.id && t.n < d.stack) { const m = Math.min(s.n, d.stack - t.n); t.n += m; s.n -= m; } }
      for (let k = to[0]; k < to[1] && s.n > 0; k++) if (!p.inv[k]) { p.inv[k] = { id: s.id, n: s.n }; s.n = 0; }
      if (s.n <= 0) set(null);
    } else if (e.button === 2) {
      if (!c && s) { const h = Math.ceil(s.n / 2); this.cursor = { id: s.id, n: h }; s.n -= h; if (s.n <= 0) set(null); }
      else if (c && (!s || (s.id === c.id && s.n < itemDef(s.id).stack))) {
        if (i === 'armor' && !itemDef(c.id).armor) return;
        if (!s) set({ id: c.id, n: 1 }); else s.n++;
        c.n--; if (c.n <= 0) this.cursor = null;
      }
    } else {
      if (i === 'armor' && c && !itemDef(c.id).armor) { this.toast('Only armor goes here'); return; }
      if (!c && s) { this.cursor = s; set(null); }
      else if (c && !s) { set(c); this.cursor = null; }
      else if (c && s) {
        const d = itemDef(s.id);
        if (s.id === c.id && d.stack > 1) { const m = Math.min(c.n, d.stack - s.n); s.n += m; c.n -= m; if (c.n <= 0) this.cursor = null; }
        else { set(c); this.cursor = s; }
      }
    }
    this.renderInventory(); this.renderCrafting();
  },
  updateCursorItem() {
    const el = $('cursor-item'), c = this.cursor;
    el.hidden = !c;
    if (c) { el.querySelector('img').src = iconURL(c.id); el.querySelector('span').textContent = c.n > 1 ? c.n : ''; this.moveCursorItem(); }
  },
  moveCursorItem() { const el = $('cursor-item'); if (!el.hidden) { el.style.left = this.mx + 'px'; el.style.top = this.my + 'px'; } },
  returnCursor() { if (this.cursor) { Game.addItem(this.cursor.id, this.cursor.n); this.cursor = null; this.updateCursorItem(); } },
  showTip(id) {
    const d = itemDef(id); if (!d) return;
    let extra = '';
    if (d.food) extra += `<div class="muted">Food +${d.food / 2} 🍗 (use to eat)</div>`;
    if (d.tool && !d.isBlock) extra += `<div class="muted">${d.tool === 'sword' ? 'Damage ' + d.dmg : 'Mining power ' + d.speed}</div>`;
    if (d.isBlock && (d.tool || d.tier)) extra += `<div class="muted">Best tool: ${{ pick: 'Pickaxe', axe: 'Axe', shovel: 'Shovel' }[d.tool] || 'Any'}${d.tier ? ` (collect it with ${TIER_NEED[d.tier]})` : ''}</div>`;
    if (d.armor) extra += `<div class="muted">Blocks ${Math.round(d.armor * 100)}% of damage</div>`;
    if (d.gem) extra += `<div class="muted">Realm Gem of ${REALM[d.gem].name}</div>`;
    if (d.desc) extra += `<div class="muted">${d.desc}</div>`;
    extra += `<div class="muted">${d.stack > 1 ? `Stacks up to ${d.stack}` : "Doesn't stack"}</div>`;
    const makes = [...new Set(recipesUsingItem(id).map(r => itemName(idOf(r.out))))];
    if (makes.length) extra += `<div class="tipmakes">Makes: ${makes.slice(0, 5).join(', ')}${makes.length > 5 ? ` and ${makes.length - 5} more` : ''}</div>`;
    const t = $('tooltip'); t.innerHTML = `<b>${d.name}</b>${extra}`; t.hidden = false; this.moveTooltip();
  },
  hideTip() { $('tooltip').hidden = true; },
  moveTooltip() { const t = $('tooltip'); if (!t.hidden) { t.style.left = Math.min(this.mx + 16, innerWidth - 270) + 'px'; t.style.top = (this.my + 14) + 'px'; } },
  renderCrafting() {
    const tabs = $('craft-tabs');
    tabs.innerHTML = RECIPE_CATS.map(([k, n]) => `<button data-c="${k}" class="${k === this.craftCat ? 'on' : ''}">${n}</button>`).join('');
    tabs.onclick = e => { const b = e.target.closest('button'); if (!b) return; this.craftCat = b.dataset.c; this.renderCrafting(); };
    const list = $('craft-list');
    list.innerHTML = '';
    list.onclick = e => { const m = e.target.closest('[data-mat]'); if (m) { this.craftCat = 'materials'; this.matSel = m.dataset.mat; this.renderCrafting(); list.scrollTop = 0; } };
    if (this.craftCat === 'materials') { this.renderMaterials(list, true); return; }
    const inv = [...Game.player.inv];
    const recs = RECIPES.filter(r => this.craftCat === 'all' || r.cat === this.craftCat);
    recs.sort((a, b) => (canCraft(inv, b) ? 1 : 0) - (canCraft(inv, a) ? 1 : 0));
    for (const r of recs) list.appendChild(this.recipeRow(r, inv, true));
  },
  // one recipe row; interactive rows get Craft buttons
  recipeRow(r, inv, interactive) {
    const st = this.stations || {}, playing = !!Game.save && !Game.titleMode, creative = playing && Game.creative;
    const outId = idOf(r.out), have = canCraft(inv, r) || creative;
    const stOk = !r.st || st[r.st] || creative;
    const el = document.createElement('div'); el.className = 'recipe' + (!playing || (have && stOk) ? '' : ' no') + (interactive ? '' : ' ro');
    const ings = r.in.map(([k, n]) => {
      const c = countIng(inv, k), count = playing ? ` ${Math.min(c, n)}/${n}` : ` ×${n}`;
      return `<span class="ing${playing && c < n && !creative ? ' lack' : ''}" data-mat="${k}" title="See how to get ${ingName(k)}"><img src="${ingIcon(k)}" alt="">${ingName(k)}${count}</span>`;
    }).join('');
    const need = r.st ? `<span class="need">${r.st === 'bench' ? 'Needs a Workbench nearby' : 'Needs a Furnace nearby'}${interactive && stOk ? ' ✓' : ''}</span>` : '';
    el.innerHTML = `<img class="out" src="${iconURL(outId)}" alt=""><div><div class="rname">${itemName(outId)}${r.n > 1 ? ' ×' + r.n : ''}</div><div class="ings">${ings}</div>${need}</div>` +
      (interactive ? `<div class="acts"><button class="btn small primary" data-k="1">Craft</button><button class="btn small" data-k="5">×5</button></div>` : '');
    if (interactive) for (const b of el.querySelectorAll('button')) {
      b.disabled = !(have && stOk);
      b.onclick = () => { for (let k = 0; k < +b.dataset.k; k++) if (!Game.craft(r)) break; this.renderInventory(); this.renderCrafting(); };
    }
    el.querySelector('.out').addEventListener('pointerenter', () => this.showTip(outId)); el.querySelector('.out').addEventListener('pointerleave', () => this.hideTip());
    return el;
  },
  // Materials browser: pick a material, see how to get it and everything it makes
  renderMaterials(box, interactive, wide) {
    const inv = Game.save && !Game.titleMode ? [...Game.player.inv] : [];
    const groups = materialList();
    const all = groups.flatMap(g => g[1]);
    if (!this.matSel || !all.includes(this.matSel)) this.matSel = all.find(k => countIng(inv, k) > 0) || all[0];
    const key = this.matSel, have = countIng(inv, key), recs = recipesUsing(key);
    const wrap = document.createElement('div'); wrap.className = 'mat-wrap' + (wide ? ' wide' : '');
    const det = document.createElement('div'); det.className = 'mat-detail';
    det.innerHTML = `<div class="mat-head"><img src="${ingIcon(key)}" alt=""><div><h3>${ingName(key)}</h3><span class="muted">${inv.length ? (have ? `You have ${have}` : "You don't have any yet") : ''}</span></div></div>
      <div class="mat-label">How to get it</div><ul class="mat-src">${materialSources(key).map(t => `<li>${t}</li>`).join('')}</ul>
      <div class="mat-label">What you can make with it (${recs.length})</div>`;
    const rl = document.createElement('div'); rl.className = 'mat-recipes';
    for (const r of recs) rl.appendChild(this.recipeRow(r, inv, interactive));
    det.appendChild(rl);
    const gl = document.createElement('div'); gl.className = 'mat-groups';
    gl.innerHTML = `<div class="mat-label">Pick a material</div>` + groups.map(([name, keys]) => `<div class="mat-group"><div class="mat-gname">${name}</div><div class="mat-chips">${keys.map(k => {
      const c = countIng(inv, k);
      return `<button class="mat-chip${c ? ' have' : ''}${k === key ? ' sel' : ''}" data-pick="${k}" title="${ingName(k)}" aria-label="${ingName(k)}"><img src="${ingIcon(k)}" alt="">${c ? `<span class="n">${c > 999 ? '999+' : c}</span>` : ''}</button>`;
    }).join('')}</div></div>`).join('');
    gl.onclick = e => { const b = e.target.closest('[data-pick]'); if (!b) return; this.matSel = b.dataset.pick; Sound.play('click'); this.renderMaterials(box, interactive, wide); box.scrollTop = 0; };
    wrap.appendChild(det); wrap.appendChild(gl);
    box.innerHTML = ''; box.appendChild(wrap);
    box.onclick = e => { const m = e.target.closest('[data-mat]'); if (m) { this.matSel = m.dataset.mat; this.renderMaterials(box, interactive, wide); box.scrollTop = 0; } };
  },

  // ---------- mods ----------
  openMods() { this.show('scr-mods'); this.renderMods(); },
  renderMods() {
    const g = Game.save, slots = Game.modSlots();
    const eq = $('mod-equipped'); eq.innerHTML = '';
    for (let i = 0; i < slots; i++) {
      const k = g.equipped[i], m = MOD[k];
      const el = document.createElement('div'); el.className = 'eqslot' + (m ? ' filled' : '');
      if (m) { el.style.setProperty('--rc', RARITY[m.rarity].color); el.textContent = m.icon; el.title = m.name + ' (tap to unequip)'; el.onclick = () => { Game.toggleMod(k); this.modSel = k; this.renderMods(); }; }
      else el.title = 'Empty slot';
      eq.appendChild(el);
    }
    const lockInfo = document.createElement('span'); lockInfo.className = 'muted'; lockInfo.style.fontSize = '12px';
    lockInfo.textContent = slots < 6 ? `More slots unlock at 15 mods found${g.bossDefeated ? '' : ' and by beating the final boss'}.` : '';
    eq.appendChild(lockInfo);
    const grid = $('mod-grid'); grid.innerHTML = '';
    for (const m of MODS) {
      const lv = g.mods[m.key] || 0;
      const el = document.createElement('div');
      el.className = 'mcard' + (lv ? '' : ' unknown') + (g.equipped.includes(m.key) ? ' eq' : '') + (this.modSel === m.key ? ' sel' : '');
      el.style.setProperty('--rc', RARITY[m.rarity].color);
      el.innerHTML = lv ? `${m.icon}<span class="lv">${'I'.repeat(lv)}</span>` : '?';
      el.onclick = () => { this.modSel = m.key; this.renderMods(); };
      grid.appendChild(el);
    }
    const found = MODS.filter(m => g.mods[m.key]).length;
    const det = $('mod-detail');
    const m = MOD[this.modSel];
    if (!m) { det.innerHTML = `<h3>${found} / ${MODS.length} found</h3><p class="muted">Tap a mod to see what it does. Unknown mods show their rarity color. Rarer ores, deeper digging and later realms give rarer mods.</p>${RARITY.map(r => `<div style="color:${r.color};font-family:var(--display)">■ ${r.name}</div>`).join('')}`; return; }
    const lv = g.mods[m.key] || 0;
    const where = m.realm ? `Only found in ${REALM[m.realm].name}` : 'Found in any realm';
    if (!lv) { det.innerHTML = `<div class="big">❔</div><h3>???</h3><div class="rar" style="color:${RARITY[m.rarity].color}">${RARITY[m.rarity].name}</div><p class="muted">${where}. Keep mining!</p>`; return; }
    const equipped = g.equipped.includes(m.key);
    det.innerHTML = `<div class="big">${m.icon}</div><h3>${m.name}</h3><div class="rar" style="color:${RARITY[m.rarity].color}">${RARITY[m.rarity].name} · Level ${'I'.repeat(lv)}</div>
      <ol>${m.desc.map((d, i) => `<li class="${i < lv ? 'have' : ''}">${d}${i < lv ? ' ✓' : ''}</li>`).join('')}</ol>
      <p class="muted" style="font-size:12px">${where}.${lv < 3 ? ' Find it again to level up.' : ' Max level!'}</p>
      <button class="btn ${equipped ? '' : 'primary'} wide" id="mod-toggle">${equipped ? 'Unequip' : 'Equip'}</button>`;
    $('mod-toggle').onclick = () => { Game.toggleMod(m.key); this.renderMods(); };
  },

  // ---------- guide & travel ----------
  openGuide(fromTitle) {
    this.guideFromTitle = !!fromTitle;
    this.show('scr-guide'); this.renderGuide();
  },
  realmCardHTML(r, travel) {
    const g = Game.save, disc = g ? g.discovered.includes(r.key) : false;
    const gemId = r.gem ? I[r.gem] : null, gemHave = g && gemId && g.gems && g.gems.includes(r.gem);
    const cur = Game.realm && Game.realm.key === r.key;
    let btn = '';
    if (travel) btn = cur ? '<span class="badge">You are here</span>' : (disc || Game.creative) ? `<button class="btn small primary" data-go="${r.key}">Travel</button>` : '';
    return `<div class="rcard${disc ? '' : ' locked'}" style="--rc:${r.color}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px"><span class="rname">${r.name}</span>${disc ? '<span class="badge">✓ Discovered</span>' : ''}</div>
      <span class="rtag">${r.tagline}</span>
      <p>${r.desc}</p>
      <div class="how"><b>How to get there:</b> ${r.how}</div>
      ${gemId ? `<div class="ing" style="font-size:12px"><img src="${iconURL(gemId)}" alt=""> Realm Gem: ${itemName(gemId)} ${gemHave ? '<span class="badge">✓</span>' : ''}</div>` : ''}
      ${btn}</div>`;
  },
  renderGuide() {
    for (const b of $('guide-tabs').children) b.classList.toggle('on', b.dataset.t === this.guideTab);
    const body = $('guide-body');
    if (this.guideTab === 'realms') {
      body.innerHTML = `<div class="realm-grid">${REALMS.map(r => this.realmCardHTML(r, false)).join('')}</div>`;
    } else if (this.guideTab === 'materials') {
      body.innerHTML = '<p class="muted">Pick a material to see where to find it and everything you can make with it. Tap an ingredient to jump to it.</p><div id="guide-mats"></div>';
      this.renderMaterials($('guide-mats'), false, true);
    } else if (this.guideTab === 'creatures') {
      const seen = (Game.save && Game.save.creatures) || [], all = Object.values(MOBS);
      const kind = d => d.hostile === 1 ? ['hostile', 'Dangerous'] : d.hostile === 2 ? ['neutral', 'Fights back'] : ['friendly', 'Friendly'];
      const hint = d => {
        const realms = mobRealms(d.key), where = realms.length >= REALMS.length ? 'any realm' : realms.map(r => r.name).join(', ');
        const bits = [`Lives in ${where}.`];
        if (d.when === 'night') bits.push('Comes out at night and in dark caves.'); else if (d.when === 'day') bits.push('Out in the daytime.');
        if (d.swim) bits.push('Swims in water.'); else if (d.cruise) bits.push('Floats high in the sky.'); else if (d.fly) bits.push('Flies.');
        if (d.shy) bits.push('Shy: runs away fast!');
        if (d.weight <= 1) bits.push('Very rare!'); else if (d.weight <= 2.5) bits.push('Rare.');
        return bits.join(' ');
      };
      body.innerHTML = `<p class="muted">You've found <b>${seen.length} of ${all.length}</b> creatures. A creature counts as found when you get a good look at it. The Modling is extra special: catch one to win a mod!</p>
        <div class="creature-grid">${all.map(d => {
          const found = seen.includes(d.key), [cls, label] = kind(d);
          const drops = d.givesMod ? 'A random mod!' : d.drops.length ? d.drops.map(x => itemName(idOf(x[0]))).join(', ') : 'Nothing';
          return `<div class="ccard${found ? ' found' : ''}"><img src="${mobPreview(d, !found)}" alt=""><div class="cinfo"><b>${found ? d.name : '???'}</b>
            <span class="ctag ${cls}">${found ? label : '?'}</span><p>${hint(d)}</p>${found ? `<p class="muted">Drops: ${drops}</p>` : ''}</div></div>`;
        }).join('')}</div>`;
    } else if (this.guideTab === 'goals') {
      const ach = Game.save ? Game.save.achievements : [];
      body.innerHTML = `<p class="muted">${ach.length} of ${ACHIEVEMENTS.length} goals complete.</p><div class="goals">${ACHIEVEMENTS.map(a => `<div class="goal${ach.includes(a.id) ? ' done' : ''}"><span class="ck">${ach.includes(a.id) ? '✓' : ''}</span><div><b>${a.name}</b><div class="muted">${a.desc}</div></div></div>`).join('')}</div>`;
    } else {
      body.innerHTML = `<div class="controls">
        <div><h3>Keyboard &amp; mouse</h3><table>
          <tr><td>W A S D</td><td>Walk</td></tr><tr><td>Mouse</td><td>Look around (click the game first)</td></tr>
          <tr><td>Hold left click</td><td>Mine a block / hit a creature</td></tr><tr><td>Right click</td><td>Place a block, eat food, use items and blocks</td></tr>
          <tr><td>Space</td><td>Jump / swim up (double-tap to fly in Creative)</td></tr><tr><td>Shift</td><td>Sneak (won't fall off edges) / fly down</td></tr>
          <tr><td>Ctrl or double-tap W</td><td>Sprint</td></tr><tr><td>1-9 / wheel</td><td>Pick hotbar slot</td></tr>
          <tr><td>E</td><td>Inventory &amp; crafting</td></tr><tr><td>M</td><td>Mods</td></tr><tr><td>G</td><td>Realm Guide</td></tr>
          <tr><td>X / R / F / Q</td><td>Mod powers (X-Ray, Blink, Roar, Frost Bolt)</td></tr><tr><td>Esc</td><td>Pause</td></tr></table></div>
        <div><h3>Touch</h3><table>
          <tr><td>Left stick</td><td>Walk</td></tr><tr><td>Drag the screen</td><td>Look around (aim with the + in the middle)</td></tr>
          <tr><td>⛏ Mine (hold)</td><td>Dig the block you aim at, hit creatures</td></tr>
          <tr><td>🧱 Build (tap)</td><td>Place a block, eat food, use items and blocks. Hold to keep placing</td></tr>
          <tr><td>⤒ / ⤓</td><td>Jump and sneak (fly up/down in Creative)</td></tr><tr><td>Tap hotbar</td><td>Pick an item</td></tr></table></div>
        <div><h3>Getting started</h3><table>
          <tr><td>1</td><td>Hold to chop a tree trunk for logs</td></tr><tr><td>2</td><td>Open your inventory (E) and craft Planks, then a Workbench</td></tr>
          <tr><td>3</td><td>Place the Workbench and craft a Wooden Pickaxe next to it</td></tr><tr><td>4</td><td>Mine stone, make stone tools and a Furnace</td></tr>
          <tr><td>5</td><td>Dig for ore. Sparkly Mod Geodes give you mods!</td></tr><tr><td>6</td><td>Read the Realms tab to find all 10 worlds</td></tr>
          <tr><td>Stuck?</td><td>The Materials tab shows where every material comes from and what it makes</td></tr></table></div></div>`;
    }
  },
  openTravel() {
    this.show('scr-travel');
    const list = $('travel-list');
    list.innerHTML = REALMS.map(r => this.realmCardHTML(r, true)).join('');
    list.onclick = e => { const b = e.target.closest('[data-go]'); if (b) { Game.closeUI(); Game.travelTo(b.dataset.go, 'gate'); } };
  },
  showDeath(msg) { $('death-msg').textContent = msg || "Don't worry, you keep all your stuff."; this.show('scr-death'); },
};

// ============================================================
// Touch controls
// ============================================================
const TouchPad = {
  joy: null, look: null, sneak: false,
  init() {
    const area = $('touch-area');
    area.addEventListener('touchstart', e => this.start(e), { passive: false });
    area.addEventListener('touchmove', e => this.move(e), { passive: false });
    area.addEventListener('touchend', e => this.end(e), { passive: false });
    area.addEventListener('touchcancel', e => this.end(e), { passive: false });
    const hold = (id, key) => {
      const b = $(id);
      b.addEventListener('touchstart', e => { e.preventDefault(); Sound.init(); Input.keyDown(key); b.classList.add('on'); }, { passive: false });
      b.addEventListener('touchend', e => { e.preventDefault(); Input.keyUp(key); b.classList.remove('on'); }, { passive: false });
    };
    hold('t-jump', 'Space');
    // Mine: hold to dig the block in the crosshair or hit a creature
    // Build: tap to place a block / eat / use; keep holding to keep placing
    const action = (id, flag, onPress) => {
      const b = $(id);
      const up = e => { e.preventDefault(); Input[flag] = false; b.classList.remove('on'); };
      b.addEventListener('touchstart', e => { e.preventDefault(); Sound.init(); Input[flag] = true; b.classList.add('on'); if (onPress) onPress(); }, { passive: false });
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
    };
    action('t-mine', 'btnMine', () => { Input.tapAttack = true; });
    action('t-build', 'btnBuild', () => { Input.tapUse = true; });
    const tap = (id, fn) => $(id).addEventListener('touchstart', e => { e.preventDefault(); Sound.init(); fn(); }, { passive: false });
    tap('t-sneak', () => { this.sneak = !this.sneak; $('t-sneak').classList.toggle('on', this.sneak); if (this.sneak) Input.keyDown('ShiftLeft'); else Input.keyUp('ShiftLeft'); });
    tap('t-inv', () => Game.toggleUI('inv'));
    tap('t-mods', () => Game.toggleUI('mods'));
    tap('t-guide', () => Game.toggleUI('guide'));
    tap('t-pause', () => Game.pause());
    tap('t-ab-x', () => Game.ability('X'));
    tap('t-ab-r', () => Game.ability('R'));
    tap('t-ab-f', () => Game.ability('F'));
    tap('t-ab-q', () => Game.ability('Q'));
  },
  start(e) {
    e.preventDefault(); Sound.init();
    for (const t of e.changedTouches) {
      if (!this.joy && t.clientX < innerWidth * 0.4 && t.clientY > innerHeight * 0.35) {
        this.joy = { id: t.identifier, x: t.clientX, y: t.clientY };
        const j = $('joy'); j.style.left = (t.clientX - 65) + 'px'; j.style.top = (t.clientY - 65) + 'px'; j.style.bottom = 'auto';
      } else if (!this.look) {
        this.look = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
    }
  },
  move(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.joy && t.identifier === this.joy.id) {
        let dx = t.clientX - this.joy.x, dy = t.clientY - this.joy.y; const l = Math.hypot(dx, dy), mx = 50;
        if (l > mx) { dx *= mx / l; dy *= mx / l; }
        $('joy-knob').style.transform = `translate(${dx}px, ${dy}px)`;
        Input.joy.x = dx / mx; Input.joy.y = dy / mx;
      } else if (this.look && t.identifier === this.look.id) {
        const dx = t.clientX - this.look.x, dy = t.clientY - this.look.y;
        this.look.x = t.clientX; this.look.y = t.clientY;
        Game.look(dx * 0.0065, dy * 0.0065);
      }
    }
  },
  end(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.joy && t.identifier === this.joy.id) {
        this.joy = null; Input.joy.x = 0; Input.joy.y = 0; $('joy-knob').style.transform = '';
        const j = $('joy'); j.style.left = ''; j.style.top = ''; j.style.bottom = '';
      } else if (this.look && t.identifier === this.look.id) this.look = null;
    }
  },
};
