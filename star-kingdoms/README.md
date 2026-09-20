# Star Kingdoms

A 3D browser game: fly a starship between five planets, take territory in
open battle, and build the kingdom that holds it. No install, no build step
— open `index.html` and play.

![five worlds, one crown](https://img.shields.io/badge/worlds-5-35e0ff)

## Run it

**Easiest:** double-click `index.html`. It runs straight from the file
system — the scripts are plain `<script>` tags, not ES modules, specifically
so this works.

**Or serve it** (identical, just avoids any browser file-access quirks):

```
cd star-kingdoms
python3 -m http.server 8000
# open http://localhost:8000
```

Three.js r128 is pulled from a CDN at startup, so the first load needs an
internet connection. Everything else — every model, texture, sound and
planet — is generated in code at runtime. There are no asset files.

## Controls

| Input | On foot | In a vehicle | In space |
|---|---|---|---|
| `W` `A` `S` `D` | move | throttle / steer | throttle / roll |
| Mouse | look | look | steer the ship |
| `Shift` | sprint | afterburner | boost |
| `Space` | jump | hover thrust | boost |
| Left click | fire blaster | — | — |
| `F` | ride a nearby craft | dismount | — |
| `E` (hold) | assault a territory, board the starship | — | land on a world |
| `K` / `U` | kingdom console / army console | | |
| `1`-`8` | call that unit down to your position (in battle) | | |
| `Esc` | close a panel, release the mouse | | |

Touch works too: drag on the left half to move, the right half to look.

## How the game works

**Territory is the whole economy.** Every planet has five territories held
by its faction. Take one and it pays crystal and alloy every minute,
forever, and your settlement physically grows on the ground you captured.

**Battles are fought, not simulated.** You stand on the field in third
person with a blaster while your army fights around you. Energy refills
over time; pressing `1`-`8` drops that unit at *your feet*, so where you
stand decides where your reinforcements land. Drop too close to the enemy
keep and the drop reroutes home — the red pylons mark that line.

**Two currencies, two ladders.** Crystal builds the kingdom (eight
structures, each gated behind your Command Spire's level). Alloy promotes
your army (eight unit types, each unlocked by a War Barracks level). Your
deck — what you can actually call down mid-battle — is capped by the
Barracks too, so deciding what to leave behind matters.

**Getting to a new world costs crystal.** Fly the starship out to it on the
galaxy map and hold `E` to chart it. Later worlds are far more expensive
and far more dangerous.

### The five worlds

| World | Character | Faction |
|---|---|---|
| **Verdania Prime** | Jungle; spore-lit canopies, mushroom towers | Thornguard Covenant |
| **Emberforge** | Basalt plains split by lava rivers, ash sky | Magma Legion |
| **Cryovault** | Frozen moon under a live aurora, ice spires | Frost Sentinels |
| **Duskara** | Rust dunes and bone arches under two suns | Dune Raiders |
| **Nyxor** | Shattered violet void, floating rock, crystal | Void Syndicate |

Each one has its own terrain generator, palette, weather system, scenery
set, gravity, ambient drone and enemy look. Nyxor's ground is carved into
floating shelves; Duskara's is terraced and wind-rippled; Cryovault's is
terraced ice under animated aurora ribbons.

## What's actually generated

Everything visual. There is not a single model, texture, or audio file in
this repository.

- **Characters** are assembled from primitives at chunky mobile-strategy
  proportions — head about a third of total height, oversized gloves and
  boots. Each one has a real face (skin tone, eyes, brows) inside an open
  helmet with a tinted visor. Rigid pieces are merged into single
  vertex-coloured meshes so one soldier costs 25 draw objects instead of
  45, which is what lets a 26-unit battle stay at ~600 draw calls.
- **Planet surfaces** come from layered value noise: fractal base, ridged
  spines, optional terracing, dune ripples and chasm carving per world.
  The same `heightAt()` the mesh is built from is what the player, the
  hover vehicles and every unit stand on.
- **Scenery** is merged per prop type and drawn with `InstancedMesh`, so a
  planet carrying 900 objects costs a handful of draw calls.
- **Planet globes** on the galaxy map are painted into a canvas from each
  world's own terrain palette, so the map and the surface match.
- **Audio** is WebAudio synthesis — blaster zaps, explosions, UI clicks and
  a three-voice drone pad that retunes to each planet's root note.
- **Bloom** is a hand-written HDR chain (bright pass, two blur octaves,
  ACES tonemap, sRGB encode) because three.js's post-processing add-ons are
  ES-module only and the page deliberately avoids modules.

## Code layout

```
index.html        markup, styling, title screen, script loader
js/core.js        math, seeded noise, WebAudio synthesis
js/data.js        the five planets, unit roster, building tree
js/build.js       geometry merging, characters, weapons, vehicles
js/props.js       scenery, kingdom architecture, territory keeps
js/world.js       terrain, sky, weather, lighting, settlement
js/fx.js          tracers, explosions, dust, damage numbers, health bars
js/player.js      third-person controller, hover physics, camera, input
js/battle.js      territory combat, unit AI, deployment, win/lose
js/galaxy.js      flyable star system and planet travel
js/bloom.js       HDR bloom post-processing
js/ui.js          HUD, radar, kingdom and army consoles, results
js/game.js        renderer, save file, mode machine, frame loop
js/boot.js        title screen and sovereign customiser
```

Your campaign saves to `localStorage` automatically and collects up to
eight hours of offline income when you come back.

## Verification

Driven headlessly with Playwright against software WebGL. Every mode was
exercised: title, all five planet surfaces, both hover vehicles, the
kingdom and army consoles, a full battle through to victory, the galaxy
map, planet-to-planet travel, and a save/reload round trip. Combat was also
stepped deterministically at a fixed timestep to check balance and to
confirm the medic heals, splash weapons hit multiple targets, and the
whole roster builds and fights.

Measured on that pass: 64-101 draw calls on a planet surface, ~600 with 26
units fighting, 100-210k triangles. Frame rate was not measured
meaningfully because the test machine has no GPU.
