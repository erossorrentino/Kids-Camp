# Crime City (working title)

An open-world crime game in the GTA tradition: steal cars, plan and run
heists, build wanted stars, buy guns and vehicles. Built as a real Unity
project with working, data-driven systems rather than hand-placed content,
so the requested scale (1,000+ vehicles, 800+ weapons, 2,000+ heists) is
achieved by generation, not by faking numbers.

## House rule: heists are planning-based

Every heist requires prep before you run it, not just a getaway car and a
gun: a specific vehicle category (a boat for a dock job, a submarine for
an offshore smuggling run, a chopper for a rooftop score), 1-3 tools
(lockpicks, a hacking rig, thermal drill, disguise kit, scuba gear...),
and 1-3 crew roles (driver, hacker, gunman, lookout, demolitions,
pilot). Show up under-prepped and you can still run it, but the payout
scales down and the alarm trips immediately. Getting the loadout right
*is* the heist, more than the shootout is. See `HeistManager.cs` and each
heist's `planning` block in `heists.json`.

## What's actually here vs. what still needs Unity Editor work

This was built in a headless environment with no Unity Editor and no
`dotnet` available, so **nothing here has been compiled or playtested**.
What you're getting:

- Real, complete C# gameplay systems (not stubs) for driving, shooting,
  the wanted/star system, NPCs, dealerships, gun stores, robberies, and
  the heist planning flow.
- Real generated data: 1,050 vehicles, 820 weapons, 2,010 heists (see
  counts below), each with plausible real-world-scaled pricing.
- A procedural city layout generator (roads + building blocks by
  district) using primitive geometry, because I can't author textured
  3D models or hand-place a real city in this environment.

What it does **not** include, because it requires the Unity Editor GUI,
an art pipeline, or asset packs I don't have access to here:
- Any 3D models, textures, or animations. Vehicles/weapons/characters are
  data entries with no mesh yet -- drop in an asset pack (Synty, KitBash,
  or your own models) and wire each catalog entry's `id` to a prefab.
- Scene files (`.unity`), prefabs, and Canvas/UI -- these are binary/
  Editor-managed assets that need to be built inside Unity itself. The
  `DebugHUD.cs` OnGUI readout exists so you can verify systems are wired
  correctly before investing in real UI art.
- Compilation verification. Read through the scripts for anything that
  looks off before you hit Play; I'd normally run a build to catch typos
  but couldn't here.

**First thing to do when you open this in Unity Hub**: create an empty
scene, add empty GameObjects for `CatalogService`, `PlayerWallet`,
`WantedSystem`, `HeistManager`, drop a `CharacterController` + the player
scripts on a capsule tagged `Player`, and you have a runnable core loop
to build the rest of the scene around.

## Content scale

| Catalog  | Count | Source |
|----------|-------|--------|
| Vehicles | 1,200 | `Assets/StreamingAssets/Data/vehicles.json` |
| Weapons  | 900   | `Assets/StreamingAssets/Data/weapons.json` |
| Heists   | 2,010 | `Assets/StreamingAssets/Data/heists.json` |

Regenerate or resize any of these with `python3 tools/generate_data.py`
(deterministic, fixed seed -- edit the pools/ranges at the top of the
script and re-run). Heist payouts are enforced to fall between $250,000
and $2,000,000, per spec. Vehicle prices are scaled to match real-world
categories (a Compact runs ~$9k-22k; a HyperCar runs into the millions;
a Submarine into the tens of millions), same for weapons (a melee weapon
is a few hundred dollars, black-market heavy ordnance runs into the
hundreds of thousands). All vehicle/weapon/gang names are invented, the
same way GTA uses "Pegassi" instead of Ferrari -- no real brand or
trademarked names are used anywhere in the catalogs.

### Fun / exotic tier

On top of the realistic catalog, there's a pricier novelty tier of both
vehicles and weapons:

- **245 exotic vehicles**: `FlyingCar` ($2.5M-$9M, actually flies),
  `StealthSuperCar` (radar-invisible supercar, up to $9.5M),
  `RocketDragster` (nitro-boosted one-seaters up to 600 km/h),
  `AmphibiousHyperCar` (drives on water), `HoverBike`, `MonsterTruck`
  (crushes obstacles), and `ArmoredLimo`. All purchasable at dealerships
  like anything else, just at halo prices. See `FUN_VEHICLE_CATEGORIES`
  and their `specialTags` in the generator/`VehicleDefinition`.
- **346 laser/energy weapons**: `LaserPistol`, `LaserRifle`, `PulseSMG`,
  `PlasmaShotgun`, `PlasmaCannon`, `RailGun`, `IonBlaster`,
  `FreezeRayGun`, `ChainLightningStaff` -- all black-market only, priced
  well above their ballistic equivalents, and three of them are
  mechanically distinct rather than just reskinned damage numbers (see
  `PlayerCombat.cs`): the **chain lightning staff** arcs to up to 2
  nearby targets on hit, the **freeze ray** disables a pedestrian
  non-lethally instead of taking them down (and doesn't add wanted
  heat), and the **ion blaster**'s EMP disables law enforcement without
  counting as an armed assault. `WeaponDefinition.energyWeapon` and
  `.specialEffect` are exposed as data so VFX/animation work (laser
  beam visuals, muzzle glow, etc.) can hook in once real art exists.

## Wanted system (1-10 stars)

- Killing 2 witnessed pedestrians earns your first star (per spec);
  further witnessed kills, robberies, and heist alarms add more.
- Stars decay over time once you're out of sight of law enforcement.
- Response force escalates with stars: 1-2 = local police, 3-4 = police
  with roadblocks, 5-6 = SWAT, 7-8 = National Guard, 9-10 = full
  military -- see `WantedSystem.cs` / `LawResponseSpawner.cs`.

## Project layout

```
Assets/
  Scripts/
    Core/        PlayerWallet
    Data/        DataModels, CatalogService (loads the 3 JSON catalogs)
    Player/      PlayerController, PlayerCombat, PlayerHealth, PlayerInventory
    Vehicles/    VehicleController (data-driven handling), Dealership
    Weapons/     GunStore (legit + black-market)
    NPC/         PedestrianAI, LawResponderAI, LawResponseSpawner
    Wanted/      WantedSystem
    Missions/    HeistManager, HeistPrepVendor
    World/       RobbableLocation (banks/stores/gas stations), CityGenerator
    UI/          DebugHUD
  StreamingAssets/Data/  vehicles.json, weapons.json, heists.json
tools/generate_data.py   catalog generator (Python, no Unity needed to run)
```

## Controls (current bindings, all in code, easy to remap)

- WASD / Shift to run, Space to jump (on foot)
- Mouse1 (right click) melee, Fire1 (left click) shoot equipped weapon
- F to enter/exit a nearby vehicle; WASD to drive while in one
- E (held) to rob a nearby bank/store/gas station

## Content rating note

This is a stylized crime game (property theft, armed heists, simulated
combat with NPCs and law enforcement) in the same vein as GTA, Saints
Row, or Watch Dogs -- fictional characters, fictional brands, no real
persons or real-world targets depicted.
