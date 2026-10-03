using MobileFPS.Core;
using MobileFPS.Economy;
using UnityEngine;

namespace MobileFPS.LiveOps
{
    public enum ChallengeMetric : byte
    {
        Kills,
        Headshots,
        KillsWithWeaponClass,
        LongshotKills,
        SlideKills,
        HipfireKills,
        MatchesPlayed,
        MatchesWon,
        Assists,
        ScoreEarned,
    }

    /// <summary>
    /// A daily challenge template. Good daily challenges are completable in 2-3
    /// matches, push variety (a different weapon class or playstyle each day),
    /// and pay battle pass XP, which ties daily play to the monetized pass.
    /// </summary>
    [CreateAssetMenu(menuName = "MobileFPS/Meta/Challenge", fileName = "Challenge_")]
    public sealed class ChallengeDefinition : ScriptableObject
    {
        public string challengeId = "challenge_id";
        [Tooltip("{0} is replaced with the target.")]
        public string descriptionFormat = "Get {0} kills";
        public ChallengeMetric metric = ChallengeMetric.Kills;
        public bool filterByWeaponClass;
        public WeaponClass weaponClass = WeaponClass.AssaultRifle;
        public int target = 10;
        public RewardBundle reward = RewardBundle.Of(RewardItem.BattlePassXp(400), RewardItem.Credits(100));
        [Tooltip("Relative chance of being picked each day.")]
        public float weight = 1f;
        public int minAccountLevel = 1;

        public string Description => string.Format(descriptionFormat, target);

        public static ChallengeDefinition Create(string id, string format, ChallengeMetric metric, int target, int bpXp,
            WeaponClass? weaponClass = null)
        {
            var challenge = CreateInstance<ChallengeDefinition>();
            challenge.name = id;
            challenge.challengeId = id;
            challenge.descriptionFormat = format;
            challenge.metric = metric;
            challenge.target = target;
            challenge.reward = RewardBundle.Of(RewardItem.BattlePassXp(bpXp), RewardItem.Credits(bpXp / 4));
            if (weaponClass.HasValue)
            {
                challenge.filterByWeaponClass = true;
                challenge.weaponClass = weaponClass.Value;
            }
            return challenge;
        }
    }
}
