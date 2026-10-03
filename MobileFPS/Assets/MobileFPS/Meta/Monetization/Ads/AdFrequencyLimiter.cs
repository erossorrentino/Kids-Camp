using System;
using MobileFPS.Core;
using MobileFPS.Profile;

namespace MobileFPS.Monetization
{
    public enum AdCapStatus : byte
    {
        Allowed,
        DailyCapReached,
        CoolingDown,
        UnknownPlacement,
    }

    /// <summary>
    /// Per-placement daily caps and cooldowns, persisted in the profile. Caps
    /// protect the economy (ads must not out-earn playing) and ad-network fill
    /// quality: networks penalize inventory that farms impressions.
    /// </summary>
    public sealed class AdFrequencyLimiter
    {
        private readonly MonetizationData _data;
        private readonly AdsConfig _config;
        private readonly ITimeProvider _time;
        private readonly Action _markDirty;

        public AdFrequencyLimiter(MonetizationData data, AdsConfig config, ITimeProvider time, Action markDirty)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _time = time ?? throw new ArgumentNullException(nameof(time));
            _markDirty = markDirty;
        }

        public AdCapStatus Check(string placementId)
        {
            RewardedPlacement placement = _config.GetPlacement(placementId);
            if (placement == null) return AdCapStatus.UnknownPlacement;

            AdPlacementData state = Find(placementId);
            if (state == null) return AdCapStatus.Allowed;

            DateTime now = _time.UtcNow;
            int today = GameDay.Index(now, _config.resetHourUtc);
            if (placement.dailyCap > 0 && state.dayIndex == today && state.countToday >= placement.dailyCap) return AdCapStatus.DailyCapReached;
            if (placement.cooldownSeconds > 0f && (now - new DateTime(state.lastShownUtcTicks, DateTimeKind.Utc)).TotalSeconds < placement.cooldownSeconds)
            {
                return AdCapStatus.CoolingDown;
            }
            return AdCapStatus.Allowed;
        }

        public int RemainingToday(string placementId)
        {
            RewardedPlacement placement = _config.GetPlacement(placementId);
            if (placement == null) return 0;
            if (placement.dailyCap <= 0) return int.MaxValue;
            AdPlacementData state = Find(placementId);
            int today = GameDay.Index(_time.UtcNow, _config.resetHourUtc);
            int used = state != null && state.dayIndex == today ? state.countToday : 0;
            return Math.Max(0, placement.dailyCap - used);
        }

        public void RecordRewarded(string placementId)
        {
            DateTime now = _time.UtcNow;
            int today = GameDay.Index(now, _config.resetHourUtc);
            AdPlacementData state = Find(placementId);
            if (state == null)
            {
                state = new AdPlacementData { placementId = placementId };
                _data.adPlacements.Add(state);
            }
            if (state.dayIndex != today)
            {
                state.dayIndex = today;
                state.countToday = 0;
            }
            state.countToday++;
            state.lastShownUtcTicks = now.Ticks;
            _markDirty?.Invoke();
        }

        private AdPlacementData Find(string placementId)
        {
            for (int i = 0; i < _data.adPlacements.Count; i++)
            {
                if (_data.adPlacements[i].placementId == placementId) return _data.adPlacements[i];
            }
            return null;
        }
    }
}
