# Castle Squad

A merge tower-defense game for kids. Zombies march along the dirt road
toward your castle. Call fighters onto the grass tiles, merge matching
fighters into stronger ones, and stop the zombies before they reach the
gate.

The whole game is one file: `index.html`. Open it in any modern browser
(phone, tablet or computer). Nothing needs to be installed. All the art,
sound effects and music are drawn or generated in code. The only thing
it loads from the internet is the "Lilita One" font from Google Fonts;
without internet it falls back to a system font and still works.

## How to play

1. **Call fighters.** Tap a card in the tray at the bottom to call that
   fighter onto a random empty tile, or drag the card onto the tile you want.
2. **Merge.** Drag a fighter onto another copy of the same fighter at the
   same level (`L.1` + `L.1`) to make one stronger fighter (`L.2`), up
   to `L.7`. Merging also frees up a tile.
3. **Golden sword tiles** make whoever stands on them 50% stronger.
4. **Gold mine.** The miner digs up coins every few seconds. Tap the
   green button under the mine to upgrade it.
5. **Thunder Storm.** When the Captain's ring (top right) is full, tap
   him to zap the zombies closest to the castle.
6. **Sell.** Drag a fighter onto the card tray to sell it for half price.
7. Tap a fighter to see how far it shoots. Pause and x1/x2/x3 speed
   buttons are at the top.

## 500 stages

- 500 stages, 20 waves each, in 20 worlds of 25 stages. The worlds cycle
  through seven places: Green Meadow, Sandy Desert, Frosty Peaks, Zombie
  Lab, Spooky Graveyard, Gorilla Jungle and Lava Land.
- Beat a stage to unlock the next one. Every stage is a little tougher
  than the one before, and later stages send more of the tough zombies.
- Every 5th wave has a boss. The order changes from stage to stage:

  | Boss            | Trick                                   |
  |-----------------|-----------------------------------------|
  | Mushroom King   | Spawns little mushroom zombies          |
  | Zombie Magician | Puts up a magic shield that blocks hits |
  | Gorilla King    | Roars and stuns two of your fighters    |
  | Zombie Dragon   | Heals itself                            |

- Winning a stage for the first time pays gold (more on later stages)
  and gems. Replaying a stage you already beat pays half the gold.

## 1,000 fighters and 7 rarities

Every fighter has its own name, colors and stats, and is one of 12
fighter types: Archer, Blaster, Bomber, Ice Wizard, Zapper, Ninja, Robo,
Flamer, Sniper (always hits the toughest zombie), Alchemist (poison
puddles), Boomerang (hits going out and coming back) and Cannoneer
(knocks zombies back down the road).

| Rarity    | Fighters | Damage | Battle cost | Shop price (gold) | Shop unlocks after | Summon chance |
|-----------|---------:|-------:|------------:|------------------:|-------------------:|--------------:|
| Common    | 270 | x1   | 100% | 150 to 250         | start     | 45%  |
| Uncommon  | 220 | x1.5 | 110% | 500 to 800         | stage 3   | 26%  |
| Rare      | 185 | x2.2 | 125% | 1,500 to 2,500     | stage 10  | 15%  |
| Epic      | 145 | x3.2 | 145% | 5,000 to 8,000     | stage 30  | 9%   |
| Legendary | 100 | x4.8 | 170% | 15,000 to 25,000   | stage 75  | 4%   |
| Mythic    | 53  | x7   | 200% | 45,000 to 70,000   | stage 150 | 0.8% |
| Godly     | 27  | x10  | 240% | 140,000 to 220,000 | stage 250 | 0.2% |

- **Shop:** buy fighters with the gold you win in stages. Better rarities
  cost more gold, and they also cost more coins to call during a battle,
  but they hit much harder for what they cost.
- **Summon:** 100 gems (or 900 for x10) for a random fighter from all
  1,000, so you can get a Godly fighter long before you could buy one.
  Every 10 summons guarantees Epic or better; every 50 guarantees
  Legendary or better. Getting a fighter you already own levels it up
  for free.
- **Army:** see your collection, pick the 5 fighters in your squad, and
  level fighters up with gold (+10% damage per level, up to level 50).
  Epic and better fighters also get extra chain jumps, pierce or splash.
- **Tasks:** goals like "Clear stage 50" or "Collect 100 fighters" that
  pay gems and gold.

Progress is saved in the browser (`localStorage`) on that device.
Progress from earlier versions of the game carries over automatically. Fighters
from the old 1,500-fighter roster become a fighter of the same rarity and level.

## Tuning

Numbers live near the top of the script in `index.html`:

- `RARITIES`: damage, battle cost, shop prices, unlock stage and summon
  odds for each rarity.
- `ARCH`: base damage, speed and range of each of the 12 fighter types.
- `ENEMIES`, `BOSS_HP`: zombie health, speed, coins and castle damage.
- `BALANCE`: zombie speed, spawn spacing, overall toughness, how much
  tougher each wave gets (`growth`) and each stage gets (`stage`).
- `winGold`, `lvCost`: stage rewards and level-up prices.

These were balanced with a bot that plays full games at different points
in the game. Examples: starter fighters at Lv.1 win stage 1, Rare
fighters at Lv.6 win stage 100, Mythic at Lv.22 win stage 300, and Godly
at around Lv.38 win stage 500. A 20-wave stage takes about 12 to 16
minutes at x1 speed.
