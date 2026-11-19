# Hardwood Kings

A full 5-on-5 basketball game that runs in the browser: timed shooting,
dribble moves, real fouls and free throws, a CPU that runs plays, and a
broadcast-style 3D presentation. Eight fictional teams, no real leagues,
players or brands.

**Play:** open `dist/hardwood-kings.html` in Chrome, Edge, Firefox or Safari.
It needs an internet connection the first time to load three.js and the
fonts from their CDNs. There is nothing to install.

## Modes

- **Dynasty**: build your own team from player cards. You start with three
  free Rookie packs (mostly Bronze and Silver). Win games to earn coins,
  then buy rarer packs with better odds: Rookie (600), Pro (2,500, one
  guaranteed Gold+), All-Star (7,500, one guaranteed Emerald+) and Legend
  (20,000, one guaranteed Sapphire+, a shot at Onyx). Seven card tiers run
  Bronze, Silver, Gold, Emerald, Sapphire, Ruby, Onyx across about 220 cards,
  including every league player and eight Onyx legends. Set your starting
  five, quick-sell spare cards for coins, and play Rookie to Legend
  challenges against squads built from the same card pool (wins pay 700 to
  4,000 coins plus a margin bonus; losses still pay a little). Cards show a
  live 3D portrait of the actual player model, lit in the tier's colour, and
  big pulls get a walkout when you open the pack. Progress saves in your
  browser.
- **Play now**: pick your team and the CPU's, a difficulty (Rookie, Pro,
  All-Star, Legend), a quarter length (2 to 12 minutes) and home or away.
  Halftime report, overtime, box scores and player of the game included.
- **3-point contest**: 60 seconds, five racks of five, with the last ball
  on each rack worth two.
- **Watch CPU vs CPU**: sit back and watch a full game.

## Camera

The default camera is **third person**, in the style of a broadcast basketball game:
high behind the play, looking straight down the floor at the basket in use (the one
the offense attacks, so on defense it is the one you protect), with the lane in the
middle of the screen and the rim at the top. It follows your player and the ball, closes
in when the play is in the backcourt so it never shows the whole floor, and orbits round
the near sideline to the other end when possession changes. Chevrons mark your
teammates (the bright one is your pass target). In this mode you stay locked to your
own player on defense. Settings also offer Broadcast (full court), Close and Skycam.

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Move | WASD / arrows | Left stick |
| Sprint | Shift | RT / RB |
| Shoot (hold, release at the top of the meter) | Space / J | X / Square |
| Pass to the teammate you aim at | E / K | A / Cross |
| Dribble move (crossover, spin, step-back) | Q / L | B / Circle |
| Call a screen | R | Y / Triangle |
| Defense: block / hands up | Space (tap / hold) | X |
| Defense: steal | Q | B |
| Defense: switch player | E | A |
| Pause | Esc / P | Start |

Phones and tablets get an on-screen joystick and buttons.

## What's in it

**Gameplay** (`src/js/02-sim-core.js`, `03-sim-ai.js`)
- Ball physics with real rim, backboard and net collisions. Every shot is
  rolled for make or miss first, then the flight is solved so it actually
  goes in or rims out the way it was rolled.
- Shot quality from distance, ratings, defender distance, angle, height and
  hands up. Release timing grades from "Excellent" to "Very late". Range
  matters: the green window is wider and makes are likelier up close, and
  deep threes stay harder.
- A green (perfect) release is close to automatic: about 97% when open and
  still around 85% with a hand in your face; only well beyond the arc does it
  drop lower (a little easier on Rookie, a little harder on Legend). Your own
  layups and dunks shrug off contact, get blocked less, and fouled finishes
  often turn into and-ones; short jumpers get a lift too.
- A solid backboard and stanchion: the ball banks and bounces off every side
  of the glass, its pads, the shot clock and the support arm (`tools/boardtest.js`
  fires 4,000 balls at it and checks none get through).
- Layups, dunks, reverse layups, blocks, steals, deflections, rebounding,
  shooting fouls, and-ones, reach-ins, charges, the bonus, shot clock,
  backcourt and out-of-bounds violations, and buzzer beaters.
- Team AI: spacing, cuts, screens and rolls, drives, kick-outs, fast breaks,
  man-to-man defense with help rotations, closeouts and paint collapse.

**Graphics** (`src/js/04-render-core.js`, `05-arena.js`, `06-players.js`)
- HDR rendering with MSAA, bloom, ACES tone mapping, color grading,
  vignette, film grain and a letterboxed slow-motion dunk cam.
- A pale maple floor, every board a slightly different tone, with real-time
  planar reflections, fresnel blending and a per-plank roughness map. The home
  team's colours fill the apron, the lanes and the free-throw circles, with big
  city and team lettering along both baselines.
- House lights down: the court sits in a pool of light while the stands fade into
  the dark the further they are from the floor. Rounded two-tier bowl with
  suites and about 7,500 painted fans: 16 people in 8 poses (sitting, clapping,
  arms crossed, on their phone, standing, arms up, fist pump), each recoloured with
  their own shirt, trousers, skin and hair. Big plays bring part of the crowd to
  its feet, never the whole bowl at once, and they do the wave. Also a 360° ribbon
  board, a center-hung scoreboard, ceiling light rig with haze, camera flashes and
  confetti.
- Five substitutes per team sit on each bench in full uniform and follow the ball.
- Photographers sit along both baselines with their lenses up, with two rows of
  courtside fans behind them.
- Players are single skinned meshes on a 15-bone skeleton, painted from a
  per-player texture atlas: jerseys with names, numbers and side panels, long
  shorts with stripes and a team badge, fabric detail and a broadcast rim light.
  Arms use IK to dribble, shoot and catch; feet stay planted on the floor.
- Athletic bodies: sculpted biceps, triceps, forearms, quads and calves, curled
  fingers, and skin with a sweat sheen. Faces have eyes with lids and catchlights,
  hair-stroke eyebrows, a sculpted nose, lips and chin, and stubble, goatees, chin
  straps or full beards. Eleven hairstyles (shaved, buzz, fade, waves, flow, high-top,
  sponge curls, afro, locs, bun, braids) with natural hairlines.
- Every player has their own gear, chosen from their name: compression tights on one
  or both legs, padded knee sleeves, high or crew socks, shooting sleeves,
  wristbands, headbands, arm tattoos and four sneaker colourways.
- Depth of field on replays, the pregame show, free throws and other cinematic
  shots: the arena melts into a soft blur behind sharp players.
- Ambient occlusion on High: soft contact shading under feet, between bodies
  and in creases, plus self-shadowing on the players and a light sharpening
  pass for a crisp broadcast picture.
- Courtside LED boards rotate through ads for made-up sponsors and home-team
  promos with an LED wipe every few seconds; the stanchions carry sponsor pads and
  a stacked promo, and the glossy floor mirrors all of it.
- Three referees, coaches and courtside fans.
- Defenders guard in a wide, low stance with their arms out over the passing lanes.
- Broadcast presentation: a starting-lineups intro with 3D player cards,
  instant replays of big dunks and threes (logo wipe, slow motion, cinematic
  camera, skippable), pop-up stat graphics for hot players, and a
  player-of-the-game portrait.
- In-game HUD: a broadcast scorebug across the top, with each team's block in the
  colour of the uniform it is wearing (vertical abbreviation, logo, big score, team
  fouls with foul dashes, bonus and possession) either side of a centre block with
  the game clock, quarter and shot clock; your player's name and stamina bar at the
  bottom centre; the vertical shot meter beside the shooter; and a live panel at the top
  right with their points, rebounds, assists and FG% plus a running letter grade
  (A+ to F) for your team's play.
- Skin with a warm subsurface-style scatter, muscle definition on the limbs,
  sculpted faces, and jerseys whose hem swings with momentum.
- Fans hold up signs on big moments, courtside rows clap, and bright lights
  throw a subtle anamorphic streak.
- Deformable nets, rim shake on dunks, backboard LEDs at the buzzer, and a
  green ball trail on a perfect release.
- Graphics setting: Auto (steps down if the frame rate drops), High, Medium, Low.

**Sound** (`src/js/07-audio.js`): every sound is synthesized: dribbles,
swishes, rim and backboard hits, sneaker squeaks, whistle, buzzer, a
reactive crowd and a menu beat. There's an optional announcer voice using
the browser's speech engine.

## Development

```
node tools/build.js       # concatenates src/ into dist/
node tools/simtest.js 8   # 8 CPU-vs-CPU games headless, prints league-style stats
node tools/usertest.js 4  # 4 games through the human-input path with a scripted player (make rates by shot type)
node tools/boardtest.js   # 4,000 balls at the backboard; fails if any pass through
```

The simulation has no DOM or renderer dependencies, so the test tools run it
directly in Node. Source modules load in filename order.
