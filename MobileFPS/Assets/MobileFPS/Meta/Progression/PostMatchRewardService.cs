using System;
using MobileFPS.Analytics;
using MobileFPS.Core;
using MobileFPS.Economy;
using MobileFPS.LiveOps;
using MobileFPS.Meta;
using MobileFPS.Monetization;
using MobileFPS.Profile;

namespace MobileFPS.Progression
{
    /// <summary>
    /// Turns <see cref="MatchEndedEvent"/> into payouts (credits, account XP,
    /// weapon XP, battle pass XP, first-win bonus) and runs the post-match
    /// "watch an ad for 2x credits" offer.
    ///
    /// The 2x offer is the highest-converting rewarded placement in mobile
    /// shooters: the player has just been shown a number they earned, and doubling
    /// it costs 30 seconds. It is safe by construction:
    /// - grants are idempotent per match id (no replaying a match end);
    /// - the extra credits are granted only from the ad's reward callback;
    /// - the offer expires when the next match starts, and very short matches
    ///   don't get it (no quit-farm loop).
    /// </summary>
    public sealed class PostMatchRewardService
    {
        private const int RememberedMatches = 50;

        private readonly MatchRewardConfig _config;
        private readonly ProgressionService _progression;
        private readonly BattlePassService _battlePass;
        private readonly Wallet _wallet;
        private readonly ProgressionData _progressionData;
        private readonly MonetizationData _monetization;
        private readonly ITimeProvider _time;
        private readonly int _resetHourUtc;
        private readonly Action _markDirty;
        private bool _enabled;

        public PostMatchRewardService(MatchRewardConfig config, ProgressionService progression, BattlePassService battlePass,
            Wallet wallet, ProgressionData progressionData, MonetizationData monetization, ITimeProvider time,
            int resetHourUtc, Action markDirty)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _progression = progression;
            _battlePass = battlePass;
            _wallet = wallet;
            _progressionData = progressionData;
            _monetization = monetization;
            _time = time;
            _resetHourUtc = resetHourUtc;
            _markDirty = markDirty;
        }

        /// <summary>Rewards from the most recent match this session (results screen).</summary>
        public MatchRewards LastRewards { get; private set; }
        public string LastMatchId { get; private set; }

        /// <summary>The double-credits offer is open (UI should also check AdsManager availability).</summary>
        public bool CanDoubleLastMatch =>
            !string.IsNullOrEmpty(_monetization.pendingMatchId)
            && _monetization.pendingMatchCredits > 0
            && !_monetization.doubledMatchIds.Contains(_monetization.pendingMatchId);

        public long DoubleOfferCredits => CanDoubleLastMatch ? _monetization.pendingMatchCredits : 0;

        public void Enable()
        {
            if (_enabled) return;
            _enabled = true;
            EventBus<MatchEndedEvent>.Subscribe(OnMatchEnded);
            EventBus<MatchStartedEvent>.Subscribe(OnMatchStarted);
        }

        public void Disable()
        {
            if (!_enabled) return;
            _enabled = false;
            EventBus<MatchEndedEvent>.Unsubscribe(OnMatchEnded);
            EventBus<MatchStartedEvent>.Unsubscribe(OnMatchStarted);
        }

        /// <summary>Grants a match's rewards. Returns false if this match id was already rewarded.</summary>
        public bool Grant(in MatchSummary summary)
        {
            if (string.IsNullOrEmpty(summary.MatchId) || _progressionData.rewardedMatchIds.Contains(summary.MatchId)) return false;
            _progressionData.rewardedMatchIds.AddBounded(summary.MatchId, RememberedMatches);

            int today = GameDay.Index(_time.UtcNow, _resetHourUtc);
            bool firstWin = summary.Outcome == MatchOutcome.Win && _progression.TryConsumeFirstWinOfDay(today);
            MatchRewards rewards = MatchRewardCalculator.Calculate(summary, _config, _progression.IsDoubleXpActive, firstWin);

            _wallet.Grant(CurrencyType.Credits, rewards.Credits, "match");
            _progression.AddAccountXp(rewards.AccountXp, "match");
            _battlePass?.AddXp(rewards.BattlePassXp, "match");
            if (!string.IsNullOrEmpty(summary.MostUsedWeaponId))
            {
                _progression.AddWeaponXp(summary.MostUsedWeaponId, rewards.WeaponXp);
                _progression.RecordWeaponKills(summary.MostUsedWeaponId, summary.Kills);
            }

            bool offerDouble = _config.offerDoubleCreditsAd && rewards.Credits > 0
                               && summary.DurationSeconds >= _config.minMatchSecondsForAdOffer;
            _monetization.pendingMatchId = offerDouble ? summary.MatchId : null;
            _monetization.pendingMatchCredits = offerDouble ? rewards.Credits : 0;
            _markDirty?.Invoke();

            LastRewards = rewards;
            LastMatchId = summary.MatchId;

            Telemetry.Log("match_rewards", "credits", rewards.Credits, "xp", rewards.AccountXp, "outcome", summary.Outcome);
            EventBus<MatchRewardsGrantedEvent>.Raise(new MatchRewardsGrantedEvent
            {
                MatchId = summary.MatchId,
                Credits = rewards.Credits,
                AccountXp = rewards.AccountXp,
                BattlePassXp = rewards.BattlePassXp,
                FirstWinBonus = rewards.FirstWinBonusApplied,
                DoubleXpApplied = rewards.DoubleXpApplied,
                CanDoubleWithAd = offerDouble,
            });
            return true;
        }

        /// <summary>Shows a rewarded ad; on completion grants the match's credits again. <paramref name="onDone"/> gets true if granted.</summary>
        public void DoubleLastMatchWithAd(Action<bool> onDone)
        {
            AdsManager ads = AdsManager.Instance;
            if (!CanDoubleLastMatch || ads == null)
            {
                onDone?.Invoke(false);
                return;
            }

            string matchId = _monetization.pendingMatchId;
            long credits = _monetization.pendingMatchCredits;
            ads.ShowRewarded(AdsConfig.PostMatchDoublePlacement, result =>
            {
                bool granted = result == RewardedAdResult.Rewarded && ApplyDouble(matchId, credits);
                onDone?.Invoke(granted);
            });
        }

        /// <summary>Grants the doubled credits for a match (idempotent). Public for server-verified (SSV) flows.</summary>
        public bool ApplyDouble(string matchId, long credits)
        {
            if (string.IsNullOrEmpty(matchId) || credits <= 0 || _monetization.doubledMatchIds.Contains(matchId)) return false;
            _monetization.doubledMatchIds.AddBounded(matchId, RememberedMatches);
            if (_monetization.pendingMatchId == matchId)
            {
                _monetization.pendingMatchId = null;
                _monetization.pendingMatchCredits = 0;
            }
            _markDirty?.Invoke();
            _wallet.Grant(CurrencyType.Credits, credits, "match_ad_double");
            return true;
        }

        private void OnMatchEnded(in MatchEndedEvent evt) => Grant(evt.Summary);

        private void OnMatchStarted(in MatchStartedEvent evt)
        {
            if (string.IsNullOrEmpty(_monetization.pendingMatchId)) return;
            _monetization.pendingMatchId = null; // the offer expires once the player moves on
            _monetization.pendingMatchCredits = 0;
            _markDirty?.Invoke();
        }
    }
}
