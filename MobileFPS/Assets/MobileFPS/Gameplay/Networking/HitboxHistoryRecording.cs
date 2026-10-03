using System.Collections.Generic;
using MobileFPS.Combat;

namespace MobileFPS.Networking
{
    public static class HitboxHistoryRecording
    {
        /// <summary>Records every living rig. Call on the authority after animation (LateUpdate).</summary>
        public static void Record(this HitboxHistory history, double time, IReadOnlyList<HitboxRig> rigs)
        {
            history.BeginFrame(time);
            for (int i = 0; i < rigs.Count; i++)
            {
                HitboxRig rig = rigs[i];
                if (!rig.IsAlive) continue;
                rig.RefreshShapes();
                history.AddRig(rig.Id, rig.GetWorldShapes(), rig.ShapeCount);
            }
        }
    }
}
