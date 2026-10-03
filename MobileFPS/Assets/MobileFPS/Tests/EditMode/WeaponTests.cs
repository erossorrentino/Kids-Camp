using MobileFPS.Core;
using MobileFPS.Weapons;
using NUnit.Framework;
using UnityEngine;

namespace MobileFPS.Tests
{
    public sealed class WeaponStatsTests
    {
        private WeaponDefinition _rifle;

        [SetUp]
        public void SetUp()
        {
            _rifle = ScriptableObject.CreateInstance<WeaponDefinition>();
            _rifle.weaponId = "test_rifle";
            _rifle.damageRanges = new[] { new DamageRange(25f, 26f), new DamageRange(45f, 22f), new DamageRange(150f, 18f) };
            _rifle.handling = new HandlingSettings { adsTime = 0.25f, adsFovMultiplier = 0.8f, moveSpeedMultiplier = 1f };
            _rifle.ammo = new AmmoSettings { magazineSize = 30 };
        }

        private static AttachmentDefinition Attachment(AttachmentSlot slot, params StatModifier[] modifiers)
        {
            AttachmentDefinition attachment = ScriptableObject.CreateInstance<AttachmentDefinition>();
            attachment.attachmentId = $"att_{slot}_{modifiers.Length}";
            attachment.slot = slot;
            attachment.modifiers = modifiers;
            return attachment;
        }

        [Test]
        public void NoAttachments_MatchesDefinition()
        {
            WeaponStats stats = WeaponStats.Build(_rifle);
            Assert.AreEqual(0.25f, stats.AdsTime, 1e-6f);
            Assert.AreEqual(30, stats.MagazineSize);
            Assert.AreEqual(0.8f, stats.AdsFovMultiplier, 1e-6f);
        }

        [Test]
        public void Modifiers_StackMultiplicatively()
        {
            WeaponStats stats = WeaponStats.Build(_rifle, new[]
            {
                Attachment(AttachmentSlot.Stock, new StatModifier(WeaponStat.AdsTime, -10f)),
                Attachment(AttachmentSlot.RearGrip, new StatModifier(WeaponStat.AdsTime, -10f)),
                Attachment(AttachmentSlot.Magazine, new StatModifier(WeaponStat.MagazineSize, 40f)),
            });
            Assert.AreEqual(0.25f * 0.9f * 0.9f, stats.AdsTime, 1e-5f);
            Assert.AreEqual(42, stats.MagazineSize);
        }

        [Test]
        public void SameSlot_LastAttachmentWins()
        {
            WeaponStats stats = WeaponStats.Build(_rifle, new[]
            {
                Attachment(AttachmentSlot.Muzzle, new StatModifier(WeaponStat.VerticalRecoil, -50f)),
                Attachment(AttachmentSlot.Muzzle, new StatModifier(WeaponStat.VerticalRecoil, -10f)),
            });
            Assert.AreEqual(1, stats.Attachments.Count);
            Assert.AreEqual(0.9f, stats.VerticalRecoilMultiplier, 1e-5f);
        }

        [Test]
        public void ExtremeModifiers_AreClamped()
        {
            WeaponStats stats = WeaponStats.Build(_rifle, new[] { Attachment(AttachmentSlot.Muzzle, new StatModifier(WeaponStat.VerticalRecoil, -95f)) });
            Assert.AreEqual(0.3f, stats.VerticalRecoilMultiplier, 1e-6f);
        }

        [Test]
        public void IncompatibleAttachment_IsSkipped()
        {
            AttachmentDefinition sniperOnly = Attachment(AttachmentSlot.Optic, new StatModifier(WeaponStat.AdsZoom, 300f));
            sniperOnly.compatibleWeaponIds = new[] { "some_sniper" };
            WeaponStats stats = WeaponStats.Build(_rifle, new[] { sniperOnly });
            Assert.AreEqual(0, stats.Attachments.Count);
            Assert.AreEqual(0.8f, stats.AdsFovMultiplier, 1e-6f);
        }

        [Test]
        public void RangeAttachment_StretchesDamageBrackets()
        {
            WeaponStats plain = WeaponStats.Build(_rifle);
            WeaponStats longBarrel = WeaponStats.Build(_rifle, new[] { Attachment(AttachmentSlot.Barrel, new StatModifier(WeaponStat.DamageRange, 20f)) });
            Assert.AreEqual(22f, plain.DamageAt(28f, HitZone.LowerTorso), 1e-5f);
            Assert.AreEqual(26f, longBarrel.DamageAt(28f, HitZone.LowerTorso), 1e-5f); // 28 / 1.2 = 23.3 m effective
        }

        [Test]
        public void ZoomAttachment_NarrowsAdsFov()
        {
            WeaponStats stats = WeaponStats.Build(_rifle, new[] { Attachment(AttachmentSlot.Optic, new StatModifier(WeaponStat.AdsZoom, 100f)) });
            Assert.AreEqual(0.4f, stats.AdsFovMultiplier, 1e-5f);
        }
    }

    public sealed class TimeToKillTests
    {
        [Test]
        public void AutomaticRifle_FourShotKill_At750Rpm_Is240ms()
        {
            WeaponDefinition rifle = ScriptableObject.CreateInstance<WeaponDefinition>();
            rifle.roundsPerMinute = 750f;
            rifle.damageRanges = new[] { new DamageRange(25f, 26f) };
            Assert.AreEqual(4, rifle.ShotsToKill(10f, HitZone.UpperTorso)); // 26 x 1.1 = 28.6
            Assert.AreEqual(240f, rifle.TimeToKillMs(10f, HitZone.UpperTorso), 0.01f);
        }

        [Test]
        public void BurstWeapon_IncludesCooldownBetweenBursts()
        {
            WeaponDefinition burst = ScriptableObject.CreateInstance<WeaponDefinition>();
            burst.fireMode = FireMode.Burst;
            burst.burstCount = 3;
            burst.burstRoundsPerMinute = 900f;
            burst.burstCooldown = 0.25f;
            burst.damageRanges = new[] { new DamageRange(50f, 20f) };
            Assert.AreEqual(5, burst.ShotsToKill(10f, HitZone.LowerTorso));
            // 4 gaps: 3 inside bursts (66.7 ms) + 1 between bursts (250 ms)
            Assert.AreEqual(3f * 1000f / 15f + 250f, burst.TimeToKillMs(10f, HitZone.LowerTorso), 0.01f);
        }

        [Test]
        public void Shotgun_CountsAllPellets_AndRespectsMaxRange()
        {
            WeaponDefinition shotgun = ScriptableObject.CreateInstance<WeaponDefinition>();
            shotgun.pelletsPerShot = 8;
            shotgun.maxRange = 25f;
            shotgun.damageRanges = new[] { new DamageRange(6f, 20f), new DamageRange(25f, 5f) };
            shotgun.zoneMultipliers = new HitZoneMultipliers { lowerTorso = 1f };
            Assert.AreEqual(1, shotgun.ShotsToKill(5f, HitZone.LowerTorso));
            Assert.AreEqual(0f, shotgun.TimeToKillMs(5f, HitZone.LowerTorso));
            Assert.AreEqual(int.MaxValue, shotgun.ShotsToKill(30f, HitZone.LowerTorso));
        }
    }

    public sealed class RecoilPatternTests
    {
        [Test]
        public void FollowsPattern_ThenLoops()
        {
            RecoilPattern pattern = ScriptableObject.CreateInstance<RecoilPattern>();
            pattern.kicks = new[] { new Vector2(0f, 1f), new Vector2(0.1f, 2f), new Vector2(0.2f, 3f), new Vector2(0.3f, 4f) };
            pattern.randomness = Vector2.zero;
            pattern.firstShotMultiplier = 0.5f;
            pattern.loopFromIndex = 2;
            var random = new DeterministicRandom(1);

            Assert.AreEqual(new Vector2(0f, 0.5f), pattern.GetKick(0, ref random));
            Assert.AreEqual(new Vector2(0.1f, 2f), pattern.GetKick(1, ref random));
            Assert.AreEqual(new Vector2(0.2f, 3f), pattern.GetKick(4, ref random));
            Assert.AreEqual(new Vector2(0.3f, 4f), pattern.GetKick(5, ref random));
            Assert.AreEqual(new Vector2(0.2f, 3f), pattern.GetKick(6, ref random));
        }

        [Test]
        public void WithoutLoop_RepeatsLastKick()
        {
            RecoilPattern pattern = ScriptableObject.CreateInstance<RecoilPattern>();
            pattern.kicks = new[] { new Vector2(0f, 1f), new Vector2(0.5f, 1.5f) };
            pattern.randomness = Vector2.zero;
            pattern.loopFromIndex = -1;
            var random = new DeterministicRandom(1);
            Assert.AreEqual(new Vector2(0.5f, 1.5f), pattern.GetKick(50, ref random));
        }

        [Test]
        public void GeneratedClimb_IsDeterministicAndClimbs()
        {
            Vector2[] a = RecoilPattern.GenerateClimb(20, 1f, 0.3f, 7u);
            Vector2[] b = RecoilPattern.GenerateClimb(20, 1f, 0.3f, 7u);
            Assert.AreEqual(a, b);
            foreach (Vector2 kick in a) Assert.That(kick.y, Is.GreaterThan(0f));
        }
    }
}
