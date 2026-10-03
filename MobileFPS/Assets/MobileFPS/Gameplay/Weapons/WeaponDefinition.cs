using System;
using MobileFPS.Core;
using MobileFPS.Effects;
using UnityEngine;

namespace MobileFPS.Weapons
{
    public enum FireMode : byte
    {
        FullAuto,
        SemiAuto,
        Burst,
    }

    /// <summary>Damage bracket: shots within <see cref="maxDistance"/> deal <see cref="damage"/> (body, before zone multipliers).</summary>
    [Serializable]
    public struct DamageRange
    {
        public float maxDistance;
        public float damage;

        public DamageRange(float maxDistance, float damage)
        {
            this.maxDistance = maxDistance;
            this.damage = damage;
        }
    }

    [Serializable]
    public sealed class HitZoneMultipliers
    {
        public float head = 1.4f;
        public float upperTorso = 1.1f;
        public float lowerTorso = 1f;
        public float arm = 0.9f;
        public float leg = 0.9f;

        public float Get(HitZone zone)
        {
            switch (zone)
            {
                case HitZone.Head: return head;
                case HitZone.UpperTorso: return upperTorso;
                case HitZone.LowerTorso: return lowerTorso;
                case HitZone.Arm: return arm;
                case HitZone.Leg: return leg;
                default: return 1f;
            }
        }
    }

    /// <summary>All spread values are cone half-angles in degrees.</summary>
    [Serializable]
    public sealed class SpreadSettings
    {
        public float hipMin = 2.2f;
        public float hipMax = 6f;
        [Tooltip("Bloom added per hip-fire shot.")]
        public float perShot = 0.45f;
        [Tooltip("Bloom recovered per second.")]
        public float recoveryPerSecond = 9f;
        [Tooltip("Spread at full ADS.")]
        public float ads = 0.1f;
        [Tooltip("Added at full sprint speed (scaled by speed).")]
        public float movePenalty = 1.6f;
        public float airPenalty = 4f;
        public float crouchMultiplier = 0.8f;
        public float slideMultiplier = 1.25f;
    }

    [Serializable]
    public sealed class HandlingSettings
    {
        [Tooltip("Seconds from hip to full ADS.")]
        public float adsTime = 0.24f;
        [Tooltip("FOV multiplier at full ADS (0.8 = 1.25x).")]
        public float adsFovMultiplier = 0.8f;
        [Tooltip("Extra look-sensitivity multiplier while scoped (snipers ~0.6).")]
        public float adsSensitivityMultiplier = 1f;
        [Tooltip("Movement speed multiplier at full ADS.")]
        public float adsMoveSpeedMultiplier = 0.55f;
        [Tooltip("Weapon weight: always-on movement multiplier.")]
        public float moveSpeedMultiplier = 0.97f;
        [Tooltip("Delay between leaving sprint and being able to fire. The genre's main SMG-vs-sniper balance lever.")]
        public float sprintToFireTime = 0.2f;
        public float equipTime = 0.45f;
        public float tacticalReloadTime = 1.9f;
        public float emptyReloadTime = 2.5f;
        [Tooltip("Shotgun-style one-round-at-a-time reload, interruptible by firing.")]
        public bool perRoundReload;
        public float perRoundReloadTime = 0.5f;
    }

    [Serializable]
    public sealed class AmmoSettings
    {
        public int magazineSize = 30;
        public int startingReserve = 150;
        public int maxReserve = 240;
    }

    [Serializable]
    public sealed class RecoilSettings
    {
        public RecoilPattern pattern;
        public float scale = 1f;
        [Tooltip("Recoil multiplier at full ADS.")]
        public float adsMultiplier = 0.8f;
        [Tooltip("Share of kick that permanently moves the aim (player must pull down).")]
        [Range(0f, 1f)] public float permanentFraction = 0.35f;
        [Tooltip("Seconds without firing before the pattern restarts at shot 0.")]
        public float patternResetTime = 0.22f;

        [Header("Cosmetic")]
        public float viewKickBack = 0.03f;
        public float viewKickUpDegrees = 2.5f;
        public float viewKickSideDegrees = 1f;
        public float cameraPunchDegrees = 1.4f;
        [Range(0f, 1f)] public float traumaPerShot = 0f;
    }

    [Serializable]
    public sealed class ProjectileSettings
    {
        [Tooltip("Off = hitscan (instant). On = simulated projectile (launchers, slow bolts).")]
        public bool useProjectile;
        public GameObject visualPrefab;
        public float speed = 45f;
        public float gravityScale = 1f;
        public float radius = 0.05f;
        public float lifetime = 6f;
        [Tooltip("0 = no explosion (direct hit only).")]
        public float explosionRadius;
        public float explosionDamage;
        [Tooltip("Projectiles travelling less than this don't explode (anti point-blank rocket spam).")]
        public float armingDistance;
    }

    [Serializable]
    public sealed class WeaponPresentation
    {
        [Tooltip("First-person viewmodel prefab with a WeaponView component.")]
        public GameObject viewModelPrefab;
        [Tooltip("Optional per-weapon override; otherwise the scene's default library is used.")]
        public ImpactEffectLibrary impactOverride;
        [Tooltip("Draw a tracer for every Nth round (0 = none). Fewer tracers = less overdraw on mobile GPUs.")]
        public int tracerEveryNthRound = 2;
        public AudioClip fireSound;
        public AudioClip dryFireSound;
        public AudioClip reloadSound;
        [Range(0f, 1f)] public float fireVolume = 0.9f;
    }

    /// <summary>
    /// Data-driven weapon: every number a designer tunes. One asset per gun;
    /// gameplay code never special-cases a weapon. Balance patches are data
    /// changes, and with Addressables/remote config they can ship without a store
    /// update.
    ///
    /// Treat as read-only at runtime. Fields are public so editor tooling and tests
    /// can author them with compile-time checking. Runtime numbers after attachments
    /// live in <see cref="WeaponStats"/>.
    /// </summary>
    [CreateAssetMenu(menuName = "MobileFPS/Weapons/Weapon Definition", fileName = "Weapon_")]
    public sealed class WeaponDefinition : ScriptableObject
    {
        [Header("Identity")]
        [Tooltip("Stable id used in saves, analytics, loadouts and store entitlements. Never rename after launch.")]
        public string weaponId = "weapon_id";
        public string displayName = "Weapon";
        public WeaponClass weaponClass = WeaponClass.AssaultRifle;
        public Sprite icon;
        public int unlockAccountLevel = 1;

        [Header("Firing")]
        public FireMode fireMode = FireMode.FullAuto;
        public float roundsPerMinute = 750f;
        public int burstCount = 3;
        public float burstRoundsPerMinute = 900f;
        public float burstCooldown = 0.25f;
        [Tooltip(">1 for shotguns. Each pellet gets its own deterministic spread.")]
        public int pelletsPerShot = 1;

        [Header("Damage")]
        [Tooltip("Ascending maxDistance brackets. Beyond the last bracket, its damage applies until maxRange.")]
        public DamageRange[] damageRanges = { new DamageRange(20f, 28f), new DamageRange(40f, 24f), new DamageRange(150f, 20f) };
        public HitZoneMultipliers zoneMultipliers = new HitZoneMultipliers();
        public float maxRange = 150f;
        [Tooltip("Penetration budget spent passing through surfaces (see SurfaceLookup costs).")]
        public float penetrationPower = 1f;
        [Tooltip("Kills beyond this distance count as longshots (medals, challenges).")]
        public float longshotDistance = 40f;

        public SpreadSettings spread = new SpreadSettings();
        public HandlingSettings handling = new HandlingSettings();
        public AmmoSettings ammo = new AmmoSettings();
        public RecoilSettings recoil = new RecoilSettings();
        public ProjectileSettings projectile = new ProjectileSettings();
        public WeaponPresentation presentation = new WeaponPresentation();

        public float SecondsBetweenShots => 60f / Mathf.Max(1f, roundsPerMinute);
        public float SecondsBetweenBurstShots => 60f / Mathf.Max(1f, burstRoundsPerMinute);

        /// <summary>Base (body) damage per pellet at <paramref name="distance"/>; 0 beyond max range.</summary>
        public float GetBaseDamage(float distance)
        {
            if (distance > maxRange || damageRanges == null || damageRanges.Length == 0) return 0f;
            for (int i = 0; i < damageRanges.Length; i++)
            {
                if (distance <= damageRanges[i].maxDistance) return damageRanges[i].damage;
            }
            return damageRanges[damageRanges.Length - 1].damage;
        }

        /// <summary>Shots to kill a target at distance (all pellets hitting the given zone).</summary>
        public int ShotsToKill(float distance, HitZone zone, float targetHealth = 100f)
        {
            float perShot = GetBaseDamage(distance) * zoneMultipliers.Get(zone) * Mathf.Max(1, pelletsPerShot);
            if (perShot <= 0f) return int.MaxValue;
            return Mathf.CeilToInt(targetHealth / perShot - 1e-4f);
        }

        /// <summary>Time-to-kill in milliseconds (first shot at t = 0). The number competitive balance revolves around.</summary>
        public float TimeToKillMs(float distance, HitZone zone, float targetHealth = 100f)
        {
            int shots = ShotsToKill(distance, zone, targetHealth);
            if (shots == int.MaxValue) return float.PositiveInfinity;
            if (fireMode == FireMode.Burst)
            {
                int gaps = shots - 1;
                int gapsBetweenBursts = gaps / Mathf.Max(1, burstCount);
                int gapsWithinBursts = gaps - gapsBetweenBursts;
                float betweenBursts = Mathf.Max(burstCooldown, SecondsBetweenBurstShots);
                return (gapsWithinBursts * SecondsBetweenBurstShots + gapsBetweenBursts * betweenBursts) * 1000f;
            }
            return (shots - 1) * SecondsBetweenShots * 1000f;
        }

        private void OnValidate()
        {
            roundsPerMinute = Mathf.Max(1f, roundsPerMinute);
            burstCount = Mathf.Max(1, burstCount);
            pelletsPerShot = Mathf.Max(1, pelletsPerShot);
            maxRange = Mathf.Max(1f, maxRange);
            if (ammo != null) ammo.magazineSize = Mathf.Max(1, ammo.magazineSize);
            if (damageRanges != null && damageRanges.Length > 1)
            {
                Array.Sort(damageRanges, (a, b) => a.maxDistance.CompareTo(b.maxDistance));
            }
            if (string.IsNullOrWhiteSpace(weaponId)) weaponId = name.ToLowerInvariant().Replace(' ', '_');
        }
    }
}
