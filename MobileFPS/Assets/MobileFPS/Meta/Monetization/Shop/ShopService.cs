using System;
using System.Globalization;
using MobileFPS.Analytics;
using MobileFPS.Core;
using MobileFPS.Economy;
using MobileFPS.Profile;

namespace MobileFPS.Monetization
{
    public enum ShopPurchaseResult : byte
    {
        Purchased,
        InsufficientFunds,
        AlreadyOwned,
        LimitReached,
        NotAvailable,
    }

    /// <summary>Virtual-currency purchases (skins, bundles). Validates, spends, grants, and logs economy telemetry.</summary>
    public sealed class ShopService
    {
        private readonly Wallet _wallet;
        private readonly InventoryService _inventory;
        private readonly RewardGranter _granter;
        private readonly MonetizationData _data;
        private readonly ITimeProvider _time;
        private readonly Action _markDirty;

        public ShopService(Wallet wallet, InventoryService inventory, RewardGranter granter, MonetizationData data,
            ITimeProvider time, Action markDirty)
        {
            _wallet = wallet;
            _inventory = inventory;
            _granter = granter;
            _data = data;
            _time = time;
            _markDirty = markDirty;
        }

        public ShopPurchaseResult CanPurchase(ShopItemDefinition offer)
        {
            if (offer == null || !IsAvailable(offer)) return ShopPurchaseResult.NotAvailable;
            if (offer.maxPurchases > 0 && _data.shopPurchaseCounts.GetCount(offer.offerId) >= offer.maxPurchases) return ShopPurchaseResult.LimitReached;
            if (IsCosmeticAlreadyOwned(offer)) return ShopPurchaseResult.AlreadyOwned;
            if (!_wallet.CanAfford(offer.currency, offer.price)) return ShopPurchaseResult.InsufficientFunds;
            return ShopPurchaseResult.Purchased;
        }

        public ShopPurchaseResult Purchase(ShopItemDefinition offer)
        {
            ShopPurchaseResult check = CanPurchase(offer);
            if (check != ShopPurchaseResult.Purchased) return check;

            if (offer.price > 0 && !_wallet.TrySpend(offer.currency, offer.price, $"shop_{offer.offerId}")) return ShopPurchaseResult.InsufficientFunds;
            _data.shopPurchaseCounts.Increment(offer.offerId);
            _markDirty?.Invoke();
            _granter.Grant(offer.contents, $"shop_{offer.offerId}");
            Telemetry.Log("shop_purchase", "offer", offer.offerId, "currency", offer.currency, "price", offer.price);
            return ShopPurchaseResult.Purchased;
        }

        public bool IsAvailable(ShopItemDefinition offer)
        {
            DateTime now = _time.UtcNow;
            if (TryParse(offer.availableFromUtc, out DateTime from) && now < from) return false;
            if (TryParse(offer.availableUntilUtc, out DateTime until) && now >= until) return false;
            return true;
        }

        private bool IsCosmeticAlreadyOwned(ShopItemDefinition offer)
        {
            // A single-item cosmetic offer the player already owns would be wasted money: block it.
            RewardItem[] items = offer.contents?.items;
            return items != null && items.Length == 1 && items[0].type == RewardType.Item && _inventory.Owns(items[0].itemId);
        }

        private static bool TryParse(string value, out DateTime result)
        {
            result = default;
            return !string.IsNullOrEmpty(value) && DateTime.TryParse(value, CultureInfo.InvariantCulture,
                DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out result);
        }
    }
}
