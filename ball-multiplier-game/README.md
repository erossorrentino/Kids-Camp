# Ball Multiplier Merge

A browser mini-game: money balls drop from the top of a Plinko-style
board, pass through 3 stacked colored starting walls, then fall free
and bounce off whichever multiplier slots they hit before cashing out
at the bottom — and you can touch or click-drag any ball in flight to
steer it yourself. Merge 3 identical multipliers to upgrade them, and
spend your earnings in the chest shop or on upgrades.

## How to play

- Balls drop out of one or more launch lanes at the top of the board.
  Every ball starts at **$1.10** and immediately passes through all
  **3 Starting Walls** — colored bands that each add their own bonus
  cash, every lane's balls passing through the same 3 walls. Each
  wall's color and dollar amount scale with its own upgrade level (buy
  them independently in the panel above the board).
- After the walls, the ball falls freely until it bounces off one of
  the 10 multiplier slots spread across the board — there are no pegs,
  so a slot is the only thing (besides the side walls) a ball can hit.
  A slot can only boost a given ball once per drop.
- **Touch or click-and-drag a ball** anywhere in the board to grab it
  and steer it up, down, or sideways — right into the multiplier slot
  you're aiming for. Let go and it drops back into free fall from
  wherever you released it. Tapping without grabbing a ball still
  equips/unequips a multiplier on whichever board slot you tap.
- Any slot holding a multiplier tile (×2, ×3, ×5, ... up to ×200)
  multiplies the ball's value if it bounces into it on the way down.
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

The board runs on [Matter.js](https://brm.io/matter-js/) for gravity
and ball/slot collisions; everything — launch lanes, the 3 starting
walls, slots, and balls — is drawn on a single `<canvas>` each frame
based on the physics engine's body positions. Dragging a ball works by
pinning its physics body to the pointer position every frame (via
Pointer Events, so mouse and touch share one code path) and handing it
back to gravity on release. A ball resting perfectly balanced against
a slot can stall with zero net force; it's periodically nudged and, as
a last resort, force-cashed-out after 20s so nothing ever gets stuck
for good.
