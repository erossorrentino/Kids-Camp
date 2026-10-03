using MobileFPS.Core;
using UnityEngine;

namespace MobileFPS.Combat
{
    public enum HitboxShape : byte
    {
        Capsule,
        Sphere,
    }

    /// <summary>
    /// Analytic hit volume attached to a bone. Not a Collider (see
    /// <see cref="HitShapes"/> for why). Put these on the animated skeleton; the
    /// owning <see cref="HitboxRig"/> collects them.
    ///
    /// If you use Animator "Optimize Game Objects" (recommended on mobile: it
    /// removes the bone Transform hierarchy), expose only the bones that carry
    /// hitboxes via "Extra Transforms to Expose".
    /// </summary>
    public sealed class Hitbox : MonoBehaviour
    {
        [SerializeField] private HitZone zone = HitZone.UpperTorso;
        [SerializeField] private HitboxShape shape = HitboxShape.Capsule;
        [SerializeField] private Vector3 center;
        [Tooltip("Local axis of the capsule.")]
        [SerializeField] private Vector3 axis = Vector3.up;
        [Tooltip("Total length including the rounded ends (meters, before scale).")]
        [SerializeField] private float height = 0.5f;
        [SerializeField] private float radius = 0.12f;

        public HitZone Zone => zone;

        public void Configure(HitZone newZone, HitboxShape newShape, Vector3 newCenter, Vector3 newAxis, float newHeight, float newRadius)
        {
            zone = newZone;
            shape = newShape;
            center = newCenter;
            axis = newAxis;
            height = newHeight;
            radius = newRadius;
        }

        public CapsuleShape GetWorldShape()
        {
            Transform t = transform;
            Vector3 worldCenter = t.TransformPoint(center);
            Vector3 lossy = t.lossyScale;
            float scale = Mathf.Max(Mathf.Abs(lossy.x), Mathf.Max(Mathf.Abs(lossy.y), Mathf.Abs(lossy.z)));
            float worldRadius = radius * scale;

            if (shape == HitboxShape.Sphere) return new CapsuleShape(worldCenter, worldCenter, worldRadius, zone);

            Vector3 worldAxis = t.TransformDirection(axis.sqrMagnitude > 1e-6f ? axis.normalized : Vector3.up);
            float halfSegment = Mathf.Max(0f, height * 0.5f * scale - worldRadius);
            return new CapsuleShape(worldCenter - worldAxis * halfSegment, worldCenter + worldAxis * halfSegment, worldRadius, zone);
        }

#if UNITY_EDITOR
        private void OnDrawGizmosSelected()
        {
            CapsuleShape s = GetWorldShape();
            Gizmos.color = zone == HitZone.Head ? Color.red : zone == HitZone.UpperTorso ? new Color(1f, 0.5f, 0f) : Color.yellow;
            Gizmos.DrawWireSphere(s.A, s.Radius);
            Gizmos.DrawWireSphere(s.B, s.Radius);
            Gizmos.DrawLine(s.A, s.B);
        }
#endif
    }
}
