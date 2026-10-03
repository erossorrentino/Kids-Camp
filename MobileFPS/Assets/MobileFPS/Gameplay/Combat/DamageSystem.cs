using MobileFPS.Core;

namespace MobileFPS.Combat
{
    /// <summary>
    /// The single choke point where damage becomes game state. It runs on the
    /// authority (server online; this device offline or in loopback testing) and
    /// turns results into events: progression, challenges, kill feed, audio,
    /// haptics and analytics all subscribe instead of being called directly.
    /// </summary>
    public static class DamageSystem
    {
        /// <summary>Applies damage to <see cref="DamageInfo.Victim"/>. Returns the amount removed.</summary>
        public static float Apply(in DamageInfo info)
        {
            if (!CombatEntity.TryGet(info.Victim, out CombatEntity victim) || victim.Health == null) return 0f;

            Health health = victim.Health;
            bool wasAlive = !health.IsDead;
            float applied = health.ApplyDamage(info);
            if (applied <= 0f) return 0f;

            CombatEntity.TryGet(info.Attacker, out CombatEntity attacker);
            bool attackerIsLocal = attacker != null && attacker.IsLocalPlayer;
            bool killed = wasAlive && health.IsDead;

            EventBus<DamageAppliedEvent>.Raise(new DamageAppliedEvent
            {
                Attacker = info.Attacker,
                Victim = info.Victim,
                WeaponId = info.WeaponId,
                WeaponClass = info.WeaponClass,
                Zone = info.Zone,
                Amount = applied,
                RemainingHealth = health.Current,
                Point = info.Point,
                IsKill = killed,
                AttackerIsLocalPlayer = attackerIsLocal,
                VictimIsLocalPlayer = victim.IsLocalPlayer,
            });

            if (attackerIsLocal)
            {
                EventBus<HitMarkerEvent>.Raise(new HitMarkerEvent
                {
                    IsHeadshot = info.Zone == HitZone.Head,
                    IsKill = killed,
                    Confirmed = true,
                    Damage = applied,
                });
            }

            if (victim.IsLocalPlayer)
            {
                EventBus<LocalPlayerDamagedEvent>.Raise(new LocalPlayerDamagedEvent
                {
                    SourcePosition = info.SourcePosition,
                    Amount = applied,
                    RemainingHealth01 = health.Normalized,
                });
            }

            if (killed)
            {
                KillFlags flags = info.Flags;
                if (info.Zone == HitZone.Head) flags |= KillFlags.Headshot;
                EventBus<KillEvent>.Raise(new KillEvent
                {
                    Killer = info.Attacker,
                    Victim = info.Victim,
                    WeaponId = info.WeaponId,
                    WeaponClass = info.WeaponClass,
                    Flags = flags,
                    Distance = info.Distance,
                    KillerIsLocalPlayer = attackerIsLocal,
                    VictimIsLocalPlayer = victim.IsLocalPlayer,
                });
            }

            return applied;
        }
    }
}
