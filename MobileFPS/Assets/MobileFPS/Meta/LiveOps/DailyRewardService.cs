using System;
using MobileFPS.Analytics;
using MobileFPS.Core;
using MobileFPS.Economy;
using MobileFPS.Meta;
using MobileFPS.Profile;

namespace MobileFPS.LiveOps
{
    public enum DailyClaimStatus : byte
    {
        Available,
        AlreadyClaimedToday,
        ClockUntrusted,
        NotConfigured,
    }

    /// <summary>
    /// Daily login rewards with streaks, grace days, and a rewarded-ad 2x boost.
    ///
    /// Anti-exploit: days come from <see cref="ITimeProvider"/> at a fixed UTC
    /// reset hour, so changing timezone does nothing, and a rolled-back device
    /// clock marks the provider untrusted and blocks claims. Use a server-synced
    /// provider in production to close forward-skipping too.
    /// </summary>
    public sealed class DailyRewardService
    {
        private readonly DailyRewardData _data;
        private readonly DailyRewardCalendar _calendar;
        private readonly ITimeProvider _time;
        private readonly RewardGranter _granter;
        private readonly Action _markDirty;

        public DailyRewardService(DailyRewardData data, DailyRewardCalendar calendar, ITimeProvider time,
            RewardGranter granter, Action markDirty)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _calendar = calendar ?? throw new ArgumentNullException(nameof(calendar));
            _time = time ?? throw new ArgumentNullException(nameof(time));
            _granter = granter;
            _markDirty = markDirty;
        }

        public DailyRewardCalendar Calendar => _calendar;
        public int TodayIndex => GameDay.Index(_time.UtcNow, _calendar.resetHourUtc);
        public int TotalClaims => _data.totalClaims;
        public TimeSpan TimeUntilReset => GameDay.UntilNextReset(_time.UtcNow, _calendar.resetHourUtc);

        public DailyClaimStatus Status
        {
            get
            {
                if (_calendar.Length == 0) return DailyClaimStatus.NotConfigured;
                if (!_time.IsTrusted) return DailyClaimStatus.ClockUntrusted;
                return TodayIndex > _data.lastClaimDay ? DailyClaimStatus.Available : DailyClaimStatus.AlreadyClaimedToday;
            }
        }

        /// <summary>Calendar slot today's claim would grant (accounts for a broken streak).</summary>
        public int NextCalendarIndex
        {
            get
            {
                if (_calendar.Length == 0) return 0;
                if (_data.lastClaimDay < 0) return 0;
                if (_calendar.streakMode == StreakMode.Consecutive)
                {
                    int missedDays = TodayIndex - _data.lastClaimDay - 1;
                    if (missedDays > _calendar.graceDays) return 0; // streak broken
                }
                return _data.nextCalendarIndex % _calendar.Length;
            }
        }

        /// <summary>Claimed yesterday but not yet today: the "don't lose your streak" notification trigger.</summary>
        public bool IsStreakAtRisk => _calendar.streakMode == StreakMode.Consecutive && _data.lastClaimDay >= 0 && TodayIndex - _data.lastClaimDay == 1;

        public RewardBundle PreviewNext() => _calendar.Length > 0 ? _calendar.days[NextCalendarIndex] : null;

        public bool TryClaim(out RewardBundle granted)
        {
            granted = null;
            if (Status != DailyClaimStatus.Available) return false;

            int index = NextCalendarIndex;
            int today = TodayIndex;
            granted = _calendar.days[index];

            _data.lastClaimDay = today;
            _data.lastClaimedCalendarIndex = index;
            _data.nextCalendarIndex = (index + 1) % _calendar.Length;
            _data.totalClaims++;
            _markDirty?.Invoke();

            _granter.Grant(granted, $"daily_day{index + 1}");
            Telemetry.Log("daily_reward_claimed", "day", index + 1, "total_claims", _data.totalClaims);
            EventBus<DailyRewardClaimedEvent>.Raise(new DailyRewardClaimedEvent { CalendarIndex = index, Boosted = false });
            return true;
        }

        /// <summary>The 2x offer is available after claiming, once per day.</summary>
        public bool CanBoostToday => _data.lastClaimDay == TodayIndex && _data.lastBoostDay != TodayIndex && _data.lastClaimedCalendarIndex >= 0;

        /// <summary>Call ONLY after a rewarded ad reports the reward as earned. Grants the extra (multiplier - 1) copies.</summary>
        public bool TryApplyAdBoost()
        {
            if (!CanBoostToday || _calendar.adBoostMultiplier <= 1) return false;
            int index = _data.lastClaimedCalendarIndex;
            _data.lastBoostDay = TodayIndex;
            _markDirty?.Invoke();

            _granter.Grant(_calendar.days[index], $"daily_day{index + 1}_ad_boost", _calendar.adBoostMultiplier - 1);
            Telemetry.Log("daily_reward_boosted", "day", index + 1);
            EventBus<DailyRewardClaimedEvent>.Raise(new DailyRewardClaimedEvent { CalendarIndex = index, Boosted = true });
            return true;
        }
    }
}
