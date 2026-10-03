using System;
using System.Collections.Generic;
using MobileFPS.Analytics;
using MobileFPS.Core;
using MobileFPS.Meta;
using UnityEngine;

namespace MobileFPS.Monetization
{
    public enum PurchaseStatus : byte
    {
        Success,
        Pending,            // deferred payment: content arrives when it clears
        Cancelled,
        Failed,
        NotInitialized,
        LimitReached,
        LevelLocked,
        UnknownProduct,
        AlreadyInProgress,
    }

    public struct PurchaseResult
    {
        public PurchaseStatus Status;
        public string ProductId;
        public string Message;
    }

    /// <summary>
    /// Real-money store facade: catalog, localized prices, purchase flow, receipt
    /// validation and idempotent fulfillment.
    ///
    /// The purchase flow is the part most IAP integrations get wrong. The order is:
    /// <code>
    /// 1. store reports payment        (any thread -> marshalled to main)
    /// 2. dedupe by transaction id     (replays after crashes must not double-grant)
    /// 3. validate receipt             (server-side in production)
    /// 4. grant + persist synchronously
    /// 5. acknowledge to the store     (ONLY after 4, so a crash between 4 and 5
    ///                                  replays at next launch and hits step 2)
    /// </code>
    /// Payments that arrive before the meta layer is wired (pending transactions
    /// delivered during store init) are queued, not dropped.
    /// </summary>
    [AutoCreateSingleton]
    [DefaultExecutionOrder(-450)] // before MetaGame wires it
    public sealed class IAPStoreManager : Singleton<IAPStoreManager>, IStoreBackendListener
    {
        [SerializeField] private StoreCatalog catalog;

        private readonly Dictionary<string, Action<PurchaseResult>> _callbacks = new Dictionary<string, Action<PurchaseResult>>();
        private readonly Queue<PurchaseRecord> _awaitingFulfillment = new Queue<PurchaseRecord>();
        private IStoreBackend _backend;
        private IPurchaseFulfillment _fulfillment;
        private IReceiptValidator _validator;

        public StoreCatalog Catalog
        {
            get
            {
                EnsureCatalog();
                return catalog;
            }
        }
        public bool IsInitialized { get; private set; }
        public string BackendName => _backend?.Name ?? "none";

        public event Action<bool> Initialized;

        protected override void OnSingletonAwake()
        {
            EnsureCatalog();
            MainThreadDispatcher.Warmup();
        }

        private void EnsureCatalog()
        {
            if (catalog == null) catalog = Resources.Load<StoreCatalog>("MobileFPS/StoreCatalog");
            if (catalog == null) catalog = StoreCatalog.CreateDefault();
        }

        /// <summary>Connects to the store. Called by MetaGame once the profile is loaded.</summary>
        public void Initialize(IPurchaseFulfillment fulfillment, IReceiptValidator validator = null)
        {
            _fulfillment = fulfillment ?? throw new ArgumentNullException(nameof(fulfillment));
            EnsureCatalog();
            _validator = validator ?? new TrustingReceiptValidator();
            if (_validator is TrustingReceiptValidator && !Application.isEditor && !Debug.isDebugBuild)
            {
                Debug.LogError("[IAP] Release build is using TrustingReceiptValidator. Plug in server-side validation before launch.");
            }

            if (_backend == null)
            {
                _backend = StoreBackendRegistry.Factory?.Invoke();
                if (_backend == null) _backend = new MockStoreBackend();
            }
            _backend.Initialize(catalog.products, this);
        }

        public StoreProductDefinition FindProduct(string productId) => Catalog.Find(productId);

        /// <summary>Localized price from the store ("₹399", "4,99 €"), falling back to the catalog string.</summary>
        public string GetPriceString(string productId)
        {
            if (_backend != null && _backend.TryGetLocalizedPrice(productId, out string price) && !string.IsNullOrEmpty(price)) return price;
            StoreProductDefinition product = catalog.Find(productId);
            return product != null ? product.fallbackPriceString : string.Empty;
        }

        public PurchaseStatus CanPurchase(string productId)
        {
            StoreProductDefinition product = catalog.Find(productId);
            if (product == null) return PurchaseStatus.UnknownProduct;
            if (!IsInitialized || _fulfillment == null) return PurchaseStatus.NotInitialized;
            if (_fulfillment.HasReachedPurchaseLimit(product)) return PurchaseStatus.LimitReached;
            if (_fulfillment.AccountLevel < product.minAccountLevel) return PurchaseStatus.LevelLocked;
            if (_callbacks.ContainsKey(productId)) return PurchaseStatus.AlreadyInProgress;
            return PurchaseStatus.Success;
        }

        public bool IsFirstPurchaseBonusAvailable(string productId)
        {
            StoreProductDefinition product = catalog.Find(productId);
            return product != null && _fulfillment != null && _fulfillment.IsFirstPurchaseBonusAvailable(product);
        }

        /// <summary>
        /// Starts a purchase. <paramref name="onComplete"/> fires once with the final
        /// status, except for deferred payments: it fires with
        /// <see cref="PurchaseStatus.Pending"/> first and again when the payment
        /// clears in the same session. Purchases that clear in a later session still
        /// arrive as <see cref="PurchaseCompletedEvent"/>s, so UI should listen to
        /// that event as well.
        /// </summary>
        public void Purchase(string productId, Action<PurchaseResult> onComplete)
        {
            PurchaseStatus check = CanPurchase(productId);
            if (check != PurchaseStatus.Success)
            {
                onComplete?.Invoke(new PurchaseResult { Status = check, ProductId = productId });
                return;
            }

            _callbacks[productId] = onComplete;
            Telemetry.Log("iap_purchase_started", "product", productId);
            _backend.Purchase(productId);
        }

        public void RestorePurchases() => _backend?.RestorePurchases();

        // ------------------------------------------------------------------
        // IStoreBackendListener (any thread)
        // ------------------------------------------------------------------

        void IStoreBackendListener.OnStoreInitialized(bool success, string error)
        {
            MainThreadDispatcher.Run(() =>
            {
                IsInitialized = success;
                Telemetry.Log("iap_initialized", "backend", _backend.Name, "success", success, "error", error ?? string.Empty);
                if (!success) Debug.LogWarning($"[IAP] Store initialization failed: {error}");
                Initialized?.Invoke(success);
                DrainAwaitingFulfillment();
            });
        }

        void IStoreBackendListener.OnPurchaseSucceeded(PurchaseRecord record)
        {
            MainThreadDispatcher.Run(() =>
            {
                if (_fulfillment == null)
                {
                    _awaitingFulfillment.Enqueue(record);
                    return;
                }
                ProcessPayment(record);
            });
        }

        void IStoreBackendListener.OnPurchaseFailed(string productId, PurchaseFailureKind reason, string message)
        {
            MainThreadDispatcher.Run(() =>
            {
                Telemetry.Log("iap_purchase_failed", "product", productId, "reason", reason);
                EventBus<PurchaseFailedEvent>.Raise(new PurchaseFailedEvent { ProductId = productId, Reason = reason.ToString() });
                PurchaseStatus status = reason == PurchaseFailureKind.UserCancelled ? PurchaseStatus.Cancelled : PurchaseStatus.Failed;
                Complete(productId, status, message);
            });
        }

        void IStoreBackendListener.OnPurchaseDeferred(string productId)
        {
            MainThreadDispatcher.Run(() =>
            {
                Telemetry.Log("iap_purchase_deferred", "product", productId);
                Complete(productId, PurchaseStatus.Pending, "Payment pending: items will arrive when it completes.");
            });
        }

        private void DrainAwaitingFulfillment()
        {
            while (_fulfillment != null && _awaitingFulfillment.Count > 0) ProcessPayment(_awaitingFulfillment.Dequeue());
        }

        private void ProcessPayment(PurchaseRecord record)
        {
            StoreProductDefinition product = catalog.Find(record.ProductId);
            if (product == null)
            {
                // Leave unacknowledged: Play refunds it automatically, and a later app
                // version that knows the product can still fulfill it.
                Debug.LogError($"[IAP] Payment for unknown product '{record.ProductId}' ({record.TransactionId}).");
                Complete(record.ProductId, PurchaseStatus.UnknownProduct, null);
                return;
            }

            if (_fulfillment.IsTransactionProcessed(record.TransactionId))
            {
                _backend.ConfirmPending(record.ProductId, record.TransactionId); // already granted: just acknowledge
                Complete(record.ProductId, PurchaseStatus.Success, "already_fulfilled");
                return;
            }

            _validator.Validate(record, product, (valid, reason) => MainThreadDispatcher.Run(() =>
            {
                if (!valid)
                {
                    Telemetry.Log("iap_receipt_invalid", "product", record.ProductId, "reason", reason ?? string.Empty);
                    Complete(record.ProductId, PurchaseStatus.Failed, "Receipt validation failed.");
                    return; // not acknowledged: refunded/voided by the store
                }

                // Re-check: validation is async and a replay may have raced us.
                if (_fulfillment.IsTransactionProcessed(record.TransactionId))
                {
                    _backend.ConfirmPending(record.ProductId, record.TransactionId);
                    Complete(record.ProductId, PurchaseStatus.Success, "already_fulfilled");
                    return;
                }

                bool firstBonus = _fulfillment.IsFirstPurchaseBonusAvailable(product);
                _fulfillment.Fulfill(product, record, firstBonus);         // grant + persist
                _backend.ConfirmPending(record.ProductId, record.TransactionId); // then acknowledge

                Telemetry.Revenue(product.productId, product.referencePriceUsd, "USD", record.TransactionId);
                Telemetry.Log("iap_purchase_completed", "product", product.productId, "restored", record.Restored, "first_bonus", firstBonus);
                EventBus<PurchaseCompletedEvent>.Raise(new PurchaseCompletedEvent
                {
                    ProductId = product.productId,
                    TransactionId = record.TransactionId,
                    Restored = record.Restored,
                });
                Complete(record.ProductId, PurchaseStatus.Success, null);
            }));
        }

        private void Complete(string productId, PurchaseStatus status, string message)
        {
            if (productId == null || !_callbacks.TryGetValue(productId, out Action<PurchaseResult> callback)) return;
            // Pending purchases keep their slot closed until they resolve, so the player can't double-buy.
            if (status != PurchaseStatus.Pending) _callbacks.Remove(productId);
            try { callback?.Invoke(new PurchaseResult { Status = status, ProductId = productId, Message = message }); }
            catch (Exception e) { Debug.LogException(e); }
        }
    }
}
