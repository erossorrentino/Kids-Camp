# Gridiron Kings

An American football game with an Ultimate Team mode, built for the browser with three.js.
Open `index.html` in a browser (or serve the folder with any static server) and play.
Everything is invented: every team, player and sponsor in the game is fictional.

## What's in it

- **11-on-11 football in 3D.** Night stadium with a full crowd, floodlights, LED boards,
  painted field (yard numbers, hash marks, end zone names), goal posts, players in helmets
  and shoulder pads, referees in striped shirts, a spinning football, confetti and fireworks
  on touchdowns. A high TV-style camera sits behind the offense, players crouch in their
  stances before the snap, and your player has a hexagon marker with his name under it.
- **TV broadcast look.** A score bar along the bottom (teams, score, possession arrow,
  quarter, game clock, play clock, down and distance, ball spot), a down-and-distance plate
  with the play clock before each snap, a coin toss before kickoff, an announcer voice with
  captions (it can be turned off in Settings), and slow-motion instant replays of
  touchdowns, interceptions, big hits and long gains.
- **Real playbook.** 30 offensive plays in 7 formations (Shotgun, Trips, Empty, Pistol,
  Singleback, I-Form, Goal Line) and 12 defenses (Cover 2, 3 and 4, man, 2 man under,
  blitzes, Fire Zone, Cover 0, run stop, goal line, prevent). A Coach Picks tab suggests
  plays for the down and distance. Each play card shows its diagram, and routes are drawn
  on the field before the snap.
- **Pre-snap and in-play moves.** Hot routes (change any receiver's route before the snap),
  touch passes (tap) and bullet passes (hold), juke, spin and truck for ball carriers, and a
  big-hit stick on defense. Snow makes players a little slower and rain makes the ball
  slippery.
- **Football rules.** Four downs to gain 10 yards, touchdowns plus an automatic extra point,
  field goals with a timing meter, punts, sacks, interceptions and pick sixes, safeties,
  turnovers on downs, a play clock with delay-of-game penalties, four quarters.
- **Ultimate Team.** About 455 fictional players across 10 positions and six card tiers
  (Bronze to Mythic). New teams start with three Rookie Packs. Earn coins by winning games, spend them on 27 kinds of packs (a free daily
  pack, Rookie, Lucky, Mystery, Bronze to Mythic, a pack for every position, Jumbo, Mega,
  Superstar, Speed, Power, Sure Hands, Offense, Defense, and team packs that rotate daily) or on
  single players in the market, sell spare players, and set a 23-player lineup
  (11 offense, 11 defense, a kicker). Climb from Division 10 to Division 1 for pack rewards.
  No real money anywhere.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Pick a play | `1`–`8` or click; `←` `→` change formation tab | Tap a tab, then a card |
| Hot route (before the snap) | `1`–`5`, then `1`–`9` for the new route | Tap a number button, then a route |
| Snap | `Space` | SNAP |
| Throw to a receiver | `1`–`5`: tap for a touch pass, hold for a bullet | Tap or hold a number button |
| Throw to the most open receiver | `Space` | BEST |
| Throw it away | `C` | AWAY |
| Run / move | `WASD` or arrows, `Shift` to sprint | Left thumb stick |
| Juke / spin / truck | `X` / `Space` / `C` | JUKE / SPIN / TRUCK |
| Switch defender / tackle / big hit | `X` / `Space` / `C` | SWITCH / TACKLE / HIT |
| Skip a replay | Any button | Tap the screen |
| Timeout (pause) | `Esc` | Pause button |

A gamepad works too. Leave the stick alone and your player runs on his own.

## Code map

| File | What it does |
|---|---|
| `js/data.js` | Utilities, the generated player database, teams, uniforms, lineup slots, packs, prices, divisions |
| `js/plays.js` | Formations, routes, coverage zones, offensive and defensive plays |
| `js/match.js` | The match engine: downs, snaps, routes, blocking, pass rush, coverage, throwing and catching, tackling, kicks, scoring, clock. No rendering, so it runs headless |
| `js/gfx.js` | three.js stadium, field, players, ball, camera and effects |
| `js/cards.js` | Player card art and portraits |
| `js/ui.js` | Menus, pack opening, results, the match HUD and play-call screen |
| `js/main.js` | Boot, main loop and game flow (coin toss, instant replays, rewards, promotions) |
| `js/caster.js` | The announcer: play-by-play lines spoken with the browser's speech voice, with captions |
| `js/input.js`, `js/audio.js`, `js/save.js` | Keyboard/touch/gamepad input, synthesized sound, save data |

Progress is saved in the browser. When the page runs as a Claude artifact it also syncs the
save to the signed-in player's private storage.
