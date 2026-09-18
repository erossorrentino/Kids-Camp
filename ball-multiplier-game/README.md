# Ball Multiplier Merge

A browser mini-game: money balls roll across a 10-slot board, getting
multiplied by whatever multiplier tiles you've placed, then cash out at
the end. Merge 3 identical multipliers to upgrade them, and spend your
earnings in the chest shop or on upgrades.

## How to play

- A ball worth `$1` (more once upgraded) spawns automatically and travels
  through all 10 board slots in a snake path, then cashes out.
- Any slot holding a multiplier tile (×2, ×3, ×5, ... up to ×200)
  multiplies the ball's value as it passes through.
- Buy chests in the shop with your money to get random multiplier tiles.
  Pricier chests have better odds of high-tier multipliers.
- Tap a multiplier in "Your Multipliers" then tap an empty board slot to
  place it. Getting 3 of the same tier anywhere on the board
  automatically merges them into one tile of the next tier up.
- Tap a placed tile to sell it back for coins if you need the space.
- Spend money on **Ball Speed** (spawns balls faster) and **Starting
  Value** (each new ball is worth more before multipliers) upgrades.

Progress is saved automatically to your browser's local storage.

## Running it

It's a static site with no build step or dependencies. Either:

- Open `index.html` directly in a browser, or
- Serve the folder locally, e.g. `python3 -m http.server` from this
  directory and visit `http://localhost:8000`.

## Files

```
index.html   Page structure / layout
style.css    Theming and animations
game.js      Game state, board/shop logic, ball animation loop
```
