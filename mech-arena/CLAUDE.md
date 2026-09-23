# Working on Iron Vanguard

A browser 3D mech arena in `mech-arena/`. No build step, no engine install,
no art assets — Three.js r180 is vendored and everything else is generated
at runtime. Read `README.md` first; this file is the short version of how
to change it without breaking it.

## Run and test

```bash
cd mech-arena
python3 -m http.server 8000      # ES modules need an origin, not file://

./tools/test.sh                  # everything, in order
./tools/check.sh                 # full ESM parse of every module
node tools/validate.mjs          # data cross-references, no browser
node tools/smoke.mjs             # boot, menus, matches, screenshots
node tools/mobile.mjs            # phone/tablet layout + touch, on pixels
node tools/handling.mjs          # the stick: 8 directions, turns at speed
node tools/sim.mjs               # headless combat on all 41 arenas
node tools/circuit.mjs           # a tournament end to end
node tools/leak.mjs              # resource leaks across ten matches
```

The browser tools need Playwright and a Chromium build; set `CHROME_BIN` if
yours is elsewhere. Screenshots land in `$SMOKE_OUT` (default
`/tmp/claude-0/shots`).

## Things that will catch you out

- **`node --check` does not fully parse ESM.** It validates the module
  record and lets real expression-level syntax errors through. Use
  `./tools/check.sh`, which compiles with `vm.SourceTextModule`.
- **A test that never renders cannot see GPU state.** `renderer.info` only
  counts what has been uploaded. `tools/leak.mjs` passed with its target bug
  reintroduced until it was made to draw a frame. Check a new test against
  the bug it is for.
- **Screenshots hide logic bugs and logic tests hide visual ones.** The
  canyon arenas were unwinnable and three game modes had no legal arena;
  both were invisible in screenshots. The hangar's 3D bay was covered by an
  opaque menu background for most of development and no amount of inspecting
  the scene graph would have shown it.
- **Lights are physical.** Intensity is divided by distance squared, so a
  key light twenty-five metres out needs thousands, not hundreds.
- **Metals need an environment.** A `MeshStandardMaterial` with high
  metalness and no `scene.environment` renders black. `Engine.applyBiome`
  builds one per biome and `buildStudioEnvironment` covers the menus.
- **CSS silently takes the last duplicate declaration.** The ability panel
  declared `position` twice and rendered in the wrong corner for days.
- **Test the page the player actually loads.** The Artifact host wraps the
  published fragment in its own document with a light background, so a
  canvas that never paints reads as a white screen. `tools/mobile.mjs`
  serves that exact skeleton and decodes the screenshot rather than
  trusting the scene graph.
- **A layout that works on a desktop can bury the game on a phone.** The
  hangar's three columns collapsed into one below 880px and the panels
  stacked over the bay, so the mech was off screen while every structural
  check still passed. The camera now frames into a measured rectangle
  (`menus._stageRect()` -> `hangarScene.setStage()`), which is why the
  narrow layout has to reserve one.
- **Browser tests must wait on game time, not wall time.** Under the
  software renderer a frame can take a second or more, and `MAX_FRAME`
  caps each one at 50ms of simulation, so "hold the stick for two seconds"
  can be a twentieth of a second of play. `mobile.mjs` has `simWait()`,
  which polls `match.time`; a leg-steering check failed on exactly this
  while the steering itself was correct.
- **`align-items:start` collapses an empty grid item to nothing.** The
  stage rectangle measured zero height until the narrow layout stretched
  its rows.
- **A white screen is usually a lost WebGL context.** The canvas is
  transparent while the context is away, so the page behind it shows
  through. `canvas#viewport` paints its own dark background, `Engine`
  calls `preventDefault` on `webglcontextlost` so the browser gives it
  back, and `Game._wireContextLoss` drops to the lightest preset and
  carries on.
- **On a phone the texture budget is the constraint, not the frame rate.**
  Sixteen 512px surface sets plus thirty-two painted skins is most of a
  phone's texture memory. `QUALITY` presets carry `tex`/`sets`/`skin`/
  `skins`, `suggestQuality()` picks one from the device, and the budget is
  applied between matches -- resizing throws the caches away, which must
  not happen under a live match.

## Rules the code follows

- The simulation never special-cases content by name. `combat.js` reads a
  weapon's fields and has no idea what an AC/20 is.
- Bots and the player write the same intent fields and run the same physics,
  heat and weapon code. Difficulty buys reaction time and aim error, never
  damage or armour.
- Keyboard, mouse steering and the on-screen controls all write the same
  intent through `Input`; nothing downstream knows which one is in use.
- Handling that differs by device lives in `PlayerController`, not in the
  mech: `moveStyle` ('strafe' in the legs' frame, 'steer' in camera space
  with `mech.moveWorld`), `aimAssist` and `autoFire`. Under `moveWorld` the
  mech splits its velocity into along-heading (chassis acceleration: weight
  sets how fast it gets going) and sideways slide (bled off fast), and the
  legs turn at no less than `STEER_TURN`; weight decides speed, never which
  way it goes. `tools/handling.mjs` holds a light and an assault to that. `Game._applyHandling`
  resolves the three 'auto' settings from whether the stick is up. Bots are
  untouched by all of it.
- Rarer is better and rarer costs more, strictly. Prices come from rarity
  bands (`data/rarity.js`), not from hand-typed numbers, and
  `validate.mjs` fails the build if a lower grade ever costs more than a
  higher one. Bot weapon rarity is capped to the player's lance.
- Generated content is deterministic: arenas from a seed, skins from a hash.
- Nothing allocates during a match. Particles, tracers, beams, decals and
  projectiles all come from preallocated pools.
- Anything that owns GPU resources has a `dispose()` and match teardown
  calls it. Caches are capped and evict the oldest.

## Where things live

`src/data/` is pure data — adding a weapon, chassis, ability, arena, mode
or tournament is a row in the relevant file and nothing else. `src/world/`
generates geometry and textures. `src/game/` is the simulation.
`src/ui/` is everything a player reads. `src/core/` is the renderer, input
and the synthesised audio mixer.

Balance reasoning, including the numbers and why they are what they are,
is in `docs/BALANCE.md`.
