using MobileFPS.Core;
using MobileFPS.Pooling;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace MobileFPS.Effects
{

    /// <summary>
    /// Spawns pooled impact particles and decals under a strict budget.
    ///
    /// Mobile budgets:
    /// - <b>Per-frame cap</b>: an 8-pellet shotgun plus an LMG can request 20+
    ///   impacts in a frame. Past the cap, extra effects are dropped. Players
    ///   don't notice, but they do notice a 30 ms hitch.
    /// - <b>Distance cull</b>: a 3-pixel puff at 80 m is pure overdraw.
    /// - <b>Decal ring buffer</b>: a fixed count of quad decals, recycling the
    ///   oldest. No projector decals: they re-render every receiving mesh, which
    ///   costs too much on tile-based mobile GPUs.
    /// - <b>Overflow = Reject</b> pools: when everything's in use, skip it.
    /// </summary>
    [AutoCreateSingleton]
    public sealed class ImpactEffectSystem : Singleton<ImpactEffectSystem>
    {
        [SerializeField] private ImpactEffectLibrary defaultLibrary;
        [SerializeField] private int maxImpactsPerFrame = 6;
        [SerializeField] private float maxEffectDistance = 60f;
        [SerializeField] private int maxDecals = 48;
        [SerializeField] private float decalSurfaceOffset = 0.01f;
        [SerializeField] private int effectPoolSize = 24;

        private PooledObject[] _decals;
        private int _decalCursor;
        private int _spawnedThisFrame;
        private int _budgetFrame = -1;
        private Transform _viewer;

        public ImpactEffectLibrary DefaultLibrary
        {
            get => defaultLibrary;
            set => defaultLibrary = value;
        }

        /// <summary>Tighten budgets on lower performance tiers (raised by PerformanceGovernor).</summary>
        public int MaxImpactsPerFrame
        {
            get => maxImpactsPerFrame;
            set => maxImpactsPerFrame = Mathf.Max(1, value);
        }

        protected override void OnSingletonAwake()
        {
            _decals = new PooledObject[Mathf.Max(1, maxDecals)];
            EventBus<PerformanceTierChangedEvent>.Subscribe(OnPerformanceTierChanged);
            // Pools persist across scenes; decals from the last match must not.
            SceneManager.activeSceneChanged += OnActiveSceneChanged;
        }

        protected override void OnSingletonDestroy()
        {
            EventBus<PerformanceTierChangedEvent>.Unsubscribe(OnPerformanceTierChanged);
            SceneManager.activeSceneChanged -= OnActiveSceneChanged;
        }

        public void ClearDecals()
        {
            for (int i = 0; i < _decals.Length; i++)
            {
                if (_decals[i] != null && _decals[i].Spawned) _decals[i].Despawn();
                _decals[i] = null;
            }
            _decalCursor = 0;
        }

        private void OnActiveSceneChanged(Scene previous, Scene next)
        {
            ClearDecals();
            _viewer = null;
        }

        /// <summary>Viewer used for distance culling (the local camera). Falls back to Camera.main once.</summary>
        public void SetViewer(Transform viewer) => _viewer = viewer;

        /// <summary>Prewarm pools during loading so the first firefight has no Instantiate hitches.</summary>
        public void Prewarm(ImpactEffectLibrary library = null)
        {
            library = library != null ? library : defaultLibrary;
            if (library == null) return;
            PoolManager pools = PoolManager.Instance;
            foreach (ImpactEffectLibrary.Entry entry in library.entries) PrewarmEntry(pools, entry);
            PrewarmEntry(pools, library.defaultEntry);
        }

        public void Spawn(in ImpactPoint impact, ImpactEffectLibrary libraryOverride = null)
        {
            ImpactEffectLibrary library = libraryOverride != null ? libraryOverride : defaultLibrary;
            if (library == null) return;

            if (_budgetFrame != Time.frameCount)
            {
                _budgetFrame = Time.frameCount;
                _spawnedThisFrame = 0;
            }
            if (_spawnedThisFrame >= maxImpactsPerFrame) return;

            if (_viewer == null && Camera.main != null) _viewer = Camera.main.transform;
            if (_viewer != null && (impact.Point - _viewer.position).sqrMagnitude > maxEffectDistance * maxEffectDistance) return;

            _spawnedThisFrame++;
            ImpactEffectLibrary.Entry entry = library.Get(impact.Surface);
            Quaternion rotation = Quaternion.LookRotation(impact.Normal);
            PoolManager pools = PoolManager.Instance;

            if (entry.effectPrefab != null)
            {
                pools.GetOrCreatePool(entry.effectPrefab, 0, effectPoolSize, PoolActivationMode.ToggleActive, PoolOverflowPolicy.Reject);
                pools.Spawn(entry.effectPrefab, impact.Point, rotation, library.effectLifetime);
            }

            if (entry.decalPrefab != null && impact.Surface != SurfaceType.Water && impact.Surface != SurfaceType.Flesh)
            {
                SpawnDecal(pools, entry.decalPrefab, impact.Point + impact.Normal * decalSurfaceOffset, rotation);
            }
        }

        private void SpawnDecal(PoolManager pools, GameObject prefab, Vector3 position, Quaternion rotation)
        {
            // Ring buffer: recycle the oldest decal once the budget is full.
            PooledObject oldest = _decals[_decalCursor];
            if (oldest != null && oldest.Spawned) oldest.Despawn();

            pools.GetOrCreatePool(prefab, 0, _decals.Length + 4, PoolActivationMode.ToggleActive, PoolOverflowPolicy.Reject);
            // Random roll so repeated holes don't tile visibly.
            Quaternion rolled = rotation * Quaternion.Euler(0f, 0f, Random.Range(0f, 360f));
            _decals[_decalCursor] = pools.Spawn(prefab, position, rolled);
            _decalCursor = (_decalCursor + 1) % _decals.Length;
        }

        private void PrewarmEntry(PoolManager pools, ImpactEffectLibrary.Entry entry)
        {
            if (entry.effectPrefab != null)
                pools.GetOrCreatePool(entry.effectPrefab, Mathf.Min(6, effectPoolSize), effectPoolSize, PoolActivationMode.ToggleActive, PoolOverflowPolicy.Reject);
            if (entry.decalPrefab != null)
                pools.GetOrCreatePool(entry.decalPrefab, Mathf.Min(8, _decals.Length), _decals.Length + 4, PoolActivationMode.ToggleActive, PoolOverflowPolicy.Reject);
        }

        private void OnPerformanceTierChanged(in PerformanceTierChangedEvent evt)
        {
            maxImpactsPerFrame = Mathf.Max(2, 6 - evt.Tier * 2);
        }
    }
}
