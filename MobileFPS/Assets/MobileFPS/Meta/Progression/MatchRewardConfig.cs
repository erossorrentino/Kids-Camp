using UnityEngine;

namespace MobileFPS.Progression
{
    /// <summary>
    /// End-of-match payout tuning. Pay for engagement (time played, completion)
    /// as well as skill (kills, wins), so new and casual players still progress.
    /// That is what keeps them past D7.
    /// </summary>
    [CreateAssetMenu(menuName = "MobileFPS/Meta/Match Reward Config", fileName = "MatchRewardConfig")]
    public sealed class MatchRewardConfig : ScriptableObject
    {
        [Header("Credits")]
        public int creditsPerKill = 10;
        public int creditsPerAssist = 5;
        public int creditsCompletion = 60;
        public int creditsWinBonus = 120;
        [Tooltip("Hard cap per match: protects the economy from farming exploits.")]
        public int maxCreditsPerMatch = 1000;

        [Header("Account XP")]
        public float xpPerScorePoint = 1f;
        public int xpCompletionBonus = 300;
        public int xpWinBonus = 500;
        public int doubleXpMultiplier = 2;

        [Header("First win of the day")]
        public int firstWinBonusXp = 1500;
        public int firstWinBonusCredits = 200;

        [Header("Battle pass XP (time-based, so every player progresses)")]
        public int battlePassXpPerMinute = 100;
        public int battlePassXpWinBonus = 100;

        [Header("Weapon XP")]
        public int weaponXpPerKill = 100;
        public float weaponXpPerScorePoint = 0.5f;

        [Header("Rewarded ad")]
        [Tooltip("Offer 'watch an ad for 2x credits' after a match.")]
        public bool offerDoubleCreditsAd = true;
        [Tooltip("Matches shorter than this don't get the ad offer (stops quit-and-farm loops).")]
        public float minMatchSecondsForAdOffer = 60f;
    }
}
