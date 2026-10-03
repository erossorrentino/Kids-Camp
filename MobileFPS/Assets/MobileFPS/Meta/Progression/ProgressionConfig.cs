using System;
using MobileFPS.Economy;
using UnityEngine;

namespace MobileFPS.Progression
{
    /// <summary>
    /// XP curves and level rewards. Tuning targets for a healthy mobile curve:
    /// early levels in minutes (fast dopamine, lots of unlocks during the D1
    /// session), mid levels in days, max level as a long-term goal.
    /// </summary>
    [CreateAssetMenu(menuName = "MobileFPS/Meta/Progression Config", fileName = "ProgressionConfig")]
    public sealed class ProgressionConfig : ScriptableObject
    {
        [Serializable]
        public struct LevelReward
        {
            public int level;
            public RewardBundle reward;
        }

        [Header("Account level")]
        public int maxAccountLevel = 150;
        [Tooltip("XP for level 1 -> 2.")]
        public long baseLevelXp = 1200;
        [Tooltip("Extra XP per level beyond the first.")]
        public long levelXpGrowth = 180;
        [Tooltip("Optional exponent on growth (1 = linear).")]
        public float levelXpExponent = 1.08f;

        [Header("Weapon level (unlocks attachments)")]
        public int maxWeaponLevel = 30;
        public long baseWeaponXp = 800;
        public long weaponXpGrowth = 140;

        [Header("Level rewards")]
        [Tooltip("Specific levels with rewards (unlock-heavy early: the 'something every 10 minutes' D1 loop).")]
        public LevelReward[] levelRewards =
        {
            new LevelReward { level = 2, reward = RewardBundle.Of(RewardItem.Credits(300)) },
            new LevelReward { level = 3, reward = RewardBundle.Of(RewardItem.Gems(20)) },
            new LevelReward { level = 5, reward = RewardBundle.Of(RewardItem.DoubleXp(30), RewardItem.Credits(500)) },
            new LevelReward { level = 10, reward = RewardBundle.Of(RewardItem.Gems(50), RewardItem.Item("skin_ar_starter_camo")) },
        };

        [Tooltip("Reward for every level not listed above.")]
        public RewardBundle defaultLevelReward = RewardBundle.Of(RewardItem.Credits(150));

        public long XpToNextAccountLevel(int level)
        {
            int n = Mathf.Max(0, level - 1);
            return baseLevelXp + (long)(levelXpGrowth * Math.Pow(n, levelXpExponent));
        }

        public long XpToNextWeaponLevel(int level)
        {
            return baseWeaponXp + weaponXpGrowth * Mathf.Max(0, level - 1);
        }

        public RewardBundle GetLevelReward(int level)
        {
            if (levelRewards != null)
            {
                for (int i = 0; i < levelRewards.Length; i++)
                {
                    if (levelRewards[i].level == level) return levelRewards[i].reward;
                }
            }
            return defaultLevelReward;
        }
    }
}
