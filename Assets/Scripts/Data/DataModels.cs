using System;
using System.Collections.Generic;

namespace CrimeCity.Data
{
    [Serializable]
    public class VehicleDefinition
    {
        public string id;
        public string name;
        public string category;
        public int price;
        public int topSpeedKmh;
        public float acceleration;
        public float handling;
        public int armor;
        public int seats;
        public bool purchasable;
        public List<string> specialTags;

        public bool HasTag(string tag) => specialTags != null && specialTags.Contains(tag);
    }

    [Serializable]
    public class VehicleCatalogFile
    {
        public List<VehicleDefinition> vehicles;
    }

    [Serializable]
    public class WeaponDefinition
    {
        public string id;
        public string name;
        public string category;
        public int price;
        public int damage;
        public float fireRateRps;
        public int magazineSize;
        public bool requiresBlackMarket;
        public bool legalToCarryOpenly;
        /// <summary>True for laser/plasma/rail/ion-style sci-fi weapons (see WEAPON_SPECIAL_EFFECT in generate_data.py).</summary>
        public bool energyWeapon;
        /// <summary>Flavor/gameplay hook, e.g. "piercing_beam", "freeze", "chain_lightning", "emp_disable". Empty for ordinary firearms.</summary>
        public string specialEffect;
    }

    [Serializable]
    public class WeaponCatalogFile
    {
        public List<WeaponDefinition> weapons;
    }

    [Serializable]
    public class HeistPlanning
    {
        public string requiredVehicleCategory;
        public List<string> requiredTools;
        public List<string> requiredCrewRoles;
    }

    [Serializable]
    public class HeistDefinition
    {
        public string id;
        public string name;
        public string district;
        public string rivalCrew;
        public int payoutMin;
        public int payoutMax;
        public int difficulty;
        public int starGainOnAlarm;
        public HeistPlanning planning;
        public string briefing;
    }

    [Serializable]
    public class HeistCatalogFile
    {
        public List<HeistDefinition> heists;
    }
}
