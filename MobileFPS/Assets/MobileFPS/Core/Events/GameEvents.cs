using UnityEngine;

namespace MobileFPS.Core
{
    // Cross-module events. Gameplay raises them; Meta (progression, challenges,
    // rewards), UI, audio and analytics listen. All are small structs passed by
    // `in`, so raising them in combat allocates nothing.

    /// <summary>Raised by the authority after damage is applied (server online, local offline).</summary>
    public struct DamageAppliedEvent : IGameEvent
    {
        public EntityId Attacker;
        public EntityId Victim;
        public string WeaponId;
        public WeaponClass WeaponClass;
        public HitZone Zone;
        public float Amount;
        public float RemainingHealth;
        public Vector3 Point;
        public bool IsKill;
        public bool AttackerIsLocalPlayer;
        public bool VictimIsLocalPlayer;
    }

    /// <summary>Raised once per confirmed kill. Drives XP, challenges, kill feed and streaks.</summary>
    public struct KillEvent : IGameEvent
    {
        public EntityId Killer;
        public EntityId Victim;
        public string WeaponId;
        public WeaponClass WeaponClass;
        public KillFlags Flags;
        public float Distance;
        public bool KillerIsLocalPlayer;
        public bool VictimIsLocalPlayer;
    }

    /// <summary>
    /// Local-player hit feedback (hit marker, haptic tick, hit sound). Raised on
    /// client prediction for zero perceived latency; <see cref="Confirmed"/> tells
    /// the UI whether the authority has already validated it.
    /// </summary>
    public struct HitMarkerEvent : IGameEvent
    {
        public bool IsHeadshot;
        public bool IsKill;
        public bool Confirmed;
        public float Damage;
    }

    /// <summary>The local player was damaged (damage-direction indicator, vignette, haptics).</summary>
    public struct LocalPlayerDamagedEvent : IGameEvent
    {
        public Vector3 SourcePosition;
        public float Amount;
        public float RemainingHealth01;
    }

    public struct MatchStartedEvent : IGameEvent
    {
        public string MatchId;
        public string ModeId;
    }

    /// <summary>The one event the meta layer needs: every reward, XP and challenge update hangs off this.</summary>
    public struct MatchEndedEvent : IGameEvent
    {
        public MatchSummary Summary;
    }

    public struct PlayerSpawnedEvent : IGameEvent
    {
        public EntityId Entity;
        public bool IsLocalPlayer;
    }

    /// <summary>Raised by the performance governor when the device can't hold its frame budget.</summary>
    public struct PerformanceTierChangedEvent : IGameEvent
    {
        public int Tier;            // 0 = highest quality
        public float RenderScale;   // 0.5 - 1.0, for pipelines that support render scale
    }
}
