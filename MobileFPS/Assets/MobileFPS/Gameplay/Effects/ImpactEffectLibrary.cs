using System;
using UnityEngine;

namespace MobileFPS.Effects
{
    /// <summary>Surface -> impact particle + decal prefabs. Put an AudioSource (playOnAwake) on the particle prefab for impact sounds.</summary>
    [CreateAssetMenu(menuName = "MobileFPS/Effects/Impact Effect Library", fileName = "ImpactEffectLibrary")]
    public sealed class ImpactEffectLibrary : ScriptableObject
    {
        [Serializable]
        public struct Entry
        {
            public SurfaceType surface;
            public GameObject effectPrefab;
            public GameObject decalPrefab;
        }

        public Entry defaultEntry;
        public Entry[] entries = new Entry[0];

        [Tooltip("Seconds before pooled impact particles are recycled.")]
        public float effectLifetime = 1.5f;

        [NonSerialized] private Entry[] _bySurface;

        public Entry Get(SurfaceType surface)
        {
            if (_bySurface == null) BuildLookup();
            int index = (int)surface;
            return index < _bySurface.Length ? _bySurface[index] : defaultEntry;
        }

        private void OnEnable() => _bySurface = null;

        private void BuildLookup()
        {
            int count = Enum.GetValues(typeof(SurfaceType)).Length;
            _bySurface = new Entry[count];
            for (int i = 0; i < count; i++) _bySurface[i] = defaultEntry;
            foreach (Entry entry in entries)
            {
                Entry resolved = entry;
                if (resolved.effectPrefab == null) resolved.effectPrefab = defaultEntry.effectPrefab;
                if (resolved.decalPrefab == null) resolved.decalPrefab = defaultEntry.decalPrefab;
                _bySurface[(int)entry.surface] = resolved;
            }
        }
    }
}
