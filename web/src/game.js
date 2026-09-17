import * as THREE from '../vendor/three/three.module.js';
import { CAMERA, WORLD_SEED, VEHICLE, BIKE, HELI, JET, BOAT, SUB, WATER, BEACH, ISLAND, EXPLOSION, STARTING_CASH } from './config.js';
import { Input } from './input.js';
import { TouchControls } from './systems/touchControls.js';
import { CityWorld } from './world/city.js';
import { Player, PlayerState } from './entities/player.js';
import { Vehicle } from './entities/vehicle.js';
import { Helicopter, Jet } from './entities/aircraft.js';
import { Boat } from './entities/boat.js';
import { Submarine } from './entities/submarine.js';
import { WeaponSystem } from './entities/weapons.js';
import { AIManager } from './entities/ai/manager.js';
import { WantedSystem } from './systems/wanted.js';
import { AudioManager } from './systems/audio.js';
import { ParticleSystem } from './systems/particles.js';
import { WeatherSystem } from './systems/weather.js';
import { MissionManager } from './systems/missions.js';
import { ShopManager } from './systems/shops.js';
import { buildBeacon } from './systems/beacon.js';
import { HUD } from './systems/hud.js';
import { CameraRig } from './systems/camera.js';

const MODE = { FOOT: 'FOOT', CAR: 'CAR', BIKE: 'BIKE', HELI: 'HELI', JET: 'JET', BOAT: 'BOAT', SUB: 'SUB' };
const DRIVING_MODES = new Set([MODE.CAR, MODE.BIKE]);
const CASH_STORAGE_KEY = 'neonHorizonCash';
const LICENSE_STORAGE_KEY = 'neonHorizonLicense';
const SPAWN_KIND_MODE = { car: MODE.CAR, bike: MODE.BIKE, heli: MODE.HELI, jet: MODE.JET, boat: MODE.BOAT, sub: MODE.SUB };

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this._initRenderer();
    this._initSceneAndLights();

    this.input = new Input(canvas);
    this.touchControls = new TouchControls(this.input);
    this.cameraRig = new CameraRig(this.camera);
    this.world = new CityWorld(this.scene, WORLD_SEED);
    this.player = new Player(this.scene);
    this.weaponSystem = new WeaponSystem(this.scene, this.player);
    this.aiManager = new AIManager(this.scene);
    this.wanted = new WantedSystem(this.scene);
    this.audio = new AudioManager(this.camera, this.scene);
    this.particles = new ParticleSystem(this.scene);
    this.weather = new WeatherSystem(this.scene, this.sun, this.audio);
    this.missions = new MissionManager(this.scene);
    this.shops = new ShopManager(this.scene);
    this.hud = new HUD();
    this.hasLicense = this._loadLicense();
    this.hud.bindMissions(this.missions, () => this.hasLicense);
    this.hud.bindWeapons(this.weaponSystem);
    this.hud.bindShopMenu();
    this.hud.bindMinimapTap();
    this.hud.bindFullMap((x, z) => this._setWaypoint(new THREE.Vector3(x, 0, z)));
    this.hud.bindWaypointClear(() => this._clearWaypoint());

    this._initWater();
    this._spawnVehicles();
    this.boat = null;
    this.sub = null;

    this.controlMode = { mode: MODE.FOOT, vehicle: null };
    this.engineHandle = null;
    this.tireHandle = null;
    this._smokeTimer = 0;
    this._playerDead = false;
    this.cash = this._loadCash();
    this.waypoint = null;
    this._waypointBeacon = null;

    this.clock = new THREE.Clock();
    window.addEventListener('resize', () => this._onResize());
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, window.innerWidth / window.innerHeight, CAMERA.near, CAMERA.far);
  }

  _initSceneAndLights() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fc3e0);
    this.scene.fog = new THREE.Fog(0x9fc3e0, 140, CAMERA.far * 0.9);

    const ambient = new THREE.HemisphereLight(0xbfd9ff, 0x3a3a2a, 0.85);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff2d8, 1.9);
    sun.position.set(120, 180, 80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -160;
    sun.shadow.camera.right = 160;
    sun.shadow.camera.top = 160;
    sun.shadow.camera.bottom = -160;
    sun.shadow.camera.far = 500;
    sun.shadow.bias = -0.0015;
    this.sun = sun;
    this.scene.add(sun);
    this.scene.add(sun.target);
  }

  _spawnVehicles() {
    this.starterCar = new Vehicle(this.scene, { position: new THREE.Vector3(14, 0, 20), color: 0xd23a3a, isPlayerStarter: true });
    this.bike = new Vehicle(this.scene, { position: new THREE.Vector3(20, 0, 8), color: 0x161616, stats: BIKE, isBike: true, isPlayerStarter: true });
    this.heli = new Helicopter(this.scene, new THREE.Vector3(-18, 0.4, 30));
    this.jet = new Jet(this.scene, new THREE.Vector3(30, 1, -10));
  }

  // A single huge flat plane under everything, standing in for the ocean
  // that surrounds the island (see config.js's ISLAND/WATER — CityWorld only
  // generates land within ISLAND.radius of the origin), plus a sandy ring at
  // the shoreline so land doesn't just cut off into open sea. The ring's
  // inner half sits under the last row of land chunks (invisible); only the
  // outer half, past ISLAND.radius, actually shows as a beach.
  _initWater() {
    const geo = new THREE.PlaneGeometry(WATER.size, WATER.size);
    const mat = new THREE.MeshStandardMaterial({ color: WATER.color, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 });
    const water = new THREE.Mesh(geo, mat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER.level;
    water.receiveShadow = true;
    this.scene.add(water);
    this.water = water;

    const beachGeo = new THREE.RingGeometry(BEACH.innerRadius, BEACH.outerRadius, 96);
    const beachMat = new THREE.MeshStandardMaterial({ color: BEACH.color, roughness: 0.95 });
    const beach = new THREE.Mesh(beachGeo, beachMat);
    beach.rotation.x = -Math.PI / 2;
    beach.position.y = BEACH.level;
    beach.receiveShadow = true;
    this.scene.add(beach);
    this.beach = beach;
  }

  // Ground travel (on foot, car, bike) can't cross the shoreline — it slides
  // along an invisible boundary at the island radius instead. Boats, subs,
  // and aircraft are untouched, so the sea stays reachable by the vehicles
  // meant to cross it.
  _clampToIsland(obj) {
    const d = Math.hypot(obj.mesh.position.x, obj.mesh.position.z);
    if (d > ISLAND.radius) {
      const s = ISLAND.radius / d;
      obj.mesh.position.x *= s;
      obj.mesh.position.z *= s;
      if (typeof obj.speed === 'number') obj.speed *= 0.3;
    }
  }

  // --- map waypoint --------------------------------------------------------
  _setWaypoint(pos) {
    if (this._waypointBeacon) this.scene.remove(this._waypointBeacon.group);
    this.waypoint = pos;
    this._waypointBeacon = buildBeacon(this.scene, pos, 0xff3ad6);
    this.hud.showToast('Waypoint set', 'success', 1500);
  }

  _clearWaypoint() {
    if (this._waypointBeacon) { this.scene.remove(this._waypointBeacon.group); this._waypointBeacon = null; }
    this.waypoint = null;
  }

  // --- shops -----------------------------------------------------------
  purchaseShopItem(shop, item) {
    if (item.license && this.hasLicense) { this.hud.showToast('Already have a license', 'fail'); return; }
    if (this.cash < item.price) { this.hud.showToast('Not enough cash', 'fail'); return; }
    this.addCash(-item.price);
    if (item.license) {
      this._grantLicense();
      this.hud.showToast('Contractor License acquired — contracts unlocked!', 'success', 4000);
      this.hud.openShopMenu(shop, (it) => this.purchaseShopItem(shop, it)); // refresh (cash changed)
    } else if (item.weapon) {
      if (item.weapon === 'all') {
        for (const w of this.weaponSystem.inventory) w.ammo = w.maxAmmo;
      } else {
        const w = this.weaponSystem.inventory.find((w) => w.id === item.weapon);
        if (w) w.ammo = w.maxAmmo;
      }
      this.hud.showToast(`Bought: ${item.label}`, 'success');
      this.hud.openShopMenu(shop, (it) => this.purchaseShopItem(shop, it)); // refresh (cash/ammo changed)
    } else if (item.spawn) {
      // Vehicle shops "call in" a vehicle and drop the player straight into
      // the driver's seat — the coastal boat/sub shops launch it out into
      // open water, well past where the player could ever walk up to it.
      const vehicle = this._spawnPurchasedVehicle(item.spawn, shop.position);
      this.hud.closeShopMenu();
      this.hud.showToast(`${item.label} delivered!`, 'success');
      this._enterVehicle({ obj: vehicle, type: SPAWN_KIND_MODE[item.spawn] });
    }
  }

  _spawnPurchasedVehicle(kind, shopPos) {
    const outward = shopPos.lengthSq() > 1 ? shopPos.clone().normalize() : new THREE.Vector3(1, 0, 0);
    const isWater = kind === 'boat' || kind === 'sub';
    const pos = shopPos.clone().addScaledVector(outward, isWater ? 60 : 8);
    pos.y = 0;

    if (kind === 'car') {
      return this._replaceVehicle('starterCar', new Vehicle(this.scene, { position: pos, color: 0xd23a3a, isPlayerStarter: true }));
    } else if (kind === 'bike') {
      return this._replaceVehicle('bike', new Vehicle(this.scene, { position: pos, color: 0x161616, stats: BIKE, isBike: true, isPlayerStarter: true }));
    } else if (kind === 'heli') {
      pos.y = 0.4;
      return this._replaceVehicle('heli', new Helicopter(this.scene, pos));
    } else if (kind === 'jet') {
      pos.y = 1;
      return this._replaceVehicle('jet', new Jet(this.scene, pos));
    } else if (kind === 'boat') {
      pos.y = WATER.level + 0.1;
      return this._replaceVehicle('boat', new Boat(this.scene, pos));
    } else if (kind === 'sub') {
      pos.y = WATER.level;
      return this._replaceVehicle('sub', new Submarine(this.scene, pos));
    }
    return null;
  }

  _replaceVehicle(key, obj) {
    const old = this[key];
    if (old && old.mesh) this.scene.remove(old.mesh);
    this[key] = obj;
    return obj;
  }

  // Every drivable ground vehicle the world knows about — used for explosion
  // splash damage and destruction bookkeeping. Aircraft aren't included; they
  // aren't destructible in this prototype.
  _allVehicles() {
    return [
      this.starterCar, this.bike,
      ...this.aiManager.traffic.map((t) => t.vehicle),
      ...this.wanted.police.map((p) => p.vehicle),
    ];
  }

  // localStorage can throw (privacy mode, a sandboxed embed) or just not
  // persist — either way the game must still run, just without save/load.
  _loadCash() {
    try {
      const stored = Number(localStorage.getItem(CASH_STORAGE_KEY));
      return Number.isFinite(stored) && stored > 0 ? stored : STARTING_CASH;
    } catch {
      return STARTING_CASH;
    }
  }

  addCash(amount) {
    this.cash += amount;
    try {
      localStorage.setItem(CASH_STORAGE_KEY, String(Math.round(this.cash)));
    } catch {
      // no persistence available in this context; the session still works
    }
  }

  _loadLicense() {
    try {
      return localStorage.getItem(LICENSE_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  _grantLicense() {
    this.hasLicense = true;
    try {
      localStorage.setItem(LICENSE_STORAGE_KEY, '1');
    } catch {
      // no persistence available in this context; the license still works this session
    }
  }

  // Dying costs a "hospital bill" (a cut of your cash), clears heat, and
  // drops you back at the plaza on foot — GTA-style consequence for a death
  // that otherwise had none.
  _onPlayerDeath() {
    if (this.controlMode.mode !== MODE.FOOT) this._exitVehicle();
    this.player.mesh.position.set(0, 0, 6);
    this.player.respawn();
    this.player.setVisible(true);

    const fine = Math.min(this.cash, Math.round(this.cash * 0.1) + 50);
    this.addCash(-fine);
    this.wanted.stars = 0;
    for (const p of this.wanted.police) p.dispose(this.scene);
    this.wanted.police = [];

    this.hud.showToast(`Hospitalized — lost $${fine}`, 'fail', 4000);
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  start() {
    this.renderer.setAnimationLoop(() => this._tick());
  }

  _tick() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this._update(dt);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  // --- vehicle enter/exit -------------------------------------------------
  _findInteractable() {
    const p = this.player.mesh.position;
    const candidates = [
      { obj: this.starterCar, type: MODE.CAR, range: VEHICLE.enterRange },
      { obj: this.bike, type: MODE.BIKE, range: BIKE.enterRange },
      { obj: this.heli, type: MODE.HELI, range: HELI.enterRange },
      { obj: this.jet, type: MODE.JET, range: JET.enterRange },
    ];
    if (this.boat) candidates.push({ obj: this.boat, type: MODE.BOAT, range: BOAT.enterRange });
    if (this.sub) candidates.push({ obj: this.sub, type: MODE.SUB, range: SUB.enterRange });
    for (const t of this.aiManager.traffic) {
      candidates.push({ obj: t.vehicle, type: MODE.CAR, range: VEHICLE.enterRange, trafficRef: t });
    }
    let best = null, bestDist = Infinity;
    for (const c of candidates) {
      if (c.obj.occupied || c.obj.destroyed) continue;
      const d = p.distanceTo(c.obj.mesh.position);
      if (d < c.range && d < bestDist) { best = c; bestDist = d; }
    }
    return best ? { ...best, dist: bestDist } : null;
  }

  // Whichever's closer of a nearby shop or a nearby enterable vehicle — F
  // does whichever this returns, and the on-foot HUD prompt names it.
  _nearestInteraction() {
    const p = this.player.mesh.position;
    const shop = this.shops.findNearby(p, 10);
    const vehicle = this._findInteractable();
    const shopDist = shop ? p.distanceTo(shop.position) : Infinity;
    const vehicleDist = vehicle ? vehicle.dist : Infinity;
    if (shop && shopDist <= vehicleDist) return { kind: 'shop', shop };
    if (vehicle) return { kind: 'vehicle', candidate: vehicle };
    return null;
  }

  _enterVehicle(candidate) {
    const { obj, type, trafficRef } = candidate;
    if (trafficRef) this.aiManager.traffic = this.aiManager.traffic.filter((t) => t !== trafficRef);
    if (DRIVING_MODES.has(type) && !obj.isPlayerStarter && !obj.reportedTheft) {
      obj.reportedTheft = true;
      this.wanted.reportCrime(1);
    }
    obj.occupied = true;
    this.controlMode = { mode: type, vehicle: obj };
    this.player.setVisible(false);

    this.engineHandle = this.audio.attachLoop(obj.mesh, 'engine', { volume: 0.5, refDistance: 16 });
    if (DRIVING_MODES.has(type)) this.tireHandle = this.audio.attachLoop(obj.mesh, 'tireScreech', { volume: 0.6, refDistance: 8 });
  }

  _exitVehicle() {
    const v = this.controlMode.vehicle;
    const mode = this.controlMode.mode;
    v.occupied = false;
    const heading = v.heading ?? 0;
    const side = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
    this.player.mesh.position.copy(v.mesh.position).addScaledVector(side, 3.2);
    this.player.mesh.position.y = (mode === MODE.BOAT || mode === MODE.SUB) ? WATER.level + 0.05 : 0;
    this.player.setVisible(true);
    this.controlMode = { mode: MODE.FOOT, vehicle: null };

    this.audio.detachLoop(this.engineHandle); this.engineHandle = null;
    if (this.tireHandle) { this.audio.detachLoop(this.tireHandle); this.tireHandle = null; }
    this.audio.stopRadio();
    this.hud.setRadioTag(null);
  }

  // --- main update ---------------------------------------------------------
  _update(dt) {
    const { input, cameraRig, world, player, weaponSystem, aiManager, wanted, audio, particles, weather, hud } = this;

    if (this.input.wasPressed('KeyF')) {
      if (this.controlMode.mode === MODE.FOOT) {
        const interaction = this._nearestInteraction();
        if (interaction?.kind === 'shop') this.hud.openShopMenu(interaction.shop, (item) => this.purchaseShopItem(interaction.shop, item));
        else if (interaction?.kind === 'vehicle') this._enterVehicle(interaction.candidate);
      } else {
        this._exitVehicle();
      }
    }

    let activePos = player.mesh.position;
    let speedKmh = 0;
    let heading = player.heading;
    const traction = weather.traction;

    if (this.controlMode.mode === MODE.FOOT) {
      const aiming = input.isMouseDown(2);
      cameraRig.handleMouseFoot(input, aiming);
      cameraRig.updateFoot(player, dt, aiming);
      player.update(dt, input, cameraRig, world);
      this._clampToIsland(player);
      if (player.state === PlayerState.RUNNING) weaponSystem.addBloom(dt * 0.6);

      const targets = [
        ...world.getBuildingMeshes(),
        ...world.getPropMeshes(),
        ...aiManager.enemyMeshes,
        ...aiManager.pedestrians.map((p) => p.mesh),
        ...aiManager.traffic.map((t) => t.vehicle.mesh),
        ...wanted.police.map((p) => p.vehicle.mesh),
        ...wanted.police.filter((p) => p.officer?.alive).map((p) => p.officer.mesh),
      ];
      weaponSystem.update(
        dt, input, this.camera, targets,
        (hit, dmg) => this._onWeaponHit(hit, dmg), audio,
        (pos, radius, dmg) => this.explodeAt(pos, radius, dmg)
      );
      if (weaponSystem.firedThisFrame) aiManager.notifyGunfire(player.mesh.position, 24);

      const interaction = this._nearestInteraction();
      hud.setPrompt(
        interaction?.kind === 'shop' ? `Press F to browse ${interaction.shop.name}`
        : interaction?.kind === 'vehicle' ? 'Press F to enter vehicle'
        : null
      );
      activePos = player.mesh.position;
      heading = player.heading;
    } else if (DRIVING_MODES.has(this.controlMode.mode)) {
      const vehicle = this.controlMode.vehicle;
      const { collided } = vehicle.update(dt, input, world, undefined, traction);
      this._clampToIsland(vehicle);
      if (collided) particles.spawnSmoke(vehicle.mesh.position, { color: 0x777777, size: 0.5, life: 0.5, spread: 1.5, rise: 0.5 });
      this._smashNearbyProps(vehicle);
      const chaseDist = vehicle.isBike ? 5.5 : 8;
      const chaseHeight = vehicle.isBike ? 2.4 : 3.2;
      cameraRig.updateChase(vehicle, dt, { dist: chaseDist, height: chaseHeight });

      const speedFrac = Math.abs(vehicle.speed) / vehicle.stats.maxSpeed;
      audio.setLoopIntensity(this.engineHandle, 0.15 + 0.85 * speedFrac, 0.7 + 0.6 * speedFrac);
      audio.setLoopIntensity(this.tireHandle, vehicle.isDrifting ? vehicle.driftIntensity : 0);

      this._smokeTimer -= dt;
      if (this._smokeTimer <= 0) {
        this._smokeTimer = vehicle.isDrifting ? 0.06 : 0.35;
        if (vehicle.isDrifting) {
          const back = vehicle.mesh.position.clone().addScaledVector(vehicle.forward, -2.1);
          particles.spawnSmoke(back, { color: 0xcccccc, size: 0.5, life: 0.7, spread: 1.2, rise: 0.4 });
        } else if (Math.abs(vehicle.speed) > 1) {
          const exhaust = vehicle.mesh.position.clone().addScaledVector(vehicle.forward, -2.3);
          exhaust.y += 0.4;
          particles.spawnSmoke(exhaust, { color: 0x999999, size: 0.3, life: 0.9, spread: 0.3, rise: 0.6 });
        }
      }

      if (input.wasPressed('KeyT')) {
        const label = audio.toggleRadio();
        hud.setRadioTag(label === 'OFF' ? null : label);
      }
      if (input.wasPressed('KeyC')) vehicle.cycleColor();
      if (input.wasPressed('KeyN')) vehicle.toggleNeon();

      speedKmh = Math.abs(vehicle.speed) * 3.6;
      activePos = vehicle.mesh.position;
      heading = vehicle.heading;
      hud.setPrompt(vehicle.destroyed ? 'Vehicle destroyed — press F to get out' : 'Press F to exit');
      if (vehicle.destroyed) this._exitVehicle();
    } else if (this.controlMode.mode === MODE.HELI) {
      const heli = this.controlMode.vehicle;
      heli.update(dt, input);
      cameraRig.updateChase(heli, dt, { dist: 10, height: 4 });
      audio.setLoopIntensity(this.engineHandle, 0.3 + 0.7 * heli.rotorSpeed, 0.8 + heli.rotorSpeed * 0.5);
      speedKmh = heli.speed * 3.6;
      activePos = heli.mesh.position;
      heading = heli.heading;
      hud.setPrompt('Press F to exit');
    } else if (this.controlMode.mode === MODE.JET) {
      const jet = this.controlMode.vehicle;
      jet.update(dt, input);
      cameraRig.updateChase(jet, dt, { dist: 14, height: 4.5, bank: jet.roll });
      audio.setLoopIntensity(this.engineHandle, 0.3 + 0.7 * (jet.speed / JET.maxSpeed), 0.6 + (jet.speed / JET.maxSpeed) * 1.2);
      speedKmh = jet.speed * 3.6;
      activePos = jet.mesh.position;
      heading = jet.heading;
      hud.setPrompt(jet.stalling ? 'STALLING — nose down! (Press F to exit)' : 'Press F to exit');
    } else if (this.controlMode.mode === MODE.BOAT) {
      const boat = this.controlMode.vehicle;
      boat.update(dt, input);
      cameraRig.updateChase(boat, dt, { dist: 9, height: 3.4 });
      audio.setLoopIntensity(this.engineHandle, 0.2 + 0.8 * (Math.abs(boat.speed) / BOAT.maxSpeed), 0.6);
      speedKmh = Math.abs(boat.speed) * 3.6;
      activePos = boat.mesh.position;
      heading = boat.heading;
      hud.setPrompt('Press F to exit');
    } else if (this.controlMode.mode === MODE.SUB) {
      const sub = this.controlMode.vehicle;
      sub.update(dt, input);
      cameraRig.updateChase(sub, dt, { dist: 10, height: 3.6 });
      speedKmh = Math.abs(sub.speed) * 3.6;
      activePos = sub.mesh.position;
      heading = sub.heading;
      hud.setPrompt(`Press F to exit (Depth ${Math.round(sub.depth)}m)`);
    }

    if (this.controlMode.mode !== MODE.HELI) this.heli.update(dt, input);
    if (this.controlMode.mode !== MODE.JET) this.jet.update(dt, input);
    if (this.boat && this.controlMode.mode !== MODE.BOAT) this.boat.update(dt, input);
    if (this.sub && this.controlMode.mode !== MODE.SUB) this.sub.update(dt, input);

    world.update(activePos.x, activePos.z);
    aiManager.syncWithWorld(world);
    aiManager.update(dt, world, player.mesh.position, (enemy, dmg) => this._onEnemyFire(enemy, dmg), traction);
    wanted.update(dt, world, player, activePos, this.controlMode, traction, (officer, dmg) => this._onEnemyFire(officer, dmg));
    weather.update(dt, activePos);
    this._scanVehicleDestructions();
    this.shops.update(dt);
    if (this._waypointBeacon) this._waypointBeacon.ring.rotation.z += dt * 1.5;

    if (input.wasPressed('KeyM')) hud.toggleMissionMenu();
    const isInVehicle = DRIVING_MODES.has(this.controlMode.mode);
    const missionEvent = this.missions.update(dt, activePos, player.health > 0, isInVehicle);
    if (this.missions.consumeAlarm()) {
      this.wanted.reportCrime(this.missions.alarmStars); // hitting the target is a big enough crime to spike heat hard
      hud.showToast('ALARM TRIGGERED — GET TO THE GETAWAY POINT!', 'fail', 4000);
    }
    if (missionEvent) {
      if (missionEvent.success) {
        this.addCash(missionEvent.reward);
        hud.showToast(`${missionEvent.title} complete! +$${missionEvent.reward.toLocaleString()}`, 'success');
      } else {
        hud.showToast(`${missionEvent.title} failed`, 'fail');
      }
    }

    if (player.health <= 0 && !this._playerDead) {
      this._playerDead = true;
      this._onPlayerDeath();
    } else if (player.health > 0) {
      this._playerDead = false;
    }

    this._updateSunFollow(activePos);
    particles.update(dt);
    audio.update(dt);

    hud.setCash(this.cash);
    hud.updateMissions(this.missions.status());
    hud.update({
      player, weaponSystem, wanted, world, ai: aiManager,
      controlMode: this.controlMode, speedKmh, heading, position: activePos,
      weather, missions: this.missions, waypoint: this.waypoint, shops: this.shops.shops,
    });
  }

  // A vehicle's health can hit zero from ramming, gunfire, or splash damage
  // from another explosion — wherever it happens, catch the transition here
  // so every source of destruction gets the same one-time blast + FX, and a
  // vehicle killed by a blast can itself chain into the next explosion.
  _scanVehicleDestructions() {
    for (const v of this._allVehicles()) {
      if (v.destroyed && !v._explodedFx) {
        v._explodedFx = true;
        this.explodeAt(v.mesh.position.clone(), EXPLOSION.radius, EXPLOSION.vehicleDamage);
        this.missions.notifyVehicleDestroyed();
      }
    }
  }

  // Driving into a barrier/crate at any real speed smashes it in one hit —
  // arcade-style destructible set-dressing rather than a rigid collider.
  _smashNearbyProps(vehicle) {
    if (Math.abs(vehicle.speed) < 3) return;
    for (const prop of this.world.getPropsNear(vehicle.mesh.position.x, vehicle.mesh.position.z, vehicle.halfLength + 1.2)) {
      if (prop.takeDamage(999)) {
        this.particles.spawnSmoke(prop.mesh.position, { color: 0x9a8a6a, size: 0.5, life: 0.6, spread: 1.4, rise: 0.3 });
        vehicle.speed *= 0.92;
        this.missions.notifyPropDestroyed();
      }
    }
  }

  // Splash damage + FX at a point: used for rocket impacts and any vehicle
  // that just died (ramming, gunfire, or a earlier chained blast).
  explodeAt(position, radius = EXPLOSION.radius, vehicleDamage = EXPLOSION.vehicleDamage) {
    this.particles.spawnExplosion(position);
    this.audio.playExplosion(position);
    this.aiManager.notifyGunfire(position, radius * 2.5);

    for (const v of this._allVehicles()) {
      if (v.destroyed) continue;
      const d = v.mesh.position.distanceTo(position);
      if (d < radius) v.takeDamage(vehicleDamage * (1 - d / radius));
    }
    for (const enemy of this.aiManager.enemies) {
      if (!enemy.alive) continue;
      const d = enemy.mesh.position.distanceTo(position);
      if (d < radius) {
        enemy.takeDamage(EXPLOSION.actorDamage * (1 - d / radius));
        if (!enemy.alive) this.missions.notifyEnemyKilled();
      }
    }
    for (const p of this.wanted.police) {
      if (!p.officer?.alive) continue;
      const d = p.officer.mesh.position.distanceTo(position);
      if (d < radius) p.officer.takeDamage(EXPLOSION.actorDamage * (1 - d / radius));
    }
    for (const ped of [...this.aiManager.pedestrians]) {
      if (ped.mesh.position.distanceTo(position) < radius * 0.6) {
        this.aiManager.pedestrians = this.aiManager.pedestrians.filter((p) => p !== ped);
        ped.dispose(this.scene);
      }
    }
    for (const prop of this.world.getPropsNear(position.x, position.z, radius)) {
      if (prop.takeDamage(999)) this.missions.notifyPropDestroyed();
    }

    const dPlayer = this.player.mesh.position.distanceTo(position);
    if (this.controlMode.mode === MODE.FOOT && dPlayer < radius) {
      this.player.takeDamage(EXPLOSION.actorDamage * 0.6 * (1 - dPlayer / radius));
    }
  }

  _updateSunFollow(pos) {
    this.sun.position.set(pos.x + 120, 180, pos.z + 80);
    this.sun.target.position.set(pos.x, 0, pos.z);
  }

  _onWeaponHit(hit, damage) {
    const kind = hit.object.userData?.kind;
    if (kind === 'enemy' || kind === 'pedestrian' || kind === 'vehicle' || kind === 'policeOfficer') this.hud.flashHitMarker();
    if (kind === 'policeOfficer') {
      const officer = hit.object.userData.ref;
      officer.takeDamage(damage);
      this.wanted.reportCrime(2); // shooting a cop is serious
      if (!officer.alive) this.particles.spawnExplosion(hit.point);
    } else if (kind === 'enemy') {
      const enemy = hit.object.userData.ref;
      enemy.takeDamage(damage);
      this.wanted.reportCrime(1);
      if (!enemy.alive) {
        this.particles.spawnExplosion(hit.point);
        this.missions.notifyEnemyKilled();
      }
    } else if (kind === 'pedestrian') {
      const ped = hit.object.userData.ref;
      this.aiManager.pedestrians = this.aiManager.pedestrians.filter((p) => p !== ped);
      ped.dispose(this.scene);
      this.wanted.reportCrime(1);
    } else if (kind === 'vehicle') {
      const vehicle = hit.object.userData.ref;
      vehicle.takeDamage(damage);
      this.wanted.reportCrime(1);
    } else if (kind === 'prop') {
      const prop = hit.object.userData.ref;
      if (prop.takeDamage(damage)) {
        this.particles.spawnSmoke(hit.point, { color: 0x9a8a6a, size: 0.5, life: 0.6, spread: 1.2, rise: 0.3 });
        this.missions.notifyPropDestroyed();
      }
    }
    this.particles.spawnSmoke(hit.point, { color: 0x8a1010, size: 0.25, life: 0.35, spread: 0.4, rise: 0.2 });
  }

  _onEnemyFire(enemy, damage) {
    this.player.takeDamage(damage);
    this.particles.spawnMuzzleFlash(enemy.mesh.position.clone().add(new THREE.Vector3(0, 1.1, 0)), 0xffaa55);
    this.aiManager.notifyGunfire(enemy.mesh.position, 20);
  }
}
