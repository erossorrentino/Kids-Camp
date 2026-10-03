using System;
using UnityEngine;

namespace MobileFPS.Monetization
{
    [Serializable]
    public sealed class RewardedPlacement
    {
        public string placementId = "post_match_2x";
        [Tooltip("Max rewarded views per game day for this placement (0 = unlimited).")]
        public int dailyCap = 10;
        [Tooltip("Minimum seconds between views of this placement.")]
        public float cooldownSeconds = 0f;
    }

    /// <summary>
    /// Ad configuration. Only rewarded (opt-in) ads are used: forced interstitials
    /// in a competitive shooter measurably hurt retention and reviews, and the
    /// lost players are worth more than the impressions. Rewarded ads instead act
    /// as a positive engagement hook that non-payers choose.
    /// </summary>
    [CreateAssetMenu(menuName = "MobileFPS/Monetization/Ads Config", fileName = "AdsConfig")]
    public sealed class AdsConfig : ScriptableObject
    {
        public const string PostMatchDoublePlacement = "post_match_2x";
        public const string DailyRewardBoostPlacement = "daily_reward_2x";
        public const string FreeCrateTokenPlacement = "free_crate";

        [Header("Ad unit ids (defaults are Google's public TEST ids: replace before release)")]
        public string androidRewardedAdUnitId = "ca-app-pub-3940256099942544/5224354917";
        public string iosRewardedAdUnitId = "ca-app-pub-3940256099942544/1712485313";

        [Header("Placements")]
        public RewardedPlacement[] placements =
        {
            new RewardedPlacement { placementId = PostMatchDoublePlacement, dailyCap = 8 },
            new RewardedPlacement { placementId = DailyRewardBoostPlacement, dailyCap = 1 },
            new RewardedPlacement { placementId = FreeCrateTokenPlacement, dailyCap = 3, cooldownSeconds = 1800f },
        };

        [Header("Behaviour")]
        [Tooltip("Use the simulated provider in the Editor even when an SDK is installed.")]
        public bool useMockInEditor = true;
        [Tooltip("Use the simulated provider in development builds when no SDK adapter is registered.")]
        public bool useMockInDevelopmentBuilds = true;
        public float initialRetryDelaySeconds = 2f;
        public float maxRetryDelaySeconds = 64f;
        [Tooltip("Mute game audio while an ad plays (the SDK plays its own).")]
        public bool pauseAudioDuringAds = true;
        [Tooltip("Game day reset hour for daily caps (match the daily reward calendar).")]
        [Range(0, 23)] public int resetHourUtc = 0;

        [Header("Privacy")]
        [Tooltip("Run the consent flow (UMP / GDPR) before requesting ads. Required for EEA/UK users.")]
        public bool requireConsentFlow = true;
        [Tooltip("COPPA / Families policy: tag requests as child-directed if your audience includes children.")]
        public bool tagForChildDirectedTreatment = false;

        public string RewardedAdUnitId
        {
            get
            {
#if UNITY_IOS
                return iosRewardedAdUnitId;
#else
                return androidRewardedAdUnitId;
#endif
            }
        }

        public RewardedPlacement GetPlacement(string placementId)
        {
            if (placements != null)
            {
                for (int i = 0; i < placements.Length; i++)
                {
                    if (placements[i].placementId == placementId) return placements[i];
                }
            }
            return null;
        }
    }
}
