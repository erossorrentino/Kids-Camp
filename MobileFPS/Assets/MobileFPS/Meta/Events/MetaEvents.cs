using MobileFPS.Core;
using MobileFPS.Economy;

namespace MobileFPS.Meta
{
    // Meta-layer events, for UI (toasts, red dots, popups), analytics and audio.
    // Same zero-allocation EventBus as gameplay.

    public struct CurrencyChangedEvent : IGameEvent
    {
        public CurrencyType Currency;
        public long NewBalance;
        public long Delta;
        public string Reason;
    }

    public struct ItemGrantedEvent : IGameEvent
    {
        public string ItemId;
        public string Source;
    }

    public struct AccountLevelUpEvent : IGameEvent
    {
        public int NewLevel;
    }

    public struct WeaponLevelUpEvent : IGameEvent
    {
        public string WeaponId;
        public int NewLevel;
    }

    public struct BattlePassTierReachedEvent : IGameEvent
    {
        public int Tier;           // 1-based tier number just reached
        public bool HasPremium;
    }

    public struct BattlePassPremiumUnlockedEvent : IGameEvent
    {
        public string SeasonId;
    }

    public struct DailyRewardClaimedEvent : IGameEvent
    {
        public int CalendarIndex;
        public bool Boosted;
    }

    public struct ChallengeProgressEvent : IGameEvent
    {
        public string ChallengeId;
        public int Progress;
        public int Target;
        public bool JustCompleted;
    }

    public struct MatchRewardsGrantedEvent : IGameEvent
    {
        public string MatchId;
        public long Credits;
        public long AccountXp;
        public long BattlePassXp;
        public bool FirstWinBonus;
        public bool DoubleXpApplied;
        public bool CanDoubleWithAd;
    }

    public struct RewardedAdCompletedEvent : IGameEvent
    {
        public string PlacementId;
        public bool Rewarded;
    }

    public struct PurchaseCompletedEvent : IGameEvent
    {
        public string ProductId;
        public string TransactionId;
        public bool Restored;
    }

    public struct PurchaseFailedEvent : IGameEvent
    {
        public string ProductId;
        public string Reason;
    }
}
