using System;
using GoogleMobileAds.Api;
using GoogleMobileAds.Ump.Api;
using MobileFPS.Core;
using MobileFPS.Monetization;
using UnityEngine;

namespace MobileFPS.Integrations.AdMob
{
    /// <summary>
    /// Google AdMob rewarded ads (Google Mobile Ads Unity plugin v9+), including
    /// the UMP consent flow required for EEA/UK traffic.
    ///
    /// This assembly compiles only when the plugin is present: automatically when
    /// installed as the UPM package <c>com.google.ads.mobile</c>, or by adding the
    /// scripting define <c>MOBILEFPS_ADMOB</c> after importing the .unitypackage.
    /// It registers itself with <see cref="AdProviderRegistry"/>; nothing else in
    /// the project references AdMob.
    /// </summary>
    public sealed class AdMobRewardedAdProvider : IRewardedAdProvider
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterAssembliesLoaded)]
        private static void Register()
        {
            AdProviderRegistry.Factory = config => new AdMobRewardedAdProvider(config);
        }

        private readonly AdsConfig _config;
        private RewardedAd _ad;
        private volatile bool _loading;

        public AdMobRewardedAdProvider(AdsConfig config)
        {
            _config = config;
        }

        public string Name => "AdMob";
        public bool IsInitialized { get; private set; }
        public bool IsReady => _ad != null && _ad.CanShowAd();
        public bool IsLoading => _loading;

        public event Action<bool> LoadCompleted;

        public void Initialize(Action<bool> onComplete)
        {
            // Deliver ad callbacks on Unity's main thread (AdsManager also marshals, belt and braces).
            MobileAds.RaiseAdEventsOnUnityMainThread = true;
            MobileAds.SetRequestConfiguration(new RequestConfiguration
            {
                TagForChildDirectedTreatment = _config.tagForChildDirectedTreatment
                    ? TagForChildDirectedTreatment.True
                    : TagForChildDirectedTreatment.Unspecified,
            });

            if (_config.requireConsentFlow) GatherConsent(() => InitializeSdk(onComplete));
            else InitializeSdk(onComplete);
        }

        public void Load()
        {
            if (!IsInitialized || _loading || IsReady) return;
            _loading = true;

            _ad?.Destroy();
            _ad = null;
            RewardedAd.Load(_config.RewardedAdUnitId, new AdRequest(), (RewardedAd ad, LoadAdError error) =>
            {
                _loading = false;
                if (error != null || ad == null)
                {
                    Debug.LogWarning($"[AdMob] Rewarded load failed: {error?.GetMessage()}");
                    LoadCompleted?.Invoke(false);
                    return;
                }
                _ad = ad;
                LoadCompleted?.Invoke(true);
            });
        }

        public void Show(string placementId, string serverSideVerificationData, Action<AdShowOutcome> onFinished)
        {
            if (!IsReady)
            {
                onFinished?.Invoke(new AdShowOutcome { Shown = false, Error = "not_ready" });
                return;
            }

            RewardedAd ad = _ad;
            _ad = null; // single use
            bool earned = false;
            bool finished = false;

            void Finish(bool shown, string error)
            {
                if (finished) return;
                finished = true;
                ad.Destroy();
                onFinished?.Invoke(new AdShowOutcome { Shown = shown, RewardEarned = earned, Error = error });
            }

            // The reward callback normally precedes the close callback, but not on
            // every device; deferring the close by one frame lets a late reward land.
            ad.OnAdFullScreenContentClosed += () => MainThreadDispatcher.Enqueue(() => Finish(true, null));
            ad.OnAdFullScreenContentFailed += adError => Finish(false, adError?.GetMessage());

            // Server-side verification: AdMob calls your backend with this custom data.
            ad.SetServerSideVerificationOptions(new ServerSideVerificationOptions.Builder()
                .SetCustomData(serverSideVerificationData)
                .Build());

            ad.Show(reward => earned = true);
        }

        private void GatherConsent(Action then)
        {
            var request = new ConsentRequestParameters { TagForUnderAgeOfConsent = _config.tagForChildDirectedTreatment };
            ConsentInformation.Update(request, updateError =>
            {
                if (updateError != null)
                {
                    Debug.LogWarning($"[AdMob] Consent info update failed: {updateError.Message}");
                    then();
                    return;
                }
                ConsentForm.LoadAndShowConsentFormIfRequired(formError =>
                {
                    if (formError != null) Debug.LogWarning($"[AdMob] Consent form error: {formError.Message}");
                    then();
                });
            });
        }

        private void InitializeSdk(Action<bool> onComplete)
        {
            if (_config.requireConsentFlow && !ConsentInformation.CanRequestAds())
            {
                onComplete?.Invoke(false); // user declined: no ad requests this session
                return;
            }
            MobileAds.Initialize(status =>
            {
                IsInitialized = true;
                onComplete?.Invoke(true);
            });
        }
    }
}
