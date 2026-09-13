# Crime City — Three.js Open World Prototype

A single-page, dependency-free (besides a vendored Three.js) open-world
prototype: procedural streaming city, on-foot + vehicle + helicopter + jet
controllers, shooting, ambient AI, and a wanted/police pursuit system.

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

- **WASD** move / drive / fly, **Shift** sprint (heli: ascend), **Space**
  jump (heli: descend)
- **Mouse** look (third person, orbit/aim), **RMB** aim down sights
- **E** enter/exit vehicles, aircraft
- **1/2/3** or mouse wheel: switch weapon, **LMB** fire, **R** reload
- **T** toggle radio station (while driving)
- Helicopter: **Q/E** yaw. Jet: **A/D** roll (banks turn the plane),
  **Arrow keys** or **Q/E** pitch/yaw, **W/S** throttle

## Code layout

```
src/
  config.js            tunable constants for every system
  input.js              keyboard/mouse/pointer-lock state
  game.js                orchestrator: control-mode state machine, wiring
  main.js                boot entry point
  world/city.js          chunked procedural city streaming (instanced buildings, roads)
  world/collision.js     shared AABB collision helpers
  entities/player.js      capsule controller, gravity/jump, anim state machine
  entities/vehicle.js     arcade car physics (drift, collisions), shared by traffic/police AI
  entities/aircraft.js    helicopter + jet flight models
  entities/weapons.js     inventory, raycast shooting, impact pooling
  entities/ai/            pedestrians, traffic, hostile NPCs, police pursuit
  systems/wanted.js       1-5 star wanted meter + police spawner
  systems/camera.js       third-person orbit/aim + vehicle chase camera rig
  systems/hud.js          DOM/canvas HUD + minimap
  systems/audio.js        synthesized (no audio files) spatial SFX + radio
  systems/particles.js    pooled sprite particles (smoke, muzzle flash, explosions)
```

## Known limitations

This is a prototype, not a finished game: characters/vehicles are primitive
geometry (no rigged models/animations — see the console-loggable state
machine in `entities/player.js` as the hook point for one later), there's no
persistence/save system, and balancing (weapon damage, wanted decay, AI
difficulty) is a first pass tuned in `src/config.js`.
