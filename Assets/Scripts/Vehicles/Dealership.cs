using System.Collections.Generic;
using UnityEngine;
using CrimeCity.Data;
using CrimeCity.Core;
using CrimeCity.Player;

namespace CrimeCity.Vehicles
{
    /// <summary>
    /// A dealership lot. Stocks a filtered slice of the vehicle catalog
    /// (e.g. only "SuperCar" + "SportsCar" for an exotic dealer, or every
    /// purchasable category for a general lot) and sells at catalog price.
    /// </summary>
    public class Dealership : MonoBehaviour
    {
        [SerializeField] private string[] stockedCategories;
        [SerializeField] private GameObject genericVehiclePrefab;
        [SerializeField] private Transform[] deliverySpots;

        public List<VehicleDefinition> GetStock()
        {
            var catalog = CatalogService.Instance;
            if (catalog == null) return new List<VehicleDefinition>();

            var stock = new List<VehicleDefinition>();
            foreach (var v in catalog.Vehicles)
            {
                if (!v.purchasable) continue;
                if (stockedCategories == null || stockedCategories.Length == 0 ||
                    System.Array.IndexOf(stockedCategories, v.category) >= 0)
                {
                    stock.Add(v);
                }
            }
            return stock;
        }

        public bool TryPurchase(string vehicleId, PlayerInventory buyer, out string errorMessage)
        {
            errorMessage = null;
            var def = CatalogService.Instance?.GetVehicle(vehicleId);
            if (def == null) { errorMessage = "That vehicle doesn't exist."; return false; }
            if (!def.purchasable) { errorMessage = "That vehicle isn't for sale here."; return false; }

            if (!PlayerWallet.Instance.TrySpend(def.price))
            {
                errorMessage = $"Not enough cash. Need ${def.price:N0}.";
                return false;
            }

            buyer.AddVehicle(def.id);
            SpawnPurchasedVehicle(def);
            return true;
        }

        private void SpawnPurchasedVehicle(VehicleDefinition def)
        {
            if (genericVehiclePrefab == null || deliverySpots == null || deliverySpots.Length == 0) return;
            var spot = deliverySpots[Random.Range(0, deliverySpots.Length)];
            var go = Instantiate(genericVehiclePrefab, spot.position, spot.rotation);
            var vc = go.GetComponent<VehicleController>();
            vc?.SetVehicleDefinitionId(def.id);
        }
    }
}
