using System;
using MobileFPS.Analytics;
using MobileFPS.Core;
using MobileFPS.Economy;
using MobileFPS.Meta;
using MobileFPS.Profile;
using UnityEngine;

namespace MobileFPS.LiveOps
{
    public enum BattlePassTrack : byte
    {
        Free,
        Premium,
    }

    public enum ClaimResult : byte
    {
        Claimed,
        NotReached,
        AlreadyClaimed,
        PremiumRequired,
        InvalidTier,
        Nothing,
    }

    /// <summary>
    /// Season progress, tier claims, premium unlock and tier skips. Rewards are
    /// claimed manually: the "unclaimed rewards" badge pulls players back into
    /// the pass screen, where the locked premium rewards are visible.
    /// Premium unlocks are retroactive: every premium reward already earned
    /// becomes claimable at once, which is a strong conversion moment.
    /// </summary>
    public sealed class BattlePassService
    {
        private readonly BattlePassData _data;
        private readonly BattlePassSeasonDefinition _season;
        private readonly ITimeProvider _time;
        private readonly Wallet _wallet;
        private readonly RewardGranter _granter;
        private readonly Action _markDirty;

        public BattlePassService(BattlePassData data, BattlePassSeasonDefinition season, ITimeProvider time,
            Wallet wallet, RewardGranter granter, Action markDirty)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _season = season ?? throw new ArgumentNullException(nameof(season));
            _time = time;
            _wallet = wallet;
            _granter = granter;
            _markDirty = markDirty;
            EnsureSeason();
        }

        public BattlePassSeasonDefinition Season => _season;
        public bool HasPremium => _data.premium;
        public long Xp => _data.xp;
        public int TierCount => _season.TierCount;

        /// <summary>Number of tiers reached (0 = none yet). Tier index i is unlocked when i &lt; CurrentTier.</summary>
        public int CurrentTier => (int)Math.Min(_data.xp / Math.Max(1, _season.xpPerTier), _season.TierCount);

        public long XpIntoCurrentTier => CurrentTier >= _season.TierCount ? 0 : _data.xp % Math.Max(1, _season.xpPerTier);

        public bool IsSeasonActive
        {
            get
            {
                DateTime now = _time.UtcNow;
                return now >= _season.StartUtc && now < _season.EndUtc;
            }
        }

        public TimeSpan TimeRemaining
        {
            get
            {
                TimeSpan remaining = _season.EndUtc - _time.UtcNow;
                return remaining > TimeSpan.Zero ? remaining : TimeSpan.Zero;
            }
        }

        /// <summary>Rewards ready to claim (drives the red-dot badge).</summary>
        public int UnclaimedCount
        {
            get
            {
                int count = 0;
                int reached = CurrentTier;
                for (int i = 0; i < reached; i++)
                {
                    if (CanClaim(i, BattlePassTrack.Free) == ClaimResult.Claimed) count++;
                    if (CanClaim(i, BattlePassTrack.Premium) == ClaimResult.Claimed) count++;
                }
                return count;
            }
        }

        public void AddXp(long amount, string source)
        {
            if (amount <= 0 || !IsSeasonActive) return;
            int before = CurrentTier;
            long maxXp = (long)_season.TierCount * _season.xpPerTier;
            _data.xp = Math.Min(_data.xp + amount, maxXp);
            _markDirty?.Invoke();

            int after = CurrentTier;
            for (int tier = before + 1; tier <= after; tier++)
            {
                EventBus<BattlePassTierReachedEvent>.Raise(new BattlePassTierReachedEvent { Tier = tier, HasPremium = _data.premium });
            }
            if (after > before) Telemetry.Log("bp_tier_reached", "tier", after, "premium", _data.premium, "source", source);
        }

        public ClaimResult CanClaim(int tierIndex, BattlePassTrack track)
        {
            if (tierIndex < 0 || tierIndex >= _season.TierCount) return ClaimResult.InvalidTier;
            if (tierIndex >= CurrentTier) return ClaimResult.NotReached;
            if (track == BattlePassTrack.Premium && !_data.premium) return ClaimResult.PremiumRequired;

            BattlePassTier tier = _season.tiers[tierIndex];
            RewardBundle bundle = track == BattlePassTrack.Free ? tier.free : tier.premium;
            if (bundle == null || bundle.IsEmpty) return ClaimResult.Nothing;
            return ClaimedList(track).Contains(tierIndex) ? ClaimResult.AlreadyClaimed : ClaimResult.Claimed;
        }

        public ClaimResult Claim(int tierIndex, BattlePassTrack track)
        {
            ClaimResult result = CanClaim(tierIndex, track);
            if (result != ClaimResult.Claimed) return result;

            ClaimedList(track).Add(tierIndex);
            _markDirty?.Invoke();
            BattlePassTier tier = _season.tiers[tierIndex];
            _granter.Grant(track == BattlePassTrack.Free ? tier.free : tier.premium, $"bp_{_season.seasonId}_{track}_{tierIndex + 1}");
            return ClaimResult.Claimed;
        }

        /// <summary>"Claim all" button. Returns the number of rewards claimed.</summary>
        public int ClaimAllAvailable()
        {
            int claimed = 0;
            int reached = CurrentTier;
            for (int i = 0; i < reached; i++)
            {
                if (Claim(i, BattlePassTrack.Free) == ClaimResult.Claimed) claimed++;
                if (Claim(i, BattlePassTrack.Premium) == ClaimResult.Claimed) claimed++;
            }
            return claimed;
        }

        /// <summary>Unlocks the premium track (from an IAP fulfillment or a gem purchase). Idempotent.</summary>
        public void UnlockPremium(string source)
        {
            if (_data.premium) return;
            _data.premium = true;
            _markDirty?.Invoke();
            Telemetry.Log("bp_premium_unlocked", "season", _season.seasonId, "source", source, "tier", CurrentTier);
            EventBus<BattlePassPremiumUnlockedEvent>.Raise(new BattlePassPremiumUnlockedEvent { SeasonId = _season.seasonId });
        }

        public bool TryPurchasePremiumWithGems()
        {
            if (_data.premium || !IsSeasonActive) return false;
            if (!_wallet.TrySpend(CurrencyType.Gems, _season.premiumGemPrice, $"bp_premium_{_season.seasonId}")) return false;
            UnlockPremium("gems");
            return true;
        }

        /// <summary>Tier skips: the late-season catch-up purchase for players who fell behind.</summary>
        public bool TryBuyTiers(int count)
        {
            int remaining = _season.TierCount - CurrentTier;
            count = Mathf.Min(count, remaining);
            if (count <= 0 || !IsSeasonActive) return false;

            long cost = (long)count * _season.tierSkipGemPrice;
            if (!_wallet.TrySpend(CurrencyType.Gems, cost, $"bp_tier_skip_{count}")) return false;
            // Skips buy whole tiers from the start of the current tier (partial progress is kept).
            AddXp((long)count * _season.xpPerTier, "tier_skip");
            return true;
        }

        private System.Collections.Generic.List<int> ClaimedList(BattlePassTrack track)
        {
            return track == BattlePassTrack.Free ? _data.claimedFree : _data.claimedPremium;
        }

        private void EnsureSeason()
        {
            if (_data.seasonId == _season.seasonId) return;
            // New season: progress resets. (Unclaimed rewards from the old season could be
            // auto-granted here by keeping the old definition around; a common goodwill feature.)
            _data.seasonId = _season.seasonId;
            _data.xp = 0;
            _data.premium = false;
            _data.claimedFree.Clear();
            _data.claimedPremium.Clear();
            _markDirty?.Invoke();
        }
    }
}
