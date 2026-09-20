/* Star Kingdoms — orchestrator. Owns the renderer, the save file, the
   mode machine (title / planet / battle / galaxy) and the frame loop. */
(function (SK) {
  'use strict';
  const U = SK.util;
  const B = SK.build;
  const D = SK.data;
  const $ = U.$;

  const SAVE_KEY = 'star-kingdoms-save-v1';
  const OFFLINE_CAP_MIN = 8 * 60;

  const APPEARANCES = {
    skins: [0xf0c8a0, 0xd89b6c, 0xa9713f, 0x7a4b28, 0x4e2f1b, 0x8fd6c0],
    suits: [
      { name: 'Aurora', suit: 0x24467a, trim: 0x35e0ff, accent: 0x9df0ff },
      { name: 'Ember', suit: 0x5c1f24, trim: 0xff8a3a, accent: 0xffd166 },
      { name: 'Verdant', suit: 0x1f4a34, trim: 0x5dffa0, accent: 0xd6ff9a },
      { name: 'Violet', suit: 0x3a1f5c, trim: 0xc46bff, accent: 0xff9ae0 }
    ],
    crests: ['fin', 'halo', 'horns', null]
  };

  function defaultState() {
    return {
      version: 1,
      crystal: 600, alloy: 400,
      buildings: { command: 1, mine: 1, refinery: 1, barracks: 1, lab: 0, reactor: 0, hangar: 0, shield: 0 },
      army: { trooper: 1, lancer: 1, bulwark: 1, sniper: 1, swarm: 1, rocketeer: 1, medic: 1, warbot: 1 },
      deck: ['trooper', 'lancer', 'bulwark', 'sniper'],
      owned: { v1: true },
      unlocked: { verdania: true },
      planet: 'verdania',
      appearance: { skin: APPEARANCES.skins[1], suit: 0x24467a, trim: 0x35e0ff, accent: 0x9df0ff, crest: 'fin' },
      stats: { kills: 0, battlesWon: 0, battlesLost: 0 },
      lastTick: Date.now()
    };
  }

  /* ================================================================== */
  function Game(canvas) {
    this.canvas = canvas;
    this.mode = 'boot';
    this.clockT = 0;
    this.pendingHold = 0;
    this.holdAction = null;
    this.quality = this.detectQuality();

    const renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: this.quality !== 'low', powerPreference: 'high-performance',
      stencil: false
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 2 : 1.35));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.LinearEncoding;
    renderer.toneMapping = THREE.NoToneMapping;
    this.renderer = renderer;

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.35, 3000);

    try {
      this.bloom = new SK.Bloom(renderer, window.innerWidth, window.innerHeight);
    } catch (e) {
      this.bloom = null;
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
    }

    this.chase = new SK.ChaseCamera(this.camera);
    this.input = new SK.Input(canvas);
    this.state = defaultState();
    this.ui = new SK.UI(this);
    this.fx = null;
    this.world = null;
    this.player = null;
    this.battle = new SK.Battle(this);
    this.vehicles = [];
    this.incomeAcc = 0;
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();

    const self = this;
    window.addEventListener('resize', () => self.resize());
    this.resize();

    // Audio needs a gesture; wake it on the first interaction of any kind.
    const wake = function () { SK.Audio.resume(); };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
  }

  Game.prototype.detectQuality = function () {
    const mem = navigator.deviceMemory || 4;
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    if (mobile || mem <= 2) return 'low';
    if (mem <= 4) return 'medium';
    return 'high';
  };

  Game.prototype.resize = function () {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.bloom) this.bloom.setSize(w, h);
  };

  /* ------------------------------------------------------- save/load */
  Game.prototype.save = function () {
    try {
      this.state.lastTick = Date.now();
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.state));
    } catch (e) { /* private mode or blocked storage — play on without saving */ }
  };

  Game.prototype.hasSave = function () {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  };

  Game.prototype.load = function () {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || s.version !== 1) return false;
      const base = defaultState();
      this.state = Object.assign(base, s);
      this.state.buildings = Object.assign(base.buildings, s.buildings || {});
      this.state.army = Object.assign(base.army, s.army || {});
      this.state.appearance = Object.assign(base.appearance, s.appearance || {});
      this.state.stats = Object.assign(base.stats, s.stats || {});
      this.collectOffline();
      return true;
    } catch (e) { return false; }
  };

  Game.prototype.collectOffline = function () {
    const mins = U.clamp((Date.now() - (this.state.lastTick || Date.now())) / 60000, 0, OFFLINE_CAP_MIN);
    if (mins < 1) return;
    const inc = this.incomePerMin();
    const c = Math.floor(inc.crystal * mins), a = Math.floor(inc.alloy * mins);
    this.state.crystal += c;
    this.state.alloy += a;
    this.offlineGain = { mins: Math.floor(mins), crystal: c, alloy: a };
  };

  /* -------------------------------------------------------- economy */
  Game.prototype.incomePerMin = function () {
    const s = this.state;
    const cmdBonus = 1 + (s.buildings.command || 1) * 0.06;
    let crystal = (s.buildings.mine || 0) * 14;
    let alloy = (s.buildings.refinery || 0) * 10;
    D.PLANETS.forEach((p) => {
      p.territories.forEach((t) => {
        if (s.owned[t.id]) {
          const st = D.tierStats(t.tier);
          crystal += st.income.crystal;
          alloy += st.income.alloy;
        }
      });
    });
    return { crystal: Math.round(crystal * cmdBonus), alloy: Math.round(alloy * cmdBonus) };
  };

  Game.prototype.tickEconomy = function (dt) {
    this.incomeAcc += dt;
    if (this.incomeAcc < 1) return;
    const secs = this.incomeAcc;
    this.incomeAcc = 0;
    const inc = this.incomePerMin();
    this.state.crystal += inc.crystal * secs / 60;
    this.state.alloy += inc.alloy * secs / 60;
    this.ui.syncResources();
    this.saveAcc = (this.saveAcc || 0) + secs;
    if (this.saveAcc > 12) { this.saveAcc = 0; this.save(); }
  };

  Game.prototype.upgradeBuilding = function (id) {
    const b = D.BUILDINGS.find((x) => x.id === id);
    const s = this.state;
    const lv = s.buildings[id] || 0;
    if (lv >= b.max) return false;
    if (id !== 'command' && lv >= (s.buildings.command || 1) && (s.buildings.command || 1) < 10) {
      this.toast('Raise the Command Spire first.', 'bad');
      SK.Audio.deny();
      return false;
    }
    const cost = SK.costOf(b, lv);
    if (s.crystal < cost) { this.toast('Not enough crystal.', 'bad'); SK.Audio.deny(); return false; }
    s.crystal -= cost;
    s.buildings[id] = lv + 1;
    SK.Audio.build();
    this.toast(b.name + ' is now level ' + (lv + 1) + '.', 'good');
    if (id === 'barracks') {
      const newly = D.UNITS.filter((u) => u.barracks === lv + 1);
      newly.forEach((u) => this.toast(u.name + ' unlocked.', 'good'));
    }
    this.save();
    if (this.world) this.world.syncOwnership(s);
    return true;
  };

  Game.prototype.upgradeUnit = function (id) {
    const def = D.UNITS.find((u) => u.id === id);
    const s = this.state;
    const lv = s.army[id] || 1;
    if (lv >= 12) { this.toast('Already at maximum rank.', 'bad'); return false; }
    const cost = SK.unitCost(def, lv);
    if (s.alloy < cost) { this.toast('Not enough alloy.', 'bad'); SK.Audio.deny(); return false; }
    s.alloy -= cost;
    s.army[id] = lv + 1;
    SK.Audio.build();
    this.toast(def.name + ' promoted to level ' + (lv + 1) + '.', 'good');
    this.save();
    this.ui.renderCards();
    return true;
  };

  Game.prototype.planetsUnlocked = function () {
    return D.PLANETS.filter((p) => this.state.unlocked[p.id]).length;
  };

  Game.prototype.toast = function (m, tone) { this.ui.toast(m, tone); };

  /* -------------------------------------------------------- fade i/o */
  Game.prototype.fade = function (dir, ms, cb) {
    const f = $('#fade');
    f.style.transitionDuration = (ms || 450) + 'ms';
    f.classList.toggle('on', dir === 'out');
    setTimeout(() => { if (cb) cb(); }, ms || 450);
  };

  Game.prototype.flashDamage = function () {
    const v = $('#hurt');
    v.classList.remove('hit');
    void v.offsetWidth;
    v.classList.add('hit');
  };

  /* ------------------------------------------------------ world load */
  Game.prototype.loadPlanet = function (planetId, done) {
    const self = this;
    const planet = D.PLANETS.find((p) => p.id === planetId);
    $('#loading').classList.add('show');
    $('#loading-planet').textContent = planet.name;
    $('#loading-epi').textContent = planet.epithet;
    $('#loading-blurb').textContent = planet.blurb;

    // let the loading screen paint before the heavy synchronous build
    setTimeout(function () {
      if (self.world) {
        self.world.dispose();
        self.world = null;
      }
      const world = new SK.World.PlanetWorld(planet, { quality: self.quality });
      self.world = world;
      self.planet = planet;
      self.state.planet = planetId;

      self.fx = new SK.FX(world.scene, self.camera);
      self.fx.setPopupLayer(self.ui.el.dmg);
      self.battle.game = self;

      if (!self.player) self.player = new SK.Player(self, self.state.appearance);
      world.scene.add(self.player.group);

      world.syncOwnership(self.state);

      // craft parked at the landing pad
      self.vehicles = [];
      const L = world.landingSite;
      const pal = { body: 0xdfe8f4, trim: self.state.appearance.trim };
      const bike = SK.makeVehicle('bike', pal, L.x + 13, L.y + 1.7, L.z - 6, -0.9);
      const car = SK.makeVehicle('car', pal, L.x - 14, L.y + 2.1, L.z - 5, 0.9);
      const ship = SK.makeVehicle('ship', pal, L.x, L.y + 3.2, L.z, Math.PI);
      ship.rig.group.scale.setScalar(1.15);
      [bike, car, ship].forEach((v) => { world.scene.add(v.rig.group); self.vehicles.push(v); });
      self.shipVehicle = ship;

      self.player.spawn(world, L.x, L.z + 13);
      self.player.mode = 'foot';
      self.player.vehicle = null;
      self.chase.yaw = Math.PI;
      self.chase.targetDist = 8.5;
      self.chase.pitch = 0.2;
      self.chase.snap(self.player.pos, 'foot');

      self.ui.setPlanet(planet, planet.territories.filter((t) => self.state.owned[t.id]).length);
      SK.Audio.setAmbient(planet.audioRoot, true);

      $('#loading').classList.remove('show');
      if (done) done();
    }, 90);
  };

  /* --------------------------------------------------------- modes */
  Game.prototype.setMode = function (mode) {
    this.mode = mode;
    const onPlanet = mode === 'planet' || mode === 'battle';
    this.ui.el.hud.classList.toggle('show', onPlanet);
    this.ui.showGalaxy(mode === 'galaxy');
    this.ui.showBattle(mode === 'battle');
    $('#title').classList.toggle('show', mode === 'title');
    this.ui.setPrompt(null);
    this.input.releaseAll();
    if (mode === 'title') this.input.exitLock();
  };

  Game.prototype.startNewGame = function (appearance) {
    this.state = defaultState();
    this.state.appearance = appearance;
    this.player = null;
    this.save();
    this.beginCampaign(true);
  };

  Game.prototype.continueGame = function () {
    this.beginCampaign(false);
  };

  Game.prototype.beginCampaign = function (isNew) {
    const self = this;
    this.fade('out', 380, function () {
      self.loadPlanet(self.state.planet, function () {
        self.setMode('planet');
        self.ui.syncResources();
        self.ui.renderCards();
        self.fade('in', 520);
        if (isNew) {
          self.toast('Welcome home, sovereign.', 'good');
          setTimeout(() => self.toast('Press M to open the galaxy. K for your kingdom.', 'info'), 2200);
        } else if (self.offlineGain && self.offlineGain.mins >= 1) {
          const g = self.offlineGain;
          self.toast('While you were away: +' + U.fmt(g.crystal) + ' crystal, +' + U.fmt(g.alloy) + ' alloy.', 'good');
          self.offlineGain = null;
        }
      });
    });
  };

  /* -------------------------------------------------- galaxy travel */
  Game.prototype.openGalaxy = function () {
    const self = this;
    if (!this.galaxy) this.galaxy = new SK.Galaxy(this);
    this.galaxyFx = this.galaxyFx || new SK.FX(this.galaxy.scene, this.camera);
    this.fade('out', 320, function () {
      self.galaxy.enter(self.state.planet);
      self.setMode('galaxy');
      self.ui.showGalaxy(true);
      SK.Audio.warp();
      self.fade('in', 500);
      self.input.requestLock();
    });
  };

  Game.prototype.landOn = function (planetId) {
    const self = this;
    const planet = D.PLANETS.find((p) => p.id === planetId);
    if (!this.state.unlocked[planetId]) {
      if (this.state.crystal < planet.unlockCost) {
        this.toast('You need ' + U.fmt(planet.unlockCost) + ' crystal to chart ' + planet.name + '.', 'bad');
        SK.Audio.deny();
        return;
      }
      this.state.crystal -= planet.unlockCost;
      this.state.unlocked[planetId] = true;
      this.save();
      this.toast(planet.name + ' charted. Its coordinates are yours.', 'good');
      SK.Audio.confirm();
    }
    SK.Audio.warp();
    this.fade('out', 620, function () {
      self.loadPlanet(planetId, function () {
        self.setMode('planet');
        self.ui.syncResources();
        self.fade('in', 600);
        self.save();
      });
    });
  };

  /* ------------------------------------------------------- battles */
  Game.prototype.startBattle = function (territory) {
    const self = this;
    if (this.state.deck.length === 0) {
      this.toast('Your deck is empty. Open the army console first.', 'bad');
      return;
    }
    this.fade('out', 320, function () {
      self.battle.start(territory);
      self.setMode('battle');
      self.ui.showBattle(true, territory.name + ' · Tier ' + territory.tier);
      self.chase.snap(self.player.pos, 'foot');
      self.fade('in', 420);
      self.toast('Take their keep. Press 1-' + self.state.deck.length + ' to call units to your position.', 'info');
    });
  };

  Game.prototype.tryDeploy = function (id) {
    if (this.mode !== 'battle' || !this.battle.active || this.battle.result) return;
    if (this.state.deck.indexOf(id) < 0) return;
    const def = D.UNITS.find((u) => u.id === id);
    if (this.battle.energy < def.energy) { SK.Audio.deny(); this.toast('Not enough energy.', 'bad'); return; }
    const msg = this.battle.deploy(id);
    if (msg) this.toast(msg, 'info');
  };

  Game.prototype.onTerritoryCaptured = function (territory, reward) {
    this.world.syncOwnership(this.state);
    this.ui.setPlanet(this.planet, this.planet.territories.filter((t) => this.state.owned[t.id]).length);
    this.save();
  };

  Game.prototype.showBattleResult = function (won, reward) {
    const self = this;
    const tr = this.battle.territory;
    const allHeld = this.planet.territories.every((t) => this.state.owned[t.id]);
    setTimeout(function () {
      self.ui.showResult({
        tone: won ? 'win' : 'lose',
        eyebrow: won ? 'Territory claimed' : 'Assault repelled',
        title: won ? tr.name + ' is yours' : 'Your keep has fallen',
        body: won
          ? (allHeld
            ? 'Every territory on ' + self.planet.name + ' now flies your banner. The ' +
              self.planet.faction.name + ' have nothing left here.'
            : 'The ' + self.planet.faction.name + ' pull back. Your settlement expands onto the captured ground.')
          : 'The ' + self.planet.faction.name + ' hold ' + tr.name + '. Strengthen the Aegis Shield, promote your units, and come back.',
        rewards: won
          ? '<span><i class="c-crystal"></i>+' + U.fmt(reward.crystal) + '</span>' +
            '<span><i class="c-alloy"></i>+' + U.fmt(reward.alloy) + '</span>' +
            '<span class="rw-inc">+' + D.tierStats(tr.tier).income.crystal + '/min income</span>'
          : null,
        actions: [
          { label: 'Return to the surface', primary: true, fn: function () { self.endBattle(); } }
        ]
      });
    }, won ? 1500 : 900);
  };

  Game.prototype.endBattle = function () {
    const self = this;
    this.ui.hideResult();
    this.fade('out', 320, function () {
      self.battle.cleanup();
      self.ui.showBattle(false);
      self.setMode('planet');
      const L = self.world.landingSite;
      self.player.spawn(self.world, L.x, L.z + 13);
      self.player.health = 100;
      self.player.group.visible = true;
      self.chase.snap(self.player.pos, 'foot');
      self.world.syncOwnership(self.state);
      self.fade('in', 420);
      self.ui.syncResources();
    });
  };

  /* --------------------------------------------------- panel hooks */
  Game.prototype.onPanelOpen = function () { this.input.exitLock(); this.input.releaseAll(); };
  Game.prototype.onPanelClose = function () {
    if (this.mode === 'planet' || this.mode === 'battle') this.input.requestLock();
  };

  /* ------------------------------------------------- interactions */
  Game.prototype.nearestInteraction = function () {
    const p = this.player.pos;
    if (this.player.vehicle) {
      return { key: 'F', text: 'Leave the ' + this.player.vehicle.label.toLowerCase(), act: 'dismount', hold: 0 };
    }
    // vehicles
    let best = null, bestD = 7.5;
    this.vehicles.forEach((v) => {
      const d = Math.hypot(v.pos.x - p.x, v.pos.z - p.z);
      if (d < bestD) { bestD = d; best = v; }
    });
    if (best && best.kind !== 'ship') {
      return { key: 'F', text: 'Ride the ' + best.label.toLowerCase(), act: 'mount', target: best, hold: 0 };
    }
    if (best && best.kind === 'ship') {
      return { key: 'E', text: 'Board the starship', act: 'launch', hold: 0.9 };
    }
    // territories
    let t = null, td = 26;
    this.planet.territories.forEach((tr) => {
      const d = Math.hypot(tr.x - p.x, tr.z - p.z);
      if (d < td) { td = d; t = tr; }
    });
    if (t) {
      if (this.state.owned[t.id]) {
        return { key: 'K', text: t.name + ' — yours. Open the kingdom console', act: 'kingdom', hold: 0 };
      }
      return {
        key: 'E', text: 'Assault ' + t.name + ' · Tier ' + t.tier + ' · ' + this.planet.faction.name,
        act: 'battle', target: t, hold: 1.1
      };
    }
    return null;
  };

  Game.prototype.doInteraction = function (it) {
    if (!it) return;
    if (it.act === 'mount') { this.player.mount(it.target); }
    else if (it.act === 'dismount') { this.player.dismount(); }
    else if (it.act === 'launch') { this.openGalaxy(); }
    else if (it.act === 'battle') { this.startBattle(it.target); }
    else if (it.act === 'kingdom') { this.ui.showPanel('kingdom'); }
  };

  /* -------------------------------------------------------- frame */
  Game.prototype.start = function () {
    const self = this;
    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      self.clockT += dt;
      try { self.tick(dt); } catch (e) { console.error(e); }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  Game.prototype.tick = function (dt) {
    const input = this.input;
    const st = input.state;

    if (this.mode === 'title') {
      this.tickTitle(dt);
    } else if (this.mode === 'galaxy') {
      this.tickGalaxy(dt);
    } else if (this.mode === 'planet' || this.mode === 'battle') {
      this.tickPlanet(dt);
    }
    input.clearFrameKeys();
  };

  Game.prototype.tickTitle = function (dt) {
    if (!this.galaxy) this.galaxy = new SK.Galaxy(this);
    const g = this.galaxy;
    g.t += dt;
    g.updateOrbits(dt * 0.6);
    g.ship.group.visible = false;
    const a = g.t * 0.06;
    this.camera.position.set(Math.cos(a) * 330, 130 + Math.sin(a * 0.7) * 60, Math.sin(a) * 330);
    this.camera.lookAt(0, 0, 0);
    this.renderScene(g.scene, 1.05, 0.85);
  };

  Game.prototype.tickGalaxy = function (dt) {
    const g = this.galaxy;
    g.ship.group.visible = true;
    this.galaxyFx.update(dt);
    g.update(dt, this.input, this.camera);

    this.ui.setGalaxyTarget(g.nearest, this.state, g.nearestDist);
    if (g.nearest) {
      if (this.input.state.pressed.KeyE) {
        this.pendingHold += dt;
        $('#galaxy-hold').style.width = U.clamp(this.pendingHold / 0.85, 0, 1) * 100 + '%';
        if (this.pendingHold >= 0.85) {
          this.pendingHold = 0;
          $('#galaxy-hold').style.width = '0%';
          this.landOn(g.nearest.planet.id);
        }
      } else { this.pendingHold = 0; $('#galaxy-hold').style.width = '0%'; }
    } else { this.pendingHold = 0; }

    if (this.input.consumeKey('Escape')) {
      this.landOn(this.state.planet);
    }
    this.tickEconomy(dt);
    this.renderScene(g.scene, 1.0, 0.9);
  };

  Game.prototype.tickPlanet = function (dt) {
    const input = this.input;
    const st = input.state;
    const player = this.player;
    const world = this.world;
    const battling = this.mode === 'battle' && this.battle.active;

    // panels and menus
    if (input.consumeKey('KeyK')) this.ui.showPanel('kingdom');
    if (input.consumeKey('KeyU')) this.ui.showPanel('army');
    if (input.consumeKey('Escape')) {
      if (this.ui.openPanel) this.ui.closePanel();
      else this.input.exitLock();
    }
    const menuOpen = !!this.ui.openPanel;

    // camera look
    const mouse = input.consumeMouse();
    if (!menuOpen && (st.locked || document.pointerLockElement)) this.chase.rotate(mouse.dx, mouse.dy);
    else if (!menuOpen && st.fire && !st.locked) this.chase.rotate(mouse.dx, mouse.dy);
    if (mouse.wheel) this.chase.zoom(mouse.wheel);

    if (!menuOpen) {
      player.update(dt, st, this.chase);
    } else {
      player.char.update(dt, { speed: 0 });
    }

    // weapon fire
    player.fireCooldown = Math.max(0, player.fireCooldown - 0);
    if (!menuOpen && st.fire && player.mode === 'foot' && player.fireCooldown <= 0 && !this.battle.playerDown) {
      player.fireCooldown = 0.17;
      const origin = player.muzzlePos(this._v).clone();
      const dir = this._v2.set(
        -Math.sin(this.chase.yaw) * Math.cos(this.chase.pitch),
        -Math.sin(this.chase.pitch) - 0.02,
        -Math.cos(this.chase.yaw) * Math.cos(this.chase.pitch)
      ).normalize().clone();
      if (battling && !this.battle.result) {
        this.battle.playerShoot(origin, dir);
      } else {
        const end = origin.clone().addScaledVector(dir, 90);
        this.fx.tracer(origin, end, this.state.appearance.trim, 0.09);
        this.fx.muzzle(origin, this.state.appearance.trim);
        SK.Audio.laser();
      }
      this.chase.shake = Math.max(this.chase.shake, 0.16);
    }

    // idle animation for parked craft
    this.vehicles.forEach((v) => {
      if (v === player.vehicle) return;
      v.rig.body.position.y = Math.sin(this.clockT * 1.6 + v.pos.x) * 0.09;
      v.rig.body.rotation.z = Math.sin(this.clockT * 0.9 + v.pos.z) * 0.02;
      if (v.rig.pods) v.rig.pods.forEach((p) => { p.material.opacity = 0.22 + Math.sin(this.clockT * 3) * 0.06; });
    });

    world.update(dt, player.pos);
    this.fx.update(dt);
    this.fx.updatePopups(dt, this.camera, window.innerWidth, window.innerHeight);
    this.chase.update(dt, player.pos, world, player.mode);

    /* --------- battle vs free roam --------- */
    if (battling) {
      this.battle.update(dt);
      this.ui.syncBattle(this.battle);
      this.ui.setPlayerHealth(player.health, true);
      this.ui.setPrompt(null);
      if (!menuOpen && !this.battle.result) {
        for (let i = 0; i < this.state.deck.length; i++) {
          if (input.consumeKey('Digit' + (i + 1))) this.tryDeploy(this.state.deck[i]);
        }
      }
    } else {
      this.ui.setPlayerHealth(player.health, false);
      const it = menuOpen ? null : this.nearestInteraction();
      if (it) {
        if (it.hold > 0) {
          const held = st.pressed['Key' + it.key] || (it.key === 'E' && st.pressed.KeyE);
          if (held) {
            this.pendingHold += dt;
            if (this.pendingHold >= it.hold) { this.pendingHold = 0; this.doInteraction(it); }
          } else this.pendingHold = 0;
          this.ui.setPrompt(it.key, it.text);
          $('#prompt-progress').style.width = U.clamp(this.pendingHold / it.hold, 0, 1) * 100 + '%';
        } else {
          this.ui.setPrompt(it.key, it.text);
          $('#prompt-progress').style.width = '0%';
          if (it.key === 'F' && input.consumeKey('KeyF')) this.doInteraction(it);
        }
      } else {
        this.pendingHold = 0;
        this.ui.setPrompt(null);
      }
      this.ui.setVehicleTag(player.vehicle
        ? player.vehicle.label + '  ·  ' + Math.round(Math.abs(player.vehicle.speed) * 3.6) + ' km/h'
        : '');
      this.tickEconomy(dt);
    }

    this.ui.drawRadar();
    $('#crosshair').classList.toggle('on', player.mode === 'foot' && !menuOpen);
    this.renderScene(world.scene, 1.0, battling ? 0.85 : 0.65);
  };

  Game.prototype.renderScene = function (scene, exposure, bloomStrength) {
    if (this.bloom) {
      this.bloom.render(scene, this.camera, exposure, bloomStrength);
    } else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, this.camera);
    }
  };

  SK.Game = Game;
  SK.APPEARANCES = APPEARANCES;
  SK.defaultState = defaultState;
})(window.SK);
