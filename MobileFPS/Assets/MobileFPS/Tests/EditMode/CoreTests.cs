using System;
using System.Text.RegularExpressions;
using MobileFPS.Core;
using NUnit.Framework;
using UnityEngine;
#if UNITY_5_3_OR_NEWER
using UnityEngine.TestTools;
#endif

namespace MobileFPS.Tests
{
    public sealed class DampedSpringTests
    {
        [Test]
        public void CriticallyDamped_ConvergesWithoutOvershoot()
        {
            float position = 0f, velocity = 0f;
            float maxPosition = float.MinValue;
            for (int i = 0; i < 120; i++)
            {
                SpringCoefficients.Compute(20f, 1f, 1f / 60f).Apply(ref position, ref velocity, 1f);
                maxPosition = Mathf.Max(maxPosition, position);
            }
            Assert.That(maxPosition, Is.LessThanOrEqualTo(1f + 1e-4f));
            Assert.That(position, Is.EqualTo(1f).Within(1e-3f));
        }

        [Test]
        public void Underdamped_Overshoots()
        {
            float position = 0f, velocity = 0f, maxPosition = 0f;
            for (int i = 0; i < 120; i++)
            {
                SpringCoefficients.Compute(20f, 0.2f, 1f / 60f).Apply(ref position, ref velocity, 1f);
                maxPosition = Mathf.Max(maxPosition, position);
            }
            Assert.That(maxPosition, Is.GreaterThan(1.1f));
        }

        [TestCase(0.25f)]
        [TestCase(0.5f)]
        [TestCase(2f)]
        public void StaysStable_WithHugeFrameSpikes(float deltaTime)
        {
            // An Euler spring with this stiffness explodes at dt >= ~0.06.
            float position = 0f, velocity = 50f;
            for (int i = 0; i < 40; i++)
            {
                SpringCoefficients.Compute(30f, 0.5f, deltaTime).Apply(ref position, ref velocity, 1f);
                Assert.That(Mathf.Abs(position), Is.LessThan(5f), "spring diverged");
            }
            Assert.That(position, Is.EqualTo(1f).Within(1e-2f));
        }

        [Test]
        public void IsFrameRateIndependent()
        {
            float p30 = 0f, v30 = 0f, p120 = 0f, v120 = 0f;
            for (int i = 0; i < 30; i++) SpringCoefficients.Compute(18f, 0.6f, 1f / 30f).Apply(ref p30, ref v30, 1f);
            for (int i = 0; i < 120; i++) SpringCoefficients.Compute(18f, 0.6f, 1f / 120f).Apply(ref p120, ref v120, 1f);
            Assert.That(p30, Is.EqualTo(p120).Within(1e-4f));
            Assert.That(v30, Is.EqualTo(v120).Within(1e-3f));
        }

        [Test]
        public void ZeroFrequency_IsIdentity()
        {
            SpringCoefficients c = SpringCoefficients.Compute(0f, 1f, 0.016f);
            float position = 3f, velocity = 2f;
            c.Apply(ref position, ref velocity, 0f);
            Assert.AreEqual(3f, position);
            Assert.AreEqual(2f, velocity);
        }

        [Test]
        public void ExponentialSmoothing_IsFrameRateIndependent()
        {
            float a = 0f, b = 0f;
            for (int i = 0; i < 30; i++) a = Smoothing.Damp(a, 10f, 6f, 1f / 30f);
            for (int i = 0; i < 144; i++) b = Smoothing.Damp(b, 10f, 6f, 1f / 144f);
            Assert.That(a, Is.EqualTo(b).Within(1e-3f));
        }
    }

    public sealed class EventBusTests
    {
        private struct PingEvent : IGameEvent
        {
            public int Value;
        }

        private int _aCalls, _bCalls, _cCalls;
        private GameEventHandler<PingEvent> _a, _b, _c;

        [SetUp]
        public void SetUp()
        {
            EventBus<PingEvent>.Clear();
            _aCalls = _bCalls = _cCalls = 0;
            _a = (in PingEvent e) => _aCalls++;
            _b = (in PingEvent e) => _bCalls++;
            _c = (in PingEvent e) => _cCalls++;
        }

        [TearDown]
        public void TearDown() => EventBus<PingEvent>.Clear();

        [Test]
        public void Raise_DeliversPayloadToEverySubscriber()
        {
            int received = 0;
            EventBus<PingEvent>.Subscribe((in PingEvent e) => received = e.Value);
            EventBus<PingEvent>.Subscribe(_a);
            EventBus<PingEvent>.Raise(new PingEvent { Value = 42 });
            Assert.AreEqual(42, received);
            Assert.AreEqual(1, _aCalls);
        }

        [Test]
        public void Subscribe_IsIdempotent()
        {
            EventBus<PingEvent>.Subscribe(_a);
            EventBus<PingEvent>.Subscribe(_a);
            EventBus<PingEvent>.Raise(default);
            Assert.AreEqual(1, _aCalls);
            Assert.AreEqual(1, EventBus<PingEvent>.HandlerCount);
        }

        [Test]
        public void UnsubscribingAnotherHandlerDuringRaise_SkipsIt()
        {
            GameEventHandler<PingEvent> remover = (in PingEvent e) => EventBus<PingEvent>.Unsubscribe(_b);
            EventBus<PingEvent>.Subscribe(remover);
            EventBus<PingEvent>.Subscribe(_b);
            EventBus<PingEvent>.Subscribe(_c);

            EventBus<PingEvent>.Raise(default);

            Assert.AreEqual(0, _bCalls);
            Assert.AreEqual(1, _cCalls, "handlers after the removed one must still run exactly once");
            Assert.AreEqual(2, EventBus<PingEvent>.HandlerCount);
        }

        [Test]
        public void SelfUnsubscribeDuringRaise_IsSafe()
        {
            GameEventHandler<PingEvent> once = null;
            int onceCalls = 0;
            once = (in PingEvent e) =>
            {
                onceCalls++;
                EventBus<PingEvent>.Unsubscribe(once);
            };
            EventBus<PingEvent>.Subscribe(once);
            EventBus<PingEvent>.Subscribe(_a);

            EventBus<PingEvent>.Raise(default);
            EventBus<PingEvent>.Raise(default);

            Assert.AreEqual(1, onceCalls);
            Assert.AreEqual(2, _aCalls);
        }

        [Test]
        public void SubscribingDuringRaise_TakesEffectNextRaise()
        {
            GameEventHandler<PingEvent> adder = (in PingEvent e) => EventBus<PingEvent>.Subscribe(_a);
            EventBus<PingEvent>.Subscribe(adder);

            EventBus<PingEvent>.Raise(default);
            Assert.AreEqual(0, _aCalls);
            EventBus<PingEvent>.Raise(default);
            Assert.AreEqual(1, _aCalls);
        }

        [Test]
        public void ThrowingHandler_DoesNotStopOthers()
        {
            EventBus<PingEvent>.Subscribe((in PingEvent e) => throw new InvalidOperationException("boom"));
            EventBus<PingEvent>.Subscribe(_a);
#if UNITY_5_3_OR_NEWER
            LogAssert.Expect(LogType.Exception, new Regex("boom"));
#endif
            EventBus<PingEvent>.Raise(default);
            Assert.AreEqual(1, _aCalls);
        }

        [Test]
        public void NestedRaise_OfSameEventType_IsSupported()
        {
            int depth = 0;
            EventBus<PingEvent>.Subscribe((in PingEvent e) =>
            {
                depth++;
                if (e.Value < 3) EventBus<PingEvent>.Raise(new PingEvent { Value = e.Value + 1 });
            });
            EventBus<PingEvent>.Raise(new PingEvent { Value = 0 });
            Assert.AreEqual(4, depth);
        }
    }

    public sealed class DeterministicRandomTests
    {
        [Test]
        public void SameSeed_SameSequence()
        {
            var a = new DeterministicRandom(1234);
            var b = new DeterministicRandom(1234);
            for (int i = 0; i < 100; i++) Assert.AreEqual(a.NextUInt(), b.NextUInt());
        }

        [Test]
        public void ZeroSeed_StillProducesValues()
        {
            var random = new DeterministicRandom(0);
            Assert.AreNotEqual(0u, random.NextUInt());
        }

        [Test]
        public void Ranges_StayInBounds()
        {
            var random = new DeterministicRandom(99);
            for (int i = 0; i < 10000; i++)
            {
                float f = random.NextFloat01();
                Assert.That(f, Is.GreaterThanOrEqualTo(0f).And.LessThan(1f));
                int n = random.Range(3, 7);
                Assert.That(n, Is.InRange(3, 6));
            }
        }

        [Test]
        public void HashString_IsStableFnv1a()
        {
            Assert.AreEqual(0xE40C292Cu, DeterministicRandom.HashString("a"));
            Assert.AreEqual(DeterministicRandom.HashString("player-1"), DeterministicRandom.HashString("player-1"));
        }
    }

    public sealed class TimeTests
    {
        [Test]
        public void GameDay_RollsOverAtResetHour()
        {
            var before = new DateTime(2026, 10, 2, 3, 59, 59, DateTimeKind.Utc);
            var after = new DateTime(2026, 10, 2, 4, 0, 0, DateTimeKind.Utc);
            Assert.AreEqual(GameDay.Index(before, 4) + 1, GameDay.Index(after, 4));
            Assert.AreEqual(GameDay.Index(before, 0), GameDay.Index(after, 0));
        }

        [Test]
        public void GameDay_StartOfAndUntilNextReset_AreConsistent()
        {
            var now = new DateTime(2026, 10, 2, 17, 30, 0, DateTimeKind.Utc);
            int day = GameDay.Index(now, 6);
            Assert.That(GameDay.StartOf(day, 6), Is.LessThanOrEqualTo(now));
            Assert.That(GameDay.StartOf(day + 1, 6), Is.GreaterThan(now));
            Assert.AreEqual(TimeSpan.FromHours(12.5), GameDay.UntilNextReset(now, 6));
        }

        [Test]
        public void DeviceTimeProvider_DetectsClockRollback()
        {
            long future = DateTime.UtcNow.AddHours(3).Ticks;
            var rolledBack = new DeviceTimeProvider(() => future);
            Assert.IsFalse(rolledBack.IsTrusted);

            long past = DateTime.UtcNow.AddHours(-3).Ticks;
            long saved = 0;
            var normal = new DeviceTimeProvider(() => past, ticks => saved = ticks);
            Assert.IsTrue(normal.IsTrusted);
            _ = normal.UtcNow;
            Assert.That(saved, Is.GreaterThan(past), "high-water mark advances");
        }

        [Test]
        public void ServerSyncedTimeProvider_AdvancesOnMonotonicClock()
        {
            double monotonic = 100.0;
            var provider = new ServerSyncedTimeProvider(() => monotonic);
            Assert.IsFalse(provider.IsTrusted);

            var serverTime = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
            provider.Sync(serverTime, roundTripSeconds: 0.2);
            monotonic += 60.0;
            Assert.IsTrue(provider.IsTrusted);
            Assert.AreEqual(serverTime.AddSeconds(60.1), provider.UtcNow);
        }
    }
}
