using System.Collections.Generic;
using UnityEngine;

namespace MobileFPS.Pooling
{
    /// <summary>Implement on any component of a pooled prefab to reset state on reuse.</summary>
    public interface IPoolable
    {
        /// <summary>Called after the instance is positioned and (if applicable) activated.</summary>
        void OnSpawned();

        /// <summary>Called before the instance is returned to the pool. Reset all per-use state here.</summary>
        void OnDespawned();
    }

    public enum PoolActivationMode
    {
        /// <summary>SetActive(true/false) on spawn/despawn. Simple and correct for most things.</summary>
        ToggleActive,

        /// <summary>
        /// Never deactivate; <see cref="IPoolable"/> handles visibility (e.g. ParticleSystem.Stop/Clear).
        /// SetActive on a GameObject with particle systems, animators or many renderers
        /// triggers OnEnable/OnDisable cascades and re-registration with the renderer.
        /// For high-frequency FX (muzzle flashes, impacts) on mobile, keeping them
        /// active and stopped is measurably cheaper.
        /// </summary>
        KeepActive,
    }

    public enum PoolOverflowPolicy
    {
        /// <summary>Instantiate beyond max size (logs once). Use for gameplay-critical objects.</summary>
        Grow,

        /// <summary>Return null when exhausted. Use for cosmetic FX: under load, skipping one impact puff beats a frame hitch.</summary>
        Reject,
    }

    /// <summary>
    /// Per-prefab pool. Instantiate/Destroy are among the most expensive calls in
    /// Unity (native allocation, component Awake, GC pressure from the managed
    /// wrapper), so anything spawned more than once per match is pooled and prewarmed
    /// during the loading screen.
    /// </summary>
    public sealed class GameObjectPool
    {
        private readonly GameObject _prefab;
        private readonly Stack<PooledObject> _available;
        private readonly int _maxSize;
        private readonly PoolActivationMode _activationMode;
        private readonly PoolOverflowPolicy _overflowPolicy;
        private readonly Transform _stagingContainer;
        private readonly Transform _editorRoot;
        private bool _loggedOverflow;
        private bool _disposed;

        public GameObject Prefab => _prefab;
        public int CountAll { get; private set; }
        public int CountInactive => _available.Count;
        public int CountActive => CountAll - _available.Count;
        public PoolActivationMode ActivationMode => _activationMode;

        /// <param name="stagingContainer">An inactive transform. Instantiating under it defers Awake/OnEnable until first spawn.</param>
        /// <param name="editorRoot">Hierarchy parent for tidiness in the Editor; pass null in builds (see PoolManager).</param>
        public GameObjectPool(GameObject prefab, int maxSize, PoolActivationMode activationMode,
            PoolOverflowPolicy overflowPolicy, Transform stagingContainer, Transform editorRoot)
        {
            _prefab = prefab;
            _maxSize = Mathf.Max(1, maxSize);
            _activationMode = activationMode;
            _overflowPolicy = overflowPolicy;
            _stagingContainer = stagingContainer;
            _editorRoot = editorRoot;
            _available = new Stack<PooledObject>(_maxSize);
        }

        /// <summary>Instantiate up front (loading screen) so the first firefight doesn't hitch.</summary>
        public void Prewarm(int count)
        {
            count = Mathf.Min(count, _maxSize);
            while (CountAll < count)
            {
                PooledObject item = CreateInstance();
                ParkInactive(item);
                _available.Push(item);
            }
        }

        public PooledObject Spawn(Vector3 position, Quaternion rotation)
        {
            PooledObject item = null;

            // Skip instances destroyed externally (scene unload, stray Destroy call).
            while (item == null && _available.Count > 0)
            {
                item = _available.Pop();
                if (item == null) CountAll--;
            }

            if (item == null)
            {
                if (CountAll >= _maxSize)
                {
                    if (_overflowPolicy == PoolOverflowPolicy.Reject) return null;
                    if (!_loggedOverflow)
                    {
                        _loggedOverflow = true;
                        Debug.LogWarning($"[Pool] '{_prefab.name}' exceeded max size {_maxSize}; growing. Raise maxSize or prewarm more.");
                    }
                }
                item = CreateInstance();
            }

            // SetPositionAndRotation is one native call (and one transform-changed
            // notification) instead of two.
            item.transform.SetPositionAndRotation(position, rotation);
            if (_activationMode == PoolActivationMode.ToggleActive) item.gameObject.SetActive(true);

            item.IsSpawned = true;
            IPoolable[] callbacks = item.Callbacks;
            for (int i = 0; i < callbacks.Length; i++) callbacks[i].OnSpawned();
            return item;
        }

        internal void Return(PooledObject item)
        {
            if (item == null) return;
            if (_disposed)
            {
                item.IsSpawned = false;
                CountAll--;
                Object.Destroy(item.gameObject);
                return;
            }
            if (!item.IsSpawned)
            {
#if UNITY_EDITOR || DEVELOPMENT_BUILD
                Debug.LogWarning($"[Pool] Double despawn of '{item.name}' ignored.", item);
#endif
                return;
            }

            item.IsSpawned = false;
            IPoolable[] callbacks = item.Callbacks;
            for (int i = 0; i < callbacks.Length; i++) callbacks[i].OnDespawned();
            ParkInactive(item);
            _available.Push(item);
        }

        /// <summary>Drops references to destroyed instances (after a scene unload) so counts stay accurate.</summary>
        internal void Prune()
        {
            if (_available.Count == 0) return;
            var survivors = new List<PooledObject>(_available.Count);
            while (_available.Count > 0)
            {
                PooledObject item = _available.Pop();
                if (item != null) survivors.Add(item);
                else CountAll--;
            }
            for (int i = survivors.Count - 1; i >= 0; i--) _available.Push(survivors[i]);
        }

        /// <summary>Destroys parked instances beyond <paramref name="keep"/>.</summary>
        internal void TrimInactive(int keep)
        {
            while (_available.Count > keep)
            {
                PooledObject item = _available.Pop();
                CountAll--;
                if (item != null) Object.Destroy(item.gameObject);
            }
        }

        /// <summary>Destroys parked instances and makes future returns destroy instead of park.</summary>
        internal void Dispose()
        {
            TrimInactive(0);
            _disposed = true;
        }

        internal void NotifyDestroyedWhileActive()
        {
            CountAll--;
        }

        private PooledObject CreateInstance()
        {
            GameObject go;
            if (_activationMode == PoolActivationMode.ToggleActive)
            {
                // Instantiating under an inactive parent defers Awake/OnEnable until the
                // first real spawn (correct position, no one-frame flash at the origin),
                // without touching the prefab asset's own active flag.
                go = Object.Instantiate(_prefab, _stagingContainer, false);
                go.SetActive(false);
                go.transform.SetParent(_editorRoot, false);
            }
            else
            {
                go = Object.Instantiate(_prefab, _editorRoot, false);
            }
            go.name = _prefab.name;

            if (!go.TryGetComponent(out PooledObject item)) item = go.AddComponent<PooledObject>();
            item.Pool = this;
            item.Callbacks = go.GetComponentsInChildren<IPoolable>(true); // cached once: no GetComponent per spawn
            CountAll++;
            return item;
        }

        private void ParkInactive(PooledObject item)
        {
            if (_activationMode == PoolActivationMode.ToggleActive)
            {
                item.gameObject.SetActive(false);
            }
        }
    }
}
