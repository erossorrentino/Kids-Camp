using MobileFPS.Pooling;
using UnityEngine;

namespace MobileFPS.Effects
{
    /// <summary>
    /// Restarts every ParticleSystem on spawn and stops/clears them on despawn.
    /// Works with both pool activation modes. With
    /// <see cref="PoolActivationMode.KeepActive"/> it avoids SetActive's
    /// OnEnable/OnDisable cascade, which on particle-heavy prefabs is the
    /// expensive part.
    ///
    /// Author particle prefabs for mobile: Stop Action = None (the pool owns
    /// lifetime), no Collision/Lights modules, low max particles, small textures in
    /// a shared atlas, and a cheap mobile shader (Particles/Mobile or URP Simple Lit).
    /// </summary>
    public sealed class PooledParticleEffect : MonoBehaviour, IPoolable
    {
        private ParticleSystem[] _systems;

        private void Awake()
        {
            _systems = GetComponentsInChildren<ParticleSystem>(true);
        }

        public void OnSpawned()
        {
            if (_systems == null) Awake();
            for (int i = 0; i < _systems.Length; i++)
            {
                _systems[i].Clear(false);
                _systems[i].Play(false);
            }
        }

        public void OnDespawned()
        {
            if (_systems == null) return;
            for (int i = 0; i < _systems.Length; i++)
            {
                _systems[i].Stop(false, ParticleSystemStopBehavior.StopEmittingAndClear);
            }
        }
    }
}
