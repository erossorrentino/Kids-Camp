using System;
using MobileFPS.Core;
using UnityEngine;

namespace MobileFPS.Progression
{
    /// <summary>What a match pays out, with a breakdown for the results screen.</summary>
    public struct MatchRewards
    {
        public long Credits;
        public long AccountXp;
        public long BattlePassXp;
        public long WeaponXp;
        public bool FirstWinBonusApplied;
        public bool DoubleXpApplied;

        // Results-screen breakdown. Itemized rewards feel bigger than one total;
        // that is a measurable effect on perceived reward.
        public long KillCredits;
        public long CompletionCredits;
        public long WinCredits;
        public long FirstWinCredits;
        public long ScoreXp;
        public long BonusXp;
    }

    /// <summary>Pure reward math: no state, no Unity objects. Server-portable and unit-tested.</summary>
    public static class MatchRewardCalculator
    {
        public static MatchRewards Calculate(in MatchSummary summary, MatchRewardConfig config, bool doubleXpActive, bool firstWinOfDay)
        {
            if (config == null) throw new ArgumentNullException(nameof(config));
            bool won = summary.Outcome == MatchOutcome.Win;
            var rewards = new MatchRewards();

            rewards.KillCredits = (long)summary.Kills * config.creditsPerKill + (long)summary.Assists * config.creditsPerAssist;
            rewards.CompletionCredits = summary.CompletedMatch ? config.creditsCompletion : 0;
            rewards.WinCredits = won ? config.creditsWinBonus : 0;
            rewards.FirstWinBonusApplied = won && firstWinOfDay;
            rewards.FirstWinCredits = rewards.FirstWinBonusApplied ? config.firstWinBonusCredits : 0;

            long credits = rewards.KillCredits + rewards.CompletionCredits + rewards.WinCredits;
            rewards.Credits = Math.Min(credits, config.maxCreditsPerMatch) + rewards.FirstWinCredits;

            rewards.ScoreXp = (long)Mathf.Round(Mathf.Max(0, summary.Score) * config.xpPerScorePoint);
            rewards.BonusXp = (summary.CompletedMatch ? config.xpCompletionBonus : 0) + (won ? config.xpWinBonus : 0);
            long xp = rewards.ScoreXp + rewards.BonusXp;
            rewards.DoubleXpApplied = doubleXpActive;
            if (doubleXpActive) xp *= Math.Max(1, config.doubleXpMultiplier);
            // First-win bonus is added after the multiplier: it's a flat daily gift, not a multiplier target.
            if (rewards.FirstWinBonusApplied) xp += config.firstWinBonusXp;
            rewards.AccountXp = xp;

            float minutes = Mathf.Max(0f, summary.DurationSeconds) / 60f;
            rewards.BattlePassXp = (long)Mathf.Round(minutes * config.battlePassXpPerMinute) + (won ? config.battlePassXpWinBonus : 0);

            rewards.WeaponXp = (long)summary.Kills * config.weaponXpPerKill + (long)Mathf.Round(Mathf.Max(0, summary.Score) * config.weaponXpPerScorePoint);
            if (doubleXpActive) rewards.WeaponXp *= Math.Max(1, config.doubleXpMultiplier);
            return rewards;
        }
    }
}
