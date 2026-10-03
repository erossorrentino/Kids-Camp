using System.Collections.Generic;
using MobileFPS.Combat;
using MobileFPS.Core;
using MobileFPS.Effects;
using MobileFPS.Weapons;
using UnityEngine;

namespace MobileFPS.Networking
{
    public enum HitAuthorityMode : byte
    {
        /// <summary>This device decides hits (offline, training, bots). Zero latency.</summary>
        LocalAuthoritative,

        /// <summary>
        /// Development mode: shots go through the full server path (validation,
        /// lag-compensated rewind) inside this process, after simulated latency. Lets
        /// you tune hit registration against 150 ms ping in the Editor without servers.
        /// </summary>
        LoopbackServer,

        /// <summary>Production online: shots are sent to the server via <see cref="CombatAuthority.RemoteTransport"/>.</summary>
        RemoteServer,
    }

    /// <summary>Client → server shot channel, implemented by your netcode (NGO, Fusion, Mirror, custom UDP).</summary>
    public interface IShotTransport
    {
        void SendShot(in ShotRequest shot);
    }

    /// <summary>Client-only presentation data for a shot.</summary>
    public struct ShotPresentation
    {
        public Vector3 MuzzlePosition;
        public bool DrawTracer;
        public Color TracerColor;
        public ImpactEffectLibrary ImpactLibrary;
    }

    /// <summary>
    /// The shot pipeline: client prediction plus authoritative resolution.
    ///
    /// On fire, the client immediately resolves the shot against what it sees
    /// (live hitboxes) and plays impacts, tracers and predicted hit markers, so
    /// feedback has zero latency. Then, depending on <see cref="Mode"/>:
    /// - applies damage itself (offline);
    /// - or hands the 41-byte <see cref="ShotRequest"/> to the server, which
    ///   validates it (<see cref="ServerShotValidator"/>), rewinds hitboxes to the
    ///   client's view time (<see cref="HitboxHistory"/>) and re-runs the
    ///   identical <see cref="HitscanSolver"/>. Only the server's result changes
    ///   health.
    ///
    /// The server half is plain C# called through <see cref="ServerHandleShot"/>,
    /// so a headless Unity server (or the Loopback mode) runs exactly this code.
    /// </summary>
    [AutoCreateSingleton]
    [DefaultExecutionOrder(10000)] // LateUpdate after animation: record final poses
    public sealed class CombatAuthority : Singleton<CombatAuthority>
    {
        private struct PendingShot
        {
            public ShotRequest Shot;
            public double DeliverAt;
        }

        [SerializeField] private HitAuthorityMode mode = HitAuthorityMode.LocalAuthoritative;

        [Tooltip("Loopback mode: simulated one-way latency.")]
        [SerializeField, Range(0f, 400f)] private float loopbackLatencyMs = 120f;

        [Tooltip("World geometry for occlusion/penetration. Exclude Player, Viewmodel and Projectile layers.")]
        [SerializeField] private LayerMask worldMask;

        [SerializeField] private ServerShotValidator.Settings validatorSettings = new ServerShotValidator.Settings();
        [SerializeField] private int historyFrames = 64;
        [SerializeField] private bool logRejectedShots = true;

        private readonly WorldHit[] _worldBuffer = new WorldHit[16];
        private readonly List<PelletHit> _clientHits = new List<PelletHit>(16);
        private readonly List<PelletHit> _serverHits = new List<PelletHit>(16);
        private readonly List<VictimDamage> _victims = new List<VictimDamage>(8);
        private readonly List<ImpactPoint> _impacts = new List<ImpactPoint>(16);
        private readonly List<Vector3> _pelletEnds = new List<Vector3>(16);
        private readonly Dictionary<int, ShooterState> _shooters = new Dictionary<int, ShooterState>(32);
        private readonly Queue<PendingShot> _loopbackQueue = new Queue<PendingShot>(64);

        private PhysicsWorldQuery _world;
        private LiveHitboxQuery _live;
        private HitboxHistory _history;
        private RewoundHitboxQuery _rewound;
        private ServerShotValidator _validator;

        public HitAuthorityMode Mode
        {
            get => mode;
            set => mode = value;
        }

        public IShotTransport RemoteTransport { get; set; }
        public HitboxHistory History => _history;
        public bool IsServerSimulated => mode != HitAuthorityMode.LocalAuthoritative;

        protected override bool PersistAcrossScenes => false; // history and shooter state are per match

        protected override void OnSingletonAwake()
        {
            if (worldMask.value == 0) worldMask = DefaultWorldMask();
            _world = new PhysicsWorldQuery(worldMask, _worldBuffer.Length);
            _live = new LiveHitboxQuery();
            _history = new HitboxHistory(historyFrames);
            _rewound = new RewoundHitboxQuery(_history);
            _validator = new ServerShotValidator(validatorSettings);
        }

        public static LayerMask DefaultWorldMask()
        {
            int excluded = LayerMask.GetMask("Player", "Viewmodel", "Projectile", "Ignore Raycast", "UI");
            return ~excluded;
        }

        // ------------------------------------------------------------------
        // Client side
        // ------------------------------------------------------------------

        /// <summary>Called by the shooting client for every hitscan trigger pull.</summary>
        public void SubmitShot(in ShotRequest shot, WeaponStats stats, in ShotPresentation presentation)
        {
            _clientHits.Clear();
            _impacts.Clear();
            _pelletEnds.Clear();

            // Client-side prediction: resolve against what this player sees right now.
            HitscanSolver.Solve(shot, stats, _world, _live, _worldBuffer, _clientHits, _impacts, _pelletEnds);
            PlayPresentation(shot, presentation);

            switch (mode)
            {
                case HitAuthorityMode.LocalAuthoritative:
                    ApplyHits(shot, stats, _clientHits);
                    break;

                case HitAuthorityMode.LoopbackServer:
                    RaisePredictedHitMarkers();
                    _loopbackQueue.Enqueue(new PendingShot { Shot = shot, DeliverAt = NetworkClock.Now + loopbackLatencyMs / 1000.0 });
                    break;

                case HitAuthorityMode.RemoteServer:
                    RaisePredictedHitMarkers();
                    if (RemoteTransport != null) RemoteTransport.SendShot(shot);
                    else Debug.LogWarning("[CombatAuthority] RemoteServer mode without a RemoteTransport; shot dropped.");
                    break;
            }
        }

        // ------------------------------------------------------------------
        // Server side (dedicated server, host, or loopback)
        // ------------------------------------------------------------------

        public ShooterState GetOrCreateShooter(EntityId id)
        {
            if (!_shooters.TryGetValue(id.Value, out ShooterState state))
            {
                state = new ShooterState { Id = id };
                _shooters.Add(id.Value, state);
            }
            return state;
        }

        /// <summary>Server simulation: per-tick authoritative position/state of a shooter.</summary>
        public void UpdateShooter(EntityId id, Vector3 eyePosition, float speed, bool alive)
        {
            ShooterState state = GetOrCreateShooter(id);
            state.EyePosition = eyePosition;
            state.Speed = speed;
            state.Alive = alive;
        }

        /// <summary>Server simulation: the shooter equipped a weapon (resets cadence checks).</summary>
        public void NotifyEquipped(EntityId id, ushort weaponNetId, WeaponStats stats, int ammoInMagazine)
        {
            GetOrCreateShooter(id).Equip(weaponNetId, stats, ammoInMagazine);
        }

        /// <summary>Server simulation: a reload completed.</summary>
        public void NotifyReloaded(EntityId id, int ammoInMagazine)
        {
            GetOrCreateShooter(id).AmmoInMagazine = ammoInMagazine;
        }

        /// <summary>Authoritative shot handling. Netcode calls this on the server when a shot packet arrives.</summary>
        public ShotVerdict ServerHandleShot(in ShotRequest shot, double serverNow)
        {
            if (!_shooters.TryGetValue(shot.Shooter.Value, out ShooterState shooter)) return ShotVerdict.RejectedNotAlive;

            ShotVerdict verdict = _validator.Validate(shot, shooter, serverNow, out double rewindTime);
            if (verdict != ShotVerdict.Accepted)
            {
                if (logRejectedShots) Debug.LogWarning($"[CombatAuthority] Shot #{shot.Sequence} from {shot.Shooter} rejected: {verdict}");
                return verdict;
            }

            _serverHits.Clear();
            _rewound.Time = rewindTime;
            HitscanSolver.Solve(shot, shooter.Stats, _world, _rewound, _worldBuffer, _serverHits, null, null);
            ApplyHits(shot, shooter.Stats, _serverHits);
            return verdict;
        }

        private void Update()
        {
            if (_loopbackQueue.Count == 0) return;
            double now = NetworkClock.Now;
            while (_loopbackQueue.Count > 0 && _loopbackQueue.Peek().DeliverAt <= now)
            {
                PendingShot pending = _loopbackQueue.Dequeue();
                ServerHandleShot(pending.Shot, now);
            }
        }

        private void LateUpdate()
        {
            // Only an authority that resolves remote shots needs history.
            if (mode != HitAuthorityMode.LocalAuthoritative) _history.Record(NetworkClock.Now, HitboxRig.All);
        }

        private void ApplyHits(in ShotRequest shot, WeaponStats stats, List<PelletHit> hits)
        {
            if (hits.Count == 0) return;
            HitscanSolver.Aggregate(hits, _victims);
            WeaponDefinition definition = stats.Definition;

            for (int i = 0; i < _victims.Count; i++)
            {
                VictimDamage victim = _victims[i];
                DamageSystem.Apply(new DamageInfo
                {
                    Amount = victim.Damage,
                    Attacker = shot.Shooter,
                    Victim = victim.Victim,
                    WeaponId = definition.weaponId,
                    WeaponClass = definition.weaponClass,
                    Zone = victim.BestZone,
                    Point = victim.Point,
                    Direction = shot.Direction,
                    SourcePosition = shot.Origin,
                    Distance = victim.Distance,
                    Flags = BuildKillFlags(shot, definition, victim),
                });
            }
        }

        private static KillFlags BuildKillFlags(in ShotRequest shot, WeaponDefinition definition, in VictimDamage victim)
        {
            KillFlags flags = KillFlags.None;
            if (victim.Penetrated) flags |= KillFlags.Penetration;
            if (victim.Distance >= definition.longshotDistance) flags |= KillFlags.Longshot;
            if ((shot.Flags & ShotFlags.Sliding) != 0) flags |= KillFlags.WhileSliding;
            if ((shot.Flags & ShotFlags.Airborne) != 0) flags |= KillFlags.WhileAirborne;
            if ((shot.Flags & ShotFlags.Aiming) == 0) flags |= KillFlags.Hipfire;
            return flags;
        }

        private void PlayPresentation(in ShotRequest shot, in ShotPresentation presentation)
        {
            ImpactEffectSystem impacts = ImpactEffectSystem.Instance;
            for (int i = 0; i < _impacts.Count; i++) impacts.Spawn(_impacts[i], presentation.ImpactLibrary);

            for (int i = 0; i < _clientHits.Count; i++)
            {
                impacts.Spawn(new ImpactPoint
                {
                    Point = _clientHits[i].Point,
                    Normal = -shot.Direction,
                    Surface = SurfaceType.Flesh,
                    Distance = _clientHits[i].Distance,
                }, presentation.ImpactLibrary);
            }

            if (presentation.DrawTracer && _pelletEnds.Count > 0)
            {
                TracerSystem.Instance.Fire(presentation.MuzzlePosition, _pelletEnds[0], presentation.TracerColor);
            }
        }

        private void RaisePredictedHitMarkers()
        {
            if (_clientHits.Count == 0) return;
            HitscanSolver.Aggregate(_clientHits, _victims);
            for (int i = 0; i < _victims.Count; i++)
            {
                EventBus<HitMarkerEvent>.Raise(new HitMarkerEvent
                {
                    IsHeadshot = _victims[i].BestZone == HitZone.Head,
                    IsKill = false,
                    Confirmed = false,
                    Damage = _victims[i].Damage,
                });
            }
        }
    }
}
