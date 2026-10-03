using System;
using System.Collections.Generic;
using MobileFPS.Combat;
using MobileFPS.Core;
using MobileFPS.Player;
using UnityEngine;

namespace MobileFPS.Match
{
    /// <summary>
    /// Lean match rules (Team Deathmatch / Free-for-all / Training): scoring,
    /// assists, streaks, respawns, time and score limits. When the match ends it
    /// raises <see cref="MatchEndedEvent"/>, and that one event is the entire
    /// handoff to the meta layer (XP, currency, battle pass, challenges, the 2x
    /// rewarded-ad offer). The match knows nothing about monetization.
    ///
    /// Short matches (5 min / 30 kills) suit mobile sessions: players commute,
    /// queue, play, and still have time for "one more", which drives DAU and
    /// session count.
    /// </summary>
    public sealed class MatchController : MonoBehaviour
    {
        private sealed class EntityStats
        {
            public int Kills, Deaths, Assists, Headshots, Score, Streak, LongestStreak;
        }

        [SerializeField] private string modeId = "tdm";
        [SerializeField] private int scoreLimit = 30;
        [SerializeField] private float timeLimitSeconds = 300f;
        [SerializeField] private float respawnDelay = 3f;
        [SerializeField] private FPSPlayer localPlayer;

        [Header("Scoring")]
        [SerializeField] private int scorePerKill = 100;
        [SerializeField] private int scorePerAssist = 50;
        [SerializeField] private int headshotBonus = 25;
        [SerializeField] private int longshotBonus = 25;
        [SerializeField] private float assistWindowSeconds = 6f;

        private readonly Dictionary<int, EntityStats> _stats = new Dictionary<int, EntityStats>(32);
        private readonly Dictionary<TeamId, int> _teamKills = new Dictionary<TeamId, int>(3);
        private readonly Dictionary<string, int> _killsByWeapon = new Dictionary<string, int>(8);
        // victim -> (attacker -> last damage time), for assists
        private readonly Dictionary<int, Dictionary<int, float>> _damageLedger = new Dictionary<int, Dictionary<int, float>>(32);

        private string _matchId;
        private float _elapsed;
        private bool _running;
        private float _localRespawnAt = -1f;

        public bool IsRunning => _running;
        public float TimeRemaining => Mathf.Max(0f, timeLimitSeconds - _elapsed);
        public int ScoreLimit => scoreLimit;
        public string ModeId => modeId;

        public event Action<MatchSummary> Ended;

        private void OnEnable()
        {
            EventBus<KillEvent>.Subscribe(OnKill);
            EventBus<DamageAppliedEvent>.Subscribe(OnDamage);
        }

        private void OnDisable()
        {
            EventBus<KillEvent>.Unsubscribe(OnKill);
            EventBus<DamageAppliedEvent>.Unsubscribe(OnDamage);
        }

        private void Start()
        {
            StartMatch();
        }

        public void StartMatch()
        {
            _matchId = Guid.NewGuid().ToString("N");
            _elapsed = 0f;
            _stats.Clear();
            _teamKills.Clear();
            _killsByWeapon.Clear();
            _damageLedger.Clear();
            _running = true;

            MobilePerformance.SetCombatMode();
            if (localPlayer != null) SpawnLocalPlayer();
            EventBus<MatchStartedEvent>.Raise(new MatchStartedEvent { MatchId = _matchId, ModeId = modeId });
        }

        public int GetTeamScore(TeamId team) => _teamKills.TryGetValue(team, out int kills) ? kills : 0;

        public void GetLocalStats(out int kills, out int deaths, out int score)
        {
            EntityStats stats = LocalStats();
            kills = stats?.Kills ?? 0;
            deaths = stats?.Deaths ?? 0;
            score = stats?.Score ?? 0;
        }

        /// <summary>Ends the match early (player quit): no completion bonus, still credits what was earned.</summary>
        public void Forfeit() => EndMatch(completed: false);

        private void Update()
        {
            if (!_running) return;
            _elapsed += Time.deltaTime;
            if (_elapsed >= timeLimitSeconds) EndMatch(completed: true);

            if (_localRespawnAt > 0f && Time.time >= _localRespawnAt)
            {
                _localRespawnAt = -1f;
                SpawnLocalPlayer();
            }
        }

        private void OnDamage(in DamageAppliedEvent evt)
        {
            if (!_running || evt.Attacker == evt.Victim) return;
            if (!_damageLedger.TryGetValue(evt.Victim.Value, out Dictionary<int, float> attackers))
            {
                attackers = new Dictionary<int, float>(4);
                _damageLedger.Add(evt.Victim.Value, attackers);
            }
            attackers[evt.Attacker.Value] = Time.time;
        }

        private void OnKill(in KillEvent evt)
        {
            if (!_running) return;

            EntityStats victim = StatsFor(evt.Victim);
            victim.Deaths++;
            victim.Streak = 0;

            bool suicide = evt.Killer == evt.Victim || !evt.Killer.IsValid;
            if (!suicide)
            {
                EntityStats killer = StatsFor(evt.Killer);
                killer.Kills++;
                killer.Streak++;
                killer.LongestStreak = Mathf.Max(killer.LongestStreak, killer.Streak);
                killer.Score += scorePerKill;
                if ((evt.Flags & KillFlags.Headshot) != 0)
                {
                    killer.Headshots++;
                    killer.Score += headshotBonus;
                }
                if ((evt.Flags & KillFlags.Longshot) != 0) killer.Score += longshotBonus;

                if (evt.KillerIsLocalPlayer && !string.IsNullOrEmpty(evt.WeaponId))
                {
                    _killsByWeapon.TryGetValue(evt.WeaponId, out int count);
                    _killsByWeapon[evt.WeaponId] = count + 1;
                }

                if (CombatEntity.TryGet(evt.Killer, out CombatEntity killerEntity))
                {
                    _teamKills.TryGetValue(killerEntity.Team, out int teamKills);
                    _teamKills[killerEntity.Team] = teamKills + 1;
                    bool limitReached = killerEntity.Team == TeamId.None
                        ? killer.Kills >= scoreLimit          // free-for-all: individual score
                        : teamKills + 1 >= scoreLimit;        // team modes: team score
                    if (limitReached) EndMatch(completed: true);
                }
            }

            CreditAssists(evt);

            if (evt.VictimIsLocalPlayer && _running) _localRespawnAt = Time.time + respawnDelay;
        }

        private void CreditAssists(in KillEvent evt)
        {
            if (!_damageLedger.TryGetValue(evt.Victim.Value, out Dictionary<int, float> attackers)) return;
            foreach (KeyValuePair<int, float> pair in attackers)
            {
                if (pair.Key == evt.Killer.Value || Time.time - pair.Value > assistWindowSeconds) continue;
                EntityStats assister = StatsFor(new EntityId(pair.Key));
                assister.Assists++;
                assister.Score += scorePerAssist;
            }
            attackers.Clear();
        }

        private void SpawnLocalPlayer()
        {
            SpawnPoint spawn = SpawnPoint.SelectSafest(localPlayer.Entity);
            Vector3 position = spawn != null ? spawn.transform.position : localPlayer.transform.position;
            Quaternion rotation = spawn != null ? spawn.transform.rotation : localPlayer.transform.rotation;
            localPlayer.Respawn(position, rotation);
        }

        private void EndMatch(bool completed)
        {
            if (!_running) return;
            _running = false;
            _localRespawnAt = -1f;

            EntityStats stats = LocalStats() ?? new EntityStats();
            MatchSummary summary = new MatchSummary
            {
                MatchId = _matchId,
                ModeId = modeId,
                Outcome = ResolveOutcome(),
                Kills = stats.Kills,
                Deaths = stats.Deaths,
                Assists = stats.Assists,
                Headshots = stats.Headshots,
                Score = stats.Score,
                LongestStreak = stats.LongestStreak,
                DurationSeconds = _elapsed,
                MostUsedWeaponId = MostUsedWeapon(),
                CompletedMatch = completed,
            };

            MobilePerformance.SetMenuMode();
            EventBus<MatchEndedEvent>.Raise(new MatchEndedEvent { Summary = summary });
            Ended?.Invoke(summary);
        }

        private MatchOutcome ResolveOutcome()
        {
            if (localPlayer == null) return MatchOutcome.Draw;
            TeamId team = localPlayer.Entity.Team;

            if (team == TeamId.None)
            {
                // Free-for-all: win = most kills.
                EntityStats mine = LocalStats();
                int myKills = mine?.Kills ?? 0;
                foreach (KeyValuePair<int, EntityStats> pair in _stats)
                {
                    if (pair.Key != localPlayer.Entity.Id.Value && pair.Value.Kills >= myKills) return pair.Value.Kills > myKills ? MatchOutcome.Loss : MatchOutcome.Draw;
                }
                return MatchOutcome.Win;
            }

            TeamId enemy = team == TeamId.Alpha ? TeamId.Bravo : TeamId.Alpha;
            int ours = GetTeamScore(team);
            int theirs = GetTeamScore(enemy);
            return ours > theirs ? MatchOutcome.Win : ours < theirs ? MatchOutcome.Loss : MatchOutcome.Draw;
        }

        private string MostUsedWeapon()
        {
            string best = null;
            int bestCount = 0;
            foreach (KeyValuePair<string, int> pair in _killsByWeapon)
            {
                if (pair.Value > bestCount)
                {
                    best = pair.Key;
                    bestCount = pair.Value;
                }
            }
            if (best == null && localPlayer != null && localPlayer.Weapons.Current != null) best = localPlayer.Weapons.Current.Definition.weaponId;
            return best;
        }

        private EntityStats LocalStats()
        {
            if (localPlayer == null) return null;
            return _stats.TryGetValue(localPlayer.Entity.Id.Value, out EntityStats stats) ? stats : null;
        }

        private EntityStats StatsFor(EntityId id)
        {
            if (!_stats.TryGetValue(id.Value, out EntityStats stats))
            {
                stats = new EntityStats();
                _stats.Add(id.Value, stats);
            }
            return stats;
        }
    }
}
