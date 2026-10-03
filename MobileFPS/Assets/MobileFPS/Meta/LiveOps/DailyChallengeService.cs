using System;
using System.Collections.Generic;
using MobileFPS.Analytics;
using MobileFPS.Core;
using MobileFPS.Economy;
using MobileFPS.Meta;
using MobileFPS.Profile;

namespace MobileFPS.LiveOps
{
    /// <summary>
    /// Rotating daily challenges, tracked purely from gameplay events (KillEvent,
    /// MatchEndedEvent). This service has no reference to any gameplay type,
    /// which is the payoff of the EventBus boundary.
    ///
    /// Each player's daily set is chosen deterministically from
    /// hash(playerId, day). It's stable across app restarts and devices with no
    /// server round-trip, while still differing between friends (more to talk
    /// about, more reasons to come back).
    /// </summary>
    public sealed class DailyChallengeService
    {
        private readonly DailyChallengeData _data;
        private readonly ChallengePool _pool;
        private readonly ITimeProvider _time;
        private readonly string _playerId;
        private readonly Func<int> _accountLevel;
        private readonly RewardGranter _granter;
        private readonly Action _markDirty;
        private readonly Dictionary<string, ChallengeDefinition> _definitions = new Dictionary<string, ChallengeDefinition>(StringComparer.Ordinal);
        private readonly List<ChallengeDefinition> _candidates = new List<ChallengeDefinition>(32);
        private bool _enabled;

        public DailyChallengeService(DailyChallengeData data, ChallengePool pool, ITimeProvider time, string playerId,
            Func<int> accountLevel, RewardGranter granter, Action markDirty)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _pool = pool ?? throw new ArgumentNullException(nameof(pool));
            _time = time ?? throw new ArgumentNullException(nameof(time));
            _playerId = playerId ?? string.Empty;
            _accountLevel = accountLevel ?? (() => 1);
            _granter = granter;
            _markDirty = markDirty;

            foreach (ChallengeDefinition definition in _pool.challenges)
            {
                if (definition != null) _definitions[definition.challengeId] = definition;
            }
        }

        public int TodayIndex => GameDay.Index(_time.UtcNow, _pool.resetHourUtc);
        public TimeSpan TimeUntilRotation => GameDay.UntilNextReset(_time.UtcNow, _pool.resetHourUtc);

        public IReadOnlyList<ChallengeStateData> Active
        {
            get
            {
                EnsureToday();
                return _data.active;
            }
        }

        public bool TryGetDefinition(string challengeId, out ChallengeDefinition definition)
        {
            return _definitions.TryGetValue(challengeId ?? string.Empty, out definition);
        }

        public int ClaimableCount
        {
            get
            {
                EnsureToday();
                int count = 0;
                foreach (ChallengeStateData state in _data.active)
                {
                    if (!state.claimed && TryGetDefinition(state.challengeId, out ChallengeDefinition d) && state.progress >= d.target) count++;
                }
                return count + (CanClaimAllCompleteBonus ? 1 : 0);
            }
        }

        public bool CanClaimAllCompleteBonus
        {
            get
            {
                if (_data.allCompleteBonusClaimed || _data.active.Count == 0) return false;
                foreach (ChallengeStateData state in _data.active) if (!state.claimed) return false;
                return true;
            }
        }

        public void Enable()
        {
            if (_enabled) return;
            _enabled = true;
            EventBus<KillEvent>.Subscribe(OnKill);
            EventBus<MatchEndedEvent>.Subscribe(OnMatchEnded);
        }

        public void Disable()
        {
            if (!_enabled) return;
            _enabled = false;
            EventBus<KillEvent>.Unsubscribe(OnKill);
            EventBus<MatchEndedEvent>.Unsubscribe(OnMatchEnded);
        }

        /// <summary>Rotates challenges if the game day changed (call on resume as well).</summary>
        public void EnsureToday()
        {
            int today = TodayIndex;
            if (_data.dayIndex == today) return;

            _data.dayIndex = today;
            _data.allCompleteBonusClaimed = false;
            _data.active.Clear();
            SelectForDay(today);
            _markDirty?.Invoke();
        }

        public bool Claim(string challengeId)
        {
            EnsureToday();
            foreach (ChallengeStateData state in _data.active)
            {
                if (state.challengeId != challengeId) continue;
                if (state.claimed || !TryGetDefinition(challengeId, out ChallengeDefinition definition) || state.progress < definition.target) return false;

                state.claimed = true;
                _markDirty?.Invoke();
                _granter.Grant(definition.reward, $"challenge_{challengeId}");
                Telemetry.Log("challenge_claimed", "challenge", challengeId);
                return true;
            }
            return false;
        }

        public bool ClaimAllCompleteBonus()
        {
            if (!CanClaimAllCompleteBonus) return false;
            _data.allCompleteBonusClaimed = true;
            _markDirty?.Invoke();
            _granter.Grant(_pool.allCompleteBonus, "challenges_all_complete");
            Telemetry.Log("challenges_all_complete", "day", _data.dayIndex);
            return true;
        }

        private void OnKill(in KillEvent evt)
        {
            if (!evt.KillerIsLocalPlayer || evt.VictimIsLocalPlayer) return;
            EnsureToday();

            foreach (ChallengeStateData state in _data.active)
            {
                if (!TryGetDefinition(state.challengeId, out ChallengeDefinition definition)) continue;
                if (definition.filterByWeaponClass && definition.weaponClass != evt.WeaponClass) continue;

                bool counts;
                switch (definition.metric)
                {
                    case ChallengeMetric.Kills:
                    case ChallengeMetric.KillsWithWeaponClass: counts = true; break;
                    case ChallengeMetric.Headshots: counts = (evt.Flags & KillFlags.Headshot) != 0; break;
                    case ChallengeMetric.LongshotKills: counts = (evt.Flags & KillFlags.Longshot) != 0; break;
                    case ChallengeMetric.SlideKills: counts = (evt.Flags & KillFlags.WhileSliding) != 0; break;
                    case ChallengeMetric.HipfireKills: counts = (evt.Flags & KillFlags.Hipfire) != 0; break;
                    default: counts = false; break;
                }
                if (counts) Increment(state, definition, 1);
            }
        }

        private void OnMatchEnded(in MatchEndedEvent evt)
        {
            EnsureToday();
            MatchSummary summary = evt.Summary;

            foreach (ChallengeStateData state in _data.active)
            {
                if (!TryGetDefinition(state.challengeId, out ChallengeDefinition definition)) continue;
                switch (definition.metric)
                {
                    case ChallengeMetric.MatchesPlayed:
                        if (summary.CompletedMatch) Increment(state, definition, 1);
                        break;
                    case ChallengeMetric.MatchesWon:
                        if (summary.Outcome == MatchOutcome.Win) Increment(state, definition, 1);
                        break;
                    case ChallengeMetric.Assists:
                        Increment(state, definition, summary.Assists);
                        break;
                    case ChallengeMetric.ScoreEarned:
                        Increment(state, definition, summary.Score);
                        break;
                }
            }
        }

        private void Increment(ChallengeStateData state, ChallengeDefinition definition, int amount)
        {
            if (amount <= 0 || state.progress >= definition.target) return;
            state.progress = Math.Min(definition.target, state.progress + amount);
            bool completed = state.progress >= definition.target;
            _markDirty?.Invoke();

            EventBus<ChallengeProgressEvent>.Raise(new ChallengeProgressEvent
            {
                ChallengeId = definition.challengeId,
                Progress = state.progress,
                Target = definition.target,
                JustCompleted = completed,
            });

            if (completed)
            {
                Telemetry.Log("challenge_completed", "challenge", definition.challengeId);
                if (_pool.autoClaim) Claim(definition.challengeId);
            }
        }

        private void SelectForDay(int dayIndex)
        {
            _candidates.Clear();
            int level = _accountLevel();
            foreach (ChallengeDefinition definition in _pool.challenges)
            {
                if (definition != null && definition.minAccountLevel <= level && definition.weight > 0f) _candidates.Add(definition);
            }

            var random = new DeterministicRandom(DeterministicRandom.HashSeed(DeterministicRandom.HashString(_playerId), (uint)dayIndex));
            int picks = Math.Min(_pool.dailyCount, _candidates.Count);
            for (int p = 0; p < picks; p++)
            {
                // Weighted pick without replacement.
                float totalWeight = 0f;
                foreach (ChallengeDefinition candidate in _candidates) totalWeight += candidate.weight;
                float roll = random.NextFloat01() * totalWeight;
                int chosen = _candidates.Count - 1;
                for (int i = 0; i < _candidates.Count; i++)
                {
                    roll -= _candidates[i].weight;
                    if (roll < 0f)
                    {
                        chosen = i;
                        break;
                    }
                }
                _data.active.Add(new ChallengeStateData { challengeId = _candidates[chosen].challengeId });
                _candidates.RemoveAt(chosen);
            }
        }
    }
}
