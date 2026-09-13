using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace CrimeCity.Data
{
    /// <summary>
    /// Loads the data-driven vehicle / weapon / heist catalogs from
    /// StreamingAssets/Data/*.json at startup. Everything downstream
    /// (dealerships, gun stores, the heist board) reads from here instead
    /// of hand-placed content, which is how the project reaches 1000+
    /// vehicles / 800+ weapons / 2000+ heists without hand-authoring each one.
    /// </summary>
    public class CatalogService : MonoBehaviour
    {
        public static CatalogService Instance { get; private set; }

        public IReadOnlyList<VehicleDefinition> Vehicles => _vehicles;
        public IReadOnlyList<WeaponDefinition> Weapons => _weapons;
        public IReadOnlyList<HeistDefinition> Heists => _heists;

        private List<VehicleDefinition> _vehicles = new List<VehicleDefinition>();
        private List<WeaponDefinition> _weapons = new List<WeaponDefinition>();
        private List<HeistDefinition> _heists = new List<HeistDefinition>();

        private Dictionary<string, VehicleDefinition> _vehicleById;
        private Dictionary<string, WeaponDefinition> _weaponById;
        private Dictionary<string, HeistDefinition> _heistById;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);
            LoadAll();
        }

        private void LoadAll()
        {
            _vehicles = LoadJson<VehicleCatalogFile>("vehicles.json")?.vehicles
                        ?? new List<VehicleDefinition>();
            _weapons = LoadJson<WeaponCatalogFile>("weapons.json")?.weapons
                       ?? new List<WeaponDefinition>();
            _heists = LoadJson<HeistCatalogFile>("heists.json")?.heists
                      ?? new List<HeistDefinition>();

            _vehicleById = new Dictionary<string, VehicleDefinition>();
            foreach (var v in _vehicles) _vehicleById[v.id] = v;

            _weaponById = new Dictionary<string, WeaponDefinition>();
            foreach (var w in _weapons) _weaponById[w.id] = w;

            _heistById = new Dictionary<string, HeistDefinition>();
            foreach (var h in _heists) _heistById[h.id] = h;

            Debug.Log($"[CatalogService] loaded {_vehicles.Count} vehicles, " +
                      $"{_weapons.Count} weapons, {_heists.Count} heists.");
        }

        private T LoadJson<T>(string fileName) where T : class
        {
            string path = Path.Combine(Application.streamingAssetsPath, "Data", fileName);
            string text;
            try
            {
                // On most platforms StreamingAssets is a plain path; on Android
                // it lives inside the APK and needs UnityWebRequest instead --
                // left as a follow-up if/when this ships to Android.
                text = File.ReadAllText(path);
            }
            catch (IOException e)
            {
                Debug.LogError($"[CatalogService] failed to read {path}: {e.Message}");
                return null;
            }
            return JsonUtility.FromJson<T>(text);
        }

        public VehicleDefinition GetVehicle(string id) =>
            _vehicleById != null && _vehicleById.TryGetValue(id, out var v) ? v : null;

        public WeaponDefinition GetWeapon(string id) =>
            _weaponById != null && _weaponById.TryGetValue(id, out var w) ? w : null;

        public HeistDefinition GetHeist(string id) =>
            _heistById != null && _heistById.TryGetValue(id, out var h) ? h : null;

        public List<VehicleDefinition> GetVehiclesByCategory(string category) =>
            _vehicles.FindAll(v => v.category == category);

        public List<HeistDefinition> GetAvailableHeists(int minPayout = 0) =>
            _heists.FindAll(h => h.payoutMin >= minPayout);
    }
}
