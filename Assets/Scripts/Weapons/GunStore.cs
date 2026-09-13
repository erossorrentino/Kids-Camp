using System.Collections.Generic;
using UnityEngine;
using CrimeCity.Data;
using CrimeCity.Core;
using CrimeCity.Player;

namespace CrimeCity.Weapons
{
    /// <summary>
    /// A gun store. Legit stores only stock weapons flagged
    /// legalToCarryOpenly / not requiresBlackMarket; the black-market
    /// contact (a separate Dealership-style vendor placed in a shady part
    /// of the city) stocks everything, including the 800-catalog's heavy
    /// weapons and launchers, at a markup.
    /// </summary>
    public class GunStore : MonoBehaviour
    {
        [SerializeField] private bool isBlackMarket;
        [SerializeField] private float blackMarketMarkup = 1.35f;
        [SerializeField] private string[] stockedCategories;

        public List<WeaponDefinition> GetStock()
        {
            var catalog = CatalogService.Instance;
            if (catalog == null) return new List<WeaponDefinition>();

            var stock = new List<WeaponDefinition>();
            foreach (var w in catalog.Weapons)
            {
                if (!isBlackMarket && w.requiresBlackMarket) continue;
                if (stockedCategories != null && stockedCategories.Length > 0 &&
                    System.Array.IndexOf(stockedCategories, w.category) < 0)
                {
                    continue;
                }
                stock.Add(w);
            }
            return stock;
        }

        public int GetPrice(WeaponDefinition def) =>
            isBlackMarket ? Mathf.RoundToInt(def.price * blackMarketMarkup) : def.price;

        public bool TryPurchase(string weaponId, PlayerInventory buyer, out string errorMessage)
        {
            errorMessage = null;
            var def = CatalogService.Instance?.GetWeapon(weaponId);
            if (def == null) { errorMessage = "That weapon doesn't exist."; return false; }
            if (!isBlackMarket && def.requiresBlackMarket)
            {
                errorMessage = "That weapon is black-market only.";
                return false;
            }

            int price = GetPrice(def);
            if (!PlayerWallet.Instance.TrySpend(price))
            {
                errorMessage = $"Not enough cash. Need ${price:N0}.";
                return false;
            }

            buyer.AddWeapon(def.id);
            return true;
        }
    }
}
