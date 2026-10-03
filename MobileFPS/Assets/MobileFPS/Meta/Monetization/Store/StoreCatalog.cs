using MobileFPS.Economy;
using UnityEngine;

namespace MobileFPS.Monetization
{
    /// <summary>All real-money products. Mirrors the Play Console in-app product list.</summary>
    [CreateAssetMenu(menuName = "MobileFPS/Monetization/Store Catalog", fileName = "StoreCatalog")]
    public sealed class StoreCatalog : ScriptableObject
    {
        public StoreProductDefinition[] products = new StoreProductDefinition[0];

        public StoreProductDefinition Find(string productId)
        {
            if (products == null) return null;
            for (int i = 0; i < products.Length; i++)
            {
                if (products[i] != null && products[i].productId == productId) return products[i];
            }
            return null;
        }

        /// <summary>
        /// A launch-ready default ladder: price points at the Play Store's common
        /// tiers, with bonus percentages rising with pack size (bigger packs = better
        /// value = higher average transaction value).
        /// </summary>
        public static StoreCatalog CreateDefault()
        {
            var catalog = CreateInstance<StoreCatalog>();
            catalog.name = "DefaultStoreCatalog";
            catalog.products = new[]
            {
                StoreProductDefinition.Create("gems_100", "100 Gems", ProductKind.Consumable, RewardBundle.Of(RewardItem.Gems(100)), "$0.99", 0.99, firstBonus: 2),
                StoreProductDefinition.Create("gems_550", "550 Gems", ProductKind.Consumable, RewardBundle.Of(RewardItem.Gems(550)), "$4.99", 4.99, firstBonus: 2),
                StoreProductDefinition.Create("gems_1200", "1,200 Gems", ProductKind.Consumable, RewardBundle.Of(RewardItem.Gems(1200)), "$9.99", 9.99, firstBonus: 2, badge: "POPULAR"),
                StoreProductDefinition.Create("gems_2600", "2,600 Gems", ProductKind.Consumable, RewardBundle.Of(RewardItem.Gems(2600)), "$19.99", 19.99, firstBonus: 2),
                StoreProductDefinition.Create("gems_7000", "7,000 Gems", ProductKind.Consumable, RewardBundle.Of(RewardItem.Gems(7000)), "$49.99", 49.99, firstBonus: 2, badge: "BEST VALUE"),
                StoreProductDefinition.Create("starter_pack", "Starter Pack", ProductKind.NonConsumable,
                    RewardBundle.Of(RewardItem.Gems(300), RewardItem.Item("skin_ar_starter_elite"), RewardItem.DoubleXp(120), RewardItem.Credits(2000)),
                    "$2.99", 2.99, maxPurchases: 1, badge: "ONE TIME", minLevel: 3, entitlement: "starter_pack"),
                StoreProductDefinition.Create("battlepass_s01_bundle", "Season 1 Premium Pass + 10 Tiers", ProductKind.Consumable,
                    RewardBundle.Of(RewardItem.PremiumPass(), RewardItem.BattlePassXp(10000)),
                    "$14.99", 14.99, maxPurchases: 1, badge: "SEASON"),
            };
            return catalog;
        }
    }
}
