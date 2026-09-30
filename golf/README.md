# Fairway Legends

A 3D golf game that runs in the browser (computer, tablet or phone). You start as
world #501 and try to become the best golfer in the world against 500 tour
pros on 100 courses.

## Play it

The game is plain HTML + JavaScript modules with a vendored copy of
Three.js, so there is nothing to install or build. Browsers won't load
JavaScript modules from `file://`, so serve the folder with any static
server:

```sh
cd golf
python3 -m http.server 8000
# then open http://localhost:8000
```

(`npx serve golf` works too.) Fonts come from Google Fonts; offline, the
game falls back to system fonts.

## Controls

| Action | Mouse / keyboard | Touch |
| --- | --- | --- |
| Swing | Press on the course, **pull down** (power), **push up** past the start (strike) | Same, with a finger |
| Aim | A / D or arrow keys, or click the minimap | Big arrow buttons, or tap the minimap |
| Club | W / S, mouse wheel, or the arrows by the club name | Arrows by the club name |
| Shot shape (draw, fade, high, low) | **Shape** button, then drag the dot on the ball | Same |
| Camera | V cycles address / overhead / target | **View** |
| Green slope grid | G | **Grid** |
| Putter range | R | **Range** |
| Fast-forward the ball | Hold Space | Hold a finger on the screen |
| Scorecard / leaderboard / menu | C / L / Esc | Buttons |

Pushing up and to the right fades or slices the ball; up and to the left
draws or hooks it. Pulling past 100% is an overswing: more speed, much
less accuracy. A slow, hesitant push loses speed. The golfer starts the
downswing with your finger as you push, and each strike is rated as it
happens (Perfect, Pure, Slight draw, Fade, Slice, Hook, and a note if the
tempo was slow). **Sim hole** scores a hole using your golfer's skills if
you want to move on.

## What's in it

- **Real ball physics** (`src/sim/physics.js`): drag and Magnus lift with
  spin-dependent coefficients fitted to tour launch-monitor averages
  (driver: 167 mph, 10.9°, 2,686 rpm carries ~270 yds; 7-iron ~167), spin
  decay, wind that strengthens with height, thinner air at altitude,
  turf bounces modeled after Penner's crater model (so wedges check and
  spin back, drives run out 20-30 yds, and links turf runs 50), rolling on
  sloped greens at the course's Stimpmeter speed, cup capture and
  lip-outs, the flagstick, trees (trunks and canopies), water, out of
  bounds, and cart paths that bounce the ball high.
- **1,800 generated holes** (`src/sim/hole.js`): 100 courses in 8 styles
  (Parkland, Links, Desert, Mountain, Coastal, Forest, Tropical,
  Heathland) with doglegs, contoured and tiered greens, fairway / pot /
  greenside bunkers, ponds, creeks, ocean cliffs and beaches, out-of-bounds
  lines, and elevation changes. Every hole is regenerated from a seed, so a
  course is always the same.
- **500 pros** (`src/data/players.js`): parody names of famous players
  (e.g. Tigre Woodson, Rory McKilroy, Scotty Schaffield; none are real
  people) plus generated players from 37 countries. Each has 9 stats and
  1-5 **advantages / disadvantages** (Bomber, Putting Machine, Wind
  Whisperer, Choker, The Yips, Hook Prone and 29 more). Traits change both
  the AI scoring and how the ball behaves when you play as that pro.
- **29 club sets** in five slots (driver, woods & hybrid, irons, wedges,
  putter) in `src/data/clubsets.js`. Each trades one strength for another:
  a low-spin Rocket driver that flies far but punishes mishits, a
  Stable Max with a huge sweet spot, a draw-biased driver that fights a
  slice, a deck-friendly mini driver, blades that shape the ball vs.
  super game improvement irons that stay straight, high-bounce wedges for
  sand and low-bounce tour wedges for spin, mallet, milled, counterbalanced
  and arm-lock putters (aim, pace, nerve, longer read). Each set has its
  own head in 3D (wood crowns and faces, cavity backs vs. blades, blade vs.
  mallet putters), the pros each carry a bag that suits their game, and
  you buy and swap sets in the pro shop.
- **Buying players is the only way to get better.** Every career golfer
  starts with the same skills (overall 56) and no strengths or
  weaknesses, and skills can't be trained. The **Players** tab
  (`src/data/characters.js`) sells **all 500 tour pros**, priced by their
  overall rating from $20K (overall 60) to about $30M for the biggest
  stars; buy one and you play your career as them, with their skills,
  their strengths *and* weaknesses, and their look (they sit out the
  events you play). Search by name, country or trait, sort by rating,
  price or any skill, and show only the ones you can afford; any pro's
  card in Tour players has a Buy button too. There are also 12 special
  players with no weaknesses, from Birdie Bex ($25K, overall 62) to the
  Golden Eagle ($40M, overall 96, the best golfer in the game). Switch
  between the players you own any time; each is shown as a 3D portrait
  rendered by the game. Levels pay a cash bonus toward the next player. Careers saved before this change are set back to the
  standard skills, with any skill points they had paid back in cash.
- **Shaped bodies** (`src/render/golfer.js`): torsos turned on a lathe
  with broad shoulders tapering to the waist (a slimmer waist and wider
  hips for women), rounded hips under a belt, thighs and calves with
  muscle shape, knees and elbows that bend cleanly, short sleeves, hands
  with a thumb that follow the forearm, a head with a narrower jaw, and
  golf shoes with a toe cap and heel; the trail heel lifts in the finish.
  `tools/dev/body.html` lines golfers up in different poses to check them.
- **A real swing sequence** (`swingState` in `src/render/golfer.js`): the
  wrists set gradually going back while the shoulders turn about twice as
  far as the hips and the weight moves onto the trail side. The downswing
  works from the ground up: the weight shifts and the hips unwind first,
  the chest follows, the arms drop, and the wrists hold their angle until
  late so the clubhead whips through. At impact the hips are open, the
  hands lead the ball and the head stays behind it; then the golfer
  rotates to a balanced finish with the chest past the target, the club
  wrapped behind the neck, the trail foot up on its toe and the eyes
  following the ball. Chips use a shorter version, putts a still-headed
  pendulum. A swish builds to impact. `tools/dev/swing.html` shows a swing
  frame by frame from face-on and down the line.
- **Detailed golfers**: caps, visors, bucket hats, flat caps, cowboy hats
  and beanies; short, long, curly, bun, ponytail, mohawk or bald; stubble,
  beards and mustaches; striped, hooped, checked or argyle shirts; sweater
  vests, shorts with socks, glove and shoe colours, sunglasses. You pick
  them when you create your golfer (with a live 3D preview), and the pros
  wear them too. After holing out, the camera cuts to your golfer's
  reaction: arms up for an eagle, a fist pump for a birdie, a tip of the
  cap for par, hands on hips for a bogey.
- **12 golf balls** with trade-offs (distance vs. spin vs. straightness vs.
  wind vs. putting) in `src/data/equipment.js`, bought with prize money.
- **Career**: Challenger Tour, World Tour, four majors and a $40M Tour
  Championship; 36-hole cuts, sudden-death playoffs, purses, a points
  race, world rankings with weekly decay, XP and levels (with cash bonuses),
  and **every entry pays**: missing the cut still earns $5,000, making
  it pays at least $15K on the Challenger Tour ($37.5K World Tour, $75K
  majors), and the holes you play yourself earn scoring
  bonuses ($2K-$15K a birdie, 5x for an eagle, 25x for a hole-in-one),
  achievements, and a results history. Other events are simulated
  shot by shot from each pro's stats (`src/sim/aisim.js`, calibrated to
  tour scoring averages).
- **Live leaderboard** during your round, with the field revealed hole by
  hole on staggered tee times, plus a paper scorecard (birdies circled,
  bogeys boxed).
- **Broadcast-style HUD**: lie and slope, "plays like" yardage, wind, a
  launch-monitor readout after every shot (ball speed, launch, spin,
  carry, total, height, curve, land angle), shot tracer, minimap.
- **Yardage book**: each course card draws all 18 holes from above with a
  caddie's note on how to play them (doglegs, bunkers, water, two-tier
  greens, uphill or downhill), plus the course record.
- **People**: your golfer has shoes, belt, collar and logo, face, hair,
  cap and optional shades, and breathes at address; a caddie with your
  name on the bib carries your bag; galleries line the fairways, turn to
  follow your ball (some point at it while it's in the air), clap good
  shots, throw their arms up for birdies and take photos, with marshals,
  TV camera towers, grandstands and carts driving the paths.
- **Scenery**: species trees in three variants each that sway in the wind,
  grass tufts, wildflowers, fescue, heather, desert shrubs, rocks, reeds
  by the water, cart paths, tee signs with a hole map, clubhouse, homes
  behind the white stakes, galleries, a grandstand and scoreboard on
  tournament finishing holes, clouds, birds, and synthesized sound.
  Creeks run downhill through a shallow valley with footbridges; ponds
  get fountains, bunkers get rakes, tees get a ball washer, cooler and
  flower bed, seaside holes get a lighthouse, and your shots leave divots
  in the fairway and pitch marks on the greens. In a bunker you leave
  footprints walking in and where you stood, the club leaves a crater, and
  once you've played out the caddie rakes it into neat grooves.
- **Wildlife** (`src/render/wildlife.js`): mallards on the ponds, and
  sometimes a mother duck leading a line of ducklings; rabbits nibbling
  in the rough (jackrabbits in the desert); squirrels darting round the
  tree trunks; fireflies at night. Land a ball near them and they scatter:
  drakes take off quacking and circle back a little later, the mother
  hurries her ducklings away across the water, rabbits bolt for cover and
  squirrels run up the far side of a tree.

## Mini-games

**Mini-games** on the title screen (`src/game/minigames.js`) put you
against 7 tour pros on a real course, with prize money for your career
($25K for a win down to $2,500) and personal bests saved on the device:

- **Practice Range**: unlimited balls with any club at a range with mats,
  ball pyramids, distance boards and target greens every 50 yards. It
  keeps your average and longest carry with every club.
- **Closest to the Pin**: three balls at a par 3; your closest one counts,
  and a hole-in-one wins outright.
- **Long Drive**: six drives down the longest hole; only balls that stop
  in the fairway count, and the longest one wins.
- **Putting Challenge**: six putts from 5 to 40 feet around one hole.
  Holing one is worth 2 to 8 points (more for the long ones) and a lag
  inside 3 feet still earns a point.
- **Target Challenge**: ten balls at five ringed targets with tall flags
  from 60 to 230 yards: 10 for the bullseye, 5 for the middle ring, 2 for
  the outer, and the far targets multiply your points by 2 or 3.

Each game can be played in daylight, at sunset, at night under
floodlights or in the rain. The pros' scores come from their real skills, so a better
putter really does win the putting challenge more often.

## Play with friends

**Play with friends** is 2-4 players taking turns on one device (pass it
round). Each player plays as a tour pro, your career golfer, or a club
pro / weekend golfer / beginner, and picks a colour: their ball, name tag
and shot tracer are drawn in it. Choose **stroke play**, **match play**
(two players, hole by hole) or **skins** (ties carry over), then 3 holes, 6,
the front or back nine, or 18 on any course with any weather. The farthest ball from the hole
plays first, the other balls stay on the course with name tags, and the
honour goes to the best score on the last hole. There's a shared
scorecard, a live standings panel and a final results screen with the
shot of the round.

## Weather and time of day

Quick rounds, mini-games and tournaments can be **sunny, cloudy, rainy or
foggy**, in the **morning, at midday, late afternoon, at sunset or at
night**. Rain falls in streaks round the camera, slows the greens and
softens the fairways (less roll), and brings the odd rumble of thunder;
fog closes in the horizon; sunsets turn the sky orange; at night the sky
fills with stars and the Milky Way and the hole is lit by floodlight
towers with a pool of light on the green. Each course style has its own
typical weather, and a tournament's four rounds can change.

## Replays and highlights

A great shot (a hole-in-one, a chip-in, a long putt, a bomb of a drive, an
approach to tap-in range) gets a **TV replay**: from behind the golfer, a
raised side camera following the ball, and a slow-motion shot at the
finish. Each round picks a **shot of the round** that you can watch again
from the results screen. A **hole-in-one** sets off fireworks and
confetti over the green, and on some tournament par 3s there's a **prize
car** parked by the tee: ace it and it's yours (it goes in your garage in
the trophy room).

## Career extras

- **Your rival**: a pro close to your level is picked as your rival. The
  hub shows your head-to-head record, they're always in your field, they
  send you a message after each event, and beating them at a major is
  worth a $50K bonus. Once you're well ahead of them a new rival takes
  over.
- **Sponsors**: as your ranking climbs, sponsors (Local, Regional,
  National and Global) offer deals for your cap and shirt and your golf
  bag: money every event you enter plus bonuses for a top 10 or a win. The
  logo appears on your golfer's chest, cap and bag.
- **Daily challenge**: one mini-game a day, the same for everyone that
  day (course, weather and wind come from the date). Beat the target to
  win $10K and build a streak worth up to $50K a day.
- **The Legends Cup**: from week 18 of each season, captain Team Legends
  (you plus the pros you own and the best players from your country)
  against your rival's Team World in five nine-hole singles matches. You
  play yours hole by hole; the others are played out from the players'
  skills. $150K for winning, $40K for taking part.
- **Trophy room**: a 3D cabinet rendered by the game with a trophy for
  every win (a different one for each tour, majors and the Tour
  Championship), a green jacket, the cups you've won and the cars in your
  garage.
- **Stats**: rounds played, scoring average, best round, most birdies in
  a round, birdies, eagles, longest drive, fairways hit, greens in
  regulation, putts per round and the longest putt you've holed.
- **Nickname**: pick one (or type your own) and the commentator uses it.

## Sound, commentary and the caddie

A **commentator** calls the big moments (bombs, darts, splashes, lip-outs,
holed putts, birdies) as a caption at the top of the screen and, if the
device can speak, out loud. The **crowd** gasps "ooh" at a near-miss and
"aah" as a good approach drops near the flag; the menus have their own
**music**; and there's rain, crickets at night and ducks quacking. Your
**caddie** gives advice before every shot: wind helping or hurting,
crosswind drift, water or bunkers near where your club lands, out of
bounds, how the lie will play, and on the green how many cups the putt
breaks and whether it's uphill or downhill. Every one of these can be
switched off in Settings.

## Style shop

The pro shop's **Style** tab sells looks that never change how the ball
flies (`src/data/cosmetics.js`):

- **Shot trails**: the classic golden TV tracer (free), Neon pink, Ice
  comet (with snowflake sparkles), Fireball (yellow to red flames that
  spit embers and smoke), Stardust (twinkling gold stars), Rainbow,
  Party time (a stream of confetti) and Lightning bolt (a crackling
  zig-zag with electric sparks), from $8K to $45K.
- **Ball colours**: tour white, optic yellow, blaze orange, bubblegum
  pink, lime, sky blue and gold.

Your trail and ball colour show in replays too.

## Phones

On a phone the HUD switches to a compact layout (club and distance on
their own rows in portrait, one row along the bottom in landscape), the
camera widens on tall screens so your golfer and the target both fit, and
the swing's pull-down shortens to the room left below your finger.
Graphics default to **Low** on phones (fewer spectators, no shadows,
lighter resolution), and if the frame rate still drops the game lowers
its resolution on its own. If the phone takes the 3D view away (low
memory, switching apps) the game says so, saves, and picks back up; if
anything goes wrong it shows a card with a way out instead of a blank
screen.

## Saving

Career progress is saved after **every shot** in the browser's
localStorage (with a backup copy), and again whenever the page is hidden
or closed. Close the game mid-hole and **Resume** puts your ball back
exactly where it was. When the game runs as a claude.ai artifact it also
saves to your account, so it follows you between computer, tablet and
phone. The game never writes to your account until it has read what's
saved there, so a slow connection can't replace a saved career; if you
start a new career before the saved one arrives, it asks which to keep.
The hub shows where your progress is saved.

## Code layout

```
golf/
  index.html, style.css
  vendor/three.module.min.js     Three.js r160 (MIT, see THREE_LICENSE)
  src/
    main.js                      app controller: menus, career flow, rounds
    audio.js                     WebAudio sound effects
    util/rng.js                  seeded RNG + simplex noise
    data/                        pros, traits, courses, clubs & balls, tour calendar, trails
    sim/                         physics, hole generator, shot model, caddie, AI sim
    game/                        round controller, tournaments, career, storage,
                                 mini-games, multiplayer, weather, replays, rival,
                                 sponsors, daily challenge, Legends Cup,
                                 commentary, caddie tips
    render/                      world, terrain shader, trees, decor, golfer, effects,
                                 wildlife, targets, prize cars, trophy cabinet
    ui/                          HUD, swing input, menu, tournament and mode screens
  tools/
    tune_physics.mjs             fits drag/lift to tour data (--search)
    bot_round.mjs                a bot plays holes through the physics
    calibrate_sim.mjs            AI scoring averages by rating
    dev/view.html                hole viewer (?c=course&h=hole&v=tee|green|top|trees|stand|water|golfer|caddie|crowd)
```

The simulation modules (`src/data`, `src/sim`, `src/game`) have no
Three.js dependency and run under Node, which is how the tools above work:

```sh
cd golf
node tools/tune_physics.mjs      # carries vs tour data, rollout table
node tools/bot_round.mjs 6       # bot plays 6 courses
node tools/calibrate_sim.mjs     # AI scoring by overall rating
```
