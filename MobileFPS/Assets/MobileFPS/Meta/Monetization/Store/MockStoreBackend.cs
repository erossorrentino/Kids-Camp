using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;

namespace MobileFPS.Monetization
{
    public enum MockPurchaseOutcome : byte
    {
        Succeed,
        Cancel,
        Decline,
        DeferThenSucceed,
    }

    /// <summary>
    /// Simulated billing for the Editor and development builds. It reproduces the
    /// behaviours that break real IAP integrations: async callbacks on a worker
    /// thread, deferred payments, and re-delivery of unacknowledged purchases on the
    /// next initialize (as Google Play does after a crash between payment and
    /// acknowledgement).
    /// </summary>
    public sealed class MockStoreBackend : IStoreBackend
    {
        private readonly List<PurchaseRecord> _unconfirmed = new List<PurchaseRecord>();
        private readonly object _lock = new object();
        private IStoreBackendListener _listener;
        private HashSet<string> _known = new HashSet<string>();

        /// <summary>Outcome for the next purchase (QA menus flip this to test failure UX).</summary>
        public MockPurchaseOutcome NextOutcome { get; set; } = MockPurchaseOutcome.Succeed;
        public float DialogSeconds { get; set; } = 0.6f;

        public string Name => "Mock";
        public bool IsInitialized { get; private set; }

        public void Initialize(IReadOnlyList<StoreProductDefinition> products, IStoreBackendListener listener)
        {
            _listener = listener;
            _known = new HashSet<string>();
            foreach (StoreProductDefinition product in products) if (product != null) _known.Add(product.productId);
            IsInitialized = true;
            _listener.OnStoreInitialized(true, null);

            // Replay anything paid but never acknowledged.
            PurchaseRecord[] replay;
            lock (_lock) replay = _unconfirmed.ToArray();
            foreach (PurchaseRecord record in replay)
            {
                PurchaseRecord restored = record;
                restored.Restored = true;
                _listener.OnPurchaseSucceeded(restored);
            }
        }

        public void Purchase(string productId)
        {
            if (!_known.Contains(productId))
            {
                _listener.OnPurchaseFailed(productId, PurchaseFailureKind.ProductUnavailable, "unknown product");
                return;
            }

            MockPurchaseOutcome outcome = NextOutcome;
            NextOutcome = MockPurchaseOutcome.Succeed;
            Debug.Log($"[MockStore] Simulating purchase dialog for '{productId}' -> {outcome}");

            Task.Delay(TimeSpan.FromSeconds(DialogSeconds)).ContinueWith(_ =>
            {
                switch (outcome)
                {
                    case MockPurchaseOutcome.Cancel:
                        _listener.OnPurchaseFailed(productId, PurchaseFailureKind.UserCancelled, "user cancelled");
                        break;
                    case MockPurchaseOutcome.Decline:
                        _listener.OnPurchaseFailed(productId, PurchaseFailureKind.PaymentDeclined, "card declined");
                        break;
                    case MockPurchaseOutcome.DeferThenSucceed:
                        _listener.OnPurchaseDeferred(productId);
                        Task.Delay(TimeSpan.FromSeconds(DialogSeconds * 3)).ContinueWith(__ => Deliver(productId));
                        break;
                    default:
                        Deliver(productId);
                        break;
                }
            });
        }

        public void ConfirmPending(string productId, string transactionId)
        {
            lock (_lock) _unconfirmed.RemoveAll(r => r.TransactionId == transactionId);
        }

        public bool TryGetLocalizedPrice(string productId, out string localizedPrice)
        {
            localizedPrice = null; // fall back to the catalog's price string
            return false;
        }

        public void RestorePurchases()
        {
            // Non-consumables are restored automatically on Android; nothing to simulate.
        }

        private void Deliver(string productId)
        {
            var record = new PurchaseRecord
            {
                ProductId = productId,
                TransactionId = "mock_" + Guid.NewGuid().ToString("N"),
                Receipt = "{\"Store\":\"Mock\"}",
            };
            lock (_lock) _unconfirmed.Add(record);
            _listener.OnPurchaseSucceeded(record);
        }
    }
}
