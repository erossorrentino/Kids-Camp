# Apex Velocity

A Formula 1 / Gran Turismo-style racing game that runs in any modern web
browser, on a computer, tablet or phone. Everything is generated in code:
there are no image, model or sound files. That includes 10,000 cars, 8
circuits, the scenery, the engine sounds and the liveries.

**To play:** open `dist/index.html` in Chrome, Edge, Firefox or Safari.
It's one self-contained file, so you can double-click it, copy it to a
tablet, or host it anywhere. Progress saves in the browser.

## What's in the game

- **10,000 different cars** in 19 classes, from $16k city hatchbacks
  through muscle cars, SUVs, supercars, hypercars, rally cars, touring cars,
  GT3 racers and Le Mans prototypes, up to $20M Formula Elite (F1-style)
  cars. Each car has its own procedurally built 3D body: proportions, roof
  line, fender flares, lights, wings, wheels, paint finish and livery. All
  brands and names are invented.
- **Real-world prices.** Every class is priced against the real 2024-2026
  market (see the table below), and so are the upgrade parts.
- **11 kinds of upgrade parts** with 3-4 levels each: engine tune,
  turbo, exhaust, intake/ECU, gearbox, weight reduction, tyres, brakes,
  suspension, aero kit (adds a real wing to the car) and nitrous. Every
  part changes the physics, and the Performance Rating (PR) shows the
  effect before you buy.
- **Career mode:** 19 championships across 6 tiers, each with entry rules
  (car class and/or PR limit), prize money for the top 8, and a bonus for
  winning every race. Win money, buy better cars, unlock bigger series, and
  work up to the Formula Elite World Championship.
- **8 circuits:** Kingsbridge GP (countryside), Azure Coast (harbour street
  circuit at sunset), Neon Bay (night city under floodlights), Red Canyon
  (desert), Alpine Ring (mountains), Thunder Oval (banked speedway), Sakura
  Hills (cherry blossoms) and Glacier Point (snow).
- **Quick Race** on any track with any time of day or rain, and a
  **Test Drive** for any car in the dealership before you buy it.
- **AI opponents** matched to your car and difficulty. They follow the
  racing line, brake for corners based on their own car's grip and
  downforce, overtake, defend and slipstream.

### Graphics

- Physically based rendering with ACES tone mapping, an MSAA HDR pipeline,
  bloom, speed blur, chromatic aberration, vignette and per-track colour
  grading.
- Clearcoat car paint (gloss, metallic, pearl with iridescence, matte,
  chrome) reflecting a sky environment map. Glass, chrome, carbon fibre,
  brake discs, calipers and sidewall lettering.
- Atmospheric sky with animated clouds, sun glow, and stars and moon for
  night races. Distance haze and soft shadows that follow the camera.
- Detailed circuits: rubbered-in racing line and painted lines drawn in a
  shader, red/white curbs, gravel traps, striped mown grass, armco,
  sponsor walls, tyre stacks, catch fences, grandstands full of fans, pit
  garages, a start gantry with working F1 start lights, brake-marker
  boards, an advertising bridge, forests, rocks, desert mesas, skyscrapers
  with lit windows, sea water and snow-capped mountains.
- Tyre smoke, skid marks, sparks, dust off-track, exhaust flames on
  upshifts and nitro, rain spray.
- Quality presets (Lite / Low / Medium / High / Ultra) plus automatic
  resolution scaling to keep the frame rate smooth.
- **Lite** is the simplest look (no shadows, reflections or special
  effects). Phones and very weak computers start on Lite; Chromebooks and
  tablets start on Low. If the game sees a white or blank picture, loses
  the graphics, or runs too slowly, it switches down a step by itself. You
  can change it any time in Settings or the pause menu.

### Sound

Synthesized engines for inline-4, V6, V8, V10, V12, flat-6, Formula
hybrid and electric cars, with backfires, turbo whistle and blow-off,
tyre squeal, wind, curb/gravel rumble, crashes, start-light beeps and a
crowd cheer when you win.

## Controls

| Action | Keyboard | Gamepad | Phone / tablet |
|---|---|---|---|
| Accelerate | W / ↑ | RT or A | GAS button (or turn on *Auto accelerate*) |
| Brake / reverse | S / ↓ | LT | BRAKE button |
| Steer | A D / ← → | Left stick | ◀ ▶ buttons |
| Handbrake | Space | B | |
| Nitro | N / Shift | X | N2O button |
| Camera | C | Y | CAM button |
| Reset car | R | Back | |
| Pause | Esc / P | Start | ❚❚ button |
| Manual gears | Q / E | LB / RB | |

**Phones:** the game goes full screen and asks you to turn the phone
sideways for racing. On phones, *Auto accelerate* and *Auto brake* are on
by default so young drivers only need to steer. Change them in Settings.

### Kid-friendly assists (Settings)

Racing line guide (green = go, red = brake), auto accelerate, auto brake,
steering assist, ABS, traction control and stability control, plus Easy /
Normal / Hard difficulty.

## Real-world price benchmarks

Car prices fall inside these ranges. Better performance and fancier
brands cost more within a class.

| Class | Price range | Real-world examples it's based on |
|---|---|---|
| Compact | $16k – $29k | Mitsubishi Mirage, Kia Rio, Honda Fit |
| Sedan | $22k – $85k | Toyota Corolla up to BMW 5 Series / Mercedes E-Class |
| Hot Hatch | $30k – $62k | VW Golf GTI / R, Honda Civic Type R, Toyota GR Corolla |
| Coupe | $30k – $105k | Subaru BRZ, Toyota Supra, BMW M2 / M4 |
| Muscle | $32k – $120k | Ford Mustang, Dodge Challenger Hellcat, Shelby GT500 |
| SUV | $28k – $250k | Toyota RAV4 up to Lamborghini Urus |
| Pickup | $35k – $115k | Ford F-150 up to F-150 Raptor R / Ram TRX |
| Sports | $60k – $245k | Chevrolet Corvette, Porsche 911 to 911 GT3 RS |
| Classic | $15k – $3.5M | Old hatchbacks up to rare collector cars |
| Electric | $29k – $2.4M | Nissan Leaf, Tesla Model 3, Porsche Taycan, Rimac Nevera |
| Grand Tourer | $100k – $420k | Lexus LC, Aston Martin DB12, Bentley Continental GT, Ferrari 812 |
| Supercar | $220k – $650k | McLaren Artura / 720S, Lamborghini Huracán, Ferrari SF90 |
| Hypercar | $1M – $4M | McLaren Senna, Pagani Utopia, Bugatti Chiron, Koenigsegg Jesko |
| Rally | $120k – $1M | Rally4 up to Rally1 / WRC cars |
| Touring Car | $150k – $600k | TCR cars, BTCC, Supercars Championship |
| GT3 Race | $480k – $750k | Porsche 911 GT3 R, Ferrari 296 GT3 |
| Prototype | $500k – $5M | LMP3 / LMP2 up to Le Mans Hypercars |
| Formula Junior | $110k – $1.3M | Formula 4, Formula 3, Formula 2 |
| Formula Elite | $12M – $20M | A Formula 1 car (chassis + power unit) |

Upgrade parts are priced at real aftermarket costs for a typical $40k car
(for example a Stage 1 tune is about $900, racing slicks about $2,600,
carbon-ceramic brakes about $14,000). They cost more for exotic cars,
the same way parts for a supercar or race car do in real life.

## If something goes wrong

Every error screen shows a short **error code**. Tap **Send error report**
to save a small report (device type, screen size, graphics chip, browser
and what happened) in the game's own private storage so it can be looked
at. Reports contain no names or personal details.

| Code | What it means | What the game does |
|---|---|---|
| E-DL | The game file didn't download | Tries again once, then asks you to reload |
| E-SLOW | The game took too long to start | Asks you to reload |
| E-BOOT | The game crashed while starting | Asks you to reload |
| E-GL | The browser can't draw 3D graphics | Suggests the latest Chrome or Safari |
| E-LOST | The graphics chip reset | Switches to Lite and goes back to the menu |
| E-WHITE | The picture stayed white or blank | Switches down a graphics step; shows this only if Lite fails too |
| E-RACE | A race failed to load | Retries once on Lite before showing this |
| E-LOOP | The game kept hitting an error | Stops the race (or suggests a reload) |

If the game crashes while loading, it starts on Lite graphics next time.

## Building from source

```
npm install
npm run build      # writes dist/index.html (single file, ~850 KB)
```

Source layout:

```
src/
  main.js          app shell, game flow, economy
  core/            seeded random + noise, save game
  data/            cars (10,000-car generator), parts, career events, tracks
  sim/             track geometry, vehicle physics, AI drivers, race control
  gfx/             renderer + post FX, sky/environment, procedural textures,
                   car model generator, circuit builder, particles/effects
  game/            race scene, cameras, input (keyboard/gamepad/touch), showroom
  ui/              menus and HUD
  audio/           procedural engine and effects audio
  test/            dev pages that render cars, tracks and skies on their own
                   (build one with: node build.mjs --entry src/test/carshow.js --out carshow.html)
```

Built with [three.js](https://threejs.org) r180 and bundled with esbuild.
