using MobileFPS.Core;
using UnityEngine;

namespace MobileFPS.Combat
{
    /// <summary>
    /// A world-space hit capsule (a sphere when A == B). Plain data, so it can be
    /// copied into lag-compensation history buffers and tested on any thread.
    /// </summary>
    public struct CapsuleShape
    {
        public Vector3 A;
        public Vector3 B;
        public float Radius;
        public HitZone Zone;

        public CapsuleShape(Vector3 a, Vector3 b, float radius, HitZone zone)
        {
            A = a;
            B = b;
            Radius = radius;
            Zone = zone;
        }

        public static CapsuleShape Lerp(in CapsuleShape from, in CapsuleShape to, float t)
        {
            return new CapsuleShape(
                Vector3.LerpUnclamped(from.A, to.A, t),
                Vector3.LerpUnclamped(from.B, to.B, t),
                from.Radius + (to.Radius - from.Radius) * t,
                from.Zone);
        }
    }

    /// <summary>Result of a ray vs hitbox query.</summary>
    public struct HitboxHit
    {
        public EntityId Entity;
        public HitZone Zone;
        public float Distance;
        public Vector3 Point;
    }

    /// <summary>
    /// Analytic ray tests for hit registration.
    ///
    /// Hitboxes are math, not PhysX colliders. That buys four things on mobile:
    /// 1. No per-bone colliders in the physics broadphase. A 10-player match drops
    ///    ~100 animated colliders, plus the SyncTransforms cost of moving them
    ///    every frame.
    /// 2. Rewinding for lag compensation is a buffer copy plus a lerp, instead of
    ///    teleporting colliders, re-syncing physics and restoring them.
    /// 3. The client's predicted hit and the server's authoritative check run
    ///    literally the same function, so prediction mismatches come only from
    ///    latency, never from different code.
    /// 4. Deterministic and thread-safe: it can move to the Job System later.
    /// </summary>
    public static class HitShapes
    {
        /// <summary>
        /// Ray vs capsule. <paramref name="direction"/> must be normalized.
        /// Returns the entry distance (0 if the origin starts inside).
        /// Based on the closed-form capsule intersection popularized by Inigo Quilez.
        /// </summary>
        public static bool RayCapsule(Vector3 origin, Vector3 direction, Vector3 a, Vector3 b, float radius,
            float maxDistance, out float distance)
        {
            distance = 0f;
            if (SqrDistancePointSegment(origin, a, b) <= radius * radius) return maxDistance >= 0f; // inside

            Vector3 ba = b - a;
            float baba = Vector3.Dot(ba, ba);
            if (baba < 1e-10f) return RaySphere(origin, direction, a, radius, maxDistance, out distance);

            Vector3 oa = origin - a;
            float bard = Vector3.Dot(ba, direction);
            float baoa = Vector3.Dot(ba, oa);
            float rdoa = Vector3.Dot(direction, oa);
            float oaoa = Vector3.Dot(oa, oa);

            float qa = baba - bard * bard;
            float qb = baba * rdoa - baoa * bard;
            float qc = baba * oaoa - baoa * baoa - radius * radius * baba;

            if (qa > 1e-10f)
            {
                float h = qb * qb - qa * qc;
                if (h < 0f) return false; // misses the infinite cylinder, so misses the capsule

                float t = (-qb - Mathf.Sqrt(h)) / qa;
                float y = baoa + t * bard;
                if (y > 0f && y < baba)
                {
                    if (t < 0f || t > maxDistance) return false;
                    distance = t;
                    return true;
                }

                // Outside the body span: the nearest cap decides.
                Vector3 capCenter = y <= 0f ? a : b;
                return RaySphere(origin, direction, capCenter, radius, maxDistance, out distance);
            }

            // Ray parallel to the axis: it can only enter through a cap.
            bool hitA = RaySphere(origin, direction, a, radius, maxDistance, out float tA);
            bool hitB = RaySphere(origin, direction, b, radius, maxDistance, out float tB);
            if (!hitA && !hitB) return false;
            distance = hitA && hitB ? Mathf.Min(tA, tB) : hitA ? tA : tB;
            return true;
        }

        /// <summary>Ray vs sphere. Returns the entry distance (0 when starting inside).</summary>
        public static bool RaySphere(Vector3 origin, Vector3 direction, Vector3 center, float radius,
            float maxDistance, out float distance)
        {
            distance = 0f;
            Vector3 oc = origin - center;
            float c = Vector3.Dot(oc, oc) - radius * radius;
            if (c <= 0f) return maxDistance >= 0f; // inside

            float b = Vector3.Dot(oc, direction);
            if (b > 0f) return false; // pointing away
            float h = b * b - c;
            if (h < 0f) return false;

            float t = -b - Mathf.Sqrt(h);
            if (t < 0f || t > maxDistance) return false;
            distance = t;
            return true;
        }

        public static float SqrDistancePointSegment(Vector3 point, Vector3 a, Vector3 b)
        {
            Vector3 ab = b - a;
            float denominator = Vector3.Dot(ab, ab);
            float t = denominator > 1e-12f ? Mathf.Clamp01(Vector3.Dot(point - a, ab) / denominator) : 0f;
            Vector3 closest = a + ab * t;
            return (point - closest).sqrMagnitude;
        }

        /// <summary>Distance from a point to a capsule's surface (negative inside). Used for splash damage.</summary>
        public static float DistanceToCapsule(Vector3 point, in CapsuleShape shape)
        {
            return Mathf.Sqrt(SqrDistancePointSegment(point, shape.A, shape.B)) - shape.Radius;
        }

        /// <summary>Nearest hit among a rig's shapes, with a cheap bounding-sphere early-out first.</summary>
        public static bool RayShapes(Vector3 origin, Vector3 direction, float maxDistance,
            CapsuleShape[] shapes, int start, int count, Vector3 boundsCenter, float boundsRadius,
            out float distance, out HitZone zone)
        {
            distance = float.MaxValue;
            zone = HitZone.UpperTorso;
            if (!RaySphere(origin, direction, boundsCenter, boundsRadius, maxDistance, out _)) return false;

            bool found = false;
            int end = start + count;
            for (int i = start; i < end; i++)
            {
                ref CapsuleShape s = ref shapes[i];
                if (!RayCapsule(origin, direction, s.A, s.B, s.Radius, maxDistance, out float d)) continue;
                // Ties (overlapping boxes at the same depth) resolve toward the more
                // valuable zone: head beats neck/torso. Players expect that.
                if (d < distance - 0.0005f || (Mathf.Abs(d - distance) <= 0.0005f && s.Zone < zone))
                {
                    distance = d;
                    zone = s.Zone;
                    found = true;
                }
            }
            return found;
        }

        /// <summary>Bounding sphere enclosing all shapes (for broadphase).</summary>
        public static void ComputeBounds(CapsuleShape[] shapes, int start, int count, out Vector3 center, out float radius)
        {
            if (count <= 0)
            {
                center = Vector3.zero;
                radius = 0f;
                return;
            }

            Vector3 sum = Vector3.zero;
            int end = start + count;
            for (int i = start; i < end; i++) sum += shapes[i].A + shapes[i].B;
            center = sum / (count * 2);

            radius = 0f;
            for (int i = start; i < end; i++)
            {
                float ra = Vector3.Distance(center, shapes[i].A) + shapes[i].Radius;
                float rb = Vector3.Distance(center, shapes[i].B) + shapes[i].Radius;
                if (ra > radius) radius = ra;
                if (rb > radius) radius = rb;
            }
        }
    }
}
