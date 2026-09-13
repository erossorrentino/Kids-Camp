#!/usr/bin/env python3
"""
Content generator for the game's data-driven catalogs.

Produces Assets/StreamingAssets/Data/{vehicles,weapons,heists}.json.
Re-run this any time you want to change catalog size or pricing curves --
it is deterministic (fixed seed) so re-running without changes produces
identical output.

All brand/model/gang/heist names are invented for this project -- no real
manufacturer, weapon, or trademarked names are used, same approach GTA
itself takes (Pegassi, Vapid, Bravado, etc. are not real car brands).
"""
import json
import os
import random

random.seed(20240913)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "Assets", "StreamingAssets", "Data")
os.makedirs(OUT_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# VEHICLES
# ---------------------------------------------------------------------------

VEHICLE_BRANDS = [
    "Aracer", "Bravado", "Coldwell", "Draymont", "Emberline", "Falkirk",
    "Grantham", "Halstead", "Ironclad", "Juno", "Kestrel", "Lonestar",
    "Maddox", "Northbay", "Obsidian", "Pinnacle", "Quorra", "Ridgeline",
    "Sterling", "Talon", "Underwood", "Vesper", "Whitfield", "Xenon",
    "Yardley", "Zephyr",
]

VEHICLE_MODEL_WORDS = [
    "Cascade", "Marauder", "Comet", "Horizon", "Sable", "Drift", "Orbit",
    "Vantage", "Coronet", "Rampart", "Sierra", "Tempest", "Vortex", "Nomad",
    "Fathom", "Skyline", "Ashen", "Blitzen", "Cortez", "Delta", "Echo",
    "Flare", "Gale", "Harlow", "Ibis", "Jetty", "Kilo", "Lance", "Mirage",
    "Nyx", "Onyx", "Pulse", "Quest", "Radiant", "Spire", "Torque", "Umbra",
    "Valor", "Wraith", "Yonder", "Zenith",
]

# category: (min_price, max_price, top_speed_kmh, seats, spawn_weight)
VEHICLE_CATEGORIES = {
    "Compact":          (9_000,     22_000,     (150, 180), 4),
    "Sedan":            (18_000,    42_000,     (170, 210), 5),
    "SUV":              (28_000,    95_000,     (160, 200), 7),
    "PickupTruck":      (24_000,    85_000,     (150, 190), 5),
    "Van":              (20_000,    55_000,     (140, 170), 8),
    "Motorcycle":       (4_500,     38_000,     (160, 260), 2),
    "MuscleCar":        (35_000,    120_000,    (220, 280), 4),
    "SportsCar":        (55_000,    180_000,    (250, 310), 2),
    "SuperCar":         (200_000,   4_500_000,  (320, 490), 2),
    "HyperCar":         (1_200_000, 9_000_000,  (400, 520), 2),
    "Limousine":        (90_000,    400_000,    (180, 210), 8),
    "SemiTruck":        (100_000,   200_000,    (120, 150), 2),
    "PoliceCar":        (35_000,    60_000,     (200, 240), 4),
    "MilitaryJeep":     (80_000,    250_000,    (140, 170), 4),
    "ArmoredTruck":     (150_000,   400_000,    (120, 160), 3),
    "Tank":             (2_000_000, 8_000_000,  (60, 80),   3),
    "SpeedBoat":        (30_000,    350_000,    (100, 160), 4),
    "FishingBoat":      (15_000,    60_000,     (40, 70),   6),
    "Yacht":            (500_000,   12_000_000, (60, 90),   12),
    "Submarine":        (2_500_000, 25_000_000, (30, 55),   6),
    "Jetski":           (7_000,     22_000,     (90, 120),  2),
    "Helicopter":       (450_000,   7_000_000,  (200, 300), 5),
    "MilitaryHelicopter": (3_000_000, 15_000_000, (250, 330), 4),
    "SmallPlane":       (350_000,   3_000_000,  (300, 450), 6),
    "CargoPlane":       (5_000_000, 30_000_000, (500, 650), 2),
    "FighterJet":       (8_000_000, 40_000_000, (900, 1500), 1),
    "BMX":              (200,       900,        (25, 35),   1),
    # --- fun / exotic halo vehicles: pricier and wilder than anything above ---
    "RocketDragster":   (600_000,   3_200_000,  (450, 600), 1),
    "MonsterTruck":     (120_000,   950_000,    (110, 150), 4),
    "HoverBike":        (150_000,   900_000,    (200, 280), 1),
    "FlyingCar":        (2_500_000, 9_000_000,  (350, 420), 2),
    "StealthSuperCar":  (3_000_000, 9_500_000,  (330, 420), 2),
    "AmphibiousHyperCar": (2_000_000, 7_000_000, (300, 400), 2),
    "ArmoredLimo":      (400_000,   2_200_000,  (190, 230), 8),
}

TRIMS = ["", "Base", "Sport", "GT", "Turbo", "RS", "SE", "Custom", "Elite", "Tuned"]

FUN_VEHICLE_CATEGORIES = {
    "RocketDragster", "MonsterTruck", "HoverBike", "FlyingCar",
    "StealthSuperCar", "AmphibiousHyperCar", "ArmoredLimo",
}


def gen_vehicles(target_count=1200):
    vehicles = []
    idx = 0
    cats = list(VEHICLE_CATEGORIES.items())
    brand_model_used = set()
    while len(vehicles) < target_count:
        cat_name, (pmin, pmax, (smin, smax), seats) = cats[idx % len(cats)]
        idx += 1
        brand = random.choice(VEHICLE_BRANDS)
        model = random.choice(VEHICLE_MODEL_WORDS)
        trim = random.choice(TRIMS)
        key = (brand, model, trim, cat_name)
        if key in brand_model_used:
            continue
        brand_model_used.add(key)

        price = random.randint(pmin, pmax)
        # round to a "real world sticker price" style number
        price = round(price, -2 if price < 100_000 else -3)

        top_speed = random.randint(smin, smax)
        accel = round(random.uniform(2.5, 9.5), 1)
        handling = round(random.uniform(3.0, 10.0), 1)
        armor = random.randint(0, 10)

        special = []
        if cat_name in ("Submarine",):
            special.append("underwater_breathing")
        if cat_name in ("Tank", "ArmoredTruck", "MilitaryJeep", "MilitaryHelicopter"):
            special.append("bulletproof")
        if cat_name in ("PoliceCar",):
            special.append("law_enforcement_only")
        if cat_name in ("Tank", "FighterJet", "MilitaryHelicopter", "ArmoredTruck"):
            special.append("military_or_heist_reward_only")
        if cat_name == "RocketDragster":
            special += ["nitro_boost", "one_shot_top_speed"]
        if cat_name == "MonsterTruck":
            special.append("crush_obstacles")
        if cat_name == "HoverBike":
            special += ["low_altitude_flight", "ignores_traffic"]
        if cat_name == "FlyingCar":
            special += ["flight_capable", "ignores_traffic"]
        if cat_name == "StealthSuperCar":
            special += ["radar_invisible", "nitro_boost"]
        if cat_name == "AmphibiousHyperCar":
            special += ["amphibious", "nitro_boost"]
        if cat_name == "ArmoredLimo":
            special.append("bulletproof")

        name = f"{brand} {model}" + (f" {trim}" if trim else "")
        vehicles.append({
            "id": f"veh_{cat_name.lower()}_{len(vehicles):04d}",
            "name": name,
            "category": cat_name,
            "price": price,
            "topSpeedKmh": top_speed,
            "acceleration": accel,
            "handling": handling,
            "armor": armor,
            "seats": seats,
            "purchasable": "military_or_heist_reward_only" not in special
                            and "law_enforcement_only" not in special,
            "specialTags": special,
        })
    return vehicles


# ---------------------------------------------------------------------------
# WEAPONS
# ---------------------------------------------------------------------------

WEAPON_CATEGORIES = {
    # category: (min_price, max_price, dmg_range, category_weight)
    "Melee":        (50,      2_500,     (10, 45)),
    "Throwable":    (150,     4_000,     (30, 100)),
    "Pistol":       (400,     6_000,     (18, 35)),
    "Revolver":     (600,     9_000,     (25, 45)),
    "MachinePistol":(1_200,   12_000,    (15, 28)),
    "SMG":          (2_000,   25_000,    (18, 32)),
    "Shotgun":      (2_500,   35_000,    (40, 90)),
    "AssaultRifle": (4_500,   60_000,    (25, 42)),
    "BattleRifle":  (6_000,   75_000,    (30, 48)),
    "SniperRifle":  (8_000,   150_000,   (70, 140)),
    "LMG":          (12_000,  220_000,   (28, 45)),
    "Heavy":        (50_000,  1_500_000, (100, 400)),
    "Launcher":     (75_000,  2_500_000, (300, 900)),
    "Special":      (25_000,  900_000,   (20, 500)),
    # --- fun sci-fi / energy weapons: pricier novelty tier, black-market only ---
    "LaserPistol":       (3_000,   40_000,    (30, 55)),
    "LaserRifle":        (15_000,  220_000,   (45, 80)),
    "PulseSMG":          (12_000,  150_000,   (20, 38)),
    "PlasmaShotgun":     (30_000,  380_000,   (70, 140)),
    "PlasmaCannon":      (120_000, 2_000_000, (200, 600)),
    "RailGun":           (200_000, 3_000_000, (250, 700)),
    "IonBlaster":        (40_000,  500_000,   (30, 60)),
    "FreezeRayGun":      (60_000,  700_000,   (15, 40)),
    "ChainLightningStaff": (90_000, 1_200_000, (40, 90)),
}

# category -> a flavor effect exposed as data for VFX/gameplay hooks (see
# WeaponDefinition.specialEffect in DataModels.cs). No mesh/particle work
# is wired up yet -- these are just tagged so a laser gun *reads* as a
# laser gun instead of reusing a plain damage number.
WEAPON_SPECIAL_EFFECT = {
    "LaserPistol": "precision_burn",
    "LaserRifle": "piercing_beam",
    "PulseSMG": "rapid_pulse",
    "PlasmaShotgun": "molten_spread",
    "PlasmaCannon": "explosive_plasma",
    "RailGun": "armor_piercing",
    "IonBlaster": "emp_disable",
    "FreezeRayGun": "freeze",
    "ChainLightningStaff": "chain_lightning",
}
ENERGY_WEAPON_CATEGORIES = set(WEAPON_SPECIAL_EFFECT.keys())

WEAPON_NAME_WORDS = [
    "Viper", "Falcon", "Ghost", "Reaper", "Talon", "Cobra", "Widow",
    "Raptor", "Hornet", "Jackal", "Kraken", "Mongoose", "Phantom",
    "Scorpion", "Wolverine", "Banshee", "Cyclone", "Diablo", "Ember",
    "Fury", "Grim", "Havoc", "Inferno", "Judge", "Krieg", "Longbow",
    "Menace", "Nemesis", "Outlaw", "Piranha", "Quake", "Razor", "Sable",
    "Tremor", "Undertow", "Vulture", "Warlock", "Xerus", "Yeoman",
    "Zealot",
]
ENERGY_WEAPON_NAME_WORDS = [
    "Photon", "Neutron", "Quantum", "Fusion", "Pulsar", "Nova", "Graviton",
    "Tesla", "Positron", "Starfall", "Voltaic", "Singularity", "Meteor",
    "Aurora", "Eclipse", "Supernova", "Overcharge", "Zero-Point",
]
WEAPON_MAKERS = [
    "Blackline", "Coldforge", "Direwolf", "Eastgate", "Fenwick", "Grimsby",
    "Hollowpoint", "Ironvale", "Jagermeister", "Kingsford",
]
ENERGY_WEAPON_MAKERS = [
    "Orbital Dynamics", "Helix Armaments", "Nimbus Labs", "Cryostar",
    "Vantablack Systems", "Quasar Defense", "Arclight Industries",
]

WEAPON_TIERS = ["Mk1", "Mk2", "Mk3", "Compact", "Extended", "Tactical", "Elite", "Prototype"]


def gen_weapons(target_count=900):
    weapons = []
    used = set()
    cats = list(WEAPON_CATEGORIES.items())
    idx = 0
    while len(weapons) < target_count:
        cat_name, (pmin, pmax, (dmin, dmax)) = cats[idx % len(cats)]
        idx += 1
        is_energy = cat_name in ENERGY_WEAPON_CATEGORIES
        maker = random.choice(ENERGY_WEAPON_MAKERS if is_energy else WEAPON_MAKERS)
        word = random.choice(ENERGY_WEAPON_NAME_WORDS if is_energy else WEAPON_NAME_WORDS)
        tier = random.choice(WEAPON_TIERS)
        key = (maker, word, tier, cat_name)
        if key in used:
            continue
        used.add(key)

        price = random.randint(pmin, pmax)
        price = round(price, -1 if price < 1000 else (-2 if price < 100_000 else -3))
        damage = random.randint(dmin, dmax)
        fire_rate = round(random.uniform(0.5, 12.0), 1) if cat_name not in ("Melee",) else 0
        magazine = random.choice([1, 6, 7, 10, 15, 17, 20, 30, 32, 50, 75, 100]) if cat_name not in ("Melee", "Throwable") else 1
        legal_to_own = cat_name in ("Melee",)

        name = f"{maker} {word} {tier}"
        weapons.append({
            "id": f"wpn_{cat_name.lower()}_{len(weapons):04d}",
            "name": name,
            "category": cat_name,
            "price": price,
            "damage": damage,
            "fireRateRps": fire_rate,
            "magazineSize": magazine,
            "requiresBlackMarket": is_energy or price >= 200_000 or cat_name in ("Heavy", "Launcher"),
            "legalToCarryOpenly": legal_to_own,
            "energyWeapon": is_energy,
            "specialEffect": WEAPON_SPECIAL_EFFECT.get(cat_name, ""),
        })
    return weapons


# ---------------------------------------------------------------------------
# HEISTS / MISSIONS
# ---------------------------------------------------------------------------

HEIST_TEMPLATES = [
    # name, min_payout, max_payout, required_vehicle_categories, difficulty
    ("Corner Bank Job", 250_000, 500_000, ["Sedan", "SUV", "MuscleCar"], 1),
    ("Downtown Bank Vault", 400_000, 900_000, ["SUV", "Van", "ArmoredTruck"], 2),
    ("Jewelry Store Smash-and-Grab", 250_000, 600_000, ["Motorcycle", "SportsCar"], 1),
    ("Armored Truck Ambush", 350_000, 800_000, ["MuscleCar", "PickupTruck"], 2),
    ("Casino Vault Break-In", 900_000, 2_000_000, ["Limousine", "SUV"], 5),
    ("Art Museum Heist", 500_000, 1_200_000, ["Van", "Sedan"], 3),
    ("Port Cargo Container Theft", 600_000, 1_500_000, ["SemiTruck", "SpeedBoat"], 3),
    ("Yacht Vault Score", 700_000, 1_800_000, ["Yacht", "SpeedBoat"], 4),
    ("Offshore Submarine Smuggling Run", 1_000_000, 2_000_000, ["Submarine", "SpeedBoat"], 5),
    ("Cargo Plane Skyjack", 1_200_000, 2_000_000, ["CargoPlane", "SmallPlane"], 5),
    ("Military Base Weapons Raid", 900_000, 2_000_000, ["MilitaryJeep", "Helicopter"], 5),
    ("Train Robbery", 400_000, 1_000_000, ["Motorcycle", "PickupTruck"], 3),
    ("Mansion Vault Job", 350_000, 900_000, ["Sedan", "SUV"], 2),
    ("Crypto Exchange Server Heist", 600_000, 1_600_000, ["Van", "Sedan"], 4),
    ("Prison Break Extraction", 500_000, 1_400_000, ["Helicopter", "MuscleCar"], 4),
    ("Drug Cartel Warehouse Takedown", 450_000, 1_100_000, ["PickupTruck", "SUV"], 3),
    ("Diamond Convoy Hijack", 800_000, 2_000_000, ["MuscleCar", "SUV"], 4),
    ("Harbor Fuel Tanker Heist", 500_000, 1_300_000, ["FishingBoat", "SpeedBoat"], 3),
    ("Skyscraper Rooftop Vault", 900_000, 2_000_000, ["Helicopter", "Limousine"], 5),
    ("Gas Station Robbery Chain", 250_000, 350_000, ["Motorcycle", "Compact"], 1),
]

DISTRICTS = [
    "Downtown", "Portside", "Old Town", "Industrial Flats", "Sunset Hills",
    "Northgate", "Lakeshore", "Redline District", "The Docks", "Marina Bay",
    "Highrise Row", "Copperfield", "West End", "Union Square", "Ashwood",
    "Bellmere", "Crescent Park", "Ironside", "Millbrook", "Vantage Point",
]

GANG_CREWS = [
    "the Ferris Crew", "the Nightowls", "Cassidy's outfit", "the Drift Kings",
    "the Blackout Gang", "the Silver Foxes", "the Harbor Rats",
    "the Cormorant Syndicate", "the Redline Outfit", "the Quiet Hours crew",
]

PREP_VEHICLE_SLOT = "getaway_vehicle"
PREP_TOOL_OPTIONS = [
    "lockpick_kit", "hacking_rig", "thermal_drill", "disguise_kit",
    "scuba_gear", "grappling_hook", "explosive_charges", "signal_jammer",
    "fake_id_set", "cutting_torch",
]
PREP_CREW_OPTIONS = [
    "driver", "hacker", "gunman", "lookout", "demolitions_expert", "pilot",
]


def gen_heists(target_count=2010):
    heists = []
    idx = 0
    while len(heists) < target_count:
        tmpl = HEIST_TEMPLATES[idx % len(HEIST_TEMPLATES)]
        name, pmin, pmax, req_vehicles, base_diff = tmpl
        district = random.choice(DISTRICTS)
        crew = random.choice(GANG_CREWS)
        variant_num = idx // len(HEIST_TEMPLATES) + 1
        idx += 1

        payout = random.randint(pmin, pmax)
        payout = round(payout, -3)
        payout = max(250_000, min(2_000_000, payout))

        difficulty = min(10, base_diff + (variant_num % 4))
        star_gain_on_alarm = min(6, 1 + difficulty // 2)

        num_tools = 1 if difficulty <= 2 else (2 if difficulty <= 4 else 3)
        num_crew = 1 if difficulty <= 2 else (2 if difficulty <= 4 else 3)

        prep = {
            "requiredVehicleCategory": random.choice(req_vehicles),
            "requiredTools": random.sample(PREP_TOOL_OPTIONS, k=num_tools),
            "requiredCrewRoles": random.sample(PREP_CREW_OPTIONS, k=num_crew),
        }

        heists.append({
            "id": f"heist_{len(heists):04d}",
            "name": f"{name} - {district} (v{variant_num})",
            "district": district,
            "rivalCrew": crew,
            "payoutMin": payout,
            "payoutMax": min(2_000_000, payout + random.randint(50_000, 250_000)),
            "difficulty": difficulty,
            "starGainOnAlarm": star_gain_on_alarm,
            "planning": prep,
            "briefing": (
                f"{crew.capitalize()} tipped us off about {name.lower()} in {district}. "
                f"Prep the job right and it pays out big -- blow the prep and you're "
                f"improvising with the cops already circling."
            ),
        })
    return heists


def main():
    vehicles = gen_vehicles()
    weapons = gen_weapons()
    heists = gen_heists()

    with open(os.path.join(OUT_DIR, "vehicles.json"), "w") as f:
        json.dump({"vehicles": vehicles}, f, indent=1)
    with open(os.path.join(OUT_DIR, "weapons.json"), "w") as f:
        json.dump({"weapons": weapons}, f, indent=1)
    with open(os.path.join(OUT_DIR, "heists.json"), "w") as f:
        json.dump({"heists": heists}, f, indent=1)

    print(f"vehicles: {len(vehicles)}")
    print(f"weapons:  {len(weapons)}")
    print(f"heists:   {len(heists)}")
    assert len(vehicles) >= 1000
    assert len(weapons) >= 800
    assert len(heists) >= 2000
    assert all(250_000 <= h["payoutMin"] <= 2_000_000 for h in heists)
    assert all(250_000 <= h["payoutMax"] <= 2_000_000 for h in heists)

    fun_vehicle_count = sum(1 for v in vehicles if v["category"] in FUN_VEHICLE_CATEGORIES)
    energy_weapon_count = sum(1 for w in weapons if w["energyWeapon"])
    print(f"fun/exotic vehicles: {fun_vehicle_count}")
    print(f"laser/energy weapons: {energy_weapon_count}")
    assert fun_vehicle_count >= 100
    assert energy_weapon_count >= 100
    print("OK: all counts and heist payout ranges satisfy the target spec.")


if __name__ == "__main__":
    main()
