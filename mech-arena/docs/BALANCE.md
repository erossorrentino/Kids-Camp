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

## Known tensions

- **Assault mechs are strong in Control and weak in Free For All.** This is
  intended, but the gap may be too wide.
- **Missile boats punish new players hardest**, because countering them
  means knowing that smoke, ECM and simply breaking line of sight all drop
  a lock. The Codex covers it; the tutorial does not yet drill it.
- **The `-prime` weapon variants are close to strictly better** than their
  base rows for anyone who can afford them. They are priced at roughly nine
  times the base, which is a gate rather than a trade-off.
