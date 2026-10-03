using System.Collections.Generic;
using MobileFPS.Combat;
using MobileFPS.Core;
using MobileFPS.Effects;
using MobileFPS.Networking;
using UnityEngine;

namespace MobileFPS.Weapons
{
    /// <summary>One pellet's damage on one victim.</summary>
    public struct PelletHit
    {
        public EntityId Victim;
        public HitZone Zone;
        public float Distance;
        public Vector3 Point;
        public float Damage;
        public bool Penetrated;
    }

    /// <summary>All pellets of one shot that hit the same victim, merged into a single damage event.</summary>
    public struct VictimDamage
    {
        public EntityId Victim;
        public float Damage;
        public HitZone BestZone;
        public float Distance;
        public Vector3 Point;
        public bool Penetrated;
        public int PelletHits;
    }

    /// <summary>
    /// Hitscan resolution for one trigger pull: deterministic spread, character
    /// hitboxes, world occlusion, surface penetration, and damage falloff.
    ///
    /// The solver is a pure function of (shot, stats, world query, hitbox query).
    /// The client runs it against <see cref="LiveHitboxQuery"/> for instant
    /// feedback; the server runs the identical code against
    /// <see cref="RewoundHitboxQuery"/> for authority. A bullet stops at the first
    /// character it hits (no collateral through bodies), which keeps results stable
    /// under the small pose differences prediction introduces.
    /// </summary>
    public static class HitscanSolver
    {
        /// <summary>Damage multiplier applied each time a bullet passes through a surface.</summary>
        public const float PenetrationDamageScale = 0.7f;

        /// <param name="impacts">World impacts for FX (may be null on a dedicated server).</param>
        /// <param name="pelletEnds">End point of each pellet for tracers (may be null).</param>
        public static void Solve(in ShotRequest shot, WeaponStats stats, IWorldQuery world, IHitboxQuery hitboxes,
            WorldHit[] worldBuffer, List<PelletHit> hits, List<ImpactPoint> impacts, List<Vector3> pelletEnds)
        {
            WeaponDefinition definition = stats.Definition;
            int pellets = Mathf.Max(1, definition.pelletsPerShot);
            float maxRange = stats.MaxRange;

            for (int p = 0; p < pellets; p++)
            {
                Vector3 direction = SpreadPattern.Apply(shot.Direction, shot.SpreadDegrees, shot.Seed, p);

                bool hitCharacter = hitboxes.Raycast(shot.Origin, direction, maxRange, shot.Shooter, out HitboxHit characterHit);
                float travel = hitCharacter ? characterHit.Distance : maxRange;

                // Only world surfaces in front of the character (or up to max range) matter.
                int worldCount = world.RaycastAll(shot.Origin, direction, travel, worldBuffer);
                float power = definition.penetrationPower;
                float damageScale = 1f;
                bool penetrated = false;
                bool blocked = false;
                float endDistance = travel;

                for (int i = 0; i < worldCount; i++)
                {
                    WorldHit surface = worldBuffer[i];
                    impacts?.Add(new ImpactPoint { Point = surface.Point, Normal = surface.Normal, Surface = surface.Surface, Distance = surface.Distance });

                    if (power >= surface.PenetrationCost)
                    {
                        power -= surface.PenetrationCost;
                        damageScale *= PenetrationDamageScale;
                        penetrated = true;
                        continue;
                    }

                    blocked = true;
                    endDistance = surface.Distance;
                    break;
                }

                if (hitCharacter && !blocked)
                {
                    float damage = stats.DamageAt(characterHit.Distance, characterHit.Zone) * damageScale;
                    if (damage > 0f)
                    {
                        hits.Add(new PelletHit
                        {
                            Victim = characterHit.Entity,
                            Zone = characterHit.Zone,
                            Distance = characterHit.Distance,
                            Point = characterHit.Point,
                            Damage = damage,
                            Penetrated = penetrated,
                        });
                    }
                }

                pelletEnds?.Add(shot.Origin + direction * endDistance);
            }
        }

        /// <summary>
        /// Merges pellet hits per victim: one damage event per victim per shot (correct
        /// kill attribution, one hit marker, one network message). The best zone wins
        /// for headshot credit.
        /// </summary>
        public static void Aggregate(List<PelletHit> hits, List<VictimDamage> results)
        {
            results.Clear();
            for (int i = 0; i < hits.Count; i++)
            {
                PelletHit hit = hits[i];
                int index = -1;
                for (int r = 0; r < results.Count; r++)
                {
                    if (results[r].Victim == hit.Victim)
                    {
                        index = r;
                        break;
                    }
                }

                if (index < 0)
                {
                    results.Add(new VictimDamage
                    {
                        Victim = hit.Victim,
                        Damage = hit.Damage,
                        BestZone = hit.Zone,
                        Distance = hit.Distance,
                        Point = hit.Point,
                        Penetrated = hit.Penetrated,
                        PelletHits = 1,
                    });
                    continue;
                }

                VictimDamage merged = results[index];
                merged.Damage += hit.Damage;
                merged.PelletHits++;
                merged.Penetrated |= hit.Penetrated;
                if (hit.Zone < merged.BestZone)
                {
                    merged.BestZone = hit.Zone;
                    merged.Point = hit.Point;
                }
                if (hit.Distance < merged.Distance) merged.Distance = hit.Distance;
                results[index] = merged;
            }
        }
    }
}
