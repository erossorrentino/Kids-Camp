using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using MobileFPS.Core;
using MobileFPS.Economy;
using MobileFPS.LiveOps;
using MobileFPS.Meta;
using MobileFPS.Monetization;
using MobileFPS.Profile;
using MobileFPS.Progression;
using NUnit.Framework;
using UnityEngine;
#if UNITY_5_3_OR_NEWER
using UnityEngine.TestTools;
#endif

namespace MobileFPS.Tests
{
    /// <summary>Builds a fully wired meta layer on an in-memory profile and a controllable clock.</summary>
    internal sealed class MetaFixture
    {
        public readonly ManualTimeProvider Time = new ManualTimeProvider(new DateTime(2026, 10, 2, 12, 0, 0, DateTimeKind.Utc));
        public readonly PlayerProfileData Data = ProfileService.CreateNew(new DateTime(2026, 10, 2, 12, 0, 0, DateTimeKind.Utc));
        public readonly ProgressionConfig ProgressionConfig = ScriptableObject.CreateInstance<ProgressionConfig>();
        public readonly BattlePassSeasonDefinition Season = ScriptableObject.CreateInstance<BattlePassSeasonDefinition>();
        public int DirtyCount;
        public Wallet Wallet;
        public InventoryService Inventory;
        public ProgressionService Progression;
        public RewardGranter Granter;
        public BattlePassService BattlePass;

        public MetaFixture()
        {
            Data.wallet.credits = 0;
            ProgressionConfig.baseLevelXp = 1000;
            ProgressionConfig.levelXpGrowth = 0;
            ProgressionConfig.levelRewards = new ProgressionConfig.LevelReward[0];
            ProgressionConfig.defaultLevelReward = RewardBundle.Of(RewardItem.Credits(100));

            Season.seasonId = "test_season";
            Season.xpPerTier = 100;
            Season.tiers = BattlePassSeasonDefinition.GenerateDefaultTiers(10);
            Season.SetWindow(Time.UtcNow.AddDays(-1), Time.UtcNow.AddDays(10));

            Action dirty = () => DirtyCount++;
            Wallet = new Wallet(Data.wallet, dirty);
            Inventory = new InventoryService(Data.inventory, dirty);
            Progression = new ProgressionService(Data.progression, ProgressionConfig, Time, dirty);
            Granter = new RewardGranter(Wallet, Inventory, Progression);
            Progression.Granter = Granter;
            BattlePass = new BattlePassService(Data.battlePass, Season, Time, Wallet, Granter, dirty);
            Granter.SetBattlePass(BattlePass);
        }

        public long Credits => Wallet.Get(CurrencyType.Credits);
        public long Gems => Wallet.Get(CurrencyType.Gems);
    }

    public sealed class WalletAndInventoryTests
    {
        [Test]
        public void GrantAndSpend_UpdateBalanceAndRaiseEvents()
        {
            var fixture = new MetaFixture();
            var events = new List<long>();
            GameEventHandler<CurrencyChangedEvent> handler = (in CurrencyChangedEvent e) => events.Add(e.Delta);
            EventBus<CurrencyChangedEvent>.Subscribe(handler);
            try
            {
                fixture.Wallet.Grant(CurrencyType.Gems, 500, "test");
                Assert.IsTrue(fixture.Wallet.TrySpend(CurrencyType.Gems, 200, "test"));
                Assert.IsFalse(fixture.Wallet.TrySpend(CurrencyType.Gems, 1000, "test"));
                Assert.AreEqual(300, fixture.Gems);
                CollectionAssert.AreEqual(new long[] { 500, -200 }, events);
            }
            finally
            {
                EventBus<CurrencyChangedEvent>.Unsubscribe(handler);
            }
        }

        [Test]
        public void NegativeAmounts_AreRefused()
        {
            var fixture = new MetaFixture();
#if UNITY_5_3_OR_NEWER
            LogAssert.Expect(LogType.Error, new Regex("Refusing"));
            LogAssert.Expect(LogType.Error, new Regex("Refusing"));
#endif
            fixture.Wallet.Grant(CurrencyType.Credits, -50, "exploit");
            Assert.IsFalse(fixture.Wallet.TrySpend(CurrencyType.Credits, -50, "exploit"));
            Assert.AreEqual(0, fixture.Credits);
        }

        [Test]
        public void DuplicateCosmetic_ConvertsToCredits()
        {
            var fixture = new MetaFixture();
            RewardBundle skin = RewardBundle.Of(RewardItem.Item("skin_x"));
            fixture.Granter.Grant(skin, "test");
            fixture.Granter.Grant(skin, "test");
            Assert.IsTrue(fixture.Inventory.Owns("skin_x"));
            Assert.AreEqual(1, fixture.Inventory.Count);
            Assert.AreEqual(fixture.Granter.DuplicateItemCreditValue, fixture.Credits);
        }

        [Test]
        public void EquipSkin_RequiresOwnership()
        {
            var fixture = new MetaFixture();
            Assert.IsFalse(fixture.Inventory.EquipSkin("weapon_ar", "skin_x"));
            fixture.Inventory.Add("skin_x", "test");
            Assert.IsTrue(fixture.Inventory.EquipSkin("weapon_ar", "skin_x"));
            Assert.AreEqual("skin_x", fixture.Inventory.GetEquippedSkin("weapon_ar"));
        }
    }

    public sealed class ProgressionTests
    {
        [Test]
        public void Xp_LevelsUpMultipleTimes_AndGrantsLevelRewards()
        {
            var fixture = new MetaFixture();
            int gained = fixture.Progression.AddAccountXp(2500, "test");
            Assert.AreEqual(2, gained);
            Assert.AreEqual(3, fixture.Progression.AccountLevel);
            Assert.AreEqual(500, fixture.Progression.XpIntoLevel);
            Assert.AreEqual(200, fixture.Credits, "two level rewards of 100 credits");
        }

        [Test]
        public void MaxLevel_StopsLevelling()
        {
            var fixture = new MetaFixture();
            fixture.ProgressionConfig.maxAccountLevel = 3;
            fixture.Progression.AddAccountXp(100000, "test");
            Assert.AreEqual(3, fixture.Progression.AccountLevel);
            Assert.AreEqual(0, fixture.Progression.XpIntoLevel);
            Assert.AreEqual(100000, fixture.Progression.TotalXp);
        }

        [Test]
        public void DoubleXp_StacksAndExpires()
        {
            var fixture = new MetaFixture();
            fixture.Progression.AddDoubleXpMinutes(30);
            fixture.Progression.AddDoubleXpMinutes(30);
            Assert.IsTrue(fixture.Progression.IsDoubleXpActive);
            fixture.Time.Advance(TimeSpan.FromMinutes(59));
            Assert.IsTrue(fixture.Progression.IsDoubleXpActive);
            fixture.Time.Advance(TimeSpan.FromMinutes(2));
            Assert.IsFalse(fixture.Progression.IsDoubleXpActive);
        }

        [Test]
        public void FirstWinOfDay_IsConsumedOncePerDay()
        {
            var fixture = new MetaFixture();
            Assert.IsTrue(fixture.Progression.TryConsumeFirstWinOfDay(10));
            Assert.IsFalse(fixture.Progression.TryConsumeFirstWinOfDay(10));
            Assert.IsTrue(fixture.Progression.TryConsumeFirstWinOfDay(11));
        }

        [Test]
        public void WeaponXp_LevelsWeapon()
        {
            var fixture = new MetaFixture();
            fixture.ProgressionConfig.baseWeaponXp = 100;
            fixture.ProgressionConfig.weaponXpGrowth = 0;
            fixture.Progression.AddWeaponXp("weapon_ar", 350);
            Assert.AreEqual(4, fixture.Progression.GetWeaponLevel("weapon_ar"));
            Assert.AreEqual(1, fixture.Progression.GetWeaponLevel("weapon_unknown"));
        }
    }

    public sealed class BattlePassTests
    {
        [Test]
        public void Xp_MapsToTiers_AndClaimsFollowRules()
        {
            var fixture = new MetaFixture();
            fixture.BattlePass.AddXp(250, "test");
            Assert.AreEqual(2, fixture.BattlePass.CurrentTier);

            Assert.AreEqual(ClaimResult.Claimed, fixture.BattlePass.Claim(0, BattlePassTrack.Free));
            Assert.AreEqual(ClaimResult.AlreadyClaimed, fixture.BattlePass.Claim(0, BattlePassTrack.Free));
            Assert.AreEqual(ClaimResult.NotReached, fixture.BattlePass.Claim(2, BattlePassTrack.Free));
            Assert.AreEqual(ClaimResult.PremiumRequired, fixture.BattlePass.Claim(0, BattlePassTrack.Premium));
            Assert.AreEqual(ClaimResult.InvalidTier, fixture.BattlePass.Claim(99, BattlePassTrack.Free));
        }

        [Test]
        public void PremiumUnlock_IsRetroactive()
        {
            var fixture = new MetaFixture();
            fixture.BattlePass.AddXp(500, "test");
            int freeOnly = fixture.BattlePass.UnclaimedCount;
            fixture.BattlePass.UnlockPremium("test");
            Assert.AreEqual(freeOnly * 2, fixture.BattlePass.UnclaimedCount);
            Assert.AreEqual(freeOnly * 2, fixture.BattlePass.ClaimAllAvailable());
            Assert.AreEqual(0, fixture.BattlePass.UnclaimedCount);
        }

        [Test]
        public void TierSkips_CostGems()
        {
            var fixture = new MetaFixture();
            fixture.Wallet.Grant(CurrencyType.Gems, 1000, "test");
            Assert.IsTrue(fixture.BattlePass.TryBuyTiers(3));
            Assert.AreEqual(3, fixture.BattlePass.CurrentTier);
            Assert.AreEqual(1000 - 3 * fixture.Season.tierSkipGemPrice, fixture.Gems);
            Assert.IsFalse(fixture.BattlePass.TryBuyTiers(100), "can't afford the remaining tiers");
        }

        [Test]
        public void PremiumWithGems_AndXpCap()
        {
            var fixture = new MetaFixture();
            Assert.IsFalse(fixture.BattlePass.TryPurchasePremiumWithGems());
            fixture.Wallet.Grant(CurrencyType.Gems, fixture.Season.premiumGemPrice, "test");
            Assert.IsTrue(fixture.BattlePass.TryPurchasePremiumWithGems());
            Assert.IsTrue(fixture.BattlePass.HasPremium);

            fixture.BattlePass.AddXp(1000000, "test");
            Assert.AreEqual(fixture.BattlePass.TierCount, fixture.BattlePass.CurrentTier);
            Assert.AreEqual(fixture.BattlePass.TierCount * fixture.Season.xpPerTier, fixture.BattlePass.Xp);
        }

        [Test]
        public void ExpiredSeason_IgnoresXp_AndNewSeasonResetsProgress()
        {
            var fixture = new MetaFixture();
            fixture.BattlePass.AddXp(300, "test");
            fixture.Time.Advance(TimeSpan.FromDays(30));
            fixture.BattlePass.AddXp(300, "test");
            Assert.AreEqual(300, fixture.BattlePass.Xp);

            BattlePassSeasonDefinition next = ScriptableObject.CreateInstance<BattlePassSeasonDefinition>();
            next.seasonId = "next_season";
            var nextPass = new BattlePassService(fixture.Data.battlePass, next, fixture.Time, fixture.Wallet, fixture.Granter, null);
            Assert.AreEqual(0, nextPass.Xp);
            Assert.IsFalse(nextPass.HasPremium);
        }
    }

    public sealed class DailyRewardTests
    {
        private MetaFixture _fixture;
        private DailyRewardCalendar _calendar;
        private DailyRewardService _daily;

        [SetUp]
        public void SetUp()
        {
            _fixture = new MetaFixture();
            _calendar = ScriptableObject.CreateInstance<DailyRewardCalendar>();
            _calendar.days = Enumerable.Range(1, 7).Select(d => RewardBundle.Of(RewardItem.Credits(d * 100))).ToArray();
            _daily = new DailyRewardService(_fixture.Data.dailyReward, _calendar, _fixture.Time, _fixture.Granter, null);
        }

        private int ClaimIndex()
        {
            Assert.IsTrue(_daily.TryClaim(out _));
            return _fixture.Data.dailyReward.lastClaimedCalendarIndex;
        }

        [Test]
        public void ClaimsOncePerDay_AndAdvances()
        {
            Assert.AreEqual(DailyClaimStatus.Available, _daily.Status);
            Assert.AreEqual(0, ClaimIndex());
            Assert.AreEqual(100, _fixture.Credits);
            Assert.AreEqual(DailyClaimStatus.AlreadyClaimedToday, _daily.Status);
            Assert.IsFalse(_daily.TryClaim(out _));

            _fixture.Time.Advance(TimeSpan.FromDays(1));
            Assert.AreEqual(1, ClaimIndex());
            Assert.AreEqual(300, _fixture.Credits);
        }

        [Test]
        public void GraceDay_KeepsStreak_ButLongerGapResetsIt()
        {
            ClaimIndex();
            _fixture.Time.Advance(TimeSpan.FromDays(2)); // missed one day: within grace
            Assert.AreEqual(1, ClaimIndex());
            _fixture.Time.Advance(TimeSpan.FromDays(3)); // missed two days: streak broken
            Assert.AreEqual(0, ClaimIndex());
        }

        [Test]
        public void CumulativeMode_NeverResets()
        {
            _calendar.streakMode = StreakMode.Cumulative;
            ClaimIndex();
            _fixture.Time.Advance(TimeSpan.FromDays(10));
            Assert.AreEqual(1, ClaimIndex());
        }

        [Test]
        public void Calendar_LoopsAfterLastDay()
        {
            for (int day = 0; day < 7; day++)
            {
                Assert.AreEqual(day, ClaimIndex());
                _fixture.Time.Advance(TimeSpan.FromDays(1));
            }
            Assert.AreEqual(0, ClaimIndex());
        }

        [Test]
        public void UntrustedClock_BlocksClaims()
        {
            _fixture.Time.IsTrusted = false;
            Assert.AreEqual(DailyClaimStatus.ClockUntrusted, _daily.Status);
            Assert.IsFalse(_daily.TryClaim(out _));
        }

        [Test]
        public void AdBoost_GrantsOneExtraCopy_OncePerDay()
        {
            Assert.IsFalse(_daily.CanBoostToday, "nothing to boost before claiming");
            ClaimIndex();
            Assert.IsTrue(_daily.TryApplyAdBoost());
            Assert.AreEqual(200, _fixture.Credits);
            Assert.IsFalse(_daily.TryApplyAdBoost());
        }

        [Test]
        public void StreakAtRisk_TheDayAfterAClaim()
        {
            ClaimIndex();
            Assert.IsFalse(_daily.IsStreakAtRisk);
            _fixture.Time.Advance(TimeSpan.FromDays(1));
            Assert.IsTrue(_daily.IsStreakAtRisk);
        }
    }

    public sealed class DailyChallengeTests
    {
        private MetaFixture _fixture;
        private DailyChallengeService _service;

        // NUnit reuses one fixture instance for every test: rebuild state per test.
        [SetUp]
        public void SetUp() => _fixture = new MetaFixture();

        [TearDown]
        public void TearDown()
        {
            _service?.Disable();
            _service = null;
        }

        private DailyChallengeService Create(ChallengePool pool, string playerId = "player-1")
        {
            _service = new DailyChallengeService(_fixture.Data.challenges, pool, _fixture.Time, playerId, () => 10, _fixture.Granter, null);
            return _service;
        }

        private static ChallengePool SinglePool(ChallengeDefinition challenge)
        {
            ChallengePool pool = ScriptableObject.CreateInstance<ChallengePool>();
            pool.challenges = new[] { challenge };
            pool.dailyCount = 3;
            pool.allCompleteBonus = RewardBundle.Of(RewardItem.Gems(5));
            return pool;
        }

        private static void RaiseKill(WeaponClass weaponClass, KillFlags flags = KillFlags.None, bool local = true)
        {
            EventBus<KillEvent>.Raise(new KillEvent
            {
                Killer = new EntityId(1),
                Victim = new EntityId(2),
                WeaponClass = weaponClass,
                Flags = flags,
                KillerIsLocalPlayer = local,
            });
        }

        [Test]
        public void Selection_IsDeterministicPerPlayerAndDay()
        {
            ChallengePool pool = ChallengePool.CreateDefault();
            string[] first = Create(pool).Active.Select(s => s.challengeId).ToArray();

            var otherData = new DailyChallengeData();
            var again = new DailyChallengeService(otherData, pool, _fixture.Time, "player-1", () => 10, _fixture.Granter, null);
            string[] second = again.Active.Select(s => s.challengeId).ToArray();

            Assert.AreEqual(3, first.Length);
            Assert.AreEqual(3, first.Distinct().Count());
            CollectionAssert.AreEqual(first, second);
        }

        [Test]
        public void KillEvents_ProgressChallenges_ThenClaimAndBonus()
        {
            DailyChallengeService service = Create(SinglePool(ChallengeDefinition.Create("kills_2", "Get {0} kills", ChallengeMetric.Kills, 2, 400)));
            service.Enable();

            RaiseKill(WeaponClass.AssaultRifle);
            RaiseKill(WeaponClass.AssaultRifle, local: false); // someone else's kill doesn't count
            Assert.AreEqual(1, service.Active[0].progress);
            RaiseKill(WeaponClass.Shotgun);
            Assert.AreEqual(2, service.Active[0].progress);

            Assert.IsTrue(service.Claim("kills_2"));
            Assert.IsFalse(service.Claim("kills_2"));
            Assert.AreEqual(100, _fixture.Credits);
            Assert.AreEqual(400, _fixture.BattlePass.Xp);

            Assert.IsTrue(service.CanClaimAllCompleteBonus);
            Assert.IsTrue(service.ClaimAllCompleteBonus());
            Assert.AreEqual(5, _fixture.Gems);
        }

        [Test]
        public void ClassAndFlagFilters_AreRespected()
        {
            ChallengePool pool = ScriptableObject.CreateInstance<ChallengePool>();
            pool.challenges = new[]
            {
                ChallengeDefinition.Create("smg", "SMG kills", ChallengeMetric.KillsWithWeaponClass, 5, 100, WeaponClass.SubmachineGun),
                ChallengeDefinition.Create("heads", "Headshots", ChallengeMetric.Headshots, 5, 100),
            };
            pool.dailyCount = 2;
            DailyChallengeService service = Create(pool);
            service.Enable();

            RaiseKill(WeaponClass.AssaultRifle);
            RaiseKill(WeaponClass.SubmachineGun, KillFlags.Headshot);

            int smg = service.Active.First(s => s.challengeId == "smg").progress;
            int heads = service.Active.First(s => s.challengeId == "heads").progress;
            Assert.AreEqual(1, smg);
            Assert.AreEqual(1, heads);
        }

        [Test]
        public void NewDay_RotatesAndResetsProgress()
        {
            DailyChallengeService service = Create(SinglePool(ChallengeDefinition.Create("kills_5", "Get {0} kills", ChallengeMetric.Kills, 5, 100)));
            service.Enable();
            RaiseKill(WeaponClass.Pistol);
            Assert.AreEqual(1, service.Active[0].progress);

            _fixture.Time.Advance(TimeSpan.FromDays(1));
            Assert.AreEqual(0, service.Active[0].progress);
        }
    }

    public sealed class MatchRewardTests
    {
        private static MatchSummary Summary(MatchOutcome outcome, int kills = 10, float seconds = 300f) => new MatchSummary
        {
            MatchId = Guid.NewGuid().ToString("N"),
            Outcome = outcome,
            Kills = kills,
            Assists = 2,
            Score = 1200,
            DurationSeconds = seconds,
            CompletedMatch = true,
            MostUsedWeaponId = "weapon_ar",
        };

        [Test]
        public void Calculator_AppliesBonusesInTheRightOrder()
        {
            MatchRewardConfig config = ScriptableObject.CreateInstance<MatchRewardConfig>();
            MatchRewards rewards = MatchRewardCalculator.Calculate(Summary(MatchOutcome.Win), config, doubleXpActive: true, firstWinOfDay: true);

            Assert.AreEqual(10 * 10 + 2 * 5 + 60 + 120 + 200, rewards.Credits);
            Assert.AreEqual((1200 + 300 + 500) * 2 + 1500, rewards.AccountXp, "first-win XP is added after the 2x multiplier");
            Assert.AreEqual(5 * 100 + 100, rewards.BattlePassXp);
            Assert.IsTrue(rewards.FirstWinBonusApplied);
        }

        [Test]
        public void Calculator_CapsCreditsAgainstFarming()
        {
            MatchRewardConfig config = ScriptableObject.CreateInstance<MatchRewardConfig>();
            MatchRewards rewards = MatchRewardCalculator.Calculate(Summary(MatchOutcome.Loss, kills: 500), config, false, false);
            Assert.AreEqual(config.maxCreditsPerMatch, rewards.Credits);
            Assert.IsFalse(rewards.FirstWinBonusApplied, "losses never get the first-win bonus");
        }

        [Test]
        public void PostMatch_IsIdempotent_AndAdDoubleGrantsOnce()
        {
            var fixture = new MetaFixture();
            MatchRewardConfig config = ScriptableObject.CreateInstance<MatchRewardConfig>();
            var service = new PostMatchRewardService(config, fixture.Progression, fixture.BattlePass, fixture.Wallet,
                fixture.Data.progression, fixture.Data.monetization, fixture.Time, 0, null);

            MatchSummary summary = Summary(MatchOutcome.Win);
            Assert.IsTrue(service.Grant(summary));
            long afterMatch = fixture.Credits;
            Assert.IsFalse(service.Grant(summary), "replaying the same match end grants nothing");
            Assert.AreEqual(afterMatch, fixture.Credits);

            Assert.IsTrue(service.CanDoubleLastMatch);
            long offer = service.DoubleOfferCredits;
            Assert.IsTrue(service.ApplyDouble(summary.MatchId, offer));
            Assert.IsFalse(service.ApplyDouble(summary.MatchId, offer));
            Assert.IsFalse(service.CanDoubleLastMatch);
            Assert.AreEqual(afterMatch + offer, fixture.Credits);
        }

        [Test]
        public void PostMatch_ShortMatches_GetNoAdOffer()
        {
            var fixture = new MetaFixture();
            var service = new PostMatchRewardService(ScriptableObject.CreateInstance<MatchRewardConfig>(), fixture.Progression, fixture.BattlePass,
                fixture.Wallet, fixture.Data.progression, fixture.Data.monetization, fixture.Time, 0, null);
            service.Grant(Summary(MatchOutcome.Loss, seconds: 20f));
            Assert.IsFalse(service.CanDoubleLastMatch);
        }
    }

    public sealed class MonetizationTests
    {
        private static StoreProductDefinition GemPack(int gems, int firstBonus = 2)
        {
            return StoreProductDefinition.Create($"gems_{gems}", $"{gems} Gems", ProductKind.Consumable, RewardBundle.Of(RewardItem.Gems(gems)), "$0.99", 0.99, firstBonus);
        }

        private static PurchaseRecord Receipt(string productId) => new PurchaseRecord { ProductId = productId, TransactionId = Guid.NewGuid().ToString("N") };

        [Test]
        public void Fulfillment_AppliesFirstPurchaseBonusOnce_AndSavesBeforeAck()
        {
            var fixture = new MetaFixture();
            int saves = 0;
            var fulfillment = new PurchaseFulfillmentService(fixture.Data.monetization, fixture.Inventory, fixture.Granter, () => 1, () => saves++);
            StoreProductDefinition pack = GemPack(100);

            Assert.IsTrue(fulfillment.IsFirstPurchaseBonusAvailable(pack));
            PurchaseRecord first = Receipt(pack.productId);
            fulfillment.Fulfill(pack, first, fulfillment.IsFirstPurchaseBonusAvailable(pack));
            Assert.AreEqual(200, fixture.Gems);
            Assert.AreEqual(1, saves);
            Assert.IsTrue(fulfillment.IsTransactionProcessed(first.TransactionId));
            Assert.IsTrue(fulfillment.IsPayer);

            Assert.IsFalse(fulfillment.IsFirstPurchaseBonusAvailable(pack));
            fulfillment.Fulfill(pack, Receipt(pack.productId), false);
            Assert.AreEqual(300, fixture.Gems);
        }

        [Test]
        public void Fulfillment_EnforcesLimitsAndEntitlements()
        {
            var fixture = new MetaFixture();
            var fulfillment = new PurchaseFulfillmentService(fixture.Data.monetization, fixture.Inventory, fixture.Granter, () => 1, null);
            StoreProductDefinition starter = StoreProductDefinition.Create("starter", "Starter", ProductKind.NonConsumable,
                RewardBundle.Of(RewardItem.Gems(300), RewardItem.Item("skin_starter")), "$2.99", 2.99, maxPurchases: 1, entitlement: "starter");

            Assert.IsFalse(fulfillment.HasReachedPurchaseLimit(starter));
            fulfillment.Fulfill(starter, Receipt("starter"), false);
            Assert.IsTrue(fulfillment.HasReachedPurchaseLimit(starter));
            Assert.IsTrue(fixture.Inventory.Owns("starter"));
            Assert.IsTrue(fixture.Inventory.Owns("skin_starter"));
        }

        [Test]
        public void Fulfillment_LedgerSurvivesReload()
        {
            var fixture = new MetaFixture();
            var fulfillment = new PurchaseFulfillmentService(fixture.Data.monetization, fixture.Inventory, fixture.Granter, () => 1, null);
            PurchaseRecord receipt = Receipt("gems_100");
            fulfillment.Fulfill(GemPack(100), receipt, false);

            // A new service over the same persisted data (app restart) still knows the transaction.
            var afterRestart = new PurchaseFulfillmentService(fixture.Data.monetization, fixture.Inventory, fixture.Granter, () => 1, null);
            Assert.IsTrue(afterRestart.IsTransactionProcessed(receipt.TransactionId));
        }

        [Test]
        public void AdCaps_DailyLimitAndCooldown()
        {
            var fixture = new MetaFixture();
            AdsConfig config = ScriptableObject.CreateInstance<AdsConfig>();
            var limiter = new AdFrequencyLimiter(fixture.Data.monetization, config, fixture.Time, null);

            Assert.AreEqual(AdCapStatus.Allowed, limiter.Check(AdsConfig.DailyRewardBoostPlacement));
            limiter.RecordRewarded(AdsConfig.DailyRewardBoostPlacement);
            Assert.AreEqual(AdCapStatus.DailyCapReached, limiter.Check(AdsConfig.DailyRewardBoostPlacement));
            fixture.Time.Advance(TimeSpan.FromDays(1));
            Assert.AreEqual(AdCapStatus.Allowed, limiter.Check(AdsConfig.DailyRewardBoostPlacement));

            limiter.RecordRewarded(AdsConfig.FreeCrateTokenPlacement);
            Assert.AreEqual(AdCapStatus.CoolingDown, limiter.Check(AdsConfig.FreeCrateTokenPlacement));
            fixture.Time.Advance(TimeSpan.FromMinutes(31));
            Assert.AreEqual(AdCapStatus.Allowed, limiter.Check(AdsConfig.FreeCrateTokenPlacement));
            Assert.AreEqual(2, limiter.RemainingToday(AdsConfig.FreeCrateTokenPlacement));

            Assert.AreEqual(AdCapStatus.UnknownPlacement, limiter.Check("nope"));
        }

        [Test]
        public void Shop_ValidatesFundsLimitsOwnershipAndWindows()
        {
            var fixture = new MetaFixture();
            var shop = new ShopService(fixture.Wallet, fixture.Inventory, fixture.Granter, fixture.Data.monetization, fixture.Time, null);
            ShopItemDefinition offer = ScriptableObject.CreateInstance<ShopItemDefinition>();
            offer.offerId = "offer_skin";
            offer.price = 100;
            offer.contents = RewardBundle.Of(RewardItem.Item("skin_y"));

            Assert.AreEqual(ShopPurchaseResult.InsufficientFunds, shop.Purchase(offer));
            fixture.Wallet.Grant(CurrencyType.Gems, 250, "test");
            Assert.AreEqual(ShopPurchaseResult.Purchased, shop.Purchase(offer));
            Assert.AreEqual(150, fixture.Gems);
            Assert.AreEqual(ShopPurchaseResult.LimitReached, shop.Purchase(offer));

            ShopItemDefinition sameSkin = ScriptableObject.CreateInstance<ShopItemDefinition>();
            sameSkin.offerId = "offer_skin_again";
            sameSkin.contents = offer.contents;
            Assert.AreEqual(ShopPurchaseResult.AlreadyOwned, shop.CanPurchase(sameSkin));

            ShopItemDefinition later = ScriptableObject.CreateInstance<ShopItemDefinition>();
            later.offerId = "offer_future";
            later.price = 1;
            later.availableFromUtc = "2030-01-01T00:00:00Z";
            Assert.AreEqual(ShopPurchaseResult.NotAvailable, shop.CanPurchase(later));
        }
    }

    public sealed class ReengagementTests
    {
        [Test]
        public void QuietHours_MoveToNineLocal()
        {
            TimeSpan offset = TimeSpan.FromHours(2);
            var lateEvening = new DateTime(2026, 10, 2, 21, 30, 0, DateTimeKind.Utc);  // 23:30 local
            var earlyMorning = new DateTime(2026, 10, 2, 3, 0, 0, DateTimeKind.Utc);   // 05:00 local
            var afternoon = new DateTime(2026, 10, 2, 12, 0, 0, DateTimeKind.Utc);

            Assert.AreEqual(new DateTime(2026, 10, 3, 7, 0, 0, DateTimeKind.Utc), ReengagementPlanner.MoveOutOfQuietHours(lateEvening, offset));
            Assert.AreEqual(new DateTime(2026, 10, 2, 7, 0, 0, DateTimeKind.Utc), ReengagementPlanner.MoveOutOfQuietHours(earlyMorning, offset));
            Assert.AreEqual(afternoon, ReengagementPlanner.MoveOutOfQuietHours(afternoon, offset));
        }

        [Test]
        public void Plan_IsSpacedFutureAndBounded()
        {
            var fixture = new MetaFixture();
            DailyRewardCalendar calendar = ScriptableObject.CreateInstance<DailyRewardCalendar>();
            var daily = new DailyRewardService(fixture.Data.dailyReward, calendar, fixture.Time, fixture.Granter, null);
            daily.TryClaim(out _);
            fixture.Season.SetWindow(fixture.Time.UtcNow.AddDays(-30), fixture.Time.UtcNow.AddDays(3));

            List<PlannedNotification> plan = ReengagementPlanner.Plan(fixture.Time.UtcNow, TimeSpan.Zero, daily, null, fixture.BattlePass);

            Assert.That(plan.Count, Is.InRange(1, ReengagementPlanner.MaxPlanned));
            Assert.IsTrue(plan.Any(n => n.Id == "daily_ready"));
            for (int i = 0; i < plan.Count; i++)
            {
                Assert.That(plan[i].FireUtc, Is.GreaterThan(fixture.Time.UtcNow));
                int localHour = plan[i].FireUtc.Hour;
                Assert.That(localHour, Is.InRange(ReengagementPlanner.QuietEndHour, ReengagementPlanner.QuietStartHour - 1));
                if (i > 0) Assert.That(plan[i].FireUtc - plan[i - 1].FireUtc, Is.GreaterThanOrEqualTo(ReengagementPlanner.MinimumSpacing));
            }
        }
    }
}
