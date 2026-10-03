using System;
using MobileFPS.Analytics;
using MobileFPS.Core;
using MobileFPS.Meta;
using UnityEngine;

namespace MobileFPS.Monetization
{
    public enum RewardedAdResult : byte
    {
        Rewarded,   // watched to completion: grant the reward
        Skipped,    // shown but closed early: no reward
        Failed,     // SDK error while showing
        NotReady,   // nothing loaded (a load was kicked off)
        Capped,     // daily cap / cooldown for this placement
        Busy,       // another ad is on screen
    }

    /// <summary>
    /// Single entry point for rewarded ads.
    ///
    /// <code>
    /// AdsManager.Instance.ShowRewarded(AdsConfig.PostMatchDoublePlacement, result =>
    /// {
    ///     if (result == RewardedAdResult.Rewarded) GrantDoubleCredits();
    /// });
    /// </code>
    ///
    /// Revenue and reliability practices built in:
    /// - <b>Always preloaded</b>: the next ad loads as soon as one closes, so the
    ///   "Watch ad" button is instant. Ad load latency kills opt-in rate.
    /// - <b>Exponential backoff</b> on no-fill (2 s up to 64 s), so a no-fill network
    ///   isn't hammered and the device doesn't burn battery retrying.
    /// - <b>Reward only on the SDK's reward callback</b>, never on close.
    /// - <b>Main-thread marshalling</b> of every SDK callback.
    /// - <b>Server-side verification hook</b>: a per-show nonce passed as SSV custom data.
    /// - <b>Frequency caps</b> per placement (<see cref="AdFrequencyLimiter"/>).
    /// - Ready-state events, so UI shows the ad button only when it will work.
    /// </summary>
    [AutoCreateSingleton]
    public sealed class AdsManager : Singleton<AdsManager>
    {
        [SerializeField] private AdsConfig config;

        private IRewardedAdProvider _provider;
        private AdFrequencyLimiter _limiter;
        private string _userId = "anonymous";
        private bool _initialized;
        private bool _showing;
        private float _retryDelay;
        private float _nextRetryAt = -1f;
        private bool _audioPausedByUs;

        public AdsConfig Config => config;
        public bool IsShowing => _showing;
        public string ProviderName => _provider?.Name ?? "none";

        /// <summary>Raised on the main thread when ad availability changes (show/hide "Watch ad" buttons).</summary>
        public event Action<bool> AvailabilityChanged;

        protected override void OnSingletonAwake()
        {
            if (config == null) config = Resources.Load<AdsConfig>("MobileFPS/AdsConfig");
            if (config == null) config = ScriptableObject.CreateInstance<AdsConfig>();
            _retryDelay = config.initialRetryDelaySeconds;

            MainThreadDispatcher.Warmup();
            _provider = CreateProvider(config);
            _provider.LoadCompleted += OnLoadCompleted;
            _provider.Initialize(success => MainThreadDispatcher.Run(() => OnProviderInitialized(success)));
        }

        protected override void OnSingletonDestroy()
        {
            if (_provider != null) _provider.LoadCompleted -= OnLoadCompleted;
        }

        /// <summary>Wires persistence-backed frequency caps and the user id for SSV. Called by MetaGame.</summary>
        public void Configure(AdFrequencyLimiter limiter, string userId)
        {
            _limiter = limiter;
            if (!string.IsNullOrEmpty(userId)) _userId = userId;
        }

        public bool IsRewardedAvailable(string placementId)
        {
            if (_showing || _provider == null || !_provider.IsReady) return false;
            return _limiter == null || _limiter.Check(placementId) == AdCapStatus.Allowed;
        }

        public int RemainingToday(string placementId) => _limiter != null ? _limiter.RemainingToday(placementId) : int.MaxValue;

        public void ShowRewarded(string placementId, Action<RewardedAdResult> onComplete)
        {
            if (_showing)
            {
                onComplete?.Invoke(RewardedAdResult.Busy);
                return;
            }
            if (_limiter != null && _limiter.Check(placementId) != AdCapStatus.Allowed)
            {
                onComplete?.Invoke(RewardedAdResult.Capped);
                return;
            }
            if (_provider == null || !_provider.IsReady)
            {
                RequestLoad();
                onComplete?.Invoke(RewardedAdResult.NotReady);
                return;
            }

            _showing = true;
            PauseGameAudio();
            AvailabilityChanged?.Invoke(false);

            // Nonce for server-side verification: your backend matches the SSV callback
            // to this id before granting anything with real value.
            string ssvData = $"{_userId}|{placementId}|{Guid.NewGuid():N}";
            Telemetry.Log("ad_rewarded_show", "placement", placementId, "network", _provider.Name);

            _provider.Show(placementId, ssvData, outcome => MainThreadDispatcher.Run(() => FinishShow(placementId, outcome, onComplete)));
        }

        private void FinishShow(string placementId, AdShowOutcome outcome, Action<RewardedAdResult> onComplete)
        {
            _showing = false;
            ResumeGameAudio();

            RewardedAdResult result = outcome.RewardEarned ? RewardedAdResult.Rewarded
                : outcome.Shown ? RewardedAdResult.Skipped
                : RewardedAdResult.Failed;

            if (result == RewardedAdResult.Rewarded) _limiter?.RecordRewarded(placementId);
            Telemetry.Log("ad_rewarded_result", "placement", placementId, "result", result, "error", outcome.Error ?? string.Empty);
            EventBus<RewardedAdCompletedEvent>.Raise(new RewardedAdCompletedEvent { PlacementId = placementId, Rewarded = result == RewardedAdResult.Rewarded });

            try { onComplete?.Invoke(result); }
            catch (Exception e) { Debug.LogException(e); }

            RequestLoad(); // preload the next one immediately
        }

        private void Update()
        {
            if (!_initialized || _showing || _nextRetryAt < 0f || Time.unscaledTime < _nextRetryAt) return;
            _nextRetryAt = -1f;
            RequestLoad();
        }

        private void RequestLoad()
        {
            if (!_initialized || _provider == null || _provider.IsReady || _provider.IsLoading) return;
            _provider.Load();
        }

        private void OnProviderInitialized(bool success)
        {
            _initialized = success;
            Telemetry.Log("ads_initialized", "network", _provider.Name, "success", success);
            if (success) RequestLoad();
            else Debug.LogWarning($"[Ads] Provider '{_provider.Name}' failed to initialize; rewarded ads unavailable this session.");
        }

        private void OnLoadCompleted(bool success)
        {
            // SDK thread -> main thread.
            MainThreadDispatcher.Run(() =>
            {
                if (success)
                {
                    _retryDelay = config.initialRetryDelaySeconds;
                    AvailabilityChanged?.Invoke(true);
                    return;
                }
                _nextRetryAt = Time.unscaledTime + _retryDelay;
                _retryDelay = Mathf.Min(_retryDelay * 2f, config.maxRetryDelaySeconds);
            });
        }

        private void PauseGameAudio()
        {
            if (!config.pauseAudioDuringAds || AudioListener.pause) return;
            AudioListener.pause = true;
            _audioPausedByUs = true;
        }

        private void ResumeGameAudio()
        {
            if (!_audioPausedByUs) return;
            AudioListener.pause = false;
            _audioPausedByUs = false;
        }

        private static IRewardedAdProvider CreateProvider(AdsConfig adsConfig)
        {
            bool forceMock = Application.isEditor && adsConfig.useMockInEditor;
            if (!forceMock && AdProviderRegistry.Factory != null)
            {
                IRewardedAdProvider provider = AdProviderRegistry.Factory(adsConfig);
                if (provider != null) return provider;
            }

            if (Application.isEditor || (Debug.isDebugBuild && adsConfig.useMockInDevelopmentBuilds))
            {
                return new MockRewardedAdProvider();
            }

            Debug.LogWarning("[Ads] No ad SDK adapter registered in a release build. Install an SDK integration (see README).");
            return new NullRewardedAdProvider();
        }
    }
}
