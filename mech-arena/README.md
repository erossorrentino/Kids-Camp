# TITAN CLASH

A 3D mech battle arena that runs in a browser. No engine to install, no
build step, no art pipeline — open `index.html` and you are piloting a
forty-ton war machine.

Every mech, weapon, arena and paint scheme in the game is generated at
runtime from data. There is not a single model, texture or sound file in
this repository; the whole thing is about 11,000 lines of JavaScript and a
vendored copy of Three.js.

```
37 chassis   ·  302 weapons  ·  22 abilities  ·  2,496 paint schemes
41 arenas    ·  10 biomes    ·  8 game modes  ·  12 pilots, 20 implants
5 tournament circuits with locked lances, purses and trophies
```

Chassis come on two legs, bird legs, six-point spider legs — and four,
which changes how a machine reads and how it plays: a quadruped cannot
punch or jump, but nothing knocks it down and it is the steadiest gun
mount in the game.

---

## Running it

The game needs to be served over HTTP (ES modules will not load from
`file://`). Any static server works:

```bash
cd mech-arena
python3 -m http.server 8000
# then open http://localhost:8000
```

There is nothing to install. Three.js r180 is vendored in `vendor/`, so the
game also works with no network connection at all.

**Recommended:** a discrete GPU or recent integrated graphics. The game
ships an adaptive quality controller that drops the preset a step when
frame times stay poor, so it degrades rather than stutters.

---

## Controls

| Action | Key |
| --- | --- |
| Walk | `W` `A` `S` `D` |
| Aim / fire | mouse / left button |
| Zoom | right button, or `V` to toggle |
| Jump jets | `Space` |
| Chassis ability | `Q` |
| Melee (punch / kick) | `R` |
| Select weapon | `1`–`6`, or the mouse wheel |
| Fire group Alpha / Beta / All | `Z` / `X` / `C` |
| Auto-fire | the AUTO button, or Settings → Controls |
| Cockpit ↔ chase view | `F` |
| Brace, or force a hot restart during shutdown | `Shift` |
| Scoreboard | `Tab` |
| Manual reactor shutdown | `P` |
| Pause | `Esc` |
| Toggle the FPS readout | `` ` `` |

Click the viewport to capture the mouse. Where pointer lock is unavailable —
an embedded frame without permission for it — aiming falls back to steering:
move the cursor toward an edge of the view to swing the torso that way.

### On a phone, tablet or Chromebook

Touch devices get on-screen controls instead: a stick on the left walks,
dragging anywhere else on the view aims, and the pad on the right holds the
trigger, the jets, the chassis ability, melee, zoom, target lock and
fire-everything. The in-match readouts move to the top of the frame so the
bottom corners stay clear for thumbs.

A Chromebook or a laptop with a touchscreen reports a mouse as well, so it
does not look like a phone until somebody taps the screen — the first touch
turns the controls on. Settings → Controls has the switch if you would
rather have them always on, always off, and a separate look speed for
dragging.

The stick **steers**, the way every arena mech game's stick does: it points
where the machine should go in camera space and the legs turn to follow, so
pushing left walks left across the screen whichever way the torso happens
to be aimed. A keyboard keeps the simulation convention — forward is where
you look, `A` and `D` sidestep — and Settings → Controls → MOVEMENT forces
either one.

Two more things come on with a stick, because a thumb cannot track a
running mech the way a mouse can:

- **Aim assist** bends the aim toward a hostile that is *already* near the
  crosshair, and leads its movement. Past a few degrees off it does
  nothing — it steadies a near miss, it does not find targets.
- **Auto-fire** hands the trigger to the targeting computer: the guns fire
  whenever the reticle is on a hostile. Heat and ammunition still apply, so
  holding an alpha strike on a hot build still scrams your reactor. The
  AUTO button toggles it mid-match.

Both default to on for touch and off for a mouse, and both are three-way
settings (`AUTO` / on / off).

The hangar reshapes itself as well. Below 880px it becomes a fixed frame:
the bay keeps a band across the top with the mech standing in it, and one
panel at a time — CHASSIS, LOADOUT, or neither under VIEW MECH — scrolls
underneath. The camera frames the mech into whatever rectangle the layout
leaves clear, so it is on screen at every width.

### Weak devices

The preset is chosen for the machine on first run — a phone, a small
tablet or a four-core laptop starts on **low**, which shrinks the generated
textures (256px instead of 512px) and how many stay resident, not just the
shadows and the bloom. That budget is the thing that matters: running out
of texture memory does not make a phone slow, it takes the WebGL context
away, and a canvas without a context is transparent, which on a light page
reads as the screen going white.

If the context is lost anyway the game says so, waits for it, comes back at
the lightest preset and keeps playing. If it never comes back there is a
panel with a reload button and a *reload in low graphics* button that
writes the preset into the saved profile first. Picking a preset by hand in
Settings turns the automatic choice off for good.

---

## How the game plays

Four systems carry the whole design. Everything else is content hung off
them.

**Heat is the real ammunition.** Every weapon adds heat and your sinks only
shed so much per second. Cross the red line and the reactor scrams: no
movement, no weapons, for about three seconds, which is a very long time.
The hangar tells you your build's sustained heat against your sink rating,
so you can choose deliberately between a build you can hold the trigger on
forever and a build that wins one exchange and then has to walk away.

**Armour is per section.** Head, centre torso, two side torsos, two arms,
two legs — each with its own armour plate and internal structure. Strip a
side torso and the weapons mounted in it are gone with it. Destroy a leg
and the mech limps at half speed. Damage that overflows a destroyed section
rolls into the centre torso at half value. The paper doll in the corner is
the target you are shooting, not a single health bar. And a section holding
live rounds **cooks off** when it dies, detonating into the centre torso —
so a full ammunition bin is a liability you choose to carry.

**The legs lag the torso.** The torso twists independently of the hips, and
the hips turn at the chassis's rate, not yours. A hundred-ton Annihilator
that has committed to a direction cannot simply reverse. This is what makes
a mech feel like a mech rather than a first-person shooter body, and it is
the source of most of the tactical depth: you can retreat without giving up
your guns, and so can they.

**One ability, used at the right moment.** Every chassis carries exactly
one special and it defines how that chassis plays. Bulwark before you peek,
not after you are hit. Shoulder-charge when they are reloading. Stomp when
a light closes to knife range. Between two pilots of the same rank, ability
timing is most of the gap.

Three things sit on top of those: **melee** (`R`) for when something is
already inside your reach, **resupply pads** that pull a stalled fight back
into motion, and **weapon convergence** — hardpoints are metres apart on a
mech's body, so fire control angles every barrel at what you are actually
aiming at rather than firing them all parallel.

`F` switches to the **cockpit**, which is a real canopy: struts, a
dashboard with live structure, heat and jet strips, and side consoles that
sway as the mech walks. It is harder to fly and much better for gunnery.

Destroyed mechs leave **wrecks** on the field, burning for a while and then
going cold — the map tells you where the fighting has been. Your lance
talks: bots call contacts, announce a zone falling, and say when they are
breaking off, which is the only way a solo pilot hears what the rest of
the team is doing.

After the match you get your **gunnery record**: shots fired, shots on
target, accuracy, damage per shot and which weapon actually did the work.
Continuous-fire weapons are excluded from the count, because a beam that
ticks twenty times a second would bury everything else.

---

**Rarity.** Every gun and every chassis is Common, Rare, Epic, Legendary or
Mythic — grey, blue, purple, gold, red, with one to five stars. Rarer is
better and rarer costs more, without exceptions: every Rare costs more than
every Common, and a rarer gun hits harder than the same gun a grade down.
Bots carry guns of about your own grade, so buying better kit makes you
stronger rather than making the enemy stronger with you.

## Game modes

| Mode | Shape | Notes |
| --- | --- | --- |
| Training Range | 1 vs 6 targets | Passive target mechs and a ten-step tutorial |
| Team Deathmatch | 5v5, 5 min | Thirty kills or highest score at the horn |
| Duel | 2v2, 4 min | Tight maps; your loadout choices are the whole match |
| Free For All | 8 pilots | Twenty kills or top score |
| Control Point Clash | 5v5, 6 min | Three zones tick up your score |
| Hardpoint | 5v5, 5 min | One live zone that relocates every sixty seconds |
| Last Lance | 5v5, 7 min | No respawn timer — your hangar is your lives |
| Juggernaut | 5v5, 5 min | One pilot per team is worth double and has double armour |

Every arena hosts every competitive mode; the Training Range runs on the
four widest, most open maps.

## Circuits

Five tournament circuits, from the free Rookie Circuit up to the Legend
Gauntlet. A circuit is a fixed run of three to five matches against
escalating opposition:

- You enter with the lance you have and **it is locked for the whole run** —
  editing your hangar afterwards does not change it.
- A **loss ends the run**. You keep what you earned in the rounds you won.
- Finishing one pays a purse far above the same number of casual matches
  and grants a trophy you cannot buy: a paint scheme, or a chassis.

---

## Accessibility

Settings → Accessibility covers:

- **Team colours**: the default blue/orange, plus deuteranopia (blue/yellow),
  tritanopia (magenta/green) and a high-contrast white/red pair. The palette
  drives the HUD immediately and mech accent lighting from the next match.
- **Interface scale**, 80–150%.
- **Screen shake**, 0–150% — set it to zero if motion is a problem; nothing
  else in the game depends on it.
- **Damage numbers** and **nameplates** can each be turned off.

---

## Architecture

```
index.html          shell: canvas, HUD skeleton, import map
styles.css          HUD and menu styling
vendor/             Three.js r180 + the postprocessing addons (MIT)

src/
  main.js           app state machine, fixed-step loop, adaptive quality
  core/
    engine.js       renderer, lights, IBL environment, post chain
    input.js        keyboard, pointer lock, steering and touch intent
    audio.js        fully synthesised WebAudio mixer — no audio files
    rng.js          seeded PRNG and frame-rate-independent maths helpers
  data/             pure data, no behaviour
    weapons.js      42 archetypes x a variant ladder = 302 weapons
    mechs.js        34 chassis: armour spread, thermals, hardpoints
    abilities.js    22 abilities as activate/tick/end hooks
    pilots.js       12 pilots, 20 implants, one modifier bag
    skins.js        colourway x pattern x finish
    maps.js         41 arenas as (seed, biome, layout) triples
    modes.js        rule sets
    tournaments.js  circuit ladders, purses and trophies
  world/
    arena.js        deterministic level generation + collision + raycasts
    mechBuilder.js  procedural rigged mech models from primitives
    weaponModels.js weapon silhouettes derived from weapon stats
    textures.js     procedural albedo / roughness / normal maps
    skinTexture.js  paint schemes painted into canvases at runtime
    sky.js          shader skydome and per-biome weather volumes
    pickups.js      coolant, ammunition, repair and shield resupply pads
    cockpitRig.js   first-person canopy with live instrument strips
    fx.js           pooled particles, tracers, beams, decals, shockwaves
  game/
    mech.js         one machine: movement, thermals, damage, animation
    combat.js       hitscan, ballistics, guided missiles, splash, AMS
    ai.js           bot pilots
    match.js        roster, modes, scoring, respawn, lock-on
    player.js       input → intent, and the camera rig
  ui/
    hud.js          in-match HUD
    menus.js        title, hangar, garage, pilot, deploy, settings, codex
    hangarScene.js  the 3D hangar bay used as the menu backdrop
    tutorial.js     ten lessons that watch the live match state
    markers.js      nameplates, damage numbers, hit direction, waypoints
    touch.js        on-screen stick, trigger and action pad
    progression.js  credits, ranks, unlocks, circuits, localStorage profile

tools/
  test.sh           runs everything below in order
  check.sh          full ESM parse check of every module
  validate.mjs      cross-reference and sanity checks over the data layer
  smoke.mjs         boots the game in headless Chromium, walks the menus,
                    plays matches on several arenas, screenshots each,
                    and drives a death through the kill cam to respawn
  mobile.mjs        loads the published build inside the Artifact host's own
                    document at phone, tablet and desktop sizes, checks the
                    frame is painted and the hangar mech is on screen and
                    unobstructed, then plays a match with a finger
  png.mjs           a small PNG reader so a test can assert on pixels
  build-artifact.mjs  rewrites index.html into a publishable body fragment
  sim.mjs           headless combat simulation across every arena
  circuit.mjs       plays a tournament end to end and checks the bookkeeping
  leak.mjs          starts and tears down ten matches, watching the
                    renderer's own geometry and texture counters
```

### Design rules the code follows

- **The simulation never special-cases content by name.** `combat.js` reads
  a weapon's fields; it has no idea what an AC/20 is. Adding a weapon is a
  row in `data/weapons.js`.
- **Bots and players run identical code.** A bot writes the same intent
  fields (`moveX`, `aimYaw`, `firing`, …) that the player's input writes,
  then goes through the same physics, heat and weapon paths. No bot gets
  bonus damage or perfect aim; difficulty is spent on reaction time, aim
  error and how well it reads the situation.
- **Everything generated is deterministic.** Arenas are built from a seed,
  so a map you learn is the map you get. Skins hash from their id.
- **Nothing allocates during a match.** Particles, tracers, beams, decals
  and projectiles all come from preallocated pools.

---

## Adding content

**A weapon** — add a row to `BASE` in `src/data/weapons.js`. It is picked
up by the catalog, the garage, the auto-fit algorithm, the bots' weapon
scoring and the procedural model builder automatically. The variant ladder
(`Mk II`, `Ultra`, `Precision`, `Prime`, …) generates the rest.

**A chassis** — add a row to `RAW` in `src/data/mechs.js`. `armour` is a
single pool that `SPREAD` divides across the eight sections; `build`
drives the procedural model (leg type, torso shape, cockpit style, …).

**An ability** — add an entry to `ABILITIES` in `src/data/abilities.js`
with any of `onActivate`, `onTick`, `onEnd`. Abilities set flags on the
mech; they never touch rendering directly.

**An arena** — add a row to `MAPS` in `src/data/maps.js` with a seed, a
biome and one of the eight macro layouts. Nothing else is needed.

**A mode** — add a row to `MODES` in `src/data/modes.js`. Only a genuinely
new scoring rule needs a case in `Match._updateObjective`.

---

## Testing

```bash
./tools/test.sh                     # everything
./tools/check.sh                    # parse every module (catches typos)
node tools/validate.mjs             # data integrity, no browser needed
node tools/smoke.mjs                # boot, walk menus, play, screenshot
node tools/mobile.mjs               # phone/tablet layout, touch controls
node tools/sim.mjs                  # simulate combat on all 41 arenas
node tools/circuit.mjs              # play a tournament end to end
node tools/leak.mjs                 # resource leaks across ten matches
SIM_SECONDS=180 node tools/sim.mjs  # longer runs
node tools/sim.mjs refinery,mesa    # specific arenas
```

`tools/smoke.mjs` and `tools/sim.mjs` need Playwright and a Chromium
build; set `CHROME_BIN` if yours is not at the default path.

`mobile.mjs` is the one that finds the bugs a player reports as "I can't
see anything". It decodes the screenshot and fails if the frame is mostly
white — a canvas that never painted shows the host page through it — and it
projects the hangar mech to screen coordinates to prove it is inside the
rectangle the layout left for it and not behind a panel.

`sim.mjs` is the one that finds real bugs. It reported zero damage on the
canyon maps, which turned out to be walls forming a continuous impassable
barrier between the two spawn sides — something no screenshot would ever
have shown.

Note that `node --check` only validates the module record for ESM files and
lets genuine expression-level syntax errors through. `tools/check.mjs`
compiles each file with `vm.SourceTextModule` instead, which is a full
parse.

---

## Licence

Three.js in `vendor/` is MIT, © the Three.js authors.
