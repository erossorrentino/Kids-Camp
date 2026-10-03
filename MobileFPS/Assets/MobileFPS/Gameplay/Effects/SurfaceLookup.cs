using System.Collections.Generic;
using MobileFPS.Core;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace MobileFPS.Effects
{
    /// <summary>
    /// Collider to surface lookup with a per-collider cache. A shotgun blast or LMG
    /// spray asks about the same few colliders hundreds of times; after the first
    /// query each answer is a dictionary hit instead of a GetComponent walk.
    /// </summary>
    public static class SurfaceLookup
    {
        private static readonly Dictionary<int, SurfaceInfo> s_cache = new Dictionary<int, SurfaceInfo>(256);
        private static bool s_hooked;

        static SurfaceLookup()
        {
            StaticReset.Register(() => s_cache.Clear());
        }

        public static float DefaultPenetrationCost(SurfaceType type)
        {
            switch (type)
            {
                case SurfaceType.Glass: return 0.1f;
                case SurfaceType.Water: return 0.2f;
                case SurfaceType.Wood: return 0.6f;
                case SurfaceType.Flesh: return 0.5f;
                case SurfaceType.Metal: return 2f;
                case SurfaceType.Dirt: return 2.5f;
                case SurfaceType.Concrete: return 3f;
                default: return 1.5f;
            }
        }

        public static SurfaceInfo Get(Collider collider)
        {
            if (collider == null) return new SurfaceInfo { Type = SurfaceType.Default, PenetrationCost = DefaultPenetrationCost(SurfaceType.Default) };
            if (!s_hooked)
            {
                s_hooked = true;
                SceneManager.sceneUnloaded += _ => s_cache.Clear(); // instance ids of unloaded colliders are dead
            }

            int key = collider.GetInstanceID();
            if (s_cache.TryGetValue(key, out SurfaceInfo info)) return info;

            SurfaceType type = SurfaceType.Default;
            float cost = -1f;
            // Identifier may sit on the collider or a parent (compound colliders).
            SurfaceIdentifier identifier = collider.GetComponentInParent<SurfaceIdentifier>();
            if (identifier != null)
            {
                type = identifier.surface;
                cost = identifier.penetrationCostOverride;
            }
            info = new SurfaceInfo { Type = type, PenetrationCost = cost >= 0f ? cost : DefaultPenetrationCost(type) };
            s_cache[key] = info;
            return info;
        }
    }
}
