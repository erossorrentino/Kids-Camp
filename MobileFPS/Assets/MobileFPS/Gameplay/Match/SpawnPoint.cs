using System.Collections.Generic;
using MobileFPS.Combat;
using MobileFPS.Core;
using UnityEngine;

namespace MobileFPS.Match
{
    /// <summary>
    /// A spawn location. Selection favors the spawn farthest from living enemies,
    /// because "spawned in front of an enemy" is the top frustration (and
    /// uninstall) driver in small-map mobile shooters.
    /// </summary>
    public sealed class SpawnPoint : MonoBehaviour
    {
        private static readonly List<SpawnPoint> s_all = new List<SpawnPoint>(32);

        [Tooltip("None = usable by any team (free-for-all).")]
        [SerializeField] private TeamId team = TeamId.None;

        public TeamId Team => team;
        public static IReadOnlyList<SpawnPoint> All => s_all;

        private void OnEnable() => s_all.Add(this);
        private void OnDisable() => s_all.Remove(this);

        /// <summary>Picks the safest spawn for <paramref name="spawning"/>. Returns null if none exist.</summary>
        public static SpawnPoint SelectSafest(CombatEntity spawning)
        {
            SpawnPoint best = null;
            float bestScore = float.MinValue;
            TeamId team = spawning != null ? spawning.Team : TeamId.None;

            for (int i = 0; i < s_all.Count; i++)
            {
                SpawnPoint spawn = s_all[i];
                if (spawn.team != TeamId.None && team != TeamId.None && spawn.team != team) continue;

                float nearestEnemy = float.MaxValue;
                var rigs = HitboxRig.All;
                for (int r = 0; r < rigs.Count; r++)
                {
                    HitboxRig rig = rigs[r];
                    if (!rig.IsAlive || (spawning != null && !spawning.IsHostileTo(rig.Entity))) continue;
                    float distance = (rig.transform.position - spawn.transform.position).sqrMagnitude;
                    if (distance < nearestEnemy) nearestEnemy = distance;
                }

                // Small random jitter so equally-safe spawns don't always pick the same one.
                float score = nearestEnemy + Random.Range(0f, 4f);
                if (score > bestScore)
                {
                    bestScore = score;
                    best = spawn;
                }
            }
            return best;
        }

#if UNITY_EDITOR
        private void OnDrawGizmos()
        {
            Gizmos.color = team == TeamId.Alpha ? Color.cyan : team == TeamId.Bravo ? Color.red : Color.green;
            Gizmos.DrawWireSphere(transform.position + Vector3.up * 0.9f, 0.4f);
            Gizmos.DrawLine(transform.position + Vector3.up * 0.9f, transform.position + Vector3.up * 0.9f + transform.forward);
        }
#endif
    }
}
