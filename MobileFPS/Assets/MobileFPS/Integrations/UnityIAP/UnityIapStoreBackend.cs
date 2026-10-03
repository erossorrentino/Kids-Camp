using System;
using System.Collections.Generic;
using MobileFPS.Monetization;
using Unity.Services.Core;
using UnityEngine;
using UnityEngine.Purchasing;
using UnityEngine.Purchasing.Extension;

namespace MobileFPS.Integrations.UnityIAP
{
    /// <summary>
    /// Google Play Billing (and App Store) through Unity IAP 4.8-4.x.
    ///
    /// Compiles only when <c>com.unity.purchasing</c> 4.8+ (below 5.0) is installed
    /// (see the asmdef's version define). Unity IAP 5 changed its API; add a
    /// sibling adapter for it the same way.
    ///
    /// Key behaviour: <see cref="ProcessPurchase"/> always returns
    /// <see cref="PurchaseProcessingResult.Pending"/>. The purchase is acknowledged
    /// only when <see cref="IAPStoreManager"/> calls <see cref="ConfirmPending"/>
    /// after granting and saving. If the app dies in between, Unity IAP re-delivers
    /// the purchase on the next launch and the transaction ledger dedupes it.
    /// </summary>
    public sealed class UnityIapStoreBackend : IStoreBackend, IDetailedStoreListener
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterAssembliesLoaded)]
        private static void Register()
        {
            StoreBackendRegistry.Factory = () => new UnityIapStoreBackend();
        }

        private IStoreController _controller;
        private IExtensionProvider _extensions;
        private IStoreBackendListener _listener;

        public string Name => "UnityIAP";
        public bool IsInitialized => _controller != null;

        public async void Initialize(IReadOnlyList<StoreProductDefinition> products, IStoreBackendListener listener)
        {
            _listener = listener;
            try
            {
                // Unity IAP 4.6+ expects Unity Gaming Services to be initialized first.
                await UnityServices.InitializeAsync();
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[UnityIAP] Unity Services init failed (continuing): {e.Message}");
            }

            var builder = ConfigurationBuilder.Instance(StandardPurchasingModule.Instance());
            foreach (StoreProductDefinition product in products)
            {
                if (product != null) builder.AddProduct(product.productId, Map(product.kind));
            }
            // Google Play "pending" payments (cash, slow card checks): notify, don't grant yet.
            builder.Configure<IGooglePlayConfiguration>().SetDeferredPurchaseListener(OnDeferredPurchase);
            UnityPurchasing.Initialize(this, builder);
        }

        public void Purchase(string productId)
        {
            if (_controller == null)
            {
                _listener.OnPurchaseFailed(productId, PurchaseFailureKind.StoreUnavailable, "store not initialized");
                return;
            }
            _controller.InitiatePurchase(productId);
        }

        public void ConfirmPending(string productId, string transactionId)
        {
            Product product = _controller?.products.WithID(productId);
            if (product != null) _controller.ConfirmPendingPurchase(product);
        }

        public bool TryGetLocalizedPrice(string productId, out string localizedPrice)
        {
            Product product = _controller?.products.WithID(productId);
            localizedPrice = product?.metadata?.localizedPriceString;
            return !string.IsNullOrEmpty(localizedPrice);
        }

        public void RestorePurchases()
        {
            // Google Play restores automatically during initialization; iOS needs an explicit call.
            _extensions?.GetExtension<IAppleExtensions>()?.RestoreTransactions((success, error) =>
            {
                if (!success) Debug.LogWarning($"[UnityIAP] Restore failed: {error}");
            });
        }

        // ---- IDetailedStoreListener ----

        public void OnInitialized(IStoreController controller, IExtensionProvider extensions)
        {
            _controller = controller;
            _extensions = extensions;
            _listener.OnStoreInitialized(true, null);
        }

        public void OnInitializeFailed(InitializationFailureReason error)
        {
            _listener.OnStoreInitialized(false, error.ToString());
        }

        public void OnInitializeFailed(InitializationFailureReason error, string message)
        {
            _listener.OnStoreInitialized(false, $"{error}: {message}");
        }

        public PurchaseProcessingResult ProcessPurchase(PurchaseEventArgs purchaseEvent)
        {
            Product product = purchaseEvent.purchasedProduct;
            IGooglePlayStoreExtensions google = _extensions?.GetExtension<IGooglePlayStoreExtensions>();
            if (google != null && google.IsPurchasedProductDeferred(product))
            {
                return PurchaseProcessingResult.Pending; // not paid yet; re-delivered when it clears
            }

            _listener.OnPurchaseSucceeded(new PurchaseRecord
            {
                ProductId = product.definition.id,
                TransactionId = product.transactionID,
                Receipt = product.receipt,
                Restored = false,
            });
            return PurchaseProcessingResult.Pending;
        }

        public void OnPurchaseFailed(Product product, PurchaseFailureReason failureReason)
        {
            _listener.OnPurchaseFailed(product?.definition.id, Map(failureReason), failureReason.ToString());
        }

        public void OnPurchaseFailed(Product product, PurchaseFailureDescription failureDescription)
        {
            _listener.OnPurchaseFailed(product?.definition.id, Map(failureDescription.reason), failureDescription.message);
        }

        private void OnDeferredPurchase(Product product)
        {
            _listener.OnPurchaseDeferred(product.definition.id);
        }

        private static ProductType Map(ProductKind kind)
        {
            switch (kind)
            {
                case ProductKind.NonConsumable: return ProductType.NonConsumable;
                case ProductKind.Subscription: return ProductType.Subscription;
                default: return ProductType.Consumable;
            }
        }

        private static PurchaseFailureKind Map(PurchaseFailureReason reason)
        {
            switch (reason)
            {
                case PurchaseFailureReason.UserCancelled: return PurchaseFailureKind.UserCancelled;
                case PurchaseFailureReason.PaymentDeclined: return PurchaseFailureKind.PaymentDeclined;
                case PurchaseFailureReason.ProductUnavailable: return PurchaseFailureKind.ProductUnavailable;
                case PurchaseFailureReason.DuplicateTransaction: return PurchaseFailureKind.DuplicateTransaction;
                case PurchaseFailureReason.PurchasingUnavailable: return PurchaseFailureKind.StoreUnavailable;
                default: return PurchaseFailureKind.Unknown;
            }
        }
    }
}
