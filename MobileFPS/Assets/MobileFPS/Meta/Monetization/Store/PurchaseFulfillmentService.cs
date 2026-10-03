using System;
using System.Collections.Generic;
using MobileFPS.Economy;
using MobileFPS.Profile;

namespace MobileFPS.Monetization
{
    /// <summary>
    /// Profile-backed <see cref="IPurchaseFulfillment"/>: idempotency ledger,
    /// purchase limits, first-purchase bonus, payer flags, and the actual grant.
    /// </summary>
    public sealed class PurchaseFulfillmentService : IPurchaseFulfillment
    {
        private const int MaxRememberedTransactions = 500;

        private readonly MonetizationData _data;
        private readonly InventoryService _inventory;
        private readonly RewardGranter _granter;
        private readonly Func<int> _accountLevel;
        private readonly Action _saveNow;
        private readonly HashSet<string> _processed;

        public PurchaseFulfillmentService(MonetizationData data, InventoryService inventory, RewardGranter granter,
            Func<int> accountLevel, Action saveNow)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _inventory = inventory;
            _granter = granter;
            _accountLevel = accountLevel ?? (() => 1);
            _saveNow = saveNow;
            _processed = new HashSet<string>(_data.processedTransactions, StringComparer.Ordinal);
        }

        public int AccountLevel => _accountLevel();
        public bool IsPayer => _data.lifetimePurchases > 0;

        public bool IsTransactionProcessed(string transactionId)
        {
            return !string.IsNullOrEmpty(transactionId) && _processed.Contains(transactionId);
        }

        public bool HasReachedPurchaseLimit(StoreProductDefinition product)
        {
            if (product.kind == ProductKind.NonConsumable && !string.IsNullOrEmpty(product.entitlementId) && _inventory.Owns(product.entitlementId)) return true;
            return product.maxPurchases > 0 && _data.productPurchaseCounts.GetCount(product.productId) >= product.maxPurchases;
        }

        public bool IsFirstPurchaseBonusAvailable(StoreProductDefinition product)
        {
            return product.firstPurchaseBonusMultiplier > 1 && _data.productPurchaseCounts.GetCount(product.productId) == 0;
        }

        public void Fulfill(StoreProductDefinition product, PurchaseRecord record, bool applyFirstPurchaseBonus)
        {
            // Ledger first: even if a reward handler throws, this transaction can never grant twice.
            _processed.Add(record.TransactionId);
            _data.processedTransactions.AddBounded(record.TransactionId, MaxRememberedTransactions);
            _data.productPurchaseCounts.Increment(product.productId);
            _data.lifetimePurchases++;
            _data.lifetimeSpendUsd += product.referencePriceUsd;

            int multiplier = applyFirstPurchaseBonus ? product.firstPurchaseBonusMultiplier : 1;
            _granter.Grant(product.contents, $"iap_{product.productId}", multiplier);
            if (!string.IsNullOrEmpty(product.entitlementId)) _inventory.Add(product.entitlementId, $"iap_{product.productId}");

            // Persist synchronously BEFORE the caller acknowledges the purchase to the store.
            _saveNow?.Invoke();
        }
    }
}
