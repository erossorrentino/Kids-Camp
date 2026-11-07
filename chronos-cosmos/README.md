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

It also runs on **phones, tablets and Chromebooks**. Open the same file
in Chrome or Safari, tap **New Journey** and turn the phone sideways. On
touch screens the game goes full screen (where the browser allows it) and
shows on-screen controls. A gamepad works too.

The game picks its graphics level from the device: Mobile on phones, Low
on Chromebooks and tablets, High on desktops. If the frame rate stays
below about 26 fps it steps down by itself, at most twice. You can always
set it yourself in Settings.

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
| Photo mode | V | |

### Touch controls

| Action | Touch |
|--------|-------|
| Move | Drag anywhere on the left side (a stick appears under your thumb). Push it all the way to run |
| Look | Drag on the right side. A quick tap there also strikes |
| Attack · block · parry | **Strike** · **Guard** (tap Guard as the gold glint flashes to parry) |
| Dodge · jump · glide | **Dodge** · **Jump** (tap Jump in mid-air to glide) |
| Spell (hold for the greater spell) · weave | **Spell** · **Weave** |
| Next element · lock on | **Elem** · **Lock** |
| Talk · open · tame | **Use** |
| Healing draught | **Heal** |
| Shift Age (tap) · Age wheel (hold, then push the stick) | **Age** |
| Menu · map · build · stance | Buttons along the top left |
| Photo mode | **Menu**, then **Photo** |

In dialogue, tap the text to continue and tap a reply to choose it.

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

## Climbing

Walk into almost anything to climb it: cliffs, walls, houses, trees, towers.
Climbing drains stamina, so tall towers have places to rest. The Chrono
Spire has golden rings every ten metres in every Age, and the observatory
has a stone band halfway up. At the top of the Spire is a balcony with a
golden spire you can climb to the tip, and from there you can glide down
across the lake. Roofs are walkable slopes, the observatory has a balcony
around a dome you can stand on, and you vault onto knee-to-chest-high
ledges automatically.

## Fun stuff

- **Ziplines** run from the Chrono Spire summit across the lake (228 m), from
  the observatory balcony to the village square, and from each pillar top
  into the valley. Press E at the top anchor. Space lets go early, and
  Space again glides.
- **Sliding.** While running, press C (or tap Dodge going downhill on touch)
  to belly-slide. Hills speed you up, you can steer and jump, and sliding
  into small foes bowls them over.
- **Bounce mushrooms.** Giant red mushrooms (glowing blue in the Age of
  Stars) grow in forests and meadows. Land on one to fly high, then glide.
- **Ring Trials** with bronze, silver and gold medals and saved best times:
  Meadow Dash (run or ride) near where you wake up, Dawnwatch Plunge (glide
  from the pillar) and Spire Dive (glide from the Spire summit). Press E
  right after a run to try again.
- **Combo counter.** Chained hits show a combo, and every 10, 25 and 50
  hits restores Aether.

## Extras

- **Pip the fox.** A fox naps under the trees near where you wake up. Walk
  up and press E to befriend it. Pip then follows you through every Age:
  it trots or sprints to keep up, sits and naps when you rest, and keeps
  back from fights. Every few minutes it digs up a treasure, and its ears
  perk up when an Echo is close. Press E near Pip for a pat.
- **Echoes.** Thirty glowing collectibles are hidden on peaks, in forest
  hollows, near landmarks and on the floating isles. There are ten per
  Age, and each one only shows in its own Age. Close by you'll hear a soft
  chime and see sparkles. Every five found makes the Echoes resonate,
  which raises max health or stamina, or grants skill points.
- **Feats.** Twenty-five achievements in their own menu tab, for things like
  parrying, building, rift runs, taming, Echo hunting and finishing the
  story.
- **Photo mode** (V, or **Photo** in the menu). Time freezes and the HUD
  hides. You get a free camera (drag to orbit, wheel or pinch to zoom,
  WASD to move), time of day, zoom, tilt, vignette, seven filters, poses
  for the Wayfarer (wave, cheer, sit, pray…), and **Save Photo** for a PNG
  with a small caption.
- **Wildlife and ambience.** Each Age has its own fliers: swallows and V
  formations in Bloom, circling vultures in Ash, glowing star-moths in
  Stars. Butterflies flutter on sunny days, fish leap in the lake, leaves
  drift through forests, and white wind streaks show when gliding,
  galloping or in strong wind. A faint rainbow appears after rain.
  Villagers turn their heads to look at you, and you glance back.

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
- Procedural, skinned characters with cloth-simulated capes and faces
  (eyes with irises, brows, a swept fringe) that blink. A soft rim light
  tinted by the sky separates them from the scenery. Weapon trails are
  smoothed into curved, fading ribbons.
- Cloud shadows drift across the land with the wind, and light caustics
  dance on lake and river beds.
- The volcano crater has lava that crusts into dark plates with glowing
  seams. The floating isles have crystal stalactites and hanging roots.

A dynamic-resolution governor lowers the render scale a step at a time
(down to 60%) when frames run long, and raises it again when there is
headroom. Every Age's materials are compiled while loading, so the first
time shift doesn't stutter.

Five quality presets are in Settings. **Mobile** and **Low** skip the
post-processing chain and shadows, render at a lower resolution, use
cheaper terrain, water and sky shaders, and draw less grass and fewer
trees. **Medium**, **High** and **Ultra** add bloom, god rays, shadows and
more foliage. Dynamic lights go through a small fixed pool (2 to 8 real
lights by preset) that follows the camera. That keeps the cost flat and
avoids shader recompiles when torches and spells appear.

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
screenshots of each Age. Phones were checked with Playwright's iPhone 13
emulation (touch input, Mobile preset, about 165 draw calls and 0.6M
triangles per frame) and Chromebooks with a ChromeOS user agent at
1366×768 (Low preset, about 110 draw calls). It hasn't been measured on
real hardware yet. At High the busiest views render about 150–230 draw
calls and ~2.6M triangles per frame. If it stutters on your device, pick
a lower preset in Settings.
