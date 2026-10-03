using MobileFPS.Economy;
using UnityEngine;

namespace MobileFPS.Monetization
{
    /// <summary>
    /// An in-game store offer priced in Credits or Gems: weapon skins, bundles,
    /// battle pass tiers. Real money buys Gems ("IAP store"); Gems buy content
    /// here. That two-step funnel lets you run sales, bundles and limited-time
    /// skins without a Play Console change for every item.
    /// </summary>
    [CreateAssetMenu(menuName = "MobileFPS/Monetization/Shop Item", fileName = "ShopItem_")]
    public sealed class ShopItemDefinition : ScriptableObject
    {
        public string offerId = "offer_id";
        public string displayName = "Offer";
        public CurrencyType currency = CurrencyType.Gems;
        public int price = 800;
        [Tooltip("Strike-through 'was' price for sales (0 = none). Anchoring lifts conversion.")]
        public int originalPrice;
        public RewardBundle contents = new RewardBundle();
        [Tooltip("0 = unlimited.")]
        public int maxPurchases = 1;
        [Tooltip("Optional ISO-8601 UTC window for limited-time offers (FOMO done honestly: show the timer).")]
        public string availableFromUtc;
        public string availableUntilUtc;
        public Sprite icon;
    }
}
