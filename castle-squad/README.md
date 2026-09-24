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
   fighter onto a random empty tile. You can also drag a card onto the
   tile you want.
2. **Merge.** Drag a fighter onto another fighter of the same kind and
   the same level (`L.1` + `L.1`) to make one stronger fighter (`L.2`),
   up to `L.7`. Merging also frees up a tile.
3. **Golden sword tiles** make whoever stands on them 50% stronger.
4. **Gold mine.** The miner digs up coins every few seconds. Tap the
   green upgrade button under the mine to earn more.
5. **Thunder Storm.** When the Captain's ring (top right) is full, tap
   him to zap the zombies closest to the castle and freeze them for a moment.
6. **Sell.** Drag a fighter onto the card tray to sell it for half of
   what it cost.
7. Tap a fighter to see how far it shoots and how hard it hits. The
   pause and x2 speed buttons are at the top.

The castle has 20 hearts. Each wave gets tougher, and every 5th wave
has a boss:

| Wave | Boss            | Trick                                   |
|------|-----------------|-----------------------------------------|
| 5    | Mushroom King   | Spawns little mushroom zombies          |
| 10   | Zombie Magician | Puts up a magic shield that blocks hits |
| 15   | Gorilla King    | Roars and stuns two of your fighters    |

## Fighters

| Fighter    | Cost | What it does                               | How to get it |
|------------|------|--------------------------------------------|---------------|
| Archer     | 100  | Long-range arrows                          | Starter       |
| Blaster    | 100  | Very fast shots                            | Starter       |
| Bomber     | 150  | Dynamite that hits a whole group           | Starter       |
| Ice Wizard | 125  | Slows zombies down                         | Starter       |
| Zapper     | 150  | Lightning that jumps between zombies       | Starter       |
| Ninja      | 125  | Stars that fly through 3 zombies           | Summon        |
| Robo       | 175  | A laser beam that never stops              | Summon        |
| Flamer     | 150  | Fireballs that set zombies on fire         | Summon        |

## Menus

- **Battle:** pick a stage (Green Meadow, Zombie Lab, Gorilla Jungle).
  Beat a stage to unlock the next one.
- **Army:** see every fighter, upgrade them with cards and gold (+15%
  damage per level), and choose which 5 fighters go into battle.
- **Summon:** spend 100 gems to unlock a new fighter or get cards.
  Every 5th summon is guaranteed to unlock a new fighter while any are
  still locked.
- **Tasks:** goals like "Defeat 150 zombies" that pay out gems and gold.

Winning battles, beating bosses and finishing tasks earns gold, gems and
cards. Progress is saved in the browser (`localStorage`) on that device.
Settings (gear icon) has sound and music switches, a how-to-play card
and a "Reset progress" button.

## Tuning

Difficulty numbers live near the top of the script in `index.html`:

- `UNITS`: each fighter's cost, damage, attack speed and range.
- `ENEMIES`: each zombie's health, speed, coins and castle damage.
- `STAGES`: `mul` (health at wave 1) and `growth` (how much tougher
  each wave gets) per stage.
- `BALANCE`: overall zombie speed and spawn spacing.

These were balanced with a bot that plays full games. With every fighter
at Lv.1, a sensible player wins Green Meadow. Zombie Lab needs a few
upgrades (around Lv.3), and Gorilla Jungle needs around Lv.5.
