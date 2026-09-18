# Ball Multiplier Merge

A browser mini-game: money balls drop from the top of a Plinko-style
board, pass through a colored starting wall, then bounce off pegs and
multiplier slots spread across the whole board before cashing out at
the bottom. Merge 3 identical multipliers to upgrade them, and spend
your earnings in the chest shop or on upgrades.

## How to play

- Balls drop out of one or more launch lanes at the top of the board.
  Every ball starts at **$1.10** and immediately passes through the
  **Starting Wall** — a colored band that adds bonus cash. The wall's
  color and dollar amount scale with its upgrade level (buy it in the
  panel above the board).
- After the wall, the ball bounces down through a field of pegs, like
  Plinko — where it lands and which of the 10 multiplier slots it
  happens to hit is physics-driven, not fixed.
- Any slot holding a multiplier tile (×2, ×3, ×5, ... up to ×200)
  multiplies the ball's value if the ball bounces into it on the way
  down. A slot can only boost a given ball once per drop.
- Buy chests in the shop with your money to get random multiplier
  tiles, delivered straight to your **Multiplier Storage**. Pricier
  chests have better odds of high-tier multipliers.
- Storage automatically merges 3 identical tiles into one tile of the
  next tier up, any time it changes. Tap a stored tile then tap an
  empty board slot to equip it there (equipping onto the board can
  also trigger a separate 3-of-a-kind merge on the board itself). Tap
  a filled board slot to unequip it back to storage, or select a
  stored tile and hit **Sell** to cash it in directly.
- **Ball Speed** upgrades shrink the spawn interval and, every couple
  of levels, unlock another launch lane at the top of the board (up to
  5), so balls come out both faster and from more places at once.

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
gravity and peg/ball collisions; everything — launch lanes, the
starting wall, pegs, slots, and balls — is drawn on a single
`<canvas>` each frame based on the physics engine's body positions.
