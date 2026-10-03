using MobileFPS.Effects;
using UnityEngine;

namespace MobileFPS.Combat
{
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
