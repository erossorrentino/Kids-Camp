import { ISLAND } from '../config.js';

const STAR_SVG = '<svg viewBox="0 0 24 24"><path fill="#ffd23f" d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.9L5.7 21l1.7-7-5.4-4.7 7.1-.6z"/></svg>';
const MINIMAP_RANGE = 70; // world units shown edge-to-edge on the corner map
const FULL_MAP_RANGE = 1100; // wide enough to show the whole island + coastline at once

export class HUD {
  constructor() {
    this.el = {
      health: document.getElementById('healthBar'),
      armor: document.getElementById('armorBar'),
      healthNum: document.getElementById('healthNum'),
      armorNum: document.getElementById('armorNum'),
      stars: document.getElementById('stars'),
      weaponPanel: document.getElementById('weaponPanel'),
      weaponIcon: document.getElementById('weaponIcon'),
      weaponName: document.getElementById('weaponName'),
      ammo: document.getElementById('ammoCount'),
      minimap: document.getElementById('minimap'),
      speedo: document.getElementById('speedo'),
      state: document.getElementById('stateIndicator'),
      crosshair: document.getElementById('crosshair'),
      hitMarker: document.getElementById('hitMarker'),
      prompt: document.getElementById('prompt'),
      radioTag: document.getElementById('radioTag'),
      cash: document.getElementById('cashAmount'),
      missionPanel: document.getElementById('missionPanel'),
      missionTitle: document.getElementById('missionTitle'),
      missionDetail: document.getElementById('missionDetail'),
      missionTimerFill: document.getElementById('missionTimerFill'),
      missionBtn: document.getElementById('missionBtn'),
      missionMenu: document.getElementById('missionMenu'),
      missionList: document.getElementById('missionList'),
      missionMenuClose: document.getElementById('missionMenuClose'),
      toast: document.getElementById('toast'),
      waypointClear: document.getElementById('waypointClear'),
      waypointTag: document.getElementById('waypointTag'),
      shopMenu: document.getElementById('shopMenu'),
      shopMenuTitle: document.getElementById('shopMenuTitle'),
      shopList: document.getElementById('shopList'),
      shopMenuClose: document.getElementById('shopMenuClose'),
      fullMap: document.getElementById('fullMap'),
      fullMapCanvas: document.getElementById('fullMapCanvas'),
      fullMapClose: document.getElementById('fullMapClose'),
      missionReroll: document.getElementById('missionReroll'),
    };
    this._toastTimer = null;
    this._playerPos = null;
    this.mmCtx = this.el.minimap.getContext('2d');
    this.fmCtx = this.el.fullMapCanvas.getContext('2d');
    for (let i = 0; i < 5; i++) {
      const d = document.createElement('div');
      d.className = 'star';
      d.innerHTML = STAR_SVG;
      this.el.stars.appendChild(d);
    }
  }

  // Tapping the weapon/ammo panel cycles to the next owned weapon — same
  // action as the mouse wheel or the touch WPN button, just discoverable
  // by tapping the thing that shows your current gun and bullet count.
  bindWeapons(weaponSystem) {
    this.weapons = weaponSystem;
    this.el.weaponPanel.addEventListener('click', () => this.weapons.cycle(1));
  }

  // Tapping/clicking the corner map pops the full map open — it's too small
  // (70m across) to place a waypoint precisely anywhere on an island 960m
  // wide, so setting one happens on the big map instead (see bindFullMap).
  bindMinimapTap() {
    this.el.minimap.addEventListener('click', () => this.openFullMap());
  }

  bindWaypointClear(onClear) {
    this.el.waypointClear.addEventListener('click', (e) => {
      e.stopPropagation();
      onClear();
    });
  }

  // The full-screen map: tapping/clicking anywhere on it drops a waypoint at
  // that world position and closes it (map is north-up and never rotates,
  // so the conversion is a direct inverse of the scale/translate _drawMap
  // uses to place dots).
  bindFullMap(onSet) {
    this.el.fullMapClose.addEventListener('click', () => this.closeFullMap());
    this.el.fullMap.addEventListener('click', (e) => {
      if (e.target === this.el.fullMap) { this.closeFullMap(); return; }
      if (e.target !== this.el.fullMapCanvas || !this._playerPos) return;
      const rect = this.el.fullMapCanvas.getBoundingClientRect();
      const size = this.el.fullMapCanvas.width;
      const scale = size / FULL_MAP_RANGE;
      const cx = (e.clientX - rect.left) * (size / rect.width);
      const cy = (e.clientY - rect.top) * (size / rect.height);
      const worldX = this._playerPos.x + (cx - size / 2) / scale;
      const worldZ = this._playerPos.z + (cy - size / 2) / scale;
      onSet(worldX, worldZ);
      this.closeFullMap();
    });
  }

  openFullMap() {
    if (document.pointerLockElement) document.exitPointerLock();
    this.el.fullMap.classList.add('show');
  }

  closeFullMap() {
    this.el.fullMap.classList.remove('show');
  }

  // Wires the generic shop modal (see systems/shops.js + Game.purchaseShopItem).
  // openShopMenu()/closeShopMenu() do the actual show/populate; this just
  // wires the always-present close affordances once.
  bindShopMenu() {
    this.el.shopMenuClose.addEventListener('click', () => this.closeShopMenu());
    this.el.shopMenu.addEventListener('click', (e) => {
      if (e.target === this.el.shopMenu) this.closeShopMenu();
    });
  }

  openShopMenu(shop, onBuy) {
    if (document.pointerLockElement) document.exitPointerLock();
    this.el.shopMenuTitle.textContent = shop.name;
    const list = this.el.shopList;
    list.innerHTML = '';
    for (const item of shop.items) {
      const row = document.createElement('div');
      row.className = 'missionRow';
      const info = document.createElement('div');
      info.className = 'missionRowInfo';
      const title = document.createElement('div');
      title.className = 'missionRowTitle';
      title.textContent = item.label;
      info.append(title);

      const pay = document.createElement('div');
      pay.className = 'missionRowPay';
      pay.textContent = `$${item.price.toLocaleString()}`;

      const buyBtn = document.createElement('button');
      buyBtn.type = 'button';
      buyBtn.className = 'missionStartBtn';
      buyBtn.textContent = 'BUY';
      buyBtn.addEventListener('click', () => onBuy(item));

      row.append(info, pay, buyBtn);
      list.appendChild(row);
    }
    this.el.shopMenu.classList.add('show');
  }

  closeShopMenu() {
    this.el.shopMenu.classList.remove('show');
  }

  // Wires the MISSIONS button + modal to a MissionManager. Missions themselves
  // stay hidden until the player opens this menu and picks one — there's no
  // more auto-popping offer banner. canOpen() gates the whole board behind
  // Game.hasLicense (bought once from a FIXER shop) — see Game.purchaseShopItem.
  bindMissions(missionManager, canOpen) {
    this.missions = missionManager;
    this._canOpenMissions = canOpen || (() => true);
    this.el.missionBtn.addEventListener('click', () => this.openMissionMenu());
    this.el.missionMenuClose.addEventListener('click', () => this.closeMissionMenu());
    this.el.missionReroll.addEventListener('click', () => this._renderMissionList());
    this.el.missionMenu.addEventListener('click', (e) => {
      if (e.target === this.el.missionMenu) this.closeMissionMenu();
    });
  }

  toggleMissionMenu() {
    if (this.el.missionMenu.classList.contains('show')) this.closeMissionMenu();
    else this.openMissionMenu();
  }

  openMissionMenu() {
    if (this.missions.active) return; // finish the current contract first
    if (!this._canOpenMissions()) {
      this.showToast('Buy a Contractor License from THE FIXER first ($50,000)', 'fail', 4000);
      return;
    }
    // release mouse-look pointer lock so the cursor reappears to click the
    // menu — clicking back into the game canvas re-engages it as usual
    if (document.pointerLockElement) document.exitPointerLock();
    this._renderMissionList();
    this.el.missionMenu.classList.add('show');
  }

  // A fresh random sample of jobs from the 500-entry pool (see
  // MissionManager.listAvailable) — called on open and again by the "New
  // Contracts" button, since listing all 500 at once would be unusable.
  _renderMissionList() {
    const list = this.el.missionList;
    list.innerHTML = '';
    for (const m of this.missions.listAvailable()) {
      const row = document.createElement('div');
      row.className = 'missionRow';
      const info = document.createElement('div');
      info.className = 'missionRowInfo';
      const title = document.createElement('div');
      title.className = 'missionRowTitle';
      title.textContent = m.title;
      const detail = document.createElement('div');
      detail.className = 'missionRowDetail';
      detail.textContent = m.detail;
      info.append(title, detail);

      const pay = document.createElement('div');
      pay.className = 'missionRowPay';
      pay.textContent = `$${m.rewardRange[0].toLocaleString()}–$${m.rewardRange[1].toLocaleString()}`;

      const startBtn = document.createElement('button');
      startBtn.type = 'button';
      startBtn.className = 'missionStartBtn';
      startBtn.textContent = 'START';
      startBtn.addEventListener('click', () => {
        this.missions.start(m.type, this._playerPos);
        this.closeMissionMenu();
      });

      row.append(info, pay, startBtn);
      list.appendChild(row);
    }
  }

  closeMissionMenu() {
    this.el.missionMenu.classList.remove('show');
  }

  // Brief red-X flash at the crosshair confirming a shot actually connected.
  flashHitMarker() {
    const el = this.el.hitMarker;
    el.classList.remove('show');
    void el.offsetWidth; // restart the CSS animation even on rapid repeat hits
    el.classList.add('show');
  }

  setPrompt(text) {
    if (text) { this.el.prompt.textContent = text; this.el.prompt.classList.add('show'); }
    else this.el.prompt.classList.remove('show');
  }

  setRadioTag(text) {
    if (text) { this.el.radioTag.textContent = `📻 ${text}`; this.el.radioTag.classList.add('show'); }
    else this.el.radioTag.classList.remove('show');
  }

  setCash(amount) {
    this.el.cash.textContent = Math.round(amount).toLocaleString();
  }

  updateMissions(status) {
    const active = status.mode === 'ACTIVE';
    this.el.missionBtn.disabled = active;
    this.el.missionBtn.textContent = active ? '☰ ON A JOB' : '☰ MISSIONS';
    if (active) {
      this.el.missionPanel.classList.add('show');
      this.el.missionTitle.textContent = status.title;
      this.el.missionDetail.textContent = status.progressText
        ? `${status.detail} — ${status.progressText}`
        : `${status.detail} — ${Math.ceil(status.timeLeft)}s`;
      const frac = status.timeLimit ? status.timeLeft / status.timeLimit : 1;
      this.el.missionTimerFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    } else {
      this.el.missionPanel.classList.remove('show');
    }
  }

  showToast(text, kind = 'success', ms = 3500) {
    this.el.toast.textContent = text;
    this.el.toast.className = `show ${kind}`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { this.el.toast.classList.remove('show'); }, ms);
  }

  update(state) {
    const { player, weaponSystem, wanted, controlMode, speedKmh, weather, waypoint } = state;
    this._playerPos = state.position || player.mesh.position;

    if (waypoint) {
      const d = Math.hypot(waypoint.x - this._playerPos.x, waypoint.z - this._playerPos.z);
      this.el.waypointTag.textContent = `◆ WAYPOINT ${Math.round(d)}m`;
      this.el.waypointTag.classList.add('show');
      this.el.waypointClear.classList.add('show');
    } else {
      this.el.waypointTag.classList.remove('show');
      this.el.waypointClear.classList.remove('show');
    }

    this.el.health.style.width = `${Math.max(0, player.health)}%`;
    this.el.armor.style.width = `${Math.max(0, player.armor)}%`;
    this.el.healthNum.textContent = Math.round(Math.max(0, player.health));
    this.el.armorNum.textContent = Math.round(Math.max(0, player.armor));

    const starEls = this.el.stars.children;
    for (let i = 0; i < 5; i++) starEls[i].classList.toggle('on', i < wanted.stars);

    if (controlMode.mode === 'FOOT' && weaponSystem) {
      const w = weaponSystem.current;
      this.el.weaponIcon.style.background = `#${w.color.toString(16).padStart(6, '0')}`;
      this.el.weaponName.textContent = w.name;
      this.el.ammo.textContent = weaponSystem.reloading > 0 ? 'RELOADING' : `${w.ammo} / ${w.maxAmmo}`;
      this.el.crosshair.classList.add('show');
      const bloomScale = 1 + weaponSystem.bloom * 1.8;
      this.el.crosshair.style.transform = `translate(-50%,-50%) scale(${bloomScale})`;
    } else {
      this.el.crosshair.classList.remove('show');
    }

    const weatherTag = weather?.isWet ? ' · RAIN' : '';
    if (controlMode.mode === 'FOOT') {
      this.el.speedo.textContent = '';
      this.el.state.textContent = player.state + weatherTag;
    } else {
      this.el.speedo.textContent = `${Math.round(speedKmh)} km/h`;
      this.el.state.textContent = controlMode.mode + weatherTag;
    }

    this._drawMapCanvas(this.el.minimap, this.mmCtx, MINIMAP_RANGE, state);
    if (this.el.fullMap.classList.contains('show')) {
      this._drawMapCanvas(this.el.fullMapCanvas, this.fmCtx, FULL_MAP_RANGE, state);
    }
  }

  // Shared by the corner minimap and the full-screen map (see openFullMap) —
  // same north-up top-down drawing, just parameterized by canvas + range.
  _drawMapCanvas(canvas, ctx, range, { player, world, ai, wanted, heading, position, missions, waypoint, shops }) {
    const size = canvas.width;
    const scale = size / range;
    const pos = position || player.mesh.position;
    const px = pos.x, pz = pos.z;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#0c2634'; // ocean
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.translate(size / 2, size / 2);

    // island silhouette so the map reads as land surrounded by water
    ctx.fillStyle = '#1e2420';
    ctx.beginPath();
    ctx.arc(-px * scale, -pz * scale, ISLAND.radius * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#3a4048';
    for (const c of world.getCollidersNear(px, pz, range)) {
      const cx = ((c.minX + c.maxX) / 2 - px) * scale;
      const cz = ((c.minZ + c.maxZ) / 2 - pz) * scale;
      const w = Math.max(2, (c.maxX - c.minX) * scale);
      const h = Math.max(2, (c.maxZ - c.minZ) * scale);
      ctx.fillRect(cx - w / 2, cz - h / 2, w, h);
    }

    const dot = (wx, wz, color, r = 3) => {
      const x = (wx - px) * scale, z = (wz - pz) * scale;
      if (Math.hypot(x, z) > size / 2) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, z, r, 0, Math.PI * 2);
      ctx.fill();
    };

    if (ai) {
      for (const t of ai.traffic) dot(t.vehicle.mesh.position.x, t.vehicle.mesh.position.z, t.vehicle.destroyed ? '#552211' : '#888', 2);
      for (const e of ai.enemies) if (e.alive) dot(e.mesh.position.x, e.mesh.position.z, '#ff5533', 3);
    }
    if (wanted) {
      for (const p of wanted.police) dot(p.vehicle.mesh.position.x, p.vehicle.mesh.position.z, '#3d6bff', 3);
    }
    if (shops) {
      for (const s of shops) dot(s.position.x, s.position.z, `#${s.color.toString(16).padStart(6, '0')}`, 3);
    }

    if (waypoint) {
      let x = (waypoint.x - px) * scale, z = (waypoint.z - pz) * scale;
      const dist = Math.hypot(x, z);
      const maxR = size / 2 - 6;
      if (dist > maxR) { x = (x / dist) * maxR; z = (z / dist) * maxR; }
      ctx.fillStyle = '#ff3ad6';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, z - 6);
      ctx.lineTo(x + 5, z + 4);
      ctx.lineTo(x - 5, z + 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const showsTargetDot = (missions?.active?.kind === 'delivery' || missions?.active?.kind === 'heist')
      && missions.active.target;
    if (showsTargetDot) {
      const t = missions.active.target;
      let x = (t.x - px) * scale, z = (t.z - pz) * scale;
      const dist = Math.hypot(x, z);
      const maxR = size / 2 - 6;
      if (dist > maxR) { x = (x / dist) * maxR; z = (z / dist) * maxR; }
      const heistRobbing = missions.active.kind === 'heist' && missions.active.phase === 'rob';
      ctx.fillStyle = heistRobbing ? '#ff3a3a' : '#ffd23f';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, z, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();

    // player arrow, always centered, rotated to heading
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(heading ?? player.heading ?? player.mesh.rotation.y);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
