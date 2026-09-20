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
| `K` / `U` / `G` | kingdom shop: buildings / army / garage | | |
| `Esc` | close a panel, release the mouse | | |

**Touch** — a real analogue thumbstick bottom-left, drag anywhere else on
the world to look around, and four buttons bottom-right: `FIRE`, jump,
`E` to act, `F` to ride. The radar does not swallow drags, so the whole
top-right corner still turns the camera. The kingdom shop is a button in
the same corner. Everything inside it scrolls with a finger: the roster,
the 1,008-soldier shop list, the rarity and family filter rows sideways,
the soldier sheet and the buildings tab. Tapping outside the sheet backs
out of it, tapping outside again closes the shop.

**Gamepad** — left stick moves, right stick looks, `A` jumps, right
trigger fires, `X` acts, `B` rides.

## How the game works

**You start with almost nothing.** A small kingdom in the middle of your
home world, 300 coins, one mine, one barracks and no land at all. Five
enemy targets sit in a ring around you, numbered 1 to 5 on the radar and
on signs floating over each one. Attack them in order.

**Coins are only ever earned by winning.** Nothing trickles in. There is
no income per minute and nothing accumulates while you are away: every
coin you spend came out of a battle you won. Your kingdom does not
generate money, it makes victories pay better — the **Treasury** raises
every payout by 12% a level, the **Market** knocks 4% a level off shop
prices, the **Great Hall** adds 4% a level, and each territory you hold
adds another 5%. The HUD shows the running multiplier instead of an
income figure.

**Your kingdom is the shop.** Walk up to it and press `E`. Three tabs:
**Buildings** to grow the kingdom, **Army** to promote units and pick
your battle deck, **Garage** to buy vehicles. `K`, `U` and `G` open it
straight to the tab you want.

**Vehicles are bought, not found.** You begin on foot. The Hoverbike is
300 coins, which is exactly what you start with. The Hovercar is 800. The
Starship is 1,600 and is the only way to reach the other four worlds.
Anything you buy is parked outside your kingdom; walk up and press `F`.

**Battles happen on a lane.** A road runs between your keep and theirs,
lit along both edges and posted at the sides. Both armies are standing on
it from the first second. There is no energy bar, no cards and nothing to
deploy: what you own is what walks out there, and what they have is what
meets it. Whichever side survives the clash pushes on and breaks the other
keep.

**You fight in it, and you can lose without losing.** You are down there
in third person with a blaster. If you are killed the battle does not end
and you do not respawn: the camera lifts into the air and follows the
fight while your army finishes it. Your soldiers are never permanently
lost either, so a defeat costs nothing but time.

**Losing costs nothing.** A failed assault takes no coins, no territory
and no soldiers. The result screen offers **Try again**, which drops you
straight back in from the same approach. Territory you already hold is
yours permanently — nothing ever attacks it back.

**One ladder.** Coins build the kingdom, recruit soldiers and promote
them. Your army starts at five and the War Barracks widens it to sixteen,
so which soldiers you own — and which you dismiss to make room — is the
real decision. Since coins only come from winning, every purchase is
funded by a fight you already took.

**Every world ends with a Warlord.** Take all five territories on a
planet and its **Citadel** appears: a fortress that was not on the map
before. Inside is a named Warlord with its own abilities — ground slams,
volleys, sweeping beams, reinforcement calls. Killing it conquers the
world, and its guard joins your roster as a unique **Trophy** unit you
cannot get any other way. The keep beside it is optional: destroying it
only silences the guns.

**Getting to a new world costs coins.** Buy the Starship, board it, fly to
a world on the galaxy map and hold `E` to chart it. Later worlds are far
more expensive and far more dangerous, and their battles pay accordingly:
a first-world target is worth around 400 coins, the last Warlord over
5,000 before multipliers.

**Progress saves itself.** Every purchase, promotion and won battle writes
to the browser immediately, and a small *Saved* badge flashes in the
corner so you can see it happen. It also saves every twenty seconds, when
the tab loses focus, and when you close it. If a browser blocks saved
data the game says so rather than losing your work quietly.

### Reading the map

Every world uses the same shape, so it only has to be learned once. Five
targets sit evenly spaced in a ring, numbered 1 to 5 clockwise from north.
The middle holds either your kingdom (home world) or the enemy Citadel
(everywhere else). Each objective carries a floating sign with its name
and status, and the radar shows the same numbers, a green house for your
kingdom and a star for the Citadel.

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

## Your army and the shop

You begin with five Common soldiers. The **Recruit** tab of the kingdom
shop sells more, priced from 75 coins for a Recruit up to a few thousand
for a Mythic, and your army grows from five to sixteen slots as the War
Barracks does. Everything you own marches onto the lane together.

Six rarities, cheapest to rarest:

| Rarity | Where it comes from |
|---|---|
| Common | Mark I and II of any family |
| Uncommon | Mark III |
| Rare | Mark IV |
| Epic | Mark V |
| Legendary | Mark VI |
| Mythic | Mark VII, and the five Warlord trophies |

Rarity is never locked behind a building, only behind price, so a Mythic
is on the shop shelf from your first minute if you are willing to save for
it. Buildings unlock new *families* and *traits* instead, widening what
the shop stocks from 14 soldiers at the start to all 1,008.

## The roster: 1,013 soldiers

The roster is generated, not hand-listed, and no axis of it is a reskin.

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

**Upgrades run deep.** Every soldier promotes from level 1 to 20, and at
levels 5, 10, 15 and 20 learns a perk from its family's own line —
armour piercing, twin barrels, arc conduits, shield projectors, rally
banners, launch surges. A level-20 Bulwark is a different unit from a
level-1 Bulwark, not just a bigger one.

The shop stocks 14 soldiers at the start, 140 once the Barracks and Lab
are part-built, and all 1,008 when they are maxed. It has search, rarity
and family filters, four sort orders and a detail sheet per soldier.

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

Touch is verified with trusted input dispatched through the browser's own
input pipeline rather than synthetic events, because synthetic touches do
not drive native scrolling and would have passed while a real finger
failed. Looking, list scrolling, sideways chip scrolling and the
buildings tab were all confirmed that way at 414x896.

Combat is also stepped deterministically at a fixed timestep, which is
how the trait rules were confirmed rather than assumed: leeching heals
its attacker, Frosted applies a real slow, Volatile damages neighbours on
death, Thorned reflects melee, Radiant raises ally damage, Seraphs sit
above the ground, Pyres ignite their targets, and a level-20 unit carries
all four of its perks.

The same harness brackets difficulty. An eleven-soldier mid-game army
beats the first Warlord comfortably; a sixteen-soldier maxed army beats
the last one in about thirty-six seconds having lost seven of its number;
an under-levelled army of eleven loses that fight with the Warlord's
health untouched.

Measured: 61-101 draw calls on a planet surface, ~290 in a battle,
95-170k triangles. The army console keeps only 12 rows in the DOM while
scrolling all 1,013 units. Phone layout verified at 414x896 with no
horizontal scroll. Frame rate was not measured meaningfully because the
test machine has no GPU.
