using System.Collections.Generic;
using MobileFPS.Combat;
using MobileFPS.Core;
using MobileFPS.Effects;
using MobileFPS.Networking;
using MobileFPS.Weapons;
using NUnit.Framework;
using UnityEngine;

namespace MobileFPS.Tests
{
    public sealed class HitShapesTests
    {
        private static readonly Vector3 A = new Vector3(0f, 0f, 0f);
        private static readonly Vector3 B = new Vector3(0f, 2f, 0f);
        private const float R = 0.5f;

        [Test]
        public void Ray_HitsCapsuleBody()
        {
            Assert.IsTrue(HitShapes.RayCapsule(new Vector3(0f, 1f, -5f), Vector3.forward, A, B, R, 100f, out float d));
            Assert.That(d, Is.EqualTo(4.5f).Within(1e-4f));
        }

        [Test]
        public void Ray_HitsCapsuleEndCap()
        {
            Assert.IsTrue(HitShapes.RayCapsule(new Vector3(0f, 2.3f, -5f), Vector3.forward, A, B, R, 100f, out float d));
            Assert.That(d, Is.EqualTo(5f - 0.4f).Within(1e-4f)); // sqrt(0.5² - 0.3²) = 0.4
        }

        [Test]
        public void Ray_MissesCapsule()
        {
            Assert.IsFalse(HitShapes.RayCapsule(new Vector3(2f, 1f, -5f), Vector3.forward, A, B, R, 100f, out _));
            Assert.IsFalse(HitShapes.RayCapsule(new Vector3(0f, 2.6f, -5f), Vector3.forward, A, B, R, 100f, out _));
        }

        [Test]
        public void Ray_BehindOrBeyondMaxDistance_Misses()
        {
            Assert.IsFalse(HitShapes.RayCapsule(new Vector3(0f, 1f, 5f), Vector3.forward, A, B, R, 100f, out _));
            Assert.IsFalse(HitShapes.RayCapsule(new Vector3(0f, 1f, -5f), Vector3.forward, A, B, R, 4f, out _));
        }

        [Test]
        public void Ray_StartingInside_HitsAtZero()
        {
            Assert.IsTrue(HitShapes.RayCapsule(new Vector3(0f, 1f, 0f), Vector3.forward, A, B, R, 100f, out float d));
            Assert.AreEqual(0f, d);
        }

        [Test]
        public void Ray_ParallelToAxis_HitsCap()
        {
            Assert.IsTrue(HitShapes.RayCapsule(new Vector3(0f, -5f, 0f), Vector3.up, A, B, R, 100f, out float d));
            Assert.That(d, Is.EqualTo(4.5f).Within(1e-4f));
        }

        [Test]
        public void DegenerateCapsule_IsSphere()
        {
            Assert.IsTrue(HitShapes.RayCapsule(new Vector3(0f, 0f, -3f), Vector3.forward, A, A, 1f, 100f, out float d));
            Assert.That(d, Is.EqualTo(2f).Within(1e-4f));
        }

        [Test]
        public void RayShapes_ReturnsNearestZone_AndHeadWinsTies()
        {
            var shapes = new[]
            {
                new CapsuleShape(new Vector3(0f, 1f, 2f), new Vector3(0f, 1f, 2f), 0.5f, HitZone.UpperTorso),
                new CapsuleShape(new Vector3(0f, 1f, 1f), new Vector3(0f, 1f, 1f), 0.5f, HitZone.LowerTorso), // nearer
                new CapsuleShape(new Vector3(0f, 1f, 1f), new Vector3(0f, 1f, 1f), 0.5f, HitZone.Head),       // same depth
            };
            HitShapes.ComputeBounds(shapes, 0, shapes.Length, out Vector3 center, out float radius);
            Assert.IsTrue(HitShapes.RayShapes(new Vector3(0f, 1f, -5f), Vector3.forward, 100f, shapes, 0, shapes.Length, center, radius, out float d, out HitZone zone));
            Assert.That(d, Is.EqualTo(5.5f).Within(1e-4f));
            Assert.AreEqual(HitZone.Head, zone);
        }

        [Test]
        public void DistanceToCapsule_IsSurfaceDistance()
        {
            var shape = new CapsuleShape(A, B, R, HitZone.UpperTorso);
            Assert.That(HitShapes.DistanceToCapsule(new Vector3(3f, 1f, 0f), shape), Is.EqualTo(2.5f).Within(1e-5f));
            Assert.That(HitShapes.DistanceToCapsule(new Vector3(0f, 1f, 0f), shape), Is.LessThan(0f));
        }
    }

    public sealed class SpreadPatternTests
    {
        [Test]
        public void ZeroSpread_ReturnsForward()
        {
            Vector3 forward = new Vector3(0.3f, 0.2f, 0.9f).normalized;
            Assert.AreEqual(forward, SpreadPattern.Apply(forward, 0f, 77, 0));
        }

        [Test]
        public void IsDeterministic_AndPelletsDiffer()
        {
            Vector3 forward = Vector3.forward;
            Assert.AreEqual(SpreadPattern.Apply(forward, 3f, 1234, 2), SpreadPattern.Apply(forward, 3f, 1234, 2));
            Assert.AreNotEqual(SpreadPattern.Apply(forward, 3f, 1234, 2), SpreadPattern.Apply(forward, 3f, 1234, 3));
        }

        [Test]
        public void StaysInsideCone()
        {
            Vector3 forward = new Vector3(-0.4f, 0.5f, 0.2f).normalized;
            for (int i = 0; i < 2000; i++)
            {
                Vector3 direction = SpreadPattern.Apply(forward, 4f, (uint)i * 7919u, i % 8);
                Assert.That(Vector3.Angle(forward, direction), Is.LessThanOrEqualTo(4f + 1e-3f));
                Assert.That(direction.magnitude, Is.EqualTo(1f).Within(1e-4f));
            }
        }

        [Test]
        public void Basis_IsOrthonormal_ForAllDirections()
        {
            Vector3[] directions = { Vector3.up, Vector3.down, Vector3.forward, Vector3.back, new Vector3(1f, 2f, 3f).normalized, new Vector3(0.001f, -1f, -0.001f).normalized };
            foreach (Vector3 n in directions)
            {
                SpreadPattern.BuildBasis(n, out Vector3 b1, out Vector3 b2);
                Assert.That(Vector3.Dot(n, b1), Is.EqualTo(0f).Within(1e-4f));
                Assert.That(Vector3.Dot(n, b2), Is.EqualTo(0f).Within(1e-4f));
                Assert.That(Vector3.Dot(b1, b2), Is.EqualTo(0f).Within(1e-4f));
                Assert.That(b1.magnitude, Is.EqualTo(1f).Within(1e-4f));
                Assert.That(b2.magnitude, Is.EqualTo(1f).Within(1e-4f));
            }
        }
    }

    public sealed class ShotPacketCodecTests
    {
        /// <summary>
        /// Angle in degrees computed in double precision. Vector3.Angle uses a float
        /// acos, which cannot resolve angles below roughly 0.02 degrees.
        /// </summary>
        private static double PreciseAngle(Vector3 a, Vector3 b)
        {
            double cx = (double)a.y * b.z - (double)a.z * b.y;
            double cy = (double)a.z * b.x - (double)a.x * b.z;
            double cz = (double)a.x * b.y - (double)a.y * b.x;
            double dot = (double)a.x * b.x + (double)a.y * b.y + (double)a.z * b.z;
            return System.Math.Atan2(System.Math.Sqrt(cx * cx + cy * cy + cz * cz), dot) * 180.0 / System.Math.PI;
        }

        [Test]
        public void RoundTrip_PreservesShot()
        {
            var shot = new ShotRequest
            {
                Sequence = 123456,
                Shooter = new EntityId(42),
                WeaponNetId = 7,
                ViewTime = 1234.56789,
                Origin = new Vector3(10.5f, 1.68f, -3.25f),
                Direction = new Vector3(0.2f, -0.1f, 0.97f).normalized,
                SpreadDegrees = 2.37f,
                Seed = 0xDEADBEEF,
                Flags = ShotFlags.Aiming | ShotFlags.Sliding,
            };
            var buffer = new byte[64];
            int written = ShotPacketCodec.Write(shot, buffer, 3);
            Assert.AreEqual(ShotPacketCodec.Size, written);

            ShotRequest decoded = ShotPacketCodec.Read(buffer, 3);
            Assert.AreEqual(shot.Sequence, decoded.Sequence);
            Assert.AreEqual(shot.Shooter, decoded.Shooter);
            Assert.AreEqual(shot.WeaponNetId, decoded.WeaponNetId);
            Assert.AreEqual(shot.ViewTime, decoded.ViewTime);
            Assert.AreEqual(shot.Origin, decoded.Origin);
            Assert.AreEqual(shot.Seed, decoded.Seed);
            Assert.AreEqual(shot.Flags, decoded.Flags);
            Assert.That(decoded.SpreadDegrees, Is.EqualTo(shot.SpreadDegrees).Within(0.006f));
            Assert.That(PreciseAngle(shot.Direction, decoded.Direction), Is.LessThan(0.006));
        }

        [Test]
        public void OctahedralEncoding_WorstCaseErrorIsTiny()
        {
            var random = new DeterministicRandom(2024);
            double worst = 0.0;
            for (int i = 0; i < 20000; i++)
            {
                var direction = new Vector3(random.Range(-1f, 1f), random.Range(-1f, 1f), random.Range(-1f, 1f));
                if (direction.sqrMagnitude < 1e-4f) continue;
                direction.Normalize();
                ShotPacketCodec.OctahedralEncode(direction, out ushort x, out ushort y);
                worst = System.Math.Max(worst, PreciseAngle(direction, ShotPacketCodec.OctahedralDecode(x, y)));
            }
            foreach (Vector3 axis in new[] { Vector3.up, Vector3.down, Vector3.left, Vector3.right, Vector3.forward, Vector3.back })
            {
                ShotPacketCodec.OctahedralEncode(axis, out ushort x, out ushort y);
                worst = System.Math.Max(worst, PreciseAngle(axis, ShotPacketCodec.OctahedralDecode(x, y)));
            }
            TestContext.WriteLine($"worst octahedral error: {worst:F5} deg");
            Assert.That(worst, Is.LessThan(0.006), "~1 cm at 100 m");
        }
    }

    public sealed class HitboxHistoryTests
    {
        private static CapsuleShape[] BodyAt(float x)
        {
            return new[] { new CapsuleShape(new Vector3(x, 0.5f, 0f), new Vector3(x, 1.5f, 0f), 0.3f, HitZone.UpperTorso) };
        }

        private static HitboxHistory TwoFrames()
        {
            // Entity 7 runs from x=0 (t=0) to x=10 (t=1).
            var history = new HitboxHistory(frameCapacity: 8, maxRigs: 4, maxShapesPerRig: 4);
            history.BeginFrame(0.0);
            history.AddRig(new EntityId(7), BodyAt(0f), 1);
            history.BeginFrame(1.0);
            history.AddRig(new EntityId(7), BodyAt(10f), 1);
            return history;
        }

        [Test]
        public void Rewind_InterpolatesBetweenFrames()
        {
            HitboxHistory history = TwoFrames();
            var origin = new Vector3(5f, 1f, -10f);

            Assert.IsTrue(history.Raycast(origin, Vector3.forward, 100f, 0.5, EntityId.None, out HitboxHit hit), "target was at x=5 at t=0.5");
            Assert.AreEqual(new EntityId(7), hit.Entity);
            Assert.That(hit.Distance, Is.EqualTo(9.7f).Within(1e-3f));
            Assert.IsFalse(history.Raycast(origin, Vector3.forward, 100f, 1.0, EntityId.None, out _), "target has moved on by t=1");
        }

        [Test]
        public void Rewind_IgnoresShooter()
        {
            HitboxHistory history = TwoFrames();
            Assert.IsFalse(history.Raycast(new Vector3(5f, 1f, -10f), Vector3.forward, 100f, 0.5, new EntityId(7), out _));
        }

        [Test]
        public void Rewind_ClampsToRecordedWindow()
        {
            HitboxHistory history = TwoFrames();
            Assert.IsTrue(history.Raycast(new Vector3(0f, 1f, -10f), Vector3.forward, 100f, -5.0, EntityId.None, out _), "older than window -> oldest frame");
            Assert.IsTrue(history.Raycast(new Vector3(10f, 1f, -10f), Vector3.forward, 100f, 99.0, EntityId.None, out _), "future -> newest frame");
        }

        [Test]
        public void RingBuffer_KeepsNewestFrames()
        {
            var history = new HitboxHistory(frameCapacity: 4, maxRigs: 2, maxShapesPerRig: 2);
            for (int t = 0; t < 10; t++)
            {
                history.BeginFrame(t);
                history.AddRig(new EntityId(1), BodyAt(t), 1);
            }
            Assert.AreEqual(4, history.FrameCount);
            Assert.AreEqual(6.0, history.OldestTime);
            Assert.AreEqual(9.0, history.NewestTime);
        }

        [Test]
        public void SameTimeRecordedTwice_OverwritesNewestFrame()
        {
            var history = new HitboxHistory(frameCapacity: 4, maxRigs: 2, maxShapesPerRig: 2);
            history.BeginFrame(1.0);
            history.AddRig(new EntityId(1), BodyAt(0f), 1);
            history.BeginFrame(1.0);
            history.AddRig(new EntityId(1), BodyAt(20f), 1);
            Assert.AreEqual(1, history.FrameCount);
            Assert.IsTrue(history.Raycast(new Vector3(20f, 1f, -5f), Vector3.forward, 50f, 1.0, EntityId.None, out _));
        }
    }

    public sealed class HitscanSolverTests
    {
        private sealed class FakeWorld : IWorldQuery
        {
            public readonly List<WorldHit> Hits = new List<WorldHit>();

            public int RaycastAll(Vector3 origin, Vector3 direction, float maxDistance, WorldHit[] results)
            {
                int count = 0;
                foreach (WorldHit hit in Hits)
                {
                    if (hit.Distance <= maxDistance && count < results.Length) results[count++] = hit;
                }
                return count;
            }
        }

        private sealed class FakeHitboxes : IHitboxQuery
        {
            public bool Present = true;
            public EntityId Entity = new EntityId(2);
            public float Distance = 20f;
            public HitZone Zone = HitZone.UpperTorso;

            public bool Raycast(Vector3 origin, Vector3 direction, float maxDistance, EntityId ignore, out HitboxHit hit)
            {
                hit = new HitboxHit { Entity = Entity, Zone = Zone, Distance = Distance, Point = origin + direction * Distance };
                return Present && Entity != ignore && Distance <= maxDistance;
            }
        }

        private readonly WorldHit[] _buffer = new WorldHit[16];
        private readonly List<PelletHit> _hits = new List<PelletHit>();
        private readonly List<ImpactPoint> _impacts = new List<ImpactPoint>();
        private WeaponStats _rifle;

        [SetUp]
        public void SetUp()
        {
            _hits.Clear();
            _impacts.Clear();
            WeaponDefinition rifle = ScriptableObject.CreateInstance<WeaponDefinition>();
            rifle.damageRanges = new[] { new DamageRange(25f, 30f), new DamageRange(150f, 20f) };
            rifle.penetrationPower = 1f;
            _rifle = WeaponStats.Build(rifle);
        }

        private static ShotRequest Shot(EntityId shooter) => new ShotRequest
        {
            Shooter = shooter,
            Origin = Vector3.zero,
            Direction = Vector3.forward,
            SpreadDegrees = 0f,
            Seed = 1,
        };

        [Test]
        public void CleanHit_AppliesRangeDamageAndZoneMultiplier()
        {
            HitscanSolver.Solve(Shot(new EntityId(1)), _rifle, new FakeWorld(), new FakeHitboxes(), _buffer, _hits, _impacts, null);
            Assert.AreEqual(1, _hits.Count);
            Assert.That(_hits[0].Damage, Is.EqualTo(30f * 1.1f).Within(1e-4f)); // upper torso x1.1
            Assert.IsFalse(_hits[0].Penetrated);
        }

        [Test]
        public void DamageFallsOffWithRange()
        {
            HitscanSolver.Solve(Shot(new EntityId(1)), _rifle, new FakeWorld(), new FakeHitboxes { Distance = 60f, Zone = HitZone.LowerTorso }, _buffer, _hits, _impacts, null);
            Assert.That(_hits[0].Damage, Is.EqualTo(20f).Within(1e-4f));
        }

        [Test]
        public void ThinWood_IsPenetratedWithReducedDamage()
        {
            var world = new FakeWorld();
            world.Hits.Add(new WorldHit { Distance = 10f, Surface = SurfaceType.Wood, PenetrationCost = 0.6f });
            HitscanSolver.Solve(Shot(new EntityId(1)), _rifle, world, new FakeHitboxes { Zone = HitZone.LowerTorso }, _buffer, _hits, _impacts, null);

            Assert.AreEqual(1, _hits.Count);
            Assert.IsTrue(_hits[0].Penetrated);
            Assert.That(_hits[0].Damage, Is.EqualTo(30f * HitscanSolver.PenetrationDamageScale).Within(1e-4f));
            Assert.AreEqual(1, _impacts.Count, "the wood still gets a bullet hole");
        }

        [Test]
        public void Concrete_BlocksTheShot()
        {
            var world = new FakeWorld();
            world.Hits.Add(new WorldHit { Distance = 10f, Surface = SurfaceType.Concrete, PenetrationCost = 3f });
            var ends = new List<Vector3>();
            HitscanSolver.Solve(Shot(new EntityId(1)), _rifle, world, new FakeHitboxes(), _buffer, _hits, _impacts, ends);

            Assert.AreEqual(0, _hits.Count);
            Assert.That(ends[0].z, Is.EqualTo(10f).Within(1e-4f), "tracer stops at the wall");
        }

        [Test]
        public void Shooter_CannotHitThemselves()
        {
            HitscanSolver.Solve(Shot(new EntityId(2)), _rifle, new FakeWorld(), new FakeHitboxes { Entity = new EntityId(2) }, _buffer, _hits, _impacts, null);
            Assert.AreEqual(0, _hits.Count);
        }

        [Test]
        public void ShotgunPellets_AggregateIntoOneDamageEvent()
        {
            WeaponDefinition shotgun = ScriptableObject.CreateInstance<WeaponDefinition>();
            shotgun.pelletsPerShot = 8;
            shotgun.damageRanges = new[] { new DamageRange(10f, 15f) };
            shotgun.zoneMultipliers = new HitZoneMultipliers { upperTorso = 1f };
            ShotRequest shot = Shot(new EntityId(1));
            shot.SpreadDegrees = 4f;

            HitscanSolver.Solve(shot, WeaponStats.Build(shotgun), new FakeWorld(), new FakeHitboxes { Distance = 5f }, _buffer, _hits, _impacts, null);
            var victims = new List<VictimDamage>();
            HitscanSolver.Aggregate(_hits, victims);

            Assert.AreEqual(8, _hits.Count);
            Assert.AreEqual(1, victims.Count);
            Assert.AreEqual(8, victims[0].PelletHits);
            Assert.That(victims[0].Damage, Is.EqualTo(120f).Within(1e-3f));
        }

        [Test]
        public void Aggregate_KeepsMostValuableZone()
        {
            var hits = new List<PelletHit>
            {
                new PelletHit { Victim = new EntityId(3), Zone = HitZone.Leg, Damage = 10f, Distance = 8f },
                new PelletHit { Victim = new EntityId(3), Zone = HitZone.Head, Damage = 10f, Distance = 9f },
                new PelletHit { Victim = new EntityId(4), Zone = HitZone.Arm, Damage = 5f, Distance = 12f },
            };
            var victims = new List<VictimDamage>();
            HitscanSolver.Aggregate(hits, victims);
            Assert.AreEqual(2, victims.Count);
            Assert.AreEqual(HitZone.Head, victims[0].BestZone);
            Assert.AreEqual(8f, victims[0].Distance);
            Assert.AreEqual(20f, victims[0].Damage);
        }
    }

    public sealed class ServerShotValidatorTests
    {
        private ServerShotValidator _validator;
        private ShooterState _shooter;

        [SetUp]
        public void SetUp()
        {
            WeaponDefinition weapon = ScriptableObject.CreateInstance<WeaponDefinition>();
            weapon.roundsPerMinute = 600f; // 100 ms between shots
            weapon.spread = new SpreadSettings { hipMin = 2f, ads = 0.1f, crouchMultiplier = 0.8f };
            _validator = new ServerShotValidator();
            _shooter = new ShooterState { Id = new EntityId(1), EyePosition = Vector3.zero };
            _shooter.Equip(3, WeaponStats.Build(weapon), ammoInMagazine: 30);
        }

        private static ShotRequest Shot(uint sequence, double viewTime) => new ShotRequest
        {
            Sequence = sequence,
            Shooter = new EntityId(1),
            WeaponNetId = 3,
            ViewTime = viewTime,
            Origin = Vector3.zero,
            Direction = Vector3.forward,
            SpreadDegrees = 2.5f,
        };

        [Test]
        public void LegitimateShot_IsAccepted_AndRewindsToViewTime()
        {
            Assert.AreEqual(ShotVerdict.Accepted, _validator.Validate(Shot(1, 9.9), _shooter, 10.0, out double rewind));
            Assert.AreEqual(9.9, rewind, 1e-9);
            Assert.AreEqual(29, _shooter.AmmoInMagazine);
        }

        [Test]
        public void Rewind_IsCappedForHighPing()
        {
            Assert.AreEqual(ShotVerdict.Accepted, _validator.Validate(Shot(1, 9.5), _shooter, 10.0, out double rewind));
            Assert.AreEqual(10.0 - _validator.Config.maxRewindSeconds, rewind, 1e-9);
        }

        [Test]
        public void RapidFireMod_IsRejected()
        {
            Assert.AreEqual(ShotVerdict.Accepted, _validator.Validate(Shot(1, 9.90), _shooter, 10.00, out _));
            Assert.AreEqual(ShotVerdict.RejectedFireRate, _validator.Validate(Shot(2, 9.95), _shooter, 10.05, out _));
            Assert.AreEqual(ShotVerdict.Accepted, _validator.Validate(Shot(3, 10.00), _shooter, 10.10, out _));
        }

        [Test]
        public void TokenBucket_StopsClientThatAlsoLiesAboutTime()
        {
            // Client-side timestamps look perfectly spaced, but every packet arrives at once.
            int accepted = 0;
            for (uint i = 1; i <= 8; i++)
            {
                if (_validator.Validate(Shot(i, 9.0 + i * 0.1), _shooter, 10.0, out _) == ShotVerdict.Accepted) accepted++;
            }
            Assert.AreEqual((int)_validator.Config.tokenBucketCapacity, accepted);
        }

        [Test]
        public void ReplayedPacket_IsRejected()
        {
            _validator.Validate(Shot(5, 9.9), _shooter, 10.0, out _);
            Assert.AreEqual(ShotVerdict.RejectedOutOfOrder, _validator.Validate(Shot(5, 10.1), _shooter, 10.2, out _));
        }

        [Test]
        public void TimeWindowViolations_AreRejected()
        {
            Assert.AreEqual(ShotVerdict.RejectedStale, _validator.Validate(Shot(1, 7.0), _shooter, 10.0, out _));
            Assert.AreEqual(ShotVerdict.RejectedFromFuture, _validator.Validate(Shot(2, 10.5), _shooter, 10.0, out _));
        }

        [Test]
        public void ImpossibleOrigin_IsRejected()
        {
            ShotRequest shot = Shot(1, 9.95);
            shot.Origin = new Vector3(0f, 0f, 5f);
            Assert.AreEqual(ShotVerdict.RejectedOrigin, _validator.Validate(shot, _shooter, 10.0, out _));
        }

        [Test]
        public void NoSpreadMod_IsRejected()
        {
            ShotRequest shot = Shot(1, 9.95);
            shot.SpreadDegrees = 0f;
            Assert.AreEqual(ShotVerdict.RejectedSpread, _validator.Validate(shot, _shooter, 10.0, out _));
            shot.Flags = ShotFlags.Aiming;
            shot.SpreadDegrees = 0.1f;
            Assert.AreEqual(ShotVerdict.Accepted, _validator.Validate(shot, _shooter, 10.0, out _));
        }

        [Test]
        public void AmmoWeaponAndLife_AreEnforced()
        {
            _shooter.AmmoInMagazine = 0;
            Assert.AreEqual(ShotVerdict.RejectedNoAmmo, _validator.Validate(Shot(1, 9.95), _shooter, 10.0, out _));

            _shooter.AmmoInMagazine = 10;
            ShotRequest wrongWeapon = Shot(2, 9.95);
            wrongWeapon.WeaponNetId = 9;
            Assert.AreEqual(ShotVerdict.RejectedWrongWeapon, _validator.Validate(wrongWeapon, _shooter, 10.0, out _));

            _shooter.Alive = false;
            Assert.AreEqual(ShotVerdict.RejectedNotAlive, _validator.Validate(Shot(3, 9.95), _shooter, 10.0, out _));
            Assert.AreEqual(3, _shooter.RejectedShots);
        }
    }
}
