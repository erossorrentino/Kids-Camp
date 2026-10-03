using MobileFPS.Economy;
using UnityEngine;

namespace MobileFPS.LiveOps
{
    public enum StreakMode : byte
    {
        /// <summary>Missing more than the grace window restarts the calendar at day 1. Stronger habit loop, harsher.</summary>
        Consecutive,

        /// <summary>Missed days just pause progress. Gentler; better for lapsed-player return.</summary>
        Cumulative,
    }

    /// <summary>
    /// Login calendar. Escalating rewards with a big day-7 payoff create the
    /// "I can't break my streak" habit that lifts D1-D7 retention.
    /// </summary>
    [CreateAssetMenu(menuName = "MobileFPS/Meta/Daily Reward Calendar", fileName = "DailyRewardCalendar")]
    public sealed class DailyRewardCalendar : ScriptableObject
    {
        public RewardBundle[] days =
        {
            RewardBundle.Of(RewardItem.Credits(150)),
            RewardBundle.Of(RewardItem.DoubleXp(30)),
            RewardBundle.Of(RewardItem.Credits(300)),
            RewardBundle.Of(RewardItem.BattlePassXp(600)),
            RewardBundle.Of(RewardItem.Credits(500)),
            RewardBundle.Of(RewardItem.Gems(20)),
            RewardBundle.Of(RewardItem.Gems(50), RewardItem.Item("skin_smg_daily_streak")), // the day-7 hook
        };

        public StreakMode streakMode = StreakMode.Consecutive;

        [Tooltip("Consecutive mode: days that may be missed without losing the streak (1 = one free miss).")]
        public int graceDays = 1;

        [Tooltip("Game-day rollover hour (UTC). Same for every player worldwide.")]
        [Range(0, 23)] public int resetHourUtc = 0;

        [Tooltip("Rewarded-ad boost multiplier for today's reward (2 = watch an ad, get it twice).")]
        public int adBoostMultiplier = 2;

        public int Length => days != null ? days.Length : 0;
    }
}
