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
}
