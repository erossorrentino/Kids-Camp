using MobileFPS.Core;
using UnityEngine;

namespace MobileFPS.Combat
{
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
}
