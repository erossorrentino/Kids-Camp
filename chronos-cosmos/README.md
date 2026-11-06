# Chronos & Cosmos

An open-world action RPG that runs in the browser. You play the Wayfarer,
a traveller who wakes on the shore of Mirror Lake with an astrolabe that
lets you step between three Ages of the same world:

| Age | Look | What changes |
|-----|------|--------------|
| **Age of Bloom** (the past) | Green meadows, a golden Chrono Spire, Hearthmere full of villagers | Wolves, Thornlings and Gilded Constructs. Varok guards the Shard of Dawn |
| **Age of Ash** (the present) | Red sky, falling ash, dead forests, a dried-up lake you can walk across | Husks, Cinder Hounds, Ember Archers. Morgrath guards the Shard of Embers |
| **Age of Stars** (the future) | Bioluminescent moss, crystal trees, a ringed planet and auroras | Void Wisps, Star Wraiths, Crystal Golems. Floating isles appear in the sky |

Shifting Ages sends a visible wave across the whole landscape: terrain,
grass, trees, water level, sky, buildings, people and enemies all change
as the ring passes them.

## Play it

Open `dist/index.html` in a desktop browser (Chrome, Edge, Firefox or
Safari). It is one self-contained file: no install, no server, no
downloads. Click **New Journey**, then click the game to capture the mouse.
Fonts load from Google Fonts when you're online and fall back to system
fonts offline.

Phones and tablets get on-screen controls and start on Low graphics.
A gamepad works too.

## Controls

| Action | Keyboard & mouse | Gamepad |
|--------|------------------|---------|
| Move / look | WASD / mouse | Sticks |
| Sprint (hold) · Dodge (tap) | Shift | B |
| Jump · climb-jump · glide | Space | A |
| Attack (hold to charge a heavy) | Left mouse | X |
| Block (hold) · Parry (tap at impact) | Right mouse | RB |
| Cast spell (hold for the greater spell) | Q | RT |
| Weave the element into your blade | F | LT |
| Pick element | 1–4 / wheel | D-pad ← → |
| Switch stance (Wind / Stone) | R | R3 |
| Lock on | Tab / middle mouse | LB |
| Shift Age (tap) · Age wheel (hold) | T | D-pad ↑ |
| Interact · talk | E | Y |
| Quick item | G | |
| Sneak | C / Ctrl | L3 |
| Build mode | B | |
| Call your mount | H | D-pad ↓ |
| Map · Journal · Inventory · Menu | M · J · I · Esc | Back · Start |

## How the original design maps to the game

- **Exploration**: a 1.6 km procedural world with mountains, the Redstone
  mesas, the Thornwood forest, a volcano and a central lake. You can climb
  almost any steep surface (stamina wheel, slippery in rain), glide, swim,
  and ride updrafts from fire. Three Sun Pillars reveal the map. 30 Star
  Motes and a dozen chests are hidden around the Ages.
- **Combat**: weighty three-hit combos, charged heavies, plunge attacks,
  sprint thrusts, block and frame-tight parries, i-frame dodges. Enemies
  telegraph with a **gold glint** (parry it) or a **red glint** (dodge it).
  Break an enemy's posture for a cinematic Chrono Strike. A last-instant
  dodge triggers Timeslip slow motion. Two martial stances change speed and
  power.
- **Elemental magic**: Ember, Frost, Storm and Chrono run on regenerating
  aether, which melee hits and parries refill. There are no cooldowns.
  Elements combine into reactions (Thermal Shock, Plasma Burst,
  Shatterstorm, Time Fracture). Frost freezes water into walkable ice. Fire
  on the ground lifts your glider.
- **Bosses**: Varok, Morgrath, Nyxara and the Chronarch, each with two or
  three phases, arena fog walls and intro cutscenes. The final fight shifts
  the Age between phases.
- **Story and choices**: a four-act main quest, branching dialogue with
  companion approval (Lyra in Bloom, Kael in Ash, Oriel in Stars), a
  faction dilemma, time-causality choices (bury Lyra's journal or send it
  away; plant a seed in the past and climb the giant tree it becomes), and
  four endings. One of them only unlocks if all three companions trust you.
- **Building**: place planks, stone, crystal glass, stairs, lanterns, spike
  traps, bounce pads, campfires and explosive barrels anywhere. Every block
  needs a path to the ground within its span, so overhangs collapse and
  falling stone crushes enemies. Fire spreads through wood.
- **Crafting**: brew tonics, forge four swords and four armour sets, and
  upgrade your glider and stamina. You gather materials by felling trees,
  breaking rocks, mining crystals and defeating enemies.
- **Rifts**: three portals lead to a survivor-style arena. Your weapons fire
  on their own against hundreds of foes. You level up mid-run and pick from
  three upgrades, then face the Rift Warden at 2:30. Rift tiers scale up,
  and Star Shards buy permanent boons.
- **Mounts**: sneak up on a wild Duskhorn, hold on through the bucking, and
  it follows you through every Age.
- **Living world**: villagers follow day schedules, react to the weather,
  to your drawn sword and to nearby monsters, and greet you. There's a full
  day/night cycle with weather per Age (rain, storms, ashfall, ember storms,
  meteor showers, auroras).

## Graphics

Everything is generated in code. There are no image, model or audio files.

- Analytic sky with clouds, stars, Milky Way, moon, nebula, a ringed planet
  and auroras, plus image-based lighting baked from it.
- Exponential height fog with sun in-scattering, patched into every
  material.
- Terrain shader with per-Age palettes, strata, ember veins, crystal veins,
  bioluminescent specks, wetness in rain and procedural detail normals.
- About 135k GPU-placed grass blades that sway in gusts and part around
  the player. Instanced forests with wind, translucency and epoch morphing.
- Water with depth-based transparency, Fresnel sky reflection, foam,
  bioluminescence, rain ripples and freezable ice.
- ACES tone mapping, bloom, god rays, chromatic aberration, a time-shift
  ripple, vignette, film grain and FXAA.
- Procedural, skinned characters with cloth-simulated capes, weapon trails,
  particles and dynamic lights.

Four quality presets (Low to Ultra) are in Settings.

## Audio

Also fully procedural, using the Web Audio API. The score is generative
with a separate mode and scale per Age, adds taiko-style percussion when
enemies notice you, and adds choir pads for bosses. Rifts get their own
synth track. There are about 80 synthesized sound effects, positional
footsteps per surface, and ambient wind, birds, crickets, rain and lava.

## Project layout

```
src/
  core/    renderer + post, input (kb/mouse/gamepad), camera, collision,
           noise, procedural textures, shader helpers, audio
  world/   world map + terrain, sky/atmosphere, water, foliage, epochs,
           epoch manager, structures + content placement, weather, world zones
  actors/  rig (humanoid skinned rig + animation library), quadruped rig,
           player, enemies + spawner, bosses, NPCs, mounts
  combat/  combat (damage, posture, reactions, projectiles), magic
  fx/      particles, ambient fields, trails
  game/    game state + saves, items, quests, dialogue, story data + glue,
           cutscenes, building, rifts
  ui/      HUD, menus, icons, touch controls, stylesheet
build.mjs  bundles everything (three.js included) into dist/index.html
tools/     headless screenshot/test harness (Playwright)
```

## Building

```
npm install
npm run build        # minified dist/index.html
npm run build:dev    # readable bundle for debugging
```

`node tools/shot.cjs <outdir> <steps.json>` drives the built game in
headless Chromium. Open the page with `?manual` and it exposes
`window.__cc_step(frames)`, so a test can step the simulation and take
screenshots.

## Testing notes

The game was developed and checked in headless Chromium with software
WebGL. That covers loading, every system, a scripted playthrough of the
full main story (all four acts, the final boss's phase shifts and the
ending), the boss, rift, building-collapse and mount flows, and
screenshots of each Age. It hasn't been measured on real GPUs yet. In the
busiest views it renders about 150–230 draw calls and ~2.6M triangles per
frame at High. If it stutters on your machine, use Medium or Low in
Settings.
