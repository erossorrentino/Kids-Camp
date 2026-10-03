using UnityEngine;

namespace MobileFPS.Effects
{
    public enum SurfaceType : byte
    {
        Default,
        Concrete,
        Metal,
        Wood,
        Dirt,
        Water,
        Glass,
        Flesh,
    }

    public struct SurfaceInfo
    {
        public SurfaceType Type;
        public float PenetrationCost;
    }

    /// <summary>A world impact to visualize (bullet hole, spark, dust).</summary>
    public struct ImpactPoint
    {
        public Vector3 Point;
        public Vector3 Normal;
        public SurfaceType Surface;
        public float Distance;
    }
}
