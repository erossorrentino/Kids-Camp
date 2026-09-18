# Ball Multiplier Merge

A browser mini-game: money balls drop from the top of a Plinko-style
board, bouncing off pegs and multiplier slots spread across the whole
board, then cash out when they reach the bottom. Merge 3 identical
multipliers to upgrade them, and spend your earnings in the chest shop
or on upgrades.

## How to play

- A ball worth `$1` (more once upgraded) drops from the top and bounces
  down through a field of pegs, like Plinko — where it lands and which
  of the 10 multiplier slots it happens to hit is physics-driven, not
  fixed.
- Any slot holding a multiplier tile (×2, ×3, ×5, ... up to ×200)
  multiplies the ball's value if the ball bounces into it on the way
  down. A slot can only boost a given ball once per drop.
- Buy chests in the shop with your money to get random multiplier tiles.
  Pricier chests have better odds of high-tier multipliers.
- Tap a multiplier in "Your Multipliers" then tap an empty board slot to
  place it there. Getting 3 of the same tier anywhere on the board
  automatically merges them into one tile of the next tier up.
- Tap a placed tile to sell it back for coins if you need the space.
- Spend money on **Ball Speed** (spawns balls faster) and **Starting
  Value** (each new ball is worth more before multipliers) upgrades.

Progress is saved automatically to your browser's local storage.

## Running it

It's a static site with no build step. Either:

- Open `index.html` directly in a browser, or
- Serve the folder locally, e.g. `python3 -m http.server` from this
  directory and visit `http://localhost:8000`.

## Files

```
index.html         Page structure / layout
style.css          Theming and animations
game.js            Game state, shop logic, Plinko physics + rendering
lib/matter.min.js  Vendored Matter.js physics engine (MIT, see lib/matter-js-LICENSE.md)
```

The Plinko board runs on [Matter.js](https://brm.io/matter-js/) for
gravity and peg/ball collisions; everything is drawn on a single
`<canvas>` each frame based on the physics engine's body positions.
