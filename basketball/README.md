# Hardwood Kings

A full 5-on-5 basketball game that runs in the browser: timed shooting,
dribble moves, real fouls and free throws, a CPU that runs plays, and a
broadcast-style 3D presentation. Eight fictional teams, no real leagues,
players or brands.

**Play:** open `dist/hardwood-kings.html` in Chrome, Edge, Firefox or Safari.
It needs an internet connection the first time to load three.js and the
fonts from their CDNs. There is nothing to install.

## Modes

- **Play now**: pick your team and the CPU's, a difficulty (Rookie, Pro,
  All-Star, Legend), a quarter length (2 to 12 minutes) and home or away.
  Halftime report, overtime, box scores and player of the game included.
- **3-point contest**: 60 seconds, five racks of five, with the last ball
  on each rack worth two.
- **Watch CPU vs CPU**: sit back and watch a full game.

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
  hands up. Release timing grades from "Excellent" to "Very late".
- Layups, dunks, reverse layups, blocks, steals, deflections, rebounding,
  shooting fouls, and-ones, reach-ins, charges, the bonus, shot clock,
  backcourt and out-of-bounds violations, and buzzer beaters.
- Team AI: spacing, cuts, screens and rolls, drives, kick-outs, fast breaks,
  man-to-man defense with help rotations, closeouts and paint collapse.

**Graphics** (`src/js/04-render-core.js`, `05-arena.js`, `06-players.js`)
- HDR rendering with MSAA, bloom, ACES tone mapping, color grading,
  vignette, film grain and a letterboxed slow-motion dunk cam.
- A lacquered maple floor with real-time planar reflections, fresnel
  blending and a per-plank roughness map.
- Spotlit arena: rounded two-tier bowl with suites, about 7,000 GPU-animated
  fans who stand, cheer and do the wave, a 360° ribbon board, a center-hung
  scoreboard, ceiling light rig with haze, camera flashes and confetti.
- Procedural players with muscle-profiled limbs, tank-top jerseys with
  names and numbers, baggy shorts, high-top sneakers, faces, hair styles,
  headbands and sleeves. Arms use IK to dribble, shoot and catch.
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
node tools/usertest.js 4  # 4 games through the human-input path with a scripted player
```

The simulation has no DOM or renderer dependencies, so the test tools run it
directly in Node. Source modules load in filename order.
