# Crime Shooter — Three.js Open World Prototype

A single-page, dependency-free (besides a vendored Three.js) open-world
prototype: procedural streaming city, on-foot + car + bike + helicopter + jet
controllers, a 5-weapon arsenal (including a rocket launcher and railgun),
ambient AI that reacts to gunfire, dynamic rain with slick-road physics,
destructible props, chain-reaction vehicle explosions, and a wanted/police
pursuit system.

## Running it

Any static file server works (ES modules need `http://`, not `file://`):

```sh
cd web
python3 -m http.server 8080
# open http://localhost:8080
```

`three.js` is vendored at `web/vendor/three/three.module.js` (fetched from
npm, not a CDN) so the game has no runtime network dependency.

## Controls

- **Arrow keys** (or WASD) move / drive / fly, **Shift** sprint (heli: ascend),
  **Space** jump (heli: descend)
- **Mouse** look (third person, orbit/aim), **RMB** aim down sights
- **F** enter/exit a car, bike, helicopter, or jet
- **1-5** or mouse wheel: switch weapon (pistol/rifle/shotgun/rocket
  launcher/railgun), **LMB** fire, **R** reload
- **T** toggle radio station, **C** cycle paint color, **N** cycle neon
  underglow (all while driving)
- Helicopter: **Q/E** yaw. Jet: **A/D** roll (banks turn the plane),
  **Arrow keys** or **Q/E** pitch/yaw, **W/S** throttle
- **M** accept a contract when one's offered (bottom of screen)

### Touch / mobile

Fully playable on a touchscreen — a virtual joystick (bottom-left) drives
movement, dragging anywhere else on screen looks around, and an on-screen
button cluster covers fire/aim/jump/boost/use/reload/weapon-cycle plus a
utility row for radio/paint/neon/yaw. Touch controls show automatically on
touch-capable devices (`systems/touchControls.js`); pointer lock is skipped
on those devices since it isn't meaningful for touch.

## Code layout

```
src/
  config.js            tunable constants for every system
  input.js              keyboard/mouse/pointer-lock state
  game.js                orchestrator: control-mode state machine, wiring
  main.js                boot entry point
  world/city.js          chunked procedural city streaming (instanced buildings, roads, destructible props)
  world/collision.js     shared AABB collision helpers
  entities/player.js      capsule controller, gravity/jump, anim state machine
  entities/vehicle.js     arcade car+bike physics (drift, wet-road traction, health/destruction), shared by traffic/police AI
  entities/aircraft.js    helicopter + jet flight models
  entities/weapons.js     inventory, hitscan/pierce/projectile weapons, impact pooling
  entities/ai/            pedestrians (flee gunfire), traffic, hostile NPCs, police pursuit
  systems/wanted.js       1-5 star wanted meter + police spawner
  systems/weather.js      clear/rain cycle: fog, lighting, rain particles, wet-road traction
  systems/camera.js       third-person orbit/aim + vehicle chase camera rig
  systems/hud.js          DOM/canvas HUD + minimap
  systems/audio.js        synthesized (no audio files) spatial SFX + 4 labeled radio stations
  systems/particles.js    pooled sprite particles (smoke, muzzle flash, explosions)
  systems/missions.js     contract offers (delivery/demolition/hitman/survival), cash rewards
  systems/touchControls.js  virtual joystick, drag-look, and on-screen action buttons
```

## Systems added on top of the original prototype

- **Weather**: cycles clear/rain on a timer, lerping sky color, fog, and sun
  intensity; rain lowers vehicle traction (`WeatherSystem.traction`), making
  turns/braking looser and drifts trigger more easily — see `systems/weather.js`.
- **Rocket launcher & railgun**: the rocket fires a real simulated projectile
  that flies until it hits something (or times out) and then does splash
  damage; the railgun pierces through the first target into a second one
  behind it. See `WeaponSystem._spawnProjectile` / `_updateProjectiles`.
- **Destructible props**: roadside barrier/crate meshes generated per city
  chunk (`world/city.js`'s `Prop` class) that vehicles smash through at
  speed and weapons can destroy.
- **Chain-reaction explosions**: any vehicle's health can hit zero from
  ramming, gunfire, or another explosion's splash damage; `Game._scanVehicleDestructions`
  catches that transition once per vehicle and detonates it, which can
  itself damage nearby vehicles into exploding on a later frame.
- **Superbike**: a second drivable vehicle (`BIKE` stats in `config.js`) —
  faster, more agile, less durable than the starter car.
- **Vehicle customization**: cycle paint color and a neon underglow color
  while driving any car/bike.
- **Pedestrian flee behavior**: any gunshot or explosion within earshot
  spooks nearby pedestrians into sprinting away from the source for a few
  seconds (`AIManager.notifyGunfire`).
- **Contracts, cash, and death consequences** (`systems/missions.js`): the
  game periodically offers one contract at a time — a delivery (reach a
  marked drop point), a demolition derby (destroy N vehicles), a contract
  hit (eliminate N hostiles), or a "heat wave" (survive N seconds) — each
  with a cash reward and a time limit. Accept with **M**; progress and a
  countdown show in a HUD panel, and the delivery target also appears as a
  beacon in the world and a blip on the minimap. Cash persists across
  reloads via `localStorage`. Dying now actually costs you: it clears your
  wanted level, drops a cut of your cash (a "hospital bill"), and respawns
  you on foot at the plaza — see `Game._onPlayerDeath`.

## Known limitations

This is a prototype, not a finished game: characters/vehicles are primitive
geometry (no rigged models/animations — see the console-loggable state
machine in `entities/player.js` as the hook point for one later), there's no
persistence/save system, and balancing (weapon damage, wanted decay, AI
difficulty) is a first pass tuned in `src/config.js`. It's also
single-player and client-only: there's no multiplayer/crews/heists netcode,
no economy/stock-market/smartphone UI, and no new terrain biomes (beaches,
mountains, airfields) — all of those would need backend infrastructure or
large new art/terrain systems beyond what a coding session can add to an
existing client-side prototype.
