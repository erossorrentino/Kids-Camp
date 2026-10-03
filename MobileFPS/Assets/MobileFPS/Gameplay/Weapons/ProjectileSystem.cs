using System;
using MobileFPS.Combat;
using MobileFPS.Core;
using MobileFPS.Effects;
using MobileFPS.Networking;
using MobileFPS.Pooling;
using UnityEngine;

namespace MobileFPS.Weapons
{
    /// <summary>
    /// Simulates every in-flight projectile (launchers, grenades, slow bolts) in
    /// one batched loop over a struct array.
    ///
    /// Why not one Rigidbody + MonoBehaviour per projectile:
    /// - fast small rigidbodies tunnel through thin walls without continuous
    ///   collision detection, and CCD is expensive;
    /// - per-object Update/OnCollisionEnter costs a native-to-managed call each.
    /// Here each projectile does one SphereCast against the world plus an
    /// analytic test against hitboxes per frame, along the exact segment it
    /// travels, so it never tunnels at any speed or frame rate. Visuals are
    /// pooled transforms that only receive SetPositionAndRotation.
    ///
    /// Online, projectiles are simulated on the server (authoritative) and
    /// clients run this same system for cosmetic prediction.
    /// </summary>
    [AutoCreateSingleton]
    public sealed class ProjectileSystem : Singleton<ProjectileSystem>
    {
        private struct Projectile
        {
            public Vector3 Position;
            public Vector3 Velocity;
            public float Gravity;
            public float Radius;
            public float LifeRemaining;
            public float Travelled;
            public EntityId Owner;
            public WeaponDefinition Weapon;
            public WeaponStats Stats;
            public PooledObject Visual;
            public Vector3 ShotOrigin;
        }

        [SerializeField] private int capacity = 128;
        [SerializeField] private LayerMask worldMask;
        [SerializeField] private GameObject explosionEffectPrefab;
        [Tooltip("Explosions hurt their owner too (genre standard, discourages point-blank spam).")]
        [SerializeField] private bool selfDamage = true;

        private Projectile[] _active;
        private int _count;
        private LiveHitboxQuery _hitboxes;

        /// <summary>(position, radius) for camera shake, audio, AI awareness.</summary>
        public event Action<Vector3, float> Exploded;

        public int ActiveCount => _count;

        protected override void OnSingletonAwake()
        {
            _active = new Projectile[Mathf.Max(8, capacity)];
            _hitboxes = new LiveHitboxQuery();
            if (worldMask.value == 0) worldMask = CombatAuthority.DefaultWorldMask();
        }

        /// <param name="origin">Visual spawn point (muzzle).</param>
        /// <param name="shotOrigin">Logical origin (camera) used for longshot/self-damage distance.</param>
        public void Launch(WeaponDefinition weapon, WeaponStats stats, EntityId owner, Vector3 origin, Vector3 direction, Vector3 shotOrigin)
        {
            if (_count >= _active.Length)
            {
                Debug.LogWarning("[ProjectileSystem] Capacity reached; projectile dropped. Raise capacity.");
                return;
            }

            ProjectileSettings settings = weapon.projectile;
            PooledObject visual = null;
            if (settings.visualPrefab != null)
            {
                visual = PoolManager.Instance.Spawn(settings.visualPrefab, origin, Quaternion.LookRotation(direction));
            }

            _active[_count++] = new Projectile
            {
                Position = origin,
                Velocity = direction.normalized * stats.ProjectileSpeed,
                Gravity = Physics.gravity.y * settings.gravityScale,
                Radius = Mathf.Max(0.01f, settings.radius),
                LifeRemaining = settings.lifetime,
                Travelled = 0f,
                Owner = owner,
                Weapon = weapon,
                Stats = stats,
                Visual = visual,
                ShotOrigin = shotOrigin,
            };
        }

        private void Update()
        {
            float dt = Time.deltaTime;
            if (dt <= 0f) return;

            for (int i = _count - 1; i >= 0; i--)
            {
                ref Projectile p = ref _active[i];
                Vector3 step = p.Velocity * dt;
                float distance = step.magnitude;
                if (distance < 1e-5f)
                {
                    p.LifeRemaining -= dt;
                    if (p.LifeRemaining <= 0f) Finish(i, p.Position, Vector3.up, false);
                    continue;
                }
                Vector3 direction = step / distance;

                bool hitWorld = Physics.SphereCast(p.Position, p.Radius, direction, out RaycastHit worldHit, distance,
                    worldMask, QueryTriggerInteraction.Ignore);
                float worldDistance = hitWorld ? worldHit.distance : float.MaxValue;

                // Inflate the analytic test by the projectile radius via a slightly longer ray.
                bool hitCharacter = _hitboxes.Raycast(p.Position, direction, distance + p.Radius, p.Owner, out HitboxHit characterHit)
                                    && characterHit.Distance < worldDistance;

                if (hitCharacter)
                {
                    p.Travelled += characterHit.Distance;
                    ApplyDirectHit(ref p, characterHit, direction);
                    Finish(i, characterHit.Point, -direction, true);
                    continue;
                }

                if (hitWorld)
                {
                    p.Travelled += worldHit.distance;
                    Vector3 impactPoint = p.Position + direction * worldHit.distance;
                    Finish(i, impactPoint, worldHit.normal, true);
                    continue;
                }

                p.Position += step;
                p.Travelled += distance;
                p.Velocity.y += p.Gravity * dt;
                p.LifeRemaining -= dt;

                if (p.Visual != null) p.Visual.transform.SetPositionAndRotation(p.Position, Quaternion.LookRotation(p.Velocity));
                if (p.LifeRemaining <= 0f) Finish(i, p.Position, Vector3.up, true);
            }
        }

        private void ApplyDirectHit(ref Projectile p, in HitboxHit hit, Vector3 direction)
        {
            float damage = p.Stats.DamageAt(Vector3.Distance(p.ShotOrigin, hit.Point), hit.Zone);
            if (damage <= 0f) return;
            DamageSystem.Apply(new DamageInfo
            {
                Amount = damage,
                Attacker = p.Owner,
                Victim = hit.Entity,
                WeaponId = p.Weapon.weaponId,
                WeaponClass = p.Weapon.weaponClass,
                Zone = hit.Zone,
                Point = hit.Point,
                Direction = direction,
                SourcePosition = p.ShotOrigin,
                Distance = Vector3.Distance(p.ShotOrigin, hit.Point),
                Flags = Vector3.Distance(p.ShotOrigin, hit.Point) >= p.Weapon.longshotDistance ? KillFlags.Longshot : KillFlags.None,
            });
        }

        private void Finish(int index, Vector3 point, Vector3 normal, bool impacted)
        {
            Projectile p = _active[index];
            ProjectileSettings settings = p.Weapon.projectile;

            bool armed = p.Travelled >= settings.armingDistance;
            if (impacted && armed && settings.explosionRadius > 0f) Explode(p, point, normal);
            else if (impacted) ImpactEffectSystem.Instance.Spawn(new ImpactPoint { Point = point, Normal = normal, Surface = SurfaceType.Default });

            if (p.Visual != null) p.Visual.Despawn();
            _count--;
            _active[index] = _active[_count];
            _active[_count] = default;
        }

        private void Explode(in Projectile p, Vector3 point, Vector3 normal)
        {
            ProjectileSettings settings = p.Weapon.projectile;
            float radius = settings.explosionRadius;
            Vector3 lineOfSightOrigin = point + normal * 0.1f;

            var rigs = HitboxRig.All;
            for (int i = rigs.Count - 1; i >= 0; i--)
            {
                HitboxRig rig = rigs[i];
                if (!rig.IsAlive || (!selfDamage && rig.Id == p.Owner)) continue;
                if ((rig.BoundsCenter - point).sqrMagnitude > (radius + rig.BoundsRadius) * (radius + rig.BoundsRadius)) continue;

                // Closest hit capsule to the blast decides falloff.
                CapsuleShape[] shapes = rig.GetWorldShapes();
                float closest = float.MaxValue;
                HitZone zone = HitZone.LowerTorso;
                for (int s = 0; s < rig.ShapeCount; s++)
                {
                    float d = HitShapes.DistanceToCapsule(point, shapes[s]);
                    if (d < closest)
                    {
                        closest = d;
                        zone = shapes[s].Zone;
                    }
                }
                if (closest > radius) continue;

                // Cover blocks splash.
                if (Physics.Linecast(lineOfSightOrigin, rig.BoundsCenter, worldMask, QueryTriggerInteraction.Ignore)) continue;

                float falloff = 1f - Mathf.Clamp01(closest / radius);
                float damage = settings.explosionDamage * falloff * falloff; // quadratic: lethal center, forgiving edge
                if (damage < 1f) continue;

                DamageSystem.Apply(new DamageInfo
                {
                    Amount = damage,
                    Attacker = p.Owner,
                    Victim = rig.Id,
                    WeaponId = p.Weapon.weaponId,
                    WeaponClass = p.Weapon.weaponClass,
                    Zone = zone == HitZone.Head ? HitZone.UpperTorso : zone, // no splash headshots
                    Point = point,
                    Direction = (rig.BoundsCenter - point).normalized,
                    SourcePosition = point,
                    Distance = Vector3.Distance(p.ShotOrigin, point),
                    Flags = KillFlags.Explosive,
                });
            }

            if (explosionEffectPrefab != null) PoolManager.Instance.Spawn(explosionEffectPrefab, point, Quaternion.LookRotation(normal), 3f);
            Exploded?.Invoke(point, radius);
        }
    }
}
