using System;
using System.Threading.Tasks;
using UnityEngine;

namespace MobileFPS.Monetization
{
    /// <summary>
    /// Simulated ad network for the Editor and development builds: configurable
    /// load time, fill rate and early-close rate, so every branch of the reward
    /// flow (no fill, skip, success) can be exercised without an SDK. Callbacks
    /// deliberately arrive on a thread-pool thread, like real SDKs, so the
    /// main-thread marshalling is tested too.
    /// </summary>
    public sealed class MockRewardedAdProvider : IRewardedAdProvider
    {
        private readonly System.Random _random = new System.Random();
        private volatile bool _ready;
        private volatile bool _loading;

        public float LoadSeconds { get; set; } = 0.75f;
        public float WatchSeconds { get; set; } = 1.5f;
        public float FillRate { get; set; } = 1f;
        public float CompletionRate { get; set; } = 1f;

        public string Name => "Mock";
        public bool IsInitialized { get; private set; }
        public bool IsReady => _ready;
        public bool IsLoading => _loading;

        public event Action<bool> LoadCompleted;

        public void Initialize(Action<bool> onComplete)
        {
            IsInitialized = true;
            onComplete?.Invoke(true);
        }

        public void Load()
        {
            if (_loading || _ready) return;
            _loading = true;
            bool filled = _random.NextDouble() < FillRate;
            Task.Delay(TimeSpan.FromSeconds(LoadSeconds)).ContinueWith(_ =>
            {
                _ready = filled;
                _loading = false;
                LoadCompleted?.Invoke(filled);
            });
        }

        public void Show(string placementId, string serverSideVerificationData, Action<AdShowOutcome> onFinished)
        {
            if (!_ready)
            {
                onFinished?.Invoke(new AdShowOutcome { Shown = false, Error = "not_ready" });
                return;
            }
            _ready = false;
            bool completes = _random.NextDouble() < CompletionRate;
            Debug.Log($"[MockAds] Playing simulated rewarded ad for '{placementId}' ({WatchSeconds:0.0}s)...");
            Task.Delay(TimeSpan.FromSeconds(WatchSeconds)).ContinueWith(_ =>
                onFinished?.Invoke(new AdShowOutcome { Shown = true, RewardEarned = completes }));
        }
    }

    /// <summary>Release-build fallback when no SDK is integrated: never ready, never shows.</summary>
    public sealed class NullRewardedAdProvider : IRewardedAdProvider
    {
        public string Name => "None";
        public bool IsInitialized => true;
        public bool IsReady => false;
        public bool IsLoading => false;

        public event Action<bool> LoadCompleted
        {
            add { }
            remove { }
        }

        public void Initialize(Action<bool> onComplete) => onComplete?.Invoke(true);
        public void Load() { }

        public void Show(string placementId, string serverSideVerificationData, Action<AdShowOutcome> onFinished)
        {
            onFinished?.Invoke(new AdShowOutcome { Shown = false, Error = "no_ad_sdk" });
        }
    }
}
