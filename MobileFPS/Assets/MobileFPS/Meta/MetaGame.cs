using System;
using MobileFPS.Analytics;
using MobileFPS.Core;
using MobileFPS.Economy;
using MobileFPS.LiveOps;
using MobileFPS.Monetization;
using MobileFPS.Profile;
using MobileFPS.Progression;
using UnityEngine;

namespace MobileFPS.Meta
{
    /// <summary>
    /// Composition root for the meta game: builds every service in dependency
    /// order, wires ads and IAP to the profile, and owns the app lifecycle
    /// (save on pause, notifications, day rollover while backgrounded).
    ///
    /// Services are plain C# classes (unit-testable, server-portable); this
    /// MonoBehaviour is the only Unity-aware glue. Put it in the boot scene with
    /// its config assets. Every config falls back to built-in defaults, so the
    /// whole loop also runs with zero setup.
    /// </summary>
    [AutoCreateSingleton]
    [DefaultExecutionOrder(-400)]
    public sealed class MetaGame : Singleton<MetaGame>
    {
        [SerializeField] private ProgressionConfig progressionConfig;
        [SerializeField] private MatchRewardConfig matchRewardConfig;
        [SerializeField] private BattlePassSeasonDefinition battlePassSeason;
        [SerializeField] private DailyRewardCalendar dailyRewardCalendar;
        [SerializeField] private ChallengePool challengePool;
        [SerializeField] private float autosaveIntervalSeconds = 3f;
        [SerializeField] private bool logAnalyticsToConsole = true;

        private float _nextAutosave;
        private INotificationScheduler _notifications;

        static MetaGame()
        {
            StaticReset.Register(() => Ready = null);
        }

        public ITimeProvider Time { get; private set; }
        public ProfileService Profile { get; private set; }
        public Wallet Wallet { get; private set; }
        public InventoryService Inventory { get; private set; }
        public ProgressionService Progression { get; private set; }
        public RewardGranter Rewards { get; private set; }
        public BattlePassService BattlePass { get; private set; }
        public DailyRewardService DailyRewards { get; private set; }
        public DailyChallengeService Challenges { get; private set; }
        public PostMatchRewardService MatchRewards { get; private set; }
        public ShopService Shop { get; private set; }
        public PurchaseFulfillmentService Purchases { get; private set; }

        /// <summary>Raised once all services are ready (UI binds here).</summary>
        public static event Action<MetaGame> Ready;
        public bool IsReady { get; private set; }

        protected override void OnSingletonAwake()
        {
            if (logAnalyticsToConsole && (Application.isEditor || Debug.isDebugBuild)) Telemetry.AddSink(new DebugLogAnalyticsSink());
            ResolveConfigs();

            // Profile first (with a temporary device clock to stamp a new profile).
            Profile = new ProfileService(new JsonFileSaveStore());
            Profile.Load(DateTime.UtcNow);
            PlayerProfileData data = Profile.Data;
            Action markDirty = Profile.MarkDirty;

            // Device clock with rollback detection, persisted in the profile. Replace with
            // ServerSyncedTimeProvider (fed from your backend's login response) in production.
            Time = new DeviceTimeProvider(() => data.lastSeenUtcTicks, ticks => data.lastSeenUtcTicks = ticks);

            Wallet = new Wallet(data.wallet, markDirty);
            Inventory = new InventoryService(data.inventory, markDirty);
            Progression = new ProgressionService(data.progression, progressionConfig, Time, markDirty);
            Rewards = new RewardGranter(Wallet, Inventory, Progression);
            Progression.Granter = Rewards;

            BattlePass = new BattlePassService(data.battlePass, battlePassSeason, Time, Wallet, Rewards, markDirty);
            Rewards.SetBattlePass(BattlePass);

            DailyRewards = new DailyRewardService(data.dailyReward, dailyRewardCalendar, Time, Rewards, markDirty);
            Challenges = new DailyChallengeService(data.challenges, challengePool, Time, data.playerId,
                () => Progression.AccountLevel, Rewards, markDirty);
            MatchRewards = new PostMatchRewardService(matchRewardConfig, Progression, BattlePass, Wallet,
                data.progression, data.monetization, Time, dailyRewardCalendar.resetHourUtc, markDirty);
            Shop = new ShopService(Wallet, Inventory, Rewards, data.monetization, Time, markDirty);
            Purchases = new PurchaseFulfillmentService(data.monetization, Inventory, Rewards,
                () => Progression.AccountLevel, Profile.SaveNow);

            Challenges.EnsureToday();
            Challenges.Enable();
            MatchRewards.Enable();

            // Monetization services, wired to the profile.
            AdsManager ads = AdsManager.Instance;
            ads.Configure(new AdFrequencyLimiter(data.monetization, ads.Config, Time, markDirty), data.playerId);
            IAPStoreManager.Instance.Initialize(Purchases);

            _notifications = NotificationSchedulerRegistry.Factory?.Invoke() ?? new NullNotificationScheduler();
            _notifications.CancelAll(); // the player is here: pending reminders are moot
            EventBus<DailyRewardClaimedEvent>.Subscribe(OnDailyRewardClaimed);

            Telemetry.SetUserProperty("payer", Purchases.IsPayer ? "1" : "0");
            Telemetry.SetUserProperty("account_level", Progression.AccountLevel.ToString());
            Telemetry.Log("session_start", "session", data.sessionCount, "daily_available", DailyRewards.Status == DailyClaimStatus.Available);

            IsReady = true;
            Ready?.Invoke(this);
        }

        protected override void OnSingletonDestroy()
        {
            Challenges?.Disable();
            MatchRewards?.Disable();
            EventBus<DailyRewardClaimedEvent>.Unsubscribe(OnDailyRewardClaimed);
            Profile?.SaveNow();
        }

        private void OnDailyRewardClaimed(in DailyRewardClaimedEvent evt)
        {
            // Contextual notification-permission ask: right after the first claim, when
            // "remind me tomorrow" has obvious value to the player.
            if (!evt.Boosted && DailyRewards.TotalClaims == 1) _notifications.RequestPermission();
        }

        private void Update()
        {
            if (UnityEngine.Time.unscaledTime < _nextAutosave) return;
            _nextAutosave = UnityEngine.Time.unscaledTime + autosaveIntervalSeconds;
            Profile.Flush(); // no-op unless something changed
        }

        private void OnApplicationPause(bool paused)
        {
            if (!IsReady) return;
            if (paused)
            {
                // Android may kill a backgrounded app without further callbacks: save now, synchronously.
                Profile.SaveNow();
                ReengagementPlanner.Apply(_notifications, ReengagementPlanner.Plan(Time.UtcNow,
                    TimeZoneInfo.Local.GetUtcOffset(DateTime.UtcNow), DailyRewards, Challenges, BattlePass));
            }
            else
            {
                _notifications.CancelAll();
                Challenges.EnsureToday(); // the day may have rolled over while backgrounded
            }
        }

        private void OnApplicationQuit()
        {
            if (IsReady) Profile.SaveNow();
        }

        /// <summary>Daily reward 2x: shows a rewarded ad, then grants the boost if it was watched.</summary>
        public void BoostDailyRewardWithAd(Action<bool> onDone)
        {
            if (!DailyRewards.CanBoostToday)
            {
                onDone?.Invoke(false);
                return;
            }
            AdsManager.Instance.ShowRewarded(AdsConfig.DailyRewardBoostPlacement, result =>
                onDone?.Invoke(result == RewardedAdResult.Rewarded && DailyRewards.TryApplyAdBoost()));
        }

        private void ResolveConfigs()
        {
            if (progressionConfig == null) progressionConfig = ScriptableObject.CreateInstance<ProgressionConfig>();
            if (matchRewardConfig == null) matchRewardConfig = ScriptableObject.CreateInstance<MatchRewardConfig>();
            if (dailyRewardCalendar == null) dailyRewardCalendar = ScriptableObject.CreateInstance<DailyRewardCalendar>();
            if (challengePool == null) challengePool = ChallengePool.CreateDefault();
            if (battlePassSeason == null)
            {
                // Runtime default: a 60-day season starting at the current UTC day.
                battlePassSeason = ScriptableObject.CreateInstance<BattlePassSeasonDefinition>();
                DateTime today = DateTime.UtcNow.Date;
                battlePassSeason.seasonId = $"default_{today:yyyyMM}";
                battlePassSeason.SetWindow(new DateTime(today.Year, today.Month, 1, 0, 0, 0, DateTimeKind.Utc),
                    new DateTime(today.Year, today.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddDays(60));
            }
        }
    }
}
