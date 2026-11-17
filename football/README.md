# Gridiron Kings

An American football game with an Ultimate Team mode, built for the browser with three.js.
Open `index.html` in a browser (or serve the folder with any static server) and play.
Everything is invented: every team, player and sponsor in the game is fictional.

## What's in it

- **11-on-11 football in 3D.** Night stadium with a full crowd, floodlights, LED boards,
  painted field (yard numbers, hash marks, end zone names), goal posts, players in helmets
  and shoulder pads, a spinning football, confetti and fireworks on touchdowns.
- **Real plays.** Call your offense from 8 plays (slants, four verticals, mesh, post corner,
  play action, screen, dive, toss), or your defense from 6 (Cover 2, Cover 3, man press,
  blitz, run stop, prevent). Each play card shows its diagram, and routes are drawn on the
  field before the snap.
- **Football rules.** Four downs to gain 10 yards, touchdowns plus an automatic extra point,
  field goals with a timing meter, punts, sacks, interceptions and pick sixes, safeties,
  turnovers on downs, four quarters.
- **Ultimate Team.** About 455 fictional players across 10 positions and six card tiers
  (Bronze to Mythic). Earn coins by winning games, spend them on five kinds of packs or on
  single players in the market, sell spare players, and set a 23-player lineup
  (11 offense, 11 defense, a kicker). Climb from Division 10 to Division 1 for pack rewards.
  No real money anywhere.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Pick a play | `1`–`8` or click | Tap a card |
| Snap | `Space` | SNAP |
| Throw to a receiver | `1`–`5` (the numbered bubbles) | Tap the bubble |
| Throw to the most open receiver | `Space` | THROW |
| Throw it away | `C` | AWAY |
| Run / move | `WASD` or arrows, `Shift` to sprint | Left thumb stick |
| Juke / spin | `X` / `Space` | JUKE / SPIN |
| Switch defender / tackle | `X` / `Space` | SWITCH / TACKLE |
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
| `js/main.js` | Boot, main loop and game flow (rewards, promotions) |
| `js/input.js`, `js/audio.js`, `js/save.js` | Keyboard/touch/gamepad input, synthesized sound, save data |

Progress is saved in the browser. When the page runs as a Claude artifact it also syncs the
save to the signed-in player's private storage.
