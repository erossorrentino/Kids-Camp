using MobileFPS.Core;
using MobileFPS.Economy;
using UnityEngine;

namespace MobileFPS.LiveOps
{
    /// <summary>The pool daily challenges are drawn from, plus the "complete all dailies" bonus.</summary>
    [CreateAssetMenu(menuName = "MobileFPS/Meta/Challenge Pool", fileName = "ChallengePool")]
    public sealed class ChallengePool : ScriptableObject
    {
        public ChallengeDefinition[] challenges = new ChallengeDefinition[0];
        [Range(1, 6)] public int dailyCount = 3;
        [Range(0, 23)] public int resetHourUtc = 0;
        public RewardBundle allCompleteBonus = RewardBundle.Of(RewardItem.BattlePassXp(1000), RewardItem.Gems(5));
        [Tooltip("Completed challenges grant automatically instead of waiting for a claim tap.")]
        public bool autoClaim;

        /// <summary>Runtime default pool (used when no asset is assigned).</summary>
        public static ChallengePool CreateDefault()
        {
            var pool = CreateInstance<ChallengePool>();
            pool.name = "DefaultChallengePool";
            pool.challenges = new[]
            {
                ChallengeDefinition.Create("daily_kills_15", "Get {0} kills", ChallengeMetric.Kills, 15, 400),
                ChallengeDefinition.Create("daily_headshots_5", "Get {0} headshot kills", ChallengeMetric.Headshots, 5, 500),
                ChallengeDefinition.Create("daily_smg_kills_10", "Get {0} kills with SMGs", ChallengeMetric.KillsWithWeaponClass, 10, 450, WeaponClass.SubmachineGun),
                ChallengeDefinition.Create("daily_ar_kills_10", "Get {0} kills with assault rifles", ChallengeMetric.KillsWithWeaponClass, 10, 450, WeaponClass.AssaultRifle),
                ChallengeDefinition.Create("daily_sniper_kills_5", "Get {0} kills with sniper rifles", ChallengeMetric.KillsWithWeaponClass, 5, 500, WeaponClass.SniperRifle),
                ChallengeDefinition.Create("daily_longshots_3", "Get {0} longshot kills", ChallengeMetric.LongshotKills, 3, 500),
                ChallengeDefinition.Create("daily_slide_kills_3", "Get {0} kills while sliding", ChallengeMetric.SlideKills, 3, 550),
                ChallengeDefinition.Create("daily_hipfire_kills_8", "Get {0} hip-fire kills", ChallengeMetric.HipfireKills, 8, 450),
                ChallengeDefinition.Create("daily_play_3", "Play {0} matches", ChallengeMetric.MatchesPlayed, 3, 400),
                ChallengeDefinition.Create("daily_win_2", "Win {0} matches", ChallengeMetric.MatchesWon, 2, 500),
                ChallengeDefinition.Create("daily_assists_5", "Get {0} assists", ChallengeMetric.Assists, 5, 400),
                ChallengeDefinition.Create("daily_score_4000", "Earn {0} score", ChallengeMetric.ScoreEarned, 4000, 450),
            };
            return pool;
        }
    }
}
