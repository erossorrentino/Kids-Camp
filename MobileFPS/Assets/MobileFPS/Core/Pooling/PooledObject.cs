using UnityEngine;

namespace MobileFPS.Pooling
{
    /// <summary>
    /// Added automatically to every pooled instance. Holds pool bookkeeping and the
    /// cached <see cref="IPoolable"/> callbacks, so spawning never calls GetComponent.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class PooledObject : MonoBehaviour
    {
        internal GameObjectPool Pool;
        internal IPoolable[] Callbacks = System.Array.Empty<IPoolable>();
        internal bool IsSpawned;

        // Timed auto-despawn bookkeeping, owned by PoolManager (index into its timed list).
        internal int TimedSlot = -1;
        internal float DespawnAtTime;

        public bool Spawned => IsSpawned;

        /// <summary>Return this instance to its pool now.</summary>
        public void Despawn()
        {
            PoolManager.Despawn(this);
        }

        private void OnDestroy()
        {
            // Destroyed while out of the pool (scene unload, gameplay Destroy). Keep counts honest.
            if (IsSpawned && Pool != null) Pool.NotifyDestroyedWhileActive();
            if (TimedSlot >= 0 && PoolManager.HasInstance) PoolManager.Instance.CancelTimedDespawn(this);
        }
    }
}
