/* Star Kingdoms — orchestrator. Owns the renderer, the save file, the
   mode machine (title / planet / battle / galaxy) and the frame loop. */
(function (SK) {
  'use strict';
  const U = SK.util;
  const B = SK.build;
  const D = SK.data;
  const $ = U.$;

  const SAVE_KEY = 'star-kingdoms-save-v3';
  const LEGACY_KEYS = ['star-kingdoms-save-v2', 'star-kingdoms-save-v1'];
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
      version: 3,
      coins: 300,
      // You begin with a small kingdom in the middle of your home world and
      // nothing else: no land, no vehicles, no fancy buildings.
      buildings: { command: 1, mine: 1, refinery: 0, barracks: 1, lab: 0, reactor: 0, hangar: 0, shield: 0 },
      // Your army is five soldiers you own outright. Buy more in the shop.
      roster: D.STARTER_ARMY.map((id) => ({ id: id, lv: 1 })),
      vehicles: {},             // vehicle id -> true once bought
      owned: {},                // territory id -> true; you start holding none
      unlocked: { verdania: true },
      conquered: {},            // planet id -> true once its Warlord falls
      planet: 'verdania',
      appearance: { skin: APPEARANCES.skins[1], suit: 0x24467a, trim: 0x35e0ff, accent: 0x9df0ff, crest: 'fin' },
      stats: { kills: 0, battlesWon: 0, battlesLost: 0, warlords: 0 },
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
    const cores = navigator.hardwareConcurrency || 4;
    const touch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    if ((touch && small) || mem <= 2 || cores <= 2) return 'low';
    if (mem <= 4 || cores <= 4 || touch) return 'medium';
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
  Game.prototype.save = function (quiet) {
    try {
      this.state.lastTick = Date.now();
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.state));
      this.saveOk = true;
      if (!quiet) this.flashSaved();
      return true;
    } catch (e) {
      // Private windows and blocked site data both land here.
      if (this.saveOk !== false) {
        this.saveOk = false;
        this.toast('This browser is blocking saved data, so progress will not be kept.', 'bad');
      }
      return false;
    }
  };

  Game.prototype.flashSaved = function () {
    const b = $('#save-badge');
    if (!b) return;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(this._saveT);
    this._saveT = setTimeout(function () { b.classList.remove('show'); }, 1400);
  };

  Game.prototype.hasSave = function () {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  };

  Game.prototype.load = function () {
    try {
      let raw = localStorage.getItem(SAVE_KEY);
      let legacy = false;
      if (!raw) {
        for (let i = 0; i < LEGACY_KEYS.length && !raw; i++) raw = localStorage.getItem(LEGACY_KEYS[i]);
        legacy = !!raw;
      }
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s) return false;
      const base = defaultState();
      this.state = Object.assign(base, s);
      this.state.buildings = Object.assign(base.buildings, s.buildings || {});
      this.state.appearance = Object.assign(base.appearance, s.appearance || {});
      this.state.stats = Object.assign(base.stats, s.stats || {});
      this.state.conquered = s.conquered || {};
      this.state.vehicles = s.vehicles || {};
      // Older saves had two currencies and a free starting territory.
      if (s.coins == null) {
        this.state.coins = Math.round((s.crystal || 0) + (s.alloy || 0)) || 300;
        this.pendingMigrationNote = true;
      }
      delete this.state.crystal;   // the old two-currency fields
      delete this.state.alloy;
      this.state.version = 3;
      // The roster was replaced wholesale, so old unit ids no longer exist.
      // Buildings, resources and conquests carry over; the army restarts.
      // Decks and per-type levels became an owned squad.
      let roster = (s.roster || []).filter((e) => e && D.unit(e.id));
      if (!roster.length) {
        roster = (s.deck || []).filter((id) => D.unit(id))
          .map((id) => ({ id: id, lv: (s.army && s.army[id]) || 1 }));
      }
      if (!roster.length) roster = D.STARTER_ARMY.map((id) => ({ id: id, lv: 1 }));
      this.state.roster = roster.slice(0, D.armyCap(this.state.buildings));
      delete this.state.deck;
      delete this.state.army;
      if (legacy || (s.version && s.version < 3)) this.pendingMigrationNote = true;
      this.collectOffline();
      return true;
    } catch (e) { return false; }
  };

  Game.prototype.collectOffline = function () {
    const mins = U.clamp((Date.now() - (this.state.lastTick || Date.now())) / 60000, 0, OFFLINE_CAP_MIN);
    if (mins < 1) return;
    const c = Math.floor(this.incomePerMin().coins * mins);
    if (c <= 0) return;
    this.state.coins += c;
    this.offlineGain = { mins: Math.floor(mins), coins: c };
  };

  /* -------------------------------------------------------- economy */
  Game.prototype.incomePerMin = function () {
    const s = this.state;
    const cmdBonus = 1 + (s.buildings.command || 1) * 0.06;
    let coins = (s.buildings.mine || 0) * 12 + (s.buildings.refinery || 0) * 9;
    D.PLANETS.forEach((p) => {
      p.territories.forEach((t) => { if (s.owned[t.id]) coins += D.tierStats(t.tier).income.coins; });
      if (s.conquered[p.id]) coins += D.citadelStats(p.citadel).income.coins;
    });
    return { coins: Math.round(coins * cmdBonus) };
  };

  Game.prototype.tickEconomy = function (dt) {
    this.incomeAcc += dt;
    if (this.incomeAcc < 1) return;
    const secs = this.incomeAcc;
    this.incomeAcc = 0;
    this.state.coins += this.incomePerMin().coins * secs / 60;
    this.ui.syncResources();
    this.saveAcc = (this.saveAcc || 0) + secs;
    if (this.saveAcc > 8) { this.saveAcc = 0; this.save(); }
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
    if (s.coins < cost) { this.toast('Not enough coins.', 'bad'); SK.Audio.deny(); return false; }
    const before = this.unitsAvailable();
    s.coins -= cost;
    s.buildings[id] = lv + 1;
    SK.Audio.build();
    this.toast(b.name + ' is now level ' + (lv + 1) + '.', 'good');
    if (id === 'barracks' || id === 'command' || id === 'lab') {
      const after = this.unitsAvailable();
      const gained = after - before;
      if (gained > 0) this.toast(gained + ' more unit types are now available.', 'good');
    }
    this.save();
    if (this.world) this.world.syncOwnership(s);
    return true;
  };

  Game.prototype.upgradeUnit = function (id) {
    const def = D.unit(id);
    const s = this.state;
    if (!def) return false;
    const lv = s.army[id] || 1;
    if (lv >= D.MAX_LEVEL) { this.toast('Already at maximum rank.', 'bad'); return false; }
    const cost = D.unitUpgradeCost(def, lv);
    if (s.coins < cost) { this.toast('Not enough coins.', 'bad'); SK.Audio.deny(); return false; }
    s.coins -= cost;
    const next = lv + 1;
    s.army[id] = next;
    SK.Audio.build();
    const perkIdx = D.PERK_LEVELS.indexOf(next);
    if (perkIdx >= 0 && def.perks[perkIdx]) {
      const perk = D.PERKS[def.perks[perkIdx]];
      this.toast(def.name + ' learned ' + perk.name + '.', 'good');
    } else {
      this.toast(def.name + ' promoted to level ' + next + '.', 'good');
    }
    this.save();
    this.ui.renderCards();
    return true;
  };

  /* The squad that walks onto the lane. */
  Game.prototype.roster = function () {
    if (!this.state.roster) this.state.roster = D.STARTER_ARMY.map((id) => ({ id: id, lv: 1 }));
    return this.state.roster;
  };
  Game.prototype.armyCap = function () { return D.armyCap(this.state.buildings); };

  Game.prototype.buySoldier = function (defId) {
    const def = D.unit(defId);
    const s = this.state;
    if (!def) return false;
    if (!D.unitUnlocked(def, s.buildings, s.conquered)) {
      this.toast('That soldier is not available yet.', 'bad'); SK.Audio.deny(); return false;
    }
    if (this.roster().length >= this.armyCap()) {
      this.toast('Your army is full. Upgrade the War Barracks for more room.', 'bad');
      SK.Audio.deny(); return false;
    }
    if (s.coins < def.price) { this.toast('Not enough coins.', 'bad'); SK.Audio.deny(); return false; }
    s.coins -= def.price;
    this.roster().push({ id: defId, lv: 1 });
    SK.Audio.build();
    this.toast(def.name + ' joined your army.', 'good');
    this.save();
    return true;
  };

  Game.prototype.sellSoldier = function (index) {
    const r = this.roster();
    const ent = r[index];
    if (!ent) return false;
    if (r.length <= 1) { this.toast('You cannot sell your last soldier.', 'bad'); SK.Audio.deny(); return false; }
    const def = D.unit(ent.id);
    const refund = Math.round((def.price + D.unitUpgradeCost(def, 1) * (ent.lv - 1)) * 0.5);
    r.splice(index, 1);
    this.state.coins += refund;
    SK.Audio.confirm();
    this.toast(def.name + ' dismissed for ' + U.fmt(refund) + ' coins.', 'info');
    this.save();
    return true;
  };

  Game.prototype.promoteSoldier = function (index) {
    const ent = this.roster()[index];
    if (!ent) return false;
    const def = D.unit(ent.id);
    const s = this.state;
    if (ent.lv >= D.MAX_LEVEL) { this.toast('Already at maximum rank.', 'bad'); return false; }
    const cost = D.unitUpgradeCost(def, ent.lv);
    if (s.coins < cost) { this.toast('Not enough coins.', 'bad'); SK.Audio.deny(); return false; }
    s.coins -= cost;
    ent.lv++;
    SK.Audio.build();
    const pi = D.PERK_LEVELS.indexOf(ent.lv);
    if (pi >= 0 && def.perks[pi]) this.toast(def.name + ' learned ' + D.PERKS[def.perks[pi]].name + '.', 'good');
    else this.toast(def.name + ' promoted to level ' + ent.lv + '.', 'good');
    this.save();
    return true;
  };

  Game.prototype.ownsVehicle = function (id) { return !!(this.state.vehicles || {})[id]; };

  Game.prototype.buyVehicle = function (id) {
    const v = D.VEHICLE_BY_ID[id];
    const s = this.state;
    if (!v) return false;
    if (this.ownsVehicle(id)) return false;
    if (s.coins < v.cost) { this.toast('Not enough coins for the ' + v.name + '.', 'bad'); SK.Audio.deny(); return false; }
    s.coins -= v.cost;
    s.vehicles[id] = true;
    SK.Audio.build();
    this.toast(v.name + ' bought. It is parked at your kingdom.', 'good');
    this.save();
    this.spawnOwnedVehicles();
    return true;
  };

  /* Park whatever you own next to the kingdom (home world) or the landing
     pad (everywhere else), and remove anything you have not bought. */
  Game.prototype.spawnOwnedVehicles = function () {
    const world = this.world;
    if (!world) return;
    const riding = this.player && this.player.vehicle ? this.player.vehicle.kind : null;
    this.vehicles.forEach((v) => { if (v.kind !== riding) world.scene.remove(v.rig.group); });
    this.vehicles = this.vehicles.filter((v) => v.kind === riding);
    const base = world.homeBase || world.landingSite;
    const pal = { body: 0xdfe8f4, trim: this.state.appearance.trim };
    // parked in a row in front of the gate, between you and the keep
    const spots = {
      bike: [base.x + 14, base.z + 30, -0.5],
      car: [base.x - 16, base.z + 30, 0.5],
      ship: [base.x + 34, base.z + 6, Math.PI * 0.5]
    };
    ['bike', 'car', 'ship'].forEach((id) => {
      if (!this.ownsVehicle(id) || id === riding) return;
      const sp = spots[id];
      const y = world.heightAt(sp[0], sp[1]) + (id === 'bike' ? 1.7 : id === 'car' ? 2.1 : 3.2);
      const veh = SK.makeVehicle(id, pal, sp[0], y, sp[1], sp[2]);
      if (id === 'ship') veh.rig.group.scale.setScalar(1.15);
      world.scene.add(veh.rig.group);
      this.vehicles.push(veh);
      if (id === 'ship') this.shipVehicle = veh;
    });
    if (!this.ownsVehicle('ship')) this.shipVehicle = null;
  };

  Game.prototype.unitsAvailable = function () {
    const s = this.state;
    return D.UNITS.filter((u) => D.unitUnlocked(u, s.buildings, s.conquered)).length;
  };

  Game.prototype.planetHeld = function (planet) {
    return planet.territories.every((t) => this.state.owned[t.id]);
  };
  Game.prototype.citadelAvailable = function (planet) {
    return this.planetHeld(planet) && !this.state.conquered[planet.id];
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

  /* Going down hands the camera to the battle: it drifts above whatever is
     still fighting until the result comes in. */
  Game.prototype.onSpectate = function () {
    this.spectate = { t: 0, look: new THREE.Vector3(), pos: new THREE.Vector3() };
    const b = this.battle;
    this.spectate.look.copy(b.homeKeep.pos).lerp(b.enemyKeep.pos, 0.5);
    this.spectate.pos.copy(this.camera.position);
    $('#spectate').classList.add('show');
    this.toast('You are down. Your army fights on — watch it finish.', 'bad');
  };

  Game.prototype.updateSpectate = function (dt) {
    const b = this.battle;
    const sp = this.spectate;
    if (!sp || !b) return;
    sp.t += dt;
    // aim at the middle of whatever is still alive, falling back to the keeps
    let n = 0, ax = 0, az = 0;
    for (let i = 0; i < b.units.length; i++) {
      const u = b.units[i];
      if (u.dead) continue;
      ax += u.pos.x; az += u.pos.z; n++;
    }
    const tx = n ? ax / n : (b.homeKeep.pos.x + b.enemyKeep.pos.x) / 2;
    const tz = n ? az / n : (b.homeKeep.pos.z + b.enemyKeep.pos.z) / 2;
    const ty = this.world.heightAt(tx, tz);
    sp.look.lerp(this._v.set(tx, ty + 3, tz), 1 - Math.exp(-2.2 * dt));
    const a = sp.t * 0.16;
    const want = this._v2.set(sp.look.x + Math.cos(a) * 46, sp.look.y + 30, sp.look.z + Math.sin(a) * 46);
    sp.pos.lerp(want, 1 - Math.exp(-2.0 * dt));
    this.camera.position.copy(sp.pos);
    this.camera.lookAt(sp.look);
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
      world.syncCitadel(self.state, self.citadelAvailable(planet), !!self.state.conquered[planet.id]);

      // only vehicles you have actually bought are parked
      self.vehicles = [];
      self.spawnOwnedVehicles();

      const start = world.homeBase || world.landingSite;
      self.player.spawn(world, start.x, start.z + 38);
      self.player.mode = 'foot';
      self.player.vehicle = null;
      // yaw 0 puts the camera behind the player looking toward -Z, which is
      // straight at the kingdom (or the pad) they just spawned in front of.
      self.chase.yaw = 0;
      self.chase.targetDist = 13;
      self.chase.pitch = 0.3;
      self.chase.snap(self.player.pos, 'foot');

      self.ui.setPlanet(planet, planet.territories.filter((t) => self.state.owned[t.id]).length,
        !!self.state.conquered[planet.id], self.citadelAvailable(planet));
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
    const touch = $('#touch');
    if (touch && this.input.isTouch) touch.hidden = (mode === 'title' || mode === 'boot');
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
          self.toast('This is your kingdom. Press E to go inside and spend your 300 coins.', 'good');
          setTimeout(() => self.toast('Then attack Target 1 on the radar. Five targets ring your kingdom.', 'info'), 3000);
        } else if (self.pendingMigrationNote) {
          self.pendingMigrationNote = false;
          self.toast('The roster grew to over a thousand units, so your army restarted at level 1.', 'info');
          setTimeout(() => self.toast('Your kingdom, resources and territory are untouched.', 'info'), 2600);
        } else if (self.offlineGain && self.offlineGain.mins >= 1) {
          const g = self.offlineGain;
          self.toast('While you were away you earned ' + U.fmt(g.coins) + ' coins.', 'good');
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
      if (!self.input.isTouch) self.input.requestLock();
    });
  };

  Game.prototype.landOn = function (planetId) {
    const self = this;
    const planet = D.PLANETS.find((p) => p.id === planetId);
    if (!this.state.unlocked[planetId]) {
      if (this.state.coins < planet.unlockCost) {
        this.toast('You need ' + U.fmt(planet.unlockCost) + ' coins to chart ' + planet.name + '.', 'bad');
        SK.Audio.deny();
        return;
      }
      this.state.coins -= planet.unlockCost;
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
    if (this.roster().length === 0) {
      this.toast('You have no soldiers. Buy some in the kingdom shop first.', 'bad');
      return;
    }
    this.fade('out', 320, function () {
      self.battle.start(territory);
      self.setMode('battle');
      self.ui.showBattle(true, territory.name + ' · Tier ' + territory.tier);
      self.chase.snap(self.player.pos, 'foot');
      self.fade('in', 420);
      self.toast('Your whole army is already out there. Push down the lane and take their keep.', 'info');
    });
  };

  Game.prototype.startCitadel = function () {
    const self = this;
    const planet = this.planet;
    const cit = planet.citadel;
    if (!this.citadelAvailable(planet)) return;
    if (this.roster().length === 0) {
      this.toast('You have no soldiers. Buy some in the kingdom shop first.', 'bad');
      return;
    }
    this.fade('out', 380, function () {
      self.battle.start(null, cit);
      self.setMode('battle');
      self.ui.showBattle(true, cit.name + ' · Warlord assault');
      self.chase.snap(self.player.pos, 'foot');
      self.fade('in', 460);
      self.toast('Kill ' + cit.warlord.name + ' to take this world. Your whole army is with you.', 'info');
    });
  };

  Game.prototype.onCitadelTaken = function (planet, citadel, reward) {
    this.state.conquered[planet.id] = true;
    this.state.stats.warlords++;
    this.save();
  };

  Game.prototype.onTerritoryCaptured = function (territory, reward) {
    this.world.syncOwnership(this.state);
    this.world.syncCitadel(this.state, this.citadelAvailable(this.planet), !!this.state.conquered[this.planet.id]);
    this.ui.setPlanet(this.planet, this.planet.territories.filter((t) => this.state.owned[t.id]).length,
      !!this.state.conquered[this.planet.id], this.citadelAvailable(this.planet));
    this.save();
  };

  Game.prototype.showBattleResult = function (won, reward) {
    const self = this;
    const b = this.battle;
    const isCit = b.isCitadel;
    const cit = b.citadel;
    const tr = b.territory;
    const allHeld = !isCit && this.planet.territories.every((t) => this.state.owned[t.id]);
    const trophy = isCit ? D.TROPHIES.filter((t) => t.planet === this.planet.id)[0] : null;
    setTimeout(function () {
      if (!self.battle.active || self.battle.result !== (won ? 'win' : 'lose')) return;
      self.ui.showResult({
        tone: won ? 'win' : 'lose',
        eyebrow: won ? (isCit ? 'World conquered' : 'Territory claimed') : 'Assault repelled',
        title: won
          ? (isCit ? cit.warlord.name + ' has fallen' : tr.name + ' is yours')
          : 'Your keep has fallen',
        body: won
          ? (isCit
            ? self.planet.name + ' is yours entirely. The ' + self.planet.faction.name +
              ' have no capital left, and ' + cit.warlord.name + "'s guard has joined your roster."
            : (allHeld
              ? 'Every territory on ' + self.planet.name + ' now flies your banner. ' +
                cit.name + ' has opened — their Warlord is waiting.'
              : 'The ' + self.planet.faction.name + ' pull back. Your settlement expands onto the captured ground.'))
          : (isCit
            ? cit.warlord.name + ' still holds ' + cit.name + '. Promote your units, widen your deck, and come back.'
            : 'The ' + self.planet.faction.name + ' hold ' + tr.name +
              '. Strengthen the Aegis Shield, promote your units, and come back. It costs you nothing to try again.'),
        rewards: won
          ? '<span><i class="c-coin"></i>+' + U.fmt(reward.coins) + '</span>' +
            '<span class="rw-inc">+' + (isCit ? D.citadelStats(cit).income.coins
              : D.tierStats(tr.tier).income.coins) + ' coins/min</span>' +
            (trophy ? '<span class="rw-trophy">Unlocked: ' + trophy.name + '</span>' : '')
          : null,
        actions: [
          { label: won ? 'Return to the surface' : 'Try again', primary: true,
            fn: function () { self.endBattle(won ? null : (isCit ? 'citadel' : tr)); } },
          won ? null : { label: 'Back to the surface', fn: function () { self.endBattle(); } }
        ].filter(Boolean)
      });
    }, won ? 1600 : 900);
  };

  Game.prototype.endBattle = function (retry) {
    const self = this;
    this.ui.hideResult();
    this.fade('out', 320, function () {
      self.battle.cleanup();
      self.spectate = null;
      $('#spectate').classList.remove('show');
      self.world.syncOwnership(self.state);
      self.world.syncCitadel(self.state, self.citadelAvailable(self.planet),
        !!self.state.conquered[self.planet.id]);
      if (retry) {
        // Retrying costs nothing: straight back in from the same approach.
        const center = retry === 'citadel'
          ? { x: self.planet.citadel.x, z: self.planet.citadel.z } : { x: retry.x, z: retry.z };
        self.player.spawn(self.world, center.x + 70, center.z + 70);
        self.player.health = 100;
        self.player.group.visible = true;
        if (retry === 'citadel') self.battle.start(null, self.planet.citadel);
        else self.battle.start(retry);
        self.setMode('battle');
        self.ui.showBattle(true, retry === 'citadel'
          ? self.planet.citadel.name + ' · Warlord assault'
          : retry.name + ' · Tier ' + retry.tier);
        self.chase.snap(self.player.pos, 'foot');
        self.fade('in', 420);
        self.ui.syncResources();
        return;
      }
      self.ui.showBattle(false);
      self.setMode('planet');
      const back = self.world.homeBase || self.world.landingSite;
      self.player.spawn(self.world, back.x, back.z + 36);
      self.player.health = 100;
      self.player.group.visible = true;
      self.chase.snap(self.player.pos, 'foot');
      self.fade('in', 420);
      self.ui.syncResources();
    });
  };

  /* --------------------------------------------------- panel hooks */
  Game.prototype.onPanelOpen = function () {
    this.input.exitLock();
    this.input.releaseAll();
    const t = $('#touch');
    if (t && this.input.isTouch) t.hidden = true;
  };
  Game.prototype.onPanelClose = function () {
    const t = $('#touch');
    if (t && this.input.isTouch && this.mode !== 'title') t.hidden = false;
    if (!this.input.isTouch && (this.mode === 'planet' || this.mode === 'battle')) this.input.requestLock();
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
    // your kingdom: the shop, and where everything is parked
    const kb = this.world.homeBase;
    if (kb && Math.hypot(kb.x - p.x, kb.z - p.z) < 44) {
      return { key: 'E', text: 'Enter your kingdom — buildings, army and vehicles',
        act: 'kingdom', hold: 0.5 };
    }
    // the Citadel, once every territory on this world is held
    const cit = this.planet.citadel;
    if (cit && this.citadelAvailable(this.planet)) {
      const cd = Math.hypot(cit.x - p.x, cit.z - p.z);
      if (cd < 34) {
        return { key: 'E', text: 'Assault ' + cit.name + ' · ' + cit.warlord.name,
          act: 'citadel', hold: 1.4 };
      }
    }
    // territories
    let t = null, td = 26;
    this.planet.territories.forEach((tr) => {
      const d = Math.hypot(tr.x - p.x, tr.z - p.z);
      if (d < td) { td = d; t = tr; }
    });
    if (t) {
      if (this.state.owned[t.id]) {
        return { key: 'E', text: t.name + ' is yours. Nothing left to fight here.', act: null, hold: 0 };
      }
      return {
        key: 'E', text: 'Attack ' + t.name + '  ·  Target ' + t.order + ' of 5  ·  ' +
          this.planet.faction.name, act: 'battle', target: t, hold: 1.1
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
    else if (it.act === 'citadel') { this.startCitadel(); }
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
    input.pollGamepad();

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
    if (input.consumeKey('KeyG')) this.ui.showPanel('garage');
    if (input.consumeKey('Escape')) {
      if (this.ui.openPanel) this.ui.closePanel();
      else this.input.exitLock();
    }
    const menuOpen = !!this.ui.openPanel;

    // camera look
    const mouse = input.consumeMouse();
    if (!menuOpen && (st.locked || document.pointerLockElement || input.isTouch)) {
      this.chase.rotate(mouse.dx, mouse.dy);
    } else if (!menuOpen && st.fire && !st.locked) {
      this.chase.rotate(mouse.dx, mouse.dy);
    }
    if (mouse.wheel) this.chase.zoom(mouse.wheel);

    if (!menuOpen && !(battling && this.battle.spectating)) {
      player.update(dt, st, this.chase);
    } else {
      player.char.update(dt, { speed: 0 });
    }

    // weapon fire
    player.fireCooldown = Math.max(0, player.fireCooldown - 0);
    if (!menuOpen && st.fire && player.mode === 'foot' && player.fireCooldown <= 0 &&
      !(battling && this.battle.spectating)) {
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

    const spectating = battling && this.battle.spectating;
    world.update(dt, spectating && this.spectate ? this.spectate.look : player.pos);
    this.fx.update(dt);
    this.fx.updatePopups(dt, this.camera, window.innerWidth, window.innerHeight);
    if (spectating) this.updateSpectate(dt);
    else this.chase.update(dt, player.pos, world, player.mode);

    /* --------- battle vs free roam --------- */
    if (battling) {
      this.battle.update(dt);
      this.ui.syncBattle(this.battle);
      this.ui.setPlayerHealth(player.health, !this.battle.spectating);
      this.ui.setPrompt(null);
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
    $('#crosshair').classList.toggle('on',
      player.mode === 'foot' && !menuOpen && !(battling && this.battle.spectating));
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
