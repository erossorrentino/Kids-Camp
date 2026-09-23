# Balance model

Notes on why the numbers are the numbers. Everything here is data in
`src/data/`, so all of it is meant to be argued with and changed.

## Tonnage and the payload budget

A chassis's `payload` is `round(tons * 0.42 + 4)`. That is the tonnage
available for weapons, and it is the single strongest constraint on a
build. A 20-ton Locust gets 12 tons of guns; a 100-ton Atlas gets 46.

The intent is that weight class buys *options*, not raw power. An Atlas
carrying four medium lasers is not meaningfully better armed than a
Blackjack carrying four medium lasers — it is just much harder to kill and
much slower to get anywhere.

## Armour and structure

`armour` is one pool per chassis, divided across the eight sections by one
of four spreads:

| Spread | Character |
| --- | --- |
| `balanced` | Even. The default. |
| `frontal` | Thick centre torso, thin arms. Line mechs that trade head-on. |
| `armsout` | Heavy arms. Chassis whose guns are in the arms and can shield with them. |
| `legger` | Heavy legs. Jump-jet chassis that take landing damage. |

Internal structure is a flat 42% of the section's armour. Weapons flagged
`shred` do 60% more damage to structure than to armour, which is what makes
machine guns and sustained beams worth carrying as finishers rather than
openers.

Overflow from a destroyed section rolls into the centre torso at half
value. Without that rule, blowing an arm off would be a pure waste of the
damage that did it.

## Heat

`heatCap` is the ceiling and `sinks` is the dissipation per second. Firing
at full rate with a build whose heat-per-second exceeds its sink rating
climbs to shutdown; the hangar shows both numbers side by side.

Two modifiers matter:

- Moving at full speed cuts dissipation by up to 28%. Standing still to
  cool is a real tactical choice, and `Brace` adds another 40%.
- Overheating does 60 damage to the centre torso, so repeatedly redlining
  is not free even if you are willing to eat the downtime.

Heat is also a weapon: `emp`-flagged weapons and the EMP Burst ability
dump heat into a target rather than damaging it, which is how a support
build kills an assault mech it could never out-damage.

## Range brackets

Every weapon does full damage to `opt` and falls linearly to zero at `max`.
`overpen` weapons keep 55% at maximum range and ignore half of a shield
bubble.

Weapons are priced against sustained DPS, but the actual value of a weapon
is how much of its bracket a given map lets you use. This is why the arena
list deliberately spans everything from Salt Flat (no cover, 680m across)
to Undercity (tunnels, 440m across): a loadout should be a choice you can
get wrong.

## Damage scale

Every damage figure in the weapon catalogue is multiplied by
`DAMAGE_SCALE = 1.5` (`src/data/weapons.js`), splash and healing included,
so the numbers the hangar shows are the numbers in the fight. Fights were
too long: a medium took the best part of half a minute of focused fire to
drop. Over the same 82 simulated seconds on the same five arenas, the sim
went from 44–46 kills to 65. It is symmetrical — bots carry the same guns.

### Damage floor

No gun deals 50 damage a second or less. The weakest are lifted along a
straight line that meets the untouched guns at 80 DPS — a Small Laser goes
from 32 to 65, a Medium Laser from 47 to 70, anything already at 80 or
more is left alone — so the order is kept: a smaller gun still trails a
bigger one and a refit still beats its base. Slow single-shot guns get
bigger hits fired a little slower, so a single hit also reads above 50
without the Small Laser catching the Medium. Repair, shield projector and
target designator are exempt; their job is not damage. `validate.mjs`
fails if any gun drops to 50.

The numbers that pop over a target merge: hits on the same machine inside
a third of a second add into one total that climbs, written `2.9k` past a
thousand. A machine-gun burst reads as one number, not a dozen sixes.

## Rarity

Five grades: Common, Rare, Epic, Legendary, Mythic (`src/data/rarity.js`).
The rule the player can rely on is **rarer is better, and rarer costs
more**, and `tools/validate.mjs` enforces both halves.

- **Weapons** are ranked by value — the hand-set price already encodes
  archetype and refit — and cut into a pyramid: about 30 % Common, 28 %
  Rare, 22 % Epic, 13 % Legendary, 7 % Mythic. Tier alone would have put
  half the catalogue at the top grade. Each grade adds damage on top of the
  global scale: ×1.00, ×1.07, ×1.15, ×1.24, ×1.34.
- **Chassis** take their grade straight from their tier. They are already
  graded — a Mythic assault carries four times a Common light's armour — so
  for them rarity is a label and a price band, not an extra multiplier.
- **Prices** are laid out in bands per grade, so every Rare is dearer than
  every Common, every Epic dearer than every Rare, and so on; within a band
  the bigger, stronger item is dearer. Weapons run 100 CR to 60,000 CR,
  chassis up to 60,000. The old catalogue topped out at 237,600 CR for one
  gun, which at 1–2k CR a match was not a goal, it was a wall.
- The validator checks the strict price ordering across grades, and that
  within one weapon family the straight refits (Standard, Mk II, Mk III,
  Prime) never lose damage per second as they climb.

### Bots and rarity

A rarer gun hits harder, so bots cannot simply roll from the whole shop: a
new pilot's Common lance would be outgunned by the catalogue, not
out-flown. `Match` reads the best rarity in the player's lance and caps bot
weapons there, shifted by difficulty (recruit −1, regular 0, veteran and
elite +1, ace +2), never below Rare so every hardpoint can still be filled.

## Stick steering

The stick means "go that way", in screen space, for every chassis. Weight
decides how fast a machine gets going, not which way it goes. Two things
used to break that on a heavy:

- Velocity was damped per axis, so a machine told to go right carried its
  forward speed for the best part of a second — an Atlas was still 22°
  off half a second after the stick moved. Now the velocity is split: the
  part along the new heading accelerates at the chassis's own rate, and
  the sideways slide bleeds off at 14/s. Reversing brakes 2.2× harder than
  it accelerates, so pulling back stops and turns rather than arcing.
- The legs turned at the chassis's own rate — 62°/s for an Atlas, three
  seconds to face a stick pulled back — so it visibly walked one way while
  facing another. Under stick steering the legs turn at 2.5× their rate
  and never slower than 260°/s.

Measured half a second after swinging the stick at full speed, travel is
within 4° and the body within 0° on a Wasp and an Atlas alike; it was 31°
and 124° on the Atlas. `tools/handling.mjs` fails on the old code.

## Bot difficulty

Difficulty never touches damage, armour or speed. The five tiers vary:

| Field | Recruit | Ace |
| --- | --- | --- |
| `react` — seconds to re-evaluate a target | 0.55 | 0.09 |
| `aimError` — degrees of jitter | 5.2° | 0.55° |
| `lead` — how much they lead a moving target | 0.35 | 1.0 |
| `cover` / `rangeIQ` / `heatIQ` | 0.25–0.35 | 0.92–1.0 |
| `burstDiscipline` — trigger control | 0.35 | 0.97 |

An Ace bot is dangerous because it holds its optimal bracket, does not
overheat, and stops shooting when it should — not because it cheats.

## Progression

Rewards lean on participation so a losing player still advances:

```
credits = (240 + kills*85 + assists*30 + damage/22 + healing/30 + winBonus) * modeBonus
```

`winBonus` is 500 for a win, 200 for a draw. Rank gates content by tier;
credits then buy it. Tier unlock ranks are 1, 4, 8, 13 and 19.

## Melee

Melee damage is `tons * 2.1 + 40` with an arm to swing, `tons * 1.3 + 40`
as a kick. An Atlas punch is therefore about 250 damage with no heat and
no ammunition, which sounds absurd until you account for the range: the
reach is `radius + height * 0.42`, roughly nine metres for an assault mech.
To land it you have to stand somewhere every weapon they own is inside its
optimal bracket.

It also shoves: impulse scales with the tonnage ratio, so a hundred-ton
mech genuinely knocks a Locust off its feet and a Locust barely moves an
Atlas. That asymmetry is the point — melee is an assault mech's tool and a
light mech's finisher, not a general-purpose attack.

## Resupply pads

Pads exist to break stalemates. A mech that is dry, cooking, or down to
structure has a specific place to go, and so does the enemy who knows it.
Dormancy is twenty-two to thirty-four seconds depending on type, and a pad
that has nothing to give does not trigger — walking over coolant while cold
leaves it standing for the teammate behind you.

Measured effect over 75 simulated seconds on Refinery: 9.9k damage and 3
kills before pads and melee, 23.6k and 11 after. Pads are most of that;
they keep mechs in the fight instead of walking home.

## Weapon convergence

Hardpoints are metres apart. Firing every barrel parallel to the crosshair
means an arm-mounted gun lands its shots a couple of metres to the side:
irrelevant at 400m, a clean miss at 30m. Fire control converges the barrels
on the current target's range instead, with a 60m floor so that a small
aiming error does not become a large one past the convergence point.

The first implementation converged on whatever the crosshair ray hit, which
looked correct and was much worse: in a city the ray clips a building corner
forty metres away while the target is two hundred metres down the street,
and every arm-mounted shot went wide. Downtown fell from 7.8k damage to 1.2k
over the same 75 seconds. Converging on the target's range instead fixed it.

## Ammunition cook-off

Destroying a section that still holds magazine-fed rounds detonates them
into the centre torso:

```
damage = dmg * sqrt(pellets) * (roundsLeft / fullBin) * 1.8
capped at the centre torso's maximum structure * 1.2
```

The `sqrt(pellets)` damping matters. Using the raw pellet count, a full
LRM-20 bin cooked off for 832, which was an automatic centre-torso kill on
anything it was bolted to. Damped, a full bin runs 129 for an LRM-20, 173
for an AC/20 and 331 for a Heavy Torpedo rack — against 580 of centre-torso
structure on an Atlas and 106 on a Wasp.

The intent is a real build decision rather than a gotcha: a fat ammunition
bin in a side torso is a liability you accept for sustained fire, energy
weapons never cook off at all, and Reactive Plating vents most of the blast
outward.

## Arena pacing

`tools/sim.mjs` reports damage and kills per arena over a fixed simulated
window, which is the only reliable way to tell a dense map from a broken
one. Across all 41 arenas at 75 seconds: 264 kills, median 15.4k damage.

The grid layouts were the outlier. A dense city is a maze of forty-metre
sightlines, and two teams could circle each other for a whole match without
trading fire — Downtown managed 1.2k damage where its peers were doing 15k.
Cutting two boulevards through the grid brought it to 12.9k without making
it an open field.

## Bugs the tools found

Worth recording, because each was invisible from a screenshot:

- **Canyon arenas were unwinnable.** The trench walls formed a continuous
  barrier between the two spawn sides, so the teams could never meet.
  `sim.mjs` reported zero damage on those maps.
- **Three modes had no arena.** The map table's default mode list predated
  Hardpoint, Last Lance and Juggernaut, so choosing any of them would have
  crashed. `validate.mjs` found it in a fraction of a second.
- **One-shot kills were credited to nobody.** `takeDamage` set
  `lastDamagedBy` *after* resolving the damage, but resolving it can destroy
  the mech synchronously, and the death handler reads that field. A kill that
  was also the victim's first damage showed up in the killfeed as "THE
  ARENA" and scored nothing.
- **Convergence made dense maps worse before it made them better.** See
  above.
- **The ability panel declared `position` twice**, so it rendered at the top
  left of the screen with its cooldown bar stretched across the viewport.
  CSS has no error for this; it just silently takes the last declaration.

## Known tensions

- **Assault mechs are strong in Control and weak in Free For All.** This is
  intended, but the gap may be too wide.
- **Missile boats punish new players hardest**, because countering them
  means knowing that smoke, ECM and simply breaking line of sight all drop
  a lock. The Codex covers it; the tutorial does not yet drill it.
- **The `-prime` weapon variants are close to strictly better** than their
  base rows for anyone who can afford them. They are priced at roughly nine
  times the base, which is a gate rather than a trade-off.
