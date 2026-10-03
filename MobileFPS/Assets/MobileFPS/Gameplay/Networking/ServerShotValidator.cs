using System;
using MobileFPS.Core;
using MobileFPS.Weapons;
using UnityEngine;

namespace MobileFPS.Networking
{
    /// <summary>
    /// What the server knows about a shooter, kept current by the server's own
    /// simulation (never by client claims).
    /// </summary>
    public sealed class ShooterState
    {
        public EntityId Id;
        public bool Alive = true;
        public Vector3 EyePosition;
        public float Speed;
        public ushort EquippedWeapon = ushort.MaxValue;
        public WeaponStats Stats;
        public int AmmoInMagazine;

        // Validation bookkeeping.
        internal bool HasFired;
        internal uint LastSequence;
        internal double LastViewTime;
        internal double LastServerTime;
        internal float Tokens;

        /// <summary>Anti-cheat telemetry: a high reject ratio flags a player for review.</summary>
        public int AcceptedShots;
        public int RejectedShots;

        public void Equip(ushort weaponNetId, WeaponStats stats, int ammoInMagazine)
        {
            EquippedWeapon = weaponNetId;
            Stats = stats;
            AmmoInMagazine = ammoInMagazine;
            HasFired = false; // weapon swap resets cadence checks
            Tokens = 0f;
        }
    }

    public enum ShotVerdict : byte
    {
        Accepted,
        RejectedNotAlive,
        RejectedWrongWeapon,
        RejectedOutOfOrder,
        RejectedStale,
        RejectedFromFuture,
        RejectedFireRate,
        RejectedNoAmmo,
        RejectedOrigin,
        RejectedDirection,
        RejectedSpread,
    }

    /// <summary>
    /// Server-side sanity checks for a <see cref="ShotRequest"/> before it is
    /// resolved against rewound hitboxes. Each check closes a specific cheat:
    ///
    /// - <b>Sequence</b>: replayed or duplicated packets.
    /// - <b>Time window</b>: "backtrack" cheats that claim an old view time to
    ///   shoot where an enemy was. The rewind is capped (high-ping players lead
    ///   their targets past the cap, like every shooter).
    /// - <b>Cadence, two ways</b>: the client-time interval stops rapid-fire mods;
    ///   a server-time token bucket stops a client that also lies about time.
    /// - <b>Ammo</b>: infinite-ammo mods.
    /// - <b>Origin</b>: shooting from somewhere the server never let you be (teleport/peek hacks).
    /// - <b>Spread floor</b>: no-spread mods. Spread is reproduced from the seed,
    ///   so the client can't pick favorable pellet directions either.
    ///
    /// Aimbots pass all of these by design (the aim is "legit"); catch them with
    /// statistical detection on the telemetry this produces.
    /// </summary>
    public sealed class ServerShotValidator
    {
        [Serializable]
        public sealed class Settings
        {
            [Tooltip("Maximum lag compensation. ~250-300 ms is the genre norm; beyond it, players lead targets.")]
            public float maxRewindSeconds = 0.3f;
            [Tooltip("Shots older than this are dropped entirely.")]
            public float maxStaleSeconds = 1.5f;
            [Tooltip("Allowed clock skew into the future.")]
            public float maxFutureSeconds = 0.05f;
            [Tooltip("Base tolerance between claimed and server-known eye position (meters).")]
            public float maxOriginError = 0.75f;
            [Tooltip("Fraction of the fire interval forgiven (timer quantization, frame pacing).")]
            public float fireRateTolerance = 0.08f;
            [Tooltip("Token bucket burst size: absorbs network jitter bunching shots together.")]
            public float tokenBucketCapacity = 4f;
            [Tooltip("Claimed spread may not be below this fraction of the legal minimum.")]
            public float minSpreadFraction = 0.85f;
        }

        private readonly Settings _settings;

        public ServerShotValidator(Settings settings = null)
        {
            _settings = settings ?? new Settings();
        }

        public Settings Config => _settings;

        /// <param name="rewindTime">Server time to rewind hitboxes to (valid when Accepted).</param>
        public ShotVerdict Validate(in ShotRequest shot, ShooterState shooter, double serverNow, out double rewindTime)
        {
            rewindTime = serverNow;
            ShotVerdict verdict = Check(shot, shooter, serverNow);
            if (verdict != ShotVerdict.Accepted)
            {
                shooter.RejectedShots++;
                return verdict;
            }

            shooter.Tokens -= 1f;
            shooter.HasFired = true;
            shooter.LastSequence = shot.Sequence;
            shooter.LastViewTime = shot.ViewTime;
            shooter.AmmoInMagazine--;
            shooter.AcceptedShots++;

            rewindTime = Math.Max(serverNow - _settings.maxRewindSeconds, Math.Min(shot.ViewTime, serverNow));
            return ShotVerdict.Accepted;
        }

        private ShotVerdict Check(in ShotRequest shot, ShooterState shooter, double serverNow)
        {
            if (!shooter.Alive) return ShotVerdict.RejectedNotAlive;
            if (shooter.Stats == null || shot.WeaponNetId != shooter.EquippedWeapon) return ShotVerdict.RejectedWrongWeapon;
            if (shooter.HasFired && shot.Sequence <= shooter.LastSequence) return ShotVerdict.RejectedOutOfOrder;
            if (shot.ViewTime > serverNow + _settings.maxFutureSeconds) return ShotVerdict.RejectedFromFuture;
            if (shot.ViewTime < serverNow - _settings.maxStaleSeconds) return ShotVerdict.RejectedStale;

            float directionLength = shot.Direction.magnitude;
            if (float.IsNaN(directionLength) || Mathf.Abs(directionLength - 1f) > 0.01f) return ShotVerdict.RejectedDirection;

            WeaponDefinition definition = shooter.Stats.Definition;
            double interval = definition.fireMode == FireMode.Burst ? definition.SecondsBetweenBurstShots : definition.SecondsBetweenShots;

            // 1) Client-time cadence.
            if (shooter.HasFired && shot.ViewTime - shooter.LastViewTime < interval * (1.0 - _settings.fireRateTolerance))
            {
                return ShotVerdict.RejectedFireRate;
            }

            // 2) Server-time token bucket (refills at the weapon's max rate plus tolerance).
            double elapsed = shooter.HasFired ? Math.Max(0.0, serverNow - shooter.LastServerTime) : double.MaxValue;
            double refill = elapsed * (1.0 + _settings.fireRateTolerance) / interval;
            shooter.Tokens = (float)Math.Min(_settings.tokenBucketCapacity, shooter.Tokens + refill);
            shooter.LastServerTime = serverNow;
            if (shooter.Tokens < 1f) return ShotVerdict.RejectedFireRate;

            if (shooter.AmmoInMagazine <= 0) return ShotVerdict.RejectedNoAmmo;

            // Origin: allow movement during the latency window.
            float latency = (float)Math.Max(0.0, serverNow - shot.ViewTime);
            float allowedError = _settings.maxOriginError + shooter.Speed * (latency + 0.1f);
            if ((shot.Origin - shooter.EyePosition).sqrMagnitude > allowedError * allowedError) return ShotVerdict.RejectedOrigin;

            // Spread floor. The server's own ADS tracking should feed this flag in
            // production; the ADS minimum is the weakest legal floor.
            bool aiming = (shot.Flags & ShotFlags.Aiming) != 0;
            float legalMinimum = aiming
                ? definition.spread.ads
                : definition.spread.hipMin * shooter.Stats.HipSpreadMultiplier * Mathf.Min(1f, definition.spread.crouchMultiplier);
            if (shot.SpreadDegrees + 0.001f < legalMinimum * _settings.minSpreadFraction) return ShotVerdict.RejectedSpread;

            return ShotVerdict.Accepted;
        }
    }
}
