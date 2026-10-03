using System;
using System.Globalization;
using MobileFPS.Economy;
using UnityEngine;

namespace MobileFPS.LiveOps
{
    [Serializable]
    public sealed class BattlePassTier
    {
        public RewardBundle free = new RewardBundle();
        public RewardBundle premium = new RewardBundle();
    }

    /// <summary>
    /// One battle pass season: the time-boxed tier ladder that is the backbone of
    /// live-service shooter monetization. A free track keeps everyone engaged;
    /// a premium track sells for a mid-tier price, and its rewards are visible
    /// (but locked) at every tier, which is the conversion driver. A fixed end
    /// date provides urgency.
    ///
    /// Value design rule: the premium pass should pay back in gems at least the
    /// price of the next pass if completed. Players who finish are your most
    /// engaged payers, and this keeps them subscribed season over season.
    /// </summary>
    [CreateAssetMenu(menuName = "MobileFPS/Meta/Battle Pass Season", fileName = "BattlePassSeason")]
    public sealed class BattlePassSeasonDefinition : ScriptableObject
    {
        public string seasonId = "season_01";
        public string displayName = "Season 1";

        [Tooltip("ISO-8601 UTC, e.g. 2026-10-01T00:00:00Z")]
        public string startUtc = "2026-10-01T00:00:00Z";
        public string endUtc = "2026-12-01T00:00:00Z";

        [Tooltip("Battle pass XP per tier. Tune so a daily player completes the pass ~1 week before season end.")]
        public int xpPerTier = 1000;

        [Tooltip("Store SKU or shop item that unlocks premium (granted via a BattlePassPremium reward).")]
        public string premiumProductId = "battlepass_premium";
        public int premiumGemPrice = 950;
        public int tierSkipGemPrice = 150;

        public BattlePassTier[] tiers = GenerateDefaultTiers(50);

        public DateTime StartUtc => ParseUtc(startUtc, DateTime.MinValue);
        public DateTime EndUtc => ParseUtc(endUtc, DateTime.MaxValue);
        public int TierCount => tiers != null ? tiers.Length : 0;

        /// <summary>Sets the season window relative to now (runtime default instances, QA).</summary>
        public void SetWindow(DateTime start, DateTime end)
        {
            startUtc = start.ToUniversalTime().ToString("o", CultureInfo.InvariantCulture);
            endUtc = end.ToUniversalTime().ToString("o", CultureInfo.InvariantCulture);
        }

        private static DateTime ParseUtc(string value, DateTime fallback)
        {
            return DateTime.TryParse(value, CultureInfo.InvariantCulture,
                DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out DateTime result)
                ? result
                : fallback;
        }

        /// <summary>
        /// A reasonable default ladder: soft currency throughout, gems every 5 tiers
        /// (a full pass pays back 1,040 gems across both tracks, more than the
        /// 950-gem price of the next pass), and cosmetic milestones at 1/10/25/50
        /// for the "chase".
        /// </summary>
        public static BattlePassTier[] GenerateDefaultTiers(int count)
        {
            var result = new BattlePassTier[count];
            for (int i = 0; i < count; i++)
            {
                int tier = i + 1;
                var t = new BattlePassTier();

                if (tier % 5 == 0) t.free = RewardBundle.Of(RewardItem.Gems(10));
                else if (tier % 2 == 0) t.free = RewardBundle.Of(RewardItem.Credits(150));
                else t.free = RewardBundle.Of(RewardItem.Credits(75));

                if (tier == 1) t.premium = RewardBundle.Of(RewardItem.Item("skin_ar_season01_operator"), RewardItem.DoubleXp(60));
                else if (tier == 10) t.premium = RewardBundle.Of(RewardItem.Item("skin_smg_season01_neon"));
                else if (tier == 25) t.premium = RewardBundle.Of(RewardItem.Item("skin_sniper_season01_gold"));
                else if (tier == count) t.premium = RewardBundle.Of(RewardItem.Item("skin_ar_season01_mythic"), RewardItem.Gems(100));
                else if (tier % 5 == 0) t.premium = RewardBundle.Of(RewardItem.Gems(120));
                else t.premium = RewardBundle.Of(RewardItem.Credits(300), RewardItem.DoubleXp(15));

                result[i] = t;
            }
            return result;
        }
    }
}
