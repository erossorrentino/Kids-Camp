using System.Collections.Generic;
using UnityEngine;
using CrimeCity.Data;

namespace CrimeCity.Player
{
    /// <summary>Owned weapons, owned vehicle ids, and heist prep items (tools/crew) the player has acquired.</summary>
    public class PlayerInventory : MonoBehaviour
    {
        public static PlayerInventory Instance { get; private set; }

        private readonly List<string> _ownedWeaponIds = new List<string>();
        private readonly List<string> _ownedVehicleIds = new List<string>();
        private readonly HashSet<string> _ownedTools = new HashSet<string>();
        private readonly HashSet<string> _hiredCrewRoles = new HashSet<string>();

        public string EquippedWeaponId { get; private set; }

        public IReadOnlyList<string> OwnedWeaponIds => _ownedWeaponIds;
        public IReadOnlyList<string> OwnedVehicleIds => _ownedVehicleIds;
        public IReadOnlyCollection<string> OwnedTools => _ownedTools;
        public IReadOnlyCollection<string> HiredCrewRoles => _hiredCrewRoles;

        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        public void AddWeapon(string weaponId)
        {
            if (!_ownedWeaponIds.Contains(weaponId)) _ownedWeaponIds.Add(weaponId);
            EquippedWeaponId = weaponId;
        }

        public void EquipWeapon(string weaponId)
        {
            if (_ownedWeaponIds.Contains(weaponId)) EquippedWeaponId = weaponId;
        }

        public void AddVehicle(string vehicleId)
        {
            if (!_ownedVehicleIds.Contains(vehicleId)) _ownedVehicleIds.Add(vehicleId);
        }

        public void AddTool(string toolId) => _ownedTools.Add(toolId);
        public void HireCrew(string role) => _hiredCrewRoles.Add(role);
        public void ReleaseCrew(string role) => _hiredCrewRoles.Remove(role);

        public WeaponDefinition GetEquippedWeapon()
        {
            if (string.IsNullOrEmpty(EquippedWeaponId)) return null;
            return CatalogService.Instance?.GetWeapon(EquippedWeaponId);
        }
    }
}
