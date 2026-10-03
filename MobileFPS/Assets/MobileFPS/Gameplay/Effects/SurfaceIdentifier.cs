using UnityEngine;

namespace MobileFPS.Effects
{
    /// <summary>Tags a collider with a surface material for impact FX and bullet penetration.</summary>
    [DisallowMultipleComponent]
    public sealed class SurfaceIdentifier : MonoBehaviour
    {
        public SurfaceType surface = SurfaceType.Concrete;

        [Tooltip("Penetration cost override (-1 = default for the surface type). Thin sheet metal ~0.8, a concrete wall ~99.")]
        public float penetrationCostOverride = -1f;
    }
}
