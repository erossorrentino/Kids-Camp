using System;
using System.Collections.Generic;

namespace MobileFPS.LiveOps
{
    /// <summary>Local push notification backend (Android Mobile Notifications, iOS, or a no-op).</summary>
    public interface INotificationScheduler
    {
        bool IsAvailable { get; }
        void RequestPermission();
        void CancelAll();
        void Schedule(string id, string title, string body, DateTime fireUtc);
    }

    public sealed class NullNotificationScheduler : INotificationScheduler
    {
        public bool IsAvailable => false;
        public void RequestPermission() { }
        public void CancelAll() { }
        public void Schedule(string id, string title, string body, DateTime fireUtc) { }
    }

    /// <summary>Optional SDK integrations register here (see the Notifications integration assembly).</summary>
    public static class NotificationSchedulerRegistry
    {
        public static Func<INotificationScheduler> Factory { get; set; }
    }

    public struct PlannedNotification
    {
        public string Id;
        public string Title;
        public string Body;
        public DateTime FireUtc;
    }

    /// <summary>
    /// Plans re-engagement notifications on every app pause (and cancels them on
    /// resume). Local notifications tied to real, earned value are one of the
    /// strongest D1/D7 retention levers.
    ///
    /// They only work if they don't annoy. Built-in restraint:
    /// - every notification points at something real (reward ready, streak at
    ///   risk, season ending): no generic "come back!" spam;
    /// - quiet hours in the player's local time (nothing between 22:00 and 09:00);
    /// - at most one notification per 6-hour window, at most 4 planned in total.
    /// Players who disable notifications usually also uninstall, so err on the side of fewer.
    /// </summary>
    public static class ReengagementPlanner
    {
        public const int QuietStartHour = 22;
        public const int QuietEndHour = 9;
        public static readonly TimeSpan MinimumSpacing = TimeSpan.FromHours(6);
        public const int MaxPlanned = 4;

        public static List<PlannedNotification> Plan(DateTime utcNow, TimeSpan localUtcOffset,
            DailyRewardService dailyRewards, DailyChallengeService challenges, BattlePassService battlePass)
        {
            var candidates = new List<PlannedNotification>(6);

            if (dailyRewards != null)
            {
                DateTime nextReset = utcNow + dailyRewards.TimeUntilReset;
                if (dailyRewards.Status == DailyClaimStatus.AlreadyClaimedToday)
                {
                    int nextDay = Math.Min(dailyRewards.NextCalendarIndex + 1, dailyRewards.Calendar.Length);
                    candidates.Add(new PlannedNotification
                    {
                        Id = "daily_ready",
                        Title = "Your daily reward is ready",
                        Body = challenges != null ? $"Day {nextDay} reward + 3 new daily challenges are waiting." : $"Day {nextDay} reward is waiting.",
                        FireUtc = nextReset.AddHours(1),
                    });
                    if (dailyRewards.Calendar.streakMode == StreakMode.Consecutive)
                    {
                        candidates.Add(new PlannedNotification
                        {
                            Id = "streak_risk",
                            Title = "Don't lose your streak!",
                            Body = "Log in today to keep your login streak alive.",
                            FireUtc = nextReset.AddHours(18),
                        });
                    }
                }
                else if (dailyRewards.Status == DailyClaimStatus.Available && dailyRewards.TimeUntilReset > TimeSpan.FromHours(4))
                {
                    candidates.Add(new PlannedNotification
                    {
                        Id = "daily_unclaimed",
                        Title = "Unclaimed daily reward",
                        Body = "Claim it before the daily reset to keep your streak going.",
                        FireUtc = utcNow.AddHours(3),
                    });
                }
            }

            if (battlePass != null && battlePass.IsSeasonActive)
            {
                TimeSpan remaining = battlePass.TimeRemaining;
                if (remaining > TimeSpan.FromHours(25) && remaining < TimeSpan.FromDays(7))
                {
                    int unclaimed = battlePass.UnclaimedCount;
                    candidates.Add(new PlannedNotification
                    {
                        Id = "season_ending",
                        Title = $"{battlePass.Season.displayName} ends in 24 hours",
                        Body = unclaimed > 0 ? $"You have {unclaimed} battle pass rewards to claim." : "Last chance to finish the battle pass.",
                        FireUtc = utcNow + remaining - TimeSpan.FromHours(24),
                    });
                }
            }

            for (int i = 0; i < candidates.Count; i++)
            {
                PlannedNotification n = candidates[i];
                n.FireUtc = MoveOutOfQuietHours(n.FireUtc, localUtcOffset);
                candidates[i] = n;
            }
            candidates.Sort((a, b) => a.FireUtc.CompareTo(b.FireUtc));

            var plan = new List<PlannedNotification>(MaxPlanned);
            DateTime lastFire = DateTime.MinValue;
            foreach (PlannedNotification n in candidates)
            {
                if (n.FireUtc <= utcNow || n.FireUtc - lastFire < MinimumSpacing) continue;
                plan.Add(n);
                lastFire = n.FireUtc;
                if (plan.Count >= MaxPlanned) break;
            }
            return plan;
        }

        public static void Apply(INotificationScheduler scheduler, List<PlannedNotification> plan)
        {
            if (scheduler == null || !scheduler.IsAvailable) return;
            scheduler.CancelAll();
            foreach (PlannedNotification n in plan) scheduler.Schedule(n.Id, n.Title, n.Body, n.FireUtc);
        }

        /// <summary>Shifts a UTC instant that lands in local quiet hours to 09:00 local.</summary>
        public static DateTime MoveOutOfQuietHours(DateTime fireUtc, TimeSpan localUtcOffset)
        {
            DateTime local = fireUtc + localUtcOffset;
            if (local.Hour >= QuietStartHour) local = local.Date.AddDays(1).AddHours(QuietEndHour);
            else if (local.Hour < QuietEndHour) local = local.Date.AddHours(QuietEndHour);
            else return fireUtc;
            return DateTime.SpecifyKind(local - localUtcOffset, DateTimeKind.Utc);
        }
    }
}
