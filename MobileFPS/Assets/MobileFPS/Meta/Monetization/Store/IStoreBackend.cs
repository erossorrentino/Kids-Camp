using System;
using System.Collections.Generic;

namespace MobileFPS.Monetization
{
    /// <summary>A completed payment awaiting fulfillment and acknowledgement.</summary>
    public struct PurchaseRecord
    {
        public string ProductId;
        public string TransactionId;
        public string Receipt;
        public bool Restored;
    }

    public enum PurchaseFailureKind : byte
    {
        UserCancelled,
        PaymentDeclined,
        ProductUnavailable,
        DuplicateTransaction,
        NetworkError,
        StoreUnavailable,
        Unknown,
    }

    /// <summary>Callbacks from a store backend. May be invoked on any thread.</summary>
    public interface IStoreBackendListener
    {
        void OnStoreInitialized(bool success, string error);

        /// <summary>
        /// Payment done (new, restored, or replayed at startup because the app died
        /// before acknowledging). The listener grants, persists, THEN calls
        /// <see cref="IStoreBackend.ConfirmPending"/>.
        /// </summary>
        void OnPurchaseSucceeded(PurchaseRecord record);

        void OnPurchaseFailed(string productId, PurchaseFailureKind reason, string message);

        /// <summary>Payment pending (e.g. cash at a convenience store). The success callback comes later, maybe next session.</summary>
        void OnPurchaseDeferred(string productId);
    }

    /// <summary>
    /// Billing adapter (Unity IAP / Google Play Billing). Gameplay and UI only
    /// see <see cref="IAPStoreManager"/>.
    /// </summary>
    public interface IStoreBackend
    {
        string Name { get; }
        bool IsInitialized { get; }
        void Initialize(IReadOnlyList<StoreProductDefinition> products, IStoreBackendListener listener);
        void Purchase(string productId);

        /// <summary>
        /// Acknowledges/consumes the purchase with the store. On Google Play,
        /// purchases not acknowledged within 3 days are refunded automatically,
        /// so a lost confirm is a refund, never a double grant.
        /// </summary>
        void ConfirmPending(string productId, string transactionId);

        bool TryGetLocalizedPrice(string productId, out string localizedPrice);
        void RestorePurchases();
    }

    /// <summary>
    /// Verifies a receipt before granting. Production: send the purchase token to
    /// your server, which verifies it with the Google Play Developer API
    /// (purchases.products.get) and grants server-side.
    /// </summary>
    public interface IReceiptValidator
    {
        void Validate(PurchaseRecord record, StoreProductDefinition product, Action<bool, string> onValidated);
    }

    /// <summary>
    /// Accepts every receipt. Development only: shipping without server-side
    /// validation invites forged-receipt piracy of premium currency.
    /// </summary>
    public sealed class TrustingReceiptValidator : IReceiptValidator
    {
        public void Validate(PurchaseRecord record, StoreProductDefinition product, Action<bool, string> onValidated)
        {
            onValidated?.Invoke(!string.IsNullOrEmpty(record.TransactionId), "trusting_validator");
        }
    }

    /// <summary>Integration assemblies register a backend factory here (see AdProviderRegistry for the pattern).</summary>
    public static class StoreBackendRegistry
    {
        public static Func<IStoreBackend> Factory { get; set; }
    }

    /// <summary>Grants purchased content. Implemented by the meta layer (profile-backed).</summary>
    public interface IPurchaseFulfillment
    {
        bool IsTransactionProcessed(string transactionId);
        bool HasReachedPurchaseLimit(StoreProductDefinition product);
        bool IsFirstPurchaseBonusAvailable(StoreProductDefinition product);
        int AccountLevel { get; }

        /// <summary>Grants and persists synchronously; the store is acknowledged right after this returns.</summary>
        void Fulfill(StoreProductDefinition product, PurchaseRecord record, bool applyFirstPurchaseBonus);
    }
}
