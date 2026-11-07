# Driftlands

A 3D open-world airship adventure on a shattered world of floating islands
above an endless Storm. Captain a small airship, explore islands, rescue
survivors, and slowly turn your ship into a flying home.

**Play:** open `dist/driftlands.html` in a desktop browser (Chrome, Edge,
Firefox or Safari). It's one self-contained file — no install, no server, no
internet connection needed. Click the game to capture the mouse.

Core loop: **sail out → explore an island → find loot and survivors → upgrade
the ship → reach farther, stranger islands.**

## What's in the game

| Pillar | How it plays |
|---|---|
| **Movement is fun on its own** | Run, double-jump, a third press opens a paraglider. Grapple hook (RMB/Q) onto any rock, ruin, or your own ship (even its balloon). Wall-run along ruin walls and cabins (hold W), then wall-jump. Updraft vents and the heat from fires lift your glider. Explosions can rocket-jump you. |
| **See it, go there** | Every island on the horizon is real and reachable. Survivors stand under tall coloured light beams; shards hide on tower tops, floating above islands, and under each island's rocky tip. Stepping-stone islets connect neighbours. |
| **Systemic world** | Fire spreads tree-to-grass across islands, faster downwind, slower in rain, and regrows later. Wind pushes gliders and moving ships. Rain soaks enemies, so shock arrows arc through *every* wet foe. Lightning (telegraphed by a crackling glow) strikes and can start fires. |
| **Easy-to-learn, deep combat** | One bow, three elements (1/2/3): arrows, fire (burn and ignite), shock (stun and chain). Shoot an oil barrel to burst it into an oil cloud, then send a fire arrow through it. Knock husks off the edge into the Storm. Hold to charge shots. |
| **A base that moves** | Your airship is walkable while it flies. Every rescued survivor adds a cabin on new side-decks; build a Garden (heals you aboard) and a Crow's Nest (minimap range, and a great diving board). |
| **Characters you collect** | 8 survivors (Mechanic, Gardener, Tinker, Cartographer, Cook, Aeronaut, Rigger, Smith). Each unlocks a system and has a questline with a unique reward (afterburner, piercing arrows, glider dash, etc.). |
| **Roguelite thrills** | Sink your ship into a 🌀 Storm Rift to start a 2.5-minute **Storm Dive**: a randomized realm with 2 random modifiers (Thunderhead, Gale Force, Swarm, Rich Veins, Blind Storm, Fragile Hull). Grab Storm Cores and fly into the golden beam to escape. If the storm collapses you keep half; if you're wrecked you keep nothing. Cores gate the top engine/hull upgrades. |
| **The world changes** | Every ~2 minutes an island cracks, sinks into the Storm (carrying you with it if you're standing on it), and a brand-new island rises somewhere else. Weather cycles between clear, windy and thunderstorms, with a full day/night cycle. |

**Rules followed:** short sessions still matter (autosave every 20 s; every
chest, survivor and dive moves you forward; a goal tracker always says what to
do next). No pay-to-win: there are no purchases at all, and balloon paints are
cosmetic and earned in play. Every system feeds the loop: the engine sets your
travel range, Storm Cores unlock the engine/hull tiers, survivors unlock
upgrade lines, and quests send you back out exploring.

### Not included: co-op
Drop-in online co-op (1–4 players, docking ships together) needs a
networking/relay server, which a self-contained offline file can't provide.
The game is single-player for now. The simulation is in one place
(`Game.update`), so it's a sensible place to add networked state later.

## Controls

| On foot | |
|---|---|
| WASD / Shift | move / sprint |
| Space | jump · again to double-jump · again to glide (W dives, S flares) |
| Mouse / LMB | look / hold and release to fire the bow |
| RMB or Q | grapple (Space to jump off the line) |
| 1 / 2 / 3, mouse wheel | arrow element |
| E | interact (helm, chests, survivors, crew, workshop) |
| B | workshop (while aboard) |
| R | whistle: your ship autopilots to you |
| M / Esc | mute / pause and settings |

| At the helm | |
|---|---|
| W / S | throttle |
| A / D | steer |
| Space / Shift | rise / sink (sink into a Rift to Storm Dive) |
| F | afterburner (Pip's quest reward) |
| E | leave the helm |

The pause menu has mouse sensitivity, invert-Y, mute, and a **Performance mode**
(no shadows or bloom, lower resolution) for older machines. Resolution also
adapts automatically to keep the frame rate up.

## Graphics

Three.js (WebGL 2) with ACES tone mapping, a 4× MSAA HDR render target and
bloom, soft PCF shadows that follow the player, and exponential fog. Shaders
are custom: a procedural sky with sun, stylized clouds, stars and moon; an
animated domain-warped Storm sea with lightning glow and swirling rifts; and
instanced billboard cloud banks. Low-poly islands are generated procedurally
(terrain, rock strata, trees, grass, ruins, crystals) with five biomes that get
stranger the farther out you fly. All models are built in code and all sound is
synthesized live with Web Audio, so there are no external assets.

## Development

```
cd Driftlands
npm install
npm run build              # bundles src/ → dist/driftlands.html
node test/logic.mjs        # deterministic gameplay checks (sim-stepped)
node test/smoke.mjs        # real-time play-through; fails on any console error
node test/shots.mjs        # renders curated screenshots to test/shots/
```

The tests use Playwright with headless Chromium (software WebGL).

| File | Contents |
|---|---|
| `src/main.js` | game loop, states, interaction, post-processing, adaptive resolution |
| `src/world.js` | sky, Storm sea, clouds, day/night, weather, wind, rain, lightning |
| `src/islands.js` | procedural islands, props, loot, fire fuel graph, sinking and rising |
| `src/ship.js` | airship model, flight, walkable deck, cabins/garden/lookout |
| `src/player.js` | movement (jump, glide, grapple, wall-run), helm, camera |
| `src/combat.js` | bow and elements, enemies, fire spread, oil and explosions |
| `src/storm.js` | roguelite Storm Dives |
| `src/progress.js` | save, survivors and quests, upgrades, loot |
| `src/ui.js` | HUD, compass, minimap, menus, dialogs |
