using System;

namespace MobileFPS.Core
{
    // Types shared between Gameplay and Meta. They live in Core so the
    // progression/monetization assembly can react to combat (via the EventBus)
    // without referencing a single gameplay type. That boundary keeps compile
    // times low and lets the meta layer be unit-tested and server-ported alone.

    public enum WeaponClass : byte
    {
        AssaultRifle,
        SubmachineGun,
        Shotgun,
        LightMachineGun,
        MarksmanRifle,
        SniperRifle,
        Pistol,
        Launcher,
        Melee,
    }

    public enum HitZone : byte
    {
        Head,
        UpperTorso,
        LowerTorso,
        Arm,
        Leg,
    }

    public enum TeamId : byte
    {
        None = 0,   // free-for-all: everyone is hostile
        Alpha = 1,
        Bravo = 2,
    }

    [Flags]
    public enum KillFlags : ushort
    {
        None = 0,
        Headshot = 1 << 0,
        Longshot = 1 << 1,      // beyond the weapon class's longshot distance
        Penetration = 1 << 2,   // through cover
        WhileSliding = 1 << 3,
        WhileAirborne = 1 << 4,
        Explosive = 1 << 5,
        Revenge = 1 << 6,
        FirstBlood = 1 << 7,
        Hipfire = 1 << 8,
    }

    public enum MatchOutcome : byte
    {
        Loss,
        Draw,
        Win,
    }

    /// <summary>End-of-match stats for the local player: the single input the meta layer needs to grant rewards.</summary>
    [Serializable]
    public struct MatchSummary
    {
        public string MatchId;          // unique per match; makes reward grants idempotent
        public string ModeId;           // "tdm", "ffa", "range"...
        public MatchOutcome Outcome;
        public int Kills;
        public int Deaths;
        public int Assists;
        public int Headshots;
        public int Score;
        public int LongestStreak;
        public float DurationSeconds;
        public string MostUsedWeaponId;
        public bool CompletedMatch;     // false when the player quit early: no completion bonus
    }

    /// <summary>
    /// Stable identifier for anything that can shoot or be shot. Ids are assigned by
    /// the match/session (server-authoritative online) and are what travel in packets.
    /// </summary>
    public readonly struct EntityId : IEquatable<EntityId>
    {
        public readonly int Value;
        public EntityId(int value) { Value = value; }
        public static readonly EntityId None = new EntityId(0);
        public bool IsValid => Value != 0;
        public bool Equals(EntityId other) => Value == other.Value;
        public override bool Equals(object obj) => obj is EntityId other && Equals(other);
        public override int GetHashCode() => Value;
        public override string ToString() => $"Entity#{Value}";
        public static bool operator ==(EntityId a, EntityId b) => a.Value == b.Value;
        public static bool operator !=(EntityId a, EntityId b) => a.Value != b.Value;
    }
}
