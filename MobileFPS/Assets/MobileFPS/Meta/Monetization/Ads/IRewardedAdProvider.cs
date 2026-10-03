using System;

namespace MobileFPS.Monetization
{
    /// <summary>Result of one ad presentation as reported by the SDK.</summary>
    public struct AdShowOutcome
    {
        public bool Shown;
        public bool RewardEarned;
        public string Error;
    }

    /// <summary>
    /// Ad network adapter (AdMob, LevelPlay, AppLovin MAX, Unity Ads...). Game
    /// code only ever talks to <see cref="AdsManager"/>; swapping networks or adding
    /// mediation means writing one adapter.
    ///
    /// Contract: callbacks may arrive on any thread (AdsManager marshals them).
    /// <see cref="AdShowOutcome.RewardEarned"/> must come from the SDK's reward
    /// callback, never from "ad closed": closing early must not pay out.
    /// </summary>
    public interface IRewardedAdProvider
    {
        string Name { get; }
        bool IsInitialized { get; }
        bool IsReady { get; }
        bool IsLoading { get; }

        void Initialize(Action<bool> onComplete);
        void Load();

        /// <param name="serverSideVerificationData">Custom data echoed to your server's SSV callback (user id + nonce).</param>
        void Show(string placementId, string serverSideVerificationData, Action<AdShowOutcome> onFinished);

        /// <summary>Raised when a load succeeds (true) or fails (false).</summary>
        event Action<bool> LoadCompleted;
    }

    /// <summary>
    /// Lets an optional SDK integration assembly (compiled only when that SDK is
    /// installed) register itself without the core referencing the SDK.
    /// Integrations set <see cref="Factory"/> from
    /// [RuntimeInitializeOnLoadMethod(AfterAssembliesLoaded)].
    /// </summary>
    public static class AdProviderRegistry
    {
        public static Func<AdsConfig, IRewardedAdProvider> Factory { get; set; }
    }
}
