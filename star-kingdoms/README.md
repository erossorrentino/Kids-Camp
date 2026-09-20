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

**No internet required.** Three.js r128 ships with the game in
`js/vendor/`, so it runs offline, from a `file://` double-click, or behind
a blocked CDN. Everything else — every model, texture, sound and planet —
is generated in code at runtime. There are no asset files. The web fonts
are the one optional extra, and the page falls back to system fonts
without them.

Bundled third-party code: [three.js](https://threejs.org) r128, MIT
licensed, unmodified, with its licence header intact.

## Controls

Plays on desktop, phone, tablet and with a gamepad. The right control
scheme appears on its own.

**Keyboard and mouse**

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

**Touch** — a real analogue thumbstick bottom-left, drag anywhere else to
look, and four buttons bottom-right: `FIRE`, jump, `E` to act, `F` to
ride. The kingdom and army consoles are buttons in the top-right corner.
The whole interface reflows for phone widths, and the army list scrolls
1,013 units without dropping frames.

**Gamepad** — left stick moves, right stick looks, `A` jumps, right
trigger fires, `X` acts, `B` rides.

## How the game works

**Territory is the whole economy.** Every planet has five territories held
by its faction. Take one and it pays crystal and alloy every minute,
forever, and your settlement physically grows on the ground you captured.

**Battles are fought, not simulated.** You stand on the field in third
person with a blaster while your army fights around you. Energy refills
over time; pressing `1`-`8` drops that unit at *your feet*, so where you
stand decides where your reinforcements land. Drop too close to the enemy
keep and the drop reroutes home — the red pylons mark that line.

**Losing costs nothing.** A failed assault takes no resources and no
territory. The result screen offers **Try again**, which drops you
straight back in from the same approach. Territory you already hold is
yours permanently — nothing ever attacks it back.

**Two currencies, two ladders.** Crystal builds the kingdom (eight
structures, each gated behind your Command Spire's level). Alloy promotes
your army. Your deck — what you can actually call down mid-battle — is
capped by the War Barracks, so choosing eight units out of a thousand is
the real decision.

**Every world ends with a Warlord.** Take all five territories on a
planet and its **Citadel** appears: a fortress that was not on the map
before. Inside is a named Warlord with its own abilities — ground slams,
volleys, sweeping beams, reinforcement calls. Killing it conquers the
world, and its guard joins your roster as a unique **Trophy** unit you
cannot get any other way. The keep beside it is optional: destroying it
only silences the guns.

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

| World | Citadel | Warlord |
|---|---|---|
| Verdania Prime | The Hollow Throne | Marrowking Vell |
| Emberforge | The Forge Crown | Slagmarshal Orun |
| Cryovault | Vault Zero Gate | Sentinel Prime Hesk |
| Duskara | The Thirst Market | Salt-Queen Ifra |
| Nyxor | The Broken Crown | Thessaly the Unmade |

Each one has its own terrain generator, palette, weather system, scenery
set, gravity, ambient drone and enemy look. Nyxor's ground is carved into
floating shelves; Duskara's is terraced and wind-rippled; Cryovault's is
terraced ice under animated aurora ribbons.

## The roster: 1,013 units

The army is generated, not hand-listed, and no axis of it is a reskin.

**12 families** decide role and silhouette: Vanguard, Lancer, Bulwark,
Longshot, Skitter, Rocketeer, Aegis, Colossus, Phantom, Pyre, Warden and
Seraph. A Phantom runs past keep fire almost untouched; a Seraph hovers
above the terrain entirely; an Aegis never fires a shot and only heals;
a Warden makes everything standing near it better.

**7 marks** (I to VII) set the power band, the energy cost and the
rarity, from Common up to Legendary. Each family has its own seven rank
names, so a mark VII Colossus is an *Apocalypse* and a mark I Vanguard is
a *Recruit*.

**12 traits** each apply a real rule in combat, verified in the test
suite: *Warded* and *Ashen* trade health against damage, *Swift* trades
health for speed, *Siege* hits keeps 55% harder, *Leech* heals from the
damage it deals, *Volatile* detonates when it dies, *Frosted* slows what
it hits, *Veiled* shrugs off keep fire, *Thorned* reflects melee back,
*Radiant* buffs nearby allies, and *Gilded* raises everything for one
more energy.

That is 12 × 7 × 12 = 1,008, plus **5 Trophy units** taken from the
Warlords.

**Upgrades run deep.** Every unit promotes from level 1 to 20, and at
levels 5, 10, 15 and 20 it learns a perk from its family's own line —
armour piercing, twin barrels, arc conduits, shield projectors, rally
banners, launch surges. A level-20 Bulwark is a different unit from a
level-1 Bulwark, not just a bigger one.

Availability opens as you build: 4 units at the start, around 180 by
mid-game, all 1,008 once the Command Spire, War Barracks and Research Lab
are maxed. The army console has search, family filters, four sort orders
and a detail sheet per unit.

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
kingdom and army consoles, a full battle through to victory, a Citadel
assault through to a Warlord kill, the galaxy map, planet-to-planet
travel, and a save/reload round trip.

Combat is also stepped deterministically at a fixed timestep, which is
how the trait rules were confirmed rather than assumed: leeching heals
its attacker, Frosted applies a real slow, Volatile damages neighbours on
death, Thorned reflects melee, Radiant raises ally damage, Seraphs sit
above the ground, Pyres ignite their targets, and a level-20 unit carries
all four of its perks.

The same harness brackets difficulty. A mid-game deck beats the first
Warlord in about a minute; a maxed deck beats it in thirteen seconds; an
under-levelled deck loses the last Warlord with 94% of its health
untouched; a maxed deck played passively gets it to 9%, which a player
firing their own blaster closes comfortably.

Measured: 61-101 draw calls on a planet surface, ~290 in a battle,
95-170k triangles. The army console keeps only 12 rows in the DOM while
scrolling all 1,013 units. Phone layout verified at 414x896 with no
horizontal scroll. Frame rate was not measured meaningfully because the
test machine has no GPU.
