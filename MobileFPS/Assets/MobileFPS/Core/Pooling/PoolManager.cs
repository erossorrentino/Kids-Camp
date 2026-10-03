using System.Collections.Generic;
using MobileFPS.Core;
using UnityEngine;

namespace MobileFPS.Pooling
{
    /// <summary>
    /// Central registry of prefab pools plus a single loop for timed despawns.
    ///
    /// Mobile performance notes:
    /// - <b>One Update for every timed object.</b> A self-destruct timer per effect
    ///   (each with its own Update, Invoke or coroutine) costs a native-to-managed
    ///   transition or a coroutine allocation per object. One loop over a dense list
    ///   is cache-friendly and allocation-free.
    /// - <b>Flat hierarchy in builds.</b> Instances are parented under per-pool roots
    ///   only in the Editor, for a readable hierarchy. In players they sit at the
    ///   scene root: big parent hierarchies serialize transform-change dispatch, and
    ///   moving 50 tracers under one parent is slower than 50 root objects.
    /// - <b>Persistent pools.</b> Instances live in the DontDestroyOnLoad scene, so
    ///   prewarmed FX survive lobby &lt;-&gt; match transitions instead of re-instantiating
    ///   every match. Call <see cref="ClearAll"/> to free memory on demand.
    /// </summary>
    [AutoCreateSingleton]
    [DefaultExecutionOrder(-500)]
    public sealed class PoolManager : Singleton<PoolManager>
    {
        private readonly Dictionary<int, GameObjectPool> _pools = new Dictionary<int, GameObjectPool>(64);
        private readonly List<PooledObject> _timed = new List<PooledObject>(256);
        private Transform _staging;

        protected override void OnSingletonAwake()
        {
            var staging = new GameObject("[PoolStaging]");
            staging.SetActive(false); // children instantiated here don't Awake until spawned
            staging.transform.SetParent(transform, false);
            _staging = staging.transform;

            // Android forwards onTrimMemory here. Dropping idle pooled FX is the
            // cheapest memory to give back before the OS kills the app.
            Application.lowMemory += OnLowMemory;
        }

        protected override void OnSingletonDestroy()
        {
            Application.lowMemory -= OnLowMemory;
        }

        /// <summary>Creates (or returns) the pool for <paramref name="prefab"/>. Call during loading with a prewarm count.</summary>
        public GameObjectPool GetOrCreatePool(GameObject prefab, int prewarm = 0, int maxSize = 64,
            PoolActivationMode activationMode = PoolActivationMode.ToggleActive,
            PoolOverflowPolicy overflowPolicy = PoolOverflowPolicy.Grow)
        {
            if (prefab == null) return null;
            int key = prefab.GetInstanceID();
            if (!_pools.TryGetValue(key, out GameObjectPool pool))
            {
                Transform editorRoot = null;
#if UNITY_EDITOR
                var root = new GameObject($"[Pool] {prefab.name}");
                root.transform.SetParent(transform, false);
                editorRoot = root.transform;
#endif
                pool = new GameObjectPool(prefab, maxSize, activationMode, overflowPolicy, _staging, editorRoot);
                _pools.Add(key, pool);
            }
            if (prewarm > 0) pool.Prewarm(prewarm);
            return pool;
        }

        /// <summary>
        /// Spawns from the prefab's pool (creating it with defaults if needed).
        /// <paramref name="lifetime"/> &gt; 0 auto-despawns after that many seconds (scaled time).
        /// Returns null only if the pool is full with the Reject policy.
        /// </summary>
        public PooledObject Spawn(GameObject prefab, Vector3 position, Quaternion rotation, float lifetime = -1f)
        {
            GameObjectPool pool = GetOrCreatePool(prefab);
            if (pool == null) return null;
            PooledObject item = pool.Spawn(position, rotation);
            if (item != null && lifetime > 0f) ScheduleDespawn(item, lifetime);
            return item;
        }

        /// <summary>Typed spawn. GetComponent on a found component is allocation-free in players.</summary>
        public T Spawn<T>(T prefab, Vector3 position, Quaternion rotation, float lifetime = -1f) where T : Component
        {
            if (prefab == null) return null;
            PooledObject item = Spawn(prefab.gameObject, position, rotation, lifetime);
            return item != null ? item.GetComponent<T>() : null;
        }

        /// <summary>Returns an instance to its pool. Safe to call on non-pooled objects (they are destroyed).</summary>
        public static void Despawn(PooledObject item)
        {
            if (item == null) return;
            if (item.TimedSlot >= 0 && HasInstance) Instance.CancelTimedDespawn(item);

            if (item.Pool == null)
            {
                Destroy(item.gameObject);
                return;
            }
            item.Pool.Return(item);
        }

        public static void Despawn(GameObject go)
        {
            if (go == null) return;
            if (go.TryGetComponent(out PooledObject item)) Despawn(item);
            else Destroy(go);
        }

        /// <summary>(Re)schedules an automatic despawn. Calling again replaces the previous timer.</summary>
        public void ScheduleDespawn(PooledObject item, float seconds)
        {
            if (item == null) return;
            item.DespawnAtTime = Time.time + seconds;
            if (item.TimedSlot >= 0) return; // already in the list, deadline updated
            item.TimedSlot = _timed.Count;
            _timed.Add(item);
        }

        internal void CancelTimedDespawn(PooledObject item)
        {
            int slot = item.TimedSlot;
            if (slot < 0 || slot >= _timed.Count || _timed[slot] != item)
            {
                item.TimedSlot = -1;
                return;
            }
            RemoveTimedAt(slot);
        }

        /// <summary>
        /// Destroys every parked instance and forgets all pools. Instances still in
        /// use are destroyed when they are despawned. Pools are rebuilt lazily.
        /// </summary>
        public void ClearAll()
        {
            for (int i = _timed.Count - 1; i >= 0; i--)
            {
                if (_timed[i] != null) _timed[i].TimedSlot = -1;
            }
            _timed.Clear();

            foreach (GameObjectPool pool in _pools.Values) pool.Dispose();
            _pools.Clear();
        }

        private void Update()
        {
            if (_timed.Count == 0) return;
            float now = Time.time;

            // Backwards so swap-removal never skips an element.
            for (int i = _timed.Count - 1; i >= 0; i--)
            {
                if (i >= _timed.Count) continue; // list shrank via a despawn callback
                PooledObject item = _timed[i];
                if (item == null)
                {
                    RemoveTimedAt(i);
                    continue;
                }
                if (now < item.DespawnAtTime) continue;

                RemoveTimedAt(i);
                if (item.Pool != null) item.Pool.Return(item);
                else Destroy(item.gameObject);
            }
        }

        private void RemoveTimedAt(int index)
        {
            int last = _timed.Count - 1;
            PooledObject removed = _timed[index];
            if (removed != null) removed.TimedSlot = -1;

            if (index != last)
            {
                PooledObject moved = _timed[last];
                _timed[index] = moved;
                if (moved != null) moved.TimedSlot = index;
            }
            _timed.RemoveAt(last);
        }

        private void OnLowMemory()
        {
            foreach (GameObjectPool pool in _pools.Values) pool.TrimInactive(keep: 2);
        }
    }
}
