using MobileFPS.Core;
using MobileFPS.Effects;
using UnityEngine;

namespace MobileFPS.Combat
{
    /// <summary>A world-geometry ray hit (walls, floors, props). Characters are never world hits.</summary>
    public struct WorldHit
    {
        public Vector3 Point;
        public Vector3 Normal;
        public float Distance;
        public SurfaceType Surface;
        public float PenetrationCost;
    }

    /// <summary>Ray query against character hitboxes: live (client) or rewound (server lag compensation).</summary>
    public interface IHitboxQuery
    {
        bool Raycast(Vector3 origin, Vector3 direction, float maxDistance, EntityId ignore, out HitboxHit hit);
    }

    /// <summary>Ray query against static/dynamic world geometry. Results sorted nearest first.</summary>
    public interface IWorldQuery
    {
        int RaycastAll(Vector3 origin, Vector3 direction, float maxDistance, WorldHit[] results);
    }

    /// <summary>Current-frame hitboxes of every living rig: what the client sees right now.</summary>
    public sealed class LiveHitboxQuery : IHitboxQuery
    {
        public bool Raycast(Vector3 origin, Vector3 direction, float maxDistance, EntityId ignore, out HitboxHit hit)
        {
            hit = default;
            bool found = false;
            float best = maxDistance;
            var rigs = HitboxRig.All;
            for (int i = 0; i < rigs.Count; i++)
            {
                HitboxRig rig = rigs[i];
                if (!rig.IsAlive || rig.Id == ignore) continue;
                if (rig.Raycast(origin, direction, best, out HitboxHit candidate) && candidate.Distance < best)
                {
                    best = candidate.Distance;
                    hit = candidate;
                    found = true;
                }
            }
            return found;
        }
    }

    /// <summary>
    /// PhysX-backed world query using RaycastNonAlloc into a reused buffer (no GC).
    /// Note that RaycastNonAlloc returns hits in arbitrary order, so they are
    /// sorted here. Forgetting that is a classic penetration bug: bullets "pass
    /// through" the near wall because a far wall came back first.
    /// </summary>
    public sealed class PhysicsWorldQuery : IWorldQuery
    {
        private readonly RaycastHit[] _buffer;
        private readonly LayerMask _mask;

        public PhysicsWorldQuery(LayerMask mask, int maxHits = 16)
        {
            _mask = mask;
            _buffer = new RaycastHit[maxHits];
        }

        public int RaycastAll(Vector3 origin, Vector3 direction, float maxDistance, WorldHit[] results)
        {
            int count = Physics.RaycastNonAlloc(origin, direction, _buffer, maxDistance, _mask, QueryTriggerInteraction.Ignore);
            count = Mathf.Min(count, results.Length);

            // Insertion sort: n is tiny (usually 1-3), so this beats Array.Sort and allocates nothing.
            for (int i = 1; i < count; i++)
            {
                RaycastHit key = _buffer[i];
                int j = i - 1;
                while (j >= 0 && _buffer[j].distance > key.distance)
                {
                    _buffer[j + 1] = _buffer[j];
                    j--;
                }
                _buffer[j + 1] = key;
            }

            for (int i = 0; i < count; i++)
            {
                RaycastHit h = _buffer[i];
                SurfaceInfo surface = SurfaceLookup.Get(h.collider);
                results[i] = new WorldHit
                {
                    Point = h.point,
                    Normal = h.normal,
                    Distance = h.distance,
                    Surface = surface.Type,
                    PenetrationCost = surface.PenetrationCost,
                };
            }
            return count;
        }
    }
}
