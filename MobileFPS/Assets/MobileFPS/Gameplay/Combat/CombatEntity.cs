using System.Collections.Generic;
using MobileFPS.Core;
using UnityEngine;

namespace MobileFPS.Combat
{
    /// <summary>
    /// Identity of anything that participates in combat: id, team, name, and
    /// whether it's the local player or a bot. The id is what travels in network
    /// packets and events; never send object references.
    /// </summary>
    [DisallowMultipleComponent]
    [DefaultExecutionOrder(-300)]
    public sealed class CombatEntity : MonoBehaviour
    {
        private static readonly Dictionary<int, CombatEntity> s_byId = new Dictionary<int, CombatEntity>(32);
        private static int s_nextOfflineId = 1;

        static CombatEntity()
        {
            StaticReset.Register(() =>
            {
                s_byId.Clear();
                s_nextOfflineId = 1;
                LocalPlayer = null;
            });
        }

        [SerializeField] private TeamId team = TeamId.None;
        [SerializeField] private string displayName = "Player";
        [SerializeField] private bool isLocalPlayer;
        [SerializeField] private bool isBot;

        private Health _health;
        private HitboxRig _rig;

        public EntityId Id { get; private set; }
        public Health Health => _health;
        public HitboxRig Rig => _rig;
        public TeamId Team => team;
        public string DisplayName => displayName;
        public bool IsLocalPlayer => isLocalPlayer;
        public bool IsBot => isBot;

        /// <summary>The entity controlled on this device (null in a dedicated server).</summary>
        public static CombatEntity LocalPlayer { get; private set; }

        private void Awake()
        {
            TryGetComponent(out _health);
            TryGetComponent(out _rig);

            // Offline/bots: self-assign. Online: the session calls AssignId before or
            // right after spawning with the server-issued id.
            if (!Id.IsValid) Register(new EntityId(s_nextOfflineId++));
            if (isLocalPlayer) LocalPlayer = this;
        }

        private void OnDestroy()
        {
            if (Id.IsValid && s_byId.TryGetValue(Id.Value, out CombatEntity existing) && existing == this) s_byId.Remove(Id.Value);
            if (LocalPlayer == this) LocalPlayer = null;
        }

        /// <summary>Server-assigned identity (networked sessions).</summary>
        public void AssignId(EntityId id)
        {
            if (Id.IsValid && s_byId.TryGetValue(Id.Value, out CombatEntity existing) && existing == this) s_byId.Remove(Id.Value);
            Register(id);
        }

        public void Configure(TeamId newTeam, string newDisplayName, bool localPlayer, bool bot)
        {
            team = newTeam;
            displayName = newDisplayName;
            isLocalPlayer = localPlayer;
            isBot = bot;
            if (localPlayer) LocalPlayer = this;
        }

        public bool IsHostileTo(CombatEntity other)
        {
            if (other == null || other == this) return false;
            if (team == TeamId.None || other.team == TeamId.None) return true; // free-for-all
            return team != other.team;
        }

        public static bool TryGet(EntityId id, out CombatEntity entity)
        {
            return s_byId.TryGetValue(id.Value, out entity) && entity != null;
        }

        private void Register(EntityId id)
        {
            Id = id;
            if (id.Value >= s_nextOfflineId) s_nextOfflineId = id.Value + 1;
            s_byId[id.Value] = this;
        }
    }
}
