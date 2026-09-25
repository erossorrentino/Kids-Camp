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
5. **Hero power.** When your hero's ring (top right) is full, tap the
   hero to use their power (see Heroes below).
6. **Sell.** Drag a fighter onto the card tray to sell it for half price.
7. Tap a fighter to see how far it shoots. Pause and x1/x2/x3 speed
   buttons are at the top.

## 500 stages

- 500 stages, 20 waves each, in 20 worlds of 25 stages. The worlds cycle
  through seven places: Green Meadow, Sandy Desert, Frosty Peaks, Zombie
  Lab, Spooky Graveyard, Gorilla Jungle and Lava Land.
- Beat a stage to unlock the next one. The game is hard: every stage is
  tougher than the one before (about 1.2% more zombie health per stage,
  on top of tough waves with lots of zombies), and later stages send more
  of the tough zombies. Leveling up fighters and buying better ones is
  how you keep up.
- Every 5th wave has a boss. The order changes from stage to stage:

  | Boss            | Trick                                   |
  |-----------------|-----------------------------------------|
  | Mushroom King   | Spawns little mushroom zombies          |
  | Zombie Magician | Puts up a magic shield that blocks hits |
  | Gorilla King    | Roars and stuns two of your fighters    |
  | Zombie Dragon   | Heals itself                            |

- Other zombies to watch out for:

  | Zombie          | From      | Trick                                              |
  |-----------------|-----------|----------------------------------------------------|
  | Knight Zombie   | stage 3   | Its shield blocks 40% of all damage                |
  | Slime           | stage 5   | Pops into two fast little slimes                   |
  | Nurse Zombie    | stage 8   | Heals the zombies around it every few seconds      |
  | Treasure Goblin | sometimes | Runs past the castle; catch it for gold and 5 gems |

- The **Zombie Book** (book button, top left) shows every zombie, how
  tough and fast it is, and where it shows up. Zombies you haven't met
  yet stay hidden until you reach their stage.
- Winning a stage for the first time pays gold (more on later stages)
  and gems. Replaying a stage you already beat pays half the gold.
- After every win, tap the **victory chest** for a bonus: extra gold,
  gems, or sometimes a free fighter.

## 1,000 fighters and 7 rarities

Every fighter has its own name, colors and stats, and is one of 12
fighter types: Archer, Blaster, Bomber, Ice Wizard, Zapper, Ninja, Robo,
Flamer, Sniper (always hits the toughest zombie), Alchemist (poison
puddles), Boomerang (hits going out and coming back) and Cannoneer
(knocks zombies back down the road).

| Rarity    | Fighters | Damage | Battle cost | Shop price (gold) | Summon chance |
|-----------|---------:|-------:|------------:|------------------:|--------------:|
| Common    | 270 | x1   | 100% | 150 to 250         | 45%  |
| Uncommon  | 220 | x1.5 | 110% | 500 to 800         | 26%  |
| Rare      | 185 | x2.2 | 125% | 1,500 to 2,500     | 15%  |
| Epic      | 145 | x3.2 | 145% | 5,000 to 8,000     | 9%   |
| Legendary | 100 | x4.8 | 170% | 15,000 to 25,000   | 4%   |
| Mythic    | 53  | x7   | 200% | 45,000 to 70,000   | 0.8% |
| Godly     | 27  | x10  | 240% | 140,000 to 220,000 | 0.2% |

- **Shop:** buy any fighter, of any rarity, as soon as you have the gold.
  There is nothing to unlock first. Gold comes from winning stages. Better
  rarities cost more gold, and they also cost more coins to call during a battle,
  but they hit much harder for what they cost.
- **Summon:** 100 gems (or 900 for x10) for a random fighter from all
  1,000, so you can get a Godly fighter long before you could buy one.
  Every 10 summons guarantees Epic or better; every 50 guarantees
  Legendary or better. Getting a fighter you already own levels it up
  for free.
- **Army:** see your collection, pick the 5 fighters in your squad, and
  level fighters up with gold (+10% damage per level, up to level 50).
  Epic and better fighters also get extra chain jumps, pierce or splash.
- **Tasks:** goals like "Clear stage 50", "Collect 100 fighters" or
  "Catch 5 treasure goblins" that pay gems and gold.
- **Daily rewards** (calendar button, top left): claim a present once a
  day. The 7 days go round in a circle: gold, gems, a free summon, and a
  big gems-and-summon prize on day 7. A red dot shows when one is ready.

## Heroes

Your hero sits in the top-right corner of the battle. Pick one in Army.
The Captain is free; the others are unlocked with gems.

| Hero         | Power         | Gems | What it does                                               |
|--------------|---------------|-----:|------------------------------------------------------------|
| Captain Bolt | Thunder Storm | free | Zaps the 7 zombies closest to the castle and stuns them    |
| Frost Queen  | Blizzard      | 300  | Freezes every zombie for 3 seconds, then slows them        |
| Doctor Patch | Castle Repair | 500  | Fixes 5 castle hearts and shields the gate for 6 seconds   |
| Battle King  | Battle Cry    | 800  | All fighters attack twice as fast for 8 seconds            |

## Castle upgrades

In the Shop, switch to **Castle upgrades** to spend gold on upgrades
that last forever:

| Upgrade       | Levels | Each level                                   |
|---------------|-------:|----------------------------------------------|
| Castle Walls  | 10     | +2 castle hearts                             |
| Deep Mine     | 4      | The gold mine starts one level higher        |
| War Chest     | 10     | +50 coins at the start of every battle       |
| Hero Training | 5      | Hero power charges 8% faster                 |

Progress is saved in the browser (`localStorage`) on that device.
Progress from earlier versions of the game carries over automatically. Fighters
from the old 1,500-fighter roster become a fighter of the same rarity and level.

## Tuning

Numbers live near the top of the script in `index.html`:

- `RARITIES`: damage, battle cost, shop prices and summon odds for each
  rarity.
- `ARCH`: base damage, speed and range of each of the 12 fighter types.
- `ENEMIES`, `BOSS_HP`: zombie health, speed, coins and castle damage.
- `HEROES`, `UPGRADES`, `DAILY`: hero powers and prices, castle upgrade
  prices, and the 7 daily rewards.
- `BALANCE`: zombie speed, spawn spacing, overall toughness, how much
  tougher each wave gets (`growth`) and each stage gets (`stage`).
- `winGold`, `lvCost`: stage rewards and level-up prices.

These were balanced with a bot that plays full games at different points
in the game. Examples: starter fighters at Lv.1 only just win stage 1
with good merging (a careless player loses it), Rare fighters need about
Lv.10 for stage 100, Mythic about Lv.30 for stage 300, and Godly fighters
need about Lv.46 to 50 for stage 500. A 20-wave stage takes about 15 to 20
minutes at x1 speed, so the x2 and x3 buttons help.
