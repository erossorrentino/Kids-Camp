import * as THREE from 'three';
import { CAMERA, WORLD_SEED, VEHICLE, BIKE, HELI, JET, EXPLOSION } from './config.js';
import { Input } from './input.js';
import { CityWorld } from './world/city.js';
import { Player, PlayerState } from './entities/player.js';
import { Vehicle } from './entities/vehicle.js';
import { Helicopter, Jet } from './entities/aircraft.js';
import { WeaponSystem } from './entities/weapons.js';
import { AIManager } from './entities/ai/manager.js';
import { WantedSystem } from './systems/wanted.js';
import { AudioManager } from './systems/audio.js';
import { ParticleSystem } from './systems/particles.js';
import { WeatherSystem } from './systems/weather.js';
import { HUD } from './systems/hud.js';
import { CameraRig } from './systems/camera.js';

const MODE = { FOOT: 'FOOT', CAR: 'CAR', BIKE: 'BIKE', HELI: 'HELI', JET: 'JET' };
const DRIVING_MODES = new Set([MODE.CAR, MODE.BIKE]);

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this._initRenderer();
    this._initSceneAndLights();

    this.input = new Input(canvas);
    this.cameraRig = new CameraRig(this.camera);
    this.world = new CityWorld(this.scene, WORLD_SEED);
    this.player = new Player(this.scene);
    this.weaponSystem = new WeaponSystem(this.scene, this.player);
    this.aiManager = new AIManager(this.scene);
    this.wanted = new WantedSystem(this.scene);
    this.audio = new AudioManager(this.camera, this.scene);
    this.particles = new ParticleSystem(this.scene);
    this.weather = new WeatherSystem(this.scene, this.sun, this.audio);
    this.hud = new HUD();

    this._spawnVehicles();

    this.controlMode = { mode: MODE.FOOT, vehicle: null };
    this.engineHandle = null;
    this.tireHandle = null;
    this._smokeTimer = 0;

    this.clock = new THREE.Clock();
    window.addEventListener('resize', () => this._onResize());
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, window.innerWidth / window.innerHeight, CAMERA.near, CAMERA.far);
  }

  _initSceneAndLights() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fc3e0);
    this.scene.fog = new THREE.Fog(0x9fc3e0, 140, CAMERA.far * 0.9);

    const ambient = new THREE.HemisphereLight(0xbfd9ff, 0x3a3a2a, 0.7);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff2d8, 1.1);
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
    for (const t of this.aiManager.traffic) {
      candidates.push({ obj: t.vehicle, type: MODE.CAR, range: VEHICLE.enterRange, trafficRef: t });
    }
    let best = null, bestDist = Infinity;
    for (const c of candidates) {
      if (c.obj.occupied || c.obj.destroyed) continue;
      const d = p.distanceTo(c.obj.mesh.position);
      if (d < c.range && d < bestDist) { best = c; bestDist = d; }
    }
    return best;
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
    v.occupied = false;
    const heading = v.heading ?? 0;
    const side = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
    this.player.mesh.position.copy(v.mesh.position).addScaledVector(side, 3.2);
    this.player.mesh.position.y = 0;
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

    if (this.input.wasPressed('KeyE')) {
      if (this.controlMode.mode === MODE.FOOT) {
        const candidate = this._findInteractable();
        if (candidate) this._enterVehicle(candidate);
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
      if (player.state === PlayerState.RUNNING) weaponSystem.addBloom(dt * 0.6);

      const targets = [
        ...world.getBuildingMeshes(),
        ...world.getPropMeshes(),
        ...aiManager.enemyMeshes,
        ...aiManager.pedestrians.map((p) => p.mesh),
        ...aiManager.traffic.map((t) => t.vehicle.mesh),
      ];
      weaponSystem.update(
        dt, input, this.camera, targets,
        (hit, dmg) => this._onWeaponHit(hit, dmg), audio,
        (pos, radius, dmg) => this.explodeAt(pos, radius, dmg)
      );
      if (weaponSystem.firedThisFrame) aiManager.notifyGunfire(player.mesh.position, 24);

      const candidate = this._findInteractable();
      hud.setPrompt(candidate ? 'Press E to enter vehicle' : null);
      activePos = player.mesh.position;
      heading = player.heading;
    } else if (DRIVING_MODES.has(this.controlMode.mode)) {
      const vehicle = this.controlMode.vehicle;
      const { collided } = vehicle.update(dt, input, world, undefined, traction);
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
      hud.setPrompt(vehicle.destroyed ? 'Vehicle destroyed — press E to get out' : 'Press E to exit');
      if (vehicle.destroyed) this._exitVehicle();
    } else if (this.controlMode.mode === MODE.HELI) {
      const heli = this.controlMode.vehicle;
      heli.update(dt, input);
      cameraRig.updateChase(heli, dt, { dist: 10, height: 4 });
      audio.setLoopIntensity(this.engineHandle, 0.3 + 0.7 * heli.rotorSpeed, 0.8 + heli.rotorSpeed * 0.5);
      speedKmh = heli.speed * 3.6;
      activePos = heli.mesh.position;
      heading = heli.heading;
      hud.setPrompt('Press E to exit');
    } else if (this.controlMode.mode === MODE.JET) {
      const jet = this.controlMode.vehicle;
      jet.update(dt, input);
      cameraRig.updateChase(jet, dt, { dist: 14, height: 4.5, bank: jet.roll });
      audio.setLoopIntensity(this.engineHandle, 0.3 + 0.7 * (jet.speed / JET.maxSpeed), 0.6 + (jet.speed / JET.maxSpeed) * 1.2);
      speedKmh = jet.speed * 3.6;
      activePos = jet.mesh.position;
      heading = jet.heading;
      hud.setPrompt(jet.stalling ? 'STALLING — nose down! (Press E to exit)' : 'Press E to exit');
    }

    if (this.controlMode.mode !== MODE.HELI) this.heli.update(dt, input);
    if (this.controlMode.mode !== MODE.JET) this.jet.update(dt, input);

    world.update(activePos.x, activePos.z);
    aiManager.syncWithWorld(world);
    aiManager.update(dt, world, player.mesh.position, (enemy, dmg) => this._onEnemyFire(enemy, dmg), traction);
    wanted.update(dt, world, player, activePos, this.controlMode, traction);
    weather.update(dt, activePos);
    this._scanVehicleDestructions();

    this._updateSunFollow(activePos);
    particles.update(dt);
    audio.update(dt);

    hud.update({
      player, weaponSystem, wanted, world, ai: aiManager,
      controlMode: this.controlMode, speedKmh, heading, position: activePos,
      weather,
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
      if (d < radius) enemy.takeDamage(EXPLOSION.actorDamage * (1 - d / radius));
    }
    for (const ped of [...this.aiManager.pedestrians]) {
      if (ped.mesh.position.distanceTo(position) < radius * 0.6) {
        this.aiManager.pedestrians = this.aiManager.pedestrians.filter((p) => p !== ped);
        ped.dispose(this.scene);
      }
    }
    for (const prop of this.world.getPropsNear(position.x, position.z, radius)) prop.takeDamage(999);

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
    if (kind === 'enemy') {
      const enemy = hit.object.userData.ref;
      enemy.takeDamage(damage);
      this.wanted.reportCrime(1);
      if (!enemy.alive) this.particles.spawnExplosion(hit.point);
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
