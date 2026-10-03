using MobileFPS.Core;
using UnityEngine;

namespace MobileFPS.Weapons
{
    /// <summary>
    /// Deterministic bullet spread. Given (direction, spread, seed, pellet), the
    /// client and server compute the same pellet direction. The server can
    /// re-simulate shotgun blasts from a 4-byte seed instead of trusting 8
    /// client-supplied directions, and the packet stays tiny.
    /// </summary>
    public static class SpreadPattern
    {
        /// <summary>
        /// Returns <paramref name="forward"/> deflected uniformly within a cone of
        /// half-angle <paramref name="spreadDegrees"/>. The basis comes from
        /// <paramref name="forward"/> alone (no camera roll), so the server needs only
        /// the aim direction to reproduce it.
        /// </summary>
        public static Vector3 Apply(Vector3 forward, float spreadDegrees, uint seed, int pelletIndex)
        {
            if (spreadDegrees <= 0.0001f) return forward;

            var random = new DeterministicRandom(DeterministicRandom.HashSeed(seed, (uint)pelletIndex + 1u));
            // sqrt for uniform density over the disk (otherwise shots clump at the center).
            float radius = Mathf.Sqrt(random.NextFloat01());
            float angle = random.NextFloat01() * Mathf.PI * 2f;

            BuildBasis(forward, out Vector3 right, out Vector3 up);
            float offset = Mathf.Tan(Mathf.Min(spreadDegrees, 89f) * Mathf.Deg2Rad) * radius;
            Vector3 direction = forward + (right * Mathf.Cos(angle) + up * Mathf.Sin(angle)) * offset;
            return direction.normalized;
        }

        /// <summary>
        /// Branchless orthonormal basis from a unit vector (Duff et al. 2017,
        /// "Building an Orthonormal Basis, Revisited"). Stable for all directions,
        /// including straight up and down.
        /// </summary>
        public static void BuildBasis(Vector3 n, out Vector3 b1, out Vector3 b2)
        {
            float sign = n.z >= 0f ? 1f : -1f;
            float a = -1f / (sign + n.z);
            float b = n.x * n.y * a;
            b1 = new Vector3(1f + sign * n.x * n.x * a, sign * b, -sign * n.x);
            b2 = new Vector3(b, sign + n.y * n.y * a, -n.y);
        }
    }
}
