using MobileFPS.Economy;
using UnityEngine;

namespace MobileFPS.Monetization
{
    public enum ProductKind : byte
    {
        Consumable,     // gem packs: buy repeatedly
        NonConsumable,  // starter pack, permanent unlocks: once per account, restorable
        Subscription,   // monthly pass / VIP
    }

    /// <summary>
    /// A real-money product as configured in Google Play Console (the
    /// <see cref="productId"/> must match the console SKU exactly).
    ///
    /// Merchandising levers that move conversion:
    /// - <see cref="firstPurchaseBonusMultiplier"/>: "2x gems on your first purchase
    ///   of this pack" turns a non-payer into a payer, and a player who has paid
    ///   once is far more likely to pay again.
    /// - <see cref="maxPurchases"/> = 1 plus <see cref="minAccountLevel"/>: a
    ///   high-value starter pack shown after the player is hooked (level 3-5).
    /// - <see cref="badge"/>: "BEST VALUE" anchoring on the large pack lifts
    ///   average transaction value.
    /// </summary>
    [CreateAssetMenu(menuName = "MobileFPS/Monetization/Store Product", fileName = "Product_")]
    public sealed class StoreProductDefinition : ScriptableObject
    {
        [Tooltip("Google Play / App Store product id. Never change after release.")]
        public string productId = "gems_100";
        public string displayName = "100 Gems";
        [TextArea] public string description;
        public ProductKind kind = ProductKind.Consumable;

        [Header("Contents")]
        public RewardBundle contents = RewardBundle.Of(RewardItem.Gems(100));
        [Tooltip("Optional permanent entitlement id added to the inventory (non-consumables).")]
        public string entitlementId;

        [Header("Limits & targeting")]
        [Tooltip("0 = unlimited.")]
        public int maxPurchases;
        public int minAccountLevel = 1;

        [Header("Merchandising")]
        [Tooltip("Shown until the store returns the localized price (and in the Editor).")]
        public string fallbackPriceString = "$0.99";
        [Tooltip("USD reference price for analytics (real revenue comes from the store receipt).")]
        public double referencePriceUsd = 0.99;
        [Tooltip("Multiplier applied to currency on the first purchase of this product (1 = none).")]
        public int firstPurchaseBonusMultiplier = 1;
        public string badge;
        public bool featured;
        public int sortOrder;
        public Sprite icon;

        public static StoreProductDefinition Create(string id, string name, ProductKind kind, RewardBundle contents,
            string price, double usd, int firstBonus = 1, int maxPurchases = 0, string badge = null, int minLevel = 1, string entitlement = null)
        {
            var product = CreateInstance<StoreProductDefinition>();
            product.name = id;
            product.productId = id;
            product.displayName = name;
            product.kind = kind;
            product.contents = contents;
            product.fallbackPriceString = price;
            product.referencePriceUsd = usd;
            product.firstPurchaseBonusMultiplier = firstBonus;
            product.maxPurchases = maxPurchases;
            product.badge = badge;
            product.minAccountLevel = minLevel;
            product.entitlementId = entitlement;
            return product;
        }
    }
}
